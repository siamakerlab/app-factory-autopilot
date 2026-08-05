# CHANGELOG

## [Unreleased]

### 2026-08-05 (11차) — M4 완료 (구현 제출), 테스트 58건 통과

- AFA-035 🟧: project-template — plan 산출물 17종 mustache 템플릿 + Android
  스캐폴드 8종 (Version Catalog, 외부 키스토어 SSOT 참조·부재 시 릴리스
  차단, 디버그 .debug suffix, 버전은 생성 시점 채움). 🟧 사유:
  "치환 후 assembleDebug 성공" 조건은 Android SDK 환경에서만 검증 가능
- AFA-036 🟦: review_score·review_save_report MCP 도구 — 배점표 가중 합산,
  n_a 분모 제외, 미검사=fail 원칙, 전/후 비교 리포트 저장 (테스트 3건)
- AFA-033 🟧: Doctor 코어(점검·계획·거절 기록·guidance_doc 마커 규약) 완료
  — 설치 실행·관리문서 반영은 어댑터(M5)에서 연결
- MCP 도구 50개로 확대

### 2026-08-05 (10차) — M3 코어 완료 (구현 제출), 테스트 55건 통과

- AFA-020 🟦: `phases.yaml` 9단계 + 결정론적 오케스트레이터
  (`orchestrator.ts`) — 상태 저장소 기반 entry/done 판정기 17종, LLM 비호출,
  재실행 시 동일 지점 재개(멱등) 테스트 증명
- AFA-024 🟦: `limits.yaml` + 동일 오류 정규화(경로·숫자 마스킹) +
  `handleTaskFailure` — 한도 내 재큐, 초과 시 blocked + 선택지·근거·위험·
  추천안 승인 요청 자동 생성
- AFA-025 🟦: 진행 보고 생성기(`report.ts`) — 4요소를 상태 저장소만으로
  생성, 다음 턴 예정 = factory_get_next_task 결과 (보고≡행동)
- AFA-026 🟦: 무중단 드라이버(`driver.ts`) — 종료 조건 3종(완료·강제 중단·
  한도 초과), 질문 지연·pending_decisions 일괄 보고, 무진전 정체 감지.
  테스트: 시뮬레이터 executor로 빈 프로젝트→완료 게이트 무중단 완주,
  중단 후 재실행 시 완료 작업 건너뛰기(DoD 9), 사이클별 3.15 보고 기록
  (DoD 13) 증명
- AFA-050 🟧→🟦: task_report_failure 도구로 재시도 정책 연결 완성
- MCP 도구 3종 추가 (orchestrator_decide_next, task_report_failure,
  factory_progress_report) — 총 48개

### 2026-08-05 (9차) — M2 MCP 서버 구현 제출

- `mcp-server/` TypeScript(Node 20+) 구현 — 45개 도구 등록, stdio 프로토콜
  스모크 테스트(initialize + tools/list) 통과, 단위 테스트 47건 전체 통과
- AFA-010 🟦: 서버 골격 (StateStore 캡슐화, projectRoot 기동 시 고정,
  도메인별 도구 모듈 분리, 구조화 오류 { code, message, recoverable })
- AFA-011 🟦: factory_* 12종 — 이중 클레임 거부, 클레임 토큰 검증,
  complete는 verifier 전용, 결정론적 다음 작업(의존성·우선순위·승인 반영),
  stale 클레임 회수, 사이클·진행 보고 기록
- AFA-012 🟦: roadmap_* 5종 — JSON SSOT, 전이 테이블 통합, 거부 전이
  finding 자동 기록, 추적성 검증(누락·순환), Markdown 렌더러
- AFA-013 🟦: finding·evidence 7종 — resolve 증거 필수, sha256 무결성 검증,
  대용량 로그 tail 요약(원본 해시 보존)
- AFA-014 🟦: gate_* 3종 + gates.yaml 9게이트 — command/check 분리,
  결과 증거 자동 등록, 실패 finding 자동 기록, 명령 하드코딩 금지
