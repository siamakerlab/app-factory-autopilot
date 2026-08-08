// AFA-020/024/025/026 테스트 — 결정 루프, 실패 정책, 진행 보고, 무중단 드라이버.

import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { makeCtx, sampleItem } from "./helpers.js";
import {
  decideNextAction,
  handleTaskFailure,
  loadLimits,
  normalizeError,
} from "../orchestrator.js";
import { buildProgressReport } from "../report.js";
import { driveAuto } from "../driver.js";
import {
  factoryClaimTask,
  factoryCompleteTask,
  factoryCreateTask,
  factorySubmitResult,
} from "../tools/factory.js";
import { gateRunAll } from "../tools/gate.js";
import { roadmapParse, roadmapUpdateStatus } from "../tools/roadmap.js";
import { evidenceRegister } from "../tools/finding-evidence.js";
import type { Ctx } from "../context.js";

test("decideNextAction — 빈 프로젝트는 상태 확인(check_state)부터", () => {
  const { ctx, cleanup } = makeCtx();
  try {
    const a = decideNextAction(ctx);
    assert.equal(a.kind, "dispatch");
    if (a.kind === "dispatch") assert.equal(a.phase.id, "check_state");
  } finally {
    cleanup();
  }
});

test("decideNextAction — 재실행 시 동일 지점 재개 (멱등)", () => {
  const { ctx, cleanup } = makeCtx();
  try {
    ctx.store.saveConfigSnapshot({ version: 1 });
    const a1 = decideNextAction(ctx);
    const a2 = decideNextAction(ctx);
    assert.deepEqual(a1, a2);
    if (a1.kind === "dispatch") assert.equal(a1.phase.id, "project_setup");
  } finally {
    cleanup();
  }
});

test("동일 오류 정규화 — 경로·숫자 마스킹", () => {
  const { ctx, cleanup } = makeCtx();
  try {
    const limits = loadLimits(ctx.coreDir);
    const a = normalizeError("error: /home/user/app/Main.kt:42 unresolved reference", limits);
    const b = normalizeError("error: /tmp/other/Main.kt:99 unresolved reference", limits);
    assert.equal(a, b);
  } finally {
    cleanup();
  }
});

test("handleTaskFailure — 한도 내 재큐, 초과 시 blocked + 승인 요청", async () => {
  const { ctx, cleanup } = makeCtx();
  try {
    const { task_id } = await factoryCreateTask(ctx, { type: "implement", title: "실패 작업" });
    const r1 = await handleTaskFailure(ctx, { task_id, error_message: "error: X" });
    assert.equal(r1.action, "requeued");
    const r2 = await handleTaskFailure(ctx, { task_id, error_message: "error: X" });
    assert.equal(r2.action, "requeued");
    const r3 = await handleTaskFailure(ctx, { task_id, error_message: "error: X" });
    assert.equal(r3.action, "blocked");
    assert.ok(r3.approval_id);
    const approval = ctx.store.loadApproval(r3.approval_id!);
    assert.equal(approval.status, "pending");
    assert.ok(approval.options.length >= 2);
  } finally {
    cleanup();
  }
});

test("진행 보고 — 상태 저장소만으로 4요소 생성", async () => {
  const { ctx, cleanup } = makeCtx();
  try {
    await roadmapParse(ctx, {
      items: [
        sampleItem({ id: "RM-001", status: "VERIFIED" }),
        sampleItem({ id: "RM-002", status: "NOT_STARTED" }),
      ],
    });
    const r = buildProgressReport(ctx);
    assert.match(r.summary, /완료\(VERIFIED\) 1건/);
    assert.match(r.goals, /잔여 1건/);
    assert.equal(r.progress_pct, 50);
    assert.ok(r.next.description.length > 0);
  } finally {
    cleanup();
  }
});

/** 미니 파이프라인 executor — 각 단계를 결정론적으로 시뮬레이션 (LLM 대역) */
function makeSimulator(projectRoot: string) {
  return async (ctx: Ctx, action: { phase: { id: string }; task_id?: string }) => {
    switch (action.phase.id) {
      case "check_state":
        ctx.store.saveConfigSnapshot({ version: 1, commands: { build: "true", test: "true", lint: "true" } });
        return { progressed: true };
      case "project_setup":
        fs.writeFileSync(path.join(projectRoot, "settings.gradle.kts"), "// scaffold");
        return { progressed: true };
      case "docs_indexing":
        fs.mkdirSync(path.join(projectRoot, "docs"), { recursive: true });
        fs.writeFileSync(path.join(projectRoot, "docs", "DOCS_INDEX.md"), "# DOCS");
        return { progressed: true };
      case "roadmap_audit":
        await evidenceRegister(ctx, {
          kind: "verifier_report",
          created_by: { role: "auditor", name: "roadmap-auditor" },
          data: { audit: "roadmap", clean: true },
        });
        return { progressed: true };
      case "implementation_loop": {
        const taskId = action.task_id!;
        const { token } = await factoryClaimTask(ctx, { task_id: taskId, role: "worker", agent: "sim" });
        await factorySubmitResult(ctx, {
          task_id: taskId,
          token,
          result: { summary: "구현", requested_status: "IMPLEMENTED", build_ok: true, test_ok: true },
        });
        const task = ctx.store.loadTask(taskId);
        if (task.roadmap_item_id) {
          await roadmapUpdateStatus(ctx, {
            item_id: task.roadmap_item_id,
            to: "IN_PROGRESS",
            role: "orchestrator",
          }).catch(() => {});
          await roadmapUpdateStatus(ctx, {
            item_id: task.roadmap_item_id,
            to: "IMPLEMENTED",
            role: "worker",
            task_id: taskId,
          });
        }
        await factoryCompleteTask(ctx, { task_id: taskId, role: "verifier", verified_by: "sim-v" });
        return { progressed: true };
      }
      case "verification": {
        const items = ctx.store.loadRoadmap().items.filter((i) => i.status === "IMPLEMENTED");
        for (const item of items) {
          const { evidence_id } = await evidenceRegister(ctx, {
            kind: "verifier_report",
            created_by: { role: "verifier", name: "sim-verifier" },
            roadmap_item_ids: [item.id],
            summary: "독립 검증 통과",
          });
          await roadmapUpdateStatus(ctx, {
            item_id: item.id,
            to: "VERIFIED",
            role: "verifier",
            evidence_ids: [evidence_id],
            criteria_updates: item.completion_criteria.map((_, i) => ({ index: i, satisfied: true })),
          });
        }
        return { progressed: true };
      }
      case "emulator_check":
        await evidenceRegister(ctx, {
          kind: "emulator_scenario_result",
          created_by: { role: "gate", name: "emulator" },
          data: { crash: false },
        });
        return { progressed: true };
      case "final_gate":
        await evidenceRegister(ctx, {
          kind: "license_report",
          created_by: { role: "gate", name: "license" },
          data: { ok: true },
        });
        await gateRunAll(ctx);
        return { progressed: true };
      default:
        return { progressed: false, note: `미지원 단계: ${action.phase.id}` };
    }
  };
}

