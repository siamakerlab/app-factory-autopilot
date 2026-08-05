// 공정 도구 factory_* (AFA-011)
// 핵심 강제: 이중 클레임 불가, 토큰 불일치 거부, completed 전이는 verifier만.

import { randomBytes } from "node:crypto";
import type { Ctx } from "../context.js";
import type { ProgressReport, Role, Run, Task } from "../types.js";
import { ToolError } from "../errors.js";

const STATUS_WEIGHT: Record<string, number> = {
  NOT_STARTED: 0,
  IN_PROGRESS: 25,
  PARTIAL: 50,
  IMPLEMENTED: 75,
  VERIFIED: 100,
};

function nowIso(): string {
  return new Date().toISOString();
}

export async function factoryInitialize(
  ctx: Ctx,
  input: { config?: Record<string, unknown> },
): Promise<{ initialized: boolean; root: string }> {
  ctx.store.initialize();
  if (input.config) {
    await ctx.store.withLock("factory_initialize", () => {
      ctx.store.saveConfigSnapshot(input.config);
    });
  }
  return { initialized: true, root: ctx.store.root };
}

/** 진행도 계산 — MVP-1.md 3.15 공식. BLOCKED/NHD는 직전 도달 상태 가중치 유지. */
export function computeProgressPct(ctx: Ctx): number {
  const { items } = ctx.store.loadRoadmap();
  const required = items.filter((i) => i.priority !== "P2");
  if (required.length === 0) return 0;
  let sum = 0;
  for (const item of required) {
    let weight = STATUS_WEIGHT[item.status];
    if (weight === undefined) {
      // BLOCKED / NEEDS_HUMAN_DECISION → 이력에서 마지막 가중치 상태를 찾는다
      const history = item.status_history ?? [];
      weight = 0;
      for (let i = history.length - 1; i >= 0; i--) {
        const from = history[i]?.from;
        if (from !== undefined && STATUS_WEIGHT[from] !== undefined) {
          weight = STATUS_WEIGHT[from]!;
          break;
        }
      }
    }
    sum += weight;
  }
  return Math.round((sum / required.length) * 10) / 10;
}

export function factoryGetStatus(ctx: Ctx): {
  progress_pct: number;
  roadmap: Record<string, number>;
  open_findings: number;
  blocker_findings: number;
  pending_approvals: number;
  blocking_placeholders: number;
  latest_run?: { id: string; status: string; exit_reason?: string };
} {
  const { items } = ctx.store.loadRoadmap();
  const byStatus: Record<string, number> = {};
  for (const i of items) byStatus[i.status] = (byStatus[i.status] ?? 0) + 1;
  const findings = ctx.store.listFindings();
  const open = findings.filter((f) => f.status === "open" || f.status === "reopened" || f.status === "in_fix");
  const approvals = ctx.store.listApprovals().filter((a) => a.status === "pending");
  const blockingPh = ctx.store
    .listPlaceholders()
    .filter((p) => p.release_blocking && p.status !== "resolved");
  const latest = ctx.store.latestRun();
  return {
    progress_pct: computeProgressPct(ctx),
    roadmap: byStatus,
    open_findings: open.length,
    blocker_findings: open.filter((f) => f.severity === "blocker").length,
    pending_approvals: approvals.length,
    blocking_placeholders: blockingPh.length,
    ...(latest
      ? { latest_run: { id: latest.id, status: latest.status, exit_reason: latest.exit_reason } }
      : {}),
  };
}

/**
 * 다음 작업 선택 — 결정론적: 의존성 충족 → 우선순위(P0<P1<P2) → ID 순.
 * dangerous 태그가 있고 승인이 없으면 건너뛰고 사유를 함께 보고한다.
 */
export function factoryGetNextTask(ctx: Ctx): {
  task?: Task;
  skipped_dangerous: { task_id: string; reason: string }[];
  queue_empty: boolean;
} {
  const tasks = ctx.store.listTasks();
  const done = new Set(tasks.filter((t) => t.status === "completed").map((t) => t.id));
  const approvals = ctx.store.listApprovals();
  const skipped: { task_id: string; reason: string }[] = [];

  const eligible = tasks
    .filter((t) => t.status === "queued")
    .filter((t) => (t.depends_on ?? []).every((d) => done.has(d)))
    .sort((a, b) => {
      const pa = a.priority ?? "P1";
      const pb = b.priority ?? "P1";
      if (pa !== pb) return pa.localeCompare(pb);
      return a.id.localeCompare(b.id);
    });

  for (const t of eligible) {
    const dangerous = t.dangerous ?? [];
    if (dangerous.length > 0) {
      const approved = approvals.some(
        (a) => a.status === "approved" && a.subject === t.id,
      );
      if (!approved) {
        skipped.push({
          task_id: t.id,
          reason: `위험 작업(${dangerous.join(",")}) — 승인 필요`,
        });
        continue;
      }
    }
    return { task: t, skipped_dangerous: skipped, queue_empty: false };
  }
  return { skipped_dangerous: skipped, queue_empty: eligible.length === 0 };
}

