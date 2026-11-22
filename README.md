# Polytechnic Hub — Learn • Practice • Achieve

**Polytechnic Hub** is a full-featured, mobile-first BTEB Diploma Engineering education platform built with React 19, TypeScript, Tailwind CSS v4, Express (`server.ts`), Vite PWA, and Capacitor Android configuration. It supports both **Bengali (`bn`)** and **English (`en`)** interfaces, dark/light themes, offline study via IndexedDB + Service Worker, and role-based Admin management.

---

## Core Modules & Features

1. **Home Dashboard**: Student profile summary, live Bangladesh clock (`Asia/Dhaka`), quick-access cards, Formula Hub highlights, recent study activity, Admin notices, global search across formulas and subjects, and study metrics.
2. **My PDF Library (Personal Private Cloud + Offline Vault)**:
   - Upload PDFs from mobile or computer with a custom document name, real upload progress tracking, PDF magic-byte (`%PDF-`) and 50 MB size validation.
   - Stored privately per user in Supabase Storage (`user-pdfs` bucket) and `public.user_pdfs` with strict RLS isolation, plus optional IndexedDB offline caching.
   - Open and read PDFs in-app, download, rename, and delete.
3. **Physics & Mathematics Formula Hub**:
   - **Physics** (11 chapters) and **Mathematics** (12 chapters) with KaTeX mathematical notation, symbol definitions + units, bilingual explanations, worked examples + solutions, search, favorites sync, copy formula button, and Admin CRUD.
4. **BTEB Result System**: Dedicated portal linking directly to `https://result.bteb.gov.bd/result-search` with external browser launch and optional in-app view fallback (no fake results).
5. **Power Technology & Engineering Tools**: Ohm's Law V-I-R solver, DC/1Φ/3Φ AC Power calculator, Energy Consumption & BDT Bill estimator, dynamic Series/Parallel Resistor calculator, Unit Converter, Safety Rules, and interactive SVG Circuit Diagrams.
6. **Streaming AI Tutor (`/api/ai/stream`)**: Server-side Gemini SSE streaming supporting Bengali & English across 5 modes (`general`, `explain`, `math`, `power`, `recommend`), Stop Generating (`AbortController`), Retry, Concise toggle, and multi-session chat history synced with Supabase `chat_history`.
7. **Live Clock & Study Timer**: Live Bangladesh time (`Asia/Dhaka`), Countdown Timer, Pomodoro Timer, Stopwatch with lap tracking, custom study schedule & reminders, and session history.
8. **MCQ & Model Test**: Combined built-in and Admin-managed question bank with timer, automated grading, and answer explanations.
9. **Notes, Routine & Progress**: Personal notes (`localStorage` + export), Admin-shared PDFs, daily study routine planner, and progress analytics.
10. **Student Community**: Department-filtered Q&A forum, post creation, replies, content reporting, and Admin moderation.
11. **Advanced Push Notification System**:
    - **Student Notification Center (`notifications`)**: Category filter (`APP_UPDATE`, `IMPORTANT`, `EDUCATION`, `EMERGENCY`, `GENERAL`), unread filter, mark read / mark all read, delete, deep-link click navigation, permission status & onboarding/blocked-browser instructions, registered multi-device management, and notification preferences (sound enable/disable, sound style selector with custom `/sounds/polytechnic-chime.wav` chime, DND respect, and category toggles).
    - **Admin Notification Dashboard (`Admin Dashboard → Push Notifications`)**: Send immediately or schedule future campaigns, target **All Registered Users**, **Department & Semester**, or **Selected Users** (searchable multi-select), attach image URL + target screen deep-link + sound mode, view delivery stats, and edit/cancel/delete scheduled campaigns.
    - **Dual Transport**: Express backend (`server/fcmAdmin.ts`) + Supabase SQL (`003_push_notifications_system.sql`) & Edge Functions (`send-push-notification`, `process-scheduled-notifications`), Supabase Realtime live inbox sync, Service Worker background push (`public/sw-push.js`), and Capacitor Android native FCM + notification channels.
