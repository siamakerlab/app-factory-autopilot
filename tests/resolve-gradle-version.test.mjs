import assert from "node:assert/strict";
import test from "node:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import {
  formatGradleResolutionMessage,
  parseGradleCurrentResponse,
  resolveGradleVersionWithCache,
} from "../scripts/resolve-gradle-version.mjs";

const STABLE = {
  version: "9.7.0",
  current: true,
  snapshot: false,
  nightly: false,
  releaseNightly: false,
  activeRc: false,
  broken: false,
  released: true,
  final: true,
  downloadUrl: "https://services.gradle.org/distributions/gradle-9.7.0-bin.zip",
  checksum: "84fbba45c7f4c64abc77460e1c00f541e9f960e3c7ed2538f1ede19eacd873ae",
};

test("Gradle current response resolves stable distribution metadata", () => {
  assert.deepEqual(parseGradleCurrentResponse(STABLE, "fixture"), {
    gradle: "9.7.0",
    gradleDistributionSha256: "84fbba45c7f4c64abc77460e1c00f541e9f960e3c7ed2538f1ede19eacd873ae",
    gradleDistributionUrl: "https://services.gradle.org/distributions/gradle-9.7.0-bin.zip",
    sourceUrl: "fixture",
  });
});

test("Gradle current response rejects preview or broken releases", () => {
  assert.throws(() => parseGradleCurrentResponse({ ...STABLE, activeRc: true }), /preview\/RC\/broken/);
  assert.throws(() => parseGradleCurrentResponse({ ...STABLE, snapshot: true }), /preview\/RC\/broken/);
  assert.throws(() => parseGradleCurrentResponse({ ...STABLE, broken: true }), /preview\/RC\/broken/);
});

test("Gradle current response rejects malformed version and checksum", () => {
  assert.throws(() => parseGradleCurrentResponse({ ...STABLE, version: "9.7.0-rc-1" }), /버전 형식/);
  assert.throws(() => parseGradleCurrentResponse({ ...STABLE, checksum: "bad" }), /checksum/);
});

test("Gradle resolver updates cache and reports latest stable download", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "afa-gradle-cache-"));
  const cachePath = path.join(dir, "gradle-current.json");
  fs.writeFileSync(
    cachePath,
    JSON.stringify({
      version: 1,
      cachedAt: "2026-08-08T00:00:00.000Z",
      gradle: { gradle: "9.6.1" },
    }),
    "utf-8",
  );
  const fetchImpl = async () => ({
    ok: true,
    json: async () => STABLE,
  });

  const result = await resolveGradleVersionWithCache({ fetchImpl, cachePath });

  assert.equal(result.gradle, "9.7.0");
  assert.match(result.message, /최신 안정화 버전이 9\.7\.0로 업데이트되었습니다\. 다운로드 후 진행합니다\./);
  assert.doesNotMatch(result.message, /캐시된 9\.6\.1/);
  const cached = JSON.parse(fs.readFileSync(cachePath, "utf-8"));
  assert.equal(cached.gradle.gradle, "9.7.0");
});

test("Gradle resolver message never suggests using stale cache", () => {
  const message = formatGradleResolutionMessage(parseGradleCurrentResponse(STABLE), {
    gradle: { gradle: "9.6.1" },
  });
  assert.doesNotMatch(message, /없어서 캐시된|캐시된 .*사용/);
});