export async function factoryClaimTask(
  ctx: Ctx,
  input: { task_id: string; role: "orchestrator" | "worker" | "verifier" | "auditor"; agent: string },
): Promise<{ task_id: string; token: string }> {
  return ctx.store.withLock("factory_claim_task", () => {
    const task = ctx.store.loadTask(input.task_id);
    if (task.status !== "queued") {
      throw new ToolError(
        "ALREADY_CLAIMED",
        `작업 ${task.id}은(는) '${task.status}' 상태 — 클레임 불가`,
      );
    }
    // verify 작업은 verifier만, implement/fix는 worker만 클레임 가능
    if (task.type === "verify" && input.role !== "verifier") {
      throw new ToolError("ROLE_FORBIDDEN", `verify 작업은 verifier만 클레임할 수 있습니다`);
    }
    if ((task.type === "implement" || task.type === "fix") && input.role !== "worker") {
      throw new ToolError("ROLE_FORBIDDEN", `${task.type} 작업은 worker만 클레임할 수 있습니다`);
    }
    const token = randomBytes(12).toString("hex");
    task.status = "claimed";
    task.claim = { role: input.role, agent: input.agent, token, at: nowIso() };
    ctx.store.saveTask(task);
    return { task_id: task.id, token };
  });
}

export async function factorySubmitResult(
  ctx: Ctx,
  input: {
    task_id: string;
    token: string;
    result: {
      summary: string;
      changed_files?: string[];
      build_ok?: boolean;
      test_ok?: boolean;
      requested_status?: "IMPLEMENTED" | "PARTIAL" | "BLOCKED";
      evidence_ids?: string[];
    };
  },
): Promise<{ task_id: string; status: string }> {
  return ctx.store.withLock("factory_submit_result", () => {
    const task = ctx.store.loadTask(input.task_id);
    if (!task.claim) {
      throw new ToolError("INVALID_INPUT", `작업 ${task.id}은(는) 클레임되지 않았습니다`);
    }
    if (task.claim.token !== input.token) {
      throw new ToolError(
        "CLAIM_TOKEN_MISMATCH",
        `작업 ${task.id}: 클레임 토큰 불일치 — 제출 주체 검증 실패`,
      );
    }
    task.result = { ...input.result, submitted_at: nowIso() };
    task.status = "submitted";
    task.attempts += 1;
    ctx.store.saveTask(task);
    return { task_id: task.id, status: task.status };
  });
}

/** completed 전이 — verifier 전용 (MVP-1 핵심 원칙의 작업 레벨 강제) */
export async function factoryCompleteTask(
  ctx: Ctx,
  input: { task_id: string; role: Role; verified_by: string },
): Promise<{ task_id: string; status: string }> {
  if (input.role !== "verifier") {
    throw new ToolError(
      "ROLE_FORBIDDEN",
      `factory_complete_task는 verifier 전용입니다 (요청 role: ${input.role})`,
    );
  }
  return ctx.store.withLock("factory_complete_task", () => {
    const task = ctx.store.loadTask(input.task_id);
    if (task.status !== "submitted") {
      throw new ToolError(
        "INVALID_INPUT",
        `제출(submitted) 상태의 작업만 완료할 수 있습니다 (현재: ${task.status})`,
      );
    }
    task.status = "completed";
    ctx.store.saveTask(task);
    return { task_id: task.id, status: task.status };
  });
}

export async function factoryReopenTask(
  ctx: Ctx,
  input: { task_id: string; reason: string },
): Promise<{ task_id: string; status: string }> {
  return ctx.store.withLock("factory_reopen_task", () => {
    const task = ctx.store.loadTask(input.task_id);
    if (task.status !== "completed" && task.status !== "failed" && task.status !== "cancelled") {
      throw new ToolError(
        "INVALID_INPUT",
        `완료·실패·취소 상태의 작업만 재개방할 수 있습니다 (현재: ${task.status})`,
      );
    }
    task.status = "queued";
    delete task.claim;
    task.description = `${task.description ?? ""}\n[재개방] ${input.reason}`.trim();
    ctx.store.saveTask(task);
    return { task_id: task.id, status: task.status };
  });
}

