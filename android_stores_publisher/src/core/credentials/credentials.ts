import { z } from "zod";

export const RuStoreCredentialsSchema = z
  .object({
    // Key-based auth (public API token via signature)
    keyId: z.string().min(1),
    privateKeyBase64: z.string().min(1),

    /**
     * Optional overrides (useful for tests / sandbox).
     * For prod, rely on defaults inside RuStoreClient.
     */
    apiBaseUrl: z.string().url().optional(),

    /**
     * Package name (e.g., "com.example.app") - required for RuStore API.
     */
    packageName: z.string().min(1).optional(),

    /**
     * Optional default appId; can also be stored per-release in release.yaml.
     * @deprecated Use packageName instead
     */
    appId: z.string().min(1).optional(),
  })
  .strict();

export const HuaweiCredentialsSchema = z
  .object({
    clientId: z.string().min(1).optional(),
    clientSecret: z.string().min(1).optional(),
  })
  .strict();

export type RuStoreCredentials = z.infer<typeof RuStoreCredentialsSchema>;
export type HuaweiCredentials = z.infer<typeof HuaweiCredentialsSchema>;

