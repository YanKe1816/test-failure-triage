import { homePage } from "./pages/home.js";
import { privacyPage } from "./pages/privacy.js";
import { supportPage } from "./pages/support.js";
import { termsPage } from "./pages/terms.js";

const APP_NAME = "test-failure-triage";
const APP_TITLE = "Test Failure Triage";
const APP_VERSION = "1.0.0";
const SUPPORT_EMAIL = "sidcraigau@gmail.com";
const JSON_RPC_VERSION = "2.0";

type Env = {
  OPENAI_APPS_CHALLENGE?: string;
};

type JsonObject = Record<string, unknown>;
type ErrorCode =
  | "missing_required_input"
  | "invalid_input_type"
  | "empty_input"
  | "out_of_scope"
  | "internal_error";

type ErrorObject = {
  code: ErrorCode;
  message: string;
  field: string;
  details: string;
};

type FailureRecord = {
  failure_id: string;
  test_name: string;
  message: string;
  location: string;
  evidence: string;
};

type FailureType =
  | "assertion_failure"
  | "timeout"
  | "environment_configuration"
  | "dependency_service"
  | "test_data_fixture"
  | "setup_teardown"
  | "infrastructure_resource"
  | "unknown_unclassified";

type Classification = {
  failure_id: string;
  failure_type: FailureType;
  evidence: string;
  classification_basis: string;
};

type ClassifiedFailureInput = {
  failure_id: string;
  failure_type: FailureType;
  evidence: string;
};

type ToolName = "parse_test_failures" | "classify_failure_type" | "build_triage_plan";
type ToolHandler = (rawArgs: unknown) => ReturnType<typeof toolResponse>;

const failureTypes: FailureType[] = [
  "assertion_failure",
  "timeout",
  "environment_configuration",
  "dependency_service",
  "test_data_fixture",
  "setup_teardown",
  "infrastructure_resource",
  "unknown_unclassified"
];

const triageOrder: FailureType[] = [
  "infrastructure_resource",
  "environment_configuration",
  "dependency_service",
  "setup_teardown",
  "test_data_fixture",
  "timeout",
  "assertion_failure",
  "unknown_unclassified"
];

const annotations = {
  readOnlyHint: true,
  destructiveHint: false,
  openWorldHint: false,
  idempotentHint: true
};

const errorObjectSchema = {
  type: "object",
  properties: {
    code: {
      type: "string",
      enum: ["missing_required_input", "invalid_input_type", "empty_input", "out_of_scope", "internal_error"],
      description: "Stable business error code."
    },
    message: { type: "string", description: "Human-readable error message." },
    field: { type: "string", description: "Input field related to the error, or an empty string." },
    details: { type: "string", description: "Additional stable details, or an empty string." }
  },
  required: ["code", "message", "field", "details"],
  additionalProperties: false
} as const;

const failureRecordSchema = {
  type: "object",
  properties: {
    failure_id: { type: "string", description: "Stable failure identifier." },
    test_name: { type: "string", description: "Explicit test name from the supplied material." },
    message: { type: "string", description: "Explicit failure message from the supplied material." },
    location: { type: "string", description: "Explicit file, line, stack, or location from the supplied material." },
    evidence: { type: "string", description: "Original supplied evidence snippet for this failure." }
  },
  required: ["failure_id", "test_name", "message", "location", "evidence"],
  additionalProperties: false
} as const;

const classificationSchema = {
  type: "object",
  properties: {
    failure_id: { type: "string", description: "Stable failure identifier." },
    failure_type: { type: "string", enum: failureTypes, description: "Frozen failure classification." },
    evidence: { type: "string", description: "Evidence used for classification." },
    classification_basis: { type: "string", description: "Rule and evidence basis without claiming root cause." }
  },
  required: ["failure_id", "failure_type", "evidence", "classification_basis"],
  additionalProperties: false
} as const;

const classifiedFailureInputSchema = {
  type: "object",
  properties: {
    failure_id: { type: "string", description: "Stable failure identifier." },
    failure_type: { type: "string", enum: failureTypes, description: "Frozen failure classification." },
    evidence: { type: "string", description: "Evidence supporting the classification." }
  },
  required: ["failure_id", "failure_type", "evidence"],
  additionalProperties: false
} as const;

