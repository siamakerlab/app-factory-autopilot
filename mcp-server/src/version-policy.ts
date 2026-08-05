// 버전 정책: Stable-only 판정 (AFA-023).
// 방식: pre-release 마커 블랙리스트 + 동적 버전 탐지 + 숫자·점 구성 검사.
// 판정 불가 문자열은 manual(수동 확인)로 분류한다 — 자동 통과 금지.

export type VersionVerdict = "stable" | "prerelease" | "dynamic" | "manual";

const PRERELEASE_MARKERS =
  /(alpha|beta|rc|preview|canary|nightly|snapshot|dev|milestone|\bm\d+\b|eap|cr\d*)/i;

const DYNAMIC_PATTERNS = [
  /\+/, // 1.2.+
  /^latest/i, // latest.release, latest.integration
  /^[\[\(].*[\]\)]$/, // maven range [1.0,2.0)
];

export function classifyVersion(version: string): VersionVerdict {
  const v = version.trim();
  if (v === "") return "manual";
  for (const p of DYNAMIC_PATTERNS) {
    if (p.test(v)) return "dynamic";
  }
  if (PRERELEASE_MARKERS.test(v)) return "prerelease";
  // 안정 버전으로 인정하는 최소 구성: 숫자로 시작, 숫자·점(·선택적 숫자 접미)로만 구성
  if (/^\d+(\.\d+)*([._-]\d+)*$/.test(v)) return "stable";
  return "manual";
}

export function isAllowedWithoutApproval(version: string): boolean {
  return classifyVersion(version) === "stable";
}
