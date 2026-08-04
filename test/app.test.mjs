import assert from "node:assert/strict";
import test from "node:test";
import worker, { internals } from "../dist/index.js";

const appFetch = (path, init = {}, env = {}) => worker.fetch(new Request(`https://example.test${path}`, init), env);

async function mcp(method, params, id = 1) {
  const response = await appFetch("/mcp", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params })
  });
  assert.equal(response.status, 200);
  return response.json();
}

async function callTool(name, args, id = 10) {
  const body = await mcp("tools/call", { name, arguments: args }, id);
  assert.equal(body.jsonrpc, "2.0");
  assert.equal(body.id, id);
  return body.result.structuredContent;
}

function validate(schema, value, path = "$") {
  assert.equal(typeof value, "object", `${path} must be object`);
  assert.ok(value !== null && !Array.isArray(value), `${path} must be object`);
  const required = schema.required ?? [];
  for (const key of required) assert.ok(Object.hasOwn(value, key), `${path}.${key} is required`);
  if (schema.additionalProperties === false) {
    for (const key of Object.keys(value)) assert.ok(Object.hasOwn(schema.properties, key), `${path}.${key} is not allowed`);
  }
  for (const [key, childSchema] of Object.entries(schema.properties ?? {})) {
    if (Object.hasOwn(value, key)) validateValue(childSchema, value[key], `${path}.${key}`);
  }
}

function validateValue(schema, value, path) {
  if (schema.type === "string") {
    assert.equal(typeof value, "string", `${path} must be string`);
    if (schema.enum) assert.ok(schema.enum.includes(value), `${path} enum`);
  } else if (schema.type === "integer") {
    assert.equal(Number.isInteger(value), true, `${path} must be integer`);
    if (schema.minimum !== undefined) assert.ok(value >= schema.minimum, `${path} minimum`);
  } else if (schema.type === "array") {
    assert.ok(Array.isArray(value), `${path} must be array`);
    for (const [index, item] of value.entries()) validateValue(schema.items, item, `${path}[${index}]`);
  } else if (schema.type === "object") {
    validate(schema, value, path);
  }
}

function expectError(content, schema, code) {
  validate(schema, content);
  assert.equal(content.status, "error");
  assert.equal(content.errors[0].code, code);
}

async function withThrowingHandler(toolName, schema, args = {}) {
  const original = internals.toolHandlers[toolName];
  internals.toolHandlers[toolName] = () => {
    throw new Error("sensitive stack details must not leak");
  };
  try {
    const content = await callTool(toolName, args, `internal-${toolName}`);
    expectError(content, schema, "internal_error");
    assert.equal(JSON.stringify(content).includes("sensitive stack details"), false);
    assert.equal(JSON.stringify(content).includes("Error:"), false);
    return content;
  } finally {
    internals.toolHandlers[toolName] = original;
  }
}

function assertToolContract(tool) {
  assert.ok(tool.name);
  assert.ok(tool.title);
  assert.ok(tool.description);
  for (const schemaName of ["inputSchema", "outputSchema"]) {
    const schema = tool[schemaName];
    assert.equal(schema.type, "object");
    assert.ok(schema.properties);
    assert.ok(Array.isArray(schema.required));
    assert.equal(schema.additionalProperties, false);
    for (const property of Object.values(schema.properties)) {
      assert.ok(property.description, `${tool.name} property lacks description`);
      if (property.type === "array") assert.ok(property.items, `${tool.name} array lacks items`);
    }
  }
  assert.deepEqual(
    {
      readOnlyHint: tool.annotations.readOnlyHint,
      destructiveHint: tool.annotations.destructiveHint,
      openWorldHint: tool.annotations.openWorldHint
    },
    { readOnlyHint: true, destructiveHint: false, openWorldHint: false }
  );
}

test("routes return stable responses", async () => {
  const home = await appFetch("/");
  assert.equal(home.status, 200);
  const homeText = await home.text();
  assert.match(homeText, /Test Failure Triage/);
  assert.match(homeText, /sidcraigau@gmail\.com/);

  const health = await appFetch("/health");
  assert.deepEqual(await health.json(), { status: "ok", app: "test-failure-triage", version: "1.0.0" });

  const missing = await appFetch("/missing");
  assert.equal(missing.status, 404);
});