const parseOutputSchema = {
  type: "object",
  properties: {
    status: { type: "string", enum: ["success", "error"], description: "Result status." },
    source_label: { type: "string", description: "Source label supplied by the caller, or an empty string." },
    failures: { type: "array", items: failureRecordSchema, description: "Extracted explicit failure records." },
    failure_count: { type: "integer", minimum: 0, description: "Number of extracted failures." },
    errors: { type: "array", items: errorObjectSchema, description: "Business errors." }
  },
  required: ["status", "source_label", "failures", "failure_count", "errors"],
  additionalProperties: false
} as const;

const classifyOutputSchema = {
  type: "object",
  properties: {
    status: { type: "string", enum: ["success", "error"], description: "Result status." },
    classifications: { type: "array", items: classificationSchema, description: "Failure classifications." },
    unclassified_count: { type: "integer", minimum: 0, description: "Count of unknown or unclassified failures." },
    errors: { type: "array", items: errorObjectSchema, description: "Business errors." }
  },
  required: ["status", "classifications", "unclassified_count", "errors"],
  additionalProperties: false
} as const;

const triageOutputSchema = {
  type: "object",
  properties: {
    status: { type: "string", enum: ["success", "error"], description: "Result status." },
    triage_items: {
      type: "array",
      description: "Evidence-based investigation items.",
      items: {
        type: "object",
        properties: {
          priority: { type: "integer", minimum: 1, description: "One-based priority order." },
          failure_ids: { type: "array", items: { type: "string" }, description: "Failures grouped in this item." },
          failure_type: { type: "string", enum: failureTypes, description: "Frozen failure classification." },
          reason: { type: "string", description: "Why this category should be inspected in this order." },
          supporting_evidence: { type: "array", items: { type: "string" }, description: "Evidence for the grouped failures." },
          next_checks: { type: "array", items: { type: "string" }, description: "Read-only suggested checks." }
        },
        required: ["priority", "failure_ids", "failure_type", "reason", "supporting_evidence", "next_checks"],
        additionalProperties: false
      }
    },
    limitations: { type: "array", items: { type: "string" }, description: "Scope and evidence limitations." },
    errors: { type: "array", items: errorObjectSchema, description: "Business errors." }
  },
  required: ["status", "triage_items", "limitations", "errors"],
  additionalProperties: false
} as const;

const tools = [
  {
    name: "parse_test_failures",
    title: "Parse Test Failures",
    description: "Extract explicit test failure records from supplied test logs, error messages, or test output without inventing missing facts.",
    inputSchema: {
      type: "object",
      properties: {
        source_text: { type: "string", description: "Supplied test logs, errors, or output to parse." },
        source_label: { type: "string", description: "Optional stable label for the supplied source." }
      },
      required: ["source_text"],
      additionalProperties: false
    },
    outputSchema: parseOutputSchema,
    annotations
  },
  {
    name: "classify_failure_type",
    title: "Classify Failure Type",
    description: "Classify supplied test failures into defined failure categories and return the evidence supporting each classification.",
    inputSchema: {
      type: "object",
      properties: {
        failure_text: { type: "string", description: "Failure text to classify when structured records are unavailable." },
        failure_records: { type: "array", items: failureRecordSchema, description: "Structured failure records to classify." }
      },
      required: [],
      additionalProperties: false
    },
    outputSchema: classifyOutputSchema,
    annotations
  },
  {
    name: "build_triage_plan",
    title: "Build Triage Plan",
    description: "Build an evidence-based investigation order from supplied test failure classifications without executing tests or claiming confirmed root causes.",
    inputSchema: {
      type: "object",
      properties: {
        classified_failures: { type: "array", items: classifiedFailureInputSchema, description: "Classified failures to order for investigation." }
      },
      required: ["classified_failures"],
      additionalProperties: false
    },
    outputSchema: triageOutputSchema,
    annotations
  }
] as const;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}

function html(page: string): Response {
  return new Response(page, { headers: { "content-type": "text/html; charset=utf-8" } });
}

function text(data: string, status = 200): Response {
  return new Response(data, { status, headers: { "content-type": "text/plain; charset=utf-8" } });
}

function rpcResult(id: unknown, result: unknown): Response {
  return json({ jsonrpc: JSON_RPC_VERSION, id, result });
}

function rpcError(id: unknown, code: number, message: string, data?: unknown): Response {
  const body: JsonObject = { jsonrpc: JSON_RPC_VERSION, id: id ?? null, error: { code, message } };
  if (data !== undefined && typeof body.error === "object" && body.error !== null) {
    (body.error as JsonObject).data = data;
  }
  return json(body);
}

