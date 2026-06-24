export type LlmProvider = "anthropic" | "openai";

export interface LlmConfig {
  apiKey: string;
  provider: LlmProvider;
  model: string;
  mock: boolean;
}

const DEFAULT_MODELS: Record<LlmProvider, string> = {
  anthropic: "claude-sonnet-4-20250514",
  openai: "gpt-4o",
};

export function resolveLlmConfig(): LlmConfig | { error: string } {
  const mock = process.env.ASF_LLM_MOCK === "1";

  if (mock) {
    const provider = parseProvider(process.env.ASF_LLM_PROVIDER);
    return {
      apiKey: "mock",
      provider,
      model: process.env.ASF_LLM_MODEL ?? DEFAULT_MODELS[provider],
      mock: true,
    };
  }

  const apiKey = process.env.ASF_LLM_API_KEY?.trim();
  if (!apiKey) {
    return {
      error:
        "ASF_LLM_API_KEY is required for live agent execution (or set ASF_LLM_MOCK=1)",
    };
  }

  const provider = parseProvider(process.env.ASF_LLM_PROVIDER);
  return {
    apiKey,
    provider,
    model: process.env.ASF_LLM_MODEL ?? DEFAULT_MODELS[provider],
    mock: false,
  };
}

function parseProvider(raw: string | undefined): LlmProvider {
  if (raw === "openai") return "openai";
  return "anthropic";
}

export function isPilotAgentType(agentType: string): boolean {
  const raw = process.env.ASF_LLM_AGENT_TYPES ?? "backend-engineer";
  const types = raw.split(",").map((s) => s.trim()).filter(Boolean);
  return types.includes(agentType);
}
