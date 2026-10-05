# Connect Messages to Supabase (free plan)

Messages uses Supabase for user discovery, online presence, saved text messages, and private photo/video storage. Calls still use direct WebRTC between the two browsers.

## 1. Create the backend

Create a free project at [supabase.com/dashboard](https://supabase.com/dashboard). Keep the database password somewhere private; this app does not need it.

In the project dashboard, open **Authentication → Sign In / Providers** and enable **Anonymous Sign-Ins**. Messages creates one anonymous account in the browser so its rows and files can be protected by Supabase Row Level Security. The account is tied to that browser profile; clearing its site data or switching devices loses access to that account and its chat history.

## 2. Create the tables and access rules

Open **SQL Editor → New query**, paste the complete contents of [`supabase/migrations/20260928000000_messages_backend.sql`](../../supabase/migrations/20260928000000_messages_backend.sql), then run it. This creates the user directory, private message and media policies, and Realtime access policies.

In **Realtime → Settings**, turn off **Allow public access**. Both presence and message subscriptions use private channels with authorization rules from the migration.

## 3. Add the public app configuration

In the dashboard's **Connect** dialog, copy the **Project URL** and the **Publishable key**. Create `.env.local` beside this package's `package.json` and add:

```dotenv
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

Use the publishable key only. Never put a Supabase secret/service-role key in this frontend or in chat; the publishable key is intended to be public and the database policies limit what it can access. `.env.local` is ignored by Git.

## 4. Build and deploy

For local preview, open PowerShell in this folder and run:

```powershell
$env:PORT = '5001'
$env:BASE_PATH = '/'
pnpm run dev
```

Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` as build environment variables in every host that builds the site, then trigger a new build:

- **Vercel:** Project Settings → Environment Variables.
- **Netlify:** Project configuration → Environment variables.
- **GitHub Pages:** add repository Actions variables and make the Pages workflow pass them into the Vite build. Pages must deploy a fresh build of this source.

These are build-time variables for the browser app, so setting them only in a hosting dashboard without rebuilding will not update an already-built site.

## Limits and notes

- Photos are limited to 8 MB and videos to 40 MB by the app. The private bucket rejects files over 50 MB.
- Supabase Free has monthly/storage/traffic quotas and may pause an inactive project. See [Supabase pricing](https://supabase.com/pricing).
- Messages saved in the old browser-only version are not automatically copied to the new server. New messages after setup are stored centrally and appear when the other person opens Messages.
- Anonymous profiles are convenient for trying the app but are not recoverable after browser data is cleared. Add a permanent sign-in method before relying on an account long-term.
- WebRTC calls need both users online. Some networks block direct connections; a TURN relay would be needed for those networks and may have separate free-tier limits.
