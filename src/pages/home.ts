import { contactLink, page } from "./shared.js";

export const homePage = page("Home", `
    <h1>Test Failure Triage</h1>
    <p>Test Failure Triage analyzes user-supplied automated test output and returns evidence-based failure records, classifications, and investigation order.</p>

    <h2>What this app does</h2>
    <p>It extracts explicit test failures, classifies supported failure types using supplied evidence, and builds a read-only investigation order.</p>

    <h2>When to use this app</h2>
    <p>Use it when you have test logs, error messages, stack traces, or already classified failures and need a structured triage summary.</p>

    <h2>What input it accepts</h2>
    <p>The app accepts supplied test output, failure text, structured failure records, or classified failure records. It only uses material included in the current request.</p>

    <h2>What output it returns</h2>
    <p>Outputs include extracted failure records, deterministic failure classifications, supporting evidence, ordered triage items, limitations, and structured errors.</p>

    <h2>Available tools</h2>
    <ul>
      <li><code>parse_test_failures</code></li>
      <li><code>classify_failure_type</code></li>
      <li><code>build_triage_plan</code></li>
    </ul>

    <h2>MCP endpoint</h2>
    <p><code>POST /mcp</code></p>

    <h2>What this app does not do</h2>
    <p>It does not access GitHub, CI systems, repositories, databases, external APIs, or deployment environments. It does not rerun tests, inspect or modify application code, confirm unproven root causes, assign blame, or submit fixes.</p>

    <h2>Data handling</h2>
    <p>The Worker processes the request content to produce a response. It does not add persistent storage, accounts, login, external sharing, or external API calls.</p>

    <h2>Support</h2>
    <p>Contact ${contactLink} for support.</p>
`);