12. **Admin Dashboard (Strict Server RBAC)**: Real-time usage metrics, Physics & Math Formulas CRUD, Push Notifications management, AI API runtime configuration, user & role management, Notices, Shared Notes, MCQs, Community moderation, and App/APK release configuration.
13. **Install App (PWA + Capacitor Android)**: One-tap PWA install prompt + iOS Safari guide + Service Worker offline caching + Capacitor Android configuration (`capacitor.config.ts`).

---

## Local Development Setup

### 1. Install Dependencies
```bash
npm install
```

### 2. Environment Variables
Copy `.env.example` to `.env` and configure your values:
```env
# Server-side secrets (NEVER prefix with VITE_)
GEMINI_API_KEY="your_server_side_gemini_api_key"
APP_URL="http://localhost:3000"
SESSION_SECRET="replace-with-a-long-random-secret"
SUPABASE_SERVICE_ROLE_KEY=""
CRON_SECRET=""
FIREBASE_SERVICE_ACCOUNT_JSON=""

# Optional server-side initial Admin credentials
ADMIN_EMAIL=""
ADMIN_PASSWORD=""
ADMIN_SETUP_SECRET=""

# Public Supabase client credentials
VITE_SUPABASE_URL=""
VITE_SUPABASE_ANON_KEY=""

# Public Firebase Web SDK & VAPID config (for FCM browser push)
VITE_FIREBASE_API_KEY=""
VITE_FIREBASE_AUTH_DOMAIN=""
VITE_FIREBASE_PROJECT_ID=""
VITE_FIREBASE_STORAGE_BUCKET=""
VITE_FIREBASE_MESSAGING_SENDER_ID=""
VITE_FIREBASE_APP_ID=""
VITE_FIREBASE_VAPID_KEY=""
```
> **Security Note:** `GEMINI_API_KEY`, `SESSION_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `FIREBASE_SERVICE_ACCOUNT_JSON`, `CRON_SECRET`, `ADMIN_PASSWORD`, and `ADMIN_SETUP_SECRET` are strictly server-side secrets and are never exposed to the client bundle.

### 3. Start Development Server
```bash
npm run dev
```
Runs Express + Vite middleware on `http://localhost:3000`.

### 4. Type Check & Production Build
```bash
npm run lint
npm run build
NODE_ENV=production npm start
```

---

## First-Time Admin Setup

Polytechnic Hub never hardcodes Admin credentials in client source code. You have two ways to initialize the Admin account:

1. **Interactive Setup (First Boot):** When zero Admin accounts exist in `.data/polytechnic_hub.json`, open **Profile & Auth** in the app and use the **First-Time Admin Setup** tab (calls `POST /api/auth/bootstrap-admin`).
2. **Environment Variables:** Set `ADMIN_EMAIL` and `ADMIN_PASSWORD` in `.env` before starting the server so the backend provisions the Admin account automatically. If an Admin already exists and you want to authorize another Admin via `/api/auth/bootstrap-admin`, provide `ADMIN_SETUP_SECRET`.

---

## Database & Supabase Integration

1. **Run SQL Migrations in Supabase**:
   - Open your Supabase Dashboard → **SQL Editor** → **New Query**.
   - Execute `supabase/migrations/002_polytechnic_hub_v2_upgrade.sql` first, then execute `supabase/migrations/003_push_notifications_system.sql`.
   - Migration `003` creates `notifications`, `user_notifications`, `notification_preferences`, `device_tokens`, and `scheduled_notifications` with strict RLS policies and adds `user_notifications` to `supabase_realtime`.
2. **Enable Google OAuth (Optional)**:
   - In Supabase Dashboard → **Authentication → Providers → Google**, enable Google Sign-in and add your app URL (`http://localhost:3000` and your Vercel production domain) to **Authentication → URL Configuration → Redirect URLs**.
3. **Promote Your Admin User**:
   - Either set `ADMIN_EMAIL="your-email@example.com"` in environment variables, or update `public.profiles` in Supabase SQL Editor:
     `update public.profiles set role = 'admin' where email = 'your-email@example.com';`
