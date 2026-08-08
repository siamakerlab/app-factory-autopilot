# App Factory Autopilot — MVP-1 개발 로드맵

- 기준 문서: 이 문서가 MVP-1 범위·완료 기준·개발 로드맵의 단일 원본(SSOT)이다.
- 관리 규칙: 이 로드맵은 아래 3.4의 상태 머신을 프로젝트 자체에도 적용한다.
  작업 완료 시 상태를 갱신하고 CHANGELOG.md에 기록한다.
- 상태 갱신 원칙: 구현자는 `IMPLEMENTED`까지만 표기한다. `VERIFIED`는 완료
  조건을 별도 세션(또는 다른 Provider)에서 검증한 뒤에만 표기한다.

## MVP-1 통합 명세

### 1. 목적

App Factory Autopilot은 빈 폴더 또는 기존 Android 프로젝트에서 앱 기획, 경쟁 앱·
커뮤니티 의견 조사, 요구사항 수집, 기술 결정, 로드맵 작성, 구현, 빌드/테스트,
UX·접근성·정책 검증, 최종 완료 판정까지 자동화하는 앱 개발 오케스트레이션
시스템이다.

MVP-1은 다음 두 경로를 완성한다.

- 빈 폴더 신규 개발: `factory plan` → `factory auto` → `factory review` →
  `factory test`
- 기존 프로젝트 도입: `factory init` → `factory plan` → `factory auto` →
  `factory review` → `factory test`

### 2. 핵심 설계 원칙

1. 구현과 완료 판정 분리: 구현 Agent는 `IMPLEMENTED`까지만 요청할 수 있고,
   독립 Completion Verifier가 검증한 항목만 `VERIFIED`가 된다.
2. 거대 단일 프롬프트 금지: 결정론적 오케스트레이터, 상태 머신, 전문 Agent,
   재사용 Skill, MCP 서버로 분리한다.
3. 플랫폼 비종속: Claude Code와 Codex 모두에서 동작해야 하며 공통 코어 원본은
   하나만 유지하고 어댑터가 변환한다.
4. 모르는 값은 지어내지 않음: 미확정 항목은 `${PLACEHOLDER_*}`로 기록하고 종류,
   중요도, 해결 시점, 자동 진행 가능 여부를 함께 관리한다.
5. 증거 기반 완료 판정: 코드, 호출 경로, 테스트, 빌드 로그, 실행 결과 등 증거가
   없는 완료 주장은 인정하지 않는다.
6. 규칙 단일 원본: 공통 규칙은 `APP_FACTORY_RULES.md` 하나만 원본으로 유지하고
   `CLAUDE.md`와 `AGENTS.md`에는 참조 지시만 배치한다.

### 3.1 사용자 명령

MVP-1 필수 명령은 다음 7개다.

| 명령 | Claude Code | Codex | 로컬 helper CLI | 역할 |
|------|-------------|-------|----------|------|
| config | `/factory config` | `$factory config` | `factory config` | 자동화 옵션 체크박스 설정. 기본은 에뮬레이터·광고·인앱결제 제외 |
| plan | `/factory plan "앱 설명"` | `$factory plan "앱 설명"` | Provider 필요 | 대화형 인터뷰 → 계획·1차 로드맵 생성. 코드 구현 없음 |
| init | `/factory init` | `$factory init` | Provider 필요 | 기존 프로젝트 분석, `.app-factory` 생성, 로드맵·구현 상태 동기화 |
| auto | `/factory auto` | `$factory auto` | Provider 필요 | 현재 상태를 분석해 구현→빌드→테스트→검증→게이트를 완료까지 자동 진행 |
| resume | `/factory resume` | `$factory resume` | `factory status` + Provider 필요 | 토큰 한도, 시스템 종료, 세션 강제 종료 등으로 중단된 실행을 상태 저장소 기준으로 재개 |
| test | `/factory test` | `$factory test` | `factory test prepare` | 에뮬레이터 승인 전제로 모든 시나리오·버튼·기능·예상 화면·출력을 스크린샷 기반 전수검사 |
| review | `/factory review` | `$factory review` | Provider 필요 | 구현 기록을 신뢰하지 않는 전체 재감사 |

로컬 helper CLI는 `factory doctor`, `factory status`, `factory config`,
`factory test prepare`를 제공한다. 전체 agent workflow는 Claude Code 또는
Codex Provider 명령에서 실행한다. `factory go`는 Provider 명령의 `factory auto`
호환 별칭이다.

### 3.2 기능 범위

- 계획: 경쟁 앱, 사용자 리뷰, 커뮤니티 의견을 요구사항과 로드맵에 반영하고,
  묶음 단위 인터뷰·Placeholder·1차 로드맵·plan 산출물 17종을 생성한다.
- 도입: 기존 프로젝트의 모듈 구조, Gradle 설정, 라이브러리, 구현 상태를 분석하고
  로드맵·상태 저장소와 동기화한다.
- 자동 진행: 빈 폴더면 Android 프로젝트 생성부터 시작하고, 기존 진행 중이면
  `.app-factory` 기준으로 중단 지점부터 이어간다. 공식 문서 확인, 최신 안정화
  버전 정책, 인앱업데이트/인앱리뷰, Material 3/Adaptive UI, 접근성, 라이선스,
  SBOM, 빌드·테스트·Lint·기본 에뮬레이터 게이트를 수행한다.
- 검증: Completion Verifier와 `factory review`가 부분 구현, 완료 오표기,
  Mock/TODO/빈 함수, 실패 경로 누락, UX·접근성·리서치 반영 부족을 finding으로
  등록하고 안전 수정은 fix 큐로, 위험 항목은 `NEEDS_HUMAN_DECISION`으로 보낸다.
- 에뮬레이터 전수검사: `factory test` 실행은 에뮬레이터 사용 승인으로 간주한다.
  mobile-mcp가 있으면 우선 사용하고 없으면 adb 폴백을 사용한다. 모든 사용자
  시나리오, 버튼, 기능, 예상 화면, 예상 출력, 오류/권한/빈 상태를 체크리스트화한
  뒤 phone, landscape, foldable, tablet, 특정 크기/해상도/폰트 배율/locale 등
  필요한 프로필에서 전수검사한다. 실패는 즉시 finding과 P0 fix 작업으로 등록한다.

### 3.3 Agent·Skill·MCP 범위

- Agent 8종: Factory Orchestrator, Project Explorer, Roadmap Architect,
  Roadmap Auditor, Implementation Worker, Completion Verifier,
  Dependency Version Manager, License Compliance Auditor.
- 진입 Skill: `factory`, `factory-config`, `factory-plan`, `factory-init`,
  `factory-auto`, `factory-resume`, `factory-test`, `factory-review`,
  `factory-status`, `factory-doctor`.
- 공정 Skill: `project-explore`, `roadmap-create`, `roadmap-audit`,
  `roadmap-implement`, `completion-verify`, `final-gate`,
  `dependency-version-review`, `license-compliance-review`, `dependency-report`,
  `license-report`, `official-docs-index`, `placeholder-audit`, `capability-audit`.
- MCP는 상태 저장, 작업 잠금, 결과 기록, 승인 처리, 증거 검증의 단일 진입점이다.
  Agent가 `.app-factory` 파일을 직접 수정하지 않는다.

### 3.4 상태 머신

```text
NOT_STARTED → IN_PROGRESS → IMPLEMENTED → VERIFIED
                   │              │
                   ├→ PARTIAL ────┘
                   ├→ BLOCKED
                   └→ NEEDS_HUMAN_DECISION
```

`VERIFIED`만 완료 상태다. worker는 어떤 경로로도 `VERIFIED`를 만들 수 없다.

### 3.5 의존성·라이선스 정책

라이브러리 추가는 Dependency Request → 공식 문서 기반 최신 안정화 버전 확인 →
SPDX 라이선스 검토 → 승인 → Version Catalog 반영 → Locking/Verification 갱신 →
빌드·테스트·Lint → 고지·SBOM 갱신 절차를 거친다. 템플릿에는 어떤 라이브러리나
Gradle 버전도 고정하지 않는다. 확인한 Gradle·라이브러리 최신 안정화 버전은
캐시하되, 공식 확인 실패 시 구버전 캐시를 fallback으로 선택하지 않는다. 사용자
메시지는 "최신 안정화 버전이 <version>로 업데이트되었습니다. 다운로드 후
진행합니다."처럼 최신 확인·갱신·진행을 기준으로 표현한다. GPL/AGPL/SSPL,
비상업 전용, 라이선스 불명, NOASSERTION은 기본 차단한다.

### 3.6 Placeholder·증거·게이트

- Placeholder: 미확정 값은 종류·중요도·해결 시점·자동 진행 가능 여부와 함께
  저장한다.
- Evidence 종류: 변경 코드, 구현 위치, 호출 경로, 단위/계측 테스트, 빌드 로그,
  Lint 결과, 의존성 그래프, 라이선스 보고서, SBOM, 스크린샷, 화면 녹화, logcat,
  에뮬레이터 테스트 계획, 에뮬레이터 시나리오 결과, verifier 보고서, gate 결과.
- 필수 게이트: build, unit_test, lint, completion, placeholder, license,
  version_policy, notices, emulator.
- 강제 중단: 동일 오류 재시도 초과, 데이터 손실 가능성, 파괴적 마이그레이션,
  대규모 아키텍처 변경, 서명키 변경, 실제 배포, 프로덕션 릴리스, 결제 상품 변경,
  광고 정책 변경, 개인정보처리방침 변경, 라이선스 해석 불명확, API 비용, 외부
  계정 필요, 요구사항 충돌, 테스트 환경 신뢰 불가.

### 3.7 상태 저장과 재개

전체 상태는 대상 프로젝트의 `.app-factory/`에 저장한다. `factory auto`와
`factory resume`은 대화 이력이 아니라 상태 저장소를 기준으로 완료 작업을 건너뛰고
stale claim을 회수해 이어서 진행한다.

### 3.8 Capability Doctor

`factory doctor`와 plan/init/auto/resume/test 프리플라이트는 역량 카탈로그와
현재 Provider 환경을 대조해 필요한 Skill, MCP, 서브에이전트 설치를 제안한다.
사용자 확인 없는 자동 설치는 금지한다. Android SDK, adb, emulator, Gradle,
AVD/연결 디바이스, mobile-mcp 같은 실행 환경도 매번 현재 사용자 환경에서
점검하고, 부족한 항목은 필요한 기능·조치 방법·차단 조건과 함께 사용자에게
알린다. 에뮬레이터/AVD/adb처럼 자동 준비 가능한 항목은 "바로 준비해드릴까요?"
라고 묻고, 사용자가 승인하면 설치·생성·재점검까지 진행한다. mobile docs MCP를 우선 사용하고, context7이 설치되어 있으면 보조
수단으로 사용하며, 둘 다 실패하면 공식 문서를 직접 확인한다.

### 3.9 턴 종료 보고와 무중단 진행

매 사이클 종료 시 진행 상황, 앞으로의 목표, 다음 작업, 전체 진행도를 보고한다.
보고는 정지점이 아니며, `factory auto`/`resume`/`test`는 완료·강제 중단·한도 초과
중 하나에 도달할 때까지 계속 진행한다.

진행도는 필수 로드맵 항목 상태 가중 평균이다:
`NOT_STARTED=0`, `IN_PROGRESS=25`, `PARTIAL=50`, `IMPLEMENTED=75`,
`VERIFIED=100`. `BLOCKED`와 `NEEDS_HUMAN_DECISION`은 직전 도달 상태의 가중치를
유지한다.

### 3.10 메인 세션 오케스트레이션과 Context 압축 안전성

Provider가 새 사용자 턴을 직접 만들 수 없는 환경에서는 `factory auto`를
"다음 턴 생성" 기능으로 보지 않는다. 기본 자동화 모델은 메인 세션이 장기 실행
오케스트레이터로 남아 모든 실무를 서브에이전트 또는 역할 분리 작업자에게
위임하는 구조다.

- 메인 세션은 직접 구현하지 않고 상태 읽기, 다음 작업 선정, 서브에이전트 위임,
  결과 검증 요청, 상태 전이, commit/push, 사용자 진행 보고를 담당한다.
- 조사, 구현, 테스트, 리뷰, UX·접근성 점검, 보안·라이선스 검토, 에뮬레이터
  시나리오 준비와 분석은 가능한 한 전문 서브에이전트가 수행한다.
- 코드 쓰기 작업은 충돌 방지를 위해 한 번에 하나만 실행한다. 조사·리뷰처럼
  읽기 중심 작업만 병렬화할 수 있다.