function textContent(message: string) {
  return [{ type: "text", text: message }];
}

function toolResponse(structuredContent: unknown, message: string) {
  return { structuredContent, content: textContent(message) };
}

function error(code: ErrorCode, message: string, field = "", details = ""): ErrorObject {
  return { code, message, field, details };
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasUnknownKeys(value: JsonObject, allowed: string[]): boolean {
  return Object.keys(value).some((key) => !allowed.includes(key));
}

function isBlank(value: string): boolean {
  return value.trim().length === 0;
}

function combinedText(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(combinedText).join("\n");
  if (isObject(value)) return Object.values(value).map(combinedText).join("\n");
  return "";
}

function hasOutOfScopeRequest(value: unknown): boolean {
  const text = combinedText(value).toLowerCase();
  const requestPatterns = [
    /\b(?:please|pls|can you|could you|should we|we should|go ahead and|now|must|need to)\s+(?:re-?run|run|execute)\s+(?:the\s+)?tests?\b/,
    /\b(?:please|pls|can you|could you|should we|we should|go ahead and|now|must|need to)\s+(?:modify|fix|patch|change|edit)\s+(?:the\s+)?(?:code|configuration|config)\b/,
    /\b(?:access|operate|trigger|restart|cancel|update)\s+(?:ci|github|pipeline|workflow)\b/,
    /\b(?:deploy|publish|submit a fix|push a fix|open a pr|create a pull request)\b/,
    /\b(?:confirm|prove|determine)\s+(?:the\s+)?(?:root cause|final root cause|true cause)\b/,
    /\b(?:assign blame|blame|evaluate)\s+(?:a\s+)?(?:person|developer|engineer|owner|teammate)\b/
  ];
  return requestPatterns.some((pattern) => pattern.test(text));
}

function invalidAdditionalProperties(args: JsonObject, allowed: string[]): ErrorObject | undefined {
  return hasUnknownKeys(args, allowed)
    ? error("invalid_input_type", "Unexpected input field.", "", "Input contains a field outside the published schema.")
    : undefined;
}

function internalErrorResponse(toolName: ToolName, rawArgs: unknown) {
  const internal = error("internal_error", "An internal error occurred.", "", "");
  if (toolName === "parse_test_failures") {
    const sourceLabel = isObject(rawArgs) && typeof rawArgs.source_label === "string" ? rawArgs.source_label : "";
    return toolResponse(
      { status: "error", source_label: sourceLabel, failures: [], failure_count: 0, errors: [internal] },
      internal.message
    );
  }
  if (toolName === "classify_failure_type") {
    return toolResponse(
      { status: "error", classifications: [], unclassified_count: 0, errors: [internal] },
      internal.message
    );
  }
  return toolResponse(
    { status: "error", triage_items: [], limitations: [], errors: [internal] },
    internal.message
  );
}

function parseTestFailures(rawArgs: unknown) {
  const base = (err: ErrorObject, sourceLabel = "") =>
    toolResponse({ status: "error", source_label: sourceLabel, failures: [], failure_count: 0, errors: [err] }, err.message);

  if (!isObject(rawArgs)) {
    return base(error("invalid_input_type", "Tool arguments must be an object.", "", ""));
  }
  const extra = invalidAdditionalProperties(rawArgs, ["source_text", "source_label"]);
  if (extra) return base(extra, typeof rawArgs.source_label === "string" ? rawArgs.source_label : "");
  if (!("source_text" in rawArgs)) {
    return base(error("missing_required_input", "source_text is required.", "source_text", ""));
  }
  if (typeof rawArgs.source_text !== "string") {
    return base(error("invalid_input_type", "source_text must be a string.", "source_text", ""));
  }
  if ("source_label" in rawArgs && typeof rawArgs.source_label !== "string") {
    return base(error("invalid_input_type", "source_label must be a string.", "source_label", ""));
  }
  const sourceLabel = typeof rawArgs.source_label === "string" ? rawArgs.source_label : "";
  if (isBlank(rawArgs.source_text)) {
    return base(error("empty_input", "source_text must contain supplied test material.", "source_text", ""), sourceLabel);
  }
  if (hasOutOfScopeRequest(rawArgs.source_text)) {
    return base(error("out_of_scope", "Requested action is outside the read-only triage boundary.", "", ""), sourceLabel);
  }

  const failures = extractFailures(rawArgs.source_text);
  const structuredContent = {
    status: "success",
    source_label: sourceLabel,
    failures,
    failure_count: failures.length,
    errors: []
  };
  return toolResponse(structuredContent, `Parsed ${failures.length} explicit failure record(s).`);
}

function extractFailures(sourceText: string): FailureRecord[] {
  const lines = sourceText.replace(/\r\n/g, "\n").split("\n");
  const failureStart = /^\s*(?:FAIL|FAILED|ERROR|✖|×|not ok)\s+(.+?)\s*$/i;
  const locationPattern = /(?:at\s+[\w.$<>/\\-]+\s*\([^)]*:\d+:\d+\)|[\w./\\-]+\.(?:ts|tsx|js|jsx|py|rb|go|java|cs|php):\d+(?::\d+)?)/i;
  const messagePattern = /^\s*(?:Error|AssertionError|Expected|Received|Actual|Message|Failure|TimeoutError|TypeError|ReferenceError)\b[:\s].*/i;
  const blocks: string[][] = [];
  let current: string[] = [];

  for (const line of lines) {
    if (failureStart.test(line)) {
      if (current.length > 0) blocks.push(current);
      current = [line];
      continue;
    }
    if (current.length > 0) {
      if (isBlank(line) && current.length > 1) {
        blocks.push(current);
        current = [];
      } else if (current.length < 12) {
        current.push(line);
      }
    }
  }
  if (current.length > 0) blocks.push(current);

  return blocks
    .filter((block) => block.some((line) => messagePattern.test(line) || locationPattern.test(line) || /failed|error|timed out|expected|actual/i.test(line)))
    .map((block, index) => {
      const first = block[0] ?? "";
      const nameMatch = first.match(failureStart);
      const explicitTestName = block.map((line) => line.match(/^\s*Test:\s*(.+?)\s*$/i)?.[1]).find((value) => value !== undefined);
      const testName = cleanTestName(explicitTestName ?? nameMatch?.[1] ?? "");
      const message = block.find((line) => messagePattern.test(line))?.trim() ?? "";
      const location = block.find((line) => locationPattern.test(line))?.trim() ?? "";
      return {
        failure_id: `failure-${index + 1}`,
        test_name: testName,
        message,
        location,
        evidence: block.join("\n").trim()
      };
    });
}

