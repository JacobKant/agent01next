import type { ReleaseMetadata, Result } from "../types/index";

export interface IStoreProvider {
  /**
   * Upload artifacts from a local folder (e.g. /artifacts).
   * Returns a provider-specific draft identifier (or upload session id).
   */
  uploadArtifacts(path: string): Promise<string>;

  /**
   * Update metadata at provider side based on local release.yaml + i18n snapshot.
   */
  updateMetadata(metadata: ReleaseMetadata): Promise<void>;

  /**
   * Publish previously prepared draft (or latest uploaded build).
   */
  publishDraft(): Promise<Result<{ providerDraftId?: string }>>;
}

