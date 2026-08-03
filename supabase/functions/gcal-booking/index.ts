// ============================================================
// gcal-booking — Supabase Edge Function
//
// Spouští DB trigger (trg_sk_booking_to_gcal) po INSERT do sk_bookings:
//  1. vytvoří událost ve Vojtově Google Kalendáři
//  2. přidá klienta jako attendee + sendUpdates=all
//     → Google mu SÁM pošle pozvánku → padá mu do jeho kalendáře
//  3. vygeneruje Google Meet link
//  4. pošle Vojtovi notifikační e-mail přes Gmail API
//  5. uloží gcal_event_id + meet_link zpět k rezervaci
//
// AUTENTIZACE: sdílený klíč v hlavičce x-gcal-secret (obojestranně z Vaultu)
// PŘIHLAŠOVACÍ ÚDAJE: Supabase Vault
// HEALTH CHECK: GET /gcal-booking
// ============================================================

const CAL_ID = "primary";
const NOTIFY_TO = "nerad@boostmail.cz";
const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });

async function sb(path: string, init: RequestInit = {}) {
  return fetch(`${SB_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
}

async function secrets(): Promise<Record<string, string>> {
  const r = await sb("rpc/gcal_secrets", { method: "POST", body: "{}" });
  if (!r.ok) throw new Error(`vault ${r.status}: ${await r.text()}`);
  const out: Record<string, string> = {};
  for (const row of await r.json()) out[row.name] = row.secret;
  return out;
}

async function accessToken(s: Record<string, string>): Promise<string> {
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: s.GOOGLE_CLIENT_ID,
      client_secret: s.GOOGLE_CLIENT_SECRET,
      refresh_token: s.GOOGLE_REFRESH_TOKEN,
      grant_type: "refresh_token",
    }),
  });
  if (!r.ok) throw new Error(`google token ${r.status}: ${await r.text()}`);
  return (await r.json()).access_token;
}

const fmtSK = (iso: string) =>
  new Intl.DateTimeFormat("sk-SK", {
    timeZone: "Europe/Bratislava", weekday: "long", day: "numeric",
    month: "long", hour: "2-digit", minute: "2-digit",
  }).format(new Date(iso));

// base64url pro Gmail API
function b64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
// RFC 2047 — diakritika v předmětu
const encSubject = (s: string) => `=?UTF-8?B?${btoa(String.fromCharCode(...new TextEncoder().encode(s)))}?=`;

async function notifyVojta(token: string, b: any, meet: string | null, eventLink: string | null) {
  const kdy = fmtSK(b.slot_start);
  const subject = `Nová rezervácia: ${b.name} (${b.barbershop}) — ${kdy}`;

  const row = (k: string, v: string) =>
    `<tr><td style="padding:6px 14px 6px 0;color:#666;white-space:nowrap">${k}</td>` +
    `<td style="padding:6px 0;font-weight:600">${v}</td></tr>`;

  const html =
    `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;color:#0a0a0a">` +
    `<h2 style="margin:0 0 4px;font-size:19px">📅 Nová rezervácia</h2>` +
    `<p style="margin:0 0 18px;color:#666;font-size:15px">${kdy} · 15 minút</p>` +
    `<table style="border-collapse:collapse;font-size:15px;width:100%">` +
    row("Meno", b.name) +
    row("Telefón", `<a href="tel:${String(b.phone).replace(/\s/g, "")}" style="color:#1a5ada">${b.phone}</a>`) +
    row("E-mail", b.email ? `<a href="mailto:${b.email}" style="color:#1a5ada">${b.email}</a>` : "—") +
    row("Barbershop", b.barbershop) +
    row("Rezervák", b.resys) +
    (b.link ? row("Odkaz", `<a href="${b.link}" style="color:#1a5ada">${b.link}</a>`) : "") +
    (b.utm?.utm_campaign ? row("Kampaň", String(b.utm.utm_campaign)) : "") +
    (b.utm?.utm_content ? row("Reklama", String(b.utm.utm_content)) : "") +
    `</table>` +
    (meet ? `<p style="margin:18px 0 0"><a href="${meet}" style="background:#1a5ada;color:#fff;text-decoration:none;padding:11px 20px;border-radius:999px;display:inline-block;font-weight:600">Otvoriť Google Meet</a></p>` : "") +
    (eventLink ? `<p style="margin:12px 0 0;font-size:13px"><a href="${eventLink}" style="color:#666">Zobraziť v kalendári</a></p>` : "") +
    `</div>`;

  const mime = [
    `From: ${NOTIFY_TO}`,
    `To: ${NOTIFY_TO}`,
    b.email ? `Reply-To: ${b.email}` : "",
    `Subject: ${encSubject(subject)}`,
    "MIME-Version: 1.0",
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    b64url(new TextEncoder().encode(html)).replace(/-/g, "+").replace(/_/g, "/"),
  ].filter(Boolean).join("\r\n");

  const r = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ raw: b64url(new TextEncoder().encode(mime)) }),
  });
  if (!r.ok) throw new Error(`gmail ${r.status}: ${await r.text()}`);
  return true;
}

