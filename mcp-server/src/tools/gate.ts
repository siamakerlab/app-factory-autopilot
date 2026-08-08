// 게이트 도구 gate_* (AFA-014) — core/policies/gates.yaml이 SSOT.
// command 게이트는 APP_FACTORY 설정의 명령을 실행(AFA-050), check 게이트는
// 상태 저장소 기반 결정론적 검사기로 판정한다. 결과는 증거로 자동 등록.

import * as fs from "node:fs";
import * as path from "node:path";
import { parse as parseYaml } from "yaml";
import type { Ctx } from "../context.js";
import { ToolError } from "../errors.js";
import { runCommand } from "../exec.js";
import { evidenceRegister } from "./finding-evidence.js";

export interface GateDef {
  id: string;
  title: string;
  kind: "command" | "check";
  command_ref?: string;
  checker?: string;
  blocking: boolean;
  release_only?: boolean;
  on_unavailable?: string;
}

export interface GateResult {
  gate_id: string;
  passed: boolean;
  blocked: boolean;
  detail: string;
  evidence_id?: string;
  finding_id?: string;
}

interface GatesDoc {
  version: number;
  gates: GateDef[];
  execution: { timeout_seconds_default: number };
}

export function loadGates(coreDir: string): GatesDoc {
  const p = path.join(coreDir, "policies", "gates.yaml");
  return parseYaml(fs.readFileSync(p, "utf-8")) as GatesDoc;
}

// ── check 게이트 검사기 (결정론적 — LLM 판단 없음) ─────────────────────
// 매핑 원칙: 각 영역 skill/agent가 검사 결과를 finding·evidence로 기록하고,
// 게이트는 "해당 영역 open blocker finding 0건 (+필수 증거 존재)"를 확인한다.

type Checker = (ctx: Ctx, opts: { release: boolean }) => { passed: boolean; blocked?: boolean; detail: string };

function openBlockers(ctx: Ctx, areas: string[]): number {
  return ctx.store
    .listFindings()
    .filter(
      (f) =>
        (f.status === "open" || f.status === "reopened" || f.status === "in_fix") &&
        f.severity === "blocker" &&
        areas.includes(f.area),
    ).length;
}

const CHECKERS: Record<string, Checker> = {
  all_required_items_verified: (ctx) => {
    const { items } = ctx.store.loadRoadmap();
    const required = items.filter((i) => i.priority !== "P2");
    const unverified = required.filter((i) => i.status !== "VERIFIED");
    const mismarks = openBlockers(ctx, ["completion_mismark"]);
    if (unverified.length === 0 && mismarks === 0) {
      return { passed: true, detail: `필수 항목 ${required.length}건 전부 VERIFIED` };
    }
    return {
      passed: false,
      detail: `미완료 ${unverified.length}건(${unverified.map((i) => i.id).join(",")}) / 완료 오표기 blocker ${mismarks}건`,
    };
  },
  no_release_blocking_placeholders: (ctx, opts) => {
    const blocking = ctx.store
      .listPlaceholders()
      .filter((p) => p.release_blocking && p.status !== "resolved");
    if (blocking.length === 0) return { passed: true, detail: "릴리스 차단 Placeholder 없음" };
    if (!opts.release) {
      return {
        passed: true,
        detail: `릴리스 차단 Placeholder ${blocking.length}건 존재 — 개발 단계이므로 경고만 (${blocking.map((p) => p.name).join(", ")})`,
      };
    }
    return { passed: false, detail: `릴리스 차단 Placeholder ${blocking.length}건: ${blocking.map((p) => p.name).join(", ")}` };
  },
  license_policy_clean: (ctx) => {
    const n = openBlockers(ctx, ["license"]);
    return n === 0
      ? { passed: true, detail: "라이선스 blocker finding 없음" }
      : { passed: false, detail: `라이선스 blocker ${n}건 미해결` };
  },
  version_policy_clean: (ctx) => {
    const n = openBlockers(ctx, ["dependency_version"]);
    return n === 0
      ? { passed: true, detail: "버전 정책 blocker finding 없음" }
      : { passed: false, detail: `버전 정책 blocker ${n}건 미해결` };
  },
  notices_up_to_date: (ctx) => {
    const n = openBlockers(ctx, ["license"]);
    // 고지 증거(license_report 또는 sbom) 최소 1건 존재 요구
    const dir = path.join(ctx.store.root, "evidence");
    const hasNotice = fs.existsSync(dir)
      ? fs.readdirSync(dir).some((d) => {
          try {
            const meta = ctx.store.loadEvidence(d);
            return meta.kind === "license_report" || meta.kind === "sbom";
          } catch {
            return false;
          }
        })
      : false;
    if (!hasNotice) return { passed: false, detail: "고지 증거(license_report/sbom) 없음" };
    return n === 0
      ? { passed: true, detail: "고지 증거 존재, 라이선스 blocker 없음" }
      : { passed: false, detail: `라이선스 blocker ${n}건` };
  },
  emulator_smoke_passed: (ctx) => {
    const dir = path.join(ctx.store.root, "evidence");
    const results = fs.existsSync(dir)
      ? fs.readdirSync(dir).flatMap((d) => {
          try {
            const meta = ctx.store.loadEvidence(d);
            return meta.kind === "emulator_scenario_result" ? [meta] : [];
          } catch {
            return [];
          }
        })
      : [];
    if (results.length === 0) {
      return { passed: false, blocked: true, detail: "에뮬레이터 검증 증거 없음 — 디바이스 미가용 시 BLOCKED (skip 아님)" };
    }
    const latest = results[results.length - 1]!;
    const ok = latest.data?.["crash"] === false;
    return ok
      ? { passed: true, detail: `에뮬레이터 검증 통과 (${latest.id})` }
      : { passed: false, detail: `에뮬레이터 검증 실패 — 크래시 감지 (${latest.id})` };
  },
};

