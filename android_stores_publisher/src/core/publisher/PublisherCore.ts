import path from "node:path";

import { CredentialsStore } from "../credentials/index";
import { ReleaseStorage } from "../storage/index";
import type { ReleaseMetadata, ReleaseMetadataPatch, StoreId } from "../types/index";

import { ProviderRegistry } from "./ProviderRegistry";
import type { IStoreProvider } from "./IStoreProvider";

export type PublisherCoreContext = {
  core: PublisherCore;
  storeId: StoreId;
  release: ReleaseMetadata;
};

export class PublisherCore {
  readonly storage: ReleaseStorage;
  readonly credentials: CredentialsStore;
  readonly providers = new ProviderRegistry<PublisherCoreContext>();

  constructor(
    private readonly opts: {
      projectRoot: string;
      storageRoot?: string;
    },
  ) {
    const storageRoot =
      opts.storageRoot ?? path.join(opts.projectRoot, "storage");
    this.storage = new ReleaseStorage({ storageRoot });
    this.credentials = new CredentialsStore();
  }

  registerProvider(storeId: StoreId, factory: (ctx: PublisherCoreContext) => IStoreProvider): void {
    this.providers.register(storeId, factory);
  }

  async listReleases(): Promise<ReleaseMetadata[]> {
    const vcs = await this.storage.listVersionCodes();
    const out: ReleaseMetadata[] = [];
    for (const vc of vcs) {
      try {
        out.push(await this.storage.readReleaseYaml(vc));
      } catch {
        // ignore invalid/missing release.yaml to keep UI resilient
      }
    }
    return out;
  }

  async getRelease(versionCode: number): Promise<ReleaseMetadata> {
    return await this.storage.readReleaseYaml(versionCode);
  }

  async createReleaseDraft(input: {
    versionCode: number;
    versionName: string;
    packageName: string;
    languages?: string[];
    i18n?: Record<string, { title?: string; description?: string; changelog?: string }>;
  }): Promise<ReleaseMetadata> {
    return await this.storage.createReleaseDraft(input);
  }

  async patchRelease(
    versionCode: number,
    patch: ReleaseMetadataPatch,
  ): Promise<ReleaseMetadata> {
    return await this.storage.patchRelease(versionCode, patch);
  }

  async deleteRelease(versionCode: number): Promise<void> {
    await this.storage.deleteRelease(versionCode);
  }

  async createProvider(storeId: StoreId, release: ReleaseMetadata): Promise<IStoreProvider> {
    return this.providers.create(storeId, {
      core: this,
      storeId,
      release,
    });
  }
}

