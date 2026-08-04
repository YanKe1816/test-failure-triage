# Test Failure Triage

Test Failure Triage is a read-only MCP app for parsing supplied automated test failure materials, classifying failures from explicit evidence, and building an evidence-based investigation order.

It does not access CI, GitHub, external APIs, databases, deployment systems, or local code outside the supplied request material.

## Routes

- `GET /` returns a minimal app page with support contact.
- `GET /health` returns stable app identity JSON.
- `POST /mcp` handles JSON-RPC MCP requests for `initialize`, `tools/list`, and `tools/call`.

## Tools

- `parse_test_failures`
- `classify_failure_type`
- `build_triage_plan`

## Local Commands

```bash
npm install
npm run typecheck
npm test
```
