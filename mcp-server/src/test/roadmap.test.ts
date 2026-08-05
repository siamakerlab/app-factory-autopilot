// AFA-012 로드맵 도구 테스트 — 전이 강제 통합, 거부 시 finding 자동 기록.

import { test } from "node:test";
import assert from "node:assert/strict";
import { makeCtx, sampleItem } from "./helpers.js";
import {
  roadmapParse,
  roadmapGetItems,
  roadmapUpdateStatus,
  roadmapValidateTraceability,
} from "../tools/roadmap.js";
import { evidenceRegister, findingList } from "../tools/finding-evidence.js";

test("roadmap_parse — 완료 조건 없는 항목 거부 (단순 체크리스트 금지)", async () => {
  const { ctx, cleanup } = makeCtx();
  try {
    await assert.rejects(
      roadmapParse(ctx, { items: [sampleItem({ completion_criteria: [] })] }),
      /완료 조건이 비어/,
    );
  } finally {
    cleanup();
  }
});

test("roadmap_parse — 존재하지 않는 의존성 거부", async () => {
  const { ctx, cleanup } = makeCtx();
  try {
    await assert.rejects(
      roadmapParse(ctx, { items: [sampleItem({ depends_on: ["RM-999"] })] }),
      /존재하지 않는 의존성/,
    );
  } finally {
    cleanup();
  }
});

test("worker의 VERIFIED 전이 시도 → 거부 + finding 자동 기록", async () => {
  const { ctx, cleanup } = makeCtx();
  try {
    await roadmapParse(ctx, { items: [sampleItem({ status: "IMPLEMENTED" })] });
    await assert.rejects(
      roadmapUpdateStatus(ctx, {
        item_id: "RM-001",
        to: "VERIFIED",
        role: "worker",
        evidence_ids: ["E-0001"],
      }),
    );
    const { findings } = findingList(ctx, { area: "completion_mismark" });
    assert.equal(findings.length, 1);
    assert.match(findings[0]!.title, /허용되지 않은 전이 시도/);
  } finally {
    cleanup();
  }
});

test("verifier의 VERIFIED 전이 — 실존 증거 + 완료 조건 충족 필요", async () => {
  const { ctx, cleanup } = makeCtx();
  try {
    await roadmapParse(ctx, { items: [sampleItem({ status: "IMPLEMENTED" })] });
    // 존재하지 않는 증거 ID → 거부
    await assert.rejects(
      roadmapUpdateStatus(ctx, {
        item_id: "RM-001",
        to: "VERIFIED",
        role: "verifier",
        evidence_ids: ["E-9999"],
        criteria_updates: [{ index: 0, satisfied: true }],
      }),
      /(찾을 수 없습니다|완료 조건)/,
    );
    // 실제 증거 등록 후 완료 조건 충족 표시와 함께 → 통과
    const { evidence_id } = await evidenceRegister(ctx, {
      kind: "verifier_report",
      created_by: { role: "verifier", name: "cv" },
      summary: "검증 통과",
    });
    const r = await roadmapUpdateStatus(ctx, {
      item_id: "RM-001",
      to: "VERIFIED",
      role: "verifier",
      evidence_ids: [evidence_id],
      criteria_updates: [{ index: 0, satisfied: true, evidence_ids: [evidence_id] }],
    });
    assert.equal(r.to, "VERIFIED");
    const { items } = roadmapGetItems(ctx, { status: "VERIFIED" });
    assert.equal(items.length, 1);
    assert.ok(items[0]!.status_history!.length >= 1);
  } finally {
    cleanup();
  }
});

test("criteria_updates는 verifier 전용", async () => {
  const { ctx, cleanup } = makeCtx();
  try {
    await roadmapParse(ctx, { items: [sampleItem({ status: "IN_PROGRESS" })] });
    await assert.rejects(
      roadmapUpdateStatus(ctx, {
        item_id: "RM-001",
        to: "PARTIAL",
        role: "worker",
        criteria_updates: [{ index: 0, satisfied: true }],
      }),
      /verifier만/,
    );
  } finally {
    cleanup();
  }
});

test("추적성 검증 — 테스트 조건 누락·순환 의존 탐지", async () => {
  const { ctx, cleanup } = makeCtx();
  try {
    await roadmapParse(ctx, {
      items: [
        sampleItem({ id: "RM-001", depends_on: ["RM-002"] }),
        sampleItem({ id: "RM-002", depends_on: ["RM-001"] }),
      ],
    });
    const r = roadmapValidateTraceability(ctx);
    assert.equal(r.ok, false);
    assert.ok(r.missing_test_criteria.includes("RM-001"));
    assert.ok(r.dependency_cycles.length >= 1);
  } finally {
    cleanup();
  }
});
