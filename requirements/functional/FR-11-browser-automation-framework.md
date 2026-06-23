# FR-11 — Browser Automation Framework

## Summary

ASF must provide browser automation primitives via MCP — navigate, interact, observe, and capture — enabling agents to validate UI workflows, extract page state, and diagnose runtime issues in a real browser environment.

## User Story

> As the ASF platform, I need reliable browser automation so that testing and verification agents can confirm the application works in a real browser, not just in unit tests.

## System Story

> As the Browser MCP server, I must expose a stable tool API for Chromium-based automation, manage browser sessions per ACP context, and return structured results for agent consumption.

## Requirements

1. The Browser MCP MUST implement the **OLTestStack v1 conformance profile** — canonical tool names use `page.*` with `elementId` discovery (not CSS `selector` as primary identifier).

| Tool | Description | Parameters |
|------|-------------|------------|
| `page_navigate` | Load URL | `url`, `waitUntil` (load/domcontentloaded/networkidle) |
| `page_type` | Type text into element | `elementId`, `text`, `clear` |
| `page_click` | Click element | `elementId`, `button` (left/right) |
| `page_text` | Get text content | `elementId` or page scope |
| `page_screenshot` | Capture visual state | `fullPage`, `path` (optional save) |
| `page_network` | Retrieve network requests | `filter` (url pattern, status) |
| `page_console` | Retrieve console output | `level` (log/warn/error/all) |
| `page_find` | Discover elements by label/role/text | `query` |
| `page_wait` | Wait for element, URL, or network idle | `condition`, `value` |
| `browser_launch` / `browser_close` | Session lifecycle | — |

2. **Legacy name mapping** (for agent contract compatibility; implementations SHOULD accept aliases):

| Legacy (`browser.*`) | OLTestStack canonical |
|----------------------|----------------------|
| `browser.navigate` | `page_navigate` |
| `browser.type` | `page_type` |
| `browser.click` | `page_click` |
| `browser.extractText` | `page_text` |
| `browser.screenshot` | `page_screenshot` |
| `browser.networkLogs` | `page_network` |
| `browser.consoleLogs` | `page_console` |
| `browser.wait` | `page_wait` |
| `browser.find` | `page_find` |

3. Element discovery MUST use `page_find` or `page_elements`; agents MUST pass `browserId` and `pageId` from prior responses and re-discover after `page_navigate` / `page_reload`.
4. Each ACP session MUST receive an isolated browser instance (or context).
5. Browser MUST default to headless Chromium; headed mode configurable for debugging.
6. Tool responses MUST include `ok: boolean`, `data`, and structured `error` on failure.
7. Screenshots MUST be savable to mission workspace for artifact retention.
8. Network and console logs MUST be capturable from page load through current state.
9. Browser sessions MUST be closed on ACP session termination.
10. Timeouts MUST be configurable per operation (default: 30s navigation, 10s element wait).
11. Browser MCP MUST follow OLTestStack session conventions: pass `browserId`/`pageId` from responses, re-discover elements after navigation.

## Inputs / Outputs / Artifacts

| Direction | Name | Format |
|-----------|------|--------|
| Input | URL, selectors, text | Tool parameters |
| Output | Page text, element state | JSON |
| Output | Screenshots | PNG files in workspace |
| Output | Network/console logs | JSON arrays |
| Output | Session IDs | `browserId`, `pageId` |

## Acceptance Criteria

- [ ] `page_navigate` loads deployed CRM login page
- [ ] `page_type` + `page_click` completes login flow
- [ ] `page_text` returns contact list content
- [ ] `page_screenshot` saved to `artifacts/screenshots/`
- [ ] `page_console` captures JavaScript errors on broken page
- [ ] `page_network` shows API call to `/api/contacts` with status 200
- [ ] Concurrent ACP sessions do not share browser state
- [ ] Session cleanup on ACP termination (no zombie Chromium processes)

## Dependencies

- FR-08 — ACP session isolation
- FR-12 — Test agent consumer
- FR-17 — Deployment verification consumer
- [framework/mcp-integration.md](../framework/mcp-integration.md)

## Non-Goals

- Mobile browser emulation (v1)
- Visual regression comparison (pixel diff) — future
- CAPTCHA solving
- Multi-tab orchestration (v1: single active page)

## Open Questions

1. Playwright vs. Puppeteer vs. OLTestStack as underlying driver?
2. Video recording of browser sessions?
3. Authentication cookie injection for test speed?

## Examples

**Login flow test script (agent tool sequence):**

```yaml
browser_flow:
  - tool: page_navigate
    args: { url: "https://crm-staging.example.com/login" }
  - tool: page_find
    args: { query: "email" }
  - tool: page_type
    args: { elementId: "el-email", text: "test@example.com" }
  - tool: page_type
    args: { elementId: "el-password", text: "${TEST_PASSWORD}" }
  - tool: page_click
    args: { elementId: "el-submit" }
  - tool: page_wait
    args: { condition: url, value: "/dashboard" }
  - tool: page_text
    args: { elementId: "el-heading" }
  - tool: page_screenshot
    args: { path: "artifacts/screenshots/dashboard.png" }
```

**Tool response:**

```json
{
  "ok": true,
  "data": {
    "browserId": "b-abc123",
    "pageId": "p-def456",
    "text": "Dashboard",
    "url": "https://crm-staging.example.com/dashboard"
  }
}
```
