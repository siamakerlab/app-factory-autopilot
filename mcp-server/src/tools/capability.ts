// 역량 도구 capability_* (AFA-017) — Capability Doctor의 MCP 측 구현.
// 탐지·설치는 어댑터 몫. MCP는 카탈로그 대조, 계획 생성, 결과·거절 기록만 담당한다.

import * as fs from "node:fs";
import * as path from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import type { Ctx } from "../context.js";
import { ToolError } from "../errors.js";

interface CatalogSkill {
  id: string;
  category: string;
  purpose: string;
  priority: "required" | "recommended" | "optional";
  condition?: string;
  providers?: string[];
  install?: { method: string; source: string; path?: string; plugin?: string };
  verified?: Record<string, unknown>;
  guidance_doc?: string;
}

interface Catalog {
  version: number;
  scopes: string[];
  skills: CatalogSkill[];
  builtin_skills: { id: string; category: string; purpose: string }[];
  excluded_unverified: string[];
  mcp_servers: { id: string; purpose: string; priority: string; requires_api_key: boolean; condition?: string }[];
  subagents: { id: string; purpose: string; priority: string }[];
}

export function loadCatalog(coreDir: string): Catalog {
  const p = path.join(coreDir, "policies", "capability-catalog.yaml");
  return parseYaml(fs.readFileSync(p, "utf-8")) as Catalog;
}

interface CapabilitiesState {
  version: 1;
  scanned_at?: string;
  installed: { skills: string[]; mcp_servers: string[]; subagents: string[] };
  environment?: {
    scanned_at: string;
    checks: EnvironmentCheck[];
  };
  declined: string[]; // 사용자가 거절한 항목 — 같은 세션 반복 제안 금지
  installed_by_doctor: { id: string; scope: string; at: string }[];
}

export interface EnvironmentCheck {
  id: string;
  label: string;
  status: "available" | "missing" | "blocked" | "unknown";
  required_for: string[];
  path?: string;
  detail?: string;
  remediation: string;
  blocking_when?: string;
}

const GUIDANCE_START = "<!-- app-factory:capabilities:start -->";
const GUIDANCE_END = "<!-- app-factory:capabilities:end -->";

function capStatePath(ctx: Ctx): string {
  return path.join(ctx.store.root, "config", "capabilities.yaml");
}

function loadCapState(ctx: Ctx): CapabilitiesState {
  const p = capStatePath(ctx);
  if (!fs.existsSync(p)) {
    return {
      version: 1,
      installed: { skills: [], mcp_servers: [], subagents: [] },
      declined: [],
      installed_by_doctor: [],
    };
  }
  return parseYaml(fs.readFileSync(p, "utf-8")) as CapabilitiesState;
}

function saveCapState(ctx: Ctx, state: CapabilitiesState): void {
  fs.mkdirSync(path.dirname(capStatePath(ctx)), { recursive: true });
  fs.writeFileSync(capStatePath(ctx), stringifyYaml(state), "utf-8");
}

function guidanceTarget(ctx: Ctx, scope: "global" | "project", override?: string): string {
  if (override) return path.resolve(ctx.projectRoot, override);
  if (scope === "global") {
    const home = process.env.HOME;
    if (!home) throw new ToolError("INVALID_INPUT", "HOME이 없어 전역 관리문서 경로를 결정할 수 없습니다");
    return path.join(home, ".claude", "CLAUDE.md");
  }
  const docsRules = path.join(ctx.projectRoot, "docs", "APP_FACTORY_RULES.md");
  if (fs.existsSync(docsRules)) return docsRules;
  return path.join(ctx.projectRoot, "APP_FACTORY_RULES.md");
}

function writeGuidanceBlock(file: string, guidanceLines: string[]): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const existing = fs.existsSync(file) ? fs.readFileSync(file, "utf-8") : "# APP_FACTORY_RULES\n";
  const unique = Array.from(new Set(guidanceLines.map((line) => line.trim()).filter(Boolean))).sort();
  const block = [
    GUIDANCE_START,
    "",
    "## App Factory Capabilities",
    "",
    ...unique.map((line) => `- ${line}`),
    "",
    GUIDANCE_END,
  ].join("\n");
  const re = new RegExp(`${GUIDANCE_START}[\\s\\S]*?${GUIDANCE_END}`);
  const next = re.test(existing)
    ? existing.replace(re, block)
    : `${existing.trimEnd()}\n\n${block}\n`;
  fs.writeFileSync(file, next, "utf-8");
}

