import { contactLink, page } from "./shared.js";

export const privacyPage = page("Privacy", `
    <h1>Privacy Policy</h1>
    <p>Last updated: August 4, 2026</p>

    <h2>Data collected</h2>
    <p>Test Failure Triage receives only the test failure materials and structured inputs supplied in the request.</p>

    <h2>How input is used</h2>
    <p>Input is used to extract explicit failures, classify evidence, and build a read-only investigation order.</p>

    <h2>How output is generated</h2>
    <p>Output is generated from deterministic parsing, classification, and ordering rules applied to the supplied evidence.</p>

    <h2>Retention</h2>
    <p>The app does not implement persistent storage for request content or generated results.</p>

    <h2>External sharing</h2>
    <p>The app does not share request content with external services.</p>

    <h2>External API policy</h2>
    <p>The app does not call external APIs, GitHub, CI systems, repositories, databases, or deployment services.</p>

    <h2>Account / login policy</h2>
    <p>The app does not provide user accounts, login, OAuth, or account-linked storage.</p>

    <h2>User controls</h2>
    <p>Users control what material is submitted. Do not include secrets or unrelated personal data in test output.</p>

    <h2>Read-only boundary</h2>
    <p>The app is read-only and does not rerun tests, modify code, operate CI, deploy, or submit fixes.</p>

    <h2>Contact</h2>
    <p>For privacy questions, contact ${contactLink}.</p>
`);
