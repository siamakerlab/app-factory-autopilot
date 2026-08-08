---
name: dependency-version-review
description: 의존성 버전 검토 — 공식 문서에서 최신 안정화 버전·호환성 확인
kind: process
uses_agents: [dependency-version-manager]
---

# dependency-version-review

1. 대기 중인 Dependency Request마다 Dependency Version Manager를 호출한다.
2. Agent가 공식 문서에서 최신 안정화 버전과 호환성(Kotlin/AGP/Gradle/JDK/
   SDK/Compose BOM)을 확인하고 `dependency_review_version`에 근거 URL과
   함께 제출한다. 확인 우선순위는 mobile docs MCP → context7(설치된 경우)
   → 공식 웹페이지 직접 확인이다.
   Gradle 자체는 `scripts/resolve-gradle-version.mjs`로 공식
   `https://services.gradle.org/versions/current` 응답을 확인해 wrapper
   버전과 distribution SHA-256을 채우고 최신 안정화 확인 결과를 캐시한다.
   캐시는 재확인 결과 보존용이며, 공식 확인 실패 시 구버전 fallback을 선택하는
   근거가 아니다.
   사용자 메시지는 "최신 안정화 버전이 <version>로 업데이트되었습니다.
   다운로드 후 진행합니다."처럼 최신 확인·갱신·진행 기준으로 표현한다.
   "최신 버전이 없어 캐시된 <old>를 사용합니다" 같은 메시지는 금지한다.
3. stable이 아닌 버전은 자동 불통과 — 사용자 승인 경로(approval_request)
   외에는 진행 불가.
4. 마이그레이션 필요 사항은 DEPENDENCY_MIGRATIONS.md 갱신 작업으로 등록한다.