function cleanTestName(value: string): string {
  return value.replace(/\s+\(\d+(?:\.\d+)?\s*(?:ms|s)\)\s*$/i, "").trim();
}

function classifyFailureType(rawArgs: unknown) {
  const base = (err: ErrorObject) =>
    toolResponse({ status: "error", classifications: [], unclassified_count: 0, errors: [err] }, err.message);
  if (!isObject(rawArgs)) return base(error("invalid_input_type", "Tool arguments must be an object.", "", ""));
  const extra = invalidAdditionalProperties(rawArgs, ["failure_text", "failure_records"]);
  if (extra) return base(extra);
  if (!("failure_text" in rawArgs) && !("failure_records" in rawArgs)) {
    return base(error("missing_required_input", "failure_text or failure_records is required.", "", ""));
  }
  if ("failure_text" in rawArgs && typeof rawArgs.failure_text !== "string") {
    return base(error("invalid_input_type", "failure_text must be a string.", "failure_text", ""));
  }
  if ("failure_records" in rawArgs && !Array.isArray(rawArgs.failure_records)) {
    return base(error("invalid_input_type", "failure_records must be an array.", "failure_records", ""));
  }
  if (hasOutOfScopeRequest(rawArgs)) {
    return base(error("out_of_scope", "Requested action is outside the read-only triage boundary.", "", ""));
  }

  const recordsResult = normalizeFailureRecords(rawArgs);
  if ("error" in recordsResult) return base(recordsResult.error);
  if (recordsResult.records.length === 0) {
    return base(error("empty_input", "At least one non-empty failure record or failure_text is required.", "", ""));
  }

  const classifications = recordsResult.records.map(classifyRecord);
  const unclassifiedCount = classifications.filter((item) => item.failure_type === "unknown_unclassified").length;
  return toolResponse(
    { status: "success", classifications, unclassified_count: unclassifiedCount, errors: [] },
    `Classified ${classifications.length} failure record(s).`
  );
}

