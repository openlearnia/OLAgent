import { signInternalJwt } from "../server/auth.ts";

export interface ExecutionTokenClaims {
  taskExecutionId: string;
  agentId: string;
}

/**
 * Mint a short-lived execution-scoped JWT for agent heartbeat/completeTask (M3+).
 * TTL is capped at timeoutMs from the agent contract.
 */
export async function mintExecutionToken(
  secret: string,
  claims: ExecutionTokenClaims,
  timeoutMs: number,
): Promise<string> {
  const ttlSeconds = Math.min(Math.ceil(timeoutMs / 1000), 86_400);
  const base = await signInternalJwt(secret, "agent-runtime", ttlSeconds);
  const parts = base.split(".");
  if (parts.length !== 3) {
    throw new Error("Failed to mint execution token");
  }

  const payloadB64 = parts[1]!;
  const payload = JSON.parse(
    Buffer.from(payloadB64, "base64url").toString("utf8"),
  ) as Record<string, unknown>;

  const extended = {
    ...payload,
    taskExecutionId: claims.taskExecutionId,
    agentId: claims.agentId,
  };

  const header = parts[0]!;
  const newPayload = Buffer.from(JSON.stringify(extended)).toString("base64url");
  const signingInput = `${header}.${newPayload}`;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(signingInput),
  );
  const signatureB64 = Buffer.from(new Uint8Array(signature)).toString(
    "base64url",
  );
  return `${signingInput}.${signatureB64}`;
}