function applyGuidanceDoc(
  ctx: Ctx,
  input: { id: string; scope: "global" | "project"; guidance_target_path?: string },
): { path: string; line_count: number } | undefined {
  const catalog = loadCatalog(ctx.coreDir);
  const state = loadCapState(ctx);
  const installed = new Set([
    ...state.installed.skills,
    ...state.installed_by_doctor.map((item) => item.id),
    input.id,
  ]);
  const lines = catalog.skills
    .filter((skill) => installed.has(skill.id) && skill.guidance_doc)
    .map((skill) => skill.guidance_doc!);
  if (lines.length === 0) return undefined;
  const target = guidanceTarget(ctx, input.scope, input.guidance_target_path);
  writeGuidanceBlock(target, lines);
  return { path: target, line_count: lines.length };
}

/** 어댑터가 탐지한 설치 목록을 받아 카탈로그와 대조·기록 */
export async function capabilityScan(
  ctx: Ctx,
  input: { installed_skills: string[]; installed_mcp_servers: string[]; installed_subagents: string[] },
): Promise<{
  missing_required: CatalogSkill[];
  missing_recommended: CatalogSkill[];
  missing_optional: CatalogSkill[];
  missing_mcp: { id: string; purpose: string; requires_api_key: boolean }[];
  builtin_absent: string[];
}> {
  const catalog = loadCatalog(ctx.coreDir);
  const state = loadCapState(ctx);
  state.scanned_at = new Date().toISOString();
  state.installed = {
    skills: input.installed_skills,
    mcp_servers: input.installed_mcp_servers,
    subagents: input.installed_subagents,
  };
  saveCapState(ctx, state);

  const has = new Set(input.installed_skills);
  const missing = catalog.skills.filter((s) => !has.has(s.id) && !state.declined.includes(s.id));
  const mcpHas = new Set(input.installed_mcp_servers);
  return {
    missing_required: missing.filter((s) => s.priority === "required"),
    missing_recommended: missing.filter((s) => s.priority === "recommended"),
    missing_optional: missing.filter((s) => s.priority === "optional"),
    missing_mcp: catalog.mcp_servers
      .filter((m) => !mcpHas.has(m.id) && !state.declined.includes(m.id))
      .map((m) => ({ id: m.id, purpose: m.purpose, requires_api_key: m.requires_api_key })),
    builtin_absent: catalog.builtin_skills.filter((b) => !has.has(b.id)).map((b) => b.id),
  };
}

/** 어댑터가 현재 설치 환경을 점검한 결과를 기록하고 사용자 안내용 부족분을 반환한다. */
export async function capabilityRecordEnvironment(
  ctx: Ctx,
  input: { checks: EnvironmentCheck[] },
): Promise<{
  recorded: true;
  missing: EnvironmentCheck[];
  blocked: EnvironmentCheck[];
  user_message: string;
}> {
  const state = loadCapState(ctx);
  const scannedAt = new Date().toISOString();
  state.environment = { scanned_at: scannedAt, checks: input.checks };
  saveCapState(ctx, state);

  const missing = input.checks.filter((check) => check.status === "missing" || check.status === "unknown");
  const blocked = input.checks.filter((check) => check.status === "blocked");
  const lines = [
    "환경 점검 결과",
    `- 점검 시각: ${scannedAt}`,
    `- 사용 가능: ${input.checks.filter((check) => check.status === "available").length}`,
    `- 부족/확인 필요: ${missing.length}`,
    `- 차단: ${blocked.length}`,
  ];
  for (const check of [...blocked, ...missing]) {
    lines.push(
      `- ${check.label}: ${check.detail ?? check.status}. 필요 기능: ${check.required_for.join(", ")}. 조치: ${check.remediation}`,
    );
  }
  return {
    recorded: true,
    missing,
    blocked,
    user_message: lines.join("\n"),
  };
}

export function capabilityListMissing(ctx: Ctx): {
  items: { id: string; priority: string; purpose: string; requires_api_key?: boolean }[];
} {
  const catalog = loadCatalog(ctx.coreDir);
  const state = loadCapState(ctx);
  const has = new Set(state.installed.skills);
  const mcpHas = new Set(state.installed.mcp_servers);
  const items: { id: string; priority: string; purpose: string; requires_api_key?: boolean }[] = [];
  for (const s of catalog.skills) {
    if (!has.has(s.id) && !state.declined.includes(s.id)) {
      items.push({ id: s.id, priority: s.priority, purpose: s.purpose });
    }
  }
  for (const m of catalog.mcp_servers) {
    if (!mcpHas.has(m.id) && !state.declined.includes(m.id)) {
      items.push({ id: m.id, priority: m.priority, purpose: m.purpose, requires_api_key: m.requires_api_key });
    }
  }
  return { items };
}

