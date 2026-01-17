import type { PublisherCore } from "../core/publisher/index";

import { RuStoreClient } from "./rustore/RuStoreClient";
import { RuStoreProvider } from "./rustore/RuStoreProvider";

/**
 * Register built-in providers.
 * Keep this separate from PublisherCore to preserve Clean Architecture.
 */
export async function registerDefaultProviders(core: PublisherCore): Promise<void> {
  const rustoreCreds = await core.credentials.getRuStoreCredentials();
  if (rustoreCreds) {
    const client = new RuStoreClient(rustoreCreds);
    const defaultPackageName = rustoreCreds.packageName;

    core.registerProvider("rustore", (ctx) => {
      const packageName = ctx.release.stores.rustore?.packageName ?? defaultPackageName;
      if (!packageName) {
        throw new Error(
          'RuStore packageName is missing. Set it in release.yaml stores.rustore.packageName or in RUSTORE_PACKAGE_NAME environment variable.',
        );
      }
      return new RuStoreProvider(ctx, client, packageName);
    });
  }
}

