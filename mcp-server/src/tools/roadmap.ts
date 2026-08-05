// 로드맵 도구 roadmap_* (AFA-012)
// SSOT는 .app-factory/state/roadmap.json. ROADMAP.md는 렌더링 산출물.
// 상태 변경은 반드시 전이 테이블(AFA-021) 검증을 거친다.

import type { Ctx } from "../context.js";
import type { RoadmapItem, RoadmapStatus, Role } from "../types.js";
import { ToolError } from "../errors.js";

const ID_PATTERN = /^RM-\d{3}$/;

function nowIso(): string {
  return new Date().toISOString();
}

/** 로드맵 항목 일괄 등록/갱신 (plan 산출물 반입). 구조 검증 포함. */
export async function roadmapParse(
  ctx: Ctx,
  input: { items: RoadmapItem[]; replace?: boolean },
): Promise<{ count: number; ids: string[] }> {
  return ctx.store.withLock("roadmap_parse", () => {
    for (const item of input.items) {
      if (!ID_PATTERN.test(item.id)) {
        throw new ToolError("SCHEMA_VIOLATION", `로드맵 ID 형식 오류: ${item.id}`);
      }
      if (!item.completion_criteria || item.completion_criteria.length === 0) {
        throw new ToolError(
          "SCHEMA_VIOLATION",
          `${item.id}: 완료 조건이 비어 있습니다 — 단순 체크리스트 금지 (MVP-1.md 3.10)`,
        );
      }
    }
    const ids = new Set(input.items.map((i) => i.id));
    if (ids.size !== input.items.length) {
      throw new ToolError("SCHEMA_VIOLATION", "로드맵 ID 중복");
    }
    // 의존성 참조 무결성
    const doc = input.replace ? { version: 1 as const, items: [] as RoadmapItem[] } : ctx.store.loadRoadmap();
    const existingIds = new Set(doc.items.map((i) => i.id));
    for (const item of input.items) {
      for (const dep of item.depends_on) {
        if (!ids.has(dep) && !existingIds.has(dep)) {
          throw new ToolError("DEPENDENCY_UNRESOLVED", `${item.id}: 존재하지 않는 의존성 ${dep}`);
        }
      }
    }
    for (const item of input.items) {
      const idx = doc.items.findIndex((i) => i.id === item.id);
      if (idx >= 0) doc.items[idx] = item;
      else doc.items.push(item);
    }
    doc.items.sort((a, b) => a.id.localeCompare(b.id));
    ctx.store.saveRoadmap(doc);
    return { count: doc.items.length, ids: [...ids] };
  });
}

export function roadmapGetItems(
  ctx: Ctx,
  input: { status?: RoadmapStatus; priority?: "P0" | "P1" | "P2" } = {},
): { items: RoadmapItem[] } {
  let items = ctx.store.loadRoadmap().items;
  if (input.status) items = items.filter((i) => i.status === input.status);
  if (input.priority) items = items.filter((i) => i.priority === input.priority);
  return { items };
}

/**
 * 상태 전이 — 전이 테이블 검증 통과 시에만 수행.
 * 거부된 전이 시도는 finding으로 자동 기록한다 (AFA-021 완료 조건).
 */
export async function roadmapUpdateStatus(
  ctx: Ctx,
  input: {
    item_id: string;
    to: RoadmapStatus;
    role: Role;
    evidence_ids?: string[];
    reason?: string;
    task_id?: string;
    criteria_updates?: { index: number; satisfied: boolean; evidence_ids?: string[] }[];
  },
): Promise<{ item_id: string; from: RoadmapStatus; to: RoadmapStatus }> {
  return ctx.store.withLock("roadmap_update_status", () => {
    const doc = ctx.store.loadRoadmap();
    const item = doc.items.find((i) => i.id === input.item_id);
    if (!item) throw new ToolError("NOT_FOUND", `로드맵 항목 없음: ${input.item_id}`);
    const from = item.status;

    // 완료 조건 충족 표시 갱신 (verifier가 검증 결과를 반영)
    if (input.criteria_updates) {
      if (input.role !== "verifier") {
        throw new ToolError("ROLE_FORBIDDEN", "완료 조건 충족 표시는 verifier만 갱신할 수 있습니다");
      }
      for (const u of input.criteria_updates) {
        const c = item.completion_criteria[u.index];
        if (!c) throw new ToolError("INVALID_INPUT", `완료 조건 인덱스 오류: ${u.index}`);
        c.satisfied = u.satisfied;
        if (u.evidence_ids) c.evidence_ids = u.evidence_ids;
      }
    }

    // 제출 결과 존재 여부 (IMPLEMENTED 전이 요건)
    const hasSubmitted = input.task_id
      ? (() => {
          try {
            const t = ctx.store.loadTask(input.task_id!);
            return t.status === "submitted" || t.status === "completed";
          } catch {
            return false;
          }
        })()
      : false;

    try {
      ctx.transitions.validate(item, input.to, input.role, {
        ...(input.evidence_ids ? { evidence_ids: input.evidence_ids } : {}),
        has_submitted_result: hasSubmitted,
      });
    } catch (e) {
      if (e instanceof ToolError) {
        // 거부된 전이 시도 → finding 자동 기록
        const fid = ctx.store.nextFindingId();
        ctx.store.saveFinding({
          version: 1,
          id: fid,
          severity: "major",
          area: "completion_mismark",
          title: `허용되지 않은 전이 시도: ${item.id} ${from} → ${input.to} (role: ${input.role})`,
          description: e.message,
          source: { kind: "gate", name: "transition-guard" },
          roadmap_item_id: item.id,
          status: "open",
          created_at: nowIso(),
        });
      }
      throw e;
    }

    // 증거 검증 (존재 확인)
    for (const eid of input.evidence_ids ?? []) {
      try {
        ctx.store.loadEvidence(eid);
      } catch {
        throw new ToolError("EVIDENCE_REQUIRED", `증거를 찾을 수 없습니다: ${eid}`);
      }
    }

    item.status = input.to;
    if (input.to === "VERIFIED") {
      item.evidence_ids = [...new Set([...(item.evidence_ids ?? []), ...(input.evidence_ids ?? [])])];
    }
    item.status_history = item.status_history ?? [];
    item.status_history.push({
      from,
      to: input.to,
      role: input.role,
      at: nowIso(),
      ...(input.reason ? { reason: input.reason } : {}),
      ...(input.task_id ? { task_id: input.task_id } : {}),
      ...(input.evidence_ids ? { evidence_ids: input.evidence_ids } : {}),
    });
    ctx.store.saveRoadmap(doc);
    return { item_id: item.id, from, to: input.to };
  });
}

