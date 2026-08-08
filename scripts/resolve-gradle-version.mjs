#!/usr/bin/env node
// Gradle 최신 안정화 버전 해석기.
// 공식 Gradle versions/current 엔드포인트만 신뢰하고, snapshot/RC/broken은 거부한다.
//
// 출력(JSON):
// {
//   "gradle": "9.7.0",
//   "gradleDistributionSha256": "...",
//   "gradleDistributionUrl": "https://services.gradle.org/distributions/gradle-9.7.0-bin.zip",
//   "sourceUrl": "https://services.gradle.org/versions/current"
// }

import { pathToFileURL } from "node:url";
import * as fs from "node:fs";
import * as path from "node:path";

export const GRADLE_CURRENT_URL = "https://services.gradle.org/versions/current";

export function parseGradleCurrentResponse(data, sourceUrl = GRADLE_CURRENT_URL) {
  if (!data || typeof data !== "object") {
    throw new Error("Gradle current 응답이 객체가 아닙니다");
  }
  if (!data.current || !data.released || !data.final) {
    throw new Error(`Gradle current 응답이 안정 릴리스가 아닙니다: ${JSON.stringify(data)}`);
  }
  if (data.snapshot || data.nightly || data.releaseNightly || data.activeRc || data.broken) {
    throw new Error(`Gradle current 응답이 preview/RC/broken 상태입니다: ${JSON.stringify(data)}`);
  }
  if (typeof data.version !== "string" || !/^\d+\.\d+(?:\.\d+)?$/.test(data.version)) {
    throw new Error(`Gradle 버전 형식 오류: ${data.version}`);
  }
  if (typeof data.downloadUrl !== "string" || !data.downloadUrl.includes(`/gradle-${data.version}-bin.zip`)) {
    throw new Error(`Gradle 배포 URL 형식 오류: ${data.downloadUrl}`);
  }
  if (typeof data.checksum !== "string" || !/^[a-f0-9]{64}$/i.test(data.checksum)) {
    throw new Error("Gradle 배포 SHA-256 checksum이 없거나 형식이 잘못되었습니다");
  }
  return {
    gradle: data.version,
    gradleDistributionSha256: data.checksum.toLowerCase(),
    gradleDistributionUrl: data.downloadUrl,
    sourceUrl,
  };
}

function compareVersions(a, b) {
  const aa = String(a).split(".").map((n) => Number(n));
  const bb = String(b).split(".").map((n) => Number(n));
  const len = Math.max(aa.length, bb.length);
  for (let i = 0; i < len; i++) {
    const d = (aa[i] ?? 0) - (bb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

function readCache(cachePath) {
  if (!cachePath || !fs.existsSync(cachePath)) return undefined;
  try {
    return JSON.parse(fs.readFileSync(cachePath, "utf-8"));
  } catch {
    return undefined;
  }
}

function writeCache(cachePath, result) {
  if (!cachePath) return;
  fs.mkdirSync(path.dirname(cachePath), { recursive: true });
  fs.writeFileSync(
    cachePath,
    JSON.stringify({ version: 1, cachedAt: new Date().toISOString(), gradle: result }, null, 2) + "\n",
    "utf-8",
  );
}

export function formatGradleResolutionMessage(result, previousCache) {
  const previous = previousCache?.gradle?.gradle;
  if (previous && compareVersions(result.gradle, previous) > 0) {
    return `Gradle 최신 안정화 버전이 ${result.gradle}로 업데이트되었습니다. 다운로드 후 진행합니다.`;
  }
  return `Gradle 최신 안정화 버전 ${result.gradle}을 공식 메타데이터로 확인했습니다. 다운로드 후 진행합니다.`;
}

export async function resolveGradleVersion(fetchImpl = fetch) {
  const response = await fetchImpl(GRADLE_CURRENT_URL, {
    headers: { accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`Gradle current 조회 실패: HTTP ${response.status}`);
  }
  return parseGradleCurrentResponse(await response.json(), GRADLE_CURRENT_URL);
}

export async function resolveGradleVersionWithCache(options = {}) {
  const { fetchImpl = fetch, cachePath } = options;
  const previousCache = readCache(cachePath);
  const result = await resolveGradleVersion(fetchImpl);
  writeCache(cachePath, result);
  return {
    ...result,
    cachePath,
    message: formatGradleResolutionMessage(result, previousCache),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const cacheIdx = args.indexOf("--cache");
  const cachePath = cacheIdx >= 0 ? args[cacheIdx + 1] : undefined;
  resolveGradleVersionWithCache({ cachePath })
    .then((result) => {
      console.log(JSON.stringify(result, null, 2));
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    });
}
