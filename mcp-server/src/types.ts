// 코어 엔티티 타입 — core/schemas/*.schema.json과 1:1 대응.
// 스키마가 SSOT이며 이 타입은 구현 편의를 위한 사본이다. 필드 추가 시 스키마 먼저.

export type RoadmapStatus =
  | "NOT_STARTED"
  | "IN_PROGRESS"
  | "PARTIAL"
  | "IMPLEMENTED"
  | "VERIFIED"
  | "BLOCKED"
  | "NEEDS_HUMAN_DECISION";

export type Role = "orchestrator" | "worker" | "verifier" | "auditor" | "user" | "system";

export type VerifiableBy = "code" | "test" | "build" | "emulator" | "manual";

export interface Criterion {
  description: string;
  verifiable_by: VerifiableBy;
  satisfied?: boolean;
  evidence_ids?: string[];
}

export interface Transition {
  from: RoadmapStatus;
  to: RoadmapStatus;
  role: Role;
  at: string;
  reason?: string;
  task_id?: string;
  evidence_ids?: string[];
}

export interface RoadmapItem {
  version: 1;
  id: string;
  title: string;
  requirement: string;
  implementation_scope: string;
  completion_criteria: Criterion[];
  test_criteria?: Criterion[];
  runtime_verification_criteria?: Criterion[];
  depends_on: string[];
  priority: "P0" | "P1" | "P2";
  risk: "low" | "medium" | "high";
  status: RoadmapStatus;
  feature_grade?: "CORE" | "SUPPORTING" | "OPTIONAL";
  placeholder_refs?: string[];
  evidence_ids?: string[];
  status_history?: Transition[];
  notes?: string;
}

export type TaskStatus =
  | "queued"
  | "claimed"
  | "in_progress"
  | "submitted"
  | "completed"
  | "failed"
  | "cancelled"
  | "blocked";

export type TaskType =
  | "implement"
  | "verify"
  | "fix"
  | "audit"
  | "gate"
  | "research"
  | "dependency_review"
  | "license_review"
  | "doc"
  | "emulator_qa";

export interface TaskClaim {
  role: Exclude<Role, "user" | "system">;
  agent: string;
  token: string;
  at: string;
}

export interface TaskResult {
  summary: string;
  changed_files?: string[];
  build_ok?: boolean;
  test_ok?: boolean;
  requested_status?: "IMPLEMENTED" | "PARTIAL" | "BLOCKED";
  evidence_ids?: string[];
  submitted_at: string;
}

export interface Task {
  version: 1;
  id: string;
  type: TaskType;
  title: string;
  description?: string;
  roadmap_item_id?: string;
  finding_id?: string;
  status: TaskStatus;
  priority?: "P0" | "P1" | "P2";
  depends_on?: string[];
  dangerous?: string[];
  claim?: TaskClaim;
  attempts: number;
  max_attempts: number;
  last_error?: { message: string; normalized: string; at: string };
  result?: TaskResult;
  created_at: string;
  updated_at?: string;
}

export type FindingStatus =
  | "open"
  | "in_fix"
  | "resolved"
  | "reopened"
  | "needs_human_decision"
  | "wont_fix";

export interface Finding {
  version: 1;
  id: string;
  severity: "blocker" | "major" | "minor";
  area: string;
  title: string;
  description?: string;
  source: { kind: "agent" | "gate" | "skill" | "user"; name: string; run_id?: string };
  roadmap_item_id?: string;
  task_id?: string;
  location?: { file?: string; line?: number; symbol?: string };
  status: FindingStatus;
  auto_fixable?: boolean;
  fix_task_id?: string;
  resolution?: {
    description: string;
    evidence_ids: string[];
    resolved_at: string;
    resolved_by_role?: "worker" | "verifier" | "auditor" | "user";
  };
  history?: { from: string; to: string; at: string; reason?: string }[];
  created_at: string;
  updated_at?: string;
}

export interface ProgressReport {
  summary: string;
  goals: string;
  next: { task_id?: string; description: string };
  progress_pct: number;
}

export interface RunCycle {
  seq: number;
  phase: string;
  task_ids?: string[];
  started_at?: string;
  ended_at?: string;
  report: ProgressReport;
}

export interface Run {
  version: 1;
  id: string;
  command: "config" | "plan" | "init" | "auto" | "resume" | "review" | "status" | "doctor";
  provider: "claude-code" | "codex" | "cli";
  resumed_from_run_id?: string;
  status: "running" | "finished";
  exit_reason?: "completed" | "forced_stop" | "limit_exceeded" | "user_abort" | "error";
  cycles?: RunCycle[];
  pending_decisions?: { subject: string; summary: string; blocking_critical_path?: boolean }[];
  started_at: string;
  ended_at?: string;
}

export interface Placeholder {
  version: 1;
  name: string;
  kind: string;
  importance: "critical" | "high" | "normal";
  resolve_by: "before_init" | "before_implementation" | "before_release" | "anytime";
  auto_proceed: boolean;
  release_blocking: boolean;
  description?: string;
  recommended_value?: string;
  temporary_value?: string;
  status: "unresolved" | "resolved" | "temporary";
  resolved_value?: string;
  resolved_at?: string;
  locations?: string[];
  created_at: string;
  updated_at?: string;
}

export interface EvidenceMeta {
  version: 1;
  id: string;
  kind: string;
  title?: string;
  created_by: { role: string; name: string; run_id?: string };
  roadmap_item_ids?: string[];
  task_id?: string;
  files?: { path: string; sha256: string; truncated?: boolean; original_size_bytes?: number }[];
  summary?: string;
  data?: Record<string, unknown>;
  created_at: string;
}

export interface Approval {
  version: 1;
  id: string;
  subject: string;
  options: string[];
  rationale: string;
  risks: string;
  recommendation: string;
  status: "pending" | "approved" | "rejected";
  decided_option?: string;
  decided_at?: string;
  created_at: string;
}

export interface Counters {
  version: 1;
  task: number;
  finding: number;
  evidence: number;
  approval: number;
  run_date: string;
  run_seq: number;
}
