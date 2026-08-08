#!/usr/bin/env node
// Third Party Notices + CycloneDX SBOM 생성기 (AFA-051)
// 입력: dependency-report.init.gradle 산출 JSON
//   [{ coordinates, version, licenses: ["Apache License 2.0", ...] }]
// 출력: THIRD_PARTY_NOTICES.md, sbom.cdx.json
// 정책: 라이선스 불명·차단(GPL/AGPL 등) 발견 시 생성 실패(exit 1) — 고지
//   게이트가 이 실패를 blocker finding으로 연결한다.
//
// 사용: node generate-notices.mjs <deps.json> <출력 디렉터리>

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

// license-policy.yaml의 목록만 읽는 경량 파서 (구조가 단순 리스트임을 전제).
// 코어 정책 파일 구조 변경 시 이 파서도 함께 갱신할 것.
export function loadPolicyLists(policyPath = path.join(ROOT, "core", "policies", "license-policy.yaml")) {
  const text = fs.readFileSync(policyPath, "utf-8");
  const lists = { allow: [], block: [], manual_review: [] };
  let current = null;
  for (const line of text.split("\n")) {
    const section = line.match(/^  (allow|block|manual_review):\s*$/);
    if (section) { current = section[1]; continue; }
    if (/^\S/.test(line)) { if (!line.startsWith(" ")) current = null; }
    const item = line.match(/^    - (\S+)/);
    if (item && current) lists[current].push(item[1]);
  }
  return lists;
}

// POM 라이선스명 → SPDX 근사 정규화 (대표 표기만 — 불명은 그대로 남겨 차단)
const NAME_TO_SPDX = [
  [/apache.*2/i, "Apache-2.0"],
  [/^mit\b/i, "MIT"],
  [/bsd.*3/i, "BSD-3-Clause"],
  [/bsd.*2/i, "BSD-2-Clause"],
  [/\bisc\b/i, "ISC"],
  [/zlib/i, "Zlib"],
  [/cc0/i, "CC0-1.0"],
  [/unlicense/i, "Unlicense"],
  [/lgpl.*2\.1/i, "LGPL-2.1-only"],
  [/lgpl.*3/i, "LGPL-3.0-only"],
  [/agpl/i, "AGPL-3.0-only"],
  [/gnu.*general.*public.*3/i, "GPL-3.0-only"],
  [/gnu.*general.*public.*2/i, "GPL-2.0-only"],
  [/gpl.*3/i, "GPL-3.0-only"],
  [/gpl.*2/i, "GPL-2.0-only"],
  [/mpl.*2/i, "MPL-2.0"],
  [/epl.*2/i, "EPL-2.0"],
  [/epl|eclipse/i, "EPL-1.0"],
  [/cddl/i, "CDDL-1.0"],
];

export function toSpdx(name) {
  for (const [re, spdx] of NAME_TO_SPDX) if (re.test(name)) return spdx;
  return name; // 미매핑 → 정책에서 불명 처리(차단)
}

export function decide(spdx, lists) {
  const l = spdx.toLowerCase();
  const match = (arr) => arr.some((e) => (e.endsWith("*") ? l.startsWith(e.slice(0, -1).toLowerCase()) : l === e.toLowerCase()));
  if (match(lists.block)) return "block";
  if (match(lists.manual_review)) return "manual_review";
  if (match(lists.allow)) return "allow";
  return "block"; // 불명 — 보수적 차단
}

export function generateNotices(deps, outDir, lists = loadPolicyLists()) {
  const rows = [];
  const violations = [];
  for (const d of deps) {
    const names = d.licenses ?? [];
    if (names.length === 0) {
      violations.push(`${d.coordinates}:${d.version} — 라이선스 불명 (POM licenses 없음)`);
      continue;
    }
    const spdxes = names.map(toSpdx);
    const decisions = spdxes.map((s) => decide(s, lists));
    // 복수 라이선스(POM 다중 표기)는 관대한 판정 우선이 아니라 보수적으로:
    // 전부 block이면 위반, 하나라도 allow면 통과, 그 외 manual은 위반 목록에 보고
    if (decisions.every((x) => x === "block")) {
      violations.push(`${d.coordinates}:${d.version} — 차단 라이선스: ${spdxes.join(", ")}`);
    } else if (!decisions.includes("allow")) {
      violations.push(`${d.coordinates}:${d.version} — 수동 검토 필요: ${spdxes.join(", ")}`);
    }
    rows.push({ ...d, spdxes, decisions });
  }

  fs.mkdirSync(outDir, { recursive: true });

  // THIRD_PARTY_NOTICES.md
  const md = [
    "# Third Party Notices",
    "",
    "이 앱은 다음 오픈소스 소프트웨어를 포함합니다 (자동 생성 — generate-notices.mjs).",
    "",
    ...rows.map((r) => `- **${r.coordinates}** ${r.version} — ${r.spdxes.join(" / ")}`),
    "",
  ];
  fs.writeFileSync(path.join(outDir, "THIRD_PARTY_NOTICES.md"), md.join("\n"), "utf-8");

  // CycloneDX SBOM (최소 구성)
  const sbom = {
    bomFormat: "CycloneDX",
    specVersion: "1.5",
    version: 1,
    components: rows.map((r) => ({
      type: "library",
      group: r.coordinates.split(":")[0],
      name: r.coordinates.split(":")[1],
      version: r.version,
      purl: `pkg:maven/${r.coordinates.replace(":", "/")}@${r.version}`,
      licenses: r.spdxes.map((s) => ({ license: { id: s } })),
    })),
  };
  fs.writeFileSync(path.join(outDir, "sbom.cdx.json"), JSON.stringify(sbom, null, 2) + "\n", "utf-8");

  return { rows, violations, sbom };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [depsPath, outDir] = process.argv.slice(2);
  if (!depsPath || !outDir) {
    console.error("사용법: generate-notices.mjs <deps.json> <출력 디렉터리>");
    process.exit(2);
  }
  const deps = JSON.parse(fs.readFileSync(depsPath, "utf-8"));
  const { rows, violations, sbom } = generateNotices(deps, outDir);
  console.log(`고지 ${rows.length}건, SBOM 컴포넌트 ${sbom.components.length}건 생성 → ${outDir}`);
  if (violations.length) {
    console.error("\n정책 위반 — 고지 게이트 차단 대상:");
    for (const v of violations) console.error(`- ${v}`);
    process.exit(1);
  }
}
