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
11. **Admin Dashboard (Strict Server RBAC)**: Real-time usage metrics, Physics & Math Formulas CRUD, AI API runtime configuration, user & role management, Notices, Shared Notes, MCQs, Community moderation, and App/APK release configuration.
12. **Install App (PWA + Capacitor Android)**: One-tap PWA install prompt + iOS Safari guide + Service Worker offline caching + Capacitor Android configuration (`capacitor.config.ts`).

---

## Local Development Setup

### 1. Install Dependencies
```bash
npm install
```

### 2. Environment Variables
Copy `.env.example` to `.env` and configure your values:
```env
GEMINI_API_KEY="your_server_side_gemini_api_key"
APP_URL="http://localhost:3000"
SESSION_SECRET="replace-with-a-long-random-secret"

# Optional server-side initial Admin credentials
ADMIN_EMAIL=""
ADMIN_PASSWORD=""
ADMIN_SETUP_SECRET=""

# Optional external Supabase credentials
VITE_SUPABASE_URL=""
VITE_SUPABASE_ANON_KEY=""
```
> **Security Note:** `GEMINI_API_KEY`, `SESSION_SECRET`, `ADMIN_PASSWORD`, and `ADMIN_SETUP_SECRET` are strictly server-side (`server.ts` / `server/database.ts`) and are never exposed to the client bundle.

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

1. **Run SQL Migration in Supabase**:
   - Open your Supabase Dashboard → **SQL Editor** → **New Query**.
   - Paste and execute `supabase/migrations/002_polytechnic_hub_v2_upgrade.sql`.
   - This provisions `profiles` (with `handle_new_user()` trigger), `user_pdfs`, `physics_formulas`, `mathematics_formulas`, `chat_history`, `favorites`, `is_admin()`, strict RLS policies, and the `user-pdfs` (private) & `avatars` (public read) Storage buckets.
2. **Enable Google OAuth (Optional)**:
   - In Supabase Dashboard → **Authentication → Providers → Google**, enable Google Sign-in and add your app URL (`http://localhost:3000` and your Vercel production domain) to **Authentication → URL Configuration → Redirect URLs**.
3. **Promote Your Admin User**:
   - Either set `ADMIN_EMAIL="your-email@example.com"` in environment variables, or update `public.profiles` in Supabase SQL Editor:
     `update public.profiles set role = 'admin' where email = 'your-email@example.com';`
4. **Local Persistence Fallback**:
   - `server/database.ts` stores local notices, shared notes, MCQs, community posts, AI runtime config, and custom formula overrides in `.data/polytechnic_hub.json`. Student routines, notes, and offline PDF blobs persist in `localStorage` + IndexedDB (`src/services/offlineDb.ts`).

---

## Android APK Build (Capacitor)

```bash
# 1. Add Android native project (first time only)
npm run cap:add:android

# 2. Build web bundle + PWA assets and sync to Android
npm run cap:sync

# 3. Open in Android Studio to generate a signed APK / AAB
npm run cap:open:android
```
Once a signed `.apk` is built and hosted (e.g., GitHub Releases or CDN), an Admin can paste the download URL and release version in **Admin Dashboard → App / APK Release** to enable direct APK downloads in the **Install App** view.

---

## Deployment (Vercel & Node)

- **Vercel:** `vercel.json` is preconfigured with SPA rewrites and Service Worker (`sw.js`, `manifest.webmanifest`) no-cache headers. Set `GEMINI_API_KEY`, `SESSION_SECRET`, and any optional environment variables in your Vercel Project Settings.
- **Node / Cloud Run / VPS:** Run `npm run build` followed by `NODE_ENV=production npm start` (runs `server.ts` on `process.env.PORT || 3000`).