- 서브에이전트가 없는 Provider에서는 동일 세션 안의 역할 전환 프롬프트로
  강등하되, worker/verifier 분리 원칙과 증거 기반 완료 판정은 유지한다.
- 외부 auto runner와 Claude Stop Hook은 보조 수단이다. Vibe Coder 같은
  세션형 환경의 기본 경로는 메인 세션 장기 실행 오케스트레이션이다.

자동 context 압축은 허용한다. 단, 진행 상태는 대화 컨텍스트가 아니라
`.app-factory/`에 저장되어야 한다. 각 단위작업 종료 또는 압축 가능 지점마다
다음 checkpoint를 남긴다.

- 최신 run/cycle, phase, task claim, 결과 요약
- evidence, finding, roadmap/task 상태 전이
- 긴 리뷰·체크리스트·조사 결과는 `.app-factory/reports/` 또는 evidence 원본
- commit/push 결과와 다음 작업 후보
- `/factory resume`이 대화 이력 없이 파일 상태만으로 이어갈 수 있는 재개 지점

### 3.11 Definition of Done

MVP-1은 다음을 모두 만족할 때 완료로 인정한다.

1. Claude Code와 Codex에서 필수 명령 `config`, `plan`, `init`, `auto`,
   `resume`, `test`, `review`가 동작한다.
2. 빈 폴더에서 plan 산출물 17종이 생성되고 미확정 항목이 Placeholder로 기록된다.
3. 기존 프로젝트 init이 코드베이스를 분석하고 상태 저장소·로드맵을 동기화한다.
4. `factory auto`가 구현·빌드·단위 테스트·Lint·독립 검증·게이트를 완료까지
   진행한다.
5. worker는 `VERIFIED`를 만들 수 없고, verifier 증거가 있는 항목만 `VERIFIED`가 된다.
6. 부분 구현 4종(빈 함수, 호출되지 않는 코드, TODO, Mock)이 탐지되어 재작업된다.
7. 라이브러리 추가는 버전·라이선스 승인 절차를 거치며 GPL/AGPL은 차단된다.
8. Version Catalog, Dependency Locking, Verification Metadata, Third Party
   Notices, SBOM이 생성·갱신된다.
9. 중단 후 `factory auto` 또는 `factory resume`이 같은 지점부터 재개한다.
10. 기본 에뮬레이터 실행 검증 결과가 증거로 저장된다.
11. 모든 완료 판정에 증거가 연결되어 있다.
12. Capability Doctor가 역량 누락을 제안하고 사용자 확인 후 설치·기록한다.
13. 매 턴 종료 보고 4요소가 표시된다.
14. `factory review`가 영역별 점수, 목표, 개선 계획, 전/후 비교를 제공한다.
15. `factory auto` 단일 명령으로 강제 중단 조건이 없으면 메인 세션
    오케스트레이터가 서브에이전트 위임과 checkpoint를 반복해 완료 게이트까지
    도달한다. CLI 환경에서는 외부 auto runner가 여러 provider invocation을
    자동 재개할 수 있다.
16. `factory test`가 모든 시나리오 × 디바이스 프로필의 스크린샷 기반 전수검사
    결과를 증거로 저장하고 실패를 finding + P0 fix 작업으로 등록한다.

### 4. 이연 범위

| 후속 버전 | 이연 항목 |
|-----------|-----------|
| MVP-2 | Mobile Docs MCP 고도화, 의존성 자동 발견, 공식 문서 캐시, 호환성 매트릭스, Deprecated API 탐지 |
| MVP-3 | 고급 사용자 핵심가치 평가, 2차 로드맵 자동 재기획, Provider 교차 검증 고도화 |
| MVP-4 | Agent/Skill 런타임 발견, Quality Sweeper, 콜드 컨텍스트 감사 완전판 |
| MVP-5 | 병렬 디바이스 팜, 장시간 soak test, 화면 녹화 분석, 시각적 회귀 비교, 네트워크/배터리/성능 프로파일링 |
| 1.0 | 플러그인 패키지 배포, 공통 CLI 배포, OS별 설치기, 업데이트 시스템, 다중 프로젝트 운영 |

---

## 상태 범례

| 표기 | 상태 | 의미 |
|------|------|------|
| ⬜ | `NOT_STARTED` | 미구현 |
| 🟨 | `IN_PROGRESS` | 구현 중 |
| 🟧 | `PARTIAL` | 부분 구현 (핵심 경로 누락) |
| 🟦 | `IMPLEMENTED` | 구현 제출 (검증 전 — 완료 아님) |
| ✅ | `VERIFIED` | 독립 검증 통과 (**유일한 완료 상태**) |
| ⛔ | `BLOCKED` | 외부 요인으로 진행 불가 |
| ❓ | `NEEDS_HUMAN_DECISION` | 사용자 결정 필요 |

## 전체 현황 요약

| ID | 마일스톤 | 항목 | 우선순위 | 상태 |
|------|----------|------|----------|------|
| D-001 | M0 결정 | 구현 언어·런타임 확정 | P0 | ✅ |
| D-002 | M0 결정 | 스킬 카탈로그 설치 소스 확정 | P1 | ✅ |
| AFA-001 | M1 기반 | 로드맵·작업·상태 스키마 정의 | P0 | 🟦 |
| AFA-002 | M1 기반 | APP_FACTORY.yaml 스키마 정의 | P0 | 🟦 |
| AFA-003 | M1 기반 | `.app-factory` 상태 저장소 규약 | P0 | 🟦 |
| AFA-004 | M1 기반 | Placeholder 모델·정책 | P0 | 🟦 |
| AFA-005 | M1 기반 | 증거(Evidence) 모델 | P0 | 🟦 |
| AFA-010 | M2 MCP | MCP 서버 골격 (`app-factory-core`) | P0 | 🟦 |
| AFA-011 | M2 MCP | 공정 도구 (`factory_*`) | P0 | 🟦 |
| AFA-012 | M2 MCP | 로드맵 도구 (`roadmap_*`) | P0 | 🟦 |
| AFA-013 | M2 MCP | 발견·증거 도구 (`finding_*`, `evidence_*`) | P0 | 🟦 |
| AFA-014 | M2 MCP | 게이트 도구 (`gate_*`) | P0 | 🟦 |
| AFA-015 | M2 MCP | 의존성 도구 (`dependency_*`) | P1 | 🟦 |
| AFA-016 | M2 MCP | 승인·Placeholder 도구 | P1 | 🟦 |
| AFA-017 | M2 MCP | 역량 도구 (`capability_*`) | P1 | 🟦 |
| AFA-020 | M3 코어 | 워크플로 단계 정의·오케스트레이터 | P0 | 🟦 |
| AFA-021 | M3 코어 | 상태 머신 전이 강제 | P0 | 🟦 |
| AFA-022 | M3 코어 | SPDX 라이선스 정책 엔진 | P1 | 🟦 |
| AFA-023 | M3 코어 | 버전 정책 (Stable-only) | P1 | 🟦 |
| AFA-024 | M3 코어 | 재시도·예산·강제 중단 정책 | P1 | 🟦 |
| AFA-025 | M3 코어 | 턴 종료 진행 보고 생성기 | P0 | 🟦 |
| AFA-026 | M3 코어 | 무중단 진행 드라이버 (Cross-Turn Autopilot) | P0 | 🟦 |
| AFA-061 | M3 코어 | 메인 세션 서브에이전트 장기 실행 Auto | P0 | ⬜ |
| AFA-030 | M4 Agent/Skill | Agent 정의 8종 | P0 | 🟦 |
| AFA-031 | M4 Agent/Skill | 진입 Skill 10종 (config/plan/init/auto/resume/test/review/status/doctor/factory) | P0 | 🟦 |
| AFA-032 | M4 Agent/Skill | 공정 Skill 13종 | P0 | 🟦 |
| AFA-033 | M4 Agent/Skill | Capability Doctor 구현 | P1 | 🟧 |
| AFA-034 | M4 Agent/Skill | factory plan 인터뷰 흐름·산출물 생성 | P0 | 🟦 |
| AFA-035 | M4 Agent/Skill | project-template (plan 산출물 17종 템플릿) | P0 | 🟧 |
| AFA-036 | M4 Agent/Skill | factory review 파이프라인·점수화 | P0 | 🟧 |
| AFA-057 | M4 Agent/Skill | 경쟁사·커뮤니티 리서치 기반 제품 완성도 루프 | P0 | 🟧 |
| AFA-058 | M4 Agent/Skill | factory config 자동화 옵션 체크박스 | P0 | 🟧 |
| AFA-059 | M4 Agent/Skill | factory resume 중단 복구 명령 | P0 | 🟦 |
| AFA-060 | M6 검증 | factory test 에뮬레이터 전수검사 명령 | P0 | 🟧 |
| AFA-040 | M5 어댑터 | Claude Code 어댑터 | P0 | 🟧 |
| AFA-041 | M5 어댑터 | Codex 어댑터 | P0 | 🟧 |
| AFA-042 | M5 어댑터 | 코어→어댑터 빌드 파이프라인 | P0 | 🟦 |
| AFA-050 | M3 코어 | 빌드·테스트·Lint 게이트 실행기 | P0 | 🟦 |
| AFA-051 | M6 검증 | Third Party Notices·SBOM 생성기 | P1 | 🟧 |
| AFA-052 | M6 검증 | 기본 에뮬레이터 실행 검증 | P1 | 🟧 |
| AFA-053 | M6 검증 | E2E: 빈 폴더 신규 개발 시나리오 | P0 | 🟧 |
| AFA-054 | M6 검증 | E2E: 중단 후 재개 시나리오 | P0 | 🟦 |
| AFA-055 | M6 검증 | E2E: 기존 프로젝트 init 시나리오 | P0 | 🟧 |
| AFA-056 | M6 검증 | E2E: 부분 구현 탐지 시나리오 | P0 | 🟧 |

- 우선순위: P0 = MVP-1 완료에 필수, P1 = MVP-1 필수이나 후순위 착수 가능
- 마일스톤 순서: M0 → M1 → M2 → (M3 ∥ M4) → M5 → M6.
  M2까지가 다른 모든 작업의 토대이므로 최우선으로 완성한다.
- 병행 착수 가능: AFA-022(라이선스 정책)·AFA-023(버전 정책)은 의존성이
  없으므로 M1과 병행 가능하고, AFA-034(인터뷰 정의)·AFA-035(템플릿)는 M1
  완료 직후 M2와 병행 가능하다 — 대기 시간을 만들지 않는다.

---

## M0. 선행 결정 (해소 완료)

### D-001 구현 언어·런타임 확정 — ✅ (2026-08-05 해소)

- **결정 결과**:
  - **대상 앱**(플러그인이 만드는 Android 앱): 구현 언어·런타임은 plan
    인터뷰에서 사용자 입력을 받고, **미입력 시 기본 Kotlin** + 권장 스택
    (사용자 결정 2026-08-05). 기본 언어는 영어, 다국어 구조 기본 적용.
    → AFA-034에 반영.
  - **플러그인 자체**(MCP 서버·오케스트레이터·CLI): 추천안대로
    **TypeScript + Node.js 20 LTS** 채택. 근거: MCP 공식 SDK
    (`@modelcontextprotocol/sdk`)가 TypeScript 우선, 양 플랫폼 npm 배포
    단일화, 스키마 검증 zod, YAML은 yaml 패키지.
    사용자 지시가 대상 앱 언어에 관한 것이었으므로 플러그인 자체 언어는
    추천안을 자동 채택함 — **이견 시 M2 착수 전까지 변경 가능**.
- **후속**: AFA-010 이후 구현 작업 착수 가능.

### D-002 스킬 카탈로그 설치 소스 확정 — ✅ (2026-08-05 해소)

- **결정 결과**: 최초 후보 40종 중 **공식/공개 레포에서 확인된 스킬만 등록**
  (사용자 결정 — 자작 스킬은 공개 레포에 없을 수 있으므로 제외).
- **검증 결과** (2026-08-05, capability-catalog.yaml v2 반영):
  - Google 공식 `android/skills` 11종 + `google/skills`(Mobile Ads) 1종
  - 공개 커뮤니티 레포 4종 (material-3, compose-expert, claude-android-ninja,
    android-testing-skills)
  - Claude Code 내장 15종 (설치 불필요, 존재 점검만)
  - 미검증 9종 제외 (-expert 계열, android-ui-design, design-system-curator,
    qa-scenario-writer, android-bug-finder) — 공개 레포 확인 시 승격
- **후속**: AFA-033 설치 실행부 구현 가능. 설치 방법은 skills CLI
  (`npx skills add`), Claude 플러그인 마켓플레이스, git clone 3종.

---

## M1. 기반 — 스키마·상태 모델 (`core/schemas`)

