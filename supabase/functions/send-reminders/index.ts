// ============================================================================
// LarpersCRM — send-reminders Edge Function (Supabase / Deno)
//
// Runs on a schedule (see reminders-cron.sql). On each run it:
//   1. Finds upcoming appointments whose per-agent reminder window has arrived.
//   2. Finds Face-to-Face sessions that have been "waiting" a while.
//   3. Sends the agent an SMS (Twilio) and/or email (Resend) per their prefs.
//   4. Logs each send to reminder_log so it never sends the same one twice.
//
// It uses the SERVICE ROLE key, so it can read across all agents and write to
// reminder_log (bypassing RLS). Never expose this function's secrets client-side.
//
// Required function secrets (supabase secrets set ...):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY   (SUPABASE_URL is provided by the platform)
//   CRON_SECRET            — shared secret; the cron caller must send it as x-cron-secret
//   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM   — for SMS
//   RESEND_API_KEY, REMINDER_FROM_EMAIL                  — for email (e.g. "LarpersCRM <reminders@yourdomain.com>")
//
// Deploy with JWT verification off (it authenticates via CRON_SECRET instead):
//   supabase functions deploy send-reminders --no-verify-jwt
//
// NOTE ON TIME ZONES: appointments store a bare date + time with no zone. This
// function interprets them as UTC. If your agents work in a single local zone,
// set REMINDER_TZ_OFFSET_MINUTES (e.g. -300 for US Eastern) to shift them.
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";

const TWILIO_SID = Deno.env.get("TWILIO_ACCOUNT_SID") ?? "";
const TWILIO_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN") ?? "";
const TWILIO_FROM = Deno.env.get("TWILIO_FROM") ?? "";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const REMINDER_FROM_EMAIL = Deno.env.get("REMINDER_FROM_EMAIL") ?? "";

const TZ_OFFSET_MIN = parseInt(Deno.env.get("REMINDER_TZ_OFFSET_MINUTES") ?? "0", 10) || 0;

// How long a F2F session must sit in "waiting" before we nudge (minutes),
// and how far ahead we bother scanning appointments (days).
const F2F_WAIT_MINUTES = 15;
const APPT_SCAN_DAYS = 3;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false },
});

const PROFILE_COLS =
  "phone, reminder_via_sms, reminder_via_email, reminder_email, reminder_appt_enabled, reminder_appt_lead_minutes, reminder_f2f_enabled";

// --- helpers ----------------------------------------------------------------

function apptStartMs(appt: { appt_date: string; appt_time: string | null }): number {
  const t = (appt.appt_time ? String(appt.appt_time).slice(0, 5) : "09:00");
  const baseUtc = Date.parse(`${appt.appt_date}T${t}:00Z`);
  // Shift so the stored local time is treated as the configured zone.
  return baseUtc - TZ_OFFSET_MIN * 60 * 1000;
}

async function agentEmail(agentId: string, override: string | null): Promise<string | null> {
  if (override) return override;
  const { data, error } = await supabase.auth.admin.getUserById(agentId);
  if (error || !data?.user) return null;
  return data.user.email ?? null;
}

async function sendSms(to: string, body: string): Promise<boolean> {
  if (!TWILIO_SID || !TWILIO_TOKEN || !TWILIO_FROM) {
    console.warn("Twilio not configured; skipping SMS");
    return false;
  }
  const form = new URLSearchParams({ To: to, From: TWILIO_FROM, Body: body });
  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: "Basic " + btoa(`${TWILIO_SID}:${TWILIO_TOKEN}`),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form.toString(),
    },
  );
  if (!res.ok) console.error("Twilio error", res.status, await res.text());
  return res.ok;
}

async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  if (!RESEND_API_KEY || !REMINDER_FROM_EMAIL) {
    console.warn("Resend not configured; skipping email");
    return false;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: REMINDER_FROM_EMAIL, to, subject, html }),
  });
  if (!res.ok) console.error("Resend error", res.status, await res.text());
  return res.ok;
}

// Claim the (agent, kind, ref, channel) slot BEFORE contacting the provider.
// The unique index reminder_log_unique serializes this: exactly one caller can
// insert the row, so only that caller proceeds to send. Concurrent/overlapping
// cron runs lose the insert (Postgres error 23505) and skip — no double-send.
// Returns true only if THIS caller won the claim.
async function claimSend(agentId: string, kind: string, refId: string, channel: string): Promise<boolean> {
  const { error } = await supabase
    .from("reminder_log")
    .insert({ agent_id: agentId, kind, ref_id: refId, channel });
  if (!error) return true;                 // we inserted the row → we own this send
  if ((error as { code?: string }).code === "23505") return false; // already claimed/sent
  // Unknown error: don't send (avoid duplicate risk); it'll be retried next run.
  console.error("claimSend error", error);
  return false;
}

