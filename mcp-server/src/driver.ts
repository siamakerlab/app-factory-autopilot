// Continuous workflow driver (AFA-026, One-Prompt Completion).
// Repeats cycles until completed, forced_stop, or limit_exceeded.

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
  /** Whether the executor advanced state this cycle. Consecutive false results count as a stall. */
  progressed: boolean;
  note?: string;
}

/** Adapter callback that performs the selected phase, usually through an LLM agent. */
export type Executor = (
  ctx: Ctx,
  action: Extract<NextAction, { kind: "dispatch" }>,
) => Promise<ExecutorResult>;

export interface DriveResult {
  run_id: string;
  exit_reason: NonNullable<Run["exit_reason"]>;
  cycles: number;
  pending: { subject: string; summary: string }[];
  cycle_reports: string[];
  final_report: ReturnType<typeof buildProgressReport>;
}

const STALL_LIMIT = 3;

export async function driveAuto(
  ctx: Ctx,
  executor: Executor,
  opts: { provider?: Run["provider"]; command?: Run["command"] } = {},
): Promise<DriveResult> {
  const limits = loadLimits(ctx.coreDir);
  const provider = opts.provider ?? "cli";
  const command = opts.command ?? "auto";

  await recoverStaleClaims(ctx);

  let cycles = 0;
  let stall = 0;
  let runId: string | undefined;
  const pending: { subject: string; summary: string }[] = [];
  const cycleReports: string[] = [];

  for (;;) {
    if (cycles >= limits.budget.max_cycles_per_run) {
      return await finish(ctx, runId, "limit_exceeded", cycles, pending, cycleReports);
    }
    const action = decideNextAction(ctx);

    if (action.kind === "completed") {
      return await finish(ctx, runId, "completed", cycles, pending, cycleReports);
    }
    if (action.kind === "blocked") {
      pending.push(...action.pending);
      return await finish(ctx, runId, "forced_stop", cycles, pending, cycleReports);
    }

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

    const report = buildProgressReport(ctx);
    const outcome = result.note?.trim() || (action.task_id ? `작업 ${action.task_id} 처리` : action.phase.title);
    const cycleSummary = `결과: ${outcome} / 누적: ${report.summary}`;
    const finished = await factoryFinishCycle(ctx, {
      run_id,
      cycle_seq,
      report: {
        summary: cycleSummary,
        goals: report.goals,
        next: report.next,
      },
    });
    cycleReports.push(finished.rendered);

    if (result.progressed) {
      stall = 0;
    } else {
      stall += 1;
      if (stall >= STALL_LIMIT) {
        pending.push({
          subject: action.phase.id,
          summary: `${STALL_LIMIT}사이클 연속 무진전 — 개입 필요`,
        });
        return await finish(ctx, runId, "forced_stop", cycles, pending, cycleReports);
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
  cycleReports: string[],
): Promise<DriveResult> {
  const deduped = [...new Map(pending.map((p) => [p.subject, p])).values()];
  if (runId) {
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
    cycle_reports: cycleReports,
    final_report: buildProgressReport(ctx),
  };
}
