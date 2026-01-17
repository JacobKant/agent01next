"use client";

import { useEffect, useMemo, useState } from "react";

type Release = {
  versionCode: number;
  versionName: string;
  packageName: string;
  status: string;
  updatedAt?: string;
};

type LangEntry = {
  lang: string;
  title: string;
  description: string;
  changelog: string;
};

export default function Home() {
  const [versionCode, setVersionCode] = useState<string>("100001");
  const [versionName, setVersionName] = useState<string>("1.0.1");
  const [packageName, setPackageName] = useState<string>(
    "com.example.appdeployer.demo",
  );
  const [langs, setLangs] = useState<LangEntry[]>([
    { lang: "ru", title: "", description: "", changelog: "" },
  ]);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<Release | null>(null);

  const [releases, setReleases] = useState<Release[]>([]);
  const [storeId, setStoreId] = useState<"rustore" | "huawei">("rustore");
  const [deploying, setDeploying] = useState<number | null>(null);
  const [deployResult, setDeployResult] = useState<any>(null);

  const [uploadVersionCode, setUploadVersionCode] = useState<number | null>(null);
  const [artifactFiles, setArtifactFiles] = useState<FileList | null>(null);
  const [screenshotFiles, setScreenshotFiles] = useState<FileList | null>(null);
  const [deviceType, setDeviceType] = useState<string>("phone");
  const [uploadBusy, setUploadBusy] = useState<"artifacts" | "screenshots" | null>(null);
  const [uploadResult, setUploadResult] = useState<any>(null);

  const canSubmit = useMemo(() => {
    const vc = Number(versionCode);
    if (!Number.isInteger(vc) || vc <= 0) return false;
    if (!versionName.trim()) return false;
    if (!packageName.trim()) return false;
    if (langs.length === 0) return false;
    if (langs.some((l) => !l.lang.trim())) return false;
    return true;
  }, [versionCode, versionName, packageName, langs]);

  async function refresh() {
    const resp = await fetch("/api/releases", { cache: "no-store" });
    const data = (await resp.json()) as Release[];
    setReleases(data);
    if (uploadVersionCode === null && data.length > 0) {
      setUploadVersionCode(data[0].versionCode);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setCreated(null);

    try {
      const i18n: Record<string, any> = {};
      for (const l of langs) {
        i18n[l.lang.trim()] = {
          title: l.title,
          description: l.description,
          changelog: l.changelog,
        };
      }
      const payload = {
        versionCode: Number(versionCode),
        versionName,
        packageName,
        i18n,
      };

      const resp = await fetch("/api/releases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await resp.json().catch(() => null);
      if (!resp.ok) {
        throw new Error(
          json?.error ? `${json.error}: ${JSON.stringify(json.details)}` : "Failed",
        );
      }
      setCreated(json as Release);
      await refresh();
    } catch (e2) {
      setError((e2 as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function deploy(versionCodeToDeploy: number) {
    setDeploying(versionCodeToDeploy);
    setDeployResult(null);
    setError(null);
    try {
      const resp = await fetch(`/api/releases/${versionCodeToDeploy}/deploy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeId }),
      });
      const json = await resp.json().catch(() => null);
      if (!resp.ok) {
        throw new Error(
          json?.message
            ? `${json.error ?? "DEPLOY_FAILED"}: ${json.message}`
            : "DEPLOY_FAILED",
        );
      }
      setDeployResult(json);
      await refresh();
    } catch (e2) {
      setError((e2 as Error).message);
    } finally {
      setDeploying(null);
    }
  }

  async function uploadArtifacts() {
    if (uploadVersionCode === null) return;
    if (!artifactFiles || artifactFiles.length === 0) return;
    setUploadBusy("artifacts");
    setUploadResult(null);
    setError(null);
    try {
      const fd = new FormData();
      for (const f of Array.from(artifactFiles)) fd.append("file", f);
      const resp = await fetch(`/api/releases/${uploadVersionCode}/artifacts`, {
        method: "POST",
        body: fd,
      });
      const json = await resp.json().catch(() => null);
      if (!resp.ok) {
        throw new Error(
          json?.message
            ? `${json.error ?? "UPLOAD_FAILED"}: ${json.message}`
            : "UPLOAD_FAILED",
        );
      }
      setUploadResult({ kind: "artifacts", ...json });
    } catch (e2) {
      setError((e2 as Error).message);
    } finally {
      setUploadBusy(null);
    }
  }

  async function uploadScreenshots() {
    if (uploadVersionCode === null) return;
    if (!screenshotFiles || screenshotFiles.length === 0) return;
    setUploadBusy("screenshots");
    setUploadResult(null);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("deviceType", deviceType);
      for (const f of Array.from(screenshotFiles)) fd.append("file", f);
      const resp = await fetch(
        `/api/releases/${uploadVersionCode}/media/screenshots`,
        {
          method: "POST",
          body: fd,
        },
      );
      const json = await resp.json().catch(() => null);
      if (!resp.ok) {
        throw new Error(
          json?.message
            ? `${json.error ?? "UPLOAD_FAILED"}: ${json.message}`
            : "UPLOAD_FAILED",
        );
      }
      setUploadResult({ kind: "screenshots", ...json });
    } catch (e2) {
      setError((e2 as Error).message);
    } finally {
      setUploadBusy(null);
    }
  }

  function addLang() {
    setLangs((prev) => [
      ...prev,
      { lang: "en", title: "", description: "", changelog: "" },
    ]);
  }

  function removeLang(idx: number) {
    setLangs((prev) => prev.filter((_, i) => i !== idx));
  }

  function updateLang(idx: number, patch: Partial<LangEntry>) {
    setLangs((prev) => prev.map((x, i) => (i === idx ? { ...x, ...patch } : x)));
  }

  return (
    <main style={{ fontFamily: "system-ui", padding: 24, maxWidth: 980 }}>
      <h1 style={{ margin: 0 }}>AppDeployer</h1>
      <p style={{ marginTop: 8, color: "#444" }}>
        Создание релиза через форму → данные раскладываются в{" "}
        <code>storage/releases/&lt;versionCode&gt;/</code>.
      </p>

      <section style={{ marginTop: 16 }}>
        <h2 style={{ margin: 0 }}>Релизы</h2>
        <div style={{ marginTop: 10 }}>
          {releases.length === 0 ? (
            <div style={{ color: "#666" }}>Пока нет релизов (или release.yaml невалиден).</div>
          ) : (
            <>
              <div
                style={{
                  display: "flex",
                  gap: 12,
                  alignItems: "center",
                  marginBottom: 10,
                }}
              >
                <div style={{ color: "#444" }}>Store для Deploy:</div>
                <select
                  value={storeId}
                  onChange={(e) => setStoreId(e.target.value as any)}
                >
                  <option value="rustore">rustore</option>
                  <option value="huawei">huawei</option>
                </select>
                <div style={{ color: "#666" }}>
                  (для RuStore нужен артефакт в <code>artifacts/</code>)
                </div>
              </div>

            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ textAlign: "left", borderBottom: "1px solid #eee" }}>
                  <th style={{ padding: "8px 6px" }}>versionCode</th>
                  <th style={{ padding: "8px 6px" }}>versionName</th>
                  <th style={{ padding: "8px 6px" }}>packageName</th>
                  <th style={{ padding: "8px 6px" }}>status</th>
                  <th style={{ padding: "8px 6px" }} />
                </tr>
              </thead>
              <tbody>
                {releases.map((r) => (
                  <tr key={r.versionCode} style={{ borderBottom: "1px solid #f5f5f5" }}>
                    <td style={{ padding: "8px 6px" }}>{r.versionCode}</td>
                    <td style={{ padding: "8px 6px" }}>{r.versionName}</td>
                    <td style={{ padding: "8px 6px" }}>{r.packageName}</td>
                    <td style={{ padding: "8px 6px" }}>{r.status}</td>
                    <td style={{ padding: "8px 6px" }}>
                      <button
                        type="button"
                        onClick={() => deploy(r.versionCode)}
                        disabled={deploying !== null}
                      >
                        {deploying === r.versionCode ? "Deploy..." : "Deploy"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </>
          )}
        </div>
      </section>

      {deployResult ? (
        <section style={{ marginTop: 18 }}>
          <h2 style={{ margin: 0 }}>Deploy result</h2>
          <pre style={{ marginTop: 10, background: "#fafafa", padding: 12, borderRadius: 12 }}>
            {JSON.stringify(deployResult, null, 2)}
          </pre>
        </section>
      ) : null}

      <section
        style={{
          border: "1px solid #eee",
          borderRadius: 12,
          padding: 16,
          marginTop: 18,
        }}
      >
        <h2 style={{ margin: 0 }}>Новый релиз</h2>

        <form onSubmit={onSubmit} style={{ marginTop: 12 }}>
          <div style={{ display: "grid", gap: 12 }}>
            <label style={{ display: "grid", gap: 6 }}>
              <div>versionCode</div>
              <input
                value={versionCode}
                onChange={(e) => setVersionCode(e.target.value)}
                inputMode="numeric"
              />
            </label>

            <label style={{ display: "grid", gap: 6 }}>
              <div>versionName</div>
              <input value={versionName} onChange={(e) => setVersionName(e.target.value)} />
            </label>

            <label style={{ display: "grid", gap: 6 }}>
              <div>packageName</div>
              <input
                value={packageName}
                onChange={(e) => setPackageName(e.target.value)}
              />
            </label>

            <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
              <h3 style={{ margin: 0 }}>i18n</h3>
              <button type="button" onClick={addLang}>
                + Добавить язык
              </button>
            </div>

            {langs.map((l, idx) => (
              <div
                key={idx}
                style={{
                  border: "1px solid #f0f0f0",
                  borderRadius: 12,
                  padding: 12,
                  display: "grid",
                  gap: 10,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                  <label style={{ display: "grid", gap: 6, flex: 1 }}>
                    <div>lang (ru / en / en-US)</div>
                    <input
                      value={l.lang}
                      onChange={(e) => updateLang(idx, { lang: e.target.value })}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => removeLang(idx)}
                    disabled={langs.length <= 1}
                  >
                    Удалить
                  </button>
                </div>

                <label style={{ display: "grid", gap: 6 }}>
                  <div>title.txt</div>
                  <input
                    value={l.title}
                    onChange={(e) => updateLang(idx, { title: e.target.value })}
                  />
                </label>

                <label style={{ display: "grid", gap: 6 }}>
                  <div>description.txt</div>
                  <textarea
                    rows={4}
                    value={l.description}
                    onChange={(e) => updateLang(idx, { description: e.target.value })}
                  />
                </label>

                <label style={{ display: "grid", gap: 6 }}>
                  <div>changelog.txt</div>
                  <textarea
                    rows={3}
                    value={l.changelog}
                    onChange={(e) => updateLang(idx, { changelog: e.target.value })}
                  />
                </label>
              </div>
            ))}

            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <button type="submit" disabled={!canSubmit || busy}>
                {busy ? "Создаю..." : "Создать релиз"}
              </button>
              <button type="button" onClick={refresh} disabled={busy}>
                Обновить список
              </button>
            </div>
          </div>
        </form>

        {error ? (
          <pre style={{ marginTop: 12, color: "#b00020", whiteSpace: "pre-wrap" }}>
            {error}
          </pre>
        ) : null}

        {created ? (
          <pre style={{ marginTop: 12, background: "#fafafa", padding: 12, borderRadius: 12 }}>
            {JSON.stringify(created, null, 2)}
          </pre>
        ) : null}
      </section>

      <section
        style={{
          border: "1px solid #eee",
          borderRadius: 12,
          padding: 16,
          marginTop: 18,
        }}
      >
        <h2 style={{ margin: 0 }}>Upload</h2>
        <p style={{ marginTop: 8, color: "#666" }}>
          Файлы сохраняются в FS snapshot (и будут видны в{" "}
          <code>storage/releases/&lt;versionCode&gt;/</code>).
        </p>

        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span>Release:</span>
            <select
              value={uploadVersionCode ?? ""}
              onChange={(e) => setUploadVersionCode(Number(e.target.value))}
              disabled={releases.length === 0}
            >
              {releases.map((r) => (
                <option key={r.versionCode} value={r.versionCode}>
                  {r.versionCode} ({r.versionName})
                </option>
              ))}
            </select>
          </label>
        </div>

        <div style={{ marginTop: 12, display: "grid", gap: 14 }}>
          <div style={{ border: "1px solid #f0f0f0", borderRadius: 12, padding: 12 }}>
            <h3 style={{ margin: 0 }}>Artifacts (.apk/.aab)</h3>
            <div style={{ marginTop: 10, display: "flex", gap: 12, alignItems: "center" }}>
              <input
                type="file"
                multiple
                accept=".apk,.aab"
                onChange={(e) => setArtifactFiles(e.target.files)}
              />
              <button
                type="button"
                onClick={uploadArtifacts}
                disabled={uploadBusy !== null || !artifactFiles || artifactFiles.length === 0 || uploadVersionCode === null}
              >
                {uploadBusy === "artifacts" ? "Uploading..." : "Upload artifacts"}
              </button>
            </div>
          </div>

          <div style={{ border: "1px solid #f0f0f0", borderRadius: 12, padding: 12 }}>
            <h3 style={{ margin: 0 }}>Screenshots (.png/.jpg/.webp)</h3>
            <div style={{ marginTop: 10, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
              <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span>deviceType:</span>
                <input value={deviceType} onChange={(e) => setDeviceType(e.target.value)} />
              </label>
              <input
                type="file"
                multiple
                accept=".png,.jpg,.jpeg,.webp"
                onChange={(e) => setScreenshotFiles(e.target.files)}
              />
              <button
                type="button"
                onClick={uploadScreenshots}
                disabled={uploadBusy !== null || !screenshotFiles || screenshotFiles.length === 0 || uploadVersionCode === null}
              >
                {uploadBusy === "screenshots" ? "Uploading..." : "Upload screenshots"}
              </button>
            </div>
            <div style={{ marginTop: 8, color: "#666" }}>
              Путь: <code>media/screenshots/&lt;deviceType&gt;/</code>
            </div>
          </div>
        </div>

        {uploadResult ? (
          <pre style={{ marginTop: 12, background: "#fafafa", padding: 12, borderRadius: 12 }}>
            {JSON.stringify(uploadResult, null, 2)}
          </pre>
        ) : null}
      </section>

      <p style={{ marginTop: 18, color: "#666" }}>
        API: <code>/api/releases</code>
      </p>
    </main>
  );
}

