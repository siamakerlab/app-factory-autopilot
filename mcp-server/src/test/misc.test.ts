// AFA-013 증거·finding / AFA-016 Placeholder / AFA-017 역량 / 진행 보고 테스트.

import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { makeCtx, sampleItem } from "./helpers.js";
import {
  evidenceRegister,
  evidenceValidate,
  findingCreate,
  findingResolve,
  findingReopen,
} from "../tools/finding-evidence.js";
import {
  placeholderCreate,
  placeholderListBlocking,
  placeholderResolve,
} from "../tools/approval-placeholder.js";
import {
  capabilityScan,
  capabilityRecordEnvironment,
  capabilityInstallPlan,
  capabilityMarkDeclined,
  capabilityMarkInstalled,
} from "../tools/capability.js";
import { computeProgressPct, factoryStartCycle, factoryFinishCycle } from "../tools/factory.js";
import { roadmapParse } from "../tools/roadmap.js";

test("finding resolve — 증거 없이 불가, 증거로 해결, reopen 이력 보존", async () => {
  const { ctx, cleanup } = makeCtx();
  try {
    const { finding_id } = await findingCreate(ctx, {
      severity: "major",
      area: "testing",
      title: "테스트 공백",
      source: { kind: "agent", name: "auditor" },
    });
    await assert.rejects(
      findingResolve(ctx, { finding_id, description: "고침", evidence_ids: [], resolved_by_role: "worker" }),
      /증거가 1건 이상/,
    );
    const { evidence_id } = await evidenceRegister(ctx, {
      kind: "unit_test",
      created_by: { role: "worker", name: "w" },
      content_files: [{ name: "result.txt", content: "3 passed" }],
    });
    await findingResolve(ctx, {
      finding_id,
      description: "테스트 추가",
      evidence_ids: [evidence_id],
      resolved_by_role: "worker",
    });
    const reopened = await findingReopen(ctx, { finding_id, reason: "재검증 실패" });
    assert.equal(reopened.status, "reopened");
    const f = ctx.store.loadFinding(finding_id);
    assert.equal(f.history!.length, 2);
  } finally {
    cleanup();
  }
});

test("증거 무결성 — 해시 변조 탐지", async () => {
  const { ctx, cleanup } = makeCtx();
  try {
    const { evidence_id } = await evidenceRegister(ctx, {
      kind: "build_log",
      created_by: { role: "gate", name: "build" },
      content_files: [{ name: "log.txt", content: "BUILD SUCCESSFUL" }],
    });
    assert.equal(evidenceValidate(ctx, { evidence_id }).valid, true);
    // 변조
    fs.writeFileSync(path.join(ctx.store.evidenceDir(evidence_id), "log.txt"), "변조됨");
    const r = evidenceValidate(ctx, { evidence_id });
    assert.equal(r.valid, false);
    assert.match(r.problems[0]!, /해시 불일치/);
  } finally {
    cleanup();
  }
});

test("Placeholder — 형식 검증, 종류별 기본 속성, 차단 목록", async () => {
  const { ctx, cleanup } = makeCtx();
  try {
    await assert.rejects(
      placeholderCreate(ctx, { name: "PLACEHOLDER_BAD", kind: "other" }),
      /형식 오류/,
    );
    await placeholderCreate(ctx, { name: "${PLACEHOLDER_PACKAGE_NAME}", kind: "package_name" });
    await placeholderCreate(ctx, { name: "${PLACEHOLDER_APP_DESC}", kind: "store_listing" });
    const ph = ctx.store.loadPlaceholder("${PLACEHOLDER_PACKAGE_NAME}");
    assert.equal(ph.importance, "critical");
    assert.equal(ph.auto_proceed, false);
    const { blocking } = placeholderListBlocking(ctx);
    assert.deepEqual(blocking.map((p) => p.name), ["${PLACEHOLDER_PACKAGE_NAME}"]);
    await placeholderResolve(ctx, { name: "${PLACEHOLDER_PACKAGE_NAME}", resolved_value: "com.siamakerlab.memo" });
    assert.equal(placeholderListBlocking(ctx).blocking.length, 0);
  } finally {
    cleanup();
  }
});

