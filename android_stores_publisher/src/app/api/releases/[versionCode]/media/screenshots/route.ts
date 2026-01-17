import { z } from "zod";

import { getCore } from "@/app/api/_core";

const ParamsSchema = z.object({
  versionCode: z.coerce.number().int().positive(),
});

const DeviceTypeSchema = z
  .string()
  .min(1)
  .max(32)
  .regex(/^[a-z0-9_-]+$/i, "Invalid deviceType");

export async function POST(
  req: Request,
  { params }: { params: Promise<{ versionCode: string }> },
) {
  const core = await getCore();
  const p = ParamsSchema.parse(await params);

  // Ensure release exists
  await core.getRelease(p.versionCode);

  const form = await req.formData();
  const deviceType = DeviceTypeSchema.safeParse(form.get("deviceType"));
  if (!deviceType.success) {
    return Response.json(
      {
        error: "VALIDATION_ERROR",
        message: 'Expected "deviceType" (e.g. phone/tablet)',
      },
      { status: 400 },
    );
  }

  const files = form.getAll("file").filter((x): x is File => x instanceof File);
  if (files.length === 0) {
    return Response.json(
      { error: "NO_FILES", message: 'Expected multipart field "file"' },
      { status: 400 },
    );
  }

  const saved: { filename: string }[] = [];
  for (const f of files) {
    const name = f.name || "image.bin";
    if (!/\.(png|jpe?g|webp)$/i.test(name)) {
      return Response.json(
        {
          error: "INVALID_FILE",
          message: `Only .png/.jpg/.jpeg/.webp allowed: ${name}`,
        },
        { status: 400 },
      );
    }
    const buf = Buffer.from(await f.arrayBuffer());
    await core.storage.saveScreenshotFile({
      versionCode: p.versionCode,
      deviceType: deviceType.data,
      filename: name,
      data: buf,
    });
    saved.push({ filename: name });
  }

  return Response.json({
    ok: true,
    versionCode: p.versionCode,
    deviceType: deviceType.data,
    saved,
  });
}

