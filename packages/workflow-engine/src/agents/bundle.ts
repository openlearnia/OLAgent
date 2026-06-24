import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { Mission, Task, TaskExecution } from "../types.ts";
import { getAgentContract } from "./contracts.ts";

export const AgentContextSchema = z.object({
  mission: z.object({
    id: z.string(),
    goal: z.string(),
    constraints: z.record(z.unknown()),
  }),
  task: z.object({
    id: z.string(),
    type: z.string(),
    title: z.string(),
    description: z.string().optional(),
    acceptanceCriteria: z.array(z.string()),
    dependencies: z.array(z.string()),
    attempt: z.number().int().positive(),
    parentTaskId: z.string().optional(),
  }),
  artifacts: z.array(
    z.object({
      path: z.string(),
      summary: z.string().optional(),
    }),
  ),
  memory: z.array(
    z.object({
      kind: z.string(),
      content: z.string(),
      relevance: z.number(),
    }),
  ),
  priorFailures: z.array(z.record(z.unknown())),
  workspace: z.string(),
});

export const ContextBundleSchema = z.object({
  version: z.literal("1.0"),
  taskExecutionId: z.string(),
  sessionId: z.string().optional(),
  agentId: z.string(),
  agentType: z.string(),
  contractVersion: z.string(),
  engineUrl: z.string().url(),
  mcpEndpoint: z.string().url().optional(),
  executionToken: z.string(),
  timeoutMs: z.number().int().positive(),
  resultPath: z.string(),
  context: AgentContextSchema,
});

export type AgentContext = z.infer<typeof AgentContextSchema>;
export type ContextBundle = z.infer<typeof ContextBundleSchema>;

export interface BuildContextBundleInput {
  mission: Mission;
  task: Task;
  execution: TaskExecution;
  engineUrl: string;
  executionToken: string;
  contractVersion?: string;
  mcpEndpoint?: string;
}

export async function loadMissionContractVersions(
  workspacePath: string,
): Promise<Record<string, string>> {
  const missionYamlPath = path.join(workspacePath, "mission.yaml");
  try {
    const text = await readFile(missionYamlPath, "utf8");
    const doc = Bun.YAML.parse(text) as {
      contractVersions?: Record<string, string>;
    };
    return doc.contractVersions ?? {};
  } catch {
    return {};
  }
}

export function buildContextBundle(
  input: BuildContextBundleInput,
): ContextBundle {
  const contractVersions = input.contractVersion
    ? { [input.task.assignedAgentType]: input.contractVersion }
    : {};
  const pinned =
    input.contractVersion ??
    contractVersions[input.task.assignedAgentType] ??
    getAgentContract(input.task.assignedAgentType).version;

  const contract = getAgentContract(input.task.assignedAgentType, pinned);
  const bundleDir = path.join(input.mission.workspacePath, ".asf", "bundles");
  const bundlePath = path.join(bundleDir, `${input.execution.id}.json`);
  const resultPath = path.join(bundleDir, `${input.execution.id}.result.json`);

  const mcpEndpoint =
    input.mcpEndpoint ??
    process.env.ASF_MCP_ENDPOINT ??
    `http://127.0.0.1:${process.env.ASF_MCP_PORT ?? "3101"}/mcp`;

  return ContextBundleSchema.parse({
    version: "1.0",
    taskExecutionId: input.execution.id,
    sessionId: input.execution.id,
    agentId: input.execution.agentId ?? "",
    agentType: input.task.assignedAgentType,
    contractVersion: pinned,
    engineUrl: input.engineUrl,
    mcpEndpoint,
    executionToken: input.executionToken,
    timeoutMs: contract.timeoutMs,
    resultPath,
    context: {
      mission: {
        id: input.mission.id,
        goal: input.mission.goal,
        constraints: input.mission.constraints,
      },
      task: {
        id: input.task.id,
        type: input.task.type,
        title: input.task.title,
        description: input.task.description,
        acceptanceCriteria: input.task.acceptanceCriteria,
        dependencies: input.task.dependencies,
        attempt: input.execution.attempt,
        parentTaskId: input.task.parentTaskId,
      },
      artifacts: [],
      memory: [],
      priorFailures: [],
      workspace: input.mission.workspacePath,
    },
  });
}

export async function writeContextBundle(
  bundle: ContextBundle,
  bundlePath?: string,
): Promise<string> {
  const target =
    bundlePath ??
    path.join(
      bundle.context.workspace,
      ".asf",
      "bundles",
      `${bundle.taskExecutionId}.json`,
    );
  await mkdir(path.dirname(target), { recursive: true });
  await Bun.write(target, JSON.stringify(bundle, null, 2));
  return target;
}

export function validateContextBundle(raw: unknown): ContextBundle {
  return ContextBundleSchema.parse(raw);
}
