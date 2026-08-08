// AFA-014/050 게이트 테스트 — command 게이트 실행, check 게이트 판정, 증거·finding 자동 기록.

import { test } from "node:test";
import assert from "node:assert/strict";
import { makeCtx, sampleItem } from "./helpers.js";
import { gateRun, gateGetResult, gateRunAll } from "../tools/gate.js";
import { roadmapParse } from "../tools/roadmap.js";
import { placeholderCreate } from "../tools/approval-placeholder.js";
import { evidenceRegister, findingList } from "../tools/finding-evidence.js";

async function withCommands(ctx: Awaited<ReturnType<typeof makeCtx>>["ctx"], commands: Record<string, string>) {
  ctx.store.saveConfigSnapshot({ version: 1, commands });
}

test("command 게이트 — 성공·실패·증거·finding", async () => {
  const { ctx, cleanup } = makeCtx();
  try {
    await withCommands(ctx, { build: "true", test: "false", lint: "true" });
    const ok = await gateRun(ctx, { gate_id: "build" });
    assert.equal(ok.passed, true);
    assert.ok(ok.evidence_id);

    const fail = await gateRun(ctx, { gate_id: "unit_test" });
    assert.equal(fail.passed, false);
    assert.ok(fail.finding_id, "실패 시 finding이 등록되어야 함");
    const { findings } = findingList(ctx, { area: "testing" });
    assert.equal(findings.length, 1);

    const history = gateGetResult(ctx, { gate_id: "build" });
    assert.equal(history.results.length, 1);
    assert.equal(history.results[0]!.passed, true);
  } finally {
    cleanup();
  }
});

test("설정에 명령 없으면 오류 (하드코딩 금지)", async () => {
  const { ctx, cleanup } = makeCtx();
  try {
    await withCommands(ctx, { build: "true" });
    await assert.rejects(gateRun(ctx, { gate_id: "unit_test" }), /commands.test/);
  } finally {
    cleanup();
  }
});

test("완료 검증 게이트 — 필수 항목 전부 VERIFIED여야 통과", async () => {
  const { ctx, cleanup } = makeCtx();
  try {
    await roadmapParse(ctx, {
      items: [
        sampleItem({ id: "RM-001", status: "VERIFIED" }),
        sampleItem({ id: "RM-002", status: "IMPLEMENTED" }),
        sampleItem({ id: "RM-003", status: "NOT_STARTED", priority: "P2" }), // 선택 — 무시
      ],
    });
    const r1 = await gateRun(ctx, { gate_id: "completion" });
    assert.equal(r1.passed, false);
    assert.match(r1.detail, /RM-002/);
  } finally {
    cleanup();
  }
});

test("Placeholder 게이트 — 개발 단계 경고, 릴리스 단계 차단", async () => {
  const { ctx, cleanup } = makeCtx();
  try {
    await placeholderCreate(ctx, { name: "${PLACEHOLDER_ADMOB_APP_ID}", kind: "admob_ids" });
    const dev = await gateRun(ctx, { gate_id: "placeholder", release: false });
    assert.equal(dev.passed, true);
    assert.match(dev.detail, /경고/);
    const rel = await gateRun(ctx, { gate_id: "placeholder", release: true });
    assert.equal(rel.passed, false);
  } finally {
    cleanup();
  }
});

test("실행 게이트 — 증거 없으면 BLOCKED (skip 아님)", async () => {
  const { ctx, cleanup } = makeCtx();
  try {
    const r = await gateRun(ctx, { gate_id: "emulator" });
    assert.equal(r.passed, false);
    assert.equal(r.blocked, true);
  } finally {
    cleanup();
  }
});

test("실행 게이트 — automation.emulator=false이면 마지막 권유만 남기고 통과", async () => {
  const { ctx, cleanup } = makeCtx();
  try {
    ctx.store.saveConfigSnapshot({ version: 1, automation: { emulator: false } });
    const r = await gateRun(ctx, { gate_id: "emulator" });
    assert.equal(r.passed, true);
    assert.match(r.detail, /마지막에 에뮬레이터 사용을 권유/);
  } finally {
    cleanup();
  }
});

test("최종 게이트 — gateRunAll이 완료 predicate용 summary evidence를 남긴다", async () => {
  const { ctx, cleanup } = makeCtx();
  try {
    await withCommands(ctx, { build: "true", test: "true", lint: "true" });
    await roadmapParse(ctx, { items: [sampleItem({ id: "RM-001", status: "VERIFIED" })] });
    await evidenceRegister(ctx, {
      kind: "license_report",
      created_by: { role: "gate", name: "license" },
      data: { ok: true },
    });
    await evidenceRegister(ctx, {
      kind: "emulator_scenario_result",
      created_by: { role: "gate", name: "emulator" },
      data: { crash: false },
    });

    const result = await gateRunAll(ctx);
    assert.equal(result.all_passed, true);
    const final = ctx.store
      .listEvidence()
      .find((e) => e.kind === "gate_result" && e.data?.["final_gate"] === true);
    assert.ok(final);
    assert.equal(final.data?.["all_passed"], true);
  } finally {
    cleanup();
  }
});
