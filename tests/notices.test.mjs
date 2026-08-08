import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { decide, generateNotices, loadPolicyLists, toSpdx } from "../scripts/generate-notices.mjs";

test("license names normalize to SPDX ids", () => {
  assert.equal(toSpdx("The Apache License, Version 2.0"), "Apache-2.0");
  assert.equal(toSpdx("MIT License"), "MIT");
  assert.equal(toSpdx("GNU General Public License v3.0"), "GPL-3.0-only");
});

test("license policy allows permissive and blocks unknown/gpl", () => {
  const lists = loadPolicyLists();
  assert.equal(decide("Apache-2.0", lists), "allow");
  assert.equal(decide("MIT", lists), "allow");
  assert.equal(decide("GPL-3.0-only", lists), "block");
  assert.equal(decide("Custom-Unknown-License", lists), "block");
});

test("generate notices and CycloneDX SBOM for allowed dependencies", () => {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "afa-notices-"));
  const result = generateNotices(
    [
      {
        coordinates: "androidx.core:core-ktx",
        version: "1.17.0",
        licenses: ["The Apache License, Version 2.0"],
      },
    ],
    outDir,
  );

  assert.deepEqual(result.violations, []);
  assert.match(fs.readFileSync(path.join(outDir, "THIRD_PARTY_NOTICES.md"), "utf-8"), /androidx\.core:core-ktx/);
  const sbom = JSON.parse(fs.readFileSync(path.join(outDir, "sbom.cdx.json"), "utf-8"));
  assert.equal(sbom.bomFormat, "CycloneDX");
  assert.equal(sbom.components[0].purl, "pkg:maven/androidx.core/core-ktx@1.17.0");
  assert.equal(sbom.components[0].licenses[0].license.id, "Apache-2.0");
});

test("generate notices reports blocking and manual-review violations", () => {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "afa-notices-block-"));
  const result = generateNotices(
    [
      { coordinates: "bad:gpl", version: "1.0.0", licenses: ["GPL v3"] },
      { coordinates: "needs:review", version: "2.0.0", licenses: ["MPL 2.0"] },
      { coordinates: "unknown:none", version: "3.0.0", licenses: [] },
    ],
    outDir,
  );

  assert.equal(result.violations.length, 3);
  assert.match(result.violations.join("\n"), /차단 라이선스/);
  assert.match(result.violations.join("\n"), /수동 검토 필요/);
  assert.match(result.violations.join("\n"), /라이선스 불명/);
  assert.equal(result.sbom.components.length, 2);
});