/** 추적성 검증 — 누락 목록 반환 (AFA-012 완료 조건) */
export function roadmapValidateTraceability(ctx: Ctx): {
  ok: boolean;
  missing_test_criteria: string[];
  missing_runtime_criteria: string[];
  unverifiable_criteria: { item_id: string; description: string }[];
  dependency_cycles: string[][];
} {
  const { items } = ctx.store.loadRoadmap();
  const missingTest = items
    .filter((i) => !i.test_criteria || i.test_criteria.length === 0)
    .map((i) => i.id);
  const missingRuntime = items
    .filter((i) => !i.runtime_verification_criteria || i.runtime_verification_criteria.length === 0)
    .map((i) => i.id);
  const unverifiable: { item_id: string; description: string }[] = [];
  for (const i of items) {
    for (const c of i.completion_criteria) {
      if (c.verifiable_by === "manual") {
        unverifiable.push({ item_id: i.id, description: c.description });
      }
    }
  }
  // 의존성 순환 탐지 (DFS)
  const cycles: string[][] = [];
  const byId = new Map(items.map((i) => [i.id, i]));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const stack: string[] = [];
  const dfs = (id: string): void => {
    if (visited.has(id)) return;
    if (visiting.has(id)) {
      const start = stack.indexOf(id);
      cycles.push([...stack.slice(start), id]);
      return;
    }
    visiting.add(id);
    stack.push(id);
    for (const dep of byId.get(id)?.depends_on ?? []) dfs(dep);
    stack.pop();
    visiting.delete(id);
    visited.add(id);
  };
  for (const i of items) dfs(i.id);

  return {
    ok: missingTest.length === 0 && cycles.length === 0,
    missing_test_criteria: missingTest,
    missing_runtime_criteria: missingRuntime,
    unverifiable_criteria: unverifiable,
    dependency_cycles: cycles,
  };
}

/** ROADMAP.md 렌더링 (표시용 파생물) */
export function roadmapRenderMarkdown(ctx: Ctx): string {
  const { items } = ctx.store.loadRoadmap();
  const icon: Record<RoadmapStatus, string> = {
    NOT_STARTED: "⬜",
    IN_PROGRESS: "🟨",
    PARTIAL: "🟧",
    IMPLEMENTED: "🟦",
    VERIFIED: "✅",
    BLOCKED: "⛔",
    NEEDS_HUMAN_DECISION: "❓",
  };
  const lines = [
    "# ROADMAP",
    "",
    "<!-- 이 파일은 .app-factory/state/roadmap.json에서 렌더링된 파생물입니다. 직접 수정하지 마십시오. -->",
    "",
    "| ID | 항목 | 우선순위 | 위험도 | 상태 |",
    "|----|------|----------|--------|------|",
  ];
  for (const i of items) {
    lines.push(`| ${i.id} | ${i.title} | ${i.priority} | ${i.risk} | ${icon[i.status]} ${i.status} |`);
  }
  lines.push("");
  for (const i of items) {
    lines.push(`## ${i.id} ${i.title} — ${icon[i.status]} ${i.status}`);
    lines.push("");
    lines.push(`- 요구사항: ${i.requirement}`);
    lines.push(`- 구현 범위: ${i.implementation_scope}`);
    if (i.depends_on.length) lines.push(`- 의존성: ${i.depends_on.join(", ")}`);
    lines.push(`- 완료 조건:`);
    for (const c of i.completion_criteria) {
      lines.push(`  - [${c.satisfied ? "x" : " "}] ${c.description} (${c.verifiable_by})`);
    }
    lines.push("");
  }
  return lines.join("\n");
}
