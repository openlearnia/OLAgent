import { Database } from "bun:sqlite";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS missions (
  id TEXT PRIMARY KEY,
  goal TEXT NOT NULL,
  constraints_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'PENDING',
  workspace_path TEXT NOT NULL,
  created_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT NOT NULL,
  mission_id TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'task',
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  assigned_agent_type TEXT NOT NULL,
  dependencies_json TEXT NOT NULL DEFAULT '[]',
  acceptance_criteria_json TEXT NOT NULL DEFAULT '[]',
  parallel_safe INTEGER NOT NULL DEFAULT 0,
  max_retries INTEGER NOT NULL DEFAULT 3,
  epic_id TEXT,
  parent_task_id TEXT,
  gate_type TEXT,
  healing_parent_task_id TEXT,
  max_healing_iterations INTEGER,
  PRIMARY KEY (id, mission_id),
  FOREIGN KEY (mission_id) REFERENCES missions(id)
);

CREATE TABLE IF NOT EXISTS task_executions (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  mission_id TEXT NOT NULL,
  attempt INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'PENDING',
  agent_id TEXT,
  acp_session_id TEXT,
  lease_expires_at TEXT,
  next_eligible_at TEXT,
  idempotency_key TEXT NOT NULL,
  result_json TEXT,
  failure_report_id TEXT,
  started_at TEXT,
  completed_at TEXT,
  FOREIGN KEY (mission_id) REFERENCES missions(id)
);

CREATE TABLE IF NOT EXISTS workflow_edges (
  mission_id TEXT NOT NULL,
  from_task_id TEXT NOT NULL,
  to_task_id TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'hard',
  PRIMARY KEY (mission_id, from_task_id, to_task_id)
);

CREATE TABLE IF NOT EXISTS workflow_events (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  mission_id TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS idempotency_records (
  key TEXT PRIMARY KEY,
  operation TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  response_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS healing_dedup (
  key TEXT PRIMARY KEY,
  mission_id TEXT NOT NULL,
  parent_task_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_te_mission ON task_executions(mission_id);
CREATE INDEX IF NOT EXISTS idx_te_task ON task_executions(task_id, mission_id);
CREATE INDEX IF NOT EXISTS idx_tasks_mission ON tasks(mission_id);
`;

export function createDatabase(path = ":memory:"): Database {
  const db = new Database(path);
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec(SCHEMA);
  return db;
}

export function newId(prefix: string): string {
  return `${prefix}${crypto.randomUUID()}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function hashPayload(value: unknown): string {
  return Bun.hash(JSON.stringify(value)).toString(16);
}