function normalizeFailureRecords(args: JsonObject): { records: FailureRecord[] } | { error: ErrorObject } {
  const records: FailureRecord[] = [];
  if (Array.isArray(args.failure_records)) {
    for (const [index, item] of args.failure_records.entries()) {
      if (!isObject(item)) {
        return { error: error("invalid_input_type", "Each failure_records item must be an object.", `failure_records[${index}]`, "") };
      }
      const extra = invalidAdditionalProperties(item, ["failure_id", "test_name", "message", "location", "evidence"]);
      if (extra) return { error: extra };
      for (const field of ["failure_id", "test_name", "message", "location", "evidence"]) {
        if (!(field in item)) {
          return { error: error("missing_required_input", `${field} is required.`, `failure_records[${index}].${field}`, "") };
        }
        if (typeof item[field] !== "string") {
          return { error: error("invalid_input_type", `${field} must be a string.`, `failure_records[${index}].${field}`, "") };
        }
      }
      const record = item as FailureRecord;
      if ([record.failure_id, record.test_name, record.message, record.location, record.evidence].every(isBlank)) continue;
      records.push(record);
    }
  }
  if (typeof args.failure_text === "string" && !isBlank(args.failure_text)) {
    const extracted = extractFailures(args.failure_text);
    if (extracted.length > 0) {
      records.push(...extracted);
    } else {
      records.push({
        failure_id: `failure-${records.length + 1}`,
        test_name: "",
        message: args.failure_text.trim(),
        location: "",
        evidence: args.failure_text.trim()
      });
    }
  }
  return { records };
}

function classifyRecord(record: FailureRecord): Classification {
  const text = `${record.message}\n${record.evidence}`.toLowerCase();
  const matches: Array<{ type: FailureType; evidence: string; basis: string }> = [];
  const rules: Array<{ type: FailureType; pattern: RegExp; basis: string }> = [
    { type: "assertion_failure", pattern: /\b(expected|actual|assert(?:ion)? failed|comparison mismatch|to equal|not equal)\b/i, basis: "Matched explicit assertion or expected/actual mismatch evidence." },
    { type: "timeout", pattern: /\b(timed out|timeout exceeded|deadline exceeded|timeouterror)\b/i, basis: "Matched explicit timeout evidence." },
    { type: "environment_configuration", pattern: /\b(missing env(?:ironment)? variable|invalid config(?:uration)?|configuration error|env(?:ironment)? mismatch|config mismatch)\b/i, basis: "Matched explicit environment or configuration evidence." },
    { type: "dependency_service", pattern: /\b(connection refused|service unavailable|upstream unavailable|dependency unavailable|external service|503)\b/i, basis: "Matched explicit dependency or service availability evidence." },
    { type: "test_data_fixture", pattern: /\b(fixture|seed data|test data|mock data|missing data|invalid data)\b/i, basis: "Matched explicit test data or fixture evidence." },
    { type: "setup_teardown", pattern: /\b(beforeeach|aftereach|beforeall|afterall|setup|teardown)\b/i, basis: "Matched explicit setup or teardown phase evidence." },
    { type: "infrastructure_resource", pattern: /\b(disk|memory|cpu|container|runner|network|resource exhausted|no space left|out of memory)\b/i, basis: "Matched explicit infrastructure resource evidence." }
  ];

  for (const rule of rules) {
    const match = text.match(rule.pattern);
    if (match?.[0]) matches.push({ type: rule.type, evidence: match[0], basis: rule.basis });
  }

  const unique = Array.from(new Map(matches.map((match) => [match.type, match])).values());
  if (unique.length === 1 && unique[0]) {
    return {
      failure_id: record.failure_id || "",
      failure_type: unique[0].type,
      evidence: record.evidence || record.message,
      classification_basis: unique[0].basis
    };
  }
  if (unique.length > 1) {
    const direct = chooseDirectPhaseEvidence(unique, text);
    if (direct) {
      return {
        failure_id: record.failure_id || "",
        failure_type: direct.type,
        evidence: record.evidence || record.message,
        classification_basis: direct.basis
      };
    }
  }
  return {
    failure_id: record.failure_id || "",
    failure_type: "unknown_unclassified",
    evidence: record.evidence || record.message,
    classification_basis: unique.length > 1
      ? "Multiple category signals were present and could not be reliably resolved from supplied evidence."
      : "No frozen classification rule had sufficient explicit evidence."
  };
}

