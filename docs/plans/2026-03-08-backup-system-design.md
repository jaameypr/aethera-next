# Backup System Design — 2026-03-08

## Context

Most of the backup system already exists:
- `src/lib/db/models/backup.ts` — model with `components: BackupComponent[]`, `size: number`
- `src/lib/services/backup.service.ts` — `createBackup`, `listBackups`, `deleteBackup`, `restoreBackup`
- `GET/POST /api/servers/[id]/backups` — list and create
- `GET/DELETE/POST /api/servers/[id]/backups/[backupId]` — describe, delete, restore
- `ServerBackupsTab.tsx` — used in `ServerDetailTabs.tsx`

## What's Missing

### 1. `GET /api/backups/[id]/download`
Streams the `.tar.gz` archive as a file download.
- Auth via `withAuth`
- Reads `backup.path` from DB, verifies file exists
- Responds with `Content-Disposition: attachment; filename="${backup.filename}"`
- `Content-Type: application/gzip`
- Node `createReadStream` → Web `ReadableStream`

### 2. `GET /api/backups/[id]` and `DELETE /api/backups/[id]`
Standalone backup resource endpoints (not nested under server).
- GET returns backup metadata (JSON)
- DELETE deletes file + DB record, returns 204

### 3. `ServerBackupsTab.tsx` — download button
Add a download link button per backup row.
- `<a href="/api/backups/{id}/download" download={backup.filename}>`
- Rendered as a `<Button variant="ghost" size="icon">` via `asChild`
- Uses `Download` icon from lucide-react

## Decision: Extend existing `ServerBackupsTab.tsx`

User chose to extend `ServerBackupsTab.tsx` instead of creating a new `tabs/BackupsTab.tsx`.
`ServerDetailTabs.tsx` stays unchanged.
