// factory test 코어 도구 (AFA-060)
// 에뮬레이터 사용을 전제로 하는 사용자 시나리오 전수검사 계획·결과 기록.

import * as path from "node:path";
import type { Ctx } from "../context.js";
import type { EvidenceMeta, Finding } from "../types.js";
import { evidenceRegister } from "./finding-evidence.js";
import { findingCreate } from "./finding-evidence.js";
import { factoryCreateTask } from "./factory.js";

export interface TestScenario {
  id: string;
  title: string;
  user_goal: string;
  steps: string[];
  buttons?: string[];
  features?: string[];
  expected_screens: string[];
  expected_outputs: string[];
  device_profiles?: string[];
}

export interface TestCheckResult {
  id: string;
  description: string;
  expected: string;
  actual?: string;
  passed: boolean;
  area?: Finding["area"];
  severity?: Finding["severity"];
  auto_fixable?: boolean;
}

const DEFAULT_DEVICE_PROFILES = [
  "phone-pixel-portrait",
  "phone-pixel-landscape",
  "foldable-inner-display",
  "tablet-10-inch",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function mergeDeep(base: Record<string, unknown>, override: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(override)) {
    out[key] = isRecord(out[key]) && isRecord(value)
      ? mergeDeep(out[key] as Record<string, unknown>, value as Record<string, unknown>)
      : value;
  }
  return out;
}

function scenarioChecklistMarkdown(scenarios: TestScenario[], deviceProfiles: string[]): string {
  const lines = [
    "# factory test 시나리오 체크리스트",
    "",
    "이 문서는 사용자의 실제 사용 관점에서 모든 기능·버튼·화면 출력 기대값을",
    "에뮬레이터 전수검사용 체크리스트로 정리한 산출물입니다.",
    "",
    "## 디바이스 매트릭스",
    "",
    ...deviceProfiles.map((d) => `- [ ] ${d}`),
    "",
  ];
  for (const s of scenarios) {
    lines.push(`## ${s.id}. ${s.title}`, "", `사용자 목표: ${s.user_goal}`, "");
    lines.push("### 단계", "", ...s.steps.map((step, i) => `- [ ] ${i + 1}. ${step}`), "");
    if (s.buttons?.length) lines.push("### 버튼", "", ...s.buttons.map((b) => `- [ ] ${b}`), "");
    if (s.features?.length) lines.push("### 기능", "", ...s.features.map((f) => `- [ ] ${f}`), "");
    lines.push("### 예상 화면", "", ...s.expected_screens.map((screen) => `- [ ] ${screen}`), "");
    lines.push("### 예상 출력", "", ...s.expected_outputs.map((out) => `- [ ] ${out}`), "");
  }
  return lines.join("\n") + "\n";
}

export async function factoryTestPrepare(
  ctx: Ctx,
  input: { scenarios: TestScenario[]; device_profiles?: string[] },
): Promise<{ evidence_id: string; checklist_path: string; device_profiles: string[]; emulator_enabled: true }> {
  if (input.scenarios.length === 0) throw new Error("factory test에는 시나리오가 1개 이상 필요합니다");
  const deviceProfiles = input.device_profiles?.length ? input.device_profiles : DEFAULT_DEVICE_PROFILES;

  let config: Record<string, unknown> = {};
  try {
    config = ctx.store.loadConfigSnapshot();
  } catch {
    config = { version: 1 };
  }
  const next = mergeDeep(config, {
    automation: {
      emulator: true,
      defer_emulator_prompt_until_final: false,
    },
  });
  await ctx.store.withLock("factory_test_prepare", () => {
    ctx.store.saveConfigSnapshot(next);
  });

  const checklist = scenarioChecklistMarkdown(input.scenarios, deviceProfiles);
  const { evidence_id } = await evidenceRegister(ctx, {
    kind: "emulator_test_plan",
    title: "factory test 시나리오 체크리스트",
    created_by: { role: "verifier", name: "factory-test" },
    summary: `시나리오 ${input.scenarios.length}건, 디바이스 프로필 ${deviceProfiles.length}종 전수검사 계획`,
    data: {
      scenarios: input.scenarios,
      device_profiles: deviceProfiles,
      emulator_authorized: true,
      mobile_mcp_preferred: true,
    },
    content_files: [{ name: "FACTORY_TEST_CHECKLIST.md", content: checklist }],
  });

  return {
    evidence_id,
    checklist_path: path.join(ctx.store.evidenceDir(evidence_id), "FACTORY_TEST_CHECKLIST.md"),
    device_profiles: deviceProfiles,
    emulator_enabled: true,
  };
}

