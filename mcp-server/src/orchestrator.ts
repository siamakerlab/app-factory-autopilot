// 결정론적 오케스트레이터 (AFA-020) — core/workflow/phases.yaml이 SSOT.
// "상태 읽기 → 다음 행동 결정"만 담당하며 LLM을 호출하지 않는다.
// LLM 위임(Agent 실행)은 어댑터/드라이버의 executor 콜백 몫이다.
// 코드를 직접 수정하지 않는다.

import * as fs from "node:fs";
import * as path from "node:path";
import { parse as parseYaml } from "yaml";
import type { Ctx } from "./context.js";
import { ToolError } from "./errors.js";
import { factoryGetNextTask } from "./tools/factory.js";
import { gateGetResult } from "./tools/gate.js";

export interface PhaseDef {
  id: string;
  title: string;
  agent: string;
  entry: string;
  done: string;
  on_failure: "retry" | "block";
}

export interface LimitsDoc {
  version: number;
  retries: { max_attempts_per_task: number; same_error_threshold: number };
  budget: { max_cycles_per_run: number; max_total_tasks: number };
  error_normalization: { mask_patterns: { pattern: string; replace: string }[] };
}

export function loadPhases(coreDir: string): PhaseDef[] {
  const p = path.join(coreDir, "workflow", "phases.yaml");
  const doc = parseYaml(fs.readFileSync(p, "utf-8")) as { version: number; phases: PhaseDef[] };
  return doc.phases;
}

export function loadLimits(coreDir: string): LimitsDoc {
  const p = path.join(coreDir, "policies", "limits.yaml");
  return parseYaml(fs.readFileSync(p, "utf-8")) as LimitsDoc;
}

/** 동일 오류 반복 판정용 정규화 (AFA-024) */
export function normalizeError(message: string, limits: LimitsDoc): string {
  let out = message;
  for (const m of limits.error_normalization.mask_patterns) {
    out = out.replace(new RegExp(m.pattern, "g"), m.replace);
  }
  return out.trim();
}

// ── entry/done 판정기 — 상태 저장소 기반 결정론 (LLM 판단 금지) ─────────

type Predicate = (ctx: Ctx) => boolean;

function emulatorEnabled(ctx: Ctx): boolean {
  try {
    const config = ctx.store.loadConfigSnapshot<{ automation?: { emulator?: boolean } }>();
    return config.automation?.emulator !== false;
  } catch {
    return true;
  }
}

const PREDICATES: Record<string, Predicate> = {
  always: () => true,
  config_snapshot_exists: (ctx) => fs.existsSync(ctx.store.configSnapshotPath()),
  no_android_project: (ctx) =>
    !fs.existsSync(path.join(ctx.projectRoot, "settings.gradle.kts")) &&
    !fs.existsSync(path.join(ctx.projectRoot, "settings.gradle")),
  android_project_exists: (ctx) =>
    fs.existsSync(path.join(ctx.projectRoot, "settings.gradle.kts")) ||
    fs.existsSync(path.join(ctx.projectRoot, "settings.gradle")),
  docs_index_missing: (ctx) =>
    !fs.existsSync(path.join(ctx.projectRoot, "DOCS_INDEX.md")) &&
    !fs.existsSync(path.join(ctx.projectRoot, "docs", "DOCS_INDEX.md")),
  docs_index_exists: (ctx) =>
    fs.existsSync(path.join(ctx.projectRoot, "DOCS_INDEX.md")) ||
    fs.existsSync(path.join(ctx.projectRoot, "docs", "DOCS_INDEX.md")),
  roadmap_not_audited: (ctx) => {
    // 감사 완료 증거(verifier_report kind + data.audit="roadmap")가 없으면 미감사
    return !hasEvidence(ctx, (d) => d["audit"] === "roadmap");
  },
  roadmap_audit_clean: (ctx) => hasEvidence(ctx, (d) => d["audit"] === "roadmap" && d["clean"] === true),
  queued_implement_tasks_exist: (ctx) =>
    ctx.store.listTasks().some((t) => t.status === "queued" && (t.type === "implement" || t.type === "fix")),
  no_queued_implement_tasks: (ctx) =>
    !ctx.store.listTasks().some((t) => ["queued", "claimed", "in_progress"].includes(t.status) && (t.type === "implement" || t.type === "fix")),
  implemented_items_exist: (ctx) =>
    ctx.store.loadRoadmap().items.some((i) => i.status === "IMPLEMENTED"),
  no_implemented_items_pending: (ctx) =>
    !ctx.store.loadRoadmap().items.some((i) => i.status === "IMPLEMENTED"),
  partial_items_or_open_blockers_exist: (ctx) =>
    ctx.store.loadRoadmap().items.some((i) => i.status === "PARTIAL") ||
    ctx.store.listFindings().some((f) => f.severity === "blocker" && ["open", "reopened"].includes(f.status)),
  no_partial_items_and_no_open_blockers: (ctx) =>
    !ctx.store.loadRoadmap().items.some((i) => i.status === "PARTIAL") &&
    !ctx.store.listFindings().some((f) => f.severity === "blocker" && ["open", "reopened"].includes(f.status)),
  emulator_evidence_missing: (ctx) => {
    return emulatorEnabled(ctx) && !hasEvidenceKind(ctx, "emulator_scenario_result");
  },
  emulator_gate_passed_or_blocked: (ctx) => {
    if (!emulatorEnabled(ctx)) return true;
    const r = gateGetResult(ctx, { gate_id: "emulator" });
    return r.results.length > 0 || hasEvidenceKind(ctx, "emulator_scenario_result");
  },
  all_items_verified: (ctx) => {
    const items = ctx.store.loadRoadmap().items.filter((i) => i.priority !== "P2");
    return items.length > 0 && items.every((i) => i.status === "VERIFIED");
  },
  all_gates_passed: (ctx) => hasEvidence(ctx, (d) => d["final_gate"] === true && d["all_passed"] === true),
};

