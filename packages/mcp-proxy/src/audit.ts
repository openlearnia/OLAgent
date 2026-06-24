import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";

export interface AuditEntry {
  sessionId: string;
  agentType: string;
  tool: string;
  params: Record<string, unknown>;
  result?: unknown;
  error?: { code: string; message: string };
  durationMs: number;
  timestamp: string;
}

const SECRET_KEYS = /password|secret|token|api[_-]?key|authorization/i;

function redactValue(key: string, value: unknown): unknown {
  if (SECRET_KEYS.test(key)) return "[REDACTED]";
  if (typeof value === "string" && value.startsWith("vault://")) return "[VAULT_REF]";
  if (Array.isArray(value)) return value.map((v, i) => redactValue(String(i), v));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = redactValue(k, v);
    }
    return out;
  }
  return value;
}

export function redactParams(params: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(params)) {
    out[k] = redactValue(k, v);
  }
  return out;
}

export async function appendAuditLog(
  workspace: string,
  entry: AuditEntry,
): Promise<void> {
  const auditDir = path.join(workspace, ".asf", "audit");
  await mkdir(auditDir, { recursive: true });
  const logPath = path.join(auditDir, `${entry.sessionId}.jsonl`);
  const line = JSON.stringify({
    ...entry,
    params: redactParams(entry.params),
  });
  await appendFile(logPath, `${line}\n`, "utf8");
}