/** 선택 항목+스코프 → Provider별 설치 명령 목록 (사용자 확인 후 어댑터가 실행) */
export function capabilityInstallPlan(
  ctx: Ctx,
  input: { selections: { id: string; scope: "global" | "project" }[]; provider: "claude-code" | "codex" },
): {
  plan: {
    id: string;
    scope: string;
    method: string;
    command: string;
    guidance_doc?: string;
  }[];
  unavailable: { id: string; reason: string }[];
} {
  const catalog = loadCatalog(ctx.coreDir);
  const plan: { id: string; scope: string; method: string; command: string; guidance_doc?: string }[] = [];
  const unavailable: { id: string; reason: string }[] = [];

  for (const sel of input.selections) {
    const skill = catalog.skills.find((s) => s.id === sel.id);
    if (!skill) {
      if (catalog.excluded_unverified.includes(sel.id)) {
        unavailable.push({ id: sel.id, reason: "공개 레포 미검증 — 설치 소스 없음" });
      } else if (catalog.builtin_skills.some((b) => b.id === sel.id)) {
        unavailable.push({ id: sel.id, reason: "내장 스킬 — 설치 불필요" });
      } else {
        unavailable.push({ id: sel.id, reason: "카탈로그에 없음" });
      }
      continue;
    }
    if (!skill.install) {
      unavailable.push({ id: sel.id, reason: "설치 방법 미정" });
      continue;
    }
    const { method, source, path: subPath, plugin } = skill.install;
    let command: string;
    if (method === "skills-cli") {
      command = `npx skills add ${source}${subPath ? ` --skill ${subPath}` : ""}${sel.scope === "global" ? " --global" : ""}`;
    } else if (method === "claude-plugin") {
      command = `claude plugin marketplace add ${source} && claude plugin install ${plugin ?? skill.id}`;
    } else if (method === "git") {
      const target =
        sel.scope === "global" ? "~/.claude/skills/" : ".claude/skills/";
      command = `git clone ${source} ${target}${skill.id}`;
    } else {
      unavailable.push({ id: sel.id, reason: `알 수 없는 설치 방법: ${method}` });
      continue;
    }
    plan.push({
      id: skill.id,
      scope: sel.scope,
      method,
      command,
      ...(skill.guidance_doc ? { guidance_doc: skill.guidance_doc } : {}),
    });
  }
  return { plan, unavailable };
}

export async function capabilityMarkInstalled(
  ctx: Ctx,
  input: {
    id: string;
    scope: "global" | "project";
    success: boolean;
    apply_guidance?: boolean;
    guidance_target_path?: string;
  },
): Promise<{ id: string; recorded: boolean; guidance?: { path: string; line_count: number } }> {
  const state = loadCapState(ctx);
  if (input.success) {
    state.installed_by_doctor.push({ id: input.id, scope: input.scope, at: new Date().toISOString() });
    if (!state.installed.skills.includes(input.id)) state.installed.skills.push(input.id);
  }
  saveCapState(ctx, state);
  const shouldApplyGuidance = input.success && (input.apply_guidance ?? input.scope === "project");
  const guidance = shouldApplyGuidance ? applyGuidanceDoc(ctx, input) : undefined;
  return { id: input.id, recorded: true, ...(guidance ? { guidance } : {}) };
}

/** 사용자가 거절한 항목 기록 — 같은 세션에서 반복 제안하지 않는다 */
export async function capabilityMarkDeclined(
  ctx: Ctx,
  input: { ids: string[] },
): Promise<{ declined: string[] }> {
  const state = loadCapState(ctx);
  for (const id of input.ids) {
    if (!state.declined.includes(id)) state.declined.push(id);
  }
  saveCapState(ctx, state);
  return { declined: state.declined };
}

export function capabilityGetStatus(ctx: Ctx): CapabilitiesState {
  if (!fs.existsSync(capStatePath(ctx))) {
    throw new ToolError("NOT_FOUND", "capability 스캔 기록이 없습니다 — capability_scan을 먼저 실행하십시오", true);
  }
  return loadCapState(ctx);
}
