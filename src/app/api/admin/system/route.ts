import { NextResponse } from "next/server";
import os from "node:os";
import { withPermission } from "@/lib/auth/guards";
import { getOrchestrator, getDockerClient } from "@/lib/docker/orchestrator";
import { getDataDir, getBackupDir } from "@/lib/docker/storage";
import { listContainers } from "@pruefertit/docker-orchestrator";

async function dirSize(dir: string): Promise<number> {
  const { readdir, stat } = await import("node:fs/promises");
  const path = await import("node:path");

  let total = 0;
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return 0;
  }

  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      total += await dirSize(full);
    } else {
      try {
        const s = await stat(full);
        total += s.size;
      } catch {
        // file removed between readdir and stat
      }
    }
  }
  return total;
}

export const GET = withPermission(
  "admin.system",
  async () => {
    const [orch, docker] = await Promise.all([
      getOrchestrator(),
      getDockerClient(),
    ]);

    const [health, containers, dataDirSize, backupDirSize] = await Promise.all([
      Promise.resolve(orch.health()),
      listContainers(docker, true),
      dirSize(getDataDir()),
      dirSize(getBackupDir()),
    ]);

    const totalMem = os.totalmem();
    const freeMem = os.freemem();

    return NextResponse.json({
      docker: health,
      memory: {
        total: totalMem,
        free: freeMem,
        used: totalMem - freeMem,
      },
      containers,
      disk: {
        dataDir: { path: getDataDir(), size: dataDirSize },
        backupDir: { path: getBackupDir(), size: backupDirSize },
      },
    });
  },
);

export const dynamic = "force-dynamic";
