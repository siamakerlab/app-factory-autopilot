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
  declined: string[]; // 사용자가 거절한 항목 — 같은 세션 반복 제안 금지
  installed_by_doctor: { id: string; scope: string; at: string }[];
}

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
  input: { id: string; scope: "global" | "project"; success: boolean },
): Promise<{ id: string; recorded: boolean }> {
  const state = loadCapState(ctx);
  if (input.success) {
    state.installed_by_doctor.push({ id: input.id, scope: input.scope, at: new Date().toISOString() });
    if (!state.installed.skills.includes(input.id)) state.installed.skills.push(input.id);
  }
  saveCapState(ctx, state);
  return { id: input.id, recorded: true };
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
