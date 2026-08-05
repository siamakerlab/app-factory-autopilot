---
name: placeholder-audit
description: Placeholder 잔존 스캔 — 정규식 단일 기준, 릴리스 차단 목록 갱신
kind: process
---

# placeholder-audit

1. 정규식 `\$\{PLACEHOLDER_[A-Z0-9_]+\}` 하나로 코드·리소스·설정 전체를
   스캔한다 (placeholder-policy.yaml SSOT).
2. 발견 위치를 각 Placeholder의 locations에 갱신한다. 등록되지 않은
   Placeholder 발견 시 `placeholder_create`로 등록한다 (kind 추정 + 확인).
3. `placeholder_list_blocking`으로 릴리스 차단 목록을 갱신·보고한다.
4. 릴리스 빌드 산출물(APK/AAB) 검사 시: Placeholder 문자열 잔존 또는
   테스트 광고 ID 잔존 → blocker finding (Placeholder 게이트 차단).
5. PLACEHOLDERS.md를 갱신한다 (상태·차단 여부·해결 시점별 정렬).
