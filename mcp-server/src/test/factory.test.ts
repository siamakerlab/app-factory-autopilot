// AFA-011 공정 도구 테스트 — 클레임·토큰·role 강제·다음 작업 결정론.

import { test } from "node:test";
import assert from "node:assert/strict";
import { makeCtx } from "./helpers.js";
import {
  factoryClaimTask,
  factoryCompleteTask,
  factoryCreateTask,
  factoryGetNextTask,
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