> M1 공통 지침: 스키마는 전부 **JSON Schema(draft 2020-12)** 로 작성해
> `core/schemas/*.schema.json`에 둔다. 언어 결정(D-001)과 무관하게 진행할 수
> 있고, TypeScript(zod)·Python 어느 쪽에서도 코드 생성이 가능하다. 모든
> 스키마에 `version` 필드를 두어 향후 마이그레이션에 대비한다.

### AFA-001 로드맵·작업·상태 스키마 정의 — 🟦 (2026-08-05 구현 제출)

- **근거**: 통합 명세 3.4, 6장 / **의존성**: 없음 / **위험도**: 중
- **구현 범위**: `roadmap-item.schema.json`, `task.schema.json`,
  `finding.schema.json`, `run.schema.json`
- **완료 조건**:
  - [x] 로드맵 항목이 ID, 요구사항, 구현 범위, 완료 조건, 테스트 조건,
    실행 검증 조건, 의존성, 우선순위, 위험도, 상태 필드를 가진다
  - [x] 상태 enum이 3.4의 7개 상태와 정확히 일치한다
  - [x] 예시 인스턴스 파일이 스키마 검증을 통과한다
    (`scripts/validate-schemas.py` 전체 통과, 부정 케이스 7건 거부 확인:
    `tests/schema-negative-tests.py`)
- **지침**: 로드맵 항목 ID는 `RM-<3자리>` 형식으로 고정한다. 완료 조건은
  자유 텍스트가 아니라 `{ description, verifiable_by }` 배열로 구조화해
  Completion Verifier가 기계적으로 순회할 수 있게 한다. `verifiable_by`는
  `code | test | build | emulator | manual` enum으로 제한한다.

### AFA-002 APP_FACTORY.yaml 스키마 정의 — 🟦 (2026-08-05 구현 제출)

- **근거**: 통합 명세 3.11, 설계서 20장 / **의존성**: 없음 / **위험도**: 중
- **구현 범위**: `app-factory-config.schema.json` — 설계서 20장의 전 항목
  (프로젝트 종류·SDK 정책·아키텍처·광고·결제·서명·라이선스 정책·Provider
  우선순위·반복 한도·빌드/테스트/Lint 명령·승인 필요 작업·Placeholder 정책)
- **완료 조건**:
  - [x] 설계서 20장 항목이 모두 스키마에 존재한다
  - [x] 광고·결제 등 미사용 기능 블록은 생략 가능(optional)하다
  - [x] Placeholder 값(`${PLACEHOLDER_*}`)이 문자열 필드에 허용된다
  - 산출물: `app-factory-config.schema.json` + `defaults.yaml` + 예시 검증
    통과. 키스토어 임의 생성 금지(`generate_keystore: const false`)·다국어
    구조 상시(`i18n_structure: const true`)를 스키마 수준에서 강제
- **지침**: 기본값을 스키마에 내장하지 말고 `core/policies/defaults.yaml`로
  분리한다(전역 CLAUDE.md의 Android 규칙 — DataStore, Hilt, minSdk 커버리지
  90% 등 — 을 defaults에 반영). 스키마는 구조 검증만 담당한다.
  **defaults.yaml에 2026-08-05 확정 기본값 포함**: 구현 언어 미입력 시
  Kotlin + 권장 스택, 기본 언어 영어, 다국어 구조(strings.xml 분리) 상시
  적용.

### AFA-003 `.app-factory` 상태 저장소 규약 — 🟦 (2026-08-05 구현 제출)

- **근거**: 통합 명세 3.7 / **의존성**: AFA-001 / **위험도**: 상
- **구현 범위**: 10개 하위 디렉터리의 파일 포맷·명명 규칙·잠금 규약 문서
  (`core/schemas/state-store.md`) 및 각 파일 스키마
- **완료 조건**:
  - [x] 작업 ID(`T-`), Run ID(`R-`), Finding ID(`F-`), Evidence ID(`E-`)
    채번 규칙이 정의되어 있다 (+승인 `A-`, 로드맵 `RM-`, counter.json)
  - [x] 동시 쓰기 방지 규약(단일 쓰기 Agent + 잠금 파일)이 정의되어 있다
    (O_EXCL 원자 생성, stale 10분+PID 미생존 회수, 클레임 stale 회수 포함)
  - [x] 중단 후 재개 시 어떤 파일을 어떤 순서로 읽는지 명세되어 있다
    (6절 — 6단계 읽기 순서)
- **지침**: 상태 파일은 "1 엔티티 = 1 파일"(JSON)로 저장한다. 단일 대형
  state.json은 부분 손상 시 전체 유실 위험이 있다. 쓰기는 임시 파일 작성 후
  rename(원자적 교체)으로만 수행한다. 잠금은 `.app-factory/state/.lock`
  파일 + PID/타임스탬프로 구현하고 stale lock(예: 10분 초과)은 경고 후 회수.

### AFA-004 Placeholder 모델·정책 — 🟦 (2026-08-05 구현 제출)

- **근거**: 통합 명세 2, 3.6, 3.11 / **의존성**: AFA-001 / **위험도**: 중
- **구현 범위**: `placeholder.schema.json` + `core/policies/placeholder-policy.yaml`
- **완료 조건**:
  - [x] Placeholder가 이름, 종류, 중요도, 해결 시점, 자동 진행 가능 여부,
    릴리스 차단 여부 필드를 가진다 (+임시 값·위치 추적·상태 3종)
  - [x] 릴리스 차단 Placeholder 존재 시 게이트가 실패해야 한다는 정책이
    기록되어 있다 (+릴리스 산출물 내 잔존·테스트 광고 ID 잔존 실패 규칙,
    종류별 기본 속성 12종)
- **지침**: 이름은 `${PLACEHOLDER_대문자_스네이크}` 형식만 허용하고 정규식
  `\$\{PLACEHOLDER_[A-Z0-9_]+\}`로 검증한다. 코드베이스 잔존 스캔은 이
  정규식 하나로 수행할 수 있어야 한다(placeholder-audit Skill의 근거).

### AFA-005 증거(Evidence) 모델 — 🟦 (2026-08-05 구현 제출)

- **근거**: 통합 명세 3.6 / **의존성**: AFA-003 / **위험도**: 중
- **구현 범위**: `evidence.schema.json` — 3.8의 증거 종류 enum, 원본 파일
  경로, 해시, 생성 주체(Agent), 연결된 로드맵 항목/작업 ID
- **완료 조건**:
  - [x] 증거 없는 `VERIFIED` 전이를 스키마·규약 수준에서 거부할 수 있다
    (roadmap-item 스키마의 조건부 필수 — AFA-001 부정 테스트로 확인)
  - [x] 증거 파일이 `.app-factory/evidence/<E-ID>/`에 원본과 메타데이터로
    저장된다 (state-store.md 1절·7절, truncated·sha256 필드)
- **지침**: 빌드 로그 같은 대용량 원본은 전체 저장 대신 마지막 200줄 + 전체
  해시 + 요약을 저장한다. 스크린샷·녹화는 원본 보존. 증거 위조 방지가 아니라
  "주장과 근거의 연결"이 목적이므로 해시는 무결성 확인 용도로만 쓴다.

---

## M2. MCP 서버 `app-factory-core` (`mcp-server/`)

> M2 공통 지침: 모든 도구는 **입력·출력을 JSON Schema로 선언**하고, 상태
> 변경은 반드시 MCP 도구를 통해서만 일어난다(Agent의 상태 파일 직접 수정
> 금지 — 통합 명세 3.13). 도구 핸들러는 순수 함수 + 상태 저장소 어댑터로
> 분리해 단위 테스트를 가능하게 한다. 각 도구는 실패 시 구조화된 오류
> (`{ code, message, recoverable }`)를 반환한다.

### AFA-010 MCP 서버 골격 — 🟦 (2026-08-05 구현 제출)

- **근거**: 통합 명세 3.13 / **의존성**: D-001, AFA-003 / **위험도**: 상
- **구현 범위**: stdio 기반 MCP 서버 부트스트랩, 도구 등록 프레임, 상태
  저장소 접근 계층, 로깅
- **완료 조건**:
  - [x] MCP Inspector(또는 동급 도구)로 서버 연결·도구 목록 조회가 된다
  - [x] 상태 저장소 접근이 단일 모듈로 캡슐화되어 있다
  - [x] 단위 테스트 러너와 CI 가능한 테스트 스크립트가 동작한다
- **지침**: 프로젝트 루트를 도구 인자(`projectRoot`)로 받지 말고 서버 실행
  시 인자로 고정한다 — 세션 중 루트 변경은 상태 오염의 주원인. 도구 수가
  40개를 넘으므로 도구를 도메인별 모듈(factory/roadmap/finding/evidence/
  gate/dependency/approval/placeholder/capability)로 분리 등록한다.

### AFA-011 공정 도구 (`factory_*`) — 🟦 (2026-08-05 구현 제출)

- **근거**: 통합 명세 3.13 / **의존성**: AFA-010 / **위험도**: 상
- **구현 범위**: `factory_initialize`, `factory_get_status`,
  `factory_get_next_task`, `factory_claim_task`, `factory_submit_result`,
  `factory_complete_task`, `factory_reopen_task`, `factory_start_cycle`,
  `factory_finish_cycle`, `factory_abort_cycle`
- **완료 조건**:
  - [x] `factory_claim_task`는 이미 클레임된 작업을 이중 클레임할 수 없다
  - [x] `factory_complete_task`는 호출 주체 role이 verifier가 아니면 거부한다
  - [x] `factory_get_next_task`가 의존성·우선순위·상태를 반영해 결정론적으로
    다음 작업을 반환한다
  - [x] 도구별 단위 테스트가 있다
- **지침**: 호출 주체 role(orchestrator / worker / verifier / auditor)은
  도구 인자 + 클레임 토큰으로 전달한다. worker가 verifier를 사칭하는 것을
  MCP 수준에서 완전히 막을 수는 없으므로, 클레임 시 발급한 토큰과 제출
  주체가 일치하는지 검사하고 모든 전이를 감사 로그(`runs/`)에 남기는 것을
  1차 방어로 삼는다. 완전한 강제는 AFA-021에서 규정.

### AFA-012 로드맵 도구 (`roadmap_*`) — 🟦 (2026-08-05 구현 제출)

- **근거**: 통합 명세 3.13 / **의존성**: AFA-001, AFA-010 / **위험도**: 중
- **구현 범위**: `roadmap_parse`, `roadmap_get_items`,
  `roadmap_update_status`, `roadmap_validate_traceability`
- **완료 조건**:
  - [x] ROADMAP.md(대상 앱 프로젝트의) ↔ 구조화 상태(JSON) 양방향 동기화가
    된다 (Markdown이 표시용, JSON이 SSOT)
  - [x] `roadmap_update_status`가 3.4 상태 머신의 허용 전이만 수행한다
  - [x] 요구사항 ↔ 로드맵 항목 ↔ 테스트의 추적성 검증이 누락 목록을 반환한다
- **지침**: Markdown 파싱에 의존한 상태 관리는 취약하므로, 상태의 SSOT는
  `.app-factory/state/roadmap.json`으로 두고 ROADMAP.md는 렌더링 산출물로
  취급한다. 사람이 ROADMAP.md를 직접 고친 경우를 대비해 `roadmap_parse`가
  diff를 감지하고 동기화 확인을 요구하게 한다.

### AFA-013 발견·증거 도구 — 🟦 (2026-08-05 구현 제출)

- **근거**: 통합 명세 3.13, 3.8 / **의존성**: AFA-005, AFA-010 / **위험도**: 중
- **구현 범위**: `finding_create/list/resolve/reopen`,
  `evidence_register/get/validate`
- **완료 조건**:
  - [x] finding이 심각도(blocker/major/minor)·영역·연결 로드맵 항목을 가진다
  - [x] `evidence_validate`가 파일 존재·해시 일치·타입 적합성을 검사한다
  - [x] resolve된 finding의 reopen 이력이 보존된다
- **지침**: finding resolve에는 evidence ID를 필수로 요구한다("고쳤다"는
  주장에도 증거가 필요하다). 심각도 blocker는 게이트(AFA-014)가 자동
  참조하므로 enum을 안정적으로 유지한다.

### AFA-014 게이트 도구 (`gate_*`) — 🟦 (2026-08-08 구현 제출 보강)

- **근거**: 통합 명세 3.6, 3.13 / **의존성**: AFA-010, AFA-013,
  AFA-050(빌드·테스트·Lint 게이트의 실제 실행기 — M3로 이동됨) / **위험도**: 상
