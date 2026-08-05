// 구조화 오류 — 모든 도구는 실패 시 { code, message, recoverable }를 반환한다 (M2 공통 지침).

export type ErrorCode =
  | "NOT_FOUND"
  | "INVALID_INPUT"
  | "SCHEMA_VIOLATION"
  | "ALREADY_CLAIMED"
  | "CLAIM_TOKEN_MISMATCH"
  | "ROLE_FORBIDDEN"
  | "TRANSITION_FORBIDDEN"
  | "EVIDENCE_REQUIRED"
  | "CRITERIA_UNSATISFIED"
  | "DEPENDENCY_UNRESOLVED"
  | "LOCK_TIMEOUT"
  | "GATE_FAILED"
  | "APPROVAL_REQUIRED"
  | "LIMIT_EXCEEDED"
  | "STORE_CORRUPTED"
  | "VERSION_UNSUPPORTED"
  | "INTERNAL";

export class ToolError extends Error {
  readonly code: ErrorCode;
  readonly recoverable: boolean;

  constructor(code: ErrorCode, message: string, recoverable = false) {
    super(message);
    this.name = "ToolError";
    this.code = code;
    this.recoverable = recoverable;
  }

  toJSON() {
    return { code: this.code, message: this.message, recoverable: this.recoverable };
  }
}
