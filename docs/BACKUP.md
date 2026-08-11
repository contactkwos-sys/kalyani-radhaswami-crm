# Backup & Disaster Recovery (Phase 6)

This CRM uses **four complementary layers**. Application backups do **not** replace Supabase native database backups.

## Layers

1. **Application Backup** — scheduled/manual export of authorized CRM tables into Excel, stored in private Supabase Storage (`crm-backups`), with history in `crm_backup_jobs`.
2. **Excel Backup / Restore** — multi-sheet workbook download and validated MERGE or FULL restore (Owner only). FULL restore always creates a safety backup first.
3. **Google Drive Backup** — optional Owner OAuth; tokens encrypted server-side; folder `Kalyani-Radhaswami CRM/Backups/{Daily|Weekly|Monthly}`. Failed Drive uploads keep the local Excel artifact.
4. **Supabase Database Backup** — managed by Supabase (PITR / daily backups). Do not expose DB credentials in the app.

## Roles

| Role        | Backup | Module export | Restore | Google Drive |
|-------------|--------|---------------|---------|--------------|
| Owner       | Full   | Full          | Full    | Full         |
| Admin       | Full   | Full          | No      | No           |
| Accountant  | No*    | If Owner enables | No   | No           |
| Salesman    | No     | No            | No      | No           |

\* Accountant has no Backup Center settings control; export only when `accountant_export_allowed` is true.

## Scheduled backups

Call every 15 minutes (external cron / GitHub Actions / hosting scheduler):

```http
POST /api/backup/cron
Authorization: Bearer <CRON_SECRET>
```

If `CRON_SECRET` is unset, the endpoint returns 503. The handler runs a backup only when automatic backup is ON and the IST time window matches settings.

## Required environment

- `CRON_SECRET` — bearer for `/api/backup/cron`
- `BACKUP_TOKEN_SECRET` (or falls back to service role key) — AES-GCM for Drive tokens
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`
- Existing Supabase URL / anon / service role keys (never ship service role to the browser)

## Owner UI

Settings → **Backup** (`/settings/backup`): Automatic, Manual, Excel export, Restore, History, Google Drive, Health.