function chooseDirectPhaseEvidence(matches: Array<{ type: FailureType; evidence: string; basis: string }>, text: string) {
  const phaseMatch = text.match(/(?:FAIL|FAILED|ERROR|beforeEach|afterEach|beforeAll|afterAll|setup|teardown).{0,120}/i)?.[0] ?? "";
  const inPhase = matches.filter((match) => phaseMatch.toLowerCase().includes(match.evidence.toLowerCase()));
  return inPhase.length === 1 ? inPhase[0] : undefined;
}

function buildTriagePlan(rawArgs: unknown) {
  const base = (err: ErrorObject) =>
    toolResponse({ status: "error", triage_items: [], limitations: [], errors: [err] }, err.message);
  if (!isObject(rawArgs)) return base(error("invalid_input_type", "Tool arguments must be an object.", "", ""));
  const extra = invalidAdditionalProperties(rawArgs, ["classified_failures"]);
  if (extra) return base(extra);
  if (!("classified_failures" in rawArgs)) {
    return base(error("missing_required_input", "classified_failures is required.", "classified_failures", ""));
  }
  if (!Array.isArray(rawArgs.classified_failures)) {
    return base(error("invalid_input_type", "classified_failures must be an array.", "classified_failures", ""));
  }
  if (hasOutOfScopeRequest(rawArgs)) {
    return base(error("out_of_scope", "Requested action is outside the read-only triage boundary.", "", ""));
  }
  if (rawArgs.classified_failures.length === 0) {
    return base(error("empty_input", "classified_failures must contain at least one item.", "classified_failures", ""));
  }

  const normalized: ClassifiedFailureInput[] = [];
  for (const [index, item] of rawArgs.classified_failures.entries()) {
    const path = `classified_failures[${index}]`;
    if (!isObject(item)) return base(error("invalid_input_type", "Each classified_failures item must be an object.", path, ""));
    const itemExtra = invalidAdditionalProperties(item, ["failure_id", "failure_type", "evidence"]);
    if (itemExtra) return base(itemExtra);
    for (const field of ["failure_id", "failure_type", "evidence"]) {
      if (!(field in item)) return base(error("missing_required_input", `${field} is required.`, `${path}.${field}`, ""));
      if (typeof item[field] !== "string") return base(error("invalid_input_type", `${field} must be a string.`, `${path}.${field}`, ""));
    }
    const typed = item as ClassifiedFailureInput;
    if (isBlank(typed.failure_id) || isBlank(typed.evidence)) {
      return base(error("empty_input", "failure_id and evidence must be non-empty.", path, ""));
    }
    if (!failureTypes.includes(typed.failure_type)) {
      return base(error("invalid_input_type", "failure_type must be one of the frozen enum values.", `${path}.failure_type`, ""));
    }
    normalized.push(typed);
  }

  const triageItems = triageOrder
    .map((failureType) => normalized.filter((item) => item.failure_type === failureType))
    .filter((group) => group.length > 0)
    .map((group, index) => ({
      priority: index + 1,
      failure_ids: group.map((item) => item.failure_id),
      failure_type: group[0]?.failure_type ?? "unknown_unclassified",
      reason: reasonFor(group[0]?.failure_type ?? "unknown_unclassified"),
      supporting_evidence: group.map((item) => item.evidence),
      next_checks: nextChecksFor(group[0]?.failure_type ?? "unknown_unclassified")
    }));

  return toolResponse(
    {
      status: "success",
      triage_items: triageItems,
      limitations: [
        "Plan is based only on supplied evidence.",
        "Failure classifications do not confirm root causes.",
        "No tests, CI systems, code, or external services were accessed."
      ],
      errors: []
    },
    `Built ${triageItems.length} triage item(s).`
  );
}

const toolHandlers: Record<ToolName, ToolHandler> = {
  parse_test_failures: parseTestFailures,
  classify_failure_type: classifyFailureType,
  build_triage_plan: buildTriagePlan
};

function isToolName(name: string): name is ToolName {
  return name === "parse_test_failures" || name === "classify_failure_type" || name === "build_triage_plan";
}

function invokeTool(name: ToolName, args: unknown) {
  try {
    return toolHandlers[name](args);
  } catch {
    return internalErrorResponse(name, args);
  }
}

