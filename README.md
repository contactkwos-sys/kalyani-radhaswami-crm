# Kalyani · Radhaswami Sales Force Management CRM

Production CRM for **Kalyani Thread** and **Radhaswami Thread**.

Built by Kumaresh Budhia · Support: contact.kwos@gmail.com · WhatsApp: [98250-63-208](https://wa.me/9825063208)

## Stack

- Next.js (App Router) + TypeScript + Tailwind
- Supabase Auth + Postgres (RLS)
- Server-side trial/license + Owner Override PIN (bcrypt hash)

## Phase status

- **Phase 1:** foundation, auth, companies, roles, trial/license, owner security, audit logs
- **Phase 2:** Product / Salesman / Party masters + Party→Product→Salesman assignments
- **Phase 3–5:** visits/GPS, sales/incentives, management intelligence
- **Phase 6:** application Excel backup/restore, Google Drive sync, backup health (see `docs/BACKUP.md`)

## Setup

1. Copy `.env.example` → `.env.local` and set:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` (publishable key)
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `SUPABASE_DB_PASSWORD`
   - `OWNER_OVERRIDE_PIN_HASH` (bcrypt hash or bootstrap PIN — server only)
2. Apply migration: `npm run db:migrate`
3. Seed owner: `OWNER_EMAIL=... OWNER_PASSWORD=... npm run db:seed-owner`
4. `npm run dev`

CRM tables are namespaced `crm_*` so they coexist with other apps on the shared Supabase project.

## Scripts

- `npm run dev` — development server
- `npm run build` — production build
- `npm run lint` — ESLint
- `npm run typecheck` — TypeScript
- `npm run db:migrate` — apply SQL migration via pooler
- `npm run db:seed-owner` — create/update Owner auth user + CRM profile
- `npm run verify:phase6` — backup/restore RLS and Excel acceptance checks
