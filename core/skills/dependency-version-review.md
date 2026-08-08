---
name: dependency-version-review
description: 의존성 버전 검토 — 공식 문서에서 최신 안정화 버전·호환성 확인
kind: process
uses_agents: [dependency-version-manager]
---

# dependency-version-review

1. 대기 중인 Dependency Request마다 Dependency Version Manager를 호출한다.
2. Agent가 공식 문서(context7/mobile-docs MCP 또는 공식 릴리스 페이지)에서
   최신 안정화 버전과 호환성(Kotlin/AGP/Gradle/JDK/SDK/Compose BOM)을
   확인하고 `dependency_review_version`에 근거 URL과 함께 제출한다.
   Gradle 자체는 `scripts/resolve-gradle-version.mjs`로 공식
   `https://services.gradle.org/versions/current` 응답을 확인해 wrapper
   버전과 distribution SHA-256을 채운다.
3. stable이 아닌 버전은 자동 불통과 — 사용자 승인 경로(approval_request)
   외에는 진행 불가.
4. 마이그레이션 필요 사항은 DEPENDENCY_MIGRATIONS.md 갱신 작업으로 등록한다.
