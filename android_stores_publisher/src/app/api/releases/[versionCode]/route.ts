import { z } from "zod";

import { getCore } from "@/app/api/_core";
import { ReleaseMetadataPatchSchema } from "@/core/types";

const ParamsSchema = z.object({
  versionCode: z.coerce.number().int().positive(),
});

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ versionCode: string }> },
) {
  const core = await getCore();
  const p = ParamsSchema.parse(await params);
  const release = await core.getRelease(p.versionCode);
  return Response.json(release);
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ versionCode: string }> },
) {
  const core = await getCore();
  const p = ParamsSchema.parse(await params);
  const body = await req.json().catch(() => null);
  const parsed = ReleaseMetadataPatchSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "VALIDATION_ERROR", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const updated = await core.patchRelease(p.versionCode, parsed.data);
  return Response.json(updated);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ versionCode: string }> },
) {
  const core = await getCore();
  const p = ParamsSchema.parse(await params);
  await core.deleteRelease(p.versionCode);
  return new Response(null, { status: 204 });
}

