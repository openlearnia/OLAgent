import type { AgentContext } from "@olagent/workflow-engine";
import type { LlmConfig } from "../llm-config.ts";
import { targetArtifactForTask } from "../result.ts";
import type { FetchFn } from "../heartbeat.ts";

/** @deprecated CI/fallback only — v1 production uses Cursor ACP (ADR-003, M5b). */
export interface CodeGeneration {
  filePath: string;
  content: string;
  summary: string;
  tokenUsage: { input: number; output: number };
}

export interface LlmGenerateOptions {
  context: AgentContext;
  config: LlmConfig;
  fetchFn?: FetchFn;
}

export async function generateBackendCode(
  options: LlmGenerateOptions,
): Promise<CodeGeneration> {
  if (options.config.mock) {
    return mockGenerate(options.context);
  }

  if (options.config.provider === "openai") {
    return generateViaOpenAi(options);
  }
  return generateViaAnthropic(options);
}

function mockGenerate(context: AgentContext): CodeGeneration {
  const filePath = targetArtifactForTask(context.task.type, context.task.id);
  const title = context.task.title;

  let content: string;
  if (context.task.type === "schema-migration") {
    content = `-- ASF mock migration for ${context.task.id}\nCREATE TABLE IF NOT EXISTS contacts (\n  id TEXT PRIMARY KEY,\n  name TEXT NOT NULL,\n  email TEXT\n);\n`;
  } else if (context.task.type === "implement-backend") {
    content = `// ASF mock backend for ${context.task.id}\n// ${title}\n\nexport function listContacts() {\n  return [];\n}\n\nexport function createContact(contact: { name: string; email?: string }) {\n  return { id: "mock-1", ...contact };\n}\n`;
  } else {
    content = `// ASF mock artifact for ${context.task.type}\nexport const taskId = "${context.task.id}";\n`;
  }

  return {
    filePath,
    content,
    summary: `Mock LLM wrote ${filePath} for ${context.task.type}`,
    tokenUsage: { input: 0, output: 0 },
  };
}

function buildPrompt(context: AgentContext, filePath: string): string {
  const criteria = context.task.acceptanceCriteria.join("; ");
  return [
    "You are a backend engineer implementing a CRM task.",
    `Task: ${context.task.title} (${context.task.id}, type=${context.task.type})`,
    context.task.description ? `Description: ${context.task.description}` : "",
    `Acceptance criteria: ${criteria}`,
    `Write a single source file at relative path: ${filePath}`,
    "Respond with ONLY valid JSON (no markdown fences):",
    '{"filePath":"<relative path>","content":"<file contents>","summary":"<one line>"}',
  ]
    .filter(Boolean)
    .join("\n");
}

function parseCodeJson(text: string, fallbackPath: string): Omit<CodeGeneration, "tokenUsage"> {
  const trimmed = text.trim();
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("LLM response did not contain JSON object");
  }
  const parsed = JSON.parse(jsonMatch[0]) as {
    filePath?: string;
    content?: string;
    summary?: string;
  };
  if (!parsed.content) {
    throw new Error("LLM JSON missing content field");
  }
  return {
    filePath: parsed.filePath ?? fallbackPath,
    content: parsed.content,
    summary: parsed.summary ?? `Wrote ${parsed.filePath ?? fallbackPath}`,
  };
}

async function generateViaAnthropic(
  options: LlmGenerateOptions,
): Promise<CodeGeneration> {
  const fetchFn = options.fetchFn ?? fetch;
  const filePath = targetArtifactForTask(
    options.context.task.type,
    options.context.task.id,
  );
  const prompt = buildPrompt(options.context, filePath);

  const res = await fetchFn("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": options.config.apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: options.config.model,
      max_tokens: 4096,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Anthropic API error ${res.status}: ${errText}`);
  }

  const body = (await res.json()) as {
    content?: Array<{ type: string; text?: string }>;
    usage?: { input_tokens?: number; output_tokens?: number };
  };
  const text = body.content?.find((c) => c.type === "text")?.text ?? "";
  const parsed = parseCodeJson(text, filePath);
  return {
    ...parsed,
    tokenUsage: {
      input: body.usage?.input_tokens ?? 0,
      output: body.usage?.output_tokens ?? 0,
    },
  };
}

async function generateViaOpenAi(
  options: LlmGenerateOptions,
): Promise<CodeGeneration> {
  const fetchFn = options.fetchFn ?? fetch;
  const filePath = targetArtifactForTask(
    options.context.task.type,
    options.context.task.id,
  );
  const prompt = buildPrompt(options.context, filePath);

  const res = await fetchFn("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${options.config.apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: options.config.model,
      max_tokens: 4096,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`OpenAI API error ${res.status}: ${errText}`);
  }

  const body = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const text = body.choices?.[0]?.message?.content ?? "";
  const parsed = parseCodeJson(text, filePath);
  return {
    ...parsed,
    tokenUsage: {
      input: body.usage?.prompt_tokens ?? 0,
      output: body.usage?.completion_tokens ?? 0,
    },
  };
}