// Release a claim after a failed send so the next scheduled run can retry it.
async function releaseClaim(agentId: string, kind: string, refId: string, channel: string): Promise<void> {
  const { error } = await supabase
    .from("reminder_log")
    .delete()
    .eq("agent_id", agentId)
    .eq("kind", kind)
    .eq("ref_id", refId)
    .eq("channel", channel);
  if (error) console.error("releaseClaim error", error);
}

// Deliver one reminder across the agent's enabled channels; returns channels sent.
// Each channel is claimed first (idempotent + concurrency-safe), then sent; a
// failed send releases the claim so it retries on the next run.
async function deliver(
  prof: any,
  agentId: string,
  kind: string,
  refId: string,
  smsBody: string,
  emailSubject: string,
  emailHtml: string,
): Promise<string[]> {
  const sent: string[] = [];

  if (prof.reminder_via_sms && prof.phone) {
    if (await claimSend(agentId, kind, refId, "sms")) {
      if (await sendSms(prof.phone, smsBody)) {
        sent.push("sms");
      } else {
        await releaseClaim(agentId, kind, refId, "sms");
      }
    }
  }

  if (prof.reminder_via_email) {
    if (await claimSend(agentId, kind, refId, "email")) {
      const to = await agentEmail(agentId, prof.reminder_email);
      if (to && await sendEmail(to, emailSubject, emailHtml)) {
        sent.push("email");
      } else {
        await releaseClaim(agentId, kind, refId, "email");
      }
    }
  }

  return sent;
}

// --- main -------------------------------------------------------------------

async function run(): Promise<{ appointments: number; f2f: number; channels: number }> {
  const now = Date.now();
  const summary = { appointments: 0, f2f: 0, channels: 0 };

  // ---- Appointment reminders ----
  const todayIso = new Date(now).toISOString().slice(0, 10);
  const horizonIso = new Date(now + APPT_SCAN_DAYS * 86400_000).toISOString().slice(0, 10);

  const { data: appts, error: apptErr } = await supabase
    .from("appointments")
    .select(`id, agent_id, title, appt_date, appt_time, profiles:agent_id ( ${PROFILE_COLS} )`)
    .gte("appt_date", todayIso)
    .lte("appt_date", horizonIso);

  if (apptErr) console.error("appointments query error", apptErr);

  for (const a of appts ?? []) {
    const prof: any = Array.isArray(a.profiles) ? a.profiles[0] : a.profiles;
    if (!prof || prof.reminder_appt_enabled === false) continue;

    const startMs = apptStartMs(a);
    if (isNaN(startMs)) continue;
    const lead = (prof.reminder_appt_lead_minutes ?? 1440) * 60 * 1000;
    const windowOpen = startMs - lead;
    // Within the lead window and not yet started.
    if (now < windowOpen || now >= startMs) continue;

    const when = new Date(startMs).toUTCString();
    const smsBody = `Reminder: "${a.title}" is coming up (${when}). — LarpersCRM`;
    const emailHtml =
      `<p>Hi,</p><p>This is a reminder that your appointment <strong>${escapeHtml(a.title)}</strong> ` +
      `is coming up on <strong>${when}</strong>.</p><p>— LarpersCRM</p>`;

    const sent = await deliver(prof, a.agent_id, "appointment", a.id, smsBody, `Reminder: ${a.title}`, emailHtml);
    if (sent.length) { summary.appointments++; summary.channels += sent.length; }
  }

  // ---- Waiting Face-to-Face reminders ----
  const waitingCutoff = new Date(now - F2F_WAIT_MINUTES * 60_000).toISOString();
  const { data: sessions, error: sErr } = await supabase
    .from("f2f_sessions")
    .select(`id, agent_id, client_name, contact, status, created_at, profiles:agent_id ( ${PROFILE_COLS} )`)
    .eq("status", "waiting")
    .lte("created_at", waitingCutoff);

  if (sErr) console.error("f2f query error", sErr);

  for (const s of sessions ?? []) {
    const prof: any = Array.isArray(s.profiles) ? s.profiles[0] : s.profiles;
    if (!prof || prof.reminder_f2f_enabled === false) continue;

    const smsBody = `Reminder: your Face-to-Face session with ${s.client_name} is still waiting. — LarpersCRM`;
    const emailHtml =
      `<p>Hi,</p><p>Your Face-to-Face session with <strong>${escapeHtml(s.client_name)}</strong> ` +
      `is still marked as waiting.</p><p>— LarpersCRM</p>`;

    const sent = await deliver(prof, s.agent_id, "f2f", s.id, smsBody, "A session is still waiting", emailHtml);
    if (sent.length) { summary.f2f++; summary.channels += sent.length; }
  }

  return summary;
}

function escapeHtml(str: string): string {
  return String(str ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" } as Record<string, string>)[c]
  );
}

Deno.serve(async (req) => {
  // Authenticate the caller via the shared cron secret.
  if (!CRON_SECRET || req.headers.get("x-cron-secret") !== CRON_SECRET) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const summary = await run();
    return new Response(JSON.stringify({ ok: true, ...summary }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("send-reminders failed", e);
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