test("역량 — 스캔 대조, 설치 계획, 거절 반복 제안 금지", async () => {
  const { ctx, cleanup } = makeCtx();
  try {
    const scan1 = await capabilityScan(ctx, {
      installed_skills: ["material-3", "adaptive"],
      installed_mcp_servers: ["context7"],
      installed_subagents: [],
    });
    assert.ok(scan1.missing_required.some((s) => s.id === "edge-to-edge"));
    assert.ok(!scan1.missing_required.some((s) => s.id === "material-3"));
    assert.ok(scan1.missing_mcp.some((m) => m.id === "mobile-mcp"));

    const plan = capabilityInstallPlan(ctx, {
      selections: [
        { id: "edge-to-edge", scope: "project" },
        { id: "compose-expert", scope: "global" },
        { id: "kotlin-expert", scope: "project" }, // 미검증 — 불가
        { id: "dataviz", scope: "project" }, // 내장 — 불필요
      ],
      provider: "claude-code",
    });
    assert.equal(plan.plan.length, 2);
    assert.match(plan.plan[0]!.command, /npx skills add android\/skills/);
    assert.equal(plan.unavailable.length, 2);

    // 거절 기록 → 재스캔 시 제안 안 됨
    await capabilityMarkDeclined(ctx, { ids: ["edge-to-edge"] });
    const scan2 = await capabilityScan(ctx, {
      installed_skills: ["material-3", "adaptive"],
      installed_mcp_servers: ["context7"],
      installed_subagents: [],
    });
    assert.ok(!scan2.missing_required.some((s) => s.id === "edge-to-edge"));

    const guidance = await capabilityMarkInstalled(ctx, {
      id: "adaptive",
      scope: "project",
      success: true,
    });
    assert.ok(guidance.guidance);
    const rules = fs.readFileSync(path.join(ctx.projectRoot, "APP_FACTORY_RULES.md"), "utf-8");
    assert.match(rules, /app-factory:capabilities:start/);
    assert.match(rules, /adaptive 스킬을 사용한다/);
  } finally {
    cleanup();
  }
});

test("역량 — 환경 점검 결과는 부족분과 조치 안내를 사용자 메시지로 반환", async () => {
  const { ctx, cleanup } = makeCtx();
  try {
    const result = await capabilityRecordEnvironment(ctx, {
      checks: [
        {
          id: "adb",
          label: "Android Debug Bridge",
          status: "available",
          required_for: ["emulator-smoke", "factory-test"],
          path: "/Android/Sdk/platform-tools/adb",
          remediation: "Android SDK platform-tools를 설치하고 PATH 또는 ANDROID_HOME을 설정한다",
        },
        {
          id: "mobile-mcp",
          label: "mobile-mcp",
          status: "missing",
          required_for: ["factory-test screenshots"],
          detail: "MCP 서버 미설치",
          remediation: "factory doctor에서 mobile-mcp 설치 안내를 확인한다",
        },
        {
          id: "avd",
          label: "Android Virtual Device",
          status: "blocked",
          required_for: ["emulator execution"],
          detail: "실행 가능한 AVD 없음",
          remediation: "Android Studio Device Manager 또는 avdmanager로 테스트 디바이스를 생성한다",
          blocking_when: "automation.emulator=true 또는 factory test",
          auto_prepare: true,
        },
      ],
    });

    assert.equal(result.missing.length, 1);
    assert.equal(result.blocked.length, 1);
    assert.match(result.user_message, /mobile-mcp/);
    assert.match(result.user_message, /실행 가능한 AVD 없음/);
    assert.match(result.user_message, /바로 준비해드릴까요\?/);
    const state = await capabilityScan(ctx, {
      installed_skills: [],
      installed_mcp_servers: [],
      installed_subagents: [],
    });
    assert.ok(state.missing_mcp.some((item) => item.id === "mobile-mcp"));
  } finally {
    cleanup();
  }
});

test("진행도 계산 — 상태 가중치 평균, P2 제외 (3.15 공식)", async () => {
  const { ctx, cleanup } = makeCtx();
  try {
    await roadmapParse(ctx, {
      items: [
        sampleItem({ id: "RM-001", status: "VERIFIED" }), // 100
        sampleItem({ id: "RM-002", status: "IMPLEMENTED" }), // 75
        sampleItem({ id: "RM-003", status: "IN_PROGRESS" }), // 25
        sampleItem({ id: "RM-004", status: "NOT_STARTED" }), // 0
        sampleItem({ id: "RM-005", status: "VERIFIED", priority: "P2" }), // 분모 제외
      ],
    });
    assert.equal(computeProgressPct(ctx), 50);
  } finally {
    cleanup();
  }
});

test("사이클 — 진행 보고 4요소가 run에 기록된다 (3.15)", async () => {
  const { ctx, cleanup } = makeCtx();
  try {
    await roadmapParse(ctx, { items: [sampleItem({ status: "VERIFIED" })] });
    const { run_id, cycle_seq } = await factoryStartCycle(ctx, {
      command: "auto",
      provider: "cli",
      phase: "구현 루프",
    });
    const { report, rendered } = await factoryFinishCycle(ctx, {
      run_id,
      cycle_seq,
      report: {
        summary: "RM-001 완료",
        goals: "남은 작업 없음",
        next: { description: "최종 게이트" },
      },
    });
    assert.equal(report.progress_pct, 100);
    assert.match(rendered, /진행 보고/);
    assert.match(rendered, /진행 상황: RM-001 완료/);
    assert.match(rendered, /다음 작업: 최종 게이트/);
    assert.match(rendered, /전체 진행도: 100%/);
    const run = ctx.store.loadRun(run_id);
    assert.equal(run.cycles![0]!.report.summary, "RM-001 완료");
    assert.ok(run.cycles![0]!.ended_at);
  } finally {
    cleanup();
  }
});
