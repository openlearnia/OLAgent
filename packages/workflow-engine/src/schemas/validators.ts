import { z } from "zod";

export const AgentResultSchema = z.object({
  status: z.enum(["COMPLETED", "FAILED"]),
  artifacts: z.array(z.string()),
  commits: z.array(z.string()),
  summary: z.string(),
  needsHealing: z.boolean().optional(),
  error: z
    .object({
      code: z.string(),
      message: z.string(),
      recoverable: z.boolean(),
      classification: z.string().optional(),
    })
    .optional(),
});

export const PlannedTaskSchema = z.object({
  id: z.string().regex(/^t-[a-z0-9-]+$/),
  epicId: z.string().nullable().optional(),
  type: z.enum([
    "setup-repo",
    "schema-migration",
    "implement-backend",
    "implement-frontend",
    "implement-infra",
    "write-tests",
    "browser-test",
    "deploy",
    "verify-deployment",
  ]),
  title: z.string(),
  description: z.string().optional(),
  assignedAgentType: z.string(),
  dependencies: z.array(z.string()),
  acceptanceCriteria: z.array(z.string()).min(1),
  parallelSafe: z.boolean().optional(),
  maxRetries: z.number().int().min(0).optional(),
});

export const TasksPlanSchema = z.object({
  missionId: z.string(),
  version: z.string().optional(),
  epics: z
    .array(
      z.object({
        id: z.string(),
        title: z.string(),
      }),
    )
    .optional(),
  tasks: z.array(PlannedTaskSchema).min(1),
});

export const VerificationReportSchema = z.object({
  missionId: z.string().optional(),
  deployTaskId: z.string().optional(),
  status: z.enum(["verified", "failed"]),
  checks: z
    .array(
      z.object({
        name: z.enum([
          "reachability",
          "api_health",
          "api_smoke",
          "ui_accessible",
          "auth_working",
        ]),
        passed: z.boolean(),
        duration_ms: z.number().int().optional(),
        message: z.string().optional(),
      }),
    )
    .min(5),
  screenshots: z.array(z.string()).optional(),
  verifiedAt: z.string(),
});

export const FailureReportSchema = z.object({
  id: z.string().regex(/^fail-[0-9a-f-]{36}$/),
  taskId: z.string(),
  taskExecutionId: z.string(),
  missionId: z.string(),
  domain: z.enum(["build", "test", "deploy", "runtime", "verification"]),
  classification: z.string(),
  message: z.string(),
  recoverable: z.boolean(),
  reportPath: z.string().optional(),
  stackTrace: z.string().optional(),
  timestamp: z.string(),
});

export type TasksPlan = z.infer<typeof TasksPlanSchema>;
export type VerificationReport = z.infer<typeof VerificationReportSchema>;

export function validateAgentResult(result: unknown) {
  return AgentResultSchema.parse(result);
}

export function validateTasksPlan(plan: unknown) {
  return TasksPlanSchema.parse(plan);
}

export function validateVerificationReport(report: unknown) {
  return VerificationReportSchema.parse(report);
}