test("드라이버 — 사용자 입력 없이 완료까지 무중단 진행 (One-Prompt)", async () => {
  const { ctx, projectRoot, cleanup } = makeCtx();
  try {
    await roadmapParse(ctx, { items: [sampleItem({ id: "RM-001" })] });
    await factoryCreateTask(ctx, {
      type: "implement",
      title: "RM-001 구현",
      roadmap_item_id: "RM-001",
      priority: "P0",
    });
    const result = await driveAuto(ctx, makeSimulator(projectRoot));
    assert.equal(result.exit_reason, "completed");
    assert.ok(result.cycles >= 5, `사이클 수 ${result.cycles}`);
    assert.equal(result.cycle_reports.length, result.cycles);
    assert.match(result.cycle_reports[0]!, /진행 보고/);
    assert.match(result.cycle_reports[0]!, /이번 사이클:/);
    assert.match(result.cycle_reports[0]!, /다음 작업:/);
    assert.match(result.cycle_reports[0]!, /전체 진행도:/);
    assert.equal(result.final_report.progress_pct, 100);
    // 각 사이클 종료 시 3.15 보고 4요소가 run에 기록되어 있다 (DoD 13)
    const run = ctx.store.loadRun(result.run_id);
    assert.ok(run.cycles!.length >= 5);
    for (const c of run.cycles!) {
      assert.ok(c.report.summary.length > 0);
      assert.ok(c.report.goals.length > 0);
      assert.ok(c.report.next.description.length > 0);
      assert.ok(c.report.progress_pct >= 0);
    }
  } finally {
    cleanup();
  }
});

test("드라이버 — 무진전 정체 시 forced_stop + pending 보고 (무한 루프 방지)", async () => {
  const { ctx, projectRoot, cleanup } = makeCtx();
  try {
    await roadmapParse(ctx, { items: [sampleItem({ id: "RM-001" })] });
    fs.writeFileSync(path.join(projectRoot, "settings.gradle.kts"), "");
    ctx.store.saveConfigSnapshot({ version: 1 });
    const noop = async () => ({ progressed: false });
    const result = await driveAuto(ctx, noop);
    assert.equal(result.exit_reason, "forced_stop");
    assert.ok(result.pending.length >= 1);
  } finally {
    cleanup();
  }
});

test("드라이버 — 중단 후 재실행 시 완료 작업 건너뛰고 이어서 진행 (DoD 9)", async () => {
  const { ctx, projectRoot, cleanup } = makeCtx();
  try {
    await roadmapParse(ctx, {
      items: [sampleItem({ id: "RM-001" }), sampleItem({ id: "RM-002" })],
    });
    const t1 = await factoryCreateTask(ctx, { type: "implement", title: "RM-001 구현", roadmap_item_id: "RM-001", priority: "P0" });
    await factoryCreateTask(ctx, { type: "implement", title: "RM-002 구현", roadmap_item_id: "RM-002", priority: "P0" });

    // 1차 실행: RM-001 구현 직후 "중단"되는 executor
    let executed = 0;
    const sim = makeSimulator(projectRoot);
    const interrupting = async (c: Ctx, a: Parameters<ReturnType<typeof makeSimulator>>[1]) => {
      if (a.phase.id === "implementation_loop") {
        executed += 1;
        if (executed === 2) throw new Error("세션 강제 종료 시뮬레이션");
      }
      return sim(c, a);
    };
    await assert.rejects(driveAuto(ctx, interrupting));

    // 완료된 T-0001은 completed 상태
    assert.equal(ctx.store.loadTask(t1.task_id).status, "completed");

    // 2차 실행: 이어서 완주
    const result = await driveAuto(ctx, sim);
    assert.equal(result.exit_reason, "completed");
    // RM-001 재수행 없음 — T-0001 attempts는 1회 제출 그대로
    assert.equal(ctx.store.loadTask(t1.task_id).attempts, 1);
  } finally {
    cleanup();
  }
});
