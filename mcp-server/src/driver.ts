// 무중단 진행 드라이버 (AFA-026, One-Prompt Completion — MVP-1.md 3.17)
// 종료 조건(정상 완료·강제 중단·한도 초과) 도달까지 사이클을 반복한다.
// LLM 실행은 executor 콜백으로 위임 — 어댑터(Claude Code Stop Hook, Codex 래퍼,
// 개발용 CLI)가 이 드라이버를 감싼다. 드라이버 자체는 얇은 껍데기다.

import type { Ctx } from "./context.js";
import type { Run } from "./types.js";
import { decideNextAction, loadLimits, type NextAction, type PhaseDef } from "./orchestrator.js";
import { buildProgressReport } from "./report.js";
import {
  factoryAbortCycle,
  factoryFinishCycle,
  factoryStartCycle,
  recoverStaleClaims,
} from "./tools/factory.js";

export interface ExecutorResult {
  /** executor가 이번 사이클에서 상태를 전진시켰는지 (false 연속 시 정체로 판단) */
  progressed: boolean;
  note?: string;
}

/** phase 작업을 실제 수행하는 콜백 — 어댑터가 LLM Agent 실행으로 구현 */
export type Executor = (
  ctx: Ctx,
  action: Extract<NextAction, { kind: "dispatch" }>,
) => Promise<ExecutorResult>;

export interface DriveResult {
  run_id: string;
  exit_reason: NonNullable<Run["exit_reason"]>;
  cycles: number;
  pending: { subject: string; summary: string }[];
  final_report: ReturnType<typeof buildProgressReport>;
}

const STALL_LIMIT = 3; // 연속 무진전 사이클 한도 (안전장치 — 예산과 별개)

export async function driveAuto(
  ctx: Ctx,
  executor: Executor,
  opts: { provider?: Run["provider"]; command?: Run["command"] } = {},
): Promise<DriveResult> {
  const limits = loadLimits(ctx.coreDir);
  const provider = opts.provider ?? "cli";
  const command = opts.command ?? "auto";

  // 재개 절차: stale 클레임 회수 (state-store.md 5·6절)
  await recoverStaleClaims(ctx);

  let cycles = 0;
  let stall = 0;
  let runId: string | undefined;
  const pending: { subject: string; summary: string }[] = [];

  for (;;) {
    if (cycles >= limits.budget.max_cycles_per_run) {
      return await finish(ctx, runId, "limit_exceeded", cycles, pending);
    }
    const action = decideNextAction(ctx);

    if (action.kind === "completed") {
      return await finish(ctx, runId, "completed", cycles, pending);
    }
    if (action.kind === "blocked") {
      // 질문 지연·일괄 처리: 미결 항목을 적재하고 종료 보고에 포함 (3.17)
      pending.push(...action.pending);
      return await finish(ctx, runId, "forced_stop", cycles, pending);
    }

    // dispatch — 사이클 시작
    cycles += 1;
    const { run_id, cycle_seq } = await factoryStartCycle(ctx, {
      command,
      provider,
      phase: action.phase.title,
      ...(action.task_id ? { task_ids: [action.task_id] } : {}),
    });
    runId = run_id;
    pending.push(
      ...action.skipped_dangerous.map((s) => ({ subject: s.task_id, summary: s.reason })),
    );

    const result = await executor(ctx, action);

    // 턴 종료 보고 기록 후 자동으로 다음 사이클 계속 (보고는 정지점이 아님)
    const report = buildProgressReport(ctx);
    await factoryFinishCycle(ctx, {
      run_id,
      cycle_seq,
      report: {
        summary: result.note ? `${report.summary} — ${result.note}` : report.summary,
        goals: report.goals,
        next: report.next,
      },
    });

    if (result.progressed) {
      stall = 0;
    } else {
      stall += 1;
      if (stall >= STALL_LIMIT) {
        pending.push({
          subject: action.phase.id,
          summary: `단계 '${action.phase.title}'에서 ${STALL_LIMIT}사이클 연속 무진전 — 개입 필요`,
        });
        return await finish(ctx, runId, "forced_stop", cycles, pending);
      }
    }
  }
}

async function finish(
  ctx: Ctx,
  runId: string | undefined,
  exit: NonNullable<Run["exit_reason"]>,
  cycles: number,
  pending: { subject: string; summary: string }[],
): Promise<DriveResult> {
  const deduped = [...new Map(pending.map((p) => [p.subject, p])).values()];
  if (runId) {
    // pending_decisions 일괄 기록 (3.17 마지막 일괄 보고)
    const run = ctx.store.loadRun(runId);
    run.pending_decisions = deduped.map((p) => ({ ...p, blocking_critical_path: false }));
    ctx.store.saveRun(run);
    await factoryAbortCycle(ctx, { run_id: runId, exit_reason: exit });
  }
  return {
    run_id: runId ?? "(사이클 없음)",
    exit_reason: exit,
    cycles,
    pending: deduped,
    final_report: buildProgressReport(ctx),
  };
}