- **구현 범위**: `gate_run`, `gate_get_result` + 3.9의 9개 게이트 정의
  (빌드/단위 테스트/Lint/완료 검증/Placeholder/라이선스/버전/고지/실행)
- **완료 조건**:
  - [x] 게이트가 선언적 정의(YAML: 이름, 실행 명령 또는 검사 함수, 통과
    조건, 차단 여부)로 등록된다
  - [x] 게이트 결과가 증거로 자동 등록된다
  - [x] 하나라도 차단 게이트가 실패하면 공정이 다음 단계로 넘어가지 않는다
- **지침**: 게이트 정의는 `core/policies/gates.yaml`에 두고 MCP는 실행만
  담당한다. 빌드·테스트 게이트의 실행 명령은 APP_FACTORY.yaml의
  `build/test/lint 명령`을 참조한다(하드코딩 금지). 게이트 실행은 멱등해야
  하며, 동일 커밋에 대한 재실행은 캐시된 결과 재사용을 허용하되
  `--force` 옵션을 둔다.

### AFA-015 의존성 도구 (`dependency_*`) — 🟦 (2026-08-05 구현 제출)

- **근거**: 통합 명세 3.5, 3.13 / **의존성**: AFA-010, AFA-022, AFA-023 / **위험도**: 중
- **구현 범위**: `dependency_request/review_version/review_license/approve/reject`
- **완료 조건**:
  - [x] 버전 검토·라이선스 검토를 모두 통과하지 않은 요청은 approve가 거부된다
  - [x] approve 시 Version Catalog 반영 → Locking → Verification → 빌드 →
    테스트 → 고지 갱신의 후속 작업이 작업 큐에 자동 등록된다
  - [x] GPL/AGPL 의존성 요청이 자동 reject된다 (정책 예외 승인 없이)
- **지침**: 검토 결과는 사람이 재검토할 수 있게 근거 URL(공식 문서·릴리스
  페이지)을 필수 필드로 저장한다. "최신 안정화 버전 확인"은 웹 조회가
  필요하므로 MCP가 직접 조회하지 않고 검토 Agent가 조회 후 결과를 제출하는
  구조로 한다(MCP는 기록·검증 담당).

### AFA-016 승인·Placeholder 도구 — 🟦 (2026-08-05 구현 제출)

- **근거**: 통합 명세 3.13 / **의존성**: AFA-004, AFA-010 / **위험도**: 하
- **구현 범위**: `approval_request/get_status`,
  `placeholder_create/resolve/list_blocking`
- **완료 조건**:
  - [x] 승인 요청이 선택지·근거·위험·추천안 필드를 갖는다 (3.9 강제 중단
    조건의 보고 형식)
  - [x] `placeholder_list_blocking`이 릴리스 차단 항목만 정확히 반환한다
  - [x] 승인 대기 중 해당 작업 상태가 `BLOCKED`로 유지된다
- **지침**: 승인은 비동기다 — 요청 후 폴링(`approval_get_status`)로 확인하고,
  사용자 응답은 어댑터(플랫폼별 대화)가 받아 MCP에 기록한다. MCP가 직접
  사용자에게 묻지 않는다.

### AFA-017 역량 도구 (`capability_*`) — 🟦 (2026-08-05 구현 제출)

- **근거**: 통합 명세 3.14 / **의존성**: AFA-010 / **위험도**: 중
- **구현 범위**: `capability_scan/list_missing/install_plan/mark_installed/get_status`
- **완료 조건**:
  - [x] 카탈로그(capability-catalog.yaml) 로드·검증이 된다
  - [x] `capability_install_plan`이 선택 항목+스코프를 받아 Provider별 설치
    명령 목록을 반환한다
  - [x] 거절 이력이 기록되어 같은 세션에서 반복 제안되지 않는다
- **지침**: 설치된 스킬·MCP 목록의 탐지는 Provider마다 다르므로(Claude Code:
  설정 파일·플러그인 목록, Codex: 대응 설정) 탐지 로직은 어댑터에 두고 MCP
  도구는 "탐지 결과를 받아 카탈로그와 대조"만 한다. 설치 실행 자체도
  어댑터·사용자 몫이며 MCP는 계획 생성과 결과 기록만 담당한다.

---

## M3. 코어 워크플로·정책 (`core/workflow`, `core/policies`, `orchestrator/`)

### AFA-020 워크플로 단계 정의·오케스트레이터 — 🟦 (2026-08-05 구현 제출)

- **근거**: 통합 명세 3.3(Factory Orchestrator), 설계서 11장 / **의존성**:
  AFA-011 / **위험도**: 상
- **구현 범위**: `core/workflow/phases.yaml`(설계서 11장 17단계를 MVP-1
  범위로 축약한 단계 정의: 상태확인 → 프로젝트 생성 → 문서 인덱싱 → 로드맵
  감사 → 구현 루프 → 독립 검증 → 재작업 루프 → 에뮬레이터 검증 → 최종
  게이트) + 오케스트레이터 루프
- **완료 조건**:
  - [x] 각 단계가 진입 조건·수행 Agent·완료 조건·실패 시 행동을 선언한다
  - [x] 오케스트레이터가 현재 상태만 보고 다음 행동을 결정한다 (대화 이력
    비의존 — `factory auto` 재실행 시 동일 지점에서 재개)
  - [x] 단계 전이가 모두 `runs/`에 기록된다
- **지침**: 오케스트레이터는 "상태 읽기 → 다음 작업 선택 → Agent 프롬프트
  생성 → 결과 형식 검증 → 상태 기록"의 루프이며 **코드를 직접 수정하지
  않는다**. LLM 호출 부분과 결정 로직을 분리해 결정 로직은 LLM 없이 단위
  테스트한다. `factory auto`의 "알아서 진행"은 이 루프가 상태 저장소와 실제
  코드(빌드 결과 존재 여부 등)를 대조하는 것으로 구현한다.

### AFA-021 상태 머신 전이 강제 — 🟦 (2026-08-05 구현 제출)

- **근거**: ROADMAP.md 2장 1항, 3.4 / **의존성**: AFA-001(스키마의 상태·role
  enum과 정렬), AFA-011, AFA-012 / **위험도**: 상
- **구현 범위**: 전이 테이블(허용 전이 × 허용 role) + 전이 검증 미들웨어
- **완료 조건**:
  - [x] worker role은 어떤 경로로도 `VERIFIED` 전이를 만들 수 없다 (테스트로
    증명)
  - [x] `VERIFIED` 전이는 verifier role + evidence 필수 + 완료 조건 전 항목
    체크를 요구한다
  - [x] 허용되지 않은 전이 시도가 finding으로 자동 기록된다
- **지침**: 전이 테이블은 코드가 아니라 데이터
  (`core/workflow/transitions.yaml`)로 정의해 리뷰·테스트를 쉽게 한다.
  이 항목은 MVP-1의 존재 이유이므로 테스트를 가장 두텁게 작성한다
  (전이 조합 전수 테스트).

### AFA-022 SPDX 라이선스 정책 엔진 — 🟦 (2026-08-05 구현 제출)

- **근거**: 통합 명세 3.5 / **의존성**: 없음 (M1과 병행 가능) / **위험도**: 중
- **구현 범위**: `core/policies/license-policy.yaml`(허용/차단/수동검토
  SPDX 목록) + 판정 함수(정규화 포함)
- **완료 조건**:
  - [x] 3.6의 자동 허용 9종·자동 차단·수동 검토 목록이 기본 정책으로 들어
    있다
  - [x] `GPL-2.0-with-classpath-exception` 같은 예외 표기, `OR`/`AND` 복합
    표현식이 처리된다 (Dual License → 더 관대한 쪽 선택 가능 여부는 수동
    검토로 분류)
  - [x] 알 수 없는 식별자는 무조건 차단으로 판정된다
- **지침**: SPDX 표현식 파싱은 직접 구현하지 말고 검증된 파서 라이브러리를
  쓴다(이 의존성 추가 자체도 라이선스 확인 후 도입 — 도그푸딩). 판정 결과는
  `allow | block | manual_review` 3값 + 근거 문자열로 반환한다.

### AFA-023 버전 정책 (Stable-only) — 🟦 (2026-08-08 구현 제출 보강)

- **근거**: 통합 명세 3.3(Dependency Version Manager) / **의존성**: 없음 / **위험도**: 하
- **구현 범위**: 버전 문자열 판정 함수(stable vs alpha/beta/rc/preview/
  canary/nightly/snapshot/dev) + 동적 버전(`+`, `latest.release`) 탐지
- **완료 조건**:
  - [x] `2.1.0-alpha03`, `1.0.0-RC1`, `1.2.+`, `[1.0,2.0)` 등이 모두 비허용
    판정된다
  - [x] Version Catalog(libs.versions.toml) 외부에 선언된 버전을 탐지한다
- **지침**: Maven/Gradle 버전 체계는 SemVer가 아니다. 판정은 "stable 패턴
  화이트리스트"가 아니라 "pre-release 마커 블랙리스트 + 숫자·점 구성 검사"
  로 구현하는 편이 오탐이 적다. 판정 불가 문자열은 수동 확인으로 분류한다.

### AFA-024 재시도·예산·강제 중단 정책 — 🟦 (2026-08-05 구현 제출)

- **근거**: 통합 명세 3.6 / **의존성**: AFA-011 / **위험도**: 중
- **구현 범위**: `core/policies/limits.yaml`(최대 재시도, 최대 반복, 작업
  예산) + 동일 오류 반복 감지 + 3.9 강제 중단 조건 검사기
- **완료 조건**:
  - [x] 동일 작업 3회 실패 시 자동 재시도가 멈추고 `BLOCKED` + 승인 요청이
    생성된다 (횟수는 설정 가능)
  - [x] 강제 중단 조건(서명키 변경, Git Push, 실제 배포 등)에 해당하는 작업
    유형이 승인 없이 실행되지 않는다
- **지침**: "동일 오류"는 오류 메시지 완전 일치가 아니라 정규화(경로·숫자
  마스킹) 후 비교로 판정한다. 강제 중단 조건 검사는 작업 유형 태그 기반으로
  한다 — 작업 생성 시 `dangerous: [git_push, release, ...]` 태그를 붙이고
  실행 전 검사.

### AFA-025 턴 종료 진행 보고 생성기 — 🟦

- **근거**: 통합 명세 3.15 / **의존성**: AFA-011, AFA-012 / **위험도**: 하
- **구현 범위**: 상태 저장소에서 4요소 보고(진행 상황·앞으로의 목표·다음 턴
  예정·전체 진행도 %)를 생성하는 모듈 + 진행도 가중 평균 계산기
- **완료 조건**:
  - [x] 매 작업 사이클 종료 시 4요소 보고가 출력된다
  - [x] 진행도가 3.15 공식(상태 가중치 0/25/50/75/100)대로 계산된다
  - [x] `factory status`가 동일 형식을 출력한다
  - [x] 보고가 대화 기억이 아니라 상태 저장소만으로 생성된다 (재시작 후에도
    동일 보고 재현)
- **구현 검증**: `factory_finish_cycle`은 run 기록과 함께 사용자 표시용
  `rendered` 메시지를 반환한다. `driveAuto`는 매 사이클의 렌더링 보고를
  `cycle_reports`에 누적해 어댑터가 사용자에게 바로 보여줄 수 있게 한다.
  보고에는 이번 사이클, 누적 진행 상황, 앞으로의 목표, 다음 작업, 전체
  진행도가 포함된다.
- **지침**: "다음 턴 예정"은 `factory_get_next_task`의 결과를 그대로 사용해
  보고와 실제 행동이 어긋나지 않게 한다. 진행도는 필수(P0 상당) 항목만으로
  계산하고 선택 항목은 별도 표기한다 — 선택 항목이 분모에 들어가면 진행도가
  실제 완성도보다 낮게 보인다.

### AFA-026 무중단 진행 드라이버 (Cross-Turn Autopilot) — 🟦 (2026-08-08 구현 제출 보강)

- **근거**: 통합 명세 3.17 / **의존성**: AFA-020, AFA-024 / **위험도**: 상
- **구현 범위**: 프로덕션 수준 완료 또는 실제 차단 조건까지 반복하는 외부
  러너(CLI), invocation당 한 로드맵 항목/단위작업 처리, 30초 지연 후 다음
  `factory resume` 자동 재호출, 질문 지연·일괄 처리 로직
  (NEEDS_HUMAN_DECISION 적체 후 진행 계속), 크리티컬 패스 차단 판정,
  어댑터별 세션 지속 장치와의 연결점 정의