4. **Deploy Supabase Edge Functions (Optional if using Express backend exclusively)**:
   ```bash
   supabase secrets set FIREBASE_SERVICE_ACCOUNT_JSON='{"type":"service_account",...}'
   supabase secrets set CRON_SECRET="replace-with-strong-random-cron-secret"
   supabase functions deploy send-push-notification
   supabase functions deploy process-scheduled-notifications
   ```
   - Schedule `process-scheduled-notifications` (e.g., every 1–5 minutes via Supabase Cron / pg_cron / external scheduler sending `Authorization: Bearer <CRON_SECRET>`).
   - Express (`server.ts`) also runs a 20-second background scheduler automatically when Node stays running.
5. **Local Persistence Fallback**:
   - `server/database.ts` stores local notices, shared notes, MCQs, community posts, AI runtime config, notification campaigns, user inbox rows, device tokens, preferences, scheduled notifications, and custom formula overrides in `.data/polytechnic_hub.json`. Student routines, notes, and offline PDF blobs persist in `localStorage` + IndexedDB (`src/services/offlineDb.ts`).

---

## Firebase Cloud Messaging (FCM) Setup

1. Create or open a project in **Firebase Console**.
2. **Web App + Web Push VAPID**:
   - Add a **Web app** in Project Settings → **General** and copy the values into `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, and `VITE_FIREBASE_APP_ID`.
   - Go to **Cloud Messaging → Web configuration → Web Push certificates**, generate a key pair, and copy the public key into `VITE_FIREBASE_VAPID_KEY`.
3. **Server Service Account (Private Key)**:
   - Go to **Project Settings → Service accounts → Generate new private key**.
   - Minify the JSON into a single line and set `FIREBASE_SERVICE_ACCOUNT_JSON` in `.env`, Vercel **Server Environment Variables**, and/or Supabase Edge Function Secrets (never prefix with `VITE_`).

---

## Android APK & Native Push Setup (Capacitor)

```bash
# 1. Add Android native project (first time only)
npm run cap:add:android

# 2. Copy Firebase Android config & custom notification channel sound
# Place your Firebase google-services.json into: android/app/google-services.json
# Copy public/sounds/polytechnic-chime.wav into: android/app/src/main/res/raw/polytechnic_chime.wav

# 3. Build web bundle + PWA assets and sync to Android
npm run cap:sync

# 4. Open in Android Studio to generate a signed APK / AAB
npm run cap:open:android
```
Once a signed `.apk` is built and hosted (e.g., GitHub Releases or CDN), an Admin can paste the download URL and release version in **Admin Dashboard → App / APK Release** to enable direct APK downloads in the **Install App** view.

### Platform Support Matrix
- **Android Native App (Capacitor)**: Full background & closed-app FCM push, custom `polytechnic_chime` Android Notification Channel sound per category, respects OS Silent/DND.
- **Android / Desktop Chrome & Edge (Installed PWA or Web)**: Background & closed-tab Web Push via `sw-push.js` + FCM once permission is granted and Firebase keys are configured; custom chime audio plays in foreground; closed-tab notifications use OS/browser system sound.
- **iOS Safari**: Web Push requires **iOS 16.4+** and installing the site via **Share → Add to Home Screen** (PWA standalone mode); the app guides iOS users through this in Notification Center and Install App.

---

## Deployment (Vercel & Node)

- **Vercel:** `vercel.json` is preconfigured with SPA rewrites and Service Worker (`sw.js`, `sw-push.js`, `manifest.webmanifest`) no-cache headers. Set `GEMINI_API_KEY`, `SESSION_SECRET`, `FIREBASE_SERVICE_ACCOUNT_JSON`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, and `VITE_*` variables in your Vercel Project Settings.
- **Node / Cloud Run / VPS:** Run `npm run build` followed by `NODE_ENV=production npm start` (runs `server.ts` on `process.env.PORT || 3000`).

