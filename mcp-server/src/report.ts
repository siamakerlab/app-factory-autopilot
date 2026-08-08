// 턴 종료 진행 보고 생성기 (AFA-025) — 통합 명세 3.15의 4요소.
// 대화 기억이 아니라 상태 저장소만으로 생성한다 (재시작 후 동일 보고 재현).

import type { Ctx } from "./context.js";
import type { ProgressReport } from "./types.js";
import { computeProgressPct, factoryGetNextTask } from "./tools/factory.js";

export function buildProgressReport(ctx: Ctx): ProgressReport {
  const { items } = ctx.store.loadRoadmap();
  const required = items.filter((i) => i.priority !== "P2");
  const verified = required.filter((i) => i.status === "VERIFIED");
  const inProgress = required.filter((i) =>
    ["IN_PROGRESS", "IMPLEMENTED", "PARTIAL"].includes(i.status),
  );
  const remaining = required.filter((i) => i.status === "NOT_STARTED");
  const nhd = required.filter((i) =>
    ["NEEDS_HUMAN_DECISION", "BLOCKED"].includes(i.status),
  );

  // ① 현재까지의 진행 상황
  const summaryParts = [
    `필수 ${required.length}건 중 완료(VERIFIED) ${verified.length}건`,
    inProgress.length ? `진행·검증 대기 ${inProgress.length}건` : "",
    nhd.length ? `보류(결정 대기·차단) ${nhd.length}건` : "",
  ].filter(Boolean);

  // ② 앞으로의 목표
  const goals =
    remaining.length + inProgress.length > 0
      ? `잔여 ${remaining.length + inProgress.length}건 구현·검증 후 최종 게이트 통과`
      : nhd.length > 0
        ? `보류 항목 ${nhd.length}건 해소 후 최종 게이트 통과`
        : "최종 게이트 통과 및 완료 판정";

  // ③ 다음 턴 예정 — factory_get_next_task 결과를 그대로 사용 (보고≡행동)
  const next = factoryGetNextTask(ctx);
  const nextDesc = next.task
    ? { task_id: next.task.id, description: `${next.task.title} (${next.task.type})` }
    : next.skipped_dangerous.length > 0
      ? { description: `승인 대기 ${next.skipped_dangerous.length}건 — 사용자 결정 필요` }
      : { description: "잔여 큐 없음 — 검증·게이트 단계 진행" };

  return {
    summary: summaryParts.join(", ") || "로드맵 없음 — plan 산출물 반입 필요",
    goals,
    next: nextDesc,
    progress_pct: computeProgressPct(ctx), // ④ 전체 진행도 (3.15 공식)
  };
}

/** 사람이 읽는 형식 (factory status·턴 종료 보고 공용) */
export function renderProgressReport(report: ProgressReport): string {
  return [
    "📋 진행 보고",
    `- 진행 상황: ${report.summary}`,
    `- 앞으로의 목표: ${report.goals}`,
    `- 다음 턴 예정: ${report.next.task_id ? `[${report.next.task_id}] ` : ""}${report.next.description}`,
    `- 전체 진행도: ${report.progress_pct}%`,
  ].join("\n");
}