- **완료 조건**:
  - [x] `factory auto` 실행이 정상 완료·강제 중단·한도 초과 중 하나에
    도달할 때까지 사용자 입력 없이 다음 provider turn을 자동 시작한다
  - [x] 각 provider turn은 한 로드맵 항목 또는 한 단위작업을 마치고
    커밋·푸시·진행 요약 후 종료할 수 있다
  - [x] 사용자 판단 필요 항목 발생 시 크리티컬 패스를 차단하지 않으면
    `NEEDS_HUMAN_DECISION` 등록 후 다른 작업이 계속 진행된다
  - [x] 턴 종료 보고(AFA-025) 후 30초 내 다음 사이클이 자동으로 시작된다
  - [x] 세션 강제 종료 후 재실행 시 동일 지점부터 무중단 재개된다
- **지침**: 이 항목은 CLI/셸 환경에서 provider invocation을 반복 호출하는
  보조 경로다. Vibe Coder 같은 세션형 환경의 기본 자동화 모델은 AFA-061이다.
  무중단의 기반은 "상태 저장소만으로 재진입 가능"(AFA-020)이다 —
  드라이버는 이를 반복 호출하는 껍데기로 얇게 유지한다. 크리티컬 패스 차단
  판정은 작업 의존성 그래프에서 해당 항목에 의존하는 미완료 필수 작업 존재
  여부로 기계적으로 한다(LLM 판단 금지). Claude Code의 Stop Hook 등 플랫폼
  지속 장치의 스펙은 어댑터(AFA-040/041) 구현 시점에 공식 문서로 확인하고,
  코어는 "계속할지 판정하는 함수" 하나만 노출한다. Stop Hook은 같은 턴
  강제 지속이 필요할 때의 fallback이며, 기본 무중단은 auto runner가 다음
  provider invocation을 시작하는 방식으로 구현한다. 무한 루프 방지는
  AFA-024의 최대 반복·예산 한도가 담당하므로 드라이버에 별도 휴리스틱을
  넣지 않는다. **CLI 범위 명확화 (2026-08-05 정밀점검)**: MVP-1의 "공통
  러너"는 저장소 내 개발·테스트용 실행 스크립트를 의미한다. npm 배포·OS별
  설치기·배포판 CLI는 1.0 범위(통합 명세 4)이므로 여기서 만들지 않는다.

### AFA-061 메인 세션 서브에이전트 장기 실행 Auto — ⬜

- **근거**: 통합 명세 3.10, 사용자 목표(새 사용자 턴 생성 없이도 `factory auto`
  단일 실행으로 프로덕션 준비도까지 자동 진행) / **의존성**: AFA-020,
  AFA-025, AFA-030, AFA-031, AFA-040~042 / **위험도**: 상
- **구현 범위**: `factory auto`의 기본 실행 모델을 메인 세션 장기 실행
  오케스트레이터로 정의한다. 메인은 직접 코딩하지 않고 상태 저장소와 MCP를
  통해 다음 작업 선정, 서브에이전트 위임, 결과 수집, verifier 재위임, 증거
  등록, 상태 전이, commit/push, 사용자 진행 보고를 반복한다. 외부 runner는
  CLI 환경의 보조 경로로 유지한다. 메인은 작업 성격, 위험도, 필요한 도구,
  쓰기 충돌 가능성, 검증 필요성을 판단해 가장 적절한 agent/skill을 선정하고,
  서브에이전트가 돌려준 보고를 근거로 다음 액션을 결정해야 한다.
- **하위 작업**:
  - AFA-061a Main Orchestrator Contract — 메인 세션의 금지 사항, 위임 책임,
    사용자 보고 형식, 종료 조건을 `factory-auto`/`factory-resume`에 명시
  - AFA-061b Delegation Matrix — market research, implementation, test,
    review, UX/accessibility, security/privacy, license, dependency, emulator
    작업을 어떤 agent/skill에 위임할지 정의
  - AFA-061c Delegation Decision Policy — 메인이 task type, roadmap phase,
    required evidence, file ownership, dangerous tags, tool availability,
    previous failures를 기준으로 위임 대상과 병렬 가능 여부를 결정하는 정책
  - AFA-061d Subagent Report Contract — 서브에이전트가 메인 판단에 필요한
    summary, changed_files, evidence_ids, findings, risks, blockers,
    confidence, next_recommendation, verification_needed, commit_ready 여부를
    구조화해 보고하는 계약
  - AFA-061e Write Serialization — 코드 수정 작업은 단일 worker만 수행하고,
    읽기 중심 조사·리뷰만 병렬화하는 잠금·작업 큐 규칙 확정
  - AFA-061f Context Checkpoint — 각 단위작업 종료와 압축 가능 지점마다
    run/cycle, task result, evidence, finding, roadmap 상태, commit/push,
    next action을 `.app-factory`에 저장
  - AFA-061g Subagent Fallback — 서브에이전트 미지원 Provider에서 역할 전환
    프롬프트로 강등하되 worker/verifier 분리 원칙을 유지
  - AFA-061h Long-run Guardrails — 토큰/시간/반복 한도, 동일 오류 정체,
    사용자 승인 필요 작업, context 압축 후 resume 동작을 통합 검증
- **완료 조건**:
  - [ ] `/factory auto`와 `$factory auto`가 수동 provider 세션 안에서도
    메인 오케스트레이터로 동작하며 가능한 작업을 계속 위임한다
  - [ ] 메인 세션이 작업별로 적절한 agent/skill을 선정한 근거를 내부 run
    기록에 남기고, 사용자에게는 필요한 결과만 간결하게 보고한다
  - [ ] 모든 서브에이전트 보고가 구조화 계약을 따르며, 메인이 작업 성공,
    재작업, 검증 위임, blocker, commit 가능 여부를 판단하기에 충분한 정보를
    포함한다
  - [ ] 메인 세션은 구현 파일을 직접 수정하지 않고 worker/subagent 결과를
    통해서만 코드 변경을 진행한다
  - [ ] 각 단위작업 완료 후 evidence/report/finding/task/run 상태가
    `.app-factory`에 저장되어 자동 context 압축 후에도 `/factory resume`으로
    같은 지점부터 이어진다
  - [ ] 코드 쓰기 작업의 병렬 실행이 방지되고, 조사·리뷰 작업은 안전한 경우
    병렬 위임된다
  - [ ] 사용자에게 보이는 메시지는 실질 진행, 검증 결과, commit/push,
    blocker, 다음 작업만 포함하고 내부 라우팅 설명은 생략한다
  - [ ] 샘플 프로젝트에서 새 사용자 턴 생성 없이 메인 세션이 최소 3개 이상의
    연속 단위작업을 위임·검증·checkpoint·보고한다
- **지침**: 이 항목은 `factory auto`의 기본 UX를 결정한다. "새 턴 자동 생성"을
  Provider 기능으로 가정하지 않는다. Claude의 Stop Hook/Ralph-style block은
  같은 턴 지속 fallback일 뿐이며, Codex/Claude 공통 핵심은 메인 세션
  오케스트레이션과 durable checkpoint다. 서브에이전트의 자유 서술만으로는
  완료 판단을 하지 않는다. 메인은 구조화 보고와 evidence를 대조하고, 필요한
  경우 verifier/reviewer에게 재위임한 뒤 상태를 전이한다.

### AFA-050 빌드·테스트·Lint 게이트 실행기 — 🟦 (2026-08-05 구현 제출)

- **근거**: 통합 명세 3.6 / **의존성**: AFA-010, AFA-024(재시도 연동) /
  **위험도**: 중 / **참고**: 2026-08-05 정밀점검에서 M6 → M3로 이동 —
  AFA-014의 `gate_run`과 AFA-020 구현 루프("각 작업 후 빌드·테스트")가 이
  실행기를 필요로 하므로 E2E 단계까지 미루면 M2·M3가 완결될 수 없다
- **구현 범위**: Gradle 명령 실행 래퍼(타임아웃·출력 캡처·종료 코드 해석),
  결과 → 증거 등록, 실패 로그 요약
- **완료 조건**:
  - [x] `assembleDebug`/`test`/`lint` 실패가 각각 구분된 finding으로
    기록된다
  - [x] 타임아웃(기본 15분, 설정 가능) 시 프로세스가 정리되고 재시도
    정책(AFA-024)에 연결된다
  - [x] 실패 로그 요약이 원인 라인(첫 error) 중심으로 추출된다
- **지침**: Gradle 출력은 방대하므로 전체 저장 대신 "exit code + 마지막
  200줄 + `error:`/`FAILURE:` 매칭 라인"을 구조화 저장한다. Gradle Daemon
  잔존으로 인한 상태 오염을 피하려면 `--no-daemon`은 쓰지 말고(빌드 시간
  폭증) 실패 반복 시에만 `--stop` 후 재시도한다.

---

## M4. Agent·Skill 원본 (`core/agents`, `core/skills`, `core/prompts`)

> M4 공통 지침: Agent·Skill 원본은 플랫폼 중립 Markdown + frontmatter로
> 작성한다. frontmatter에는 이름, 역할(role), 사용 도구 목록, 입출력 계약을
> 선언하고 본문에 지시를 작성한다. Claude Code·Codex 형식으로의 변환은
> AFA-042 빌드가 담당하므로 원본에 플랫폼 고유 문법을 넣지 않는다.

### AFA-030 Agent 정의 8종 — 🟦 (2026-08-05 구현 제출)

- **근거**: 통합 명세 3.3 / **의존성**: AFA-011 (도구 계약 확정 후) / **위험도**: 상
- **구현 범위**: Factory Orchestrator, Project Explorer, Roadmap Architect,
  Roadmap Auditor, Implementation Worker, Completion Verifier,
  Dependency Version Manager, License Compliance Auditor
- **완료 조건**:
  - [x] 각 Agent가 역할·금지 사항·사용 MCP 도구·출력 형식을 선언한다
  - [x] Implementation Worker 정의에 "VERIFIED 전이 금지, IMPLEMENTED까지만
    제출" 지시가 명시되어 있다
  - [x] Completion Verifier 정의에 "로드맵 완료 표시·구현 대화 불신, 코드·
    테스트·증거만 검토" 지시가 명시되어 있다
- **지침**: 각 Agent의 출력은 자유 서술이 아니라 JSON 계약(스키마 참조)으로
  강제한다 — 오케스트레이터가 형식을 검증해야 하기 때문. Verifier 프롬프트에
  는 검사 체크리스트(코드 존재→호출 경로→UI 연결→실패 경로→Mock/TODO 스캔→
  테스트 유효성→빌드 증거)를 순서대로 명시하고, 각 검사의 증거 등록을
  요구한다.

### AFA-031 진입 Skill 10종 — 🟦 (2026-08-08 구현 제출 보강)

- **근거**: 통합 명세 3.1, 3.12 / **의존성**: AFA-020, AFA-026(CLI
  무중단 드라이버), AFA-061(인세션 장기 실행 auto), AFA-033(doctor 진입) /
  **위험도**: 중
- **구현 범위**: `factory`(라우터), `factory-config`, `factory-plan`,
  `factory-init`, `factory-auto`, `factory-resume`, `factory-test`,
  `factory-review`, `factory-status`, `factory-doctor`
- **완료 조건**:
  - [x] `factory` 라우터가 하위 명령을 파싱해 해당 Skill로 위임한다 (미지원
    명령은 도움말 출력)
  - [x] `factory-auto`가 `.app-factory` 부재 시(신규) plan 산출물 확인 →
    프로젝트 생성 경로, 존재 시 재개 경로로 분기한다
  - [x] `factory-init`이 빈 폴더에서 실행되면 "기존 프로젝트 전용" 안내와
    함께 plan을 권한다
  - [x] `factory-go` 별칭이 auto로 연결된다
  - [x] `factory-resume`이 중단 복구 명령으로 라우터와 어댑터 산출물에 포함된다
  - [x] `factory-test`가 에뮬레이터 전수검사 명령으로 라우터와 어댑터 산출물에 포함된다
- **지침**: 진입 Skill은 얇게 유지한다 — 인자 파싱, 전제 조건 확인
  (프리플라이트 capability-audit 포함), 오케스트레이터/공정 Skill 위임까지만.
  공정 로직을 진입 Skill에 넣으면 플랫폼별 변환에서 중복이 생긴다.

### AFA-032 공정 Skill 13종 — 🟦 (2026-08-05 구현 제출)

- **근거**: 통합 명세 3.12 / **의존성**: AFA-030 / **위험도**: 중
- **구현 범위** (13종 — 2026-08-05 정밀점검에서 수량 표기 정정):
  `project-explore`, `roadmap-create`, `roadmap-audit`,
  `roadmap-implement`, `completion-verify`, `final-gate`,
  `dependency-version-review`, `license-compliance-review`,
  `dependency-report`, `license-report`, `official-docs-index`(기본),
  `placeholder-audit`, `capability-audit`