function hasEvidence(ctx: Ctx, match: (data: Record<string, unknown>) => boolean): boolean {
  const dir = path.join(ctx.store.root, "evidence");
  if (!fs.existsSync(dir)) return false;
  return fs.readdirSync(dir).some((d) => {
    try {
      const meta = ctx.store.loadEvidence(d);
      return meta.data ? match(meta.data) : false;
    } catch {
      return false;
    }
  });
}

function hasEvidenceKind(ctx: Ctx, kind: string): boolean {
  const dir = path.join(ctx.store.root, "evidence");
  if (!fs.existsSync(dir)) return false;
  return fs.readdirSync(dir).some((d) => {
    try {
      return ctx.store.loadEvidence(d).kind === kind;
    } catch {
      return false;
    }
  });
}

export function evaluatePredicate(ctx: Ctx, name: string): boolean {
  const p = PREDICATES[name];
  if (!p) throw new ToolError("INTERNAL", `판정기 미구현: ${name}`);
  return p(ctx);
}

// ── 다음 행동 결정 ──────────────────────────────────────────────────────

export type NextAction =
  | { kind: "completed" }
  | { kind: "blocked"; reason: string; pending: { subject: string; summary: string }[] }
  | {
      kind: "dispatch";
      phase: PhaseDef;
      /** 이 단계에서 처리할 작업 (있으면) */
      task_id?: string;
      /** 승인 대기로 건너뛴 위험 작업 */
      skipped_dangerous: { task_id: string; reason: string }[];
    };

/**
 * 현재 상태만 보고 다음 행동을 결정한다 (재실행 시 동일 지점 재개 — AFA-020).
 * entry를 만족하는 첫 단계를 반환. 아무 단계도 해당 없고 최종 게이트 통과면 completed.
 */
export function decideNextAction(ctx: Ctx): NextAction {
  const phases = loadPhases(ctx.coreDir);

  for (const phase of phases) {
    if (!evaluatePredicate(ctx, phase.entry)) continue;
    // done을 이미 만족하면 이 단계는 건너뛴다 (멱등 재진입)
    if (evaluatePredicate(ctx, phase.done)) continue;

    if (phase.id === "implementation_loop" || phase.id === "rework_loop") {
      const next = factoryGetNextTask(ctx);
      if (next.task) {
        return {
          kind: "dispatch",
          phase,
          task_id: next.task.id,
          skipped_dangerous: next.skipped_dangerous,
        };
      }
      if (next.skipped_dangerous.length > 0) {
        // 실행 가능한 작업이 전부 승인 대기 → 질문 지연 원칙: pending으로 보고
        return {
          kind: "blocked",
          reason: "잔여 작업이 모두 사용자 승인 대기 상태입니다",
          pending: next.skipped_dangerous.map((s) => ({
            subject: s.task_id,
            summary: s.reason,
          })),
        };
      }
      continue; // 큐 비어 있으면 다음 단계로
    }
    return { kind: "dispatch", phase, skipped_dangerous: [] };
  }

  if (evaluatePredicate(ctx, "all_gates_passed")) {
    return { kind: "completed" };
  }
  // 어떤 단계도 진입 불가인데 완료도 아니면 — 사용자 결정 필요 항목 수집
  const nhd = ctx.store
    .loadRoadmap()
    .items.filter((i) => i.status === "NEEDS_HUMAN_DECISION" || i.status === "BLOCKED");
  return {
    kind: "blocked",
    reason: "진행 가능한 단계가 없습니다 — 미결 항목을 확인하십시오",
    pending: nhd.map((i) => ({ subject: i.id, summary: `${i.title} (${i.status})` })),
  };
}

// ── 작업 실패 처리 (AFA-024 재시도 정책 연결 — AFA-050 완성) ────────────

export async function handleTaskFailure(
  ctx: Ctx,
  input: { task_id: string; error_message: string },
): Promise<{ task_id: string; action: "requeued" | "blocked"; approval_id?: string }> {
  const limits = loadLimits(ctx.coreDir);
  return ctx.store.withLock("handle_task_failure", async () => {
    const task = ctx.store.loadTask(input.task_id);
    const normalized = normalizeError(input.error_message, limits);
    const sameError = task.last_error?.normalized === normalized;
    task.attempts += 1;
    task.last_error = { message: input.error_message, normalized, at: new Date().toISOString() };

    const exceeded =
      task.attempts >= (task.max_attempts ?? limits.retries.max_attempts_per_task) ||
      (sameError && task.attempts >= limits.retries.same_error_threshold);

    if (!exceeded) {
      task.status = "queued";
      delete task.claim;
      ctx.store.saveTask(task);
      return { task_id: task.id, action: "requeued" as const };
    }
    task.status = "blocked";
    ctx.store.saveTask(task);
    // 승인 요청 생성 (선택지·근거·위험·추천안 — 3.9 보고 형식)
    const id = ctx.store.nextApprovalId();
    ctx.store.saveApproval({
      version: 1,
      id,
      subject: task.id,
      options: ["다른 접근으로 재시도", "작업 취소", "수동 개입 후 재개"],
      rationale: `동일 작업 ${task.attempts}회 실패 — 마지막 오류: ${input.error_message.slice(0, 200)}`,
      risks: "자동 재시도 반복은 동일 실패를 반복할 가능성이 높습니다",
      recommendation: "오류 내용을 확인하고 접근 방법을 지정해 주십시오",
      status: "pending",
      created_at: new Date().toISOString(),
    });
    return { task_id: task.id, action: "blocked" as const, approval_id: id };
  });
}
