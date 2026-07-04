# LarpersCRM — Multi-User Edition

**LarpersCRM** is a modern, self-contained CRM for insurance agents focused on final expense (FEX) sales. This is the **multi-user, web-hosted version** powered by Supabase.

---

## What's Included

- **`larperscrm-dashboard.html`** — Main app (dark-themed, feature-rich)
- **`src/supabase-client.js`** — Supabase integration (auth + REST API)
- **`src/auth-screens.js`** — Login/signup UI
- **`SETUP.md`** — Step-by-step deployment guide
- **`src/features-migration-guide.md`** — How to wire features to live data
- **`larperscrm-schema.sql`** — PostgreSQL schema (included in root)

---

## Quick Start

### 1. Create a Supabase Project

1. Go to [supabase.com](https://supabase.com) and create a free account
2. Click "New Project" and follow the setup
3. Note your **Project URL** and **Anon Key** (you'll need these)

### 2. Deploy the Database

1. In your Supabase project, go to **SQL Editor**
2. Create a new query
3. Copy the entire contents of `larperscrm-schema.sql`
4. Paste and click **Run**

Your database is now ready with full RLS (row-level security) policies.

### 3. Configure the App

Edit `src/supabase-client.js`:

```javascript
const SUPABASE_URL = 'https://YOUR_PROJECT_ID.supabase.co';
const SUPABASE_ANON_KEY = 'YOUR_ANON_KEY';
```

### 4. Add Scripts to HTML

In `larperscrm-dashboard.html`, add these lines in the `<head>`:

```html
<script src="src/supabase-client.js"></script>
<script src="src/auth-screens.js"></script>
```

### 5. Deploy to a Static Host

Choose one:

- **Cloudflare Pages** (Recommended)
- **Netlify**
- **Vercel**

See `SETUP.md` for detailed instructions.

### 6. Test

1. Open your deployed app
2. Sign up with a test email
3. You should see the dashboard

**Success!** Your agents can now create accounts and access the CRM.

---

## Architecture

```
┌─────────────────────────────────────┐
│  LarpersCRM Web App                 │
│  (HTML/JS - Cloudflare/Netlify)     │
├─────────────────────────────────────┤
│  Authentication (Supabase Auth)     │
│  REST API Client                    │
│  Per-page Features                  │
└──────────────┬──────────────────────┘
               │ HTTPS
               ↓
┌─────────────────────────────────────┐
│  Supabase Backend                   │
│  ├─ PostgreSQL Database             │
│  ├─ Auth (email + password)         │
│  └─ RLS Policies (agent isolation)  │
└─────────────────────────────────────┘
```

---

## Feature Status

| Feature | Status | Notes |
|---------|--------|-------|
| **Authentication** | ✅ Done | Login/signup with Supabase Auth |
| **My Policies** | 🔄 In Progress | Migrating to live data |
| **Lead Batches** | ⏳ Pending | Depends on My Policies |
| **Carriers (HCMS)** | ⏳ Pending | Read/write `carrier_appointments` |
| **Calendar** | ⏳ Pending | Read/write `appointments` |
| **Call Recordings** | ⏳ Pending | File storage integration |
| **Face-to-Face** | ⏳ Pending | Read/write `f2f_sessions` |
| **Compensation** | ⏳ Pending | Reference-only, no live writes |
| **Settings** | ⏳ Pending | Profile/preferences updates |

---

## Data Isolation

Every agent sees **only their own data** thanks to PostgreSQL Row-Level Security (RLS):

```
Agent A logs in
  ├─ Sees Agent A's policies
  ├─ Sees Agent A's leads
  └─ Sees Agent A's calendar

Agent B logs in
  ├─ Sees ONLY Agent B's policies (not A's)
  ├─ Sees ONLY Agent B's leads (not A's)
  └─ Sees ONLY Agent B's calendar (not A's)
```

This is enforced at the database level — no special UI code needed.

---

## Migrating Features

To wire a feature to live Supabase data, see `src/features-migration-guide.md`.

**Example:** Migrating "My Policies"
1. Replace hard-coded policy array with `await db.query('policies')`
2. Update add/edit/delete handlers to use `db.insert()`, `db.update()`, `db.delete()`
3. Test with multiple agents to verify isolation

---

## Testing

### Local Testing

```bash
# Start a local web server
python3 -m http.server 3000

# Open http://localhost:3000/larperscrm-dashboard.html
```

**Note:** You still need a real Supabase project (even for local testing) because the app uses Supabase's auth and API.

### Multi-Agent Testing

1. Create two test accounts in Supabase
2. Log in as Agent A, add a policy
3. Log out, log in as Agent B
4. Verify Agent B does NOT see Agent A's policy

---

## Common Tasks

### Change the app name

Edit the logo in `auth-screens.js` and the `<title>` in `larperscrm-dashboard.html`.

### Add a new field to a table

1. Modify the table schema in Supabase SQL Editor
2. Update the form in the relevant feature
3. Update the render logic to display the new field

### Reset all data

1. In Supabase, go to **SQL Editor**
2. Run `DELETE FROM public.profiles;` (cascades to all related tables)
3. This removes all agent accounts and their data

### Update RLS policies

Advanced: See `larperscrm-schema.sql` for examples. Modify in Supabase's "Authentication" > "Policies" UI.

---

## Troubleshooting

### "Network error" or "404" on login

**Problem:** The Supabase credentials are wrong or the project is offline.

**Solution:**
1. Check `SUPABASE_URL` and `SUPABASE_ANON_KEY` in `supabase-client.js`
2. Verify your Supabase project is running (go to [supabase.com](https://supabase.com))

### "RLS policy violation" error

**Problem:** You're trying to access or modify a row you don't own.

**Solution:** This should not happen if the app is working correctly. If it does:
1. Check that `agent_id` is being set correctly in inserts
2. Verify RLS policies in Supabase

### Agents can see each other's data

**Problem:** RLS is not enforced properly.

**Solution:**
1. Check that all tables have `enable row level security;` in the schema
2. Verify policies use `auth.uid()` correctly
3. Re-run the entire `larperscrm-schema.sql` in a fresh Supabase project

---

## Deployment Checklist

- [ ] Supabase project created
- [ ] Schema deployed (`larperscrm-schema.sql` executed)
- [ ] Credentials updated in `supabase-client.js`
- [ ] Scripts linked in `larperscrm-dashboard.html`
- [ ] App deployed to Cloudflare Pages / Netlify / Vercel
- [ ] Sign-up tested (create account)
- [ ] Login tested (log in as the account)
- [ ] Data isolation tested (two agents see different data)
- [ ] Features migrated (at least My Policies)

---

## Production Readiness

Before deploying to real agents:

- [ ] Email verification enabled in Supabase
- [ ] Password reset flow tested
- [ ] HTTPS enabled (automatic with hosting services)
- [ ] Error logging set up
- [ ] Backups configured in Supabase
- [ ] Agent onboarding documentation written
- [ ] Support contact info provided

---

## Support & Contact

Questions? Contact your upline or submit an issue.

---

## License

Proprietary — Larpers Financial / Alibi Agencies

---

## Roadmap

- **v1.0** — Auth + My Policies live (current)
- **v1.1** — All core features (Leads, Carriers, Calendar) migrated to live data
- **v1.2** — Upline visibility / team hierarchy
- **v2.0** — Mobile app, advanced analytics, integrations with AlibiCRM
