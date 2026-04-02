import type { NextRequest } from "next/server";
import { withPermission } from "@/lib/auth/guards";
import { errorResponse, notFound } from "@/lib/api/errors";
import {
  getInstalledModule,
  uninstallModule,
  updateModuleConfig,
} from "@/lib/services/module-manager.service";

type Params = { moduleId: string };

/**
 * GET /api/modules/[moduleId] — Get details of an installed module.
 */
export const GET = withPermission<Params>(
  "module.access",
  async (_req, { params }) => {
    try {
      const mod = await getInstalledModule(params.moduleId);
      if (!mod) throw notFound("Module not installed");
      return Response.json(mod);
    } catch (err) {
      return errorResponse(err);
    }
  },
);

/**
 * PATCH /api/modules/[moduleId] — Update module configuration.
 * Body: { config: Record<string, string> }
 */
export const PATCH = withPermission<Params>(
  "module.manage",
  async (req, { params }) => {
    try {
      const body = await req.json();
      const result = await updateModuleConfig(params.moduleId, body.config ?? {});
      return Response.json(result);
    } catch (err) {
      return errorResponse(err);
    }
  },
);

/**
 * DELETE /api/modules/[moduleId] — Uninstall a module.
 */
export const DELETE = withPermission<Params>(
  "module.manage",
  async (_req, { params }) => {
    try {
      await uninstallModule(params.moduleId);
      return Response.json({ ok: true });
    } catch (err) {
      return errorResponse(err);
    }
  },
);
