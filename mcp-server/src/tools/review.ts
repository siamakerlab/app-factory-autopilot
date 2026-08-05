// factory review 점수 계산기 (AFA-036) — review-scoring.yaml 배점표 기반.
// 점수는 LLM 인상 평가가 아니라 결정론적 가중 합산으로 산정한다.

import * as fs from "node:fs";
import * as path from "node:path";
import { parse as parseYaml } from "yaml";
import type { Ctx } from "../context.js";
import { ToolError } from "../errors.js";

interface ScoringDoc {
  version: number;
  targets: { default: number; release_blocking: number };
  areas: {
    area: string;
    title: string;
    release_blocking?: boolean;
    checks: { id: string; desc: string; weight: number }[];
  }[];
}

export type CheckResult = "pass" | "fail" | "n_a";

export interface AreaScore {
  area: string;
  title: string;
  score: number | null; // 전 항목 n_a면 null (해당 없음)
  target: number;
  gap: number;
  release_blocking: boolean;
  failed_checks: { id: string; desc: string; weight: number }[];
}

export function loadScoring(coreDir: string): ScoringDoc {
  const p = path.join(coreDir, "policies", "review-scoring.yaml");
  return parseYaml(fs.readFileSync(p, "utf-8")) as ScoringDoc;
}

/**
 * 검사 결과 → 영역별 점수·격차·개선 대상.
 * results: { "<area>": { "<check_id>": "pass|fail|n_a" } }
 * 누락된 검사 항목은 fail로 취급한다 (검사하지 않은 것은 통과가 아니다).
 */
export function reviewScore(
  ctx: Ctx,
  input: { results: Record<string, Record<string, CheckResult>> },
): { areas: AreaScore[]; overall: number; all_targets_met: boolean } {
  const doc = loadScoring(ctx.coreDir);
  const areas: AreaScore[] = [];

  for (const areaDef of doc.areas) {
    const given = input.results[areaDef.area] ?? {};
    let passWeight = 0;
    let totalWeight = 0;
    const failed: { id: string; desc: string; weight: number }[] = [];
    for (const check of areaDef.checks) {
      const r: CheckResult = given[check.id] ?? "fail";
      if (r === "n_a") continue;
      totalWeight += check.weight;
      if (r === "pass") passWeight += check.weight;
      else failed.push(check);
    }
    const releaseBlocking = areaDef.release_blocking === true;
    const target = releaseBlocking ? doc.targets.release_blocking : doc.targets.default;
    const score = totalWeight === 0 ? null : Math.round((passWeight / totalWeight) * 100);
    areas.push({
      area: areaDef.area,
      title: areaDef.title,
      score,
      target,
      gap: score === null ? 0 : Math.max(0, target - score),
      release_blocking: releaseBlocking,
      failed_checks: failed,
    });
  }

  const scored = areas.filter((a) => a.score !== null);
  if (scored.length === 0) {
    throw new ToolError("INVALID_INPUT", "채점 가능한 영역이 없습니다 (전부 해당없음)");
  }
  const overall = Math.round(scored.reduce((s, a) => s + (a.score ?? 0), 0) / scored.length);
  const allMet = scored.every((a) => (a.score ?? 0) >= a.target);
  return { areas, overall, all_targets_met: allMet };
}

/** 전/후 비교표 렌더링 + 리포트 저장 */
export function reviewSaveReport(
  ctx: Ctx,
  input: {
    run_id: string;
    before: { areas: AreaScore[]; overall: number };
    after?: { areas: AreaScore[]; overall: number };
    plan?: string;
  },
): { report_path: string } {
  const lines = [
    `# factory review 리포트 — ${input.run_id}`,
    "",
    "| 영역 | 점수 | 목표 | 격차 | 릴리스 차단 |" + (input.after ? " 수정 후 |" : ""),
    "|------|------|------|------|-------------|" + (input.after ? "---------|" : ""),
  ];
  for (const a of input.before.areas) {
    const after = input.after?.areas.find((x) => x.area === a.area);
    lines.push(
      `| ${a.title} | ${a.score ?? "해당없음"} | ${a.target} | ${a.gap} | ${a.release_blocking ? "예" : "—"} |` +
        (input.after ? ` ${after?.score ?? "해당없음"} |` : ""),
    );
  }
  lines.push("", `전체: ${input.before.overall}점` + (input.after ? ` → ${input.after.overall}점` : ""));
  if (input.plan) lines.push("", "## 개선 계획", "", input.plan);
  const reportPath = path.join(ctx.store.root, "reports", `review-${input.run_id}.md`);
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, lines.join("\n") + "\n", "utf-8");
  return { report_path: reportPath };
}
