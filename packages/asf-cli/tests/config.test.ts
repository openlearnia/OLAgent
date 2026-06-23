import { describe, expect, test } from "bun:test";
import {
  loadConfig,
  resolveAsfHome,
  resolveEngineUrl,
  resolveWorkspacesRoot,
} from "../src/config.ts";

describe("config", () => {
  test("resolveEngineUrl defaults to localhost:3100", () => {
    const prev = process.env.ASF_ENGINE_URL;
    delete process.env.ASF_ENGINE_URL;
    expect(resolveEngineUrl()).toBe("http://127.0.0.1:3100");
    if (prev) process.env.ASF_ENGINE_URL = prev;
  });

  test("loadConfig uses ASF_HOME for workspaces", () => {
    const config = loadConfig({ home: "/tmp/asf-test-home" });
    expect(config.home).toBe("/tmp/asf-test-home");
    expect(config.workspacesRoot).toBe("/tmp/asf-test-home/workspaces");
    expect(resolveWorkspacesRoot("/tmp/asf-test-home")).toBe(
      "/tmp/asf-test-home/workspaces",
    );
    expect(resolveAsfHome("/tmp/asf-test-home")).toBe("/tmp/asf-test-home");
  });
});
