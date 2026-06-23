import { describe, expect, test } from "bun:test";
import {
  flagBool,
  flagNumber,
  flagString,
  parseArgs,
} from "../src/parse-args.ts";

describe("parseArgs", () => {
  test("parses positional and boolean flags", () => {
    const { positional, flags } = parseArgs([
      "mission",
      "watch",
      "m-1",
      "--interval",
      "3",
      "--verbose",
    ]);
    expect(positional).toEqual(["mission", "watch", "m-1"]);
    expect(flagNumber(flags, "interval", 5)).toBe(3);
    expect(flagBool(flags, "verbose")).toBe(true);
  });

  test("parses --key=value form", () => {
    const { flags } = parseArgs(["--engine-url=http://127.0.0.1:3999"]);
    expect(flagString(flags, "engine-url")).toBe("http://127.0.0.1:3999");
  });
});
