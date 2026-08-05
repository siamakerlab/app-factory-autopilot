// AFA-022 라이선스 정책 / AFA-023 버전 정책 테스트.

import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateLicense, loadLicensePolicy } from "../license-policy.js";
import { classifyVersion } from "../version-policy.js";
import { coreDir } from "./helpers.js";

const policy = loadLicensePolicy(coreDir());

test("허용 목록 — Permissive 라이선스", () => {
  for (const id of ["Apache-2.0", "MIT", "BSD-3-Clause", "ISC", "Zlib", "0BSD", "CC0-1.0", "Unlicense"]) {
    assert.equal(evaluateLicense(id, policy).decision, "allow", id);
  }
});

test("자동 차단 — GPL/AGPL/SSPL/불명", () => {
  for (const id of ["GPL-2.0-only", "GPL-3.0-or-later", "AGPL-3.0-only", "SSPL-1.0", "NOASSERTION", "", "CC-BY-NC-4.0"]) {
    assert.equal(evaluateLicense(id, policy).decision, "block", id || "(빈 값)");
  }
});

test("알 수 없는 식별자는 무조건 차단", () => {
  assert.equal(evaluateLicense("MyCustom-License-1.0", policy).decision, "block");
});

test("수동 검토 — LGPL/MPL/EPL/CDDL/예외 조항/Dual License", () => {
  for (const id of [
    "LGPL-2.1-only",
    "MPL-2.0",
    "EPL-2.0",
    "CDDL-1.0",
    "GPL-2.0-with-classpath-exception",
    "GPL-2.0-only WITH Classpath-exception-2.0",
    "MIT OR GPL-2.0-only",
  ]) {
    assert.equal(evaluateLicense(id, policy).decision, "manual_review", id);
  }
});

test("복합 표현식 — AND는 보수적으로", () => {
  assert.equal(evaluateLicense("MIT AND Apache-2.0", policy).decision, "allow");
  assert.equal(evaluateLicense("MIT AND GPL-3.0-only", policy).decision, "block");
  assert.equal(evaluateLicense("MIT AND MPL-2.0", policy).decision, "manual_review");
  assert.equal(evaluateLicense("GPL-2.0-only OR GPL-3.0-only", policy).decision, "block");
});

test("버전 정책 — pre-release·동적 버전 비허용 (AFA-023 완료 조건 케이스)", () => {
  assert.equal(classifyVersion("2.1.0-alpha03"), "prerelease");
  assert.equal(classifyVersion("1.0.0-RC1"), "prerelease");
  assert.equal(classifyVersion("1.2.+"), "dynamic");
  assert.equal(classifyVersion("[1.0,2.0)"), "dynamic");
  assert.equal(classifyVersion("latest.release"), "dynamic");
  assert.equal(classifyVersion("8.0.0-beta02"), "prerelease");
  assert.equal(classifyVersion("2.0.0-SNAPSHOT"), "prerelease");
  assert.equal(classifyVersion("1.9.0-M1"), "prerelease");
});

test("버전 정책 — 안정 버전 허용, 판정 불가는 manual", () => {
  assert.equal(classifyVersion("1.2.3"), "stable");
  assert.equal(classifyVersion("34"), "stable");
  assert.equal(classifyVersion("2024.09.00"), "stable");
  assert.equal(classifyVersion("1.2.3-jre"), "manual");
  assert.equal(classifyVersion(""), "manual");
});
