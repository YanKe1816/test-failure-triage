import assert from "node:assert/strict";

const baseUrl = process.env.PRODUCTION_BASE_URL ?? "";
const mcpUrl = process.env.PRODUCTION_MCP_URL ?? "";

if (!baseUrl || !mcpUrl) {
  console.error("Set PRODUCTION_BASE_URL and PRODUCTION_MCP_URL before running production regression.");
  process.exit(1);
}
if (mcpUrl.includes("trycloudflare.com")) {
  console.error("Production regression must not use a trycloudflare tunnel URL.");
  process.exit(1);
}

async function mcp(id, method, params = {}) {
  const response = await fetch(mcpUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params })
  });
  assert.equal(response.status, 200, `${method} HTTP status`);
  const body = await response.json();
  assert.equal(body.jsonrpc, "2.0", `${method} JSON-RPC`);
  assert.equal(body.id, id, `${method} id`);
  return body;
}

const initialize = await mcp("prod-init", "initialize");
assert.equal(initialize.result.serverInfo.name, "test-failure-triage");

const list = await mcp("prod-list", "tools/list");
assert.deepEqual(list.result.tools.map((tool) => tool.name), [
  "parse_test_failures",
  "classify_failure_type",
  "build_triage_plan"
]);

async function callTool(id, name, args) {
  const body = await mcp(id, "tools/call", { name, arguments: args });
  assert.ok(body.result.structuredContent, `${name} structuredContent`);
  return body.result.structuredContent;
}

const parse = await callTool("prod-parse", "parse_test_failures", {
  source_label: "production-regression",
  source_text: "FAIL tests/auth.test.ts\nTest: rejects an expired token\nAssertionError: expected 401 but received 200\nat tests/auth.test.ts:42:18"
});
assert.equal(parse.status, "success");
assert.equal(parse.failures[0].test_name, "rejects an expired token");

const classify = await callTool("prod-classify", "classify_failure_type", {
  failure_records: parse.failures
});
assert.equal(classify.status, "success");
assert.equal(classify.classifications[0].failure_type, "assertion_failure");

const triage = await callTool("prod-triage", "build_triage_plan", {
  classified_failures: classify.classifications.map((item) => ({
    failure_id: item.failure_id,
    failure_type: item.failure_type,
    evidence: item.evidence
  }))
});
assert.equal(triage.status, "success");
assert.equal(triage.triage_items[0].failure_type, "assertion_failure");

const invalid = await callTool("prod-error", "parse_test_failures", {});
assert.equal(invalid.status, "error");
assert.equal(invalid.errors[0].code, "missing_required_input");

const boundary = await callTool("prod-boundary", "classify_failure_type", {
  failure_text: "Please rerun the tests in CI and confirm the final root cause."
});
assert.equal(boundary.status, "error");
assert.equal(boundary.errors[0].code, "out_of_scope");

const health = await fetch(`${baseUrl}/health`);
assert.equal(health.status, 200, "health status");
const healthJson = await health.json();
assert.equal(healthJson.app, "test-failure-triage");

console.log(JSON.stringify({
  result: "PASS",
  baseUrl,
  mcpUrl,
  tools: list.result.tools.map((tool) => tool.name),
  parse: { failure_count: parse.failure_count, test_name: parse.failures[0].test_name },
  classify: { failure_type: classify.classifications[0].failure_type },
  triage: { item_count: triage.triage_items.length },
  error: invalid.errors[0].code,
  boundary: boundary.errors[0].code
}, null, 2));
