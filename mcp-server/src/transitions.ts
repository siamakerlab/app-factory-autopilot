// 상태 머신 전이 강제 (AFA-021) — core/workflow/transitions.yaml이 SSOT.
// 여기 정의되지 않은 전이는 전부 거부. worker→VERIFIED 조합은 테이블에 존재하지 않는다.

import * as fs from "node:fs";
import * as path from "node:path";
import { parse as parseYaml } from "yaml";
import type { Criterion, RoadmapItem, RoadmapStatus, Role } from "./types.js";
import { ToolError } from "./errors.js";

export interface TransitionRule {
  from: RoadmapStatus;
  to: RoadmapStatus;
  roles: Role[];
  requires?: ("evidence" | "all_criteria_satisfied" | "submitted_result")[];
  note?: string;
}

export class TransitionTable {
  private rules: TransitionRule[];

  constructor(rules: TransitionRule[]) {
    this.rules = rules;
  }

  static loadFromFile(yamlPath: string): TransitionTable {
    const doc = parseYaml(fs.readFileSync(yamlPath, "utf-8")) as {
      version: number;
      transitions: TransitionRule[];
    };
    if (doc.version !== 1) {
      throw new ToolError("VERSION_UNSUPPORTED", `transitions.yaml 버전 미지원: ${doc.version}`);
    }
    return new TransitionTable(doc.transitions);
  }

  /** 기본 탐색 경로: coreDir/workflow/transitions.yaml */
  static loadFromCoreDir(coreDir: string): TransitionTable {
    return TransitionTable.loadFromFile(path.join(coreDir, "workflow", "transitions.yaml"));
  }

  findRule(from: RoadmapStatus, to: RoadmapStatus): TransitionRule | undefined {
    return this.rules.find((r) => r.from === from && r.to === to);
  }

  /**
   * 전이 검증. 통과하지 못하면 ToolError를 던진다.
   * VERIFIED 진입은 verifier + 증거 + 완료 조건 전 항목 충족을 요구한다.
   */
  validate(
    item: RoadmapItem,
    to: RoadmapStatus,
    role: Role,
    opts: { evidence_ids?: string[]; has_submitted_result?: boolean } = {},
  ): TransitionRule {
    const rule = this.findRule(item.status, to);
    if (!rule) {
      throw new ToolError(
        "TRANSITION_FORBIDDEN",
        `허용되지 않은 전이: ${item.id} ${item.status} → ${to}`,
      );
    }
    if (!rule.roles.includes(role)) {
      throw new ToolError(
        "ROLE_FORBIDDEN",
        `role '${role}'은(는) ${item.status} → ${to} 전이를 수행할 수 없습니다`,
      );
    }
    for (const req of rule.requires ?? []) {
      if (req === "evidence") {
        if (!opts.evidence_ids || opts.evidence_ids.length === 0) {
          throw new ToolError(
            "EVIDENCE_REQUIRED",
            `${item.id}: ${to} 전이에는 증거(evidence_ids)가 1건 이상 필요합니다`,
          );
        }
      } else if (req === "all_criteria_satisfied") {
        const unsatisfied = collectUnsatisfied(item.completion_criteria);
        if (unsatisfied.length > 0) {
          throw new ToolError(
            "CRITERIA_UNSATISFIED",
            `${item.id}: 완료 조건 미충족 ${unsatisfied.length}건 — ${unsatisfied
              .map((c) => c.description)
              .join(" / ")}`,
          );
        }
      } else if (req === "submitted_result") {
        if (!opts.has_submitted_result) {
          throw new ToolError(
            "INVALID_INPUT",
            `${item.id}: ${to} 전이에는 제출된 작업 결과(result)가 필요합니다`,
          );
        }
      }
    }
    return rule;
  }
}

function collectUnsatisfied(criteria: Criterion[]): Criterion[] {
  return criteria.filter((c) => c.satisfied !== true);
}