export async function factoryTestRecordResult(
  ctx: Ctx,
  input: {
    scenario_id: string;
    device_profile: string;
    checks: TestCheckResult[];
    screenshot_paths?: string[];
    logcat_path?: string;
    notes?: string;
  },
): Promise<{ evidence_id: string; passed: boolean; finding_ids: string[]; fix_task_ids: string[] }> {
  const failed = input.checks.filter((c) => !c.passed);
  const passed = failed.length === 0;
  const { evidence_id } = await evidenceRegister(ctx, {
    kind: "emulator_scenario_result",
    title: `factory test 결과: ${input.scenario_id} / ${input.device_profile}`,
    created_by: { role: "verifier", name: "factory-test" },
    summary: passed
      ? `${input.scenario_id} (${input.device_profile}) 전수 체크 통과`
      : `${input.scenario_id} (${input.device_profile}) 실패 ${failed.length}건`,
    data: {
      scenario_id: input.scenario_id,
      device_profile: input.device_profile,
      passed,
      crash: false,
      checks: input.checks,
      notes: input.notes,
    },
    source_paths: [...(input.screenshot_paths ?? []), ...(input.logcat_path ? [input.logcat_path] : [])],
  });

  const findingIds: string[] = [];
  const fixTaskIds: string[] = [];
  for (const check of failed) {
    const { finding_id } = await findingCreate(ctx, {
      severity: check.severity ?? "blocker",
      area: check.area ?? "ui_flow",
      title: `factory test 실패: ${input.scenario_id} / ${check.description}`,
      description: `디바이스 ${input.device_profile}. 예상: ${check.expected}. 실제: ${check.actual ?? "미기록"}`,
      source: { kind: "skill", name: "factory-test" },
      auto_fixable: check.auto_fixable ?? true,
    });
    findingIds.push(finding_id);
    if (check.auto_fixable !== false) {
      const { task_id } = await factoryCreateTask(ctx, {
        type: "fix",
        title: `factory test 실패 수정: ${input.scenario_id} / ${check.id}`,
        finding_id,
        priority: "P0",
        description: `에뮬레이터 전수검사 실패 항목 수정. evidence=${evidence_id}`,
      });
      fixTaskIds.push(task_id);
    }
  }

  return { evidence_id, passed, finding_ids: findingIds, fix_task_ids: fixTaskIds };
}

export function factoryTestSummary(ctx: Ctx): {
  planned_scenarios: number;
  device_profiles: number;
  result_count: number;
  failed_result_count: number;
  open_test_findings: number;
} {
  const evidence = ctx.store.listEvidence();
  const plan = evidence.find((e) => e.kind === "emulator_test_plan");
  const resultEvidence = evidence.filter((e) => e.kind === "emulator_scenario_result");
  return {
    planned_scenarios: Array.isArray(plan?.data?.["scenarios"]) ? (plan!.data!["scenarios"] as unknown[]).length : 0,
    device_profiles: Array.isArray(plan?.data?.["device_profiles"]) ? (plan!.data!["device_profiles"] as unknown[]).length : 0,
    result_count: resultEvidence.length,
    failed_result_count: resultEvidence.filter((e: EvidenceMeta) => e.data?.["passed"] === false).length,
    open_test_findings: ctx.store
      .listFindings()
      .filter((f) => f.source.kind === "skill" && f.source.name === "factory-test" && f.status !== "resolved").length,
  };
}
