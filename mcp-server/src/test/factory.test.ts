// AFA-011 공정 도구 테스트 — 클레임·토큰·role 강제·다음 작업 결정론.

import { test } from "node:test";
import assert from "node:assert/strict";
import { makeCtx } from "./helpers.js";
import {
  factoryAbortCycle,
  factoryClaimTask,
  factoryCompleteTask,
  factoryCreateTask,
  factoryRecordDelegation,
  factoryRecordWatchdog,
  factoryGetNextTask,
  factoryStartCycle,
  factorySubmitResult,
  recoverStaleClaims,
} from "../tools/factory.js";
import { approvalRequest, approvalDecide } from "../tools/approval-placeholder.js";

test("이중 클레임 거부", async () => {
  const { ctx, cleanup } = makeCtx();
  try {
    const { task_id } = await factoryCreateTask(ctx, { type: "implement", title: "구현" });
    await factoryClaimTask(ctx, { task_id, role: "worker", agent: "w1" });
    await assert.rejects(
      factoryClaimTask(ctx, { task_id, role: "worker", agent: "w2" }),
      /클레임 불가/,
    );
  } finally {
    cleanup();
  }
});

test("클레임 토큰 불일치 시 제출 거부", async () => {
  const { ctx, cleanup } = makeCtx();
  try {
    const { task_id } = await factoryCreateTask(ctx, { type: "implement", title: "구현" });
    await factoryClaimTask(ctx, { task_id, role: "worker", agent: "w1" });
    await assert.rejects(
      factorySubmitResult(ctx, { task_id, token: "위조토큰", result: { summary: "done" } }),
      /토큰 불일치/,
    );
  } finally {
    cleanup();
  }
});

test("factory_complete_task는 verifier가 아니면 거부", async () => {
  const { ctx, cleanup } = makeCtx();
  try {
    const { task_id } = await factoryCreateTask(ctx, { type: "implement", title: "구현" });
    const { token } = await factoryClaimTask(ctx, { task_id, role: "worker", agent: "w1" });
    await factorySubmitResult(ctx, { task_id, token, result: { summary: "완료" } });
    for (const role of ["worker", "orchestrator", "auditor"] as const) {
      await assert.rejects(
        factoryCompleteTask(ctx, { task_id, role, verified_by: "x" }),
        /verifier 전용/,
      );
    }
    const done = await factoryCompleteTask(ctx, { task_id, role: "verifier", verified_by: "v1" });
    assert.equal(done.status, "completed");
  } finally {
    cleanup();
  }
});

test("verify 작업은 verifier만, implement는 worker만 클레임 가능", async () => {
  const { ctx, cleanup } = makeCtx();
  try {
    const impl = await factoryCreateTask(ctx, { type: "implement", title: "구현" });
    const veri = await factoryCreateTask(ctx, { type: "verify", title: "검증" });
    await assert.rejects(
      factoryClaimTask(ctx, { task_id: impl.task_id, role: "verifier", agent: "v" }),
    );
    await assert.rejects(
      factoryClaimTask(ctx, { task_id: veri.task_id, role: "worker", agent: "w" }),
    );
  } finally {
    cleanup();
  }
});

test("factory_abort_cycle은 단위 사이클 경계를 terminal 종료 사유로 받지 않는다", async () => {
  const { ctx, cleanup } = makeCtx();
  try {
    const { run_id } = await factoryStartCycle(ctx, {
      command: "auto",
      provider: "cli",
      phase: "구현",
    });
    await assert.rejects(
      factoryAbortCycle(ctx, {
        run_id,
        exit_reason: "cycle_complete_commit_boundary" as never,
      }),
      /지원하지 않는 종료 사유/,
    );
    assert.equal(ctx.store.loadRun(run_id).status, "running");
  } finally {
    cleanup();
  }
});

