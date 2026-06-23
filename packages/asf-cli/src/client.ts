import { signInternalJwt } from "@olagent/workflow-engine";
import type { CliConfig } from "./config.ts";
import { logDebug, requireJwtSecret } from "./config.ts";

export class EngineError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "EngineError";
  }
}

export interface MissionProjection {
  mission: {
    id: string;
    goal: string;
    status: string;
    workspacePath: string;
    createdAt: string;
    completedAt?: string;
  };
  tasks: Array<{
    id: string;
    type: string;
    title: string;
    kind: string;
    assignedAgentType: string;
    status: string;
    taskExecutionId?: string;
  }>;
}

export class EngineClient {
  constructor(private readonly config: CliConfig) {}

  private async request(
    method: string,
    path: string,
    options?: {
      body?: string | Record<string, unknown>;
      auth?: boolean;
      contentType?: string;
    },
  ): Promise<Response> {
    const url = `${this.config.engineUrl}${path}`;
    const headers: Record<string, string> = {};

    if (options?.auth) {
      const token = await signInternalJwt(requireJwtSecret(), "workflow-engine");
      headers.authorization = `Bearer ${token}`;
    }

    let body: string | undefined;
    if (options?.body !== undefined) {
      if (typeof options.body === "string") {
        body = options.body;
        headers["content-type"] = options.contentType ?? "application/json";
      } else {
        body = JSON.stringify(options.body);
        headers["content-type"] = "application/json";
      }
    }

    logDebug(this.config, `${method} ${url}`);
    const response = await fetch(url, { method, headers, body });
    return response;
  }

  async createMissionFromFile(
    filePath: string,
    options?: { idempotencyKey?: string; workspace?: string },
  ): Promise<MissionProjection> {
    const file = Bun.file(filePath);
    if (!(await file.exists())) {
      throw new Error(`Mission file not found: ${filePath}`);
    }

    const text = await file.text();
    const ext = filePath.toLowerCase();
    const contentType = ext.endsWith(".yaml") || ext.endsWith(".yml")
      ? "application/yaml"
      : "application/json";

    let body = text;
    if (options?.idempotencyKey) {
      const parsed =
        contentType.includes("yaml") || text.trimStart().startsWith("id:")
          ? (Bun.YAML.parse(text) as Record<string, unknown>)
          : (JSON.parse(text) as Record<string, unknown>);
      parsed.idempotencyKey = options.idempotencyKey;
      body =
        contentType.includes("yaml") || text.trimStart().startsWith("id:")
          ? Bun.YAML.stringify(parsed)
          : JSON.stringify(parsed);
    }

    const res = await this.request("POST", "/v1/missions", {
      body,
      contentType,
    });

    if (!res.ok) {
      throw await engineErrorFromResponse(res);
    }
    return (await res.json()) as MissionProjection;
  }

  async createMissionFromGoal(
    goal: string,
    options?: {
      id?: string;
      idempotencyKey?: string;
      constraints?: Record<string, unknown>;
    },
  ): Promise<MissionProjection> {
    const res = await this.request("POST", "/v1/missions", {
      body: {
        goal,
        ...(options?.id ? { id: options.id } : {}),
        ...(options?.idempotencyKey
          ? { idempotencyKey: options.idempotencyKey }
          : {}),
        ...(options?.constraints ? { constraints: options.constraints } : {}),
      },
    });

    if (!res.ok) {
      throw await engineErrorFromResponse(res);
    }
    return (await res.json()) as MissionProjection;
  }

  async startMission(missionId: string): Promise<unknown> {
    const res = await this.request(
      "POST",
      `/internal/v1/missions/${missionId}/start`,
      { auth: true },
    );
    if (!res.ok) {
      throw await engineErrorFromResponse(res);
    }
    return res.json();
  }

  async getMission(missionId: string): Promise<MissionProjection> {
    const res = await this.request("GET", `/v1/missions/${missionId}`);
    if (!res.ok) {
      throw await engineErrorFromResponse(res);
    }
    return (await res.json()) as MissionProjection;
  }

  async getEvents(
    missionId: string,
    limit = 50,
  ): Promise<{ events: Array<{ type: string; createdAt: string }> }> {
    const res = await this.request(
      "GET",
      `/v1/missions/${missionId}/events?limit=${limit}`,
    );
    if (!res.ok) {
      throw await engineErrorFromResponse(res);
    }
    return (await res.json()) as {
      events: Array<{ type: string; createdAt: string }>;
    };
  }
}

async function engineErrorFromResponse(res: Response): Promise<EngineError> {
  let message = `Engine request failed (${res.status})`;
  let code: string | undefined;
  try {
    const body = (await res.json()) as { error?: { message?: string; code?: string } };
    if (body.error?.message) message = body.error.message;
    code = body.error?.code;
  } catch {
    // ignore parse errors
  }
  return new EngineError(message, res.status, code);
}

export function isTerminalMissionStatus(status: string): boolean {
  return status === "SUCCESS" || status === "FAILED" || status === "BLOCKED";
}

export function missionWatchExitCode(status: string): number {
  if (status === "SUCCESS") return 0;
  if (status === "FAILED" || status === "BLOCKED") return 1;
  return 2;
}
