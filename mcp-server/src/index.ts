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
import { decideNextAction, handleTaskFailure } from "./orchestrator.js";
import { reviewScore, reviewSaveReport } from "./tools/review.js";
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

export function buildServer(ctx: Ctx): McpServer {
  const server = new McpServer({ name: "app-factory-core", version: "0.1.0" });
  const any = z.record(z.string(), z.unknown());

  const tools: [string, string, z.ZodTypeAny, Handler][] = [
    // 공정
    ["factory_initialize", "상태 저장소 초기화 및 설정 스냅샷 저장", any, factory.factoryInitialize as Handler],
    ["factory_get_status", "진행도·로드맵·finding·승인 상태 요약", z.object({}), factory.factoryGetStatus as Handler],
    ["factory_get_next_task", "결정론적 다음 작업 선택 (의존성·우선순위·승인 반영)", z.object({}), factory.factoryGetNextTask as Handler],
    ["factory_create_task", "작업 큐에 작업 등록", any, factory.factoryCreateTask as Handler],
    ["factory_claim_task", "작업 클레임 (토큰 발급, 이중 클레임 거부)", any, factory.factoryClaimTask as Handler],
    ["factory_submit_result", "작업 결과 제출 (클레임 토큰 검증)", any, factory.factorySubmitResult as Handler],
    ["factory_complete_task", "작업 완료 처리 — verifier 전용", any, factory.factoryCompleteTask as Handler],
    ["factory_reopen_task", "완료·실패 작업 재개방", any, factory.factoryReopenTask as Handler],
    ["factory_start_cycle", "사이클 시작 (run 생성·이어쓰기)", any, factory.factoryStartCycle as Handler],
    ["factory_finish_cycle", "사이클 종료 — 진행 보고 4요소 기록", any, factory.factoryFinishCycle as Handler],
    ["factory_abort_cycle", "run 중단 종료 (exit_reason 기록)", any, factory.factoryAbortCycle as Handler],
    ["factory_recover_stale_claims", "stale 클레임 회수 (재개 절차)", any, factory.recoverStaleClaims as Handler],
    // 로드맵
    ["roadmap_parse", "로드맵 항목 반입·검증 (JSON SSOT)", any, roadmap.roadmapParse as Handler],
    ["roadmap_get_items", "로드맵 항목 조회 (상태·우선순위 필터)", any, roadmap.roadmapGetItems as Handler],
    ["roadmap_update_status", "상태 전이 — 전이 테이블·role·증거 검증", any, roadmap.roadmapUpdateStatus as Handler],
    ["roadmap_validate_traceability", "추적성 검증 — 누락·순환 목록", z.object({}), roadmap.roadmapValidateTraceability as Handler],
    ["roadmap_render_markdown", "ROADMAP.md 렌더링 (파생물)", z.object({}), roadmap.roadmapRenderMarkdown as Handler],
    // 발견·증거
    ["finding_create", "발견 사항 등록", any, fe.findingCreate as Handler],
    ["finding_list", "발견 사항 조회", any, fe.findingList as Handler],
    ["finding_resolve", "발견 사항 해결 — 증거 필수", any, fe.findingResolve as Handler],
    ["finding_reopen", "발견 사항 재개방", any, fe.findingReopen as Handler],
    ["evidence_register", "증거 등록 (파일 복사·해시)", any, fe.evidenceRegister as Handler],
    ["evidence_get", "증거 메타데이터 조회", any, fe.evidenceGet as Handler],
    ["evidence_validate", "증거 무결성 검증 (존재·해시)", any, fe.evidenceValidate as Handler],
    // 게이트
    ["gate_run", "게이트 실행 (command/check) — 결과 증거 자동 등록", any, gate.gateRun as Handler],
    ["gate_get_result", "게이트 실행 이력 조회", any, gate.gateGetResult as Handler],
    ["gate_run_all", "전체 게이트 실행 — 자동 종료 조건 판정", any, gate.gateRunAll as Handler],
    // 의존성
    ["dependency_request", "라이브러리 추가 요청 생성", any, dep.dependencyRequest as Handler],
    ["dependency_review_version", "버전 검토 기록 (stable-only 재판정)", any, dep.dependencyReviewVersion as Handler],
    ["dependency_review_license", "라이선스 검토 기록 (SPDX 정책 재판정)", any, dep.dependencyReviewLicense as Handler],
    ["dependency_approve", "의존성 승인 — 양 검토 통과 시, 후속 작업 자동 등록", any, dep.dependencyApprove as Handler],
    ["dependency_reject", "의존성 거부", any, dep.dependencyReject as Handler],
    // 승인·Placeholder
    ["approval_request", "승인 요청 (선택지·근거·위험·추천안)", any, ap.approvalRequest as Handler],
    ["approval_get_status", "승인 상태 조회 (폴링)", any, ap.approvalGetStatus as Handler],
    ["approval_decide", "사용자 결정 기록 (어댑터 호출)", any, ap.approvalDecide as Handler],
    ["placeholder_create", "Placeholder 등록 (종류별 기본 속성 적용)", any, ap.placeholderCreate as Handler],
    ["placeholder_resolve", "Placeholder 해결", any, ap.placeholderResolve as Handler],
    ["placeholder_list", "Placeholder 전체 조회", z.object({}), ap.placeholderList as Handler],
    ["placeholder_list_blocking", "릴리스 차단 Placeholder 조회", z.object({}), ap.placeholderListBlocking as Handler],
    // 역량
    ["capability_scan", "설치 역량 대조 (어댑터 탐지 결과 입력)", any, cap.capabilityScan as Handler],
    ["capability_list_missing", "미설치 역량 목록", z.object({}), cap.capabilityListMissing as Handler],
    ["capability_install_plan", "설치 계획 생성 (스코프·Provider별 명령)", any, cap.capabilityInstallPlan as Handler],
    ["capability_mark_installed", "설치 결과 기록", any, cap.capabilityMarkInstalled as Handler],
    ["capability_mark_declined", "거절 항목 기록 (반복 제안 금지)", any, cap.capabilityMarkDeclined as Handler],
    ["capability_get_status", "역량 상태 조회", z.object({}), cap.capabilityGetStatus as Handler],
    // review 점수화
    ["review_score", "배점표 기반 영역별 점수·격차 산정 (3.16)", any, reviewScore as Handler],
    ["review_save_report", "review 리포트 저장 (전/후 비교)", any, reviewSaveReport as Handler],
    // 오케스트레이션
    ["orchestrator_decide_next", "상태 기반 다음 행동 결정 (결정론적)", z.object({}), decideNextAction as Handler],
    ["task_report_failure", "작업 실패 보고 — 재시도 정책 적용 (재큐/차단+승인요청)", any, handleTaskFailure as Handler],
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