export async function gateRun(
  ctx: Ctx,
  input: { gate_id: string; release?: boolean; timeout_seconds?: number },
): Promise<GateResult> {
  const doc = loadGates(ctx.coreDir);
  const gate = doc.gates.find((g) => g.id === input.gate_id);
  if (!gate) throw new ToolError("NOT_FOUND", `게이트 없음: ${input.gate_id}`);

  let passed = false;
  let blocked = false;
  let detail = "";
  let data: Record<string, unknown> = {};

  if (gate.kind === "command") {
    const config = ctx.store.loadConfigSnapshot<{ commands?: Record<string, string> }>();
    const command = config.commands?.[gate.command_ref ?? ""];
    if (!command) {
      throw new ToolError(
        "INVALID_INPUT",
        `APP_FACTORY 설정에 commands.${gate.command_ref} 명령이 없습니다 (하드코딩 금지 원칙)`,
      );
    }
    const timeout = (input.timeout_seconds ?? doc.execution.timeout_seconds_default) * 1000;
    const result = await runCommand(command, ctx.projectRoot, timeout);
    passed = result.exit_code === 0 && !result.timed_out;
    detail = result.timed_out
      ? `타임아웃 (${timeout / 1000}s)`
      : `exit ${result.exit_code}${result.error_lines.length ? ` — ${result.error_lines[0]}` : ""}`;
    data = {
      exit_code: result.exit_code,
      timed_out: result.timed_out,
      duration_ms: result.duration_ms,
      error_lines: result.error_lines,
      tail: result.tail.slice(-4000),
    };
  } else {
    const checker = CHECKERS[gate.checker ?? ""];
    if (!checker) throw new ToolError("INTERNAL", `검사기 미구현: ${gate.checker}`);
    const r = checker(ctx, { release: input.release ?? false });
    passed = r.passed;
    blocked = r.blocked ?? false;
    detail = r.detail;
  }

  // 결과 → 증거 자동 등록
  const { evidence_id } = await evidenceRegister(ctx, {
    kind: "gate_result",
    title: `게이트 결과: ${gate.title}`,
    created_by: { role: "gate", name: gate.id },
    summary: `${passed ? "통과" : blocked ? "차단(BLOCKED)" : "실패"} — ${detail}`,
    data: { gate_id: gate.id, passed, blocked, ...data },
  });

  // 실패 시 finding 자동 기록 (게이트별 구분 — AFA-050 완료 조건)
  let finding_id: string | undefined;
  if (!passed && !blocked) {
    const areaMap: Record<string, string> = {
      build: "build",
      unit_test: "testing",
      lint: "build",
      completion: "completion_mismark",
      placeholder: "placeholder",
      license: "license",
      version_policy: "dependency_version",
      notices: "license",
      emulator: "other",
    };
    const fid = ctx.store.nextFindingId();
    ctx.store.saveFinding({
      version: 1,
      id: fid,
      severity: gate.blocking ? "blocker" : "major",
      area: areaMap[gate.id] ?? "other",
      title: `게이트 실패: ${gate.title}`,
      description: detail,
      source: { kind: "gate", name: gate.id },
      status: "open",
      created_at: new Date().toISOString(),
    });
    finding_id = fid;
  }

  return {
    gate_id: gate.id,
    passed,
    blocked,
    detail,
    evidence_id,
    ...(finding_id ? { finding_id } : {}),
  };
}

export function gateGetResult(
  ctx: Ctx,
  input: { gate_id: string },
): { gate_id: string; results: { evidence_id: string; passed: boolean; detail: string; at: string }[] } {
  const dir = path.join(ctx.store.root, "evidence");
  const results: { evidence_id: string; passed: boolean; detail: string; at: string }[] = [];
  if (fs.existsSync(dir)) {
    for (const d of fs.readdirSync(dir).sort()) {
      try {
        const meta = ctx.store.loadEvidence(d);
        if (meta.kind === "gate_result" && meta.data?.["gate_id"] === input.gate_id) {
          results.push({
            evidence_id: meta.id,
            passed: meta.data["passed"] === true,
            detail: meta.summary ?? "",
            at: meta.created_at,
          });
        }
      } catch {
        /* skip */
      }
    }
  }
  return { gate_id: input.gate_id, results };
}

/** 모든 차단 게이트 실행 — 최종 게이트(final-gate)·자동 종료 조건 판정용 */
export async function gateRunAll(
  ctx: Ctx,
  input: { release?: boolean } = {},
): Promise<{ all_passed: boolean; results: GateResult[] }> {
  const doc = loadGates(ctx.coreDir);
  const results: GateResult[] = [];
  for (const gate of doc.gates) {
    const r = await gateRun(ctx, { gate_id: gate.id, ...(input.release !== undefined ? { release: input.release } : {}) });
    results.push(r);
  }
  const allPassed = results.every((r) => r.passed);
  await evidenceRegister(ctx, {
    kind: "gate_result",
    title: "최종 완료 게이트 요약",
    created_by: { role: "gate", name: "final_gate" },
    summary: allPassed
      ? "최종 완료 게이트 전체 통과"
      : `최종 완료 게이트 미통과 — 실패/차단 ${results.filter((r) => !r.passed).length}건`,
    data: {
      final_gate: true,
      all_passed: allPassed,
      release: input.release ?? false,
      results: results.map((r) => ({
        gate_id: r.gate_id,
        passed: r.passed,
        blocked: r.blocked,
        detail: r.detail,
        evidence_id: r.evidence_id,
        finding_id: r.finding_id,
      })),
    },
  });
  return { all_passed: allPassed, results };
}
