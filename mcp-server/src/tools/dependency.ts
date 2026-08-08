// 의존성 도구 dependency_* (AFA-015) — 라이브러리 추가 승인 절차 (통합 명세 3.5)
// 버전 검토 + 라이선스 검토를 모두 통과해야 approve 가능. GPL/AGPL 자동 거부.
// approve 시 후속 작업(Catalog→Locking→Verification→빌드→테스트→고지→SBOM→문서)을 큐에 자동 등록.

import * as fs from "node:fs";
import * as path from "node:path";
import type { Ctx } from "../context.js";
import { ToolError } from "../errors.js";
import { evaluateLicense, type LicenseDecision } from "../license-policy.js";
import { classifyVersion } from "../version-policy.js";
import { factoryCreateTask } from "./factory.js";

export interface DependencyRequest {
  version: 1;
  id: string;
  coordinates: string; // group:artifact
  reason: string;
  requested_by_task?: string;
  status: "requested" | "version_reviewed" | "license_reviewed" | "approved" | "rejected";
  version_review?: {
    approved_version: string;
    verdict: string;
    compatible: boolean;
    source_urls: string[];
    reviewed_at: string;
  };
  license_review?: {
    spdx: string;
    decision: LicenseDecision;
    rationale: string;
    source_urls: string[];
    reviewed_at: string;
  };
  rejection_reason?: string;
  created_at: string;
  updated_at?: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

function depDir(ctx: Ctx): string {
  return path.join(ctx.store.root, "state", "dependencies");
}

function depPath(ctx: Ctx, id: string): string {
  return path.join(depDir(ctx), `${id}.json`);
}

function loadDep(ctx: Ctx, id: string): DependencyRequest {
  return ctx.store.readJson<DependencyRequest>(depPath(ctx, id));
}

function saveDep(ctx: Ctx, dep: DependencyRequest): void {
  dep.updated_at = nowIso();
  ctx.store.writeJsonAtomic(depPath(ctx, dep.id), dep);
}

export function listDependencies(ctx: Ctx): DependencyRequest[] {
  const dir = depDir(ctx);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => ctx.store.readJson<DependencyRequest>(path.join(dir, f)))
    .sort((a, b) => a.id.localeCompare(b.id));
}

export async function dependencyRequest(
  ctx: Ctx,
  input: { coordinates: string; reason: string; requested_by_task?: string },
): Promise<{ dependency_id: string }> {
  if (!/^[\w.-]+:[\w.-]+$/.test(input.coordinates)) {
    throw new ToolError("INVALID_INPUT", `좌표 형식 오류 (group:artifact): ${input.coordinates}`);
  }
  return ctx.store.withLock("dependency_request", () => {
    const existing = listDependencies(ctx);
    const dup = existing.find((d) => d.coordinates === input.coordinates && d.status !== "rejected");
    if (dup) {
      throw new ToolError("INVALID_INPUT", `이미 요청된 의존성입니다: ${dup.id} (${dup.status})`);
    }
    const id = `DEP-${String(existing.length + 1).padStart(4, "0")}`;
    const dep: DependencyRequest = {
      version: 1,
      id,
      coordinates: input.coordinates,
      reason: input.reason,
      status: "requested",
      created_at: nowIso(),
      ...(input.requested_by_task ? { requested_by_task: input.requested_by_task } : {}),
    };
    saveDep(ctx, dep);
    return { dependency_id: id };
  });
}

/** 버전 검토 기록 — 검토 Agent가 공식 문서 조회 결과를 제출 (MCP는 검증·기록) */
export async function dependencyReviewVersion(
  ctx: Ctx,
  input: {
    dependency_id: string;
    approved_version: string;
    compatible: boolean;
    source_urls: string[];
  },
): Promise<{ dependency_id: string; verdict: string; accepted: boolean }> {
  if (!input.source_urls || input.source_urls.length === 0) {
    throw new ToolError("INVALID_INPUT", "근거 URL(공식 문서·릴리스 페이지)이 필수입니다");
  }
  return ctx.store.withLock("dependency_review_version", () => {
    const dep = loadDep(ctx, input.dependency_id);
    const verdict = classifyVersion(input.approved_version);
    const accepted = verdict === "stable" && input.compatible;
    dep.version_review = {
      approved_version: input.approved_version,
      verdict,
      compatible: input.compatible,
      source_urls: input.source_urls,
      reviewed_at: nowIso(),
    };
    if (accepted && dep.status === "requested") dep.status = "version_reviewed";
    saveDep(ctx, dep);
    if (verdict !== "stable") {
      return { dependency_id: dep.id, verdict, accepted: false };
    }
    return { dependency_id: dep.id, verdict, accepted };
  });
}