- AFA-015 🟦: dependency_* 5종 — 양 검토 통과 전 approve 불가, GPL 자동
  거부, manual_review는 user 승인만, 후속 작업 9건 순차 의존 자동 등록
- AFA-016 🟦 / AFA-017 🟦: 승인(선택지·근거·위험·추천안), Placeholder
  (형식·종류별 기본값·차단 목록), 역량(스캔 대조·설치 계획·거절 기록)
- AFA-021 🟦: transitions.yaml 전이 테이블 + 전수 테스트 (worker→VERIFIED
  전 조합 거부 증명)
- AFA-022 🟦 / AFA-023 🟦: SPDX 정책 엔진(AND/OR/WITH 보수 처리) + 버전
  Stable-only 판정 — license-policy.yaml 신설
- AFA-050 🟧: 명령 실행 래퍼(타임아웃·tail·오류 라인) — 재시도 정책 연결은
  AFA-024에서 완성 예정

### 2026-08-05 (8차) — M1 완료 (구현 제출)

- AFA-002 🟦: `app-factory-config.schema.json`(설계서 20장 전 항목) +
  `core/policies/defaults.yaml`. 키스토어 임의 생성 금지·다국어 구조 상시를
  스키마 const로 강제. Kotlin·영어 기본값 반영
- AFA-003 🟦: `core/schemas/state-store.md` — 디렉터리 구조, 1엔티티=1파일,
  원자적 rename 쓰기, ID 채번(counter.json), O_EXCL 잠금·stale 회수,
  클레임 회수, 재개 읽기 순서 6단계, 버전·마이그레이션 원칙
- AFA-004 🟦: `placeholder.schema.json` + `placeholder-policy.yaml`
  (종류별 기본 속성 12종, 릴리스 산출물 잔존·테스트 광고 ID 게이트 규칙)
- AFA-005 🟦: `evidence.schema.json` (증거 16종 enum, sha256·truncated)
- 검증: 스키마 7종·예시 7종 전체 통과, YAML 정책 3종 파싱 확인

### 2026-08-05 (7차) — 로드맵 정밀점검

사용자 요청으로 전체 로드맵을 감사하고 다음을 수정했습니다.

- **순서 오류**: AFA-050(게이트 실행기)을 M6 → M3로 이동 — AFA-014의
  `gate_run`과 AFA-020 구현 루프가 실행기 없이는 동작 불가. 의존성을
  AFA-014→AFA-050 방향으로 정리해 순환 제거
- **누락 (중요)**: plan 산출물 17종 생성 로직의 소유 항목 부재 → AFA-034를
  "인터뷰 흐름·산출물 생성"으로 확장 (17종 생성 + 모의 응답 주입 모드 완료
  조건 추가)
- **누락**: factory init의 "로드맵 동기화" 실체 부재 → AFA-032
  `project-explore`에 기존 프로젝트 로드맵 초기 상태 후보 생성 조건 추가
  (VERIFIED 부여 불가 원칙 유지)
- **상충**: 공통 CLI — 1.0 이연(배포판)과 MVP-1 러너(개발용) 구분을
  MVP-1.md 4장과 AFA-026 지침에 명확화
- **불일치**: AFA-032 제목 "10종" → 실제 13종으로 정정
- **불충분**: AFA-036을 "점수화 리포트" → "factory review 파이프라인·점수화"
  로 확장 (콜드 컨텍스트 재감사 절차 소유 명시, 의존성에 AFA-021·AFA-032
  추가). AFA-002 defaults.yaml에 확정 기본값(Kotlin·영어·다국어 구조) 반영
  명시. AFA-031 의존성에 AFA-026·AFA-033 추가. AFA-021 의존성에 AFA-001
  추가. AFA-052에 디바이스 부재 시 3.17 질문 지연 처리 명시. AFA-053에
  진행 보고 기록 검증(DoD 13) 추가
- **개선**: 병행 착수 가능 항목(AFA-022/023은 M1 병행, AFA-034/035는 M2
  병행) 명시. 진행도 공식 문구를 3.15와 정합화

### 2026-08-05 (6차) — M1 착수

