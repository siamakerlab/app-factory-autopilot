# CHANGELOG

## [Unreleased]

### 2026-08-05

- 프로젝트 저장소 초기화 (git init, 디렉터리 골격 생성)
- 원본 통합 설계서(`mvp.txt`) 기반 공식 MVP-1 명세서(`MVP-1.md`) 작성
  - 통합 설계서 21장 "MVP 0.1 범위"를 MVP-1 공식 범위로 채택
  - MVP-2~5 및 1.0 이연 항목 명시 (설계서 22~26장 매핑)
  - Official Docs Indexer 고도화는 MVP-2로, `skill_discover` 계열 MCP 도구는
    MVP-4로 이연 결정
- 사용자 결정으로 명령 체계를 4개 필수 명령으로 확정 (원본 설계서의
  plan/go/review 3종에서 확장)
  - `factory plan` / `factory init` / `factory auto` / `factory review`
  - `factory init`은 기존 프로젝트에 App Factory Autopilot을 도입할 때
    코드베이스를 분석하는 용도
  - `factory auto`는 현재 프로젝트 진행 상태를 분석하고 알아서 진행
    (원본 설계서의 `factory go`는 `auto`의 호환 별칭으로 유지)
- README.md, CHANGELOG.md, .gitignore 작성
