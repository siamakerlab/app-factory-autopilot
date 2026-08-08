#!/usr/bin/env node
// app-factory-core MCP 서버 (AFA-010)
// 실행: app-factory-core --project-root <대상 프로젝트 경로> [--core-dir <core 경로>]
// projectRoot는 기동 시 고정 — 세션 중 변경 불가 (상태 오염 방지).

import * as path from "node:path";
import * as fs from "node:fs";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { createContext, type Ctx } from "./context.js";
import { ToolError } from "./errors.js";
import * as factory from "./tools/factory.js";
import * as roadmap from "./tools/roadmap.js";
import * as fe from "./tools/finding-evidence.js";
import * as gate from "./tools/gate.js";
import * as dep from "./tools/dependency.js";
import * as ap from "./tools/approval-placeholder.js";
import * as cap from "./tools/capability.js";
import * as cfg from "./tools/config.js";
import * as plan from "./tools/plan.js";
import * as ftest from "./tools/factory-test.js";
import { decideNextAction, handleTaskFailure } from "./orchestrator.js";
import { reviewPlanFixes, reviewScore, reviewSaveReport } from "./tools/review.js";
import { buildProgressReport, renderProgressReport } from "./report.js";

function parseArgs(argv: string[]): { projectRoot: string; coreDir: string } {
  let projectRoot = process.cwd();
  let coreDir: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--project-root" && argv[i + 1]) projectRoot = path.resolve(argv[++i]!);
    else if (argv[i] === "--core-dir" && argv[i + 1]) coreDir = path.resolve(argv[++i]!);
  }
  if (!coreDir) {
    // 배포 패키지 기준: dist/../core (번들에 core 사본 포함) → 개발 저장소 fallback
    const here = path.dirname(fileURLToPath(import.meta.url));
    const candidates = [path.join(here, "..", "core"), path.join(here, "..", "..", "core")];
    coreDir = candidates.find((c) => fs.existsSync(path.join(c, "workflow", "transitions.yaml")));
    if (!coreDir) {
      console.error("core 디렉터리를 찾을 수 없습니다 — --core-dir 인자를 지정하십시오");
      process.exit(1);
    }
  }
  return { projectRoot, coreDir };
}

type Handler = (ctx: Ctx, input: never) => unknown;

function wrap(ctx: Ctx, fn: Handler) {
  return async (input: unknown) => {
    try {
      const result = await fn(ctx, input as never);
      return { content: [{ type: "text" as const, text: JSON.stringify(result ?? {}, null, 2) }] };
    } catch (e) {
      const err =
        e instanceof ToolError
          ? e.toJSON()
          : { code: "INTERNAL", message: String(e), recoverable: false };
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ error: err }, null, 2) }],
        isError: true,
      };
    }
  };
}

const roleSchema = z.enum(["orchestrator", "worker", "verifier", "auditor", "user"]);
const taskTypeSchema = z.enum(["implement", "verify", "fix", "review", "approval", "gate"]);
const prioritySchema = z.enum(["P0", "P1", "P2"]);
const taskStatusSchema = z.enum(["queued", "claimed", "submitted", "completed", "failed", "cancelled", "blocked"]);
const roadmapStatusSchema = z.enum(["NOT_STARTED", "IN_PROGRESS", "PARTIAL", "IMPLEMENTED", "VERIFIED", "BLOCKED", "NEEDS_HUMAN_DECISION"]);
const findingSeveritySchema = z.enum(["blocker", "major", "minor"]);
const findingStatusSchema = z.enum(["open", "in_fix", "resolved", "reopened"]);
const sourceSchema = z.object({ kind: z.string(), name: z.string(), url: z.string().optional() });
const createdBySchema = z.object({ role: z.string(), name: z.string(), run_id: z.string().optional() });
const stringArraySchema = z.array(z.string());
const looseRecordSchema = z.record(z.string(), z.unknown());
const contentFileSchema = z.object({ name: z.string(), content: z.string() });