- **완료 조건**:
  - [x] 각 Skill이 대응 Agent·MCP 도구와 연결되고 입출력 계약을 갖는다
  - [x] `placeholder-audit`가 AFA-004의 정규식으로 코드·리소스 전체를 스캔
    한다
  - [x] `project-explore`가 기존 프로젝트 분석 결과로 로드맵 초기 상태 후보
    (구현 흔적 기반 PARTIAL/IMPLEMENTED 추정)를 생성한다 — 단 `VERIFIED`
    부여는 불가하며 확정은 Completion Verifier가 한다 (factory init의
    "로드맵 동기화" 실체 — 2026-08-05 정밀점검에서 소유 항목 명시)
- **지침**: Skill과 Agent의 관계를 명확히 한다 — Skill은 "작업 절차서",
  Agent는 "역할 정의". 하나의 Skill이 여러 Agent를 순서대로 부를 수 있다
  (예: roadmap-create는 Roadmap Architect 후 Roadmap Auditor를 호출).

### AFA-033 Capability Doctor 구현 — 🟧 (2026-08-08 로컬 구현 보강)

- **근거**: 통합 명세 3.14 / **의존성**: AFA-017 / **위험도**: 중
- **구현 범위**: 점검→카테고리별 체크리스트 제안→스코프 선택→설치 계획 생성
  →(사용자 확인 후) 설치 실행→재검증→`capabilities.yaml` 기록→선택 스코프의
  관리문서에 스킬 사용 지침 추가
- **완료 조건**:
  - [x] required 부재 시 plan/init/auto 시작 전에 제안이 표시된다
  - [x] 사용자가 아무것도 선택하지 않아도 공정이 계속 진행된다 (경고만 기록)
  - [x] API 키 필요 항목에 키 필요 표시가 나타난다
  - [x] 거절 항목이 같은 세션에서 재제안되지 않는다
  - [x] 사용자 실행 환경 점검 결과를 기록하고 부족한 도구·설정·디바이스를
    조치 안내와 함께 반환한다
  - [x] 에뮬레이터 관련 부족분은 자동 준비 제안 문구("바로 준비해드릴까요?")를
    포함해 사용자에게 묻는다
  - [ ] 설치 완료 스킬의 `guidance_doc` 지침이 스코프에 따라 전역 관리문서
    (`~/.claude/CLAUDE.md` 등) 또는 프로젝트 관리문서(APP_FACTORY_RULES.md의
    역량 지침 절)에 추가된다 — 마커 주석으로 감싸 중복·수동 편집 충돌 방지
  - [ ] skills CLI(`npx skills add`)·Claude 플러그인·git clone 3종 설치
    방법이 모두 동작한다
- **로컬 검증 보강**: project scope의 `guidance_doc` 마커 블록 반영과
  `capability_record_environment`의 부족분/조치 안내 생성은 단위 테스트로
  고정되었다. 전역 관리문서 반영과 실제 설치 명령 실행은 각 사용자 환경에서
  점검·안내해야 하므로 🟧 유지.
- **지침**: 체크리스트 UI는 플랫폼 기능(Claude Code의 질문 도구 등)에
  의존하므로 어댑터별로 표현이 달라도 된다 — 코어는 "제안 데이터 구조"만
  정의한다. 관리문서 지침 추가 시 기존 내용을 재작성하지 말고 마커 블록
  (`<!-- app-factory:capabilities:start/end -->`) 내부만 교체한다. 전역
  문서는 사용자 소유이므로 추가 전 diff를 보여주고 확인받는다.

### AFA-034 factory plan 인터뷰 흐름·산출물 생성 — 🟦 (2026-08-08 구현 제출)

- **근거**: 통합 명세 3.11, 설계서 5장 / **의존성**: AFA-004,
  AFA-035(템플릿) / **위험도**: 상
- **구현 범위**: 10개 영역 인터뷰 정의(`core/prompts/interview/`) — 질문
  묶음, 분기 규칙(광고 미사용 시 광고 질문 생략 등), 기본 추천값, Placeholder
  생성 규칙. **인터뷰 결과 → AFA-035 템플릿 렌더링 → plan 산출물 17종 생성기
  포함** (2026-08-05 정밀점검: 산출물 생성 로직의 소유 항목이 없던 누락 보완)
- **완료 조건**:
  - [x] 질문이 영역별 작은 묶음으로 제시된다 (한 번에 수십 개 금지)
  - [x] 이미 답한 내용을 다시 묻지 않는다 (답변은 즉시 상태 저장소에 기록)
  - [x] "모름/미정" 응답이 올바른 Placeholder + 메타데이터로 변환된다
  - [x] 인터뷰 중단 후 재실행 시 남은 질문부터 이어진다
  - [x] 인터뷰 완료 시 plan 산출물 17종이 생성되고 스키마 검증을 통과한다
  - [x] 모의 응답 주입 모드를 지원한다 (E2E AFA-053이 이 모드를 사용)
- **로컬 검증 보강**: `plan_get_next_questions`, `plan_submit_answers`,
  `plan_apply_mock_answers` MCP 도구와 `tests/plan-config.test.ts`가 작은 질문 묶음,
  답변 즉시 저장, 재실행 시 이미 답한 질문 생략, 미정 응답의 Placeholder 변환,
  모의 응답 파일 주입을 검증한다. `scripts/render-app-factory-project.mjs
  --scope docs`는 예시 APP_FACTORY 설정에서 plan 산출물 17종 생성과 미해결
  템플릿 변수 부재를 검증한다.
- **지침**: 인터뷰 정의는 데이터(YAML: 질문 ID, 조건, 기본값, 답변 타입,
  placeholder 매핑)로 작성하고 진행 로직은 공통 하나로 만든다. 질문을
  프롬프트에 하드코딩하면 영역 추가·수정 시 회귀가 생긴다. 기술 자동 결정
  항목(스택 등)은 "추천값 + 변경 여부 확인" 1문항으로 압축한다.
  **기본값(2026-08-05 사용자 결정)**: 구현 언어·런타임 질문을 포함하되
  미입력 시 Kotlin + 권장 스택. 기본 언어 미입력 시 영어. 다국어 구조
  (strings.xml 분리, 하드코딩 금지)는 질문과 무관하게 항상 적용 — 인터뷰
  정의의 defaults 섹션에 명시한다.

### AFA-035 project-template — 🟧 (2026-08-08 로컬 구현 보강)

- **근거**: 통합 명세 3.11 / **의존성**: AFA-002, AFA-004 / **위험도**: 중
- **구현 범위**: plan 산출물 17종 템플릿 + Android 프로젝트 스캐폴드 템플릿
  (settings.gradle.kts, libs.versions.toml, build.gradle.kts, 기본 패키지
  구조, .gitignore)
- **완료 조건**:
  - [x] 17종 산출물이 모두 템플릿으로 존재하고 변수 치환 지점이 명시되어
    있다
  - [ ] Android 스캐폴드가 치환 후 `assembleDebug`에 성공한다 (샘플 값 기준)
  - [x] 키스토어 파일을 생성하지 않는다 — 서명 설정은 외부 키스토어 경로
    참조 + 부재 시 릴리스 빌드 차단 안내 (전역 키스토어 정책 준수)
- **로컬 검증 보강**: `scripts/render-template.mjs`,
  `scripts/render-app-factory-project.mjs`와 테스트로 Android 템플릿 16개 파일 렌더링,
  미해결 변수 차단, Room 조건부 의존성, AGP 9 built-in Kotlin 플러그인
  제거, 외부 키스토어 릴리스 차단 문구를 검증했다. Gradle wrapper
  properties는 공식 Gradle current 메타데이터로 확인한
  `{{versions.gradle}}`와 `{{versions.gradleDistributionSha256}}`만 받으며,
  템플릿 내 의존성·Gradle 버전 하드코딩은 테스트로 금지한다.
  `assembleDebug`는 Gradle wrapper jar/실 Android 빌드 환경 필요.
- **지침**: 템플릿 변수는 `{{mustache}}` 스타일 단일 문법으로 통일한다.
  Android 스캐폴드의 라이브러리 버전은 템플릿에 박아 두지 말고 "생성 시점에
  Dependency Version Manager가 채운다"는 주석과 함께 placeholder로 둔다
  (템플릿 자체가 구식이 되는 것을 방지).

### AFA-036 factory review 파이프라인·점수화 — 🟧 (2026-08-08 로컬 구현 보강)

- **근거**: 통합 명세 3.2 검증 단계, 3.16 / **의존성**: AFA-013, AFA-021,
  AFA-030, AFA-032(completion-verify·final-gate 재사용) / **위험도**: 중
- **구현 범위** (2026-08-05 정밀점검에서 "점수화 리포트"에서 review 전체
  파이프라인 소유로 확장): 콜드 컨텍스트 재감사 절차(구현 대화 불신, 코드·
  로드맵·테스트·증거만 검토) → 영역별 검사 → 점수화 → 개선 계획 → 안전
  항목 수정·위험 항목 보류 → 재점수. 구성 요소:
  `core/policies/review-scoring.yaml`(영역별 검사 항목·배점 정의) + 점수
  계산기 + 리포트 생성(현재 점수 → 목표 점수 → 개선 계획 → 수정 후 전/후
  비교) + 리포트 저장(`.app-factory/reports/review-<RunID>.md`)
- **완료 조건**:
  - [x] 영역별 0~100 점수표가 finding 기반 감점 근거와 함께 출력된다
  - [x] 목표 점수(기본 90, 릴리스 차단 영역 100)와 격차·개선 계획이 수정
    실행 **전에** 사용자에게 표시된다
  - [ ] 안전한 항목만 자동 수정되고 위험 항목은 `NEEDS_HUMAN_DECISION`으로
    남는다
  - [x] 수정 후 재점수화되어 전/후 비교표가 출력된다
- **로컬 검증 보강**: `reviewScore`/`reviewSaveReport`의 배점표 기반 감점,
  목표 점수, 개선 계획, before/after 리포트 저장은 단위 테스트로 검증했다.
  실제 provider가 안전 수정만 자동 실행하고 위험 수정은 보류하는 흐름은
  플러그인 실환경 검증이 남아 있어 PARTIAL로 둔다.
- **지침**: 점수는 LLM의 인상 평가가 아니라 배점표 기반으로 산정한다 —
  각 영역의 검사 항목(예: "빈 상태 화면 존재", "복원 테스트 존재")에
  통과/실패/해당없음을 매기고 가중 합산한다. "해당없음" 항목은 분모에서
  제외한다(광고 미사용 앱이 광고 영역에서 감점되지 않도록). 동일 배점표를
  재사용해야 전/후 비교가 의미를 가진다.

### AFA-057 경쟁사·커뮤니티 리서치 기반 제품 완성도 루프 — 🟧

- **근거**: 사용자 목표(한 번 실행으로 경쟁 앱·커뮤니티 의견까지 종합해
  프로덕션 가능한 Android 앱 생성) / **의존성**: AFA-034, AFA-036,
  AFA-040~042 / **위험도**: 상
- **구현 범위**: `market_research`와 `ux_quality` 설정, 경쟁 앱·사용자 리뷰·
  커뮤니티 의견 조사 evidence, 리서치 결과의 P0/P1 로드맵 반영, 최신 Android
  편의 기능(인앱업데이트·인앱리뷰), Material 3/Adaptive UI, UX 직관성,
  접근성(TalkBack·semantics·48dp 터치 영역·폰트 확대)을 release-blocking
  review 영역으로 검증한다.
- **하위 검증 단위**:
  - AFA-057a Market Research Evidence — 경쟁 앱·커뮤니티·리뷰 출처와 샘플 수
    저장
  - AFA-057b Research-to-Roadmap — 반복 불만·기대 기능·차별점을 P0/P1 또는
    제외 목록에 반영
  - AFA-057c UX/Accessibility Scoring — UI 현대화, UX 직관성, 접근성 점수화
    및 재작업 등록
  - AFA-057d In-app Convenience Verification — 인앱리뷰·인앱업데이트 정책과
    실패 경로 검증
- **완료 조건**:
  - [x] 설정 스키마와 기본값에 리서치/UX 품질 정책이 존재한다
  - [x] review-scoring에 경쟁사·커뮤니티 리서치, UI 현대화, UX 직관성,
    접근성 release-blocking 검사가 존재한다
  - [x] Roadmap Architect/Auditor/Completion Verifier 지시가 리서치와 UX 품질을
    로드맵·검증·재작업 대상으로 취급한다
  - [ ] 실제 앱 주제 입력 후 경쟁 앱·커뮤니티 조사 evidence가 생성된다
  - [ ] 조사 결과가 자동으로 P0/P1 로드맵과 제외 목록에 반영된다
  - [ ] 실기기/에뮬레이터에서 주요 기능 UX·접근성·인앱리뷰·인앱업데이트
    시나리오가 검증된다
