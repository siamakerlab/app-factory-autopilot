// AFA-060 — factory test 에뮬레이터 전수검사 계획·결과 기록.

import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { makeCtx } from "./helpers.js";
import { factoryStartCycle } from "../tools/factory.js";
import { factoryTestPrepare, factoryTestRecordResult, factoryTestSummary } from "../tools/factory-test.js";

test("factory test prepare — 에뮬레이터 사용 승인으로 간주하고 체크리스트 증거를 생성", async () => {
  const { ctx, cleanup } = makeCtx();
  try {
    const prepared = await factoryTestPrepare(ctx, {
      scenarios: [
        {
          id: "S-001",
          title: "메모 작성",
          user_goal: "사용자가 새 메모를 저장한다",
          steps: ["추가 버튼 탭", "본문 입력", "저장 버튼 탭"],
          buttons: ["추가", "저장"],
          features: ["메모 생성", "영속 저장"],
          expected_screens: ["편집 화면 표시", "목록에 새 메모 표시"],
          expected_outputs: ["메모가 재시작 후에도 유지됨"],
        },
      ],
      device_profiles: ["phone", "tablet"],
    });

    assert.equal(prepared.emulator_enabled, true);
    assert.deepEqual(prepared.device_profiles, ["phone", "tablet"]);
    const config = ctx.store.loadConfigSnapshot<{ automation: { emulator: boolean; defer_emulator_prompt_until_final: boolean } }>();
    assert.equal(config.automation.emulator, true);
    assert.equal(config.automation.defer_emulator_prompt_until_final, false);

    const evidence = ctx.store.loadEvidence(prepared.evidence_id);
    assert.equal(evidence.kind, "emulator_test_plan");
    assert.equal(evidence.data?.["emulator_authorized"], true);
    assert.equal(fs.existsSync(prepared.checklist_path), true);
    assert.match(fs.readFileSync(prepared.checklist_path, "utf-8"), /메모 작성/);
  } finally {
    cleanup();
  }
});

test("factory test record result — 실패 체크를 finding과 P0 fix 큐로 등록", async () => {
  const { ctx, projectRoot, cleanup } = makeCtx();
  try {
    const screenshot = path.join(projectRoot, "screen.png");
    fs.writeFileSync(screenshot, "fake png", "utf-8");

    const result = await factoryTestRecordResult(ctx, {
      scenario_id: "S-001",
      device_profile: "foldable-inner-display",
      screenshot_paths: [screenshot],
      checks: [
        {
          id: "save-button",
          description: "저장 버튼 탭 후 목록 반영",
          expected: "목록에 새 메모가 표시됨",
          actual: "목록이 비어 있음",
          passed: false,
          area: "ui_flow",
          auto_fixable: true,
        },
      ],
    });

    assert.equal(result.passed, false);
    assert.equal(result.finding_ids.length, 1);
    assert.equal(result.fix_task_ids.length, 1);
    assert.equal(ctx.store.loadEvidence(result.evidence_id).kind, "emulator_scenario_result");
    assert.equal(ctx.store.loadFinding(result.finding_ids[0]!).source.name, "factory-test");
    assert.equal(ctx.store.loadTask(result.fix_task_ids[0]!).priority, "P0");

    const summary = factoryTestSummary(ctx);
    assert.equal(summary.result_count, 1);
    assert.equal(summary.failed_result_count, 1);
    assert.equal(summary.open_test_findings, 1);
  } finally {
    cleanup();
  }
});

test("factory test — run command로 기록 가능", async () => {
  const { ctx, cleanup } = makeCtx();
  try {
    const run = await factoryStartCycle(ctx, {
      command: "test",
      provider: "cli",
      phase: "에뮬레이터 전수검사",
    });
    assert.equal(ctx.store.loadRun(run.run_id).command, "test");
  } finally {
    cleanup();
  }
});