test("다음 작업 — 의존성·우선순위·ID 순 결정론, 위험 작업은 승인 전 건너뜀", async () => {
  const { ctx, cleanup } = makeCtx();
  try {
    const a = await factoryCreateTask(ctx, { type: "implement", title: "A", priority: "P1" });
    const b = await factoryCreateTask(ctx, {
      type: "implement",
      title: "B (A 의존)",
      priority: "P0",
      depends_on: [a.task_id],
    });
    const c = await factoryCreateTask(ctx, {
      type: "implement",
      title: "C 위험",
      priority: "P0",
      dangerous: ["git_push"],
    });
    const d = await factoryCreateTask(ctx, { type: "implement", title: "D", priority: "P0" });

    // B는 의존성 미충족, C는 승인 없음 → D가 선택되어야 함
    const next1 = factoryGetNextTask(ctx);
    assert.equal(next1.task?.id, d.task_id);
    assert.equal(next1.skipped_dangerous.length, 1);
    assert.equal(next1.skipped_dangerous[0]?.task_id, c.task_id);

    // C 승인 후에는 C가 선택 (P0, ID 순으로 D보다 앞)
    const { approval_id } = await approvalRequest(ctx, {
      subject: c.task_id,
      options: ["진행", "중단"],
      rationale: "테스트",
      risks: "git push",
      recommendation: "진행",
    });
    await approvalDecide(ctx, { approval_id, approved: true });
    const next2 = factoryGetNextTask(ctx);
    assert.equal(next2.task?.id, c.task_id);
    assert.equal(b.task_id.startsWith("T-"), true);
  } finally {
    cleanup();
  }
});

test("stale 클레임 회수 — run 종료 상태면 큐로 복귀", async () => {
  const { ctx, cleanup } = makeCtx();
  try {
    const { task_id } = await factoryCreateTask(ctx, { type: "implement", title: "중단됨" });
    await factoryClaimTask(ctx, { task_id, role: "worker", agent: "w1" });
    const { recovered } = await recoverStaleClaims(ctx, 60);
    assert.deepEqual(recovered, [task_id]);
    const next = factoryGetNextTask(ctx);
    assert.equal(next.task?.id, task_id);
  } finally {
    cleanup();
  }
});

test("AFA-061 위임 판단과 watchdog 결과가 run cycle에 기록된다", async () => {
  const { ctx, cleanup } = makeCtx();
  try {
    const { task_id } = await factoryCreateTask(ctx, { type: "implement", title: "구현" });
    const { run_id, cycle_seq } = await factoryStartCycle(ctx, {
      command: "auto",
      provider: "cli",
      phase: "implementation_loop",
      task_ids: [task_id],
    });

    const delegation = await factoryRecordDelegation(ctx, {
      run_id,
      cycle_seq,
      selected_agent: "implementation-worker",
      selected_skill: "roadmap-implement",
      rationale: "queued implement task requires worker role and build evidence",
      task_type: "implement",
      roadmap_phase: "implementation_loop",
      required_evidence: ["code", "build"],
      file_ownership: ["app/src/main"],
      dangerous_tags: [],
      tool_availability: { "factory_submit_result": true },
      previous_failures: [],
    });
    assert.equal(delegation.parallel_agents_allowed, false);

    const running = await factoryRecordWatchdog(ctx, {
      run_id,
      cycle_seq,
      agent: "implementation-worker",
      status: "running",
      detail: "5 minute poll",
    });
    assert.equal(running.action, "wait");
    const stale = await factoryRecordWatchdog(ctx, {
      run_id,
      cycle_seq,
      agent: "implementation-worker",
      status: "stale_owner",
    });
    assert.equal(stale.action, "force_terminate_then_retry");

    const run = ctx.store.loadRun(run_id);
    const cycle = run.cycles?.[0];
    assert.equal(cycle?.delegation?.selected_agent, "implementation-worker");
    assert.equal(cycle?.delegation?.parallel_agents_allowed, false);
    assert.ok(cycle?.delegation?.report_contract.includes("commit_ready"));
    assert.equal(cycle?.watchdog_events?.length, 2);
    assert.equal(cycle?.watchdog_events?.[0]?.action, "wait");
    assert.equal(cycle?.watchdog_events?.[1]?.status, "stale_owner");
  } finally {
    cleanup();
  }
});