/** 라이선스 검토 기록 — 정책 엔진이 제출된 SPDX를 재판정 (이중 확인) */
export async function dependencyReviewLicense(
  ctx: Ctx,
  input: { dependency_id: string; spdx: string; source_urls: string[] },
): Promise<{ dependency_id: string; decision: LicenseDecision; rationale: string }> {
  if (!input.source_urls || input.source_urls.length === 0) {
    throw new ToolError("INVALID_INPUT", "근거 URL이 필수입니다");
  }
  return ctx.store.withLock("dependency_review_license", () => {
    const dep = loadDep(ctx, input.dependency_id);
    const verdict = evaluateLicense(input.spdx, ctx.licensePolicy);
    dep.license_review = {
      spdx: input.spdx,
      decision: verdict.decision,
      rationale: verdict.rationale,
      source_urls: input.source_urls,
      reviewed_at: nowIso(),
    };
    if (verdict.decision === "block") {
      dep.status = "rejected";
      dep.rejection_reason = `라이선스 자동 차단: ${verdict.rationale}`;
    } else if (verdict.decision === "allow" && dep.status === "version_reviewed") {
      dep.status = "license_reviewed";
    }
    // manual_review는 상태 유지 → approve 불가, 사용자 승인 절차 필요
    saveDep(ctx, dep);
    return { dependency_id: dep.id, decision: verdict.decision, rationale: verdict.rationale };
  });
}

export async function dependencyApprove(
  ctx: Ctx,
  input: { dependency_id: string; role: string },
): Promise<{ dependency_id: string; status: string; followup_task_ids: string[] }> {
  const dep = loadDep(ctx, input.dependency_id);
  if (dep.status === "rejected") {
    throw new ToolError("INVALID_INPUT", `거부된 요청은 승인할 수 없습니다: ${dep.rejection_reason}`);
  }
  const vr = dep.version_review;
  const lr = dep.license_review;
  if (!vr || vr.verdict !== "stable" || !vr.compatible) {
    throw new ToolError("DEPENDENCY_UNRESOLVED", "버전 검토(안정 버전·호환성)를 통과하지 못했습니다");
  }
  if (!lr) {
    throw new ToolError("DEPENDENCY_UNRESOLVED", "라이선스 검토가 없습니다");
  }
  if (lr.decision === "block") {
    throw new ToolError("DEPENDENCY_UNRESOLVED", `라이선스 차단: ${lr.rationale}`);
  }
  if (lr.decision === "manual_review" && input.role !== "user") {
    throw new ToolError(
      "APPROVAL_REQUIRED",
      "수동 검토 대상 라이선스 — 사용자(user) 승인만 허용됩니다",
    );
  }

  // 후속 작업 자동 등록 (통합 명세 3.5의 9단계)
  const followups = [
    `Version Catalog에 ${dep.coordinates}:${vr.approved_version} 추가`,
    "Gradle 의존성 그래프 확인",
    "Dependency Locking 갱신",
    "Dependency Verification Metadata 갱신",
    "빌드 게이트 실행",
    "단위 테스트 게이트 실행",
    "Lint 게이트 실행",
    "라이선스 고지·SBOM 갱신",
    "DEPENDENCIES.md 갱신",
  ];
  const ids: string[] = [];
  let prev: string | undefined;
  for (const title of followups) {
    const { task_id } = await factoryCreateTask(ctx, {
      type: title.includes("게이트") ? "gate" : "implement",
      title: `[${dep.id}] ${title}`,
      priority: "P0",
      ...(prev ? { depends_on: [prev] } : {}),
    });
    ids.push(task_id);
    prev = task_id;
  }

  await ctx.store.withLock("dependency_approve", () => {
    dep.status = "approved";
    saveDep(ctx, dep);
  });
  return { dependency_id: dep.id, status: "approved", followup_task_ids: ids };
}

export async function dependencyReject(
  ctx: Ctx,
  input: { dependency_id: string; reason: string },
): Promise<{ dependency_id: string; status: string }> {
  return ctx.store.withLock("dependency_reject", () => {
    const dep = loadDep(ctx, input.dependency_id);
    dep.status = "rejected";
    dep.rejection_reason = input.reason;
    saveDep(ctx, dep);
    return { dependency_id: dep.id, status: dep.status };
  });
}
