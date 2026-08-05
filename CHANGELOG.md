# CHANGELOG

## [Unreleased]

### 2026-08-05 (3차)

- MVP-1.md 기반 정식 개발 로드맵 `ROADMAP.md` 작성
  - MVP-1의 상태 머신(NOT_STARTED~VERIFIED 7상태)을 프로젝트 자체 로드맵에
    적용 (도그푸딩) — 완료/부분구현/미구현 상태 표시 및 갱신 절차 정의
  - 마일스톤 M0(선행 결정)~M6(검증·통합), 작업 36개 (결정 2 + 구현 34)
  - 각 항목에 근거(MVP-1 절), 의존성, 우선순위, 위험도, 완료 조건 체크리스트,
    실질 구현 지침 기록
  - 선행 결정 2건 등록: D-001 구현 언어·런타임(추천: TypeScript + Node 20),
    D-002 스킬 카탈로그 설치 소스 — 상태 `NEEDS_HUMAN_DECISION`

### 2026-08-05 (2차)

- 사용자 요구로 Capability Doctor 기능을 MVP-1 범위에 추가 (MVP-1.md 3.14)
  - Android 개발 필수 스킬·MCP·서브에이전트 미설치 시 사용자 확인 후 일괄
    설치 제안 (체크리스트 선택 + 전역/프로젝트 스코프 선택)
  - `factory doctor` 보조 명령 및 plan/init/auto 프리플라이트 점검 추가
  - MCP 도구 `capability_*` 5종, Skill `factory-doctor`·`capability-audit` 추가
  - 사용자 확인 없는 자동 설치 금지, API 키 필요 MCP는 기본 required 지정
    금지 원칙 명시
- 역량 카탈로그 SSOT 작성: `core/policies/capability-catalog.yaml`
  (스킬 40종 8개 카테고리, MCP 서버 8종, 서브에이전트 5종)
- 완료 기준(DoD) 12번 항목 추가

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