- AFA-001 구현 제출 (🟦 IMPLEMENTED): 코어 스키마 4종 작성
  - `core/schemas/roadmap-item.schema.json` — 7상태 enum, 완료 조건
    구조화(`verifiable_by`), VERIFIED 시 증거 필수(조건부 스키마), 전이 이력
  - `core/schemas/task.schema.json` — 클레임 토큰, dangerous 태그(강제 중단
    조건), worker의 requested_status에서 VERIFIED 원천 배제
  - `core/schemas/finding.schema.json` — 심각도·영역 enum(3.16 점수화 영역과
    정렬), resolve 시 증거 1건 이상 필수, reopen 이력 보존
  - `core/schemas/run.schema.json` — 사이클별 3.15 진행 보고 4요소,
    3.17 종료 사유, pending_decisions(질문 적체) 구조
  - 예시 인스턴스 4종 + 검증 스크립트(`scripts/validate-schemas.py`) 전체
    통과, 부정 케이스 7건 거부 확인(`tests/schema-negative-tests.py`)

### 2026-08-05 (5차)

- 무중단 자동 진행 명세 추가 (MVP-1.md 3.17, 사용자 요구): `factory go/auto`
  실행 시 프롬프트 1회로 완료 게이트까지 중단 없이 진행 (One-Prompt
  Completion)
  - 질문 지연·일괄 처리 원칙: auto 중 사용자 판단 항목은 크리티컬 패스
    비차단 시 `NEEDS_HUMAN_DECISION` 적체 후 계속 진행, 마지막 일괄 보고
  - 턴 종료 보고는 정지점 아님 — 보고 후 자동 계속
  - 어댑터별 세션 지속 메커니즘(Claude Code Stop Hook, Codex 래퍼 루프,
    CLI 러너) 및 종료 조건 3종 명시
  - DoD 15 추가, 로드맵 AFA-026 신설, AFA-040/041/053 완료 조건 보강

### 2026-08-05 (4차)

- 사용자 요구 4건 반영
  - 턴 종료 진행 보고 명세 추가 (MVP-1.md 3.15): 진행 상황·앞으로의 목표·
    다음 턴 예정·전체 진행도 % 4요소, 상태 가중치(0/25/50/75/100) 기반
    진행도 공식. 로드맵 AFA-025 신설
  - factory review 점수화 명세 추가 (MVP-1.md 3.16): 영역별 0~100 점수표 →
    목표 점수(기본 90)·개선 계획 제시 → 수정 → 전/후 비교. 배점표
    (`review-scoring.yaml`) 기반 산정. 로드맵 AFA-036 신설
  - plan 인터뷰 기본값 정책: 구현 언어·런타임 질문 추가, 미입력 시 Kotlin.
    기본 언어 영어, 다국어 구조(strings.xml)는 항상 기본 적용
  - Capability Doctor 6단계 추가: 설치된 스킬의 사용 지침을 선택 스코프의
    관리문서(전역 CLAUDE.md 또는 프로젝트 APP_FACTORY_RULES.md)에 마커
    블록으로 추가
- 역량 카탈로그 v2: 공식/공개 레포 검증 기반으로 재작성 (사용자 결정)
  - 검증 완료: `android/skills` 11종(adaptive, edge-to-edge, navigation-3,
    agp-9-upgrade, r8-analyzer, perfetto 2종, android-intent-security,
    testing-setup, play-billing-library-version-upgrade, play-policy-insights),
    `google/skills` Mobile Ads 1종, 커뮤니티 4종(material-3/hamen,
    compose-expert/aldefy, claude-android-ninja/Drjacky,
    android-testing-skills/skydoves)
  - Claude Code 내장 15종은 builtin_skills로 분리 (설치 불필요)
  - 미검증 9종 제외 (-expert 계열 등 사용자 로컬 스킬 추정) — 공개 레포
    확인 시 승격
- 선행 결정 해소: D-001(대상 앱은 plan 인터뷰 입력·기본 Kotlin, 플러그인
  자체는 추천안 TypeScript+Node 20 자동 채택 — 이견 시 M2 착수 전 변경 가능),
  D-002(검증 기반 카탈로그로 확정)

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
