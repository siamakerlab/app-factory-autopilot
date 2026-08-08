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

export async function resolveGradleVersion(fetchImpl = fetch) {
  const response = await fetchImpl(GRADLE_CURRENT_URL, {
    headers: { accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`Gradle current 조회 실패: HTTP ${response.status}`);
  }
  return parseGradleCurrentResponse(await response.json(), GRADLE_CURRENT_URL);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  resolveGradleVersion()
    .then((result) => {
      console.log(JSON.stringify(result, null, 2));
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    });
}
