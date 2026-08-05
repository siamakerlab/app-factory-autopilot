// SPDX 라이선스 정책 엔진 (AFA-022) — core/policies/license-policy.yaml이 SSOT.
// 판정: allow | block | manual_review + 근거. 알 수 없는 식별자는 무조건 block.
// 복합 표현식(AND/OR/WITH)은 보수적으로 처리한다:
//   - WITH(예외 조항) → manual_review
//   - OR  → 어느 한쪽이 allow면 manual_review(더 관대한 쪽 선택 가능 여부는 수동 검토),
//           전부 block이면 block
//   - AND → 하나라도 block이면 block, 하나라도 manual이면 manual, 전부 allow면 allow

import * as fs from "node:fs";
import * as path from "node:path";
import { parse as parseYaml } from "yaml";

export type LicenseDecision = "allow" | "block" | "manual_review";

export interface LicenseVerdict {
  decision: LicenseDecision;
  rationale: string;
}

export interface LicensePolicy {
  allow: string[];
  block: string[];
  manual_review: string[];
}

export function loadLicensePolicy(coreDir: string): LicensePolicy {
  const p = path.join(coreDir, "policies", "license-policy.yaml");
  const doc = parseYaml(fs.readFileSync(p, "utf-8")) as { version: number; policy: LicensePolicy };
  return doc.policy;
}

function normalizeId(id: string): string {
  return id.trim().replace(/\s+/g, " ");
}

function matchList(id: string, list: string[]): boolean {
  const lower = id.toLowerCase();
  return list.some((entry) => {
    const e = entry.toLowerCase();
    if (e.endsWith("*")) return lower.startsWith(e.slice(0, -1));
    return lower === e;
  });
}

function evaluateSingle(id: string, policy: LicensePolicy): LicenseVerdict {
  const norm = normalizeId(id);
  if (norm === "" || /^noassertion$/i.test(norm) || /^unknown$/i.test(norm)) {
    return { decision: "block", rationale: `라이선스 불명(${norm || "빈 값"}) — 자동 차단` };
  }
  if (/\bwith\b/i.test(norm)) {
    return { decision: "manual_review", rationale: `예외 조항 포함(${norm}) — 수동 검토` };
  }
  if (matchList(norm, policy.block)) {
    return { decision: "block", rationale: `차단 목록 일치: ${norm}` };
  }
  if (matchList(norm, policy.manual_review)) {
    return { decision: "manual_review", rationale: `수동 검토 목록 일치: ${norm}` };
  }
  if (matchList(norm, policy.allow)) {
    return { decision: "allow", rationale: `허용 목록 일치: ${norm}` };
  }
  return { decision: "block", rationale: `알 수 없는 식별자(${norm}) — 보수적 차단` };
}

/** SPDX 표현식 평가. 괄호는 미지원 — 발견 시 수동 검토(보수적). */
export function evaluateLicense(expression: string, policy: LicensePolicy): LicenseVerdict {
  const expr = normalizeId(expression);
  if (expr.includes("(") || expr.includes(")")) {
    return { decision: "manual_review", rationale: `복합 괄호 표현식(${expr}) — 수동 검토` };
  }
  const orParts = expr.split(/\s+OR\s+/i);
  if (orParts.length > 1) {
    const verdicts = orParts.map((p) => evaluateLicense(p, policy));
    if (verdicts.every((v) => v.decision === "block")) {
      return { decision: "block", rationale: `OR 전 항목 차단: ${expr}` };
    }
    return {
      decision: "manual_review",
      rationale: `Dual License(${expr}) — 관대한 쪽 선택 가능 여부 수동 검토`,
    };
  }
  const andParts = expr.split(/\s+AND\s+/i);
  if (andParts.length > 1) {
    const verdicts = andParts.map((p) => evaluateSingle(p, policy));
    const blocked = verdicts.find((v) => v.decision === "block");
    if (blocked) return { decision: "block", rationale: `AND 구성 중 차단: ${blocked.rationale}` };
    const manual = verdicts.find((v) => v.decision === "manual_review");
    if (manual) return { decision: "manual_review", rationale: `AND 구성 중 수동 검토: ${manual.rationale}` };
    return { decision: "allow", rationale: `AND 전 항목 허용: ${expr}` };
  }
  return evaluateSingle(expr, policy);
}