export async function factoryCreateTask(
  ctx: Ctx,
  input: Omit<
    Task,
    "version" | "id" | "status" | "attempts" | "created_at" | "updated_at" | "max_attempts"
  > & {
    max_attempts?: number;
  },
): Promise<{ task_id: string }> {
  return ctx.store.withLock("factory_create_task", () => {
    const id = ctx.store.nextTaskId();
    const task: Task = {
      version: 1,
      id,
      type: input.type,
      title: input.title,
      status: "queued",
      attempts: 0,
      max_attempts: input.max_attempts ?? 3,
      created_at: nowIso(),
      ...(input.description ? { description: input.description } : {}),
      ...(input.roadmap_item_id ? { roadmap_item_id: input.roadmap_item_id } : {}),
      ...(input.finding_id ? { finding_id: input.finding_id } : {}),
      ...(input.priority ? { priority: input.priority } : {}),
      ...(input.depends_on ? { depends_on: input.depends_on } : {}),
      ...(input.dangerous ? { dangerous: input.dangerous } : {}),
    };
    if (task.type === "fix" && !task.finding_id) {
      throw new ToolError("INVALID_INPUT", "fix 작업에는 finding_id가 필요합니다");
    }
    ctx.store.saveTask(task);
    return { task_id: id };
  });
}

// ── 사이클 (run) ────────────────────────────────────────────────────────

export async function factoryStartCycle(
  ctx: Ctx,
  input: {
    command: Run["command"];
    provider: Run["provider"];
    phase: string;
    task_ids?: string[];
  },
): Promise<{ run_id: string; cycle_seq: number }> {
  return ctx.store.withLock("factory_start_cycle", () => {
    let run = ctx.store.latestRun();
    if (!run || run.status === "finished") {
      const resumedFrom = run?.id;
      run = {
        version: 1,
        id: ctx.store.nextRunId(),
        command: input.command,
        provider: input.provider,
        status: "running",
        cycles: [],
        started_at: nowIso(),
        ...(resumedFrom ? { resumed_from_run_id: resumedFrom } : {}),
      };
    }
    const cycles = run.cycles ?? [];
    const seq = cycles.length + 1;
    cycles.push({
      seq,
      phase: input.phase,
      started_at: nowIso(),
      report: { summary: "(진행 중)", goals: "", next: { description: "" }, progress_pct: 0 },
      ...(input.task_ids ? { task_ids: input.task_ids } : {}),
    });
    run.cycles = cycles;
    ctx.store.saveRun(run);
    return { run_id: run.id, cycle_seq: seq };
  });
}

export async function factoryFinishCycle(
  ctx: Ctx,
  input: { run_id: string; cycle_seq: number; report: Omit<ProgressReport, "progress_pct"> },
): Promise<{ run_id: string; report: ProgressReport }> {
  return ctx.store.withLock("factory_finish_cycle", () => {
    const run = ctx.store.loadRun(input.run_id);
    const cycle = (run.cycles ?? []).find((c) => c.seq === input.cycle_seq);
    if (!cycle) throw new ToolError("NOT_FOUND", `사이클 ${input.cycle_seq}을 찾을 수 없습니다`);
    const report: ProgressReport = { ...input.report, progress_pct: computeProgressPct(ctx) };
    cycle.report = report;
    cycle.ended_at = nowIso();
    ctx.store.saveRun(run);
    return { run_id: run.id, report };
  });
}

export async function factoryAbortCycle(
  ctx: Ctx,
  input: { run_id: string; exit_reason: NonNullable<Run["exit_reason"]>; reason?: string },
): Promise<{ run_id: string; status: string }> {
  return ctx.store.withLock("factory_abort_cycle", () => {
    const run = ctx.store.loadRun(input.run_id);
    run.status = "finished";
    run.exit_reason = input.exit_reason;
    run.ended_at = nowIso();
    ctx.store.saveRun(run);
    return { run_id: run.id, status: run.status };
  });
}

/** 재개 시 stale 클레임 회수 (state-store.md 5절) — 드라이버·재개 절차가 호출 */
export async function recoverStaleClaims(
  ctx: Ctx,
  staleMinutes = 60,
): Promise<{ recovered: string[] }> {
  return ctx.store.withLock("recover_stale_claims", () => {
    const cutoff = Date.now() - staleMinutes * 60 * 1000;
    const latestRun = ctx.store.latestRun();
    const runFinished = !latestRun || latestRun.status === "finished";
    const recovered: string[] = [];
    for (const task of ctx.store.listTasks()) {
      if ((task.status === "claimed" || task.status === "in_progress") && task.claim) {
        const claimedAt = Date.parse(task.claim.at);
        if (claimedAt < cutoff || runFinished) {
          task.status = "queued";
          delete task.claim;
          ctx.store.saveTask(task);
          recovered.push(task.id);
        }
      }
    }
    return { recovered };
  });
}
