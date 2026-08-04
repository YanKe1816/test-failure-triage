const supportEmail = "sidcraigau@gmail.com";

export function page(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title} - Test Failure Triage</title>
  <style>
    body { margin: 0; font-family: Arial, sans-serif; line-height: 1.55; color: #1f2933; background: #f7f8fa; }
    header { background: #ffffff; border-bottom: 1px solid #d9dee7; }
    nav { max-width: 960px; margin: 0 auto; padding: 16px 20px; display: flex; gap: 18px; align-items: center; flex-wrap: wrap; }
    nav strong { margin-right: auto; }
    nav a { color: #1d4ed8; text-decoration: none; }
    main { max-width: 960px; margin: 0 auto; padding: 32px 20px 48px; background: #ffffff; }
    h1, h2 { line-height: 1.2; }
    code { background: #eef2f7; padding: 2px 4px; border-radius: 4px; }
    footer { max-width: 960px; margin: 0 auto; padding: 18px 20px 32px; color: #52606d; }
  </style>
</head>
<body>
  <header>
    <nav aria-label="Primary navigation">
      <strong>Test Failure Triage</strong>
      <a href="/">Home</a>
      <a href="/privacy">Privacy</a>
      <a href="/terms">Terms</a>
      <a href="/support">Support</a>
    </nav>
  </header>
  <main>
${body}
  </main>
  <footer>
    Support: <a href="mailto:${supportEmail}">${supportEmail}</a>
  </footer>
</body>
</html>`;
}

export const contactLink = `<a href="mailto:${supportEmail}">${supportEmail}</a>`;
