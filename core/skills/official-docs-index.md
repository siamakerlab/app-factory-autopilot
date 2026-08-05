---
name: official-docs-index
description: 공식 문서 인덱싱 (MVP-1 기본 수준) — 사용 라이브러리의 공식 문서·Deprecated 기록
kind: process
---

# official-docs-index (기본 수준)

1. 프로젝트에서 사용 중이거나 사용 예정인 라이브러리를 Version Catalog와
   로드맵에서 수집한다.
2. 각 라이브러리의 공식 문서·공식 릴리스 정보를 확인한다 (context7 /
   mobile-docs MCP 우선, 없으면 공식 사이트). 공식 문서가 확인되지 않으면
   임의로 결론 내리지 않고 "미확인"으로 기록한다.
3. DOCS_INDEX.md를 갱신한다: 라이브러리, 공식 문서 URL, 최신 안정 버전,
   Deprecated API·마이그레이션 요구사항.
4. 고도화(문서 캐시·호환성 매트릭스·Deprecated 자동 탐지)는 MVP-2 범위 —
   여기서 구현하지 않는다.