test("review shell pages return required app content", async () => {
  const pages = [
    ["/", ["What this app does", "When to use this app", "Available tools", "POST /mcp", "parse_test_failures", "classify_failure_type", "build_triage_plan"]],
    ["/privacy", ["Privacy Policy", "Data collected", "External API policy", "Read-only boundary", "Last updated"]],
    ["/terms", ["Terms of Use", "Service description", "No external execution", "No destructive actions", "Last updated"]],
    ["/support", ["Support", "What to include when contacting support", "Support scope", "App boundary reminder"]]
  ];

  for (const [path, requiredText] of pages) {
    const response = await appFetch(path);
    assert.equal(response.status, 200, `${path} status`);
    assert.match(response.headers.get("content-type"), /text\/html/, `${path} content-type`);
    const html = await response.text();
    assert.match(html, /Test Failure Triage/, `${path} app name`);
    for (const link of ['href="/"', 'href="/privacy"', 'href="/terms"', 'href="/support"']) {
      assert.ok(html.includes(link), `${path} nav ${link}`);
    }
    assert.ok(html.includes("sidcraigau@gmail.com"), `${path} support email`);
    assert.ok(html.includes('<a href="mailto:sidcraigau@gmail.com">sidcraigau@gmail.com</a>'), `${path} mailto`);
    for (const text of requiredText) assert.ok(html.includes(text), `${path} required text ${text}`);
    assert.doesNotMatch(html, /placeholder|TODO|lorem ipsum/i, `${path} placeholders`);
    assert.doesNotMatch(html, /Multi-App Hub|Weather App|Calendar App|Gmail App|CRM App/i, `${path} other app identity`);
    assert.doesNotMatch(html, /ChatGPT should use/i, `${path} forbidden ChatGPT phrasing`);
    assert.doesNotMatch(html, /will (?:rerun|modify|submit|access|operate)|can (?:rerun|modify|submit|access|operate)/i, `${path} unsupported promise`);
  }
});

test("challenge route returns plain text from environment", async () => {
  const response = await appFetch("/.well-known/openai-apps-challenge", {}, { OPENAI_APPS_CHALLENGE: "test" });
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /text\/plain/);
  assert.equal(await response.text(), "test");
});

