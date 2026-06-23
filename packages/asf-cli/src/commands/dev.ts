import { signInternalJwt } from "@olagent/workflow-engine";
import type { CliConfig } from "../config.ts";
import { requireJwtSecret } from "../config.ts";
import { flagNumber } from "../parse-args.ts";
import type { ParsedArgs } from "../parse-args.ts";

export async function runDevToken(
  _config: CliConfig,
  args: ParsedArgs,
): Promise<number> {
  const ttl = flagNumber(args.flags, "ttl", 300);
  const token = await signInternalJwt(requireJwtSecret(), "workflow-engine", ttl);
  console.log(token);
  return 0;
}
