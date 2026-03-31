# Backup Download & UI Enhancement Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add backup download API routes and a download button to the existing ServerBackupsTab UI.

**Architecture:** Two new Next.js route handlers under `/api/backups/[id]/` stream file downloads and expose standalone CRUD. The existing `ServerBackupsTab.tsx` gets an `<a download>` button wrapped in a shadcn Button component.

**Tech Stack:** Next.js 15 App Router, `withAuth` middleware, Node.js `createReadStream` → Web `ReadableStream`, `BackupModel` from Mongoose, lucide-react `Download` icon.

---

### Task 1: Standalone backup resource — `GET` and `DELETE /api/backups/[id]`

**Files:**
- Create: `src/app/api/backups/[id]/route.ts`

**Context:**
- Pattern: see `src/app/api/servers/[id]/backups/[backupId]/route.ts` for auth + error handling
- Import `getBackup` — note: service exposes `deleteBackup` but NOT a standalone `getBackup`. We call `BackupModel.findById` directly or add the function.
- `withAuth` signature: `withAuth(async (req, { session, params }) => ...)`
- Errors: `notFound()`, `forbidden()`, `errorResponse()` from `@/lib/api/errors`
- No server-ownership check needed here (backup is looked up by its own id); ownership is checked via `createdBy` match against `session.userId` OR if user can access the server.

**Step 1: Create the route file**

```ts
import type { NextRequest } from "next/server";
import { withAuth } from "@/lib/auth/guards";
import { errorResponse, forbidden, notFound } from "@/lib/api/errors";
import { deleteBackup } from "@/lib/services/backup.service";
import { connectDB } from "@/lib/db/connection";
import { BackupModel } from "@/lib/db/models/backup";
import { canAccessServer } from "@/lib/services/server-access";
import { getServer } from "@/lib/services/server.service";

export const GET = withAuth(async (_req: NextRequest, { session, params }) => {
  try {
    await connectDB();
    const backup = await BackupModel.findById(params.id).lean();
    if (!backup) throw notFound("Backup not found");

    const server = await getServer(backup.serverId.toString());
    if (!server || !(await canAccessServer(server, session.userId)))
      throw forbidden();

    return Response.json(backup);
  } catch (error) {
    return errorResponse(error);
  }
});

export const DELETE = withAuth(
  async (_req: NextRequest, { session, params }) => {
    try {
      await connectDB();
      const backup = await BackupModel.findById(params.id).lean();
      if (!backup) throw notFound("Backup not found");

      const server = await getServer(backup.serverId.toString());
      if (!server || !(await canAccessServer(server, session.userId)))
        throw forbidden();

      await deleteBackup(params.id);
      return new Response(null, { status: 204 });
    } catch (error) {
      return errorResponse(error);
    }
  },
);
```

**Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors for the new file.

**Step 3: Commit**

```bash
git add src/app/api/backups/[id]/route.ts
git commit -m "feat: add standalone GET/DELETE /api/backups/[id] route"
```

---

### Task 2: Download route — `GET /api/backups/[id]/download`

**Files:**
- Create: `src/app/api/backups/[id]/download/route.ts`

**Context:**
- Streams the `.tar.gz` file using Node.js `createReadStream` converted to Web `ReadableStream`
- See `src/app/api/files/[id]/route.ts` (GET handler) for the `createReadStream → ReadableStream` pattern used in this project
- The backup `path` is the absolute filesystem path stored in the DB
- Use `stat` to verify the file exists before streaming
- Headers: `Content-Disposition: attachment; filename="<backup.filename>"`, `Content-Type: application/gzip`

**Step 1: Create the download route**

```ts
import type { NextRequest } from "next/server";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { withAuth } from "@/lib/auth/guards";
import { errorResponse, forbidden, notFound } from "@/lib/api/errors";
import { connectDB } from "@/lib/db/connection";
import { BackupModel } from "@/lib/db/models/backup";
import { canAccessServer } from "@/lib/services/server-access";
import { getServer } from "@/lib/services/server.service";

export const GET = withAuth(async (_req: NextRequest, { session, params }) => {
  try {
    await connectDB();
    const backup = await BackupModel.findById(params.id).lean();
    if (!backup) throw notFound("Backup not found");

    const server = await getServer(backup.serverId.toString());
    if (!server || !(await canAccessServer(server, session.userId)))
      throw forbidden();

    // Verify file exists on disk
    try {
      await stat(backup.path);
    } catch {
      throw notFound("Backup file not found on disk");
    }

    const nodeStream = createReadStream(backup.path);
    const webStream = new ReadableStream({
      start(controller) {
        nodeStream.on("data", (chunk) =>
          controller.enqueue(
            typeof chunk === "string" ? Buffer.from(chunk) : chunk,
          ),
        );
        nodeStream.on("end", () => controller.close());
        nodeStream.on("error", (err) => controller.error(err));
      },
      cancel() {
        nodeStream.destroy();
      },
    });

    return new Response(webStream, {
      headers: {
        "Content-Type": "application/gzip",
        "Content-Disposition": `attachment; filename="${backup.filename}"`,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
});
```

**Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -30
```

**Step 3: Commit**

```bash
git add src/app/api/backups/[id]/download/route.ts
git commit -m "feat: add GET /api/backups/[id]/download streaming route"
```

---

### Task 3: Add download button to `ServerBackupsTab.tsx`

**Files:**
- Modify: `src/components/servers/ServerBackupsTab.tsx`

**Context:**
- Current buttons in each row: Restore (RotateCcw), Delete (Trash2) — both `Button variant="ghost" size="icon"`
- Add a Download button as `<a href="/api/backups/{backup._id}/download" download={backup.filename}>`
- Use shadcn `Button` with `asChild` prop to render the anchor as a button
- Import `Download` icon from `lucide-react`
- Insert the download button BEFORE the restore button in the row
- The download should work even when the server is running (no disabled state needed)

**Step 1: Add `Download` to lucide imports**

In the existing import line:
```ts
import { Plus, Trash2, RotateCcw, HardDrive, Download } from "lucide-react";
```

**Step 2: Add download button in each backup row**

In the `<div className="flex gap-1">` block, before the restore button:
```tsx
<Button variant="ghost" size="icon" asChild title="Herunterladen">
  <a
    href={`/api/backups/${backup._id}/download`}
    download={backup.filename}
  >
    <Download className="h-4 w-4" />
  </a>
</Button>
```

**Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -30
```

**Step 4: Commit**

```bash
git add src/components/servers/ServerBackupsTab.tsx
git commit -m "feat: add download button to ServerBackupsTab"
```

---

### Task 4: Manual smoke test checklist

Without automated tests, verify manually:

1. Navigate to a server detail page → Backups tab
2. Create a backup (server must be stopped)
3. Verify backup appears in list with filename, size, components
4. Click the Download button → browser should download a `.tar.gz` file
5. Verify `GET /api/backups/{id}` returns 200 with backup metadata
6. Verify `DELETE /api/backups/{id}` returns 204 and backup disappears from list
7. Verify `GET /api/backups/{id}/download` returns 200 with file stream when accessed by authorized user
8. Verify attempting to access another user's backup returns 403
