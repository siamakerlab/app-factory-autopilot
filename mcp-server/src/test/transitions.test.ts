// AFA-021 전이 전수 테스트 — worker는 어떤 경로로도 VERIFIED를 만들 수 없다.

import { test } from "node:test";
import assert from "node:assert/strict";
import { TransitionTable } from "../transitions.js";
import { coreDir, sampleItem } from "./helpers.js";
import type { RoadmapStatus, Role } from "../types.js";

const STATUSES: RoadmapStatus[] = [
  "NOT_STARTED",
  "IN_PROGRESS",
  "PARTIAL",
  "IMPLEMENTED",
  "VERIFIED",
  "BLOCKED",
  "NEEDS_HUMAN_DECISION",
];
const ROLES: Role[] = ["orchestrator", "worker", "verifier", "auditor", "user", "system"];

const table = TransitionTable.loadFromCoreDir(coreDir());

test("worker는 어떤 from 상태에서도 VERIFIED 전이 불가 (전수)", () => {
  for (const from of STATUSES) {
    const item = sampleItem({ status: from });
    assert.throws(
      () =>
        table.validate(item, "VERIFIED", "worker", {
          evidence_ids: ["E-0001"],
          has_submitted_result: true,
        }),
      `worker ${from} → VERIFIED가 허용됨`,
    );
  }
});

test("VERIFIED 진입은 IMPLEMENTED에서 verifier만 가능 (전수)", () => {
  for (const from of STATUSES) {
    for (const role of ROLES) {
      const item = sampleItem({
        status: from,
        completion_criteria: [{ description: "c", verifiable_by: "code", satisfied: true }],
      });
      const shouldAllow = from === "IMPLEMENTED" && role === "verifier";
      const attempt = () =>
        table.validate(item, "VERIFIED", role, { evidence_ids: ["E-0001"] });
      if (shouldAllow) assert.doesNotThrow(attempt, `${from}/${role} 거부됨`);
      else assert.throws(attempt, `${from}/${role} → VERIFIED가 허용됨`);
    }
  }
});

test("VERIFIED 전이는 증거 없으면 거부", () => {
  const item = sampleItem({
    status: "IMPLEMENTED",
    completion_criteria: [{ description: "c", verifiable_by: "code", satisfied: true }],
  });
  assert.throws(() => table.validate(item, "VERIFIED", "verifier", { evidence_ids: [] }));
});

test("VERIFIED 전이는 완료 조건 미충족 시 거부", () => {
  const item = sampleItem({
    status: "IMPLEMENTED",
    completion_criteria: [{ description: "c", verifiable_by: "code", satisfied: false }],
  });
  assert.throws(() =>
    table.validate(item, "VERIFIED", "verifier", { evidence_ids: ["E-0001"] }),
  );
});

test("IMPLEMENTED 전이는 제출 결과 필요, worker만 가능", () => {
  const item = sampleItem({ status: "IN_PROGRESS" });
  assert.throws(() => table.validate(item, "IMPLEMENTED", "worker", {}));
  assert.doesNotThrow(() =>
    table.validate(item, "IMPLEMENTED", "worker", { has_submitted_result: true }),
  );
  assert.throws(() =>
    table.validate(item, "IMPLEMENTED", "orchestrator", { has_submitted_result: true }),
  );
});

test("테이블에 없는 전이는 전부 거부 (예: NOT_STARTED → VERIFIED)", () => {
  const item = sampleItem({ status: "NOT_STARTED" });
  for (const role of ROLES) {
    assert.throws(() => table.validate(item, "VERIFIED", role, { evidence_ids: ["E-1"] }));
  }
});

test("VERIFIED → PARTIAL 재개방은 auditor/verifier만 (review 완료 오표기)", () => {
  const item = sampleItem({ status: "VERIFIED" });
  assert.doesNotThrow(() => table.validate(item, "PARTIAL", "auditor"));
  assert.doesNotThrow(() => table.validate(item, "PARTIAL", "verifier"));
  assert.throws(() => table.validate(item, "PARTIAL", "worker"));
  assert.throws(() => table.validate(item, "PARTIAL", "orchestrator"));
});
