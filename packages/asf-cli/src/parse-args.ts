export interface ParsedArgs {
  positional: string[];
  flags: Map<string, string | boolean>;
}

export function parseArgs(argv: string[]): ParsedArgs {
  const positional: string[] = [];
  const flags = new Map<string, string | boolean>();

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--") {
      positional.push(...argv.slice(i + 1));
      break;
    }
    if (arg === "-v" || arg === "--verbose") {
      flags.set("verbose", true);
      continue;
    }
    if (arg === "--json") {
      flags.set("json", true);
      continue;
    }
    if (arg.startsWith("--")) {
      const eq = arg.indexOf("=");
      if (eq !== -1) {
        flags.set(arg.slice(2, eq), arg.slice(eq + 1));
        continue;
      }
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("-")) {
        flags.set(key, next);
        i++;
      } else {
        flags.set(key, true);
      }
      continue;
    }
    positional.push(arg);
  }

  return { positional, flags };
}

export function flagString(
  flags: Map<string, string | boolean>,
  name: string,
): string | undefined {
  const value = flags.get(name);
  return typeof value === "string" ? value : undefined;
}

export function flagBool(
  flags: Map<string, string | boolean>,
  name: string,
): boolean {
  return flags.get(name) === true;
}

export function flagNumber(
  flags: Map<string, string | boolean>,
  name: string,
  fallback: number,
): number {
  const raw = flagString(flags, name);
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function usage(): string {
  return `ASF — Autonomous Software Factory CLI

Usage:
  asf server start [--host <host>] [--port <port>] [--db-path <path>]
  asf mission create --file <path> [--idempotency-key <key>]
  asf mission create --goal <text> [--constraint key=value ...]
  asf mission start <missionId>
  asf mission status <missionId> [--json]
  asf mission watch <missionId> [--interval <seconds>] [--events]
  asf mission events <missionId> [--limit <n>]
  asf dev token [--ttl <seconds>]

Global flags:
  --engine-url <url>   ASF_ENGINE_URL (default http://127.0.0.1:3100)
  --home <path>        ASF_HOME (default ~/.asf)
  --verbose, -v        Debug logs to stderr
  --json               Machine-readable output
`;
}
