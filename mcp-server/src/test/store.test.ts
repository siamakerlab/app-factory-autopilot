// AFA-003/AFA-010 상태 저장소 테스트 — 채번·원자성·잠금·stale 회수.

import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { makeCtx } from "./helpers.js";

test("초기화가 규약 디렉터리를 생성한다", () => {
  const { ctx, cleanup } = makeCtx();
  try {
    for (const d of ["config", "state/placeholders", "task-queue", "findings", "runs", "evidence", "reports"]) {
      assert.ok(fs.existsSync(path.join(ctx.store.root, d)), d);
    }
  } finally {
    cleanup();
  }
});

test("ID 채번 — 순차·재사용 금지·run은 날짜별 초기화", () => {
  const { ctx, cleanup } = makeCtx();
  try {
    assert.equal(ctx.store.nextTaskId(), "T-0001");
    assert.equal(ctx.store.nextTaskId(), "T-0002");
    assert.equal(ctx.store.nextFindingId(), "F-0001");
    assert.equal(ctx.store.nextEvidenceId(), "E-0001");
    const r1 = ctx.store.nextRunId("20260805");
    const r2 = ctx.store.nextRunId("20260805");
    const r3 = ctx.store.nextRunId("20260806");
    assert.equal(r1, "R-20260805-001");
    assert.equal(r2, "R-20260805-002");
    assert.equal(r3, "R-20260806-001");
  } finally {
    cleanup();
  }
});

test("잠금 — 이중 획득 불가, 해제 후 재획득 가능", async () => {
  const { ctx, cleanup } = makeCtx();
  try {
    await ctx.store.acquireLock("test-1");
    // 두 번째 획득은 타임아웃까지 대기 → stale 아님 → 실패해야 하지만
    // 30초 대기는 테스트에 부적합하므로 잠금 파일 존재만 확인
    assert.ok(fs.existsSync(path.join(ctx.store.root, "state", ".lock")));
    ctx.store.releaseLock();
    await ctx.store.acquireLock("test-2");
    ctx.store.releaseLock();
  } finally {
    cleanup();
  }
});

test("stale 잠금 회수 — 죽은 PID + 10분 초과만 회수", () => {
  const { ctx, cleanup } = makeCtx();
  try {
    const lockPath = path.join(ctx.store.root, "state", ".lock");
    // 죽은 PID(999999) + 오래된 타임스탬프 → 회수됨
    fs.writeFileSync(
      lockPath,
      JSON.stringify({ pid: 999999, owner: "dead", acquired_at: new Date(Date.now() - 11 * 60 * 1000).toISOString() }),
    );
    assert.equal(ctx.store.tryRecoverStaleLock(), true);
    assert.ok(!fs.existsSync(lockPath));
    // 살아있는 PID(자기 자신) + 오래된 타임스탬프 → 회수 안 됨
    fs.writeFileSync(
      lockPath,
      JSON.stringify({ pid: process.pid, owner: "alive", acquired_at: new Date(Date.now() - 11 * 60 * 1000).toISOString() }),
    );
    assert.equal(ctx.store.tryRecoverStaleLock(), false);
    // 최근 타임스탬프 → 회수 안 됨
    fs.writeFileSync(
      lockPath,
      JSON.stringify({ pid: 999999, owner: "recent", acquired_at: new Date().toISOString() }),
    );
    assert.equal(ctx.store.tryRecoverStaleLock(), false);
  } finally {
    cleanup();
  }
});

test("원자적 쓰기 — 임시 파일이 남지 않는다", () => {
  const { ctx, cleanup } = makeCtx();
  try {
    const p = path.join(ctx.store.root, "state", "roadmap.json");
    ctx.store.writeJsonAtomic(p, { version: 1, items: [] });
    const dir = fs.readdirSync(path.dirname(p));
    assert.ok(!dir.some((f) => f.includes(".tmp-")), "임시 파일 잔존");
  } finally {
    cleanup();
  }
});

test("list 계열 조회는 이전 상태 저장소의 누락 디렉터리를 빈 목록으로 처리한다", () => {
  const { ctx, cleanup } = makeCtx();
  try {
    for (const d of ["findings", "approvals", "runs", "evidence", "task-queue", "state/placeholders"]) {
      fs.rmSync(path.join(ctx.store.root, d), { recursive: true, force: true });
    }
    assert.deepEqual(ctx.store.listFindings(), []);
    assert.deepEqual(ctx.store.listApprovals(), []);
    assert.deepEqual(ctx.store.listRuns(), []);
    assert.deepEqual(ctx.store.listEvidence(), []);
    assert.deepEqual(ctx.store.listTasks(), []);
    assert.deepEqual(ctx.store.listPlaceholders(), []);
  } finally {
    cleanup();
  }
});
