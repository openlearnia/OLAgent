# ASF-FW-04 — Monitoring

## Summary

ASF must collect and expose observability metrics for agent execution and mission progress — enabling operators to track performance, cost, reliability, and completion status across autonomous workflows.

## User Story

> As an ASF operator, I want dashboards showing how agents are performing and how close missions are to completion so that I can identify bottlenecks and failures quickly.

## System Story

> As the Monitoring system, I must ingest telemetry from agents, workflow engine, MCP tool calls, and test runners; aggregate metrics; and expose them via API and UI dashboards.

## Agent Metrics

| Metric | Type | Description |
|--------|------|-------------|
| `agent.execution.duration_ms` | histogram | Wall-clock time per agent execution |
| `agent.execution.tokens.input` | counter | Input tokens consumed |
| `agent.execution.tokens.output` | counter | Output tokens generated |
| `agent.execution.success_rate` | gauge | Success / total executions per agent type |
| `agent.tool.calls` | counter | MCP tool invocations per tool name |
| `agent.tool.duration_ms` | histogram | Per-tool call latency |
| `agent.retries` | counter | Retry attempts per task |

## Mission Metrics

| Metric | Type | Description |
|--------|------|-------------|
| `mission.completion.percent` | gauge | Tasks SUCCESS / total tasks |
| `mission.tasks.failed` | gauge | Current failed task count |
| `mission.tasks.blocked` | gauge | Current blocked task count |
| `mission.tasks.running` | gauge | Currently executing tasks |
| `mission.duration_ms` | gauge | Wall-clock since mission start |
| `mission.tokens.total` | counter | Aggregate token usage |
| `mission.estimated_cost` | gauge | Token cost estimate (if pricing configured) |

## Requirements

1. Metrics MUST be collected automatically — no manual instrumentation by agents beyond standard SDK.
2. Telemetry sources:
   - Agent lifecycle events (framework/agent-framework.md)
   - ACP session telemetry (FR-08)
   - MCP audit logs (framework/mcp-integration.md)
   - Workflow state transitions (framework/workflow-engine.md)
   - Test results (FR-12)
   - Healing loop iterations (FR-14)
3. Metrics MUST be queryable via API:
   - `GET /api/v1/missions/{id}/metrics`
   - `GET /api/v1/agents/metrics?type=backend-engineer&period=24h`
4. Metrics MUST be displayed in UI dashboards (framework/user-interface.md).
5. Alerting thresholds SHOULD be configurable:
   - Mission blocked > 30 minutes
   - Token usage exceeds mission budget
   - Agent success rate drops below 70% (rolling 1h)
6. Logs MUST be structured JSON with correlation IDs: `missionId`, `taskId`, `agentId`, `acpSessionId`.
7. Metrics retention: 30 days detailed, 1 year aggregated.
8. Real-time updates SHOULD use WebSocket or SSE for UI dashboards.
9. Export format: Prometheus-compatible endpoint (optional v1).
10. PII and secrets MUST NOT appear in metrics or logs.

## Inputs / Outputs / Artifacts

| Direction | Name | Format |
|-----------|------|--------|
| Input | Agent/session/workflow events | JSON stream |
| Output | Metrics API responses | JSON |
| Output | Dashboard data | Aggregated JSON |
| Output | Alert events | Webhook/email (optional) |

## Acceptance Criteria

- [ ] Agent execution time recorded per task
- [ ] Token usage tracked per agent and aggregated per mission
- [ ] Mission completion percentage accurate in real-time
- [ ] Failed and blocked task counts visible in Mission Dashboard
- [ ] Correlation IDs link logs across agent → MCP → test layers
- [ ] Metrics API returns data for reference CRM mission
- [ ] No secrets in metric labels or log fields

## Dependencies

- [framework/agent-framework.md](./agent-framework.md)
- [framework/workflow-engine.md](./workflow-engine.md)
- [framework/mcp-integration.md](./mcp-integration.md)
- [framework/user-interface.md](./user-interface.md)
- FR-08, FR-12, FR-14, FR-15

## Non-Goals

- Full APM distributed tracing (v1: correlation IDs only)
- Cost billing/invoicing
- External Grafana/Datadog integration (future)

## Open Questions

1. Embedded metrics store vs. Prometheus + Grafana?
2. Real-time WebSocket vs. polling for UI?
3. Per-user/tenant metric isolation?

## Examples

**Mission metrics API response:**

```json
{
  "missionId": "m-7f3a2b1c",
  "completion": { "percent": 73, "completed": 11, "total": 15 },
  "tasks": { "running": 2, "failed": 0, "blocked": 0, "pending": 2 },
  "duration_ms": 14400000,
  "tokens": { "input": 450000, "output": 120000, "estimated_cost_usd": 2.85 },
  "agents": {
    "backend-engineer": { "executions": 4, "success_rate": 1.0, "avg_duration_ms": 2700000 },
    "testing": { "executions": 2, "success_rate": 0.5, "avg_duration_ms": 600000 }
  }
}
```

**Structured log entry:**

```json
{
  "level": "info",
  "message": "Agent execution completed",
  "missionId": "m-7f3a2b1c",
  "taskId": "t-contacts-api",
  "agentId": "a-001",
  "acpSessionId": "acp-s-4a3b2c1d",
  "duration_ms": 2700000,
  "tokens": { "input": 85000, "output": 22000 },
  "status": "COMPLETED",
  "timestamp": "2026-06-22T10:45:00Z"
}
```
