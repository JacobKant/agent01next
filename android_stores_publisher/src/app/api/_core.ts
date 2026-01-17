import { PublisherCore } from "@/core/publisher";
import { registerDefaultProviders } from "@/providers/registerProviders";

declare global {
  // eslint-disable-next-line no-var
  var __appdeployerCore: PublisherCore | undefined;
}

export async function getCore(): Promise<PublisherCore> {
  if (!globalThis.__appdeployerCore) {
    const core = new PublisherCore({ projectRoot: process.cwd() });
    await registerDefaultProviders(core);
    globalThis.__appdeployerCore = core;
  }
  return globalThis.__appdeployerCore;
}

