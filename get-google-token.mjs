#!/usr/bin/env node
// ============================================================
// Jednorázový skript: vytáhne Google refresh token pro kalendář.
//
// SPUŠTĚNÍ:  node get-google-token.mjs
//
// Potřebuješ Client ID + Client Secret z Google Cloud konzole
// (návod je v README, sekce „Google kalendář — nastavení").
// Skript otevře prohlížeč, ty odklikneš souhlas, a on vypíše
// refresh token. Ten pak vlož Claudovi / do Supabase secrets.
// ============================================================

import http from "node:http";
import { createInterface } from "node:readline/promises";
import { exec } from "node:child_process";

const PORT = 8080;
const REDIRECT = `http://localhost:${PORT}/callback`;
const SCOPE = "https://www.googleapis.com/auth/calendar.events";

const rl = createInterface({ input: process.stdin, output: process.stdout });
const clientId = (await rl.question("Client ID: ")).trim();
const clientSecret = (await rl.question("Client Secret: ")).trim();
rl.close();

if (!clientId || !clientSecret) {
  console.error("\n❌ Chybí Client ID nebo Secret.");
  process.exit(1);
}

const authUrl =
  "https://accounts.google.com/o/oauth2/v2/auth?" +
  new URLSearchParams({
    client_id: clientId,
    redirect_uri: REDIRECT,
    response_type: "code",
    scope: SCOPE,
    access_type: "offline",
    prompt: "consent",
  });

const server = http.createServer(async (req, res) => {
  if (!req.url.startsWith("/callback")) { res.writeHead(404).end(); return; }

  const code = new URL(req.url, `http://localhost:${PORT}`).searchParams.get("code");
  if (!code) {
    res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" })
       .end("<h2>❌ Chybí kód. Zkus to znovu.</h2>");
    return;
  }

  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code, client_id: clientId, client_secret: clientSecret,
      redirect_uri: REDIRECT, grant_type: "authorization_code",
    }),
  });
  const data = await r.json();

  if (!data.refresh_token) {
    res.writeHead(500, { "Content-Type": "text/html; charset=utf-8" })
       .end(`<h2>❌ Nepřišel refresh token</h2><pre>${JSON.stringify(data, null, 2)}</pre>
             <p>Zkus to znovu — v Google účtu možná zruš dřívější přístup na
             <a href="https://myaccount.google.com/permissions">myaccount.google.com/permissions</a>.</p>`);
    console.error("\n❌ Odpověď Googlu:", data);
    server.close(); process.exit(1);
  }

  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }).end(
    `<body style="font-family:system-ui;max-width:560px;margin:60px auto;line-height:1.6">
     <h2>✅ Hotovo — můžeš zavřít okno</h2>
     <p>Refresh token se vypsal v terminálu.</p></body>`);

  console.log("\n\n✅ HOTOVO — zkopíruj tenhle blok a pošli ho Claudovi:\n");
  console.log("─".repeat(64));
  console.log(`GOOGLE_CLIENT_ID=${clientId}`);
  console.log(`GOOGLE_CLIENT_SECRET=${clientSecret}`);
  console.log(`GOOGLE_REFRESH_TOKEN=${data.refresh_token}`);
  console.log("─".repeat(64));
  console.log("\n⚠️  Je to heslo ke kalendáři — neposílej to nikam jinam.\n");

  server.close();
  setTimeout(() => process.exit(0), 300);
});

server.listen(PORT, () => {
  console.log(`\n🔓 Otevírám prohlížeč… (pokud ne, otevři ručně)\n\n${authUrl}\n`);
  const open = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
  exec(`${open} "${authUrl}"`);
  console.log("Čekám na souhlas v prohlížeči…");
});
