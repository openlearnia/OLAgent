/**
 * Minimal agent contract registry for M2 bundle validation and timeout resolution.
 * Full registry moves to @olagent/contracts in M3+.
 */

export interface AgentContract {
  type: string;
  version: string;
  timeoutMs: number;
  requiredArtifacts: string[];
}

const DEFAULT_TIMEOUT_MS = 3_600_000;

const CONTRACTS: Record<string, AgentContract> = {
  "requirement-discovery": {
    type: "requirement-discovery",
    version: "1.0.0",
    timeoutMs: 2_700_000,
    requiredArtifacts: [],
  },
  research: {
    type: "research",
    version: "1.0.0",
    timeoutMs: 2_700_000,
    requiredArtifacts: [],
  },
  architect: {
    type: "architect",
    version: "1.0.0",
    timeoutMs: 2_700_000,
    requiredArtifacts: ["requirements.md"],
  },
  planner: {
    type: "planner",
    version: "1.0.0",
    timeoutMs: 3_600_000,
    requiredArtifacts: [
      "requirements.md",
      "architecture.md",
      "database-schema.md",
      "openapi.yaml",
      "research-report.md",
    ],
  },
  "infra-engineer": {
    type: "infra-engineer",
    version: "1.0.0",
    timeoutMs: 7_200_000,
    requiredArtifacts: [],
  },
  "backend-engineer": {
    type: "backend-engineer",
    version: "1.0.0",
    timeoutMs: 7_200_000,
    requiredArtifacts: [],
  },
  "frontend-engineer": {
    type: "frontend-engineer",
    version: "1.0.0",
    timeoutMs: 7_200_000,
    requiredArtifacts: [],
  },
  testing: {
    type: "testing",
    version: "1.0.0",
    timeoutMs: 3_600_000,
    requiredArtifacts: [],
  },
  fix: {
    type: "fix",
    version: "1.0.0",
    timeoutMs: 3_600_000,
    requiredArtifacts: [],
  },
  deployment: {
    type: "deployment",
    version: "1.0.0",
    timeoutMs: 2_700_000,
    requiredArtifacts: [],
  },
  verification: {
    type: "verification",
    version: "1.0.0",
    timeoutMs: 3_600_000,
    requiredArtifacts: [],
  },
};

export function getAgentContract(
  agentType: string,
  version?: string,
): AgentContract {
  const contract = CONTRACTS[agentType];
  if (!contract) {
    return {
      type: agentType,
      version: version ?? "1.0.0",
      timeoutMs: DEFAULT_TIMEOUT_MS,
      requiredArtifacts: [],
    };
  }
  if (version && version !== contract.version) {
    throw new Error(
      `Unknown contract version ${version} for agent type ${agentType}`,
    );
  }
  return contract;
}

export function listKnownAgentTypes(): string[] {
  return Object.keys(CONTRACTS);
}
