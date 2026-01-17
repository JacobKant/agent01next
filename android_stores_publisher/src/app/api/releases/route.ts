import { z } from "zod";

import { getCore } from "@/app/api/_core";
import { ReleaseMetadataSchema } from "@/core/types";

export async function GET() {
  const core = await getCore();
  const releases = await core.listReleases();
  return Response.json(releases);
}

const CreateReleaseRequestSchema = ReleaseMetadataSchema.pick({
  versionCode: true,
  versionName: true,
  packageName: true,
}).extend({
  languages: z.array(z.string().min(1)).optional(),
  i18n: z
    .record(
      z
        .string()
        .min(1)
        .max(16)
        .regex(/^[a-z]{2}(-[A-Z]{2})?$/, "Invalid lang code (e.g. ru, en, en-US)"),
      z
        .object({
          title: z.string().optional(),
          description: z.string().optional(),
          changelog: z.string().optional(),
        })
        .strict(),
    )
    .optional(),
});

export async function POST(req: Request) {
  const core = await getCore();
  const body = await req.json().catch(() => null);
  const parsed = CreateReleaseRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "VALIDATION_ERROR", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const created = await core.createReleaseDraft(parsed.data);
  return Response.json(created, { status: 201 });
}