- **지침**: 최신 Android API와 라이브러리 버전은 mobile docs MCP를 우선 사용하고,
  실패 시 context7 또는 공식 Android Developers/Google Play 문서를 직접 확인한다.
  경쟁사·커뮤니티 조사는 출처 URL, 확인일, 샘플 수, 반영/제외 결정을 evidence로
  남겨야 하며, 출처 없는 추정은 로드맵 근거로 사용할 수 없다.

### AFA-058 factory config 자동화 옵션 체크박스 — 🟧

- **근거**: 사용자 목표(자동화 실행 중 사용자 선택이 필요한 기능을 사전에
  체크박스로 설정) / **의존성**: AFA-002, AFA-031, AFA-040~042 /
  **위험도**: 중
- **구현 범위**: `/factory config`, `$factory config`, `factory config` 진입
  명령을 추가하고 `APP_FACTORY.automation.*` 설정을 체크박스로 편집한다.
  기본값은 에뮬레이터, 광고, 인앱결제를 제외한 프로덕션 품질 검토 기능 활성화다.
- **체크 항목**: 경쟁사·커뮤니티 리서치, UI 현대화, UX 직관성 검토, 접근성
  검토, 인앱리뷰, 인앱업데이트, 광고, 인앱결제, 스토어 준비, 관측성, 성능
  검토, 보안·개인정보 검토, 라이선스 검토, 에뮬레이터 검증.
- **완료 조건**:
  - [x] `automation.*` 스키마와 기본값이 존재한다
  - [x] `factory-config` Skill과 라우터 명령이 존재한다
  - [x] README/MVP/어댑터 생성 안내에 `config` 명령이 반영된다
  - [x] `automation.ads=false`, `automation.billing=false`가 기본값이며
    plan/config에서 명시하지 않으면 광고·인앱결제 구현을 제외한다
  - [x] `automation.emulator=false`일 때 에뮬레이터 게이트가 중간 진행을
    차단하지 않고 마지막 권유 메시지를 남긴다
  - [ ] 실제 Claude Code/Codex 환경에서 체크박스 UI가 표시되고 설정 저장이
    동작한다
- **지침**: 플랫폼이 체크박스 UI를 지원하지 않으면 목록형 선택으로 강등한다.
  에뮬레이터 기본값은 false이며, false일 때는 중간에 사용 여부를 묻지 않는다.
  최종 보고에서만 "에뮬레이터 검증을 켜고 재실행" 권유를 표시한다.

### AFA-059 factory resume 중단 복구 명령 — 🟦 (2026-08-08 구현 제출)

- **근거**: 사용자 요구(토큰 한도, 시스템 종료, 세션 강제 종료 등 어떤 이유로든
  작업 세션이 중단된 경우 `/factory resume`으로 중단 지점을 찾아 계속 진행) /
  **의존성**: AFA-003, AFA-020, AFA-026, AFA-061, AFA-031 / **위험도**: 상
- **구현 범위**: `/factory resume`, `$factory resume`, `factory resume` 진입
  Skill. `.app-factory` 상태 저장소 기준으로 최신 run/task/roadmap/gate 상태를
  읽고 stale claim을 회수한 뒤 `driveAuto(command=resume)`로 동일 지점부터
  무중단 진행한다.
- **완료 조건**:
  - [x] `factory-resume` Skill과 라우터 위임 항목이 존재한다
  - [x] Run 스키마와 MCP 타입이 `command=resume`을 허용한다
  - [x] Stop Hook이 `auto`뿐 아니라 `resume` 실행 중에도 종료를 차단한다
  - [x] `factory_recover_stale_claims` 후 상태 저장소만 보고 다음 작업을
    결정하는 드라이버 테스트가 존재한다
- **지침**: resume은 대화 이력을 신뢰하지 않는다. 복구 기준은 항상
  `.app-factory` 상태 저장소이며, 완료된 작업은 재수행하지 않는다. 위험 작업,
  승인, Placeholder, evidence, gate 정책은 `factory auto`와 동일하게 적용한다.

## M5. 어댑터 (`adapters/`)

### AFA-040 Claude Code 어댑터 — 🟧 (2026-08-08 로컬 구현 보강)

- **근거**: ROADMAP.md 5장, 설계서 3장 / **의존성**: AFA-030~032, AFA-042 / **위험도**: 상
- **구현 범위**: 플러그인 매니페스트, `/factory` 커맨드 등록, Agent →
  서브에이전트 변환, Skill 변환, MCP 서버 등록 설정, CLAUDE.md 생성기
  (공통 규칙 파일을 읽으라는 지시만 배치)
- **완료 조건**:
  - [ ] 로컬 설치 후 `/factory config|plan|init|auto|resume|test|review|status|doctor`가 모두
    호출된다
  - [x] `INSTALL.md`, `install-local.sh`, 릴리스 tarball/checksum 패키징 경로가
    제공된다
  - [x] npm 설치형 CLI(`app-factory-autopilot install claude-code`)가 제공된다
  - [x] 생성된 CLAUDE.md가 APP_FACTORY_RULES.md 참조 지시만 포함한다 (내용
    중복 없음)
  - [x] MCP 서버가 플러그인 설치와 함께 등록된다
  - [x] CLI/셸 환경에서 auto runner 또는 Stop Hook fallback으로 다음 사이클이
    사용자 입력 없이 이어진다 (AFA-026 연동)
  - [ ] 수동 `/factory auto` 실행 시 메인 세션이 서브에이전트 위임 방식으로
    장기 실행 오케스트레이터 역할을 수행한다 (AFA-061 연동)
- **로컬 검증 보강**: `tests/build-adapters.test.mjs`가 Claude Code 산출물
  매니페스트, `/factory` 커맨드, `.mcp.json`, Stop Hook, MCP `dist/` 번들,
  project-template/렌더 스크립트 동봉을 결정론적으로 검증한다. 실제
  `/factory` 호출은 Claude Code 설치 환경 필요.
- **지침**: Claude Code 플러그인 규격은 변화가 잦으므로 구현 시점에 공식
  문서로 매니페스트·커맨드·훅 스펙을 재확인한다(claude-code-guide 에이전트
  활용). 어댑터는 코어 원본을 수정 없이 소비해야 하며, 변환 불가능한 코어
  구문이 발견되면 코어를 고친다(어댑터에서 편법 금지).

### AFA-041 Codex 어댑터 — 🟧 (2026-08-08 로컬 구현 보강)

- **근거**: ROADMAP.md 5장, 설계서 3장 / **의존성**: AFA-040 (패턴 확립 후) / **위험도**: 상
- **구현 범위**: Codex 매니페스트/설정, `$factory` 진입, AGENTS.md 생성기,
  MCP 설정, 실행 래퍼
- **완료 조건**:
  - [ ] Codex 환경에서 `$factory config|plan|init|auto|resume|test|review`가 동작한다
  - [x] `.codex-plugin/plugin.json`, `.mcp.json`, `INSTALL.md`, `install-local.sh`,
    릴리스 tarball/checksum 패키징 경로가 제공된다
  - [x] npm 설치형 CLI(`app-factory-autopilot install codex`)가 제공된다
  - [x] 실행 래퍼 루프가 공정 완료까지 사이클을 자동 반복한다 (AFA-026 연동)
  - [ ] 수동 `$factory auto` 실행 시 메인 세션 또는 역할 전환 fallback이
    장기 실행 오케스트레이션을 수행한다 (AFA-061 연동)
  - [x] AGENTS.md가 공통 규칙 참조 방식으로 생성된다
  - [ ] 동일 프로젝트를 Claude Code ↔ Codex가 번갈아 열어도 상태 저장소가
    호환된다
- **로컬 검증 보강**: `tests/build-adapters.test.mjs`가 Codex 프롬프트,
  `mcp.toml`, `AGENTS.md` 템플릿, 실행 래퍼 및 실행 권한(0755), MCP `dist/`
  번들, project-template/렌더 스크립트 동봉을 검증한다.
  실제 `$factory` 호출과 교차 CLI 호환은 Codex 설치 환경 필요.
- **완료 조건 검증 주의**: Codex의 플러그인·서브에이전트 지원 수준이 Claude
  Code와 다르면 기능 축소가 필요할 수 있다 — 차이 발견 시 finding으로
  기록하고 ROADMAP.md에 제약을 명시한다.
- **지침**: Codex 쪽 스킬·명령 규격은 구현 시점의 공식 문서 기준으로
  조사부터 수행한다. 서브에이전트 미지원 시 Agent를 "프롬프트 전환" 방식
  (단일 세션 내 역할 교대)으로 강등 구현하되, worker/verifier 분리 원칙은
  세션 분리(별도 실행)로 유지한다.

### AFA-042 코어→어댑터 빌드 파이프라인 — 🟦 (2026-08-08 구현 제출 보강)

- **근거**: 통합 명세 2(SSOT) / **의존성**: AFA-030~032 원본 형식 확정 / **위험도**: 중
- **구현 범위**: `scripts/build.*` — core 원본을 읽어 adapters 산출물을
  `dist/claude-code/`, `dist/codex/`에 생성, 검증(변환 손실 검사) 포함
- **완료 조건**:
  - [x] 코어 원본 수정 → 빌드 → 양 플랫폼 산출물 갱신이 명령 한 번으로 된다
  - [x] 산출물을 수동 편집하면 다음 빌드에서 덮어써진다는 경고 헤더가 각
    산출물에 포함된다
  - [x] 빌드가 결정론적이다 (같은 입력 → 같은 출력, diff 가능)
- **검증**: `tests/build-adapters.test.mjs`가 `scripts/build-adapters.mjs`
  2회 실행 후 산출물 스냅샷 동일성을 검사한다.
- **지침**: 변환기는 템플릿 치환 수준으로 단순하게 유지한다. 플랫폼별 차이가
  커지면 변환기를 똑똑하게 만들지 말고 코어 원본의 추상화를 조정한다.

---

## M6. 게이트·검증·통합 (`tests/`)

### AFA-051 Third Party Notices·SBOM 생성기 — 🟧 (2026-08-08 로컬 구현 보강)

- **근거**: 통합 명세 3.5, 3.9 고지 게이트 / **의존성**: AFA-022 / **위험도**: 중
- **구현 범위**: Gradle 의존성 그래프 → 라이선스 수집 → THIRD_PARTY_NOTICES.md
  생성, CycloneDX 형식 기본 SBOM 생성, 갱신 검증(의존성 변경 후 미갱신 탐지)
- **완료 조건**:
  - [ ] 직접·전이 의존성이 모두 포함된다
  - [x] 라이선스 불명 의존성이 있으면 생성이 실패하고 finding이 등록된다
  - [ ] 의존성 변경 후 고지 미갱신 상태가 고지 게이트에서 탐지된다
- **로컬 검증 보강**: `scripts/generate-notices.mjs`를 import 가능한 API로
  분리했고 `tests/notices.test.mjs`가 허용 라이선스 고지/SBOM 생성,
  GPL·불명·수동검토 위반 판정을 검증한다. 직접·전이 의존성 수집은 실제
  Gradle 프로젝트의 `dependency-report.init.gradle` 산출 검증 필요.
- **지침**: 직접 구현보다 검증된 Gradle 플러그인(라이선스 리포트·CycloneDX
  계열) 활용을 우선 검토하되, 해당 플러그인 자체의 라이선스·안정 버전 검사를
  먼저 통과시킨다. 플러그인 출력이 정책 엔진(AFA-022) 입력 형식과 다르면
  변환 계층을 둔다.

### AFA-052 기본 에뮬레이터 실행 검증 — 🟧 (2026-08-08 로컬 구현 보강)

- **근거**: 통합 명세 3.2, 3.9 실행 게이트 / **의존성**: AFA-050 / **위험도**: 중
- **구현 범위**: 에뮬레이터/디바이스 감지 → APK 설치 → 앱 실행 → 초기 크래시
  감지(프로세스 생존 + Logcat FATAL 스캔) → 스크린샷 1장 → 증거 등록
- **완료 조건**:
  - [x] `automation.emulator=false`이면 중간 진행을 차단하지 않고 마지막
    권유 메시지를 남긴다
  - [ ] `automation.emulator=true`이고 실행 가능한 디바이스가 없으면 게이트가
    `BLOCKED`(skip 아님)로 기록되고 사용자 안내가 남는다
  - [ ] 앱 실행 10초 내 크래시가 탐지되어 finding으로 등록된다
  - [ ] 스크린샷이 증거로 저장된다
