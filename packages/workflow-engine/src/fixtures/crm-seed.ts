import type { MissionConstraints, SeedEdge, SeedNode } from "../types.ts";

export const CRM_MISSION_ID = "m-crm-ref";

export const CRM_CONSTRAINTS: MissionConstraints = {
  stack: ["typescript", "bun", "react"],
  deployment: "cloudflare",
  database: "d1",
  auth: "better-auth",
  environment: "staging",
  maxRetries: 3,
  retryBackoffMs: [0, 30_000, 120_000],
  verification: {
    requireAuth: true,
    primaryResource: "contacts",
    healthPath: "/api/health",
  },
};

export const CRM_SEED_NODES: SeedNode[] = [
  {
    id: "t-discover",
    kind: "task",
    type: "discover-requirements",
    assignedAgentType: "requirement-discovery",
    title: "Discover CRM requirements",
  },
  {
    id: "t-research",
    kind: "task",
    type: "research",
    assignedAgentType: "research",
    title: "Research CRM domain patterns",
  },
  {
    id: "t-architecture",
    kind: "task",
    type: "architecture",
    assignedAgentType: "architect",
    title: "Design CRM architecture",
  },
  {
    id: "t-plan",
    kind: "task",
    type: "plan-tasks",
    assignedAgentType: "planner",
    title: "Decompose into executable tasks",
  },
];

export const CRM_SEED_EDGES: SeedEdge[] = [
  { from: "t-discover", to: "t-research", kind: "hard" },
  { from: "t-research", to: "t-architecture", kind: "hard" },
  { from: "t-architecture", to: "t-plan", kind: "hard" },
];

export const CRM_HEALING_TEMPLATES = [{ parentTaskId: "t-browser", maxIterations: 3 }];
