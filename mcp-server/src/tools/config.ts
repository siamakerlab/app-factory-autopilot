// factory config 코어 도구 (AFA-058)
// 체크박스 UI 자체는 어댑터 책임이고, 코어는 현재 설정 조회·저장·파생 설정 동기화를 보장한다.

import * as fs from "node:fs";
import * as path from "node:path";
import { parse as parseYaml } from "yaml";
import type { Ctx } from "../context.js";

const CHECKBOXES = [
  ["market_research", "경쟁 앱·커뮤니티·사용자 리뷰 조사"],
  ["modern_ui", "Material 3/Adaptive UI 현대화"],
  ["ux_intuitiveness_review", "주요 기능 UX 직관성 검토·수정"],
  ["accessibility_review", "접근성 검토·수정"],
  ["in_app_review", "Google Play 인앱리뷰 기능 탑재"],
  ["in_app_update", "Google Play 인앱업데이트 기능 탑재"],
  ["ads", "광고·동의 흐름 탑재"],
  ["billing", "인앱결제·구매 복원 탑재"],
  ["store_readiness", "스토어 등록 준비 점검"],
  ["observability", "크래시/분석 이벤트 등 관측성 탑재"],
  ["performance_review", "성능·메모리·시작 시간 검토"],
  ["security_privacy_review", "보안·개인정보 검토"],
  ["license_review", "라이선스·고지·SBOM 검토"],
  ["emulator", "에뮬레이터 실행 검증"],
] as const;

const PLAN_CONFIG_TO_AUTOMATION: Record<string, string> = {
  "ads.enabled": "ads",
  "billing.enabled": "billing",
  "in_app_review.enabled": "in_app_review",
  "in_app_update.enabled": "in_app_update",
  "market_research.enabled": "market_research",
  "ux_quality.accessibility_required": "accessibility_review",
};

type Config = Record<string, unknown>;

interface InterviewDoc {
  areas?: {
    id: string;
    questions?: {
      id: string;
      config?: string | null;
    }[];
  }[];
}

function loadDefaults(ctx: Ctx): Config {
  const p = path.join(ctx.coreDir, "policies", "defaults.yaml");
  return parseYaml(fs.readFileSync(p, "utf-8")) as Config;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function mergeDeep(base: Config, override: Config): Config {
  const out: Config = { ...base };
  for (const [key, value] of Object.entries(override)) {
    out[key] = isRecord(out[key]) && isRecord(value)
      ? mergeDeep(out[key] as Config, value as Config)
      : value;
  }
  return out;
}

function setPath(config: Config, dottedPath: string, value: unknown): void {
  const parts = dottedPath.split(".").filter(Boolean);
  if (parts.length === 0) return;
  let target = config;
  for (const part of parts.slice(0, -1)) {
    target = section(target, part);
  }
  target[parts[parts.length - 1]!] = value;
}

function section(config: Config, key: string): Config {
  if (!isRecord(config[key])) config[key] = {};
  return config[key] as Config;
}

function loadPlanConfig(ctx: Ctx): Config {
  const p = path.join(ctx.coreDir, "prompts", "interview", "interview.yaml");
  if (!fs.existsSync(p)) return {};
  const doc = parseYaml(fs.readFileSync(p, "utf-8")) as InterviewDoc;
  const out: Config = {};
  for (const area of doc.areas ?? []) {
    const answers = ctx.store.loadInterviewAreaIfExists(area.id).answers as Record<string, unknown>;
    for (const question of area.questions ?? []) {
      if (!question.config || !(question.id in answers)) continue;
      setPath(out, question.config, answers[question.id]);
      const automationKey = PLAN_CONFIG_TO_AUTOMATION[question.config];
      if (automationKey) setPath(out, `automation.${automationKey}`, answers[question.id]);
    }
  }
  return out;
}

function applyDerivedConfig(config: Config): Config {
  const automation = section(config, "automation");

  const inAppReview = section(config, "in_app_review");
  if (automation.in_app_review === false) inAppReview.enabled = false;
  if (automation.in_app_review === true && inAppReview.enabled === undefined) inAppReview.enabled = true;

  const inAppUpdate = section(config, "in_app_update");
  if (automation.in_app_update === false) inAppUpdate.enabled = false;
  if (automation.in_app_update === true && inAppUpdate.enabled === undefined) inAppUpdate.enabled = true;

  const ads = section(config, "ads");
  if (automation.ads === false) ads.enabled = false;
  if (automation.ads === true) ads.enabled = true;

  const billing = section(config, "billing");
  if (automation.billing === false) billing.enabled = false;
  if (automation.billing === true) billing.enabled = true;

  const marketResearch = section(config, "market_research");
  if (automation.market_research === false) marketResearch.enabled = false;
  if (automation.market_research === true && marketResearch.enabled === undefined) marketResearch.enabled = true;

  const uxQuality = section(config, "ux_quality");
  if (automation.accessibility_review === false) uxQuality.accessibility_required = false;
  if (automation.modern_ui === false) uxQuality.modern_ui = false;
  if (automation.ux_intuitiveness_review === false) uxQuality.intuitive_flow = false;

  if (automation.emulator === false) automation.defer_emulator_prompt_until_final = true;
  if (automation.emulator === true) automation.defer_emulator_prompt_until_final = false;
  return config;
}

function loadEffectiveConfig(ctx: Ctx): Config {
  let current: Config = {};
  try {
    current = ctx.store.loadConfigSnapshot();
  } catch {
    current = {};
  }
  return applyDerivedConfig(mergeDeep(mergeDeep(loadDefaults(ctx), loadPlanConfig(ctx)), current));
}

export function factoryConfigGet(ctx: Ctx): {
  config: Config;
  checkboxes: { key: string; label: string; value: boolean }[];
  emulator_final_prompt_deferred: boolean;
} {
  const config = loadEffectiveConfig(ctx);
  const automation = section(config, "automation");
  return {
    config,
    checkboxes: CHECKBOXES.map(([key, label]) => ({ key, label, value: automation[key] === true })),
    emulator_final_prompt_deferred:
      automation.emulator === false && automation.defer_emulator_prompt_until_final === true,
  };
}

export async function factoryConfigUpdate(
  ctx: Ctx,
  input: { automation?: Record<string, boolean>; config?: Config },
): Promise<{ saved: true; changed: string[]; config: Config; n_a_review_areas: string[]; final_emulator_prompt: boolean }> {
  const before = loadEffectiveConfig(ctx);
  const next = mergeDeep(before, input.config ?? {});
  if (input.automation) {
    const automation = section(next, "automation");
    for (const [key, value] of Object.entries(input.automation)) {
      automation[key] = value;
    }
  }
  applyDerivedConfig(next);

  const changed = Object.keys(input.automation ?? {}).sort();
  const automation = section(next, "automation");
  const nA = [
    automation.ads === false ? "ads" : undefined,
    automation.billing === false ? "billing" : undefined,
    automation.market_research === false ? "market_research" : undefined,
    automation.in_app_review === false ? "in_app_review" : undefined,
    automation.in_app_update === false ? "in_app_update" : undefined,
  ].filter((v): v is string => Boolean(v));

  await ctx.store.withLock("factory_config_update", () => {
    ctx.store.saveConfigSnapshot(next);
  });
  return {
    saved: true,
    changed,
    config: next,
    n_a_review_areas: nA,
    final_emulator_prompt:
      automation.emulator === false && automation.defer_emulator_prompt_until_final === true,
  };
}
