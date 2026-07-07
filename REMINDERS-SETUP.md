# Reminders — setup guide

The Settings page lets each agent choose how they get reminders (**text**, **email**, or both) and
when. Actually *sending* those reminders on a schedule runs in a small Supabase Edge Function —
this guide gets it live. One-time setup, ~20 minutes.

There are 4 steps: **database → accounts → deploy → schedule.** The Settings page already works
after step 1; steps 2–4 turn on delivery.

---

## 1. Database (required for the Settings page to save preferences)

Supabase Dashboard → **SQL Editor** → paste and run [`reminders-migration.sql`](reminders-migration.sql).

This adds the reminder-preference columns to `profiles` and creates the `reminder_log` table
(so an agent is never reminded twice for the same thing). Until this runs, the Settings page shows a
note and won't save the reminder section (the profile section still works).

---

## 2. Provider accounts (for actual delivery)

**SMS — Twilio**
1. Create a Twilio account and buy/verify a phone number.
2. Grab your **Account SID**, **Auth Token**, and the **From** number (E.164, e.g. `+18885551234`).
3. Trial accounts can only text *verified* numbers, and US A2P 10DLC registration is required before
   texting real customers at volume — fine for testing to your own verified phone first.

**Email — Resend**
1. Create a Resend account and verify a sending domain (or use their test sender to start).
2. Create an **API key**.
3. Pick a from address, e.g. `LarpersCRM <reminders@yourdomain.com>`.

---

## 3. Deploy the function

Install the Supabase CLI and, from the project root:

```bash
supabase login
supabase link --project-ref <YOUR-PROJECT-REF>

# Set secrets (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically)
supabase secrets set \
  CRON_SECRET="<make-up-a-long-random-string>" \
  TWILIO_ACCOUNT_SID="ACxxxxxxxx" \
  TWILIO_AUTH_TOKEN="xxxxxxxx" \
  TWILIO_FROM="+18885551234" \
  RESEND_API_KEY="re_xxxxxxxx" \
  REMINDER_FROM_EMAIL="LarpersCRM <reminders@yourdomain.com>"
# Optional: if agents work in one local zone, e.g. US Eastern is -300
#   REMINDER_TZ_OFFSET_MINUTES="-300"

# Deploy (auth is via CRON_SECRET, so JWT verification is off)
supabase functions deploy send-reminders --no-verify-jwt
```

Smoke-test it manually (should return JSON counts, and text/email you if you have a due reminder):

```bash
curl -i -X POST \
  -H "x-cron-secret: <YOUR-CRON-SECRET>" \
  https://<YOUR-PROJECT-REF>.supabase.co/functions/v1/send-reminders
```

A wrong/missing `x-cron-secret` returns `401` — that's expected; it's what keeps the endpoint private.

---

## 4. Schedule it

Supabase Dashboard → **SQL Editor** → run [`reminders-cron.sql`](reminders-cron.sql) after replacing
`<YOUR-PROJECT-REF>` and `<YOUR-CRON-SECRET>`. It runs the function every 15 minutes via `pg_cron`.

---

## How it decides what to send

- **Appointments:** for each upcoming appointment, once "now" is within the agent's chosen lead time
  (e.g. 1 day before) and the appointment hasn't started, it sends on the agent's enabled channels.
- **Waiting F2F sessions:** if a session has been `waiting` for more than 15 minutes, it nudges once.
- Every send is recorded in `reminder_log`, so re-runs never double-send.

### Notes / knobs
- **Time zones:** appointment date+time are stored without a zone and treated as UTC. If your agents
  are all in one zone, set `REMINDER_TZ_OFFSET_MINUTES`. True per-agent time zones would need a
  `timezone` column on `profiles` (easy follow-up).
- **SMS phone number:** comes from the agent's profile phone (set on the Settings page). No phone →
  email only.
- **Channels off:** if an agent unchecks both channels, they get nothing — by design.
