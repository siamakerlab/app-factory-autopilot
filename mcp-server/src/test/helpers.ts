// 테스트 공통 헬퍼 — 임시 프로젝트 + 실제 core 정책으로 컨텍스트 구성.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { createContext, type Ctx } from "../context.js";
import type { RoadmapItem } from "../types.js";

export function coreDir(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  // dist/test → mcp-server → 저장소 루트/core
  return path.join(here, "..", "..", "..", "core");
}

export function makeCtx(): { ctx: Ctx; projectRoot: string; cleanup: () => void } {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "afa-test-"));
  const ctx = createContext(projectRoot, coreDir());
  ctx.store.initialize();
  return {
    ctx,
    projectRoot,
    cleanup: () => fs.rmSync(projectRoot, { recursive: true, force: true }),
  };
}

export function sampleItem(overrides: Partial<RoadmapItem> = {}): RoadmapItem {
  return {
    version: 1,
    id: "RM-001",
    title: "테스트 항목",
    requirement: "요구사항",
    implementation_scope: "범위",
    completion_criteria: [{ description: "구현 존재", verifiable_by: "code" }],
    depends_on: [],
    priority: "P0",
    risk: "low",
    status: "NOT_STARTED",
    ...overrides,
  };
}
