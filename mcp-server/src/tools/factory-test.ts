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

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === "string") return item;
      if (isRecord(item)) {
        const title = item["title"] ?? item["name"] ?? item["label"] ?? item["id"];
        return typeof title === "string" ? title : undefined;
      }
      return undefined;
    })
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function featureScenario(index: number, feature: string, group: string): TestScenario {
  const id = `S-${String(index).padStart(3, "0")}`;
  return {
    id,
    title: `${feature} 기능 사용`,
    user_goal: `사용자가 ${feature} 기능을 문제 없이 완료한다`,
    steps: [
      "앱 실행 후 초기 화면 확인",
      `${feature} 기능 진입점 탭`,
      "주요 입력 또는 선택을 수행",
      "완료 또는 저장 동작 실행",
      "결과 화면과 상태 보존 확인",
    ],
    buttons: ["기능 진입", "완료/저장", "뒤로"],
    features: [feature, group],
    expected_screens: [`${feature} 기능 화면`, "완료 후 결과 또는 목록 화면"],
    expected_outputs: [`${feature} 실행 결과가 화면과 저장 상태에 반영됨`],
  };
}

function defaultScenariosFromConfig(config: Record<string, unknown>): TestScenario[] {
  const core = asStringList(config["core_features"]);
  const supporting = asStringList(config["supporting_features"]);
  const optional = asStringList(config["optional_features"]);
  const featureBased = [
    ...core.map((feature, i) => featureScenario(i + 1, feature, "core")),
    ...supporting.map((feature, i) => featureScenario(core.length + i + 1, feature, "supporting")),
    ...optional.map((feature, i) => featureScenario(core.length + supporting.length + i + 1, feature, "optional")),
  ];
  if (featureBased.length > 0) return featureBased;

  return [
    {
      id: "S-001",
      title: "첫 실행과 초기 화면",
      user_goal: "사용자가 앱을 설치 후 처음 실행해 초기 화면을 이해한다",
      steps: ["APK 설치", "앱 실행", "초기 화면 로딩 완료 대기", "주요 진입점 확인"],
      buttons: ["주요 작업 버튼", "뒤로"],
      features: ["launch", "home"],
      expected_screens: ["초기 화면이 비어 있거나 깨지지 않고 표시됨"],
      expected_outputs: ["크래시, ANR, 무한 로딩이 없음"],
    },
    {
      id: "S-002",
      title: "핵심 작업 완료 흐름",
      user_goal: "사용자가 앱의 대표 작업을 시작하고 완료한다",
      steps: ["초기 화면에서 주요 작업 버튼 탭", "필수 입력 또는 선택 수행", "완료 버튼 탭", "결과 확인"],
      buttons: ["주요 작업", "완료/저장", "취소"],
      features: ["primary-flow"],
      expected_screens: ["작업 화면", "완료 후 결과 화면"],
      expected_outputs: ["사용자 입력 또는 선택 결과가 즉시 반영됨"],
    },
    {
      id: "S-003",
      title: "상태 보존과 재실행",
      user_goal: "사용자가 앱을 닫았다 다시 열어도 중요한 상태를 잃지 않는다",
      steps: ["대표 작업 완료", "앱 종료", "앱 재실행", "이전 결과 또는 빈 상태 문구 확인"],
      buttons: ["완료/저장"],
      features: ["persistence", "restore"],
      expected_screens: ["재실행 후 홈 화면"],
      expected_outputs: ["저장 대상 데이터가 유지되거나 의도된 빈 상태가 표시됨"],
    },
  ];
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
  input: { scenarios?: TestScenario[]; device_profiles?: string[] },
): Promise<{
  evidence_id: string;
  checklist_path: string;
  device_profiles: string[];
  emulator_enabled: true;
  scenario_count: number;
  auto_generated: boolean;
}> {
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
  const scenarios = input.scenarios?.length ? input.scenarios : defaultScenariosFromConfig(next);
  const autoGenerated = !input.scenarios?.length;
  await ctx.store.withLock("factory_test_prepare", () => {
    ctx.store.saveConfigSnapshot(next);
  });

  const checklist = scenarioChecklistMarkdown(scenarios, deviceProfiles);
  const { evidence_id } = await evidenceRegister(ctx, {
    kind: "emulator_test_plan",
    title: "factory test 시나리오 체크리스트",
    created_by: { role: "verifier", name: "factory-test" },
    summary: `시나리오 ${scenarios.length}건, 디바이스 프로필 ${deviceProfiles.length}종 전수검사 계획`,
    data: {
      scenarios,
      device_profiles: deviceProfiles,
      emulator_authorized: true,
      mobile_mcp_preferred: true,
      auto_generated: autoGenerated,
    },
    content_files: [{ name: "FACTORY_TEST_CHECKLIST.md", content: checklist }],
  });

  return {
    evidence_id,
    checklist_path: path.join(ctx.store.evidenceDir(evidence_id), "FACTORY_TEST_CHECKLIST.md"),
    device_profiles: deviceProfiles,
    emulator_enabled: true,
    scenario_count: scenarios.length,
    auto_generated: autoGenerated,
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
