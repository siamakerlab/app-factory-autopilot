import assert from "node:assert/strict";
import test from "node:test";

import { parseGradleCurrentResponse } from "../scripts/resolve-gradle-version.mjs";

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