Deno.serve(async (req) => {
  if (req.method === "GET") {
    try {
      const s = await secrets();
      const missing = ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REFRESH_TOKEN", "GCAL_WEBHOOK_SECRET"]
        .filter((k) => !s[k]);
      if (missing.length) return json({ ok: false, status: "chyba vo Vaulte", missing });
      const t = await accessToken(s);
      // overenie rozsahov tokenu
      const ti = await (await fetch(`https://oauth2.googleapis.com/tokeninfo?access_token=${t}`)).json();
      const scopes = String(ti.scope ?? "");
      return json({
        ok: true,
        status: "pripravene",
        kalendar: scopes.includes("calendar.events") ? "OK" : "CHÝBA",
        gmail: scopes.includes("gmail.send") ? "OK" : "CHÝBA — treba znovu odsúhlasiť",
      });
    } catch (e) {
      return json({ ok: false, error: String(e) }, 500);
    }
  }

  try {
    const s = await secrets();

    const given = req.headers.get("x-gcal-secret") ?? "";
    const want = s.GCAL_WEBHOOK_SECRET ?? "";
    if (!want || given.length !== want.length || given !== want) {
      return json({ ok: false, error: "forbidden" }, 403);
    }

    const payload = await req.json();
    const b = payload.record ?? payload;
    if (!b?.slot_start || !b?.id) return json({ ok: false, error: "no record" }, 400);

    const token = await accessToken(s);

    const event = {
      summary: `Koľko peňazí vám leží v kalendári? — ${b.name} (${b.barbershop})`,
      description:
        `Rezervácia z reklamy (SK).\n\n` +
        `Telefón: ${b.phone}\n` +
        `E-mail: ${b.email ?? "—"}\n` +
        `Rezervák: ${b.resys}\n` +
        (b.link ? `Odkaz: ${b.link}\n` : "") +
        (b.utm ? `\nKampaň: ${JSON.stringify(b.utm)}` : ""),
      start: { dateTime: b.slot_start, timeZone: "Europe/Bratislava" },
      end: { dateTime: b.slot_end, timeZone: "Europe/Bratislava" },
      attendees: b.email ? [{ email: b.email, displayName: b.name }] : [],
      conferenceData: {
        createRequest: { requestId: b.id, conferenceSolutionKey: { type: "hangoutsMeet" } },
      },
      reminders: {
        useDefault: false,
        overrides: [
          { method: "popup", minutes: 60 },
          { method: "email", minutes: 24 * 60 },
        ],
      },
    };

    const r = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${CAL_ID}/events?conferenceDataVersion=1&sendUpdates=all`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(event),
      },
    );
    if (!r.ok) throw new Error(`gcal ${r.status}: ${await r.text()}`);
    const created = await r.json();

    // notifikácia Vojtovi — nesmie zhodiť zvyšok, keď zlyhá
    let mailed = false, mailErr: string | null = null;
    try {
      await notifyVojta(token, b, created.hangoutLink ?? null, created.htmlLink ?? null);
      mailed = true;
    } catch (e) {
      mailErr = String(e);
      console.error("notify:", e);
    }

    await sb(`sk_bookings?id=eq.${b.id}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ gcal_event_id: created.id, meet_link: created.hangoutLink ?? null }),
    });

    return json({ ok: true, eventId: created.id, meet: created.hangoutLink, mailed, mailErr });
  } catch (e) {
    console.error("gcal-booking:", e);
    return json({ ok: false, error: String(e) }, 500);
  }
});
