import fse from "fs-extra";
import path from "node:path";

import type { PublisherCoreContext } from "../../core/publisher/index";
import type { IStoreProvider } from "../../core/publisher/index";
import { err, ok, type ReleaseMetadata, type Result } from "../../core/types/index";

import { RuStoreClient } from "./RuStoreClient";

export class RuStoreProvider implements IStoreProvider {
  private readonly client: RuStoreClient;
  private readonly packageName: string;
  private versionId?: string;

  constructor(private readonly ctx: PublisherCoreContext, client: RuStoreClient, packageName: string) {
    this.client = client;
    this.packageName = packageName;
    // Try to restore versionId from existing release metadata
    this.versionId = ctx.release.stores.rustore?.versionId;
  }

  async uploadArtifacts(artifactsPath: string): Promise<string> {
    const files = (await fse.readdir(artifactsPath).catch(() => []))
      .map((f) => path.join(artifactsPath, f))
      .filter((p) => /\.(apk|aab)$/i.test(p));

    if (files.length === 0) {
      throw new Error(`No .apk/.aab artifacts found in: ${artifactsPath}`);
    }

    // Step 1: Prepare whatsNew (changelog) - RuStore API accepts only a single string, not per-language
    const i18nRoot = this.ctx.core.storage.i18nDir(this.ctx.release.versionCode);
    const langCodes = (await fse.readdir(i18nRoot).catch(() => []))
      .filter((x) => !x.startsWith("."));

    let whatsNew: string | undefined;
    
    // Try to get Russian changelog first, otherwise use first available language
    const preferredLang = langCodes.includes("ru") ? "ru" : langCodes[0];
    if (preferredLang) {
      const ld = this.ctx.core.storage.langDir(this.ctx.release.versionCode, preferredLang);
      whatsNew = await fse.readFile(path.join(ld, "changelog.txt"), "utf-8").catch(() => undefined);
    }

    // Step 2: Create draft version with metadata
    // Note: versionCode and versionName are extracted from APK automatically by RuStore
    console.log(`[RuStore] Creating draft version for ${this.packageName}`);
    const draftResult = await this.client.createDraftVersion({
      packageName: this.packageName,
      whatsNew,
      // versionCode and versionName will be extracted from the APK file when uploaded
    });

    this.versionId = draftResult.versionId;
    console.log(`[RuStore] Draft version created with versionId: ${this.versionId}`);

    // Step 3: Upload APK files to the draft
    for (let i = 0; i < files.length; i++) {
      const filePath = files[i];
      if (/\.aab$/i.test(filePath)) {
        // TODO: implement AAB upload endpoint once confirmed in official docs.
        throw new Error("RuStore AAB upload is not implemented yet (only APK).");
      }
      
      // Per RuStore API docs: isMainApk is REQUIRED (not optional)
      // First APK should be marked as main, others as non-main
      const isMainApk = i === 0;
      
      console.log(`[RuStore] Uploading APK (${i + 1}/${files.length}): ${path.basename(filePath)} [isMainApk=${isMainApk}]`);
      await this.client.uploadApk({
        packageName: this.packageName,
        versionId: this.versionId,
        filePath,
        isMainApk,  // Always true/false, never undefined
        servicesType: "Unknown"
      });
    }
    
    // Step 3.5: Wait a bit for RuStore to process the uploaded APK before proceeding
    console.log(`[RuStore] Waiting 3 seconds for RuStore to process the APK...`);
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Step 4: Store the versionId for later use
    await this.ctx.core.patchRelease(this.ctx.release.versionCode, {
      stores: {
        rustore: {
          enabled: true,
          packageName: this.packageName,
          versionId: this.versionId,
          lastUploadAt: new Date().toISOString(),
        },
      },
    });

    return this.versionId;
  }

  async updateMetadata(metadata: ReleaseMetadata): Promise<void> {
    // RuStore API doesn't support PATCH for version metadata
    // All metadata should be provided during draft creation
    // This method is kept for interface compatibility but does nothing
    console.log("[RuStore] Metadata already set during draft creation, skipping update");
  }

  async publishDraft(): Promise<Result<{ providerDraftId?: string }>> {
    try {
      if (!this.versionId) {
        throw new Error("RuStore versionId is missing. Please upload artifacts first.");
      }

      // Note: We skip commitVersion() here - version stays in draft
      // To send for moderation, call commitVersion() manually via API or web console
      console.log("[RuStore] Draft is ready. Version ID:", this.versionId);
      console.log("[RuStore] To send for moderation, use the commit API endpoint or web console");

      await this.ctx.core.patchRelease(this.ctx.release.versionCode, {
        status: "uploaded",
        stores: {
          rustore: {
            enabled: true,
            packageName: this.packageName,
            versionId: this.versionId,
            lastPublishAt: new Date().toISOString(),
          },
        },
      });

      return ok({
        providerDraftId: this.versionId,
      });
    } catch (e) {
      return err("RUSTORE_PUBLISH_FAILED", (e as Error).message, e);
    }
  }
}