function reasonFor(type: FailureType): string {
  const reasons: Record<FailureType, string> = {
    infrastructure_resource: "Infrastructure resource evidence can affect broad test reliability, so inspect the supplied resource signals first.",
    environment_configuration: "Configuration evidence can affect many tests before application-specific assertions are meaningful.",
    dependency_service: "Dependency service evidence may explain shared failures without confirming a root cause.",
    setup_teardown: "Setup or teardown phase evidence can affect multiple tests before individual assertions run.",
    test_data_fixture: "Fixture or test data evidence can invalidate test preconditions across related failures.",
    timeout: "Timeout evidence indicates stalled or slow behavior that should be separated from assertion-specific failures.",
    assertion_failure: "Assertion evidence is usually local to expected and actual behavior, so it follows broader shared signals.",
    unknown_unclassified: "Unclassified evidence lacks enough signal for a narrower category and should be reviewed after explicit categories."
  };
  return reasons[type];
}

function nextChecksFor(type: FailureType): string[] {
  const checks: Record<FailureType, string[]> = {
    infrastructure_resource: ["Review supplied evidence for disk, memory, CPU, runner, container, or network resource indicators."],
    environment_configuration: ["Review supplied evidence for missing variables, invalid configuration values, or environment mismatches."],
    dependency_service: ["Review supplied evidence for named services, connection failures, upstream errors, or unavailable dependencies."],
    setup_teardown: ["Review supplied setup and teardown evidence for phase-specific failure messages and affected tests."],
    test_data_fixture: ["Review supplied fixture, seed, mock, or test data evidence for missing or invalid data signals."],
    timeout: ["Review supplied timeout evidence for timeout limits, elapsed durations, and the operation named in the message."],
    assertion_failure: ["Review supplied expected and actual values and the assertion location."],
    unknown_unclassified: ["Review supplied evidence manually for missing context or conflicting signals."]
  };
  return checks[type];
}

async function handleMcp(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return rpcError(null, -32700, "Parse error");
  }
  if (!isObject(body)) return rpcError(null, -32600, "Invalid Request");
  const id = body.id ?? null;
  const method = body.method;
  if (typeof method !== "string") return rpcError(id, -32600, "Invalid Request");

  try {
    if (method === "initialize") {
      return rpcResult(id, {
        protocolVersion: "2025-06-18",
        serverInfo: { name: APP_NAME, version: APP_VERSION },
        capabilities: { tools: {} }
      });
    }
    if (method === "tools/list") {
      return rpcResult(id, { tools });
    }
    if (method === "tools/call") {
      const params = isObject(body.params) ? body.params : {};
      const name = params.name;
      const args = "arguments" in params ? params.arguments : {};
      if (typeof name !== "string") return rpcError(id, -32602, "Tool name is required.");
      if (isToolName(name)) return rpcResult(id, invokeTool(name, args));
      return rpcError(id, -32602, "Unknown tool.", { tool: name });
    }
    return rpcError(id, -32601, "Method not found");
  } catch {
    const structuredContent = { status: "error", errors: [error("internal_error", "An internal error occurred.", "", "")] };
    return rpcError(id, -32603, "Internal error", structuredContent);
  }
}

export async function fetch(request: Request, env: Env = {}): Promise<Response> {
  const url = new URL(request.url);
  if (request.method === "GET" && url.pathname === "/") {
    return html(homePage);
  }
  if (request.method === "GET" && url.pathname === "/privacy") {
    return html(privacyPage);
  }
  if (request.method === "GET" && url.pathname === "/terms") {
    return html(termsPage);
  }
  if (request.method === "GET" && url.pathname === "/support") {
    return html(supportPage);
  }
  if (request.method === "GET" && url.pathname === "/health") {
    return json({ status: "ok", app: APP_NAME, version: APP_VERSION });
  }
  if (request.method === "GET" && url.pathname === "/.well-known/openai-apps-challenge") {
    if (typeof env.OPENAI_APPS_CHALLENGE !== "string" || env.OPENAI_APPS_CHALLENGE.length === 0) {
      return text("OPENAI_APPS_CHALLENGE is not configured.", 500);
    }
    return text(env.OPENAI_APPS_CHALLENGE);
  }
  if (request.method === "POST" && url.pathname === "/mcp") {
    return handleMcp(request);
  }
  return json({ error: "not_found", app: APP_NAME }, 404);
}

export default { fetch };
export const internals = {
  tools,
  parseTestFailures,
  classifyFailureType,
  buildTriagePlan,
  toolHandlers,
  internalErrorResponse,
  parseOutputSchema,
  classifyOutputSchema,
  triageOutputSchema
};
