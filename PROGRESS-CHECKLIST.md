# LarpersCRM Multi-User — Progress Checklist

Use this to track your progress through the deployment.

---

## Phase 1: Setup (Do This First)

### Supabase Project Creation
- [ ] Go to [supabase.com](https://supabase.com)
- [ ] Sign up or log in
- [ ] Create a new project named `larperscrm`
- [ ] Wait for provisioning (~2 minutes)
- [ ] Note the **Project URL** (save it somewhere)
- [ ] Note the **Anon Key** (save it somewhere)

### Database Deployment
- [ ] Go to **SQL Editor** in your Supabase project
- [ ] Create a new query
- [ ] Open `larperscrm-schema.sql`
- [ ] Copy the entire file
- [ ] Paste into Supabase SQL Editor
- [ ] Click **Run**
- [ ] See "Query executed successfully" ✓

### Credentials Update
- [ ] Open `src/supabase-client.js`
- [ ] Find `const SUPABASE_URL = 'https://YOUR_PROJECT_ID.supabase.co';`
- [ ] Replace with your actual Project URL
- [ ] Find `const SUPABASE_ANON_KEY = 'YOUR_ANON_KEY';`
- [ ] Replace with your actual Anon Key
- [ ] Save the file

### HTML Integration
- [ ] Open `larperscrm-dashboard.html`
- [ ] Find the `<head>` section
- [ ] Add these two lines (before `</head>`):
  ```html
  <script src="src/supabase-client.js"></script>
  <script src="src/auth-screens.js"></script>
  ```
- [ ] Save the file

### Local Testing
- [ ] Run `python3 -m http.server 3000` in the project directory
- [ ] Open `http://localhost:3000/larperscrm-dashboard.html`
- [ ] You should see the **Login** screen
- [ ] Try signing up with a test email
- [ ] After signup, you should see the **Dashboard**
- [ ] ✅ Authentication works locally

---

## Phase 2: Web Deployment (Do This Second)

### Choose a Host

- [ ] **Option A:** Cloudflare Pages (recommended)
  - [ ] Push repo to GitHub
  - [ ] Go to [pages.cloudflare.com](https://pages.cloudflare.com)
  - [ ] Connect to your repo
  - [ ] Deploy

- [ ] **Option B:** Netlify (easiest)
  - [ ] Drag project folder to [netlify.com](https://netlify.com)
  - [ ] Deploy

- [ ] **Option C:** Vercel
  - [ ] Push to GitHub
  - [ ] Import at [vercel.com](https://vercel.com)
  - [ ] Deploy

### Post-Deployment Testing
- [ ] Get your live URL (e.g., `https://larperscrm.pages.dev`)
- [ ] Open the live URL in a browser
- [ ] You see the **Login** screen ✓
- [ ] Sign up with a test email ✓
- [ ] Dashboard loads ✓
- [ ] Log out ✓
- [ ] Log back in ✓
- [ ] Create a second test account
- [ ] Log in as the second account
- [ ] Verify you see an empty dashboard (good — different agent)

### Multi-Agent Data Isolation Test
- [ ] Log out completely
- [ ] Log in as **Agent A** (first test account)
- [ ] In your browser console, run: `await db.query('policies');`
  - Should return `[]` (empty, no policies yet)
- [ ] Log out
- [ ] Log in as **Agent B** (second test account)
- [ ] In console, run: `await db.query('policies');`
  - Should still return `[]` (Agent B's empty policies)
- [ ] ✅ Data isolation works

---

## Phase 3: Feature Migration (Start With My Policies)

### My Policies Setup
- [ ] Read `src/features-migration-guide.md`
- [ ] Understand the migration pattern
- [ ] Find the "My Policies" page in `larperscrm-dashboard.html`
- [ ] Locate the hard-coded `policies` array

### Create Load Function
- [ ] Add `loadMyPolicies()` function (see guide)
- [ ] Function should call `await db.query('policies')`
- [ ] Function should render live data
- [ ] Test locally: dashboard shows empty policies list

### Create Add Handler
- [ ] Create `addPolicy()` function
- [ ] Function should call `await db.insert('policies', {...})`
- [ ] Function should refresh the list after insert
- [ ] Test: add a policy, see it appear

### Create Edit Handler
- [ ] Create `editPolicy()` function
- [ ] Create `saveEditedPolicy()` function
- [ ] Use `await db.update('policies', id, {...})`
- [ ] Test: edit a policy, see changes

### Create Delete Handler
- [ ] Create `deletePolicy()` function
- [ ] Use `await db.delete('policies', id)`
- [ ] Test: delete a policy, see it removed

### Test Multi-Agent Isolation
- [ ] Log in as **Agent A**
- [ ] Add a policy titled "Policy A"
- [ ] See it in the list
- [ ] Log out
- [ ] Log in as **Agent B**
- [ ] Dashboard should NOT show "Policy A"
- [ ] ✅ Feature migration complete

---

## Phase 4: Deploy & Document

### Redeploy
- [ ] Commit all changes to Git
- [ ] Push to your repo
- [ ] Your hosting service auto-deploys
- [ ] Test live deployment again

### Documentation
- [ ] Update `README.md` with live URL
- [ ] Update feature status table (mark My Policies as ✅ Done)
- [ ] Document any customizations you made
- [ ] Create a runbook for future agents

### Prepare for Real Agents
- [ ] Enable email verification in Supabase (Settings > Auth)
- [ ] Test password reset flow
- [ ] Document signup process
- [ ] Create FAQ for agents

---

## Phase 5: Remaining Features

After My Policies, migrate features in this order:

### Lead Batches & Leads
- [ ] Create `loadLeadBatches()` function
- [ ] Create lead CRUD handlers
- [ ] Test multi-agent isolation
- [ ] Deploy

### Carriers (HCMS)
- [ ] Create `loadCarriers()` function
- [ ] Create carrier CRUD handlers
- [ ] Test multi-agent isolation
- [ ] Deploy

### Calendar
- [ ] Create `loadAppointments()` function
- [ ] Create appointment CRUD handlers
- [ ] Test multi-agent isolation
- [ ] Deploy

### Face-to-Face
- [ ] Create `loadF2F()` function
- [ ] Create session handlers
- [ ] Test multi-agent isolation
- [ ] Deploy

### Call Recordings
- [ ] Evaluate storage options (Supabase Storage, Cloudflare R2)
- [ ] Integrate upload handler
- [ ] Test multi-agent isolation
- [ ] Deploy

### Remaining Features
- [ ] Lead Flow, Integrations, etc.

---

## Validation Checklist (Do Before Going Live)

- [ ] ✅ Authentication works (signup/login)
- [ ] ✅ Data isolation confirmed (two agents see different data)
- [ ] ✅ At least 1 feature migrated (My Policies)
- [ ] ✅ HTTPS enabled (automatic with hosting)
- [ ] ✅ Error messages are clear
- [ ] ✅ Tested on desktop AND mobile
- [ ] ✅ Tested with real agent workflows
- [ ] ✅ Backup plan if database goes down

---

## Live Launch Checklist

When you're ready to give agents access:

- [ ] Email verification enabled in Supabase
- [ ] Password reset works
- [ ] Support contact info provided
- [ ] Agent onboarding doc written
- [ ] Flywheel scheduled (kick-off call with agents)
- [ ] Monitoring set up (error alerts)
- [ ] Backup scheduled daily

---

## Notes

Use this section to track any blockers or decisions:

```
[Date] - Issue: [description]
        - Solution: [what you did]

[Date] - Feature: [name]
        - Status: [In Progress / Blocked / Complete]
        - Notes: [any relevant details]
```

---

## Completed

- ✅ Project scaffolding created
- ✅ Authentication system built
- ✅ Supabase client library written
- ✅ Database schema with RLS ready
- ✅ Documentation complete
- ✅ Handed to Dallas for Supabase setup

---

**Next action:** Complete Phase 1 (Setup) and let me know when you're done. I'll help with Phase 3 (Feature Migration).
