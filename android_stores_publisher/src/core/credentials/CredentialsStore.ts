import { RuStoreCredentialsSchema, type RuStoreCredentials } from "./credentials";

export class CredentialsStore {
  constructor() {}

  async getRuStoreCredentials(): Promise<RuStoreCredentials | undefined> {
    const parsed = RuStoreCredentialsSchema.safeParse({
      keyId: process.env.RUSTORE_KEY_ID,
      privateKeyBase64: process.env.RUSTORE_PRIVATE_KEY_BASE_64,
      apiBaseUrl: process.env.RUSTORE_API_BASE_URL,
      packageName: process.env.RUSTORE_PACKAGE_NAME,
      appId: process.env.RUSTORE_APP_ID,
    });
    
    if (!parsed.success) {
      // Логируем ошибки валидации для отладки
      console.error("RuStore credentials validation failed:", parsed.error.format());
      return undefined;
    }
    return parsed.data;
  }
}