- **지침**: MVP-1 범위는 "설치·실행·크래시 확인"까지다 — 시나리오 자동화는
  MVP-5로 미룬다(범위 방어). 구현은 adb 직접 호출을 기본으로 하고
  mobile-mcp가 설치된 환경에서는 그것을 우선 사용한다(Capability Doctor
  연계). 기본값은 `automation.emulator=false`이므로 코드는 가능한 만큼
  구현·정적 검증하고 마지막에 에뮬레이터 검증 사용을 권유한다. 사용자가
  `automation.emulator=true`로 켠 경우 디바이스 부재는 `BLOCKED`로 남기되,
  3.17 질문 지연 원칙에 따라 `pending_decisions`로 적체하고 나머지 게이트를
  마저 수행한 뒤 종료 보고에 포함한다.
- **로컬 검증 보강**: `scripts/emulator-smoke.sh`는 PATH 외에도
  `ANDROID_HOME`, `ANDROID_SDK_ROOT`, `~/Android/Sdk` 아래의 adb를 탐색한다.
  연결 디바이스 없음 상태를 `blocked`로 기록하는 경로를 테스트했다. 실제
  APK 설치·실행·스크린샷 증거는 각 사용자 환경의 연결 디바이스에서 수행한다.

### AFA-053 E2E: 빈 폴더 신규 개발 시나리오 — 🟧 (2026-08-08 로컬 구현 보강)

- **근거**: 통합 명세 3.11 DoD 1·2·4·15 / **의존성**: M2~M5 전체 / **위험도**: 상
- **구현 범위**: 빈 폴더 → `factory plan`(모의 응답 주입) → `factory auto`
  → 소형 샘플 앱 로드맵 구현·검증까지의 자동화 통합 테스트
- **완료 조건**:
  - [x] plan 산출물 17종이 생성되고 스키마 검증을 통과한다
  - [ ] `assembleDebug` 성공, 로드맵 필수 항목 `VERIFIED` 도달
  - [ ] 전 과정에서 사용자 확인 없는 위험 작업(3.9)이 실행되지 않았음이
    로그로 확인된다
  - [ ] `factory auto` 단일 명령으로 완료 게이트까지 도달한다 — 중간에
    사용자가 직접 `resume`을 다시 입력해야 했다면 실패로 판정
    (통합 명세 3.10 / DoD 15)
  - [x] 각 사이클 종료 시 3.15 진행 보고 4요소가 run 기록에 남아 있다
    (DoD 13 검증)
- **로컬 검증 보강**: 템플릿 렌더링과 산출물 스키마 검증, 진행 보고 생성은
  로컬 테스트로 확인했다. `factory auto` 단일 명령으로 실제 Android 샘플 앱을
  생성·빌드·검증하는 통합 실측은 플러그인+Android SDK 환경이 필요하다.
- **지침**: E2E의 LLM 구간은 비결정적이므로 "인터뷰 응답 주입 + 결과물 검증"
  구조로 만들고, 실패 시 재현을 위해 Run ID 전체 로그를 보존한다. 샘플 앱은
  화면 2개 수준의 최소 앱으로 고정한다(테스트 시간 관리).

### AFA-054 E2E: 중단 후 재개 시나리오 — 🟦 (2026-08-05 구현 제출)

- **근거**: 통합 명세 3.11 DoD 9 / **의존성**: AFA-053 / **위험도**: 중
- **완료 조건**:
  - [x] 구현 루프 중간에 강제 종료 후 `factory auto` 재실행 시 완료 작업을
    건너뛰고 이어서 진행한다
  - [x] 클레임된 채 중단된 작업이 stale 클레임 회수 후 재할당된다
- **로컬 검증 보강**: 상태 저장소 기반 재개와 stale claim 회수는 드라이버
  테스트로 검증했다. 실제 CLI 강제 종료 재현은 AFA-053 통합 환경에서 추가로
  확인한다.
- **지침**: 중단 지점을 단계별(초기화 직후·구현 중·검증 중)로 3케이스 이상
  테스트한다. 잠금 회수(AFA-003)의 실제 동작 검증이 핵심이다.

### AFA-055 E2E: 기존 프로젝트 init 시나리오 — 🟧 (2026-08-08 로컬 구현 보강)

- **근거**: 통합 명세 3.11 DoD 3 / **의존성**: AFA-053 / **위험도**: 중
- **완료 조건**:
  - [ ] 준비된 기존 Android 프로젝트 픽스처에서 `factory init` 실행 시
    모듈·Gradle·라이브러리 분석 결과가 상태 저장소에 기록된다
  - [ ] 기존 구현과 로드맵이 동기화되고 미확정 항목이 Placeholder로 등록된다
  - [ ] 기존 소스가 수정되지 않는다 (init은 읽기 전용 + `.app-factory` 생성)
- **지침**: 픽스처는 "잘 만든 프로젝트" 1개와 "문제 있는 프로젝트"(버전
  하드코딩·라이선스 불명 의존성 포함) 1개, 두 개를 준비해 분석 능력을 함께
  검증한다.
- **로컬 검증 보강**: 기존 구현 후보를 `VERIFIED`로 확정하지 못하게 하는
  상태 전이·검증자 역할 제약은 코어 테스트로 확인했다. Android 픽스처 기반
  `factory init` 실측은 남아 있다.

### AFA-056 E2E: 부분 구현 탐지 시나리오 — 🟧 (2026-08-08 로컬 구현 보강)

- **근거**: 통합 명세 3.11 DoD 5·6 / **의존성**: AFA-053 / **위험도**: 상
- **완료 조건**:
  - [ ] 의도적으로 삽입한 4종 결함(빈 함수, 호출되지 않는 코드, TODO 잔존,
    Mock 데이터 반환)이 각각 Completion Verifier에서 탐지된다
  - [x] 탐지 항목이 `IMPLEMENTED` → `PARTIAL`로 강등되고 재작업 큐에
    등록된다
  - [x] worker role의 `VERIFIED` 전이 시도가 거부된다 (AFA-021 통합 검증)
- **로컬 검증 보강**: 강등·재작업 큐 등록과 worker의 `VERIFIED` 전이 거부는
  코어 테스트로 검증했다. 결함 4종을 LLM Completion Verifier가 실제로
  찾아내는 플러그인 실측은 남아 있다.
- **지침**: 이 테스트가 MVP-1의 핵심 가치("부분 구현을 완료로 인정하지
  않는다")를 증명한다. 결함 주입은 픽스처 브랜치로 관리하고, 탐지 실패는
  릴리스 차단 결함으로 취급한다.

---

### AFA-060 factory test 에뮬레이터 전수검사 명령 — 🟧 (2026-08-08 로컬 구현 보강)

- **근거**: 사용자 요구(`factory review`와 달리 에뮬레이터 사용을 전제로 모든
  시나리오·버튼·기능·예상 화면·출력의 스크린샷 기반 전수검사) / **의존성**:
  AFA-031, AFA-052, AFA-056 / **위험도**: 상
- **구현 범위**: `/factory test`, `$factory test`, `factory test` 진입 Skill.
  실행 시 에뮬레이터 사용을 승인한 것으로 간주하고 `automation.emulator=true`를
  저장한다. 사용자 관점 시나리오 체크리스트, 디바이스 매트릭스(폰/가로/폴더블/
  태블릿/특정 크기), 예상 화면·출력, 버튼·기능 체크리스트를 evidence로 남기고,
  모든 시나리오 결과를 `emulator_scenario_result`로 기록한다. 실패는 즉시
  finding과 P0 fix 작업으로 등록한다.
- **완료 조건**:
  - [x] `factory-test` Skill과 라우터 위임 항목이 존재한다
  - [x] Run 스키마와 MCP 타입이 `command=test`를 허용한다
  - [x] `factory_test_prepare`가 에뮬레이터 승인 설정과 시나리오 체크리스트
    evidence를 생성한다
  - [x] 명시 시나리오가 없으면 APP_FACTORY 기능 목록 또는 기본 실행 흐름에서
    전수검사용 시나리오를 자동 생성한다
  - [x] `factory_test_record_result`가 실패 체크를 finding과 P0 fix 큐로 등록한다
  - [x] Stop Hook이 `test` 실행 중에도 종료를 차단한다
  - [ ] 실제 mobile-mcp 또는 adb 에뮬레이터에서 모든 시나리오 × 디바이스
    프로필 스크린샷 검증이 통과한다
- **지침**: mobile-mcp가 설치되어 있으면 우선 사용한다. 없으면 Android SDK
  `adb` 기반 스크립트를 폴백으로 사용한다. 테스트 도중 발견된 오류는 문서화에
  그치지 않고 즉시 수정·재실행·commit·push까지 수행한다.

---

## 🟧 항목의 잔여 검증 (2026-08-08 로컬 구현 보강 후)

로컬에서 결정론적으로 검증 가능한 코어 경로는 대부분 구현·테스트되었고,
다음 항목은 **플러그인 실환경, Android SDK, 에뮬레이터/실기기, 또는 실제
네트워크 조사**가 필요해 PARTIAL로 표기한다. 각각의 잔여 작업:

| 항목 | 잔여 검증 | 필요 환경 |
|------|-----------|-----------|
| AFA-033 | 실제 설치 명령 실행, 전역 관리문서 반영 확인 | Claude Code 플러그인 설치 환경 |
| AFA-035 | 스캐폴드 치환 후 `assembleDebug` 성공 | Gradle wrapper/Android 빌드 환경 |
| AFA-036 | 안전 수정 자동 실행과 위험 수정 보류의 provider 실동작 | 플러그인 실환경 |
| AFA-040 | 플러그인 설치, /factory 호출, auto 자동 재개 동작 | Claude Code 실환경 |
| AFA-041 | $factory 동작, 래퍼 루프, 상태 저장소 교차 호환 | Codex CLI 실환경 |
| AFA-061 | 수동 provider 세션에서 메인 오케스트레이터가 서브에이전트 위임, checkpoint, 압축 후 resume을 반복 | Claude Code/Codex/Vibe Coder 실환경 |
| AFA-051 | init.gradle의 실제 직접·전이 의존성 그래프 추출, 고지 미갱신 게이트 | Gradle 프로젝트 |
| AFA-052 | 실제 디바이스 설치·실행·스크린샷 | 에뮬레이터/실기기 |
| AFA-060 | 모든 시나리오 × 디바이스 프로필 스크린샷 전수검사 | mobile-mcp 또는 adb 에뮬레이터 |
| AFA-057 | 실제 앱 주제 기반 경쟁 앱·커뮤니티 조사, 로드맵 반영, UX/접근성 실측 | 네트워크 조사 + 플러그인 실환경 |
| AFA-058 | 체크박스 UI 표시와 APP_FACTORY 설정 저장 | Claude Code/Codex 실환경 |
| AFA-053 | plan(모의 주입)→auto→샘플 앱 완주 실측 | 플러그인+Android SDK |
| AFA-055 | 픽스처 2종(정상/문제 프로젝트) 분석 실측 | Android 픽스처 |
| AFA-056 | 4종 결함의 LLM 탐지 실측 (강등·차단 코어는 테스트 완료) | 플러그인 실환경 |

## 이 로드맵의 갱신 절차

1. 작업 착수 시 해당 항목을 🟨 `IN_PROGRESS`로 변경하고 커밋한다.
2. 구현 완료 시 🟦 `IMPLEMENTED`로 변경한다 — 완료 조건 체크박스를 함께
   갱신하되, 이 시점에는 ✅로 바꾸지 않는다.
3. 별도 세션(가능하면 다른 Provider)에서 완료 조건을 검증한 뒤에만 ✅
   `VERIFIED`로 변경한다. 검증 근거(테스트 실행 결과 등)를 CHANGELOG.md에
   기록한다.
4. 검증 중 결함 발견 시 🟧 `PARTIAL`로 강등하고 결함 내용을 항목에 추기한다.
5. 범위 변경(항목 추가·삭제·분할)은 이 문서의 통합 명세와 정합성을 확인하고
   CHANGELOG.md에 사유를 기록한다.
6. **전체 진행도**는 통합 명세 3.9 공식을 이 로드맵에도 적용해 계산한다:
   구현 항목(AFA-*)의 상태 가중치(⬜0 / 🟨25 / 🟧50 / 🟦75 / ✅100) 평균.
   이 로드맵의 AFA-* 는 전부 필수(P0·P1)이므로 "필수 항목만 분모"
   원칙과 일치한다. 결정 항목(D-*)은 해소 여부만 별도 표기하고 분모에서
   제외한다. 매 턴 종료 보고에 이 수치를 사용한다.
