import { z } from "zod";

import { getCore } from "@/app/api/_core";
import { StoreIdSchema } from "@/core/types";

const ParamsSchema = z.object({
  versionCode: z.coerce.number().int().positive(),
});

const BodySchema = z
  .object({
    storeId: StoreIdSchema,
  })
  .strict();

export async function POST(
  req: Request,
  { params }: { params: Promise<{ versionCode: string }> },
) {
  const core = await getCore();
  const p = ParamsSchema.parse(await params);
  const body = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "VALIDATION_ERROR", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const release = await core.getRelease(p.versionCode);
    const provider = await core.createProvider(parsed.data.storeId, release);

    const artifactsPath = core.storage.artifactsDir(p.versionCode);
    const providerDraftId = await provider.uploadArtifacts(artifactsPath);

    // Reload metadata (upload may patch release.yaml with draftId/timestamps)
    const latest = await core.getRelease(p.versionCode);
    await provider.updateMetadata(latest);

    const publish = await provider.publishDraft();

    return Response.json({
      ok: true,
      storeId: parsed.data.storeId,
      versionCode: p.versionCode,
      providerDraftId,
      publish,
    });
  } catch (e) {
    return Response.json(
      { error: "DEPLOY_FAILED", message: (e as Error).message },
      { status: 500 },
    );
  }
}

