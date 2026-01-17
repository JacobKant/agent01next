#!/usr/bin/env node
import path from "node:path";
import process from "node:process";

import "dotenv/config";

import { Command } from "commander";

import { PublisherCore } from "../core/publisher/index";
import { StoreIdSchema } from "../core/types/index";
import { registerDefaultProviders } from "../providers/registerProviders";

const program = new Command();

program
  .name("appdeployer")
  .description("Publish Android releases to stores (FS snapshot as Source of Truth)")
  .version("0.1.0");

program
  .command("deploy")
  .description("Deploy a release draft to a chosen store")
  .argument("[storeId]", "Store id (rustore|huawei)")
  .argument("[versionCode]", "versionCode from storage/releases/<versionCode>/")
  .option("--store <storeId>", "Store id (rustore|huawei)")
  .option("--version-code <number>", "versionCode from storage/releases/<versionCode>/")
  .option("--project-root <path>", "Project root (defaults to cwd)")
  .action(async (storeIdArg, versionCodeArg, opts) => {
    const projectRoot = path.resolve(opts.projectRoot ?? process.cwd());
    const storeIdValue = opts.store ?? storeIdArg;
    if (!storeIdValue) {
      throw new Error("Store id is required (use --store <storeId> or provide as first argument)");
    }
    const storeId = StoreIdSchema.parse(storeIdValue);
    
    const versionCodeValue = opts.versionCode ?? versionCodeArg;
    if (!versionCodeValue) {
      throw new Error("Version code is required (use --version-code <number> or provide as second argument)");
    }
    const versionCode = Number(versionCodeValue);
    if (!Number.isInteger(versionCode) || versionCode <= 0) {
      throw new Error("--version-code must be a positive integer");
    }

    const core = new PublisherCore({ projectRoot });
    await registerDefaultProviders(core);

    const release = await core.getRelease(versionCode);
    
    // Проверяем наличие провайдера перед использованием
    if (!core.providers.has(storeId)) {
      throw new Error(
        `No provider registered for storeId="${storeId}".\n` +
        `Провайдер не зарегистрирован, так как отсутствуют credentials.\n` +
        `Настройте переменные окружения в файле .env (RUSTORE_KEY_ID, RUSTORE_PRIVATE_KEY_BASE_64)\n` +
        `См. env.example для примера настройки.`,
      );
    }
    
    const provider = await core.createProvider(storeId, release);

    const artifactsPath = core.storage.artifactsDir(versionCode);

    const providerDraftId = await provider.uploadArtifacts(artifactsPath);
    const latest = await core.getRelease(versionCode);
    await provider.updateMetadata(latest);
    const result = await provider.publishDraft();

    if (!result.ok) {
      console.error("FAILED:", result.error.code, result.error.message);
      process.exit(1);
    }

    console.log(
      JSON.stringify(
        {
          ok: true,
          storeId,
          versionCode,
          providerDraftId,
          publish: result.value,
        },
        null,
        2,
      ),
    );
  });

async function main() {
  await program.parseAsync(process.argv);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

