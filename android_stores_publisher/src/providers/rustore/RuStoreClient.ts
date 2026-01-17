import crypto from "node:crypto";
import fs from "node:fs/promises";

import fse from "fs-extra";
import path from "node:path";

import type { RuStoreCredentials } from "../../core/credentials/index";

type AuthState = { kind: "publicToken"; token: string; expiresAtMs: number };

export class RuStoreClient {
  private auth?: AuthState;

  constructor(private readonly creds: RuStoreCredentials) {}

  private get apiBaseUrl(): string {
    return this.creds.apiBaseUrl ?? "https://public-api.rustore.ru";
  }

  private async getAuthHeaders(): Promise<Record<string, string>> {
    if (this.auth && this.auth.expiresAtMs > Date.now() + 60_000) {
      return { "Public-Token": this.auth.token };
    }

    // Key-based public token (signature)
    const authUrl = `${this.apiBaseUrl}/public/auth/`;
    const timestamp = new Date().toISOString();
    const signature = this.sign(this.creds.keyId, timestamp, this.creds.privateKeyBase64);
    const resp = await fetch(authUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        keyId: this.creds.keyId,
        timestamp,
        signature,
      }),
    });
    if (!resp.ok) {
      throw new Error(
        `RuStore public auth failed: ${resp.status} ${await resp.text()}`,
      );
    }
    const j = (await resp.json()) as unknown as {
      body?: { jwe?: string; ttl?: number };
      jwe?: string;
      ttl?: number;
    };
    const token = j.body?.jwe ?? j.jwe;
    const ttlSec = j.body?.ttl ?? j.ttl ?? 900;
    if (!token) throw new Error("RuStore public auth: token not found in response");
    this.auth = {
      kind: "publicToken",
      token,
      expiresAtMs: Date.now() + ttlSec * 1000,
    };
    return { "Public-Token": token };
  }

  private sign(keyId: string, timestamp: string, privateKeyBase64: string): string {
    // Per RuStore docs: sign SHA-512 over (keyId + timestamp)
    // Приватный ключ приходит в Base64, декодируем его
    const privateKeyBuffer = Buffer.from(privateKeyBase64, "base64");
    const decodedString = privateKeyBuffer.toString("utf-8");
    
    // Пробуем разные форматы ключа
    let privateKey: string | crypto.KeyObject | undefined;
    let lastError: Error | null = null;
    
    // 1. Пробуем как PEM строку (если содержит BEGIN)
    if (decodedString.includes("-----BEGIN")) {
      try {
        // Проверяем, что ключ валидный
        crypto.createPrivateKey(decodedString);
        privateKey = decodedString;
      } catch (e) {
        lastError = e as Error;
      }
    }
    
    // 2. Пробуем как PEM строку (даже без BEGIN - может быть в одной строке)
    if (!privateKey) {
      try {
        privateKey = crypto.createPrivateKey(decodedString);
      } catch (e) {
        lastError = e as Error;
      }
    }
    
    // 3. Пробуем как PKCS8 DER
    if (!privateKey) {
      try {
        privateKey = crypto.createPrivateKey({
          key: privateKeyBuffer,
          format: "der",
          type: "pkcs8",
        });
      } catch (e) {
        lastError = e as Error;
      }
    }
    
    // 4. Пробуем как PKCS1 DER
    if (!privateKey) {
      try {
        privateKey = crypto.createPrivateKey({
          key: privateKeyBuffer,
          format: "der",
          type: "pkcs1",
        });
      } catch (e) {
        lastError = e as Error;
      }
    }
    
    if (!privateKey) {
      throw new Error(
        `Не удалось декодировать приватный ключ из Base64. ` +
        `Проверьте формат ключа. Последняя ошибка: ${lastError?.message}`,
      );
    }
    
    const payload = `${keyId}${timestamp}`;
    const signer = crypto.createSign("RSA-SHA512");
    signer.update(payload);
    signer.end();
    return signer.sign(privateKey).toString("base64");
  }

  private url(endpoint: string): string {
    return endpoint.startsWith("http") ? endpoint : `${this.apiBaseUrl}${endpoint}`;
  }

  async requestJson<T>(
    endpoint: string,
    init: Omit<RequestInit, "headers"> & { headers?: Record<string, string> } = {},
  ): Promise<T> {
    const auth = await this.getAuthHeaders();
    const url = this.url(endpoint);
    
    // Для FormData НЕ добавляем Content-Type (должен быть автоматический с boundary)
    const isFormData = init.body instanceof FormData;
    
    const requestInit = {
      ...init,
      headers: {
        ...auth,
        ...init.headers,
      },
    };

    console.log("[RuStore Request]", {
      method: init.method || "GET",
      url,
      headers: requestInit.headers,
      body: init.body 
        ? (typeof init.body === "string" 
            ? init.body 
            : isFormData 
              ? `[FormData with ${(init.body as FormData).entries ? Array.from((init.body as FormData).entries()).map(([k]) => k).join(', ') : 'fields'}]`
              : "[Binary/Buffer]")
        : undefined,
      isFormData,
    });

    const resp = await fetch(url, requestInit);
    
    const responseText = await resp.text();
    
    console.log("[RuStore Response]", {
      status: resp.status,
      statusText: resp.statusText,
      headers: Object.fromEntries(resp.headers.entries()),
      bodyLength: responseText.length,
      body: responseText.length > 1000 ? responseText.substring(0, 1000) + "..." : responseText,
    });

    if (!resp.ok) {
      throw new Error(`RuStore request failed (${resp.status}) ${endpoint}: ${responseText}`);
    }
    
    // Some endpoints may return empty body (204) or non-JSON response
    if (!responseText || responseText.trim().length === 0) {
      console.log("[RuStore] Empty response body, returning undefined");
      return undefined as T;
    }
    
    try {
      return JSON.parse(responseText) as T;
    } catch (e) {
      console.log("[RuStore] Failed to parse response as JSON:", e);
      console.log("[RuStore] Raw response:", responseText);
      throw new Error(`Failed to parse RuStore response as JSON: ${responseText.substring(0, 200)}`);
    }
  }

  async createDraftVersion(input: {
    packageName: string;
    whatsNew?: string;
    appName?: string;
    appType?: "GAMES" | "MAIN";
    categories?: string[];
    ageLegal?: string;
    shortDescription?: string;
    fullDescription?: string;
    moderInfo?: string;
    priceValue?: number;
    seoTagIds?: number[];
    publishType?: "MANUAL" | "INSTANTLY" | "DELAYED";
    publishDateTime?: string;
    partialValue?: number;
  }): Promise<{ versionId: string; raw: unknown }> {
    const endpoint = `/public/v1/application/${encodeURIComponent(input.packageName)}/version`;

    // Build request body according to RuStore API documentation
    // All fields are optional - if omitted, values from active version will be used
    const body: any = {};

    // Add what's new (changelog) as a single string (max 5000 chars)
    if (input.whatsNew) {
      body.whatsNew = input.whatsNew.substring(0, 5000); // Respect API limit
    }

    // Add other optional fields if provided
    if (input.appName) body.appName = input.appName;
    if (input.appType) body.appType = input.appType;
    if (input.categories) body.categories = input.categories;
    if (input.ageLegal) body.ageLegal = input.ageLegal;
    if (input.shortDescription) body.shortDescription = input.shortDescription;
    if (input.fullDescription) body.fullDescription = input.fullDescription;
    if (input.moderInfo) body.moderInfo = input.moderInfo;
    if (input.priceValue !== undefined) body.priceValue = input.priceValue;
    if (input.seoTagIds) body.seoTagIds = input.seoTagIds;
    if (input.publishType) body.publishType = input.publishType;
    if (input.publishDateTime) body.publishDateTime = input.publishDateTime;
    if (input.partialValue !== undefined) body.partialValue = input.partialValue;

    const raw = await this.requestJson<unknown>(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    // Extract versionId from response
    // RuStore API returns: {"code":"OK","body":2064450896,...}
    // where body is the versionId directly as a number
    const versionId =
      (raw as any)?.body?.versionId ??
      (raw as any)?.versionId ??
      (raw as any)?.body; // body can be the versionId itself

    if (!versionId) {
      throw new Error(`RuStore createDraftVersion: versionId not found in response: ${JSON.stringify(raw)}`);
    }

    return { versionId: String(versionId), raw };
  }

  async uploadApk(input: {
    packageName: string;
    versionId: string;
    filePath: string;
    isMainApk: boolean;  // REQUIRED by RuStore API (not optional)
    servicesType?: "HMS" | "Unknown";
  }): Promise<{ raw: unknown }> {
    // Per RuStore docs: POST /public/v1/application/{packageName}/version/{versionId}/apk
    // Field name must be "file" (from official docs)
    // isMainApk is REQUIRED - requests without this flag will be rejected
    // Maximum file size: 5GB
    // curl --form 'file=@"path/to/file.apk"'
    
    console.log(`[RuStore] Starting APK upload for package ${input.packageName}, versionId ${input.versionId}`);
    
    const qp = new URLSearchParams();
    // isMainApk is required by API
    qp.set("isMainApk", String(input.isMainApk));
    if (input.servicesType) qp.set("servicesType", input.servicesType);

    const endpoint = `/public/v1/application/${encodeURIComponent(
      input.packageName,
    )}/version/${encodeURIComponent(input.versionId)}/apk?${qp.toString()}`;

    // Проверяем существование файла
    const fileExists = await fse.pathExists(input.filePath);
    if (!fileExists) {
      throw new Error(`APK file not found: ${input.filePath}`);
    }
    
    const stats = await fs.stat(input.filePath);
    console.log(`[RuStore] File stats: size=${stats.size} bytes, path=${input.filePath}`);

    // Try modern openAsBlob first (Node.js 19.8+), fallback to Buffer
    let blob: Blob;
    try {
      // Modern approach with fs.openAsBlob (if available)
      const fsModule = await import("node:fs");
      if ("openAsBlob" in fsModule) {
        console.log("[RuStore] Using fs.openAsBlob for APK upload");
        blob = await (fsModule as any).openAsBlob(input.filePath, {
          type: "application/vnd.android.package-archive",
        });
      } else {
        throw new Error("openAsBlob not available");
      }
    } catch (e) {
      // Fallback: read file into buffer and create Blob
      console.log("[RuStore] Using Buffer fallback for APK upload");
      const buffer = await fs.readFile(input.filePath);
      blob = new Blob([buffer], {
        type: "application/vnd.android.package-archive",
      });
    }
    
    const fileName = path.basename(input.filePath);
    const form = new FormData();
    
    // According to RuStore docs, field name MUST be "file"
    // Используем File объект вместо просто Blob для лучшей совместимости
    const file = new File([blob], fileName, {
      type: "application/vnd.android.package-archive",
    });
    
    form.append("file", file, fileName);

    console.log(`[RuStore] Prepared FormData: fileName=${fileName}, fileSize=${blob.size} bytes, type=${file.type}`);
    console.log(`[RuStore] Uploading to endpoint: ${endpoint}`);

    const raw = await this.requestJson<unknown>(endpoint, {
      method: "POST",
      body: form,
      // ВАЖНО: Content-Type НЕ устанавливаем вручную!
      // fetch автоматически установит multipart/form-data с правильным boundary
    });

    console.log(`[RuStore] APK upload completed successfully`);

    return { raw };
  }

  async patchVersionMetadata(input: {
    packageName: string;
    versionId: string;
    payload: unknown;
  }): Promise<void> {
    const endpoint = `/public/v1/application/${encodeURIComponent(
      input.packageName,
    )}/version/${encodeURIComponent(input.versionId)}`;
    await this.requestJson(endpoint, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input.payload),
    });
  }

  async commitVersion(input: { 
    packageName: string; 
    versionId: string;
    priorityUpdate?: boolean;
  }): Promise<unknown> {
    // Correct RuStore API method: /commit (not /submit) - sends version for moderation
    const qp = new URLSearchParams();
    if (input.priorityUpdate !== undefined) {
      qp.set("priorityUpdate", String(input.priorityUpdate));
    }
    
    const endpoint = `/public/v1/application/${encodeURIComponent(
      input.packageName,
    )}/version/${encodeURIComponent(input.versionId)}/commit?${qp.toString()}`;
    
    // Retry logic for 502/503 errors (server temporary issues)
    const maxRetries = 3;
    let lastError: Error | undefined;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Add delay before commit to let RuStore process the uploaded APK
        if (attempt > 1) {
          const delayMs = attempt * 2000; // 2s, 4s, 6s
          console.log(`[RuStore] Retry attempt ${attempt}/${maxRetries} after ${delayMs}ms delay...`);
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
        
        return await this.requestJson(endpoint, { method: "POST" });
      } catch (error) {
        lastError = error as Error;
        const is502or503 = lastError.message.includes("(502)") || lastError.message.includes("(503)");
        
        if (is502or503 && attempt < maxRetries) {
          console.log(`[RuStore] Got ${is502or503 ? '502/503' : 'error'}, will retry...`);
          continue;
        }
        
        throw error;
      }
    }
    
    throw lastError || new Error("Commit failed after retries");
  }
}

