// 발견·증거 도구 (AFA-013)
// finding resolve에는 증거 필수 — "고쳤다"는 주장에도 증거가 필요하다.

import * as fs from "node:fs";
import * as path from "node:path";
import { createHash } from "node:crypto";
import type { Ctx } from "../context.js";
import type { EvidenceMeta, Finding } from "../types.js";
import { ToolError } from "../errors.js";

function nowIso(): string {
  return new Date().toISOString();
}

function sha256(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

// ── finding ─────────────────────────────────────────────────────────────

export async function findingCreate(
  ctx: Ctx,
  input: Omit<Finding, "version" | "id" | "status" | "created_at" | "updated_at" | "history"> & {
    status?: Finding["status"];
  },
): Promise<{ finding_id: string }> {
  return ctx.store.withLock("finding_create", () => {
    const id = ctx.store.nextFindingId();
    const finding: Finding = {
      version: 1,
      id,
      severity: input.severity,
      area: input.area,
      title: input.title,
      source: input.source,
      status: input.status ?? "open",
      created_at: nowIso(),
      ...(input.description ? { description: input.description } : {}),
      ...(input.roadmap_item_id ? { roadmap_item_id: input.roadmap_item_id } : {}),
      ...(input.task_id ? { task_id: input.task_id } : {}),
      ...(input.location ? { location: input.location } : {}),
      ...(input.auto_fixable !== undefined ? { auto_fixable: input.auto_fixable } : {}),
    };
    ctx.store.saveFinding(finding);
    return { finding_id: id };
  });
}

export function findingList(
  ctx: Ctx,
  input: { status?: Finding["status"]; severity?: Finding["severity"]; area?: string } = {},
): { findings: Finding[] } {
  let findings = ctx.store.listFindings();
  if (input.status) findings = findings.filter((f) => f.status === input.status);
  if (input.severity) findings = findings.filter((f) => f.severity === input.severity);
  if (input.area) findings = findings.filter((f) => f.area === input.area);
  return { findings };
}

export async function findingResolve(
  ctx: Ctx,
  input: {
    finding_id: string;
    description: string;
    evidence_ids: string[];
    resolved_by_role: "worker" | "verifier" | "auditor" | "user";
  },
): Promise<{ finding_id: string; status: string }> {
  if (!input.evidence_ids || input.evidence_ids.length === 0) {
    throw new ToolError("EVIDENCE_REQUIRED", "finding resolve에는 증거가 1건 이상 필요합니다");
  }
  return ctx.store.withLock("finding_resolve", () => {
    for (const eid of input.evidence_ids) {
      try {
        ctx.store.loadEvidence(eid);
      } catch {
        throw new ToolError("EVIDENCE_REQUIRED", `증거를 찾을 수 없습니다: ${eid}`);
      }
    }
    const finding = ctx.store.loadFinding(input.finding_id);
    const from = finding.status;
    finding.status = "resolved";
    finding.resolution = {
      description: input.description,
      evidence_ids: input.evidence_ids,
      resolved_at: nowIso(),
      resolved_by_role: input.resolved_by_role,
    };
    finding.history = finding.history ?? [];
    finding.history.push({ from, to: "resolved", at: nowIso() });
    ctx.store.saveFinding(finding);
    return { finding_id: finding.id, status: finding.status };
  });
}

export async function findingReopen(
  ctx: Ctx,
  input: { finding_id: string; reason: string },
): Promise<{ finding_id: string; status: string }> {
  return ctx.store.withLock("finding_reopen", () => {
    const finding = ctx.store.loadFinding(input.finding_id);
    const from = finding.status;
    finding.status = "reopened";
    finding.history = finding.history ?? [];
    finding.history.push({ from, to: "reopened", at: nowIso(), reason: input.reason });
    ctx.store.saveFinding(finding);
    return { finding_id: finding.id, status: finding.status };
  });
}

// ── evidence ────────────────────────────────────────────────────────────

const LOG_TAIL_LINES = 200;
const TRUNCATE_THRESHOLD_BYTES = 256 * 1024;

export async function evidenceRegister(
  ctx: Ctx,
  input: {
    kind: string;
    title?: string;
    created_by: { role: string; name: string; run_id?: string };
    roadmap_item_ids?: string[];
    task_id?: string;
    summary?: string;
    data?: Record<string, unknown>;
    /** 프로젝트 내 파일을 증거로 복사 (대용량 텍스트는 tail 요약) */
    source_paths?: string[];
    /** 직접 내용 저장 */
    content_files?: { name: string; content: string }[];
  },
): Promise<{ evidence_id: string }> {
  return ctx.store.withLock("evidence_register", () => {
    const id = ctx.store.nextEvidenceId();
    const dir = ctx.store.evidenceDir(id);
    fs.mkdirSync(dir, { recursive: true });
    const files: NonNullable<EvidenceMeta["files"]> = [];

    for (const src of input.source_paths ?? []) {
      const abs = path.isAbsolute(src) ? src : path.join(ctx.projectRoot, src);
      if (!fs.existsSync(abs)) {
        throw new ToolError("NOT_FOUND", `증거 원본 파일 없음: ${src}`);
      }
      const raw = fs.readFileSync(abs);
      const originalHash = sha256(raw);
      const base = path.basename(abs);
      let stored = raw;
      let truncated = false;
      if (raw.length > TRUNCATE_THRESHOLD_BYTES && isProbablyText(raw)) {
        const lines = raw.toString("utf-8").split("\n");
        stored = Buffer.from(lines.slice(-LOG_TAIL_LINES).join("\n"), "utf-8");
        truncated = true;
      }
      fs.writeFileSync(path.join(dir, base), stored);
      files.push({
        path: base,
        sha256: originalHash,
        truncated,
        original_size_bytes: raw.length,
      });
    }

    for (const cf of input.content_files ?? []) {
      const buf = Buffer.from(cf.content, "utf-8");
      fs.writeFileSync(path.join(dir, cf.name), buf);
      files.push({ path: cf.name, sha256: sha256(buf), truncated: false, original_size_bytes: buf.length });
    }

    const meta: EvidenceMeta = {
      version: 1,
      id,
      kind: input.kind,
      created_by: input.created_by,
      created_at: nowIso(),
      ...(input.title ? { title: input.title } : {}),
      ...(input.roadmap_item_ids ? { roadmap_item_ids: input.roadmap_item_ids } : {}),
      ...(input.task_id ? { task_id: input.task_id } : {}),
      ...(input.summary ? { summary: input.summary } : {}),
      ...(input.data ? { data: input.data } : {}),
      ...(files.length ? { files } : {}),
    };
    ctx.store.saveEvidence(meta);
    return { evidence_id: id };
  });
}

function isProbablyText(buf: Buffer): boolean {
  const sample = buf.subarray(0, 1024);
  return !sample.includes(0);
}

export function evidenceGet(ctx: Ctx, input: { evidence_id: string }): EvidenceMeta {
  return ctx.store.loadEvidence(input.evidence_id);
}

/** 파일 존재·해시 일치·타입 적합성 검사 (AFA-013 완료 조건) */
export function evidenceValidate(
  ctx: Ctx,
  input: { evidence_id: string },
): { valid: boolean; problems: string[] } {
  const meta = ctx.store.loadEvidence(input.evidence_id);
  const dir = ctx.store.evidenceDir(meta.id);
  const problems: string[] = [];
  for (const f of meta.files ?? []) {
    const p = path.join(dir, f.path);
    if (!fs.existsSync(p)) {
      problems.push(`파일 없음: ${f.path}`);
      continue;
    }
    if (!f.truncated) {
      const actual = sha256(fs.readFileSync(p));
      if (actual !== f.sha256) problems.push(`해시 불일치: ${f.path}`);
    }
  }
  if (!meta.kind) problems.push("kind 누락");
  return { valid: problems.length === 0, problems };
}
