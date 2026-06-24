import type { ContextBundle } from "@olagent/workflow-engine";

export interface PromptBlock {
  type: "text";
  text: string;
}

export function buildSessionPrompt(bundle: ContextBundle): PromptBlock[] {
  const { context, agentType, taskExecutionId } = bundle;
  const { mission, task, artifacts, priorFailures } = context;

  const lines: string[] = [
    `Task: ${task.id} (${agentType})`,
    `Execution: ${taskExecutionId}`,
    `Mission: ${mission.goal}`,
    "",
    task.title,
  ];

  if (task.description) {
    lines.push("", task.description);
  }

  if (task.acceptanceCriteria.length) {
    lines.push("", "Acceptance criteria:");
    for (const criterion of task.acceptanceCriteria) {
      lines.push(`- ${criterion}`);
    }
  }

  if (artifacts.length) {
    lines.push("", "Artifacts:");
    for (const artifact of artifacts) {
      lines.push(`- ${artifact.path}${artifact.summary ? `: ${artifact.summary}` : ""}`);
    }
  }

  if (priorFailures.length) {
    lines.push("", "Prior failures:");
    for (const failure of priorFailures) {
      lines.push(`- ${JSON.stringify(failure)}`);
    }
  }

  lines.push(
    "",
    `Workspace: ${context.workspace}`,
    "Use relative paths within the workspace. Post results via agent contract artifacts.",
  );

  return [{ type: "text", text: lines.join("\n") }];
}
