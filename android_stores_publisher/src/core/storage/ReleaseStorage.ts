import fse from "fs-extra";
import path from "node:path";
import YAML from "yaml";

import {
  ReleaseMetadataSchema,
  type ReleaseMetadata,
  type ReleaseMetadataPatch,
} from "../types/index";

export class ReleaseStorage {
  constructor(
    private readonly opts: {
      storageRoot: string;
    },
  ) {}

  get releasesRoot(): string {
    return path.join(this.opts.storageRoot, "releases");
  }

  releaseDir(versionCode: number): string {
    return path.join(this.releasesRoot, String(versionCode));
  }

  releaseYamlPath(versionCode: number): string {
    return path.join(this.releaseDir(versionCode), "release.yaml");
  }

  i18nDir(versionCode: number): string {
    return path.join(this.releaseDir(versionCode), "i18n");
  }

  langDir(versionCode: number, langCode: string): string {
    return path.join(this.i18nDir(versionCode), langCode);
  }

  artifactsDir(versionCode: number): string {
    return path.join(this.releaseDir(versionCode), "artifacts");
  }

  mediaDir(versionCode: number): string {
    return path.join(this.releaseDir(versionCode), "media");
  }

  screenshotsDir(versionCode: number, deviceType: string): string {
    return path.join(this.mediaDir(versionCode), "screenshots", deviceType);
  }

  async saveArtifactFile(input: {
    versionCode: number;
    filename: string;
    data: Buffer;
  }): Promise<string> {
    const dir = this.artifactsDir(input.versionCode);
    await fse.ensureDir(dir);
    const p = path.join(dir, input.filename);
    await fse.writeFile(p, input.data);
    return p;
  }

  async saveScreenshotFile(input: {
    versionCode: number;
    deviceType: string;
    filename: string;
    data: Buffer;
  }): Promise<string> {
    const dir = this.screenshotsDir(input.versionCode, input.deviceType);
    await fse.ensureDir(dir);
    const p = path.join(dir, input.filename);
    await fse.writeFile(p, input.data);
    return p;
  }

  async ensureBaseDirs(): Promise<void> {
    await fse.ensureDir(this.releasesRoot);
  }

  async ensureReleaseSkeleton(
    versionCode: number,
    languages: string[] = [],
  ): Promise<void> {
    await this.ensureBaseDirs();
    const dir = this.releaseDir(versionCode);
    await fse.ensureDir(dir);
    await fse.ensureDir(this.artifactsDir(versionCode));
    await fse.ensureDir(this.mediaDir(versionCode));
    await fse.ensureDir(this.i18nDir(versionCode));
    for (const lang of languages) {
      const ld = this.langDir(versionCode, lang);
      await fse.ensureDir(ld);
      await fse.ensureFile(path.join(ld, "title.txt"));
      await fse.ensureFile(path.join(ld, "description.txt"));
      await fse.ensureFile(path.join(ld, "changelog.txt"));
    }
  }

  async writeI18n(
    versionCode: number,
    langCode: string,
    input: { title?: string; description?: string; changelog?: string },
  ): Promise<void> {
    const ld = this.langDir(versionCode, langCode);
    await fse.ensureDir(ld);
    if (input.title !== undefined) {
      await fse.writeFile(path.join(ld, "title.txt"), input.title, "utf-8");
    }
    if (input.description !== undefined) {
      await fse.writeFile(
        path.join(ld, "description.txt"),
        input.description,
        "utf-8",
      );
    }
    if (input.changelog !== undefined) {
      await fse.writeFile(
        path.join(ld, "changelog.txt"),
        input.changelog,
        "utf-8",
      );
    }
  }

  async listVersionCodes(): Promise<number[]> {
    await this.ensureBaseDirs();
    const entries = await fse.readdir(this.releasesRoot).catch(() => []);
    const nums = entries
      .map((x) => Number(x))
      .filter((x) => Number.isInteger(x) && x > 0);
    nums.sort((a, b) => b - a);
    return nums;
  }

  async exists(versionCode: number): Promise<boolean> {
    return await fse.pathExists(this.releaseDir(versionCode));
  }

  async readReleaseYaml(versionCode: number): Promise<ReleaseMetadata> {
    const p = this.releaseYamlPath(versionCode);
    const raw = await fse.readFile(p, "utf-8");
    const obj = YAML.parse(raw) as unknown;
    return ReleaseMetadataSchema.parse(obj);
  }

  async writeReleaseYaml(meta: ReleaseMetadata): Promise<void> {
    const validated = ReleaseMetadataSchema.parse(meta);
    const p = this.releaseYamlPath(validated.versionCode);
    await fse.ensureDir(path.dirname(p));
    await fse.writeFile(p, YAML.stringify(validated), "utf-8");
  }

  async createReleaseDraft(input: {
    versionCode: number;
    versionName: string;
    packageName: string;
    languages?: string[];
    i18n?: Record<string, { title?: string; description?: string; changelog?: string }>;
  }): Promise<ReleaseMetadata> {
    const meta = ReleaseMetadataSchema.parse({
      versionCode: input.versionCode,
      versionName: input.versionName,
      packageName: input.packageName,
      status: "draft",
    });

    const langs = Array.from(
      new Set([
        ...(input.languages ?? []),
        ...Object.keys(input.i18n ?? {}),
      ]),
    );

    await this.ensureReleaseSkeleton(meta.versionCode, langs);
    await this.writeReleaseYaml(meta);

    if (input.i18n) {
      for (const [lang, v] of Object.entries(input.i18n)) {
        await this.writeI18n(meta.versionCode, lang, v);
      }
    }
    return meta;
  }

  async patchRelease(
    versionCode: number,
    patch: ReleaseMetadataPatch,
  ): Promise<ReleaseMetadata> {
    const current = await this.readReleaseYaml(versionCode);
    const next: ReleaseMetadata = ReleaseMetadataSchema.parse({
      ...current,
      ...patch,
      stores: {
        ...current.stores,
        ...(patch.stores ?? {}),
      },
      updatedAt: new Date().toISOString(),
    });

    // If versionCode is changed, move folder
    if (next.versionCode !== versionCode) {
      const from = this.releaseDir(versionCode);
      const to = this.releaseDir(next.versionCode);
      await fse.move(from, to, { overwrite: false });
    }

    await this.writeReleaseYaml(next);
    return next;
  }

  async deleteRelease(versionCode: number): Promise<void> {
    await fse.remove(this.releaseDir(versionCode));
  }
}

