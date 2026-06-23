const ALLOWED_SUBJECTS = new Set([
  "agent-runtime",
  "workflow-engine",
  "system",
]);
const EXPECTED_AUDIENCE = "asf-internal";
const DEFAULT_TTL_SECONDS = 300;

export interface InternalJwtClaims {
  sub: string;
  aud: string;
  exp: number;
  iat?: number;
}

function base64UrlEncode(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64url");
}

function base64UrlDecode(value: string): Uint8Array {
  return new Uint8Array(Buffer.from(value, "base64url"));
}

async function importHmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

async function signHmac(
  data: string,
  secret: string,
): Promise<Uint8Array> {
  const key = await importHmacKey(secret);
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(data),
  );
  return new Uint8Array(signature);
}

export async function signInternalJwt(
  secret: string,
  subject: "agent-runtime" | "workflow-engine" | "system" = "workflow-engine",
  ttlSeconds = DEFAULT_TTL_SECONDS,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = base64UrlEncode(
    new TextEncoder().encode(JSON.stringify({ alg: "HS256", typ: "JWT" })),
  );
  const payload = base64UrlEncode(
    new TextEncoder().encode(
      JSON.stringify({
        sub: subject,
        aud: EXPECTED_AUDIENCE,
        iat: now,
        exp: now + ttlSeconds,
      }),
    ),
  );
  const signingInput = `${header}.${payload}`;
  const signature = base64UrlEncode(await signHmac(signingInput, secret));
  return `${signingInput}.${signature}`;
}

export async function verifyInternalJwt(
  token: string,
  secret: string,
): Promise<InternalJwtClaims | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const [headerB64, payloadB64, signatureB64] = parts;
  if (!headerB64 || !payloadB64 || !signatureB64) return null;

  const signingInput = `${headerB64}.${payloadB64}`;
  const expected = await signHmac(signingInput, secret);
  const actual = base64UrlDecode(signatureB64);
  if (expected.length !== actual.length) return null;

  let mismatch = 0;
  for (let i = 0; i < expected.length; i++) {
    mismatch |= expected[i]! ^ actual[i]!;
  }
  if (mismatch !== 0) return null;

  let payload: InternalJwtClaims;
  try {
    payload = JSON.parse(
      new TextDecoder().decode(base64UrlDecode(payloadB64)),
    ) as InternalJwtClaims;
  } catch {
    return null;
  }

  if (payload.aud !== EXPECTED_AUDIENCE) return null;
  if (!ALLOWED_SUBJECTS.has(payload.sub)) return null;
  if (typeof payload.exp !== "number" || payload.exp < Math.floor(Date.now() / 1000)) {
    return null;
  }

  return payload;
}

export function extractBearerToken(
  authorization: string | null,
): string | null {
  if (!authorization) return null;
  const match = /^Bearer\s+(.+)$/i.test(authorization)
    ? authorization.slice(authorization.indexOf(" ") + 1).trim()
    : null;
  return match || null;
}

export function resolveJwtSecret(
  override?: string,
): string {
  const secret = override ?? process.env.ASF_INTERNAL_JWT_SECRET;
  if (!secret) {
    throw new Error("ASF_INTERNAL_JWT_SECRET is required");
  }
  return secret;
}
