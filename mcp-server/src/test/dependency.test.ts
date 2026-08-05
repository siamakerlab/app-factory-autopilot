// AFA-015 의존성 승인 절차 테스트 — 양 검토 통과 전 approve 불가, GPL 자동 거부.

import { test } from "node:test";
import assert from "node:assert/strict";
import { makeCtx } from "./helpers.js";
import {
  dependencyApprove,
  dependencyRequest,
  dependencyReviewLicense,
  dependencyReviewVersion,
} from "../tools/dependency.js";

test("검토 없이 approve 불가", async () => {
  const { ctx, cleanup } = makeCtx();
  try {
    const { dependency_id } = await dependencyRequest(ctx, {
      coordinates: "io.coil-kt:coil-compose",
      reason: "이미지 로딩",
    });
    await assert.rejects(
      dependencyApprove(ctx, { dependency_id, role: "orchestrator" }),
      /버전 검토/,
    );
  } finally {
    cleanup();
  }
});

test("pre-release 버전은 검토 불통과", async () => {
  const { ctx, cleanup } = makeCtx();
  try {
    const { dependency_id } = await dependencyRequest(ctx, {
      coordinates: "androidx.compose:compose-bom",
      reason: "BOM",
    });
    const r = await dependencyReviewVersion(ctx, {
      dependency_id,
      approved_version: "2026.01.00-alpha01",
      compatible: true,
      source_urls: ["https://developer.android.com/jetpack/compose/bom"],
    });
    assert.equal(r.accepted, false);
    await assert.rejects(dependencyApprove(ctx, { dependency_id, role: "orchestrator" }));
  } finally {
    cleanup();
  }
});

test("GPL 라이선스 자동 거부", async () => {
  const { ctx, cleanup } = makeCtx();
  try {
    const { dependency_id } = await dependencyRequest(ctx, {
      coordinates: "some.gpl:library",
      reason: "테스트",
    });
    await dependencyReviewVersion(ctx, {
      dependency_id,
      approved_version: "1.0.0",
      compatible: true,
      source_urls: ["https://example.com/release"],
    });
    const r = await dependencyReviewLicense(ctx, {
      dependency_id,
      spdx: "GPL-3.0-only",
      source_urls: ["https://example.com/license"],
    });
    assert.equal(r.decision, "block");
    await assert.rejects(
      dependencyApprove(ctx, { dependency_id, role: "orchestrator" }),
      /거부된 요청/,
    );
  } finally {
    cleanup();
  }
});

test("양 검토 통과 → approve 성공 + 후속 작업 9건 자동 등록", async () => {
  const { ctx, cleanup } = makeCtx();
  try {
    const { dependency_id } = await dependencyRequest(ctx, {
      coordinates: "io.coil-kt:coil-compose",
      reason: "이미지 로딩",
    });
    await dependencyReviewVersion(ctx, {
      dependency_id,
      approved_version: "2.7.0",
      compatible: true,
      source_urls: ["https://coil-kt.github.io/coil/"],
    });
    await dependencyReviewLicense(ctx, {
      dependency_id,
      spdx: "Apache-2.0",
      source_urls: ["https://github.com/coil-kt/coil/blob/main/LICENSE.txt"],
    });
    const r = await dependencyApprove(ctx, { dependency_id, role: "orchestrator" });
    assert.equal(r.status, "approved");
    assert.equal(r.followup_task_ids.length, 9);
    // 후속 작업이 순차 의존성을 갖는다
    const tasks = ctx.store.listTasks();
    const second = tasks.find((t) => t.id === r.followup_task_ids[1]);
    assert.deepEqual(second?.depends_on, [r.followup_task_ids[0]]);
  } finally {
    cleanup();
  }
});

test("manual_review 라이선스는 user 승인만 허용", async () => {
  const { ctx, cleanup } = makeCtx();
  try {
    const { dependency_id } = await dependencyRequest(ctx, {
      coordinates: "some.lgpl:library",
      reason: "테스트",
    });
    await dependencyReviewVersion(ctx, {
      dependency_id,
      approved_version: "1.0.0",
      compatible: true,
      source_urls: ["https://example.com"],
    });
    await dependencyReviewLicense(ctx, {
      dependency_id,
      spdx: "LGPL-2.1-only",
      source_urls: ["https://example.com"],
    });
    await assert.rejects(
      dependencyApprove(ctx, { dependency_id, role: "orchestrator" }),
      /사용자.*승인/,
    );
    const r = await dependencyApprove(ctx, { dependency_id, role: "user" });
    assert.equal(r.status, "approved");
  } finally {
    cleanup();
  }
});
