import type { NextRequest } from "next/server";
import { withPermission } from "@/lib/auth/guards";
import { errorResponse } from "@/lib/api/errors";
import {
  listTemplates,
  updateTemplate,
  seedDefaultTemplates,
} from "@/lib/services/mail-template.service";

export const GET = withPermission(
  "admin.mail",
  async (_req: NextRequest) => {
    try {
      await seedDefaultTemplates();
      const templates = await listTemplates();
      return Response.json(templates);
    } catch (error) {
      return errorResponse(error);
    }
  },
);

export const PUT = withPermission(
  "admin.mail",
  async (req: NextRequest) => {
    try {
      const body = await req.json();
      const { key, subject, htmlBody, textBody } = body as {
        key: string;
        subject: string;
        htmlBody: string;
        textBody: string;
      };

      if (!key || !subject || !htmlBody || !textBody) {
        return Response.json(
          { error: "key, subject, htmlBody and textBody are required" },
          { status: 400 },
        );
      }

      const updated = await updateTemplate(key, { subject, htmlBody, textBody });
      return Response.json(updated);
    } catch (error) {
      return errorResponse(error);
    }
  },
);
