import { z } from "zod";

export const StoreIdSchema = z.enum(["rustore", "huawei"]);
export type StoreId = z.infer<typeof StoreIdSchema>;

export const ReleaseStatusSchema = z.enum([
  "draft",
  "uploaded",
  "ready_to_publish",
  "published",
  "failed",
]);
export type ReleaseStatus = z.infer<typeof ReleaseStatusSchema>;

export const SemverLikeSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[0-9A-Za-z][0-9A-Za-z.\-_+]*$/, "Invalid version string");

export const IsoDateSchema = z
  .string()
  .datetime({ offset: true })
  .or(z.string().datetime()); // allow without offset

export const RuStoreReleaseFlagsSchema = z
  .object({
    enabled: z.boolean().default(false),
    packageName: z.string().min(1).optional(),
    versionId: z.string().min(1).optional(),
    lastUploadAt: IsoDateSchema.optional(),
    lastPublishAt: IsoDateSchema.optional(),
    // Legacy fields for backward compatibility
    appId: z.string().min(1).optional(),
    draftId: z.string().min(1).optional(),
  })
  .strict();

export const HuaweiReleaseFlagsSchema = z
  .object({
    enabled: z.boolean().default(false),
    appId: z.string().min(1).optional(),
    draftId: z.string().min(1).optional(),
    lastUploadAt: IsoDateSchema.optional(),
    lastPublishAt: IsoDateSchema.optional(),
  })
  .strict();

export const StoresFlagsSchema = z
  .object({
    rustore: RuStoreReleaseFlagsSchema.optional(),
    huawei: HuaweiReleaseFlagsSchema.optional(),
  })
  .strict();

export const ReleaseMetadataSchema = z
  .object({
    schemaVersion: z.literal(1).default(1),

    // Identity
    versionCode: z.number().int().positive(),
    versionName: SemverLikeSchema,
    packageName: z.string().min(1),

    // Lifecycle
    status: ReleaseStatusSchema.default("draft"),
    createdAt: IsoDateSchema.default(() => new Date().toISOString()),
    updatedAt: IsoDateSchema.default(() => new Date().toISOString()),

    // Stores
    stores: StoresFlagsSchema.default({}),

    // Optional: arbitrary tags for pipeline/UI
    tags: z.array(z.string().min(1).max(64)).default([]),
  })
  .strict();

export type ReleaseMetadata = z.infer<typeof ReleaseMetadataSchema>;

/**
 * Patch schema for updating release metadata from API/CLI.
 * Version identity is typically immutable, but kept optional for advanced flows.
 */
export const ReleaseMetadataPatchSchema = z
  .object({
    versionCode: z.number().int().positive().optional(),
    versionName: SemverLikeSchema.optional(),
    packageName: z.string().min(1).optional(),
    status: ReleaseStatusSchema.optional(),
    tags: z.array(z.string().min(1).max(64)).optional(),
    stores: z
      .object({
        rustore: RuStoreReleaseFlagsSchema.partial().optional(),
        huawei: HuaweiReleaseFlagsSchema.partial().optional(),
      })
      .optional(),
  })
  .strict();

export type ReleaseMetadataPatch = z.infer<typeof ReleaseMetadataPatchSchema>;

