import { contactLink, page } from "./shared.js";

export const supportPage = page("Support", `
    <h1>Support</h1>

    <h2>Support email</h2>
    <p>${contactLink}</p>

    <h2>What to include when contacting support</h2>
    <p>Include the route or tool used, a short description of the issue, expected behavior, and a minimal sample of non-sensitive test output if needed.</p>

    <h2>Support scope</h2>
    <p>Support covers app availability, routing, MCP behavior, structured output, schema issues, and questions about the read-only triage boundary.</p>

    <h2>Non-support scope</h2>
    <p>Support does not include debugging private repositories, operating CI, rerunning tests, modifying application code, deploying user projects, or submitting fixes.</p>

    <h2>Data/privacy questions</h2>
    <p>Send privacy and data handling questions to ${contactLink}.</p>

    <h2>App boundary reminder</h2>
    <p>Test Failure Triage only analyzes supplied evidence and does not confirm root causes or perform external actions.</p>
`);
