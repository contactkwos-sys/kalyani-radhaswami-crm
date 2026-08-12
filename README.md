# Kalyani · Radhaswami Sales Force Management CRM

Production CRM for **Kalyani Thread** and **Radhaswami Thread**.

Support: contact.kwos@gmail.com · WhatsApp: [98250-63-208](https://wa.me/9825063208)

## Stack

- Next.js (App Router) + TypeScript + Tailwind
- Supabase Auth + Postgres (RLS)
- Mobile Number + PIN login (server-verified) on existing Supabase sessions
- CEO / Owner, CEO 1–3, Admin, Manager, Salesman, Accountant hierarchy
- Forgot PIN → secure admin reset tickets (never reveals existing PIN)
- Server-side Owner Override PIN + Developer Override Key (never exposed to the browser)
- Protected internal Developer / System Administration identity (never shown as Owner/CEO on the public UI)

## Phase status

- **Phase 1:** foundation, auth, companies, roles, trial/license, owner security, audit logs
- **Phase 2:** Product / Salesman / Party masters + Party→Product→Salesman assignments
- **Phase 3–5:** visits/GPS, sales/incentives, management intelligence
- **Phase 6:** application Excel backup/restore, Google Drive sync, backup health (see `docs/BACKUP.md`)
- **Auth:** Mobile + PIN login, remembered devices, user management
- **Security:** Owner/Developer Override (server-only `DEVELOPER_OVERRIDE_KEY`)

## Setup

1. Copy `.env.example` → `.env.local` and set:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` (publishable key)
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `SUPABASE_DB_PASSWORD`
   - `OWNER_OVERRIDE_PIN_HASH` (bcrypt hash or bootstrap PIN — server only)
   - `DEVELOPER_OVERRIDE_KEY` (long random secret — server only, never `NEXT_PUBLIC_*`)
   - `DEVELOPER_LOGIN_PIN` / `OWNER_LOGIN_PIN` (optional bootstrap for primary Owner mobile login — server only; forces PIN change after first login)
2. Apply migration: `npm run db:migrate`
3. Seed owner: `OWNER_EMAIL=... OWNER_PASSWORD=... OWNER_NAME="System Administration" OWNER_MOBILE=... OWNER_LOGIN_PIN=... npm run db:seed-owner`
   - Seed marks the account as **primary Owner + Developer**
   - If `OWNER_MOBILE` is set and `OWNER_LOGIN_PIN` is omitted, a temporary 6-digit PIN is **auto-generated** and printed once
   - Or bootstrap only the developer mobile PIN: `DEVELOPER_LOGIN_PIN=... OWNER_MOBILE=... npm run db:bootstrap-developer-pin`
   - Admin → Users: leave Temporary PIN blank (or click **Auto-generate PIN**) to create a one-time temporary PIN
4. `npm run dev`

CRM tables are namespaced `crm_*` so they coexist with other apps on the shared Supabase project.

### Developer Override

- Lives only in `DEVELOPER_OVERRIDE_KEY` (server env).
- Never send via `NEXT_PUBLIC_*`, never store in localStorage/DB plaintext, never log.
- Authenticated Owner/Developer session is required; sensitive actions also require entering the key (verified server-side with timing-safe compare).
- Does **not** impersonate / auto-login as another user — only authorizes admin operations.
- Primary Owner cannot be deleted/demoted in the normal UI; use `scripts/owner-recovery.js` with the override key.

## Scripts

- `npm run dev` — development server
- `npm run build` — production build
- `npm run lint` — ESLint
- `npm run typecheck` — TypeScript
- `npm run test:unit` — unit tests (override helpers)
- `npm run verify:mobile-pin` — Mobile+PIN acceptance
- `npm run verify:developer-override` — Developer Override / owner privilege acceptance
- `npm run test:auth` — unit + auth/authorization acceptance suite
- `npm run db:migrate` — apply SQL migration via pooler
- `npm run db:seed-owner` — create/update Owner auth user + CRM profile
- `npm run verify:phase6` — backup/restore RLS and Excel acceptance checks
