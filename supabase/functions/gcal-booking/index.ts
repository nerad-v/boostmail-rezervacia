// ============================================================
// gcal-booking — Supabase Edge Function
//
// Spouští se DB webhookem po INSERT do sk_bookings a:
//  1. vytvoří událost ve Vojtově Google Kalendáři
//  2. přidá klienta jako attendee → Google mu SÁM pošle pozvánku
//  3. vygeneruje Google Meet link
//  4. uloží gcal_event_id + meet_link zpět k rezervaci
//
// Stejný pattern jako Cal.com / Calendly (events.insert + sendUpdates=all).
//
// SECRETS (Supabase → Edge Functions → Secrets):
//  GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN
//  (SUPABASE_URL a SUPABASE_SERVICE_ROLE_KEY injektuje Supabase sám)
//
// HEALTH CHECK:  GET /gcal-booking  → vypíše, co chybí
// ============================================================

const CAL_ID = "primary";
const REQUIRED = ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REFRESH_TOKEN"];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function missingSecrets() {
  return REQUIRED.filter((k) => !Deno.env.get(k));
}

// jen service_role smí volat (anon klíč projde verify_jwt, ale sem ne)
function isServiceRole(req: Request) {
  const t = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!t) return false;
  try {
    const p = JSON.parse(atob(t.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return p.role === "service_role";
  } catch { return false; }
}

async function accessToken(): Promise<string> {
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: Deno.env.get("GOOGLE_CLIENT_ID")!,
      client_secret: Deno.env.get("GOOGLE_CLIENT_SECRET")!,
      refresh_token: Deno.env.get("GOOGLE_REFRESH_TOKEN")!,
      grant_type: "refresh_token",
    }),
  });
  if (!r.ok) throw new Error(`google token ${r.status}: ${await r.text()}`);
  return (await r.json()).access_token;
}

Deno.serve(async (req) => {
  // --- health check ---
  if (req.method === "GET") {
    const missing = missingSecrets();
    return json({
      ok: missing.length === 0,
      status: missing.length ? "chybí secrets" : "připraveno",
      missing,
      hint: missing.length ? "Supabase → Edge Functions → gcal-booking → Secrets" : undefined,
    });
  }

  if (!isServiceRole(req)) return json({ ok: false, error: "forbidden" }, 403);

  const missing = missingSecrets();
  if (missing.length) return json({ ok: false, error: "missing secrets", missing }, 500);

  try {
    const payload = await req.json();
    const b = payload.record ?? payload;
    if (!b?.slot_start || !b?.id) return json({ ok: false, error: "no record" }, 400);

    const token = await accessToken();

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
      `https://www.googleapis.com/calendar/v3/calendars/${CAL_ID}/events` +
        `?conferenceDataVersion=1&sendUpdates=all`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(event),
      },
    );
    if (!r.ok) throw new Error(`gcal ${r.status}: ${await r.text()}`);
    const created = await r.json();

    // zapiš zpět k rezervaci
    await fetch(`${Deno.env.get("SUPABASE_URL")}/rest/v1/sk_bookings?id=eq.${b.id}`, {
      method: "PATCH",
      headers: {
        apikey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
        Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({ gcal_event_id: created.id, meet_link: created.hangoutLink ?? null }),
    });

    return json({ ok: true, eventId: created.id, meet: created.hangoutLink });
  } catch (e) {
    console.error("gcal-booking:", e);
    return json({ ok: false, error: String(e) }, 500);
  }
});