export function buildServer(ctx: Ctx): McpServer {
  const server = new McpServer({ name: "app-factory-core", version: "0.1.0" });
  const schemas = {
    factory_initialize: z.object({ config: looseRecordSchema.optional() }),
    factory_create_task: z.object({
      type: taskTypeSchema,
      title: z.string(),
      description: z.string().optional(),
      priority: prioritySchema.optional(),
      roadmap_item_id: z.string().optional(),
      depends_on: stringArraySchema.optional(),
      dangerous: stringArraySchema.optional(),
      max_attempts: z.number().int().positive().optional(),
    }),
    factory_claim_task: z.object({ task_id: z.string(), role: roleSchema, agent: z.string() }),
    factory_submit_result: z.object({
      task_id: z.string(),
      token: z.string(),
      result: z.object({
        summary: z.string(),
        changed_files: stringArraySchema.optional(),
        build_ok: z.boolean().optional(),
        test_ok: z.boolean().optional(),
        requested_status: z.enum(["IMPLEMENTED", "PARTIAL", "BLOCKED"]).optional(),
        evidence_ids: stringArraySchema.optional(),
      }),
    }),
    factory_complete_task: z.object({ task_id: z.string(), role: roleSchema, verified_by: z.string() }),
    factory_reopen_task: z.object({ task_id: z.string(), reason: z.string() }),
    factory_start_cycle: z.object({
      command: z.enum(["plan", "init", "auto", "resume", "test", "review", "status", "doctor", "config"]),
      provider: z.enum(["claude-code", "codex", "local"]),
      phase: z.string(),
      task_ids: stringArraySchema.optional(),
    }),
    factory_finish_cycle: z.object({
      run_id: z.string(),
      cycle_seq: z.number().int().positive(),
      report: looseRecordSchema,
    }),
    factory_abort_cycle: z.object({ run_id: z.string().optional(), exit_reason: z.string(), reason: z.string().optional() }),
    factory_recover_stale_claims: z.object({ stale_minutes: z.number().positive().optional() }),
    factory_config_update: z.object({ automation: z.record(z.string(), z.boolean()).optional(), config: looseRecordSchema.optional() }),
    plan_get_next_questions: z.object({ max_questions: z.number().int().positive().optional() }),
    plan_submit_answers: z.object({ answers: looseRecordSchema, source: z.enum(["interactive", "mock"]).optional() }),
    plan_apply_mock_answers: z.object({ answers: looseRecordSchema.optional(), answers_path: z.string().optional() }),
    factory_test_prepare: z.object({ scenarios: z.array(looseRecordSchema).optional(), device_profiles: stringArraySchema.optional() }),
    factory_test_record_result: z.object({
      scenario_id: z.string(),
      device_profile: z.string(),
      checks: z.array(looseRecordSchema),
      screenshot_paths: stringArraySchema.optional(),
      logcat_path: z.string().optional(),
      notes: z.string().optional(),
    }),
    roadmap_parse: z.object({ items: z.array(looseRecordSchema), replace: z.boolean().optional() }),
    roadmap_get_items: z.object({ status: roadmapStatusSchema.optional(), priority: prioritySchema.optional() }),
    roadmap_update_status: z.object({
      item_id: z.string(),
      to: roadmapStatusSchema,
      role: roleSchema,
      evidence_ids: stringArraySchema.optional(),
      reason: z.string().optional(),
      task_id: z.string().optional(),
      criteria_updates: z.array(z.object({
        index: z.number().int().nonnegative(),
        satisfied: z.boolean(),
        evidence_ids: stringArraySchema.optional(),
      })).optional(),
    }),
    finding_create: z.object({
      severity: findingSeveritySchema,
      area: z.string(),
      title: z.string(),
      source: sourceSchema,
      status: findingStatusSchema.optional(),
      description: z.string().optional(),
      roadmap_item_id: z.string().optional(),
      task_id: z.string().optional(),
      location: looseRecordSchema.optional(),
      auto_fixable: z.boolean().optional(),
    }),
    finding_list: z.object({ status: findingStatusSchema.optional(), severity: findingSeveritySchema.optional(), area: z.string().optional() }),
    finding_resolve: z.object({ finding_id: z.string(), description: z.string(), evidence_ids: stringArraySchema, resolved_by_role: roleSchema }),
    finding_reopen: z.object({ finding_id: z.string(), reason: z.string() }),
    evidence_register: z.object({
      kind: z.string(),
      title: z.string().optional(),
      created_by: createdBySchema,
      roadmap_item_ids: stringArraySchema.optional(),
      task_id: z.string().optional(),
      summary: z.string().optional(),
      data: looseRecordSchema.optional(),
      source_paths: stringArraySchema.optional(),
      content_files: z.array(contentFileSchema).optional(),
    }),
    evidence_get: z.object({ evidence_id: z.string() }),
    evidence_validate: z.object({ evidence_id: z.string() }),
    gate_run: z.object({ gate_id: z.string(), release: z.boolean().optional() }),
    gate_get_result: z.object({ gate_id: z.string().optional(), run_id: z.string().optional() }),
    gate_run_all: z.object({ release: z.boolean().optional() }),
    dependency_request: z.object({ coordinates: z.string(), reason: z.string(), requested_by_task: z.string().optional() }),
    dependency_review_version: z.object({
      dependency_id: z.string(),
      approved_version: z.string(),
      compatible: z.boolean(),
      source_urls: stringArraySchema,
    }),
    dependency_review_license: z.object({
      dependency_id: z.string(),
      spdx: z.string(),
      source_urls: stringArraySchema,
    }),
    dependency_approve: z.object({ dependency_id: z.string(), role: z.string() }),
    dependency_reject: z.object({ dependency_id: z.string(), reason: z.string() }),
    approval_request: z.object({
      subject: z.string(),
      options: stringArraySchema,
      rationale: z.string(),
      risks: z.string(),
      recommendation: z.string(),
    }),
    approval_get_status: z.object({ approval_id: z.string() }),
    approval_decide: z.object({ approval_id: z.string(), approved: z.boolean(), decided_option: z.string().optional() }),
    placeholder_create: z.object({
      name: z.string(),
      kind: z.string(),
      description: z.string().optional(),
      recommended_value: z.string().optional(),
      temporary_value: z.string().optional(),
      importance: z.string().optional(),
      resolve_by: z.string().optional(),
      auto_proceed: z.boolean().optional(),
      release_blocking: z.boolean().optional(),
      locations: stringArraySchema.optional(),
    }),
    placeholder_resolve: z.object({ name: z.string(), resolved_value: z.string() }),
    capability_scan: z.object({
      installed_skills: stringArraySchema,
      installed_mcp_servers: stringArraySchema,
      installed_subagents: stringArraySchema,
    }),
    capability_record_environment: z.object({ checks: z.array(looseRecordSchema) }),
    capability_install_plan: z.object({
      selections: z.array(z.object({ id: z.string(), scope: z.enum(["global", "project"]) })),
      provider: z.enum(["claude-code", "codex"]),
    }),
    capability_mark_installed: z.object({
      id: z.string(),
      scope: z.enum(["global", "project"]),
      success: z.boolean(),
      apply_guidance: z.boolean().optional(),
      guidance_target_path: z.string().optional(),
    }),
    capability_mark_declined: z.object({ ids: stringArraySchema }),
    review_score: z.object({ results: z.record(z.string(), z.record(z.string(), z.enum(["pass", "fail", "n_a"]))) }),
    review_save_report: z.object({
      run_id: z.string(),
      before: looseRecordSchema,
      after: looseRecordSchema.optional(),
      plan: z.string().optional(),
    }),
    review_plan_fixes: z.object({ score: looseRecordSchema }),
    task_report_failure: z.object({ task_id: z.string(), error_message: z.string() }),
  };

  const tools: [string, string, z.ZodTypeAny, Handler][] = [
    // 공정
    ["factory_initialize", "상태 저장소 초기화 및 설정 스냅샷 저장", schemas.factory_initialize, factory.factoryInitialize as Handler],
    ["factory_get_status", "진행도·로드맵·finding·승인 상태 요약", z.object({}), factory.factoryGetStatus as Handler],
    ["factory_get_next_task", "결정론적 다음 작업 선택 (의존성·우선순위·승인 반영)", z.object({}), factory.factoryGetNextTask as Handler],
    ["factory_create_task", "작업 큐에 작업 등록", schemas.factory_create_task, factory.factoryCreateTask as Handler],
    ["factory_claim_task", "작업 클레임 (토큰 발급, 이중 클레임 거부)", schemas.factory_claim_task, factory.factoryClaimTask as Handler],
    ["factory_submit_result", "작업 결과 제출 (클레임 토큰 검증)", schemas.factory_submit_result, factory.factorySubmitResult as Handler],
    ["factory_complete_task", "작업 완료 처리 — verifier 전용", schemas.factory_complete_task, factory.factoryCompleteTask as Handler],
    ["factory_reopen_task", "완료·실패 작업 재개방", schemas.factory_reopen_task, factory.factoryReopenTask as Handler],
    ["factory_start_cycle", "사이클 시작 (run 생성·이어쓰기)", schemas.factory_start_cycle, factory.factoryStartCycle as Handler],
    ["factory_finish_cycle", "사이클 종료 — 진행 보고 4요소 기록", schemas.factory_finish_cycle, factory.factoryFinishCycle as Handler],
    ["factory_abort_cycle", "run 중단 종료 (exit_reason 기록)", schemas.factory_abort_cycle, factory.factoryAbortCycle as Handler],
    ["factory_recover_stale_claims", "stale 클레임 회수 (재개 절차)", schemas.factory_recover_stale_claims, factory.recoverStaleClaims as Handler],
    ["factory_config_get", "factory config 현재 체크박스 설정 조회", z.object({}), cfg.factoryConfigGet as Handler],
    ["factory_config_update", "factory config 체크박스 설정 저장 및 파생 설정 동기화", schemas.factory_config_update, cfg.factoryConfigUpdate as Handler],
    // plan 인터뷰
    ["plan_get_next_questions", "factory plan 인터뷰 다음 질문 묶음 조회", schemas.plan_get_next_questions, plan.planGetNextQuestions as Handler],
    ["plan_submit_answers", "factory plan 인터뷰 답변 저장 및 Placeholder 변환", schemas.plan_submit_answers, plan.planSubmitAnswers as Handler],
    ["plan_apply_mock_answers", "factory plan E2E용 모의 응답 주입", schemas.plan_apply_mock_answers, plan.planApplyMockAnswers as Handler],
    // factory test
    ["factory_test_prepare", "에뮬레이터 전수검사용 사용자 시나리오 체크리스트 생성 및 emulator 승인 기록", schemas.factory_test_prepare, ftest.factoryTestPrepare as Handler],
    ["factory_test_record_result", "factory test 시나리오 결과 기록, 실패 finding/fix 큐 자동 등록", schemas.factory_test_record_result, ftest.factoryTestRecordResult as Handler],
    ["factory_test_summary", "factory test 계획·결과·미해결 finding 요약", z.object({}), ftest.factoryTestSummary as Handler],
    // 로드맵
    ["roadmap_parse", "로드맵 항목 반입·검증 (JSON SSOT)", schemas.roadmap_parse, roadmap.roadmapParse as Handler],
    ["roadmap_get_items", "로드맵 항목 조회 (상태·우선순위 필터)", schemas.roadmap_get_items, roadmap.roadmapGetItems as Handler],
    ["roadmap_update_status", "상태 전이 — 전이 테이블·role·증거 검증", schemas.roadmap_update_status, roadmap.roadmapUpdateStatus as Handler],
    ["roadmap_validate_traceability", "추적성 검증 — 누락·순환 목록", z.object({}), roadmap.roadmapValidateTraceability as Handler],
    ["roadmap_render_markdown", "ROADMAP.md 렌더링 (파생물)", z.object({}), roadmap.roadmapRenderMarkdown as Handler],
    // 발견·증거
    ["finding_create", "발견 사항 등록", schemas.finding_create, fe.findingCreate as Handler],
    ["finding_list", "발견 사항 조회", schemas.finding_list, fe.findingList as Handler],
    ["finding_resolve", "발견 사항 해결 — 증거 필수", schemas.finding_resolve, fe.findingResolve as Handler],
    ["finding_reopen", "발견 사항 재개방", schemas.finding_reopen, fe.findingReopen as Handler],
    ["evidence_register", "증거 등록 (파일 복사·해시)", schemas.evidence_register, fe.evidenceRegister as Handler],
    ["evidence_get", "증거 메타데이터 조회", schemas.evidence_get, fe.evidenceGet as Handler],
    ["evidence_validate", "증거 무결성 검증 (존재·해시)", schemas.evidence_validate, fe.evidenceValidate as Handler],
    // 게이트
    ["gate_run", "게이트 실행 (command/check) — 결과 증거 자동 등록", schemas.gate_run, gate.gateRun as Handler],
    ["gate_get_result", "게이트 실행 이력 조회", schemas.gate_get_result, gate.gateGetResult as Handler],
    ["gate_run_all", "전체 게이트 실행 — 자동 종료 조건 판정", schemas.gate_run_all, gate.gateRunAll as Handler],
    // 의존성
    ["dependency_request", "라이브러리 추가 요청 생성", schemas.dependency_request, dep.dependencyRequest as Handler],
    ["dependency_review_version", "버전 검토 기록 (stable-only 재판정)", schemas.dependency_review_version, dep.dependencyReviewVersion as Handler],
    ["dependency_review_license", "라이선스 검토 기록 (SPDX 정책 재판정)", schemas.dependency_review_license, dep.dependencyReviewLicense as Handler],
    ["dependency_approve", "의존성 승인 — 양 검토 통과 시, 후속 작업 자동 등록", schemas.dependency_approve, dep.dependencyApprove as Handler],
    ["dependency_reject", "의존성 거부", schemas.dependency_reject, dep.dependencyReject as Handler],
    // 승인·Placeholder
    ["approval_request", "승인 요청 (선택지·근거·위험·추천안)", schemas.approval_request, ap.approvalRequest as Handler],
    ["approval_get_status", "승인 상태 조회 (폴링)", schemas.approval_get_status, ap.approvalGetStatus as Handler],
    ["approval_decide", "사용자 결정 기록 (어댑터 호출)", schemas.approval_decide, ap.approvalDecide as Handler],
    ["placeholder_create", "Placeholder 등록 (종류별 기본 속성 적용)", schemas.placeholder_create, ap.placeholderCreate as Handler],
    ["placeholder_resolve", "Placeholder 해결", schemas.placeholder_resolve, ap.placeholderResolve as Handler],
    ["placeholder_list", "Placeholder 전체 조회", z.object({}), ap.placeholderList as Handler],
    ["placeholder_list_blocking", "릴리스 차단 Placeholder 조회", z.object({}), ap.placeholderListBlocking as Handler],
    // 역량
    ["capability_scan", "설치 역량 대조 (어댑터 탐지 결과 입력)", schemas.capability_scan, cap.capabilityScan as Handler],
    ["capability_record_environment", "설치 환경 점검 결과 기록 및 부족분 사용자 안내 생성", schemas.capability_record_environment, cap.capabilityRecordEnvironment as Handler],
    ["capability_list_missing", "미설치 역량 목록", z.object({}), cap.capabilityListMissing as Handler],
    ["capability_install_plan", "설치 계획 생성 (스코프·Provider별 명령)", schemas.capability_install_plan, cap.capabilityInstallPlan as Handler],
    ["capability_mark_installed", "설치 결과 기록", schemas.capability_mark_installed, cap.capabilityMarkInstalled as Handler],
    ["capability_mark_declined", "거절 항목 기록 (반복 제안 금지)", schemas.capability_mark_declined, cap.capabilityMarkDeclined as Handler],
    ["capability_get_status", "역량 상태 조회", z.object({}), cap.capabilityGetStatus as Handler],
    // review 점수화
    ["review_score", "배점표 기반 영역별 점수·격차 산정 (3.16)", schemas.review_score, reviewScore as Handler],
    ["review_save_report", "review 리포트 저장 (전/후 비교)", schemas.review_save_report, reviewSaveReport as Handler],
    ["review_plan_fixes", "review 실패 항목을 안전 자동수정 후보와 사용자 판단 항목으로 분류", schemas.review_plan_fixes, reviewPlanFixes as Handler],
    // 오케스트레이션
    ["orchestrator_decide_next", "상태 기반 다음 행동 결정 (결정론적)", z.object({}), decideNextAction as Handler],
    ["task_report_failure", "작업 실패 보고 — 재시도 정책 적용 (재큐/차단+승인요청)", schemas.task_report_failure, handleTaskFailure as Handler],
    ["factory_progress_report", "턴 종료 진행 보고 4요소 생성 (3.15)", z.object({}), ((c: Ctx) => {
      const r = buildProgressReport(c);
      return { ...r, rendered: renderProgressReport(r) };
    }) as unknown as Handler],
  ];

  for (const [name, description, schema, handler] of tools) {
    server.tool(name, description, schema instanceof z.ZodObject ? schema.shape : {}, wrap(ctx, handler));
  }
  return server;
}

async function main(): Promise<void> {
  const { projectRoot, coreDir } = parseArgs(process.argv.slice(2));
  const ctx = createContext(projectRoot, coreDir);
  const server = buildServer(ctx);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`app-factory-core 기동 — project: ${projectRoot}`);
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  main().catch((e) => {
    console.error("서버 기동 실패:", e);
    process.exit(1);
  });
}
