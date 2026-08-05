// 승인·Placeholder 도구 (AFA-016)
// 승인은 비동기 — MCP는 기록·조회만 하고 사용자 대화는 어댑터가 담당한다.

import * as fs from "node:fs";
import * as path from "node:path";
import { parse as parseYaml } from "yaml";
import type { Ctx } from "../context.js";
import type { Approval, Placeholder } from "../types.js";
import { ToolError } from "../errors.js";

const NAME_PATTERN = /^\$\{PLACEHOLDER_[A-Z0-9_]+\}$/;

function nowIso(): string {
  return new Date().toISOString();
}

// ── 승인 ────────────────────────────────────────────────────────────────

export async function approvalRequest(
  ctx: Ctx,
  input: {
    subject: string;
    options: string[];
    rationale: string;
    risks: string;
    recommendation: string;
  },
): Promise<{ approval_id: string }> {
  if (input.options.length < 1) {
    throw new ToolError("INVALID_INPUT", "선택지가 1개 이상 필요합니다");
  }
  return ctx.store.withLock("approval_request", () => {
    const id = ctx.store.nextApprovalId();
    const approval: Approval = {
      version: 1,
      id,
      subject: input.subject,
      options: input.options,
      rationale: input.rationale,
      risks: input.risks,
      recommendation: input.recommendation,
      status: "pending",
      created_at: nowIso(),
    };
    ctx.store.saveApproval(approval);
    return { approval_id: id };
  });
}

export function approvalGetStatus(
  ctx: Ctx,
  input: { approval_id: string },
): Approval {
  return ctx.store.loadApproval(input.approval_id);
}

/** 사용자 결정 기록 (어댑터가 사용자 응답을 받아 호출) */
export async function approvalDecide(
  ctx: Ctx,
  input: { approval_id: string; approved: boolean; decided_option?: string },
): Promise<{ approval_id: string; status: string }> {
  return ctx.store.withLock("approval_decide", () => {
    const approval = ctx.store.loadApproval(input.approval_id);
    if (approval.status !== "pending") {
      throw new ToolError("INVALID_INPUT", `이미 결정된 승인입니다: ${approval.status}`);
    }
    approval.status = input.approved ? "approved" : "rejected";
    approval.decided_at = nowIso();
    if (input.decided_option) approval.decided_option = input.decided_option;
    ctx.store.saveApproval(approval);
    return { approval_id: approval.id, status: approval.status };
  });
}

// ── Placeholder ────────────────────────────────────────────────────────

interface PlaceholderPolicyDoc {
  version: number;
  kind_defaults: Record<
    string,
    {
      importance: Placeholder["importance"];
      resolve_by: Placeholder["resolve_by"];
      auto_proceed: boolean;
      release_blocking: boolean;
    }
  >;
}

function loadPlaceholderPolicy(coreDir: string): PlaceholderPolicyDoc {
  const p = path.join(coreDir, "policies", "placeholder-policy.yaml");
  return parseYaml(fs.readFileSync(p, "utf-8")) as PlaceholderPolicyDoc;
}

export async function placeholderCreate(
  ctx: Ctx,
  input: {
    name: string;
    kind: string;
    description?: string;
    recommended_value?: string;
    temporary_value?: string;
    /** 종류별 기본 속성 override */
    importance?: Placeholder["importance"];
    resolve_by?: Placeholder["resolve_by"];
    auto_proceed?: boolean;
    release_blocking?: boolean;
    locations?: string[];
  },
): Promise<{ name: string }> {
  if (!NAME_PATTERN.test(input.name)) {
    throw new ToolError(
      "INVALID_INPUT",
      `Placeholder 이름 형식 오류: ${input.name} — \${PLACEHOLDER_대문자_스네이크} 형식만 허용`,
    );
  }
  const policy = loadPlaceholderPolicy(ctx.coreDir);
  const defaults = policy.kind_defaults[input.kind] ?? policy.kind_defaults["other"];
  if (!defaults) {
    throw new ToolError("INTERNAL", "placeholder-policy.yaml에 other 기본값이 없습니다");
  }
  return ctx.store.withLock("placeholder_create", () => {
    const ph: Placeholder = {
      version: 1,
      name: input.name,
      kind: input.kind,
      importance: input.importance ?? defaults.importance,
      resolve_by: input.resolve_by ?? defaults.resolve_by,
      auto_proceed: input.auto_proceed ?? defaults.auto_proceed,
      release_blocking: input.release_blocking ?? defaults.release_blocking,
      status: input.temporary_value ? "temporary" : "unresolved",
      created_at: nowIso(),
      ...(input.description ? { description: input.description } : {}),
      ...(input.recommended_value ? { recommended_value: input.recommended_value } : {}),
      ...(input.temporary_value ? { temporary_value: input.temporary_value } : {}),
      ...(input.locations ? { locations: input.locations } : {}),
    };
    ctx.store.savePlaceholder(ph);
    return { name: ph.name };
  });
}

export async function placeholderResolve(
  ctx: Ctx,
  input: { name: string; resolved_value: string },
): Promise<{ name: string; status: string }> {
  return ctx.store.withLock("placeholder_resolve", () => {
    const ph = ctx.store.loadPlaceholder(input.name);
    ph.status = "resolved";
    ph.resolved_value = input.resolved_value;
    ph.resolved_at = nowIso();
    ctx.store.savePlaceholder(ph);
    return { name: ph.name, status: ph.status };
  });
}

/** 릴리스 차단 항목만 정확히 반환 (AFA-016 완료 조건) */
export function placeholderListBlocking(ctx: Ctx): { blocking: Placeholder[] } {
  return {
    blocking: ctx.store
      .listPlaceholders()
      .filter((p) => p.release_blocking && p.status !== "resolved"),
  };
}

export function placeholderList(ctx: Ctx): { placeholders: Placeholder[] } {
  return { placeholders: ctx.store.listPlaceholders() };
}
