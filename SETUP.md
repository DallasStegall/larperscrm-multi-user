# LarpersCRM Multi-User Deployment Guide

## Overview

LarpersCRM is transitioning from a single self-contained HTML file to a **full-stack multi-user web application** with:
- **Backend:** Supabase (PostgreSQL + Auth + RLS)
- **Frontend:** HTML/JS with per-agent data isolation
- **Hosting:** Static host (Cloudflare Pages, Netlify, or Vercel) + Supabase backend

This guide walks you through the setup process.

---

## Step 1: Create a Supabase Project

### 1.1 Sign Up for Supabase

1. Go to [supabase.com](https://supabase.com)
2. Click **"Start your project"** or sign in if you have an account
3. Click **"New Project"** or **"Create a new project"**

### 1.2 Create Your Project

- **Project Name:** `larperscrm` (or your preferred name)
- **Database Password:** Create a strong password (you'll need this once, then Supabase manages it)
- **Region:** Choose a region close to your agents (US East or US Central recommended)
- Click **"Create new project"**

Supabase will provision your project. This takes ~2 minutes.

### 1.3 Get Your Credentials

Once your project is created:

1. Go to **Settings** > **API**
2. You'll see:
   - **Project URL** (e.g., `https://xxxxx.supabase.co`)
   - **Anon Key** (public, safe to embed in frontend)
   - **Service Role Key** (keep secret — only for backend/CLI)

3. **Copy the Project URL and Anon Key.** You'll need these in Step 2.

---

## Step 2: Deploy the Database Schema

### 2.1 Open the SQL Editor

1. In your Supabase project, go to **SQL Editor** (left sidebar)
2. Click **"New Query"** or **"New SQL"**

### 2.2 Paste the Schema

1. Open the file `larperscrm-schema.sql` (provided in the project files)
2. Copy the entire contents
3. Paste it into the Supabase SQL editor
4. Click **"Run"** (or press `Ctrl+Enter`)

You should see:
```
✓ Query executed successfully
```

This creates all the tables, RLS policies, and the auto-profile-creation trigger. **Your database is now ready.**

---

## Step 3: Prepare the Frontend

### 3.1 Get the Files

The multi-user app consists of:
- `src/supabase-client.js` — Supabase integration
- `src/auth-screens.js` — Login/signup UI
- `larperscrm-dashboard.html` — Main app (will be updated to use live data)

### 3.2 Update Credentials

In `src/supabase-client.js`, find these lines at the top:

```javascript
const SUPABASE_URL = 'https://YOUR_PROJECT_ID.supabase.co';
const SUPABASE_ANON_KEY = 'YOUR_ANON_KEY';
```

Replace with your actual credentials from Step 1.3.

### 3.3 Link the Scripts

In the `<head>` of `larperscrm-dashboard.html`, add:

```html
<script src="src/supabase-client.js"></script>
<script src="src/auth-screens.js"></script>
```

Place these **before the closing `</head>` tag**, so they load before the main app code.

---

## Step 4: Deploy to a Static Host

You have three options:

### Option A: Cloudflare Pages (Recommended for simplicity)

1. Push your files to a GitHub repository
2. Go to [pages.cloudflare.com](https://pages.cloudflare.com)
3. Click **"Create a project"** > **"Connect to Git"**
4. Select your repository and branch
5. **Build command:** (leave blank — it's static HTML)
6. **Build output directory:** `/` (or the folder containing `larperscrm-dashboard.html`)
7. Click **"Save and Deploy"**

Your app is live at `https://your-project.pages.dev`

### Option B: Netlify

1. Drag and drop your project folder to [netlify.com](https://netlify.com)
   - Or connect your GitHub repo
2. Netlify automatically detects it's static HTML
3. Your site goes live at `https://your-project.netlify.app`

### Option C: Vercel

1. Push to GitHub and go to [vercel.com](https://vercel.com)
2. Click **"New Project"** > select your repo
3. Vercel auto-configures for static sites
4. Deploy and your site is live at `https://your-project.vercel.app`

---

## Step 5: Test Authentication

1. Open your deployed app (e.g., `https://larperscrm.pages.dev`)
2. You should see the **Login/Signup** screen
3. Click **"Sign up"** and create an account with your email
4. You'll be logged in and redirected to the dashboard

**Success!** Your account is now in the Supabase `profiles` table with RLS protecting your data.

---

## Step 6: Migrate Features to Live Data

The dashboard currently uses static/local data. We'll migrate features one by one:

### Feature Migration Checklist

- [ ] **My Policies** — Read/write from `policies` table
- [ ] **Lead Batches** — Read/write from `lead_batches` table
- [ ] **Carriers (HCMS)** — Read/write from `carrier_appointments` table
- [ ] **Calendar** — Read/write from `appointments` table
- [ ] **Call Recordings** — Integrate with storage/webhooks
- [ ] **Analytics/Metrics** — Aggregate live data
- [ ] **Face-to-Face** — Read/write from `f2f_sessions` table

Once a feature is migrated, agents see only their own data.

---

## Troubleshooting

### "CORS error" or "Fetch failed"

**Solution:** Ensure your Supabase project URL and Anon Key are correct in `supabase-client.js`.

### "RLS policy violation"

**Solution:** This means your API call included a row you don't own. The schema's RLS policies should prevent this. If it persists, check the table's `agent_id` field.

### "Anon Key doesn't work"

**Solution:** Make sure you're using the **Anon Key**, not the Service Role Key. The Anon Key is public and safe to embed in the frontend.

### Login works but data doesn't load

**Solution:** The feature might not be wired to the live database yet. Check the feature migration checklist above.

---

## Next Steps

1. **Test** all authentication flows (signup, login, logout)
2. **Pick a feature** to migrate first (recommend: **My Policies**)
3. **Wire that feature** to read/write from the live `policies` table
4. **Test per-agent isolation** by logging in as different agents
5. **Repeat** for remaining features

---

## Architecture Notes

- **Authentication:** Supabase Auth (email + password)
- **Data Isolation:** PostgreSQL RLS policies enforce `agent_id = current_user_id`
- **Session Storage:** Credentials stored in browser `localStorage`
- **API Access:** REST API via Supabase's auto-generated endpoints

No credentials are ever sent to your frontend code—Supabase handles auth securely.

---

## Production Checklist

Before going live with agents:

- [ ] Enable email verification (Supabase Settings > Authentication)
- [ ] Set up password reset (via email)
- [ ] Test data migration from old AlibiCRM (if applicable)
- [ ] Review RLS policies with Fabian Somo (upline)
- [ ] Set up HTTPS (automatic with Cloudflare Pages / Netlify / Vercel)
- [ ] Document agent onboarding (sign up flow)
- [ ] Set up error logging / monitoring
- [ ] Test with 5+ agents simultaneously

---

## Support

Questions? Reach out to your upline contact or check the Supabase docs at [supabase.com/docs](https://supabase.com/docs).