test("challenge route reports missing environment safely", async () => {
  const response = await appFetch("/.well-known/openai-apps-challenge");
  assert.equal(response.status, 500);
  assert.match(response.headers.get("content-type"), /text\/plain/);
  const body = await response.text();
  assert.match(body, /OPENAI_APPS_CHALLENGE is not configured/);
  assert.doesNotMatch(body, /\{|"token"|placeholder/i);
});

test("mcp handles initialize, bad JSON, unsupported method, and unknown tool", async () => {
  const init = await mcp("initialize", {}, "init-1");
  assert.equal(init.id, "init-1");
  assert.equal(init.result.serverInfo.name, "test-failure-triage");
  assert.equal(init.result.serverInfo.version, "1.0.0");
  assert.ok(init.result.protocolVersion);
  assert.ok(init.result.capabilities.tools);

  const invalidJson = await appFetch("/mcp", { method: "POST", body: "{bad" });
  assert.equal((await invalidJson.json()).error.code, -32700);

  const unsupported = await mcp("prompts/list", {}, "bad-method");
  assert.equal(unsupported.error.code, -32601);

  const unknown = await mcp("tools/call", { name: "cluster_failures", arguments: {} }, "bad-tool");
  assert.equal(unknown.error.code, -32602);
});

test("tools/list exposes only frozen tool contracts", async () => {
  const body = await mcp("tools/list", {}, "list-1");
  const names = body.result.tools.map((tool) => tool.name);
  assert.deepEqual(names, ["parse_test_failures", "classify_failure_type", "build_triage_plan"]);
  assert.ok(!names.includes("cluster_failures"));
  assert.ok(!names.includes("check_triage_evidence"));
  for (const tool of body.result.tools) assertToolContract(tool);
});

test("parse_test_failures positive and no explicit failure behavior", async () => {
  const content = await callTool("parse_test_failures", {
    source_label: "ci-log",
    source_text: [
      "PASS src/ok.test.ts",
      "FAIL checkout creates order",
      "AssertionError: expected 200 actual 500",
      "at checkout.test.ts:12:4",
      "",
      "ERROR payment retries timeout",
      "TimeoutError: deadline exceeded",
      "at payment.test.ts:44:9"
    ].join("\n")
  });
  validate(internals.parseOutputSchema, content);
  assert.equal(content.status, "success");
  assert.equal(content.source_label, "ci-log");
  assert.equal(content.failure_count, 2);
  assert.equal(content.failures[0].failure_id, "failure-1");
  assert.equal(content.failures[0].test_name, "checkout creates order");
  assert.match(content.failures[0].message, /expected 200/);
  assert.match(content.failures[0].location, /checkout.test.ts:12:4/);
  assert.match(content.failures[0].evidence, /FAIL checkout/);

  const emptySuccess = await callTool("parse_test_failures", { source_text: "PASS all tests\nok 1" });
  validate(internals.parseOutputSchema, emptySuccess);
  assert.equal(emptySuccess.status, "success");
  assert.deepEqual(emptySuccess.failures, []);
});

test("parse_test_failures prefers explicit Test line for Gate 2.5 case 1", async () => {
  const content = await callTool("parse_test_failures", {
    source_label: "case-1",
    source_text: [
      "FAIL tests/auth.test.ts",
      "Test: rejects an expired token",
      "AssertionError: expected 401 but received 200",
      "at tests/auth.test.ts:42:18",
      "",
      "FAIL tests/orders.test.ts",
      "Test: creates an order",
      "Error: Test timed out after 5000 ms",
      "at tests/orders.test.ts:87:5"
    ].join("\n")
  });
  validate(internals.parseOutputSchema, content);
  assert.equal(content.failure_count, 2);
  assert.equal(content.failures[0].test_name, "rejects an expired token");
  assert.equal(content.failures[1].test_name, "creates an order");
  assert.match(content.failures[0].evidence, /FAIL tests\/auth.test.ts/);
  assert.match(content.failures[1].evidence, /FAIL tests\/orders.test.ts/);
});

test("parse_test_failures prefers explicit Test line for Gate 2.5 case 4", async () => {
  const content = await callTool("parse_test_failures", {
    source_label: "case-4",
    source_text: [
      "FAIL tests/checkout.test.ts",
      "Test: completes checkout",
      "Error: Payment service unavailable",
      "at tests/checkout.test.ts:61:9",
      "",
      "FAIL tests/profile.test.ts",
      "Test: updates the profile",
      "AssertionError: expected \"saved\" but received \"pending\"",
      "at tests/profile.test.ts:34:12",
      "",
      "FAIL tests/report.test.ts",
      "Test: generates the monthly report",
      "Error: Test timed out after 10000 ms",
      "at tests/report.test.ts:105:7"
    ].join("\n")
  });
  validate(internals.parseOutputSchema, content);
  assert.deepEqual(content.failures.map((failure) => failure.test_name), [
    "completes checkout",
    "updates the profile",
    "generates the monthly report"
  ]);
});

test("parse_test_failures keeps conservative identifier when Test line is absent", async () => {
  const content = await callTool("parse_test_failures", {
    source_label: "compat",
    source_text: [
      "FAIL checkout creates order",
      "AssertionError: expected 200 actual 500",
      "at checkout.test.ts:12:4"
    ].join("\n")
  });
  validate(internals.parseOutputSchema, content);
  assert.equal(content.failure_count, 1);
  assert.equal(content.failures[0].test_name, "checkout creates order");
});

test("parse_test_failures business errors match output schema", async () => {
  expectError(await callTool("parse_test_failures", {}), internals.parseOutputSchema, "missing_required_input");
  expectError(await callTool("parse_test_failures", "not-an-object"), internals.parseOutputSchema, "invalid_input_type");
  expectError(await callTool("parse_test_failures", { source_text: 42 }), internals.parseOutputSchema, "invalid_input_type");
  expectError(await callTool("parse_test_failures", { source_text: "   " }), internals.parseOutputSchema, "empty_input");
  expectError(await callTool("parse_test_failures", { source_text: "Please rerun the tests in CI." }), internals.parseOutputSchema, "out_of_scope");
});

test("parse_test_failures internal_error matches output schema", async () => {
  const content = await withThrowingHandler("parse_test_failures", internals.parseOutputSchema, {
    source_label: "internal-source",
    source_text: "FAIL x\nError: boom"
  });
  assert.equal(content.source_label, "internal-source");
  assert.deepEqual(content.failures, []);
  assert.equal(content.failure_count, 0);
});

test("classify_failure_type classifies all frozen categories plus unknown and conflict", async () => {
  const records = [
    ["a", "AssertionError: expected true actual false"],
    ["t", "TimeoutError: timeout exceeded after 5000ms"],
    ["e", "configuration error: missing env variable API_URL"],
    ["d", "connection refused: service unavailable"],
    ["f", "fixture missing seed data"],
    ["s", "beforeEach setup failed"],
    ["i", "runner out of memory on container"],
    ["u", "test failed with status 1"],
    ["c", "timeout exceeded and expected value mismatch"]
  ].map(([id, message]) => ({ failure_id: id, test_name: id, message, location: "x.test.ts:1:1", evidence: message }));
  const content = await callTool("classify_failure_type", { failure_records: records });
  validate(internals.classifyOutputSchema, content);
  assert.deepEqual(content.classifications.map((item) => item.failure_type), [
    "assertion_failure",
    "timeout",
    "environment_configuration",
    "dependency_service",
    "test_data_fixture",
    "setup_teardown",
    "infrastructure_resource",
    "unknown_unclassified",
    "unknown_unclassified"
  ]);
  assert.equal(content.unclassified_count, 2);
});

test("classify_failure_type supports failure_text alone and failure_records alone", async () => {
  const fromText = await callTool("classify_failure_type", { failure_text: "FAIL api loads\nTimeoutError: timed out\nat api.test.ts:2:1" });
  validate(internals.classifyOutputSchema, fromText);
  assert.equal(fromText.classifications[0].failure_type, "timeout");

  const fromRecords = await callTool("classify_failure_type", {
    failure_records: [{ failure_id: "r1", test_name: "renders", message: "expected a actual b", location: "ui.test.ts:3:1", evidence: "expected a actual b" }]
  });
  validate(internals.classifyOutputSchema, fromRecords);
  assert.equal(fromRecords.classifications[0].failure_type, "assertion_failure");
});

test("classify_failure_type business errors match output schema", async () => {
  expectError(await callTool("classify_failure_type", {}), internals.classifyOutputSchema, "missing_required_input");
  expectError(await callTool("classify_failure_type", "not-an-object"), internals.classifyOutputSchema, "invalid_input_type");
  expectError(await callTool("classify_failure_type", { failure_text: 1 }), internals.classifyOutputSchema, "invalid_input_type");
  expectError(await callTool("classify_failure_type", { failure_text: "   " }), internals.classifyOutputSchema, "empty_input");
  expectError(await callTool("classify_failure_type", { failure_records: [] }), internals.classifyOutputSchema, "empty_input");
  expectError(await callTool("classify_failure_type", { failure_text: "Please fix the code." }), internals.classifyOutputSchema, "out_of_scope");
});

test("classify_failure_type nested input errors match output schema", async () => {
  expectError(await callTool("classify_failure_type", { failure_records: ["bad"] }), internals.classifyOutputSchema, "invalid_input_type");
  expectError(
    await callTool("classify_failure_type", {
      failure_records: [{ failure_id: "f1", test_name: "t", message: "m", location: "x.test.ts:1:1" }]
    }),
    internals.classifyOutputSchema,
    "missing_required_input"
  );
  expectError(
    await callTool("classify_failure_type", {
      failure_records: [{ failure_id: "f1", test_name: "t", message: 12, location: "x.test.ts:1:1", evidence: "m" }]
    }),
    internals.classifyOutputSchema,
    "invalid_input_type"
  );
  expectError(
    await callTool("classify_failure_type", {
      failure_records: [{ failure_id: "f1", test_name: "t", message: "m", location: "x.test.ts:1:1", evidence: "m", extra: "no" }]
    }),
    internals.classifyOutputSchema,
    "invalid_input_type"
  );
});

test("classify_failure_type internal_error matches output schema", async () => {
  const content = await withThrowingHandler("classify_failure_type", internals.classifyOutputSchema, {
    failure_text: "FAIL x\nTimeoutError: timed out"
  });
  assert.deepEqual(content.classifications, []);
  assert.equal(content.unclassified_count, 0);
});

test("build_triage_plan orders, merges, and limits actions", async () => {
  const content = await callTool("build_triage_plan", {
    classified_failures: [
      { failure_id: "a1", failure_type: "assertion_failure", evidence: "expected 1 actual 2" },
      { failure_id: "i1", failure_type: "infrastructure_resource", evidence: "runner out of memory" },
      { failure_id: "a2", failure_type: "assertion_failure", evidence: "expected ok actual fail" },
      { failure_id: "e1", failure_type: "environment_configuration", evidence: "missing env variable" }
    ]
  });
  validate(internals.triageOutputSchema, content);
  assert.deepEqual(content.triage_items.map((item) => item.failure_type), ["infrastructure_resource", "environment_configuration", "assertion_failure"]);
  assert.deepEqual(content.triage_items[2].failure_ids, ["a1", "a2"]);
  assert.deepEqual(content.triage_items.map((item) => item.priority), [1, 2, 3]);
  assert.equal(content.limitations.length, 3);
  const checks = content.triage_items.flatMap((item) => item.next_checks).join(" ").toLowerCase();
  assert.doesNotMatch(checks, /\b(run|execute|fix|modify|deploy|submit)\b/);
});

test("build_triage_plan business errors match output schema", async () => {
  expectError(await callTool("build_triage_plan", {}), internals.triageOutputSchema, "missing_required_input");
  expectError(await callTool("build_triage_plan", "not-an-object"), internals.triageOutputSchema, "invalid_input_type");
  expectError(await callTool("build_triage_plan", { classified_failures: "bad" }), internals.triageOutputSchema, "invalid_input_type");
  expectError(await callTool("build_triage_plan", { classified_failures: [] }), internals.triageOutputSchema, "empty_input");
  expectError(await callTool("build_triage_plan", { classified_failures: [{ failure_id: "", failure_type: "timeout", evidence: "" }] }), internals.triageOutputSchema, "empty_input");
  expectError(
    await callTool("build_triage_plan", {
      classified_failures: [{ failure_id: "x", failure_type: "timeout", evidence: "Please deploy a fix." }]
    }),
    internals.triageOutputSchema,
    "out_of_scope"
  );
});

test("build_triage_plan nested input errors match output schema", async () => {
  expectError(await callTool("build_triage_plan", { classified_failures: ["bad"] }), internals.triageOutputSchema, "invalid_input_type");
  expectError(
    await callTool("build_triage_plan", {
      classified_failures: [{ failure_id: "f1", failure_type: "timeout" }]
    }),
    internals.triageOutputSchema,
    "missing_required_input"
  );
  expectError(
    await callTool("build_triage_plan", {
      classified_failures: [{ failure_id: "f1", failure_type: "timeout", evidence: 12 }]
    }),
    internals.triageOutputSchema,
    "invalid_input_type"
  );
  expectError(
    await callTool("build_triage_plan", {
      classified_failures: [{ failure_id: "f1", failure_type: "not_frozen", evidence: "evidence" }]
    }),
    internals.triageOutputSchema,
    "invalid_input_type"
  );
  expectError(
    await callTool("build_triage_plan", {
      classified_failures: [{ failure_id: "f1", failure_type: "timeout", evidence: "evidence", extra: "no" }]
    }),
    internals.triageOutputSchema,
    "invalid_input_type"
  );
});

test("build_triage_plan internal_error matches output schema", async () => {
  const content = await withThrowingHandler("build_triage_plan", internals.triageOutputSchema, {
    classified_failures: [{ failure_id: "f1", failure_type: "timeout", evidence: "timed out" }]
  });
  assert.deepEqual(content.triage_items, []);
  assert.deepEqual(content.limitations, []);
});
