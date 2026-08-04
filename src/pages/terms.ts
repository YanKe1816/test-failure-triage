import { contactLink, page } from "./shared.js";

export const termsPage = page("Terms", `
    <h1>Terms of Use</h1>
    <p>Last updated: August 4, 2026</p>

    <h2>Service description</h2>
    <p>Test Failure Triage provides structured analysis of user-supplied automated test failure materials.</p>

    <h2>Allowed use</h2>
    <p>Use the app to parse explicit failures, classify supported failure types, and produce an evidence-based investigation order.</p>

    <h2>User responsibility</h2>
    <p>Users are responsible for the accuracy and appropriateness of the materials they provide.</p>

    <h2>Limitations</h2>
    <p>Outputs are based only on supplied material. Classifications and investigation order do not confirm root causes.</p>

    <h2>No external execution</h2>
    <p>The app does not access code, GitHub, CI systems, repositories, external APIs, or external services. It does not rerun tests, modify code, deploy, or submit fixes.</p>

    <h2>No professional advice unless explicitly scoped</h2>
    <p>The app provides technical triage organization only and does not provide legal, financial, medical, or other professional advice.</p>

    <h2>No destructive actions</h2>
    <p>The app is read-only and does not perform destructive or external actions.</p>

    <h2>No guarantees</h2>
    <p>Results may be incomplete when the supplied evidence is incomplete, ambiguous, or conflicting.</p>

    <h2>Prohibited use</h2>
    <p>Do not use the app to request unauthorized access, external system operation, code changes, deployment, or blame assignment.</p>

    <h2>Changes to service</h2>
    <p>The service may change over time while preserving its stated read-only triage boundary.</p>

    <h2>Contact</h2>
    <p>Contact ${contactLink} with terms questions.</p>
`);
