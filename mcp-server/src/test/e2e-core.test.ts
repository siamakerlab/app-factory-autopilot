// M6 코어 E2E — AFA-056(부분 구현 탐지·강등) / AFA-055(init 읽기 전용 동기화 코어).
// 실제 Android 빌드·에뮬레이터·LLM 구간은 실환경 E2E에서 검증한다.

import { test } from "node:test";
import assert from "node:assert/strict";
import { makeCtx, sampleItem } from "./helpers.js";
import { roadmapParse, roadmapUpdateStatus, roadmapGetItems } from "../tools/roadmap.js";
import { findingCreate, findingList, evidenceRegister } from "../tools/finding-evidence.js";
import { factoryCreateTask, factoryGetNextTask } from "../tools/factory.js";
import { gateRun } from "../tools/gate.js";

test("AFA-056: 부분 구현 발견 → IMPLEMENTED에서 PARTIAL 강등 + fix 큐 등록 + 완료 게이트 차단", async () => {
  const { ctx, cleanup } = makeCtx();
  try {
    // 구현자가 IMPLEMENTED로 제출한 항목 (실은 저장 버튼이 빈 함수)
    await roadmapParse(ctx, { items: [sampleItem({ id: "RM-002", status: "IMPLEMENTED", title: "메모 저장" })] });

    // Verifier가 결함 발견 → finding + PARTIAL 강등
    const { finding_id } = await findingCreate(ctx, {
      severity: "blocker",
      area: "completion_mismark",
      title: "SaveButton onClick 미연결 (빈 함수)",
      source: { kind: "agent", name: "completion-verifier" },
      roadmap_item_id: "RM-002",
      auto_fixable: true,
    });
    const demoted = await roadmapUpdateStatus(ctx, {
      item_id: "RM-002",
      to: "PARTIAL",
      role: "verifier",
      reason: "부분 구현 — 호출 경로 없음",
    });
    assert.equal(demoted.to, "PARTIAL");

    // fix 작업 등록 → 다음 작업으로 선택된다 (재작업 큐)
    const { task_id } = await factoryCreateTask(ctx, {
      type: "fix",
      title: "RM-002 저장 연결 수정",
      finding_id,
      roadmap_item_id: "RM-002",
      priority: "P0",
    });
    const next = factoryGetNextTask(ctx);
    assert.equal(next.task?.id, task_id);

    // 완료 게이트는 PARTIAL 존재로 실패해야 한다
    const gate = await gateRun(ctx, { gate_id: "completion" });
    assert.equal(gate.passed, false);
    assert.match(gate.detail, /RM-002/);

    // 강등 이력이 보존된다
    const { items } = roadmapGetItems(ctx);
    const item = items.find((i) => i.id === "RM-002")!;
    assert.equal(item.status_history!.at(-1)!.to, "PARTIAL");
    assert.equal(item.status_history!.at(-1)!.role, "verifier");
  } finally {
    cleanup();
  }
});

test("AFA-056: 수정 후 재검증 → VERIFIED 도달, 완료 게이트 통과", async () => {
  const { ctx, cleanup } = makeCtx();
  try {
    await roadmapParse(ctx, { items: [sampleItem({ id: "RM-002", status: "PARTIAL" })] });
    // 재작업: orchestrator 재개 → worker 재구현 제출
    await roadmapUpdateStatus(ctx, { item_id: "RM-002", to: "IN_PROGRESS", role: "orchestrator" });
    const { task_id } = await factoryCreateTask(ctx, { type: "implement", title: "재구현", roadmap_item_id: "RM-002" });
    const claim = await import("../tools/factory.js").then((m) =>
      m.factoryClaimTask(ctx, { task_id, role: "worker", agent: "w" }),
    );
    await import("../tools/factory.js").then((m) =>
      m.factorySubmitResult(ctx, { task_id, token: claim.token, result: { summary: "수정 완료", requested_status: "IMPLEMENTED" } }),
    );
    await roadmapUpdateStatus(ctx, { item_id: "RM-002", to: "IMPLEMENTED", role: "worker", task_id });
    // 독립 재검증 통과
    const { evidence_id } = await evidenceRegister(ctx, {
      kind: "verifier_report",
      created_by: { role: "verifier", name: "cv" },
      summary: "재검증 통과 — 호출 경로·실패 경로 확인",
    });
    await roadmapUpdateStatus(ctx, {
      item_id: "RM-002",
      to: "VERIFIED",
      role: "verifier",
      evidence_ids: [evidence_id],
      criteria_updates: [{ index: 0, satisfied: true, evidence_ids: [evidence_id] }],
    });
    const gate = await gateRun(ctx, { gate_id: "completion" });
    assert.equal(gate.passed, true);
  } finally {
    cleanup();
  }
});

test("AFA-055 코어: init 동기화는 VERIFIED 후보를 만들 수 없다 (PARTIAL/IMPLEMENTED까지)", async () => {
  const { ctx, cleanup } = makeCtx();
  try {
    // project-explorer가 기존 프로젝트에서 만든 후보 반입 — VERIFIED 반입 시도는
    // 이후 어떤 경로로도 완료 게이트를 속일 수 없어야 한다. 반입 자체는
    // 데이터로 가능하지만(마이그레이션 케이스), 전이 테이블상 VERIFIED로
    // "전이"할 수 있는 role은 verifier뿐임을 재확인한다.
    await roadmapParse(ctx, { items: [sampleItem({ id: "RM-001", status: "PARTIAL", title: "기존 목록 화면" })] });
    await assert.rejects(
      roadmapUpdateStatus(ctx, { item_id: "RM-001", to: "VERIFIED", role: "orchestrator", evidence_ids: ["E-0001"] }),
    );
    const open = findingList(ctx, { area: "completion_mismark" });
    assert.equal(open.findings.length, 1); // 위반 시도 기록
  } finally {
    cleanup();
  }
});
