# App Factory Autopilot — MVP-1 공식 명세서

- 문서 버전: 1.0.0
- 작성일: 2026-08-05
- 원본 설계서: [`mvp.txt`](./mvp.txt) (App Factory Autopilot 통합 설계서)
- 범위 기준: 통합 설계서 21장 "MVP 0.1 범위"를 MVP-1 공식 범위로 채택
- 상태: 확정 (구현 착수 기준 문서)

---

## 1. 목적

App Factory Autopilot은 빈 폴더에서 Android 앱 기획을 시작하여 경쟁 앱·
커뮤니티 의견 조사, 요구사항 수집, 기술 결정, 로드맵 작성, 구현, 빌드/테스트,
UX·접근성·정책 검증, 최종 완료 판정까지 자동화하는 앱 개발 오케스트레이션
시스템입니다.

MVP-1의 목적은 이 시스템의 **최소 완결 공정**을 완성하는 것입니다. 지원하는
두 가지 시작 경로는 다음과 같습니다.

- **빈 폴더에서 신규 개발**: `factory plan` → `factory auto` → `factory review`
- **기존 프로젝트에 도입**: `factory init`(코드베이스 분석·온보딩) →
  `factory plan`(부족한 계획 보완) → `factory auto` → `factory review`

이 명령들만으로 사용자는 다음을 얻을 수 있어야 합니다.

1. 대화형 인터뷰를 통한 프로젝트 계획과 1차 로드맵
2. 기존 코드베이스 분석과 로드맵·구현 상태 동기화 (기존 프로젝트 도입 시)
3. 빈 폴더에서 생성된 Android 프로젝트와 1차 로드맵 구현
4. 중단 지점과 무관하게 현재 상태를 분석해 알아서 이어가는 자동 진행
5. 구현과 독립된 완료 검증(부분 구현·완료 오표기 탐지 포함)
6. 경쟁사 앱·커뮤니티 의견·사용자 리뷰를 반영한 제품 수준의 UX와 기능 완성도

## 2. 핵심 설계 원칙 (MVP-1에서 반드시 지켜야 함)

1. **구현과 완료 판정의 분리**
   - 구현 Agent는 자신이 구현한 작업을 완료 상태로 직접 변경할 수 없습니다.
   - 구현 Agent는 `IMPLEMENTED` 상태까지만 요청할 수 있습니다.
   - 별도의 Completion Verifier가 독립 검증을 통과시킨 항목만 `VERIFIED`가 됩니다.
   - 완료로 인정되는 상태는 `VERIFIED`뿐입니다.
2. **거대 단일 프롬프트 금지**
   - 결정론적 오케스트레이터 + 상태 머신 + 전문 Agent + 재사용 Skill + MCP 서버로 분리합니다.
3. **플랫폼 비종속**
   - Claude Code와 Codex 모두에서 동작해야 하며, 특정 AI 도구 내부 기능에 강하게
     종속되지 않습니다. 공통 코어 원본은 하나만 유지하고 어댑터가 변환합니다.
4. **모르는 값은 지어내지 않음**
   - 확정되지 않은 항목은 명시적 Placeholder(`${PLACEHOLDER_*}`)로 기록하고
     종류, 중요도, 해결 시점, 자동 진행 가능 여부를 함께 관리합니다.
5. **증거 기반 완료 판정**
   - 증거(코드, 호출 경로, 테스트, 빌드 로그, 실행 결과)가 없는 완료 주장은
     인정하지 않습니다.
6. **규칙 단일 원본(SSOT)**
   - 공통 규칙은 `APP_FACTORY_RULES.md` 하나만 원본으로 유지합니다.
   - `CLAUDE.md`와 `AGENTS.md`에는 플랫폼별 진입 규칙과 "공통 규칙 파일을 읽어라"는
     지시만 배치하며 내용을 중복 관리하지 않습니다.

## 3. MVP-1 범위 (In Scope)

통합 설계서 21장 기준. 아래 항목은 MVP-1에서 **반드시** 포함합니다.

### 3.1 사용자 명령

MVP-1은 다음 6개 명령을 **필수**로 포함합니다. (2026-08-05 사용자 결정으로
원본 설계서의 plan/go/review 3종 체계를 확장, 2026-08-08 `config`와
`resume` 추가)

| 명령 | Claude Code | Codex | 공통 CLI | 역할 |
|------|-------------|-------|----------|------|
| config | `/factory config` | `$factory config` | `factory config` | 자동화 실행 옵션 체크박스 설정 — 기본은 에뮬레이터·광고·인앱결제 제외 |
| plan | `/factory plan "앱 설명"` | `$factory plan "앱 설명"` | `factory plan "앱 설명"` | 대화형 인터뷰 → 계획·1차 로드맵 생성 (코드 구현 안 함) |
| init | `/factory init` | `$factory init` | `factory init` | **기존 프로젝트에 App Factory Autopilot 도입** — 코드베이스 분석(모듈 구조, Gradle 설정, 기존 라이브러리, 구현 상태), `.app-factory` 상태 저장소 생성, 현재 구현 상태와 로드맵 동기화 |
| auto | `/factory auto` | `$factory auto` | `factory auto` | **어디까지 진행되었는지 현재 프로젝트를 분석하고 알아서 진행** — 상태 저장소와 실제 코드를 대조해 다음 단계를 스스로 선택하여 전체 공정(빈 폴더면 프로젝트 생성부터, 이후 구현→빌드→테스트→검증→게이트)을 **중단 없이 완료까지** 자동 수행 (3.17) |
| resume | `/factory resume` | `$factory resume` | `factory resume` | 토큰 한도, 시스템 종료, 세션 강제 종료 등 어떤 이유로든 중단된 실행을 `.app-factory` 상태 저장소 기준으로 찾아 재개 |
| review | `/factory review` | `$factory review` | `factory review` | 구현을 신뢰하지 않는 전체 재감사 |

보조 명령으로 `factory status`(현재 상태 요약 조회)와 `factory doctor`(개발
환경 필수 역량 점검·설치 제안, 3.14 참조)를 포함합니다. 원본 설계서의
`factory go`는 `factory auto`의 호환 별칭으로 유지합니다. `factory auto`도
상태 저장소 기준으로 재진입 가능하지만, `factory resume`은 중단 복구 의도를
run 기록에 남기고 stale claim 회수와 최신 run/task/roadmap/gate 상태 탐색을
우선 수행합니다.

모든 표현은 플랫폼과 무관하게 내부적으로 동일한 Factory 워크플로를 실행합니다.
플러그인은 향후 명령을 추가할 수 있는 확장 가능한 명령 라우팅 구조를 가져야
합니다.

### 3.1.1 factory config

`factory config`는 자동화 실행 범위를 체크박스로 설정합니다. 기본값은
프로덕션 품질 검토 기능 활성화이며, 예외적으로 에뮬레이터 실행 검증, 광고,
인앱결제는 기본 비활성화합니다. 광고와 인앱결제는 plan/config에서 사용자가
명시한 경우에만 탑재합니다.

체크 항목은 경쟁사·커뮤니티 리서치, UI 현대화, UX 직관성 검토, 접근성 검토,
인앱리뷰, 인앱업데이트, 광고, 인앱결제, 스토어 준비, 관측성, 성능 검토,
보안·개인정보 검토, 라이선스 검토, 에뮬레이터 검증입니다.

`automation.emulator=false`이면 `factory auto`는 중간에 에뮬레이터 사용 여부를
묻지 않습니다. 코드로 구현 가능한 기능과 정적·단위·빌드 기반 검증을 최대한
완료한 뒤 마지막 보고에서만 에뮬레이터 검증 사용을 권유합니다.

### 3.2 기능 범위

**계획 단계 (factory plan)**
- 빈 폴더에서 실행 가능
- 경쟁 앱, 사용자 리뷰, 커뮤니티 의견 조사 결과를 요구사항과 로드맵에 반영
- 대화형 요구사항 수집 (묶음 단위 질문, 중복 질문 금지, 자동 결정 가능 항목은 추천값 제시)
- Placeholder 관리 (생성·목록·해결·릴리스 차단 구분)
- 1차 로드맵 생성 (항목별 고유 ID, 요구사항, 구현 범위, 완료 조건, 테스트 조건,
  실행 검증 조건, 의존성, 우선순위, 위험도 포함 — 단순 체크리스트 금지)

**도입 단계 (factory init — 기존 프로젝트 전용)**
- 기존 코드베이스 분석: 모듈 구조, Gradle 설정, 기존 라이브러리, 현재 구현 상태
  요약 (Project Explorer 수행)
- `.app-factory` 상태 저장소 생성 및 로드맵·구현 상태 동기화
- 분석 결과를 바탕으로 미확정 항목을 Placeholder로 등록

**자동 진행 단계 (factory auto)**
- 진행 상태 분석: `.app-factory` 상태 저장소와 실제 코드·빌드 결과를 대조해
  현재 공정 위치를 판정하고, 다음 단계를 스스로 선택해 자동 진행
- 빈 폴더면 Android 프로젝트 생성부터 시작: 기술 스택 구성, Gradle 설정,
  Build Type(Debug/Release), 기본 패키지 구조 생성
- 이미 진행 중이면 중단 지점부터 이어서 진행 (완료 작업 재수행 금지)
- 공식 문서 인덱싱 (기본 수준: 사용 라이브러리의 공식 문서·릴리스 확인)
- 최신 Android 편의 기능 구현: 인앱업데이트, 인앱리뷰, 광고/결제 복원,
  Material 3/Adaptive UI, 접근성 semantics/TalkBack 흐름을 설정과 로드맵에
  따라 구현
- Version Catalog 중앙 버전 관리, 하드코딩 버전 탐지, 동적/플러스 버전 금지
- Dependency Locking, Dependency Verification Metadata
- SPDX 기반 라이선스 정책 (자동 허용 / 자동 차단 / 수동 검토 3분류)
- Third Party Notices 생성, 기본 SBOM 생성
- 빌드 게이트, 단위 테스트 게이트, Lint 게이트
- 기본 에뮬레이터 실행 검증 (설치·실행·크래시 확인 수준)
- 중단 후 재개 (`.app-factory` 상태 저장소 기반, 완료 작업 재수행 금지 —
  `factory auto` 재실행만으로 이어짐)

**검증 단계 (factory review + 공정 내 검증)**
- 독립 완료 검증 (Completion Verifier)
- 부분 구현·완료 오표기 탐지: 호출되지 않는 코드, 빈 UI, Mock 데이터, TODO,
  Placeholder 잔존, 실패 경로 누락, 테스트 없는 구현 발견 시 완료 취소 및 재등록
- 자동 수정이 안전한 항목은 수정 작업으로 재등록, 위험 항목은
  `NEEDS_HUMAN_DECISION`으로 보류
- 영역별 점수화(0~100) → 목표 점수·개선 계획 제시 → 수정 → 전/후 점수 비교
  (상세: 3.16)
- 주요 기능 UX 직관성, UI 현대화, 접근성, 경쟁사·커뮤니티 리서치 반영 여부는
  릴리스 차단 또는 목표 점수 미달 finding으로 처리

### 3.3 Agent 범위 (8종)

| Agent | 책임 요약 |
|-------|-----------|
| Factory Orchestrator | 전체 공정 제어. 상태 읽기 → 다음 단계 선택 → 전문 Agent 호출 → 결과 형식 검증. 실패 횟수·재시도·작업 예산·승인 차단·중단 후 재개 관리. 직접 대규모 코드 수정 금지 |
| Project Explorer | 폴더/프로젝트 상태 분석 (빈 폴더 여부, 모듈 구조, Gradle 설정, 기존 라이브러리, 구현 상태 요약) |
| Roadmap Architect | 인터뷰 결과 기반 1차 로드맵 작성 (기능/비기능 구분, 의존성 정리, 테스트 가능한 완료 조건, Placeholder 명기) |
| Roadmap Auditor | 로드맵 누락·모순 검사 (불명확한 완료 조건, 테스트 불가 요구사항, 순서 오류, 광고/결제/개인정보/접근성/보안/라이선스/버전 누락) |
| Implementation Worker | 승인된 로드맵 항목 구현. 한 번에 하나(또는 작은 묶음)만 수행. 코드와 테스트 동시 작성. 변경 파일·빌드 결과 보고. **VERIFIED로 변경 금지**. 새 라이브러리 필요 시 Dependency Request 생성 |
| Completion Verifier | 구현과 독립적으로 검증. 코드 존재, 호출 경로, UI 연결, 성공/실패 경로, 설정값 반영, Mock/TODO/빈 함수 잔존, 테스트 유효성, 빌드·실행 증거 확인. 통과 항목만 `VERIFIED` 변경 |
| Dependency Version Manager | 최신 **안정화** 버전을 공식 문서에서 확인 (단순 최대 버전 선택 금지). Kotlin/AGP/Gradle/JDK/SDK 호환성, Compose BOM 정렬 확인. Preview 계열(Alpha/Beta/RC/Canary/Nightly/Snapshot)은 사용자 승인 없이 사용 금지 |
| License Compliance Auditor | 직접·전이 의존성 및 폰트/이미지/아이콘/음원/로컬 AAR·JAR·SO 라이선스 검사. SPDX 정규화. 불명확 시 자동 차단, 법적 판단 필요 시 `NEEDS_LEGAL_OR_OWNER_APPROVAL` 중단. `LICENSE_REVIEW.md`·Third Party Notices 생성 |

> Official Docs Indexer의 "공식 문서 인덱싱" 기능은 MVP-1에서 기본 수준으로
> 포함하되(3.2 참조), 고도화(캐시, 호환성 매트릭스, Deprecated 탐지)는 MVP-2로
> 이연합니다.

### 3.4 로드맵 상태 머신

```
NOT_STARTED → IN_PROGRESS → IMPLEMENTED → VERIFIED
                   │              │
                   ├→ PARTIAL ────┘ (재작업 등록)
                   ├→ BLOCKED
                   └→ NEEDS_HUMAN_DECISION
```

| 상태 | 정의 |
|------|------|
| `NOT_STARTED` | 구현 미시작 |
| `IN_PROGRESS` | 구현 중 |
| `PARTIAL` | 일부만 구현되었거나 핵심 경로 누락 |
| `IMPLEMENTED` | 구현 Agent가 완료 제출 (완료 아님) |
| `VERIFIED` | Completion Verifier 독립 검증 통과 (**유일한 완료 상태**) |
| `BLOCKED` | 외부 정보·사용자 결정·기술 문제·승인 대기로 진행 불가 |
| `NEEDS_HUMAN_DECISION` | 자동 판단으로 진행하면 위험 |

### 3.5 라이브러리 추가 승인 절차

1. Implementation Worker가 직접 추가하지 않고 **Dependency Request** 생성
2. Dependency Version Manager: 공식 문서·릴리스에서 최신 안정화 버전 및 호환성 확인
3. License Compliance Auditor: 직접·전이 의존성 라이선스 확인 + 보안·공급망 검사
4. 모든 검사 통과 후에만 Version Catalog에 추가
5. 추가 후: 의존성 그래프 확인 → Locking 갱신 → Verification Metadata 갱신 →
   빌드 → 단위 테스트 → Lint → 라이선스 고지 갱신 → SBOM 갱신 → `DEPENDENCIES.md` 갱신

### 3.6 기본 라이선스 정책 (상업용 비공개 소스 기준, 보수적 기본값)

- **자동 허용**: Apache-2.0(NOTICE 의무 추가 확인), MIT, BSD-2-Clause,
  BSD-3-Clause, ISC, Zlib, 0BSD, CC0-1.0, Unlicense
- **자동 차단**: GPL-1.0/2.0/3.0 계열, AGPL 계열, SSPL, Commons Clause,
  비상업 전용, 라이선스 불명, NOASSERTION, 출처 불명 커스텀
- **수동 검토**: LGPL 계열, MPL-2.0, EPL 계열, CDDL 계열,
  Classpath Exception 포함 GPL, Dual License, 상용+오픈소스 병행 라이브러리
- 라이선스 정책은 법률 자문을 대신하지 않으며, 자동 시스템은 보수적으로 차단하고
  사용자 또는 법률 검토자 승인 시에만 예외를 허용합니다.

### 3.7 상태 저장과 중단 후 재개

전체 상태는 대상 프로젝트의 `.app-factory/` 디렉터리에 저장합니다.

```
.app-factory/
├── config/        # 프로젝트 설정 스냅샷
├── state/         # 워크플로·로드맵 상태
├── task-queue/    # 작업 큐 (작업별 고유 ID)
├── findings/      # 발견 사항 (Finding ID)
├── approvals/     # 승인 요청·결과
├── budgets/       # 작업 예산
├── cycles/        # 반복 주기 기록
├── runs/          # 실행 기록 (Run ID)
├── evidence/      # 증거 저장소
└── reports/       # 보고서
```

- 중단 후 `factory auto` 재실행 시 이전 상태를 읽고 이어서 진행합니다.
- 완료된 작업은 다시 수행하지 않습니다. 단, `factory review`에서 완료 오표기가
  발견되면 해당 작업을 다시 엽니다.

### 3.8 증거 관리

모든 완료 판정에 증거가 필요합니다. MVP-1 증거 종류: 변경 코드, 요구사항-구현
위치 연결, 호출 경로, 단위 테스트, 빌드 로그, Lint 결과, 의존성 그래프, 라이선스
보고서, SBOM, 에뮬레이터 실행 결과(기본 수준), 검증 Agent 보고서.

### 3.9 게이트와 종료 조건

**MVP-1 필수 게이트**

| 게이트 | 통과 조건 |
|--------|-----------|
| 빌드 게이트 | `assembleDebug` 성공 (필요 시 Release 빌드 포함) |
| 단위 테스트 게이트 | 단위 테스트 전체 성공 |
| Lint 게이트 | 중대 오류 없음 |
| 완료 검증 게이트 | 로드맵 필수 항목 모두 `VERIFIED`, 완료 오표기 없음 |
| Placeholder 게이트 | 릴리스 차단 Placeholder 없음 |
| 라이선스 게이트 | 라이선스 불명 의존성 없음, 미승인 GPL/AGPL 없음 |
| 버전 게이트 | 미승인 Preview 라이브러리 없음, Version Catalog 외부 버전 없음 |
| 고지 게이트 | Third Party Notices·SBOM 갱신 완료 |
| 실행 게이트 | 기본 에뮬레이터 실행 검증 통과 |

**강제 중단 조건 (사용자에게 선택지·근거·위험·추천안 보고 후 대기)**

동일 오류 최대 재시도 초과, 데이터 손실 가능성, 파괴적 DB 마이그레이션, 대규모
아키텍처 변경, 서명키 변경, 실제 배포, Git Push, 프로덕션 릴리스, 결제 상품 변경,
광고 정책 변경, 개인정보처리방침 변경, 라이선스 해석 불명확, GPL/AGPL 예외 승인
요청, 상업용 라이선스 구매 필요, API 비용 발생, 외부 서비스 계정 필요, 요구사항
충돌, 테스트 환경 신뢰 불가.

### 3.10 factory plan 산출물 (대상 프로젝트에 생성)

`APP_FACTORY.yaml`(전체 설정 기준 파일), `APP_FACTORY_RULES.md`,
`PROJECT_SPEC.md`, `ROADMAP.md`, `REQUIREMENTS_TRACEABILITY.md`,
`TEST_MATRIX.md`, `DOCS_INDEX.md`, `USER_VALUE.md`, `DEPENDENCIES.md`,
`DEPENDENCY_MIGRATIONS.md`, `LICENSE_POLICY.yaml`, `LICENSE_REVIEW.md`,
`THIRD_PARTY_NOTICES.md`, `EMULATOR_SCENARIOS.md`, `QUALITY_FINDINGS.md`,
`PLACEHOLDERS.md`, `APPROVALS.md`

### 3.11 인터뷰 항목 (factory plan)

통합 설계서 5장을 그대로 따릅니다. 묶음 단위로 진행하며 10개 영역을 다룹니다.

1. 앱 기본 정보 (이름, 패키지명, 수익 모델, 개발자 정보 등 — 패키지명은
   `factory init` 전 확정 요구, 미확정 시 임시 패키지명 사용 여부 별도 확인)
2. 핵심 기능 (CORE / SUPPORTING / OPTIONAL 3등급 분류)
3. UI와 UX (미지정 시 권장 스택 제안: Kotlin, Jetpack Compose, Material 3,
   MVVM, Repository, UDF, Hilt, Coroutines, Flow, Room, DataStore,
   WorkManager, Navigation, Gradle Version Catalog)
4. 광고 (미사용 시 질문 생략, 릴리스 빌드 테스트 ID 잔존 검증 필수)
5. 인앱결제 (plan에서 명시하지 않으면 제외, 미사용 시 관련 라이브러리 미추가)
6. 인앱리뷰
7. 인앱업데이트
8. 데이터와 보안
9. 서명과 배포 (Keystore 비밀번호·API Secret 일반 텍스트 저장 금지,
   미확정 서명 정보는 Placeholder + 릴리스 차단)
10. 버전과 라이선스 정책

**기본값 정책 (2026-08-05 사용자 결정)**

- **구현 언어·런타임**: plan 인터뷰에서 사용자에게 입력받습니다. 미입력 시
  기본값은 **Kotlin**(Android 개발 기준)이며, 위 3번의 권장 스택을 함께
  적용합니다. 사용자가 다른 언어·런타임을 지정하면 해당 선택을
  APP_FACTORY.yaml에 기록하고 지원 가능 여부를 확인합니다.
- **기본 언어·다국어**: 미입력 시 앱 기본 언어는 **영어**입니다. 다국어 지원
  구조(strings.xml 리소스 분리, 하드코딩 문자열 금지, 로케일 확장 가능 구조)는
  사용 언어 수와 무관하게 **처음부터 기본으로 적용**하고 개발합니다.

### 3.12 공통 Skill (MVP-1 구현 대상)

MVP-1 범위에 해당하는 Skill만 우선 구현합니다.

- 진입: `factory`, `factory-plan`, `factory-init`, `factory-auto`,
  `factory-review`, `factory-status` (`factory-go`는 `factory-auto` 별칭)
- 공정: `project-explore`, `roadmap-create`, `roadmap-audit`,
  `roadmap-implement`, `completion-verify`, `final-gate`
- 의존성/라이선스: `dependency-version-review`, `license-compliance-review`,
  `dependency-report`, `license-report`
- 문서/Placeholder: `official-docs-index`(기본 수준), `placeholder-audit`

각 Skill은 Claude Code와 Codex 공통 원본을 사용하고, 플랫폼별 빌드에서 호출
방식과 메타데이터만 변환합니다.

### 3.13 공통 MCP 서버 (`app-factory-core`)

MVP-1에서 구현하는 도구 그룹:

- 공정: `factory_initialize`, `factory_get_status`, `factory_get_next_task`,
  `factory_claim_task`, `factory_submit_result`, `factory_complete_task`,
  `factory_reopen_task`, `factory_start_cycle`, `factory_finish_cycle`,
  `factory_abort_cycle`
- 로드맵: `roadmap_parse`, `roadmap_get_items`, `roadmap_update_status`,
  `roadmap_validate_traceability`
- 발견 사항: `finding_create`, `finding_list`, `finding_resolve`, `finding_reopen`
- 증거: `evidence_register`, `evidence_get`, `evidence_validate`
- 게이트: `gate_run`, `gate_get_result`
- 의존성: `dependency_request`, `dependency_review_version`,
  `dependency_review_license`, `dependency_approve`, `dependency_reject`
- 승인: `approval_request`, `approval_get_status`
- Placeholder: `placeholder_create`, `placeholder_resolve`, `placeholder_list_blocking`

> `skill_discover`, `skill_get_next`, `skill_mark_result`는 Quality Sweeper용이므로
> MVP-4로 이연합니다.

MCP는 자연어 판단보다 정확한 상태 저장, 작업 잠금, 결과 기록, 승인 처리, 증거
검증을 담당합니다. 상태 변경의 단일 진입점은 MCP이며, Agent가 상태 파일을 직접
수정하지 않습니다.

### 3.14 필수 역량 점검·설치 제안 (Capability Doctor)

Android 앱 개발 공정에 필요한 스킬, MCP 서버, 서브에이전트("역량")가 현재
Provider 환경에 설치되어 있는지 점검하고, 미설치 항목을 **사용자 확인 후**
일괄 설치하도록 제안하는 기능입니다. (2026-08-05 사용자 요구로 MVP-1에 추가)

**동작 방식**

1. **점검(scan)**: 역량 카탈로그(`core/policies/capability-catalog.yaml`,
   SSOT)와 현재 환경에 설치된 스킬·MCP·서브에이전트 목록을 대조합니다.
2. **제안(propose)**: 미설치 항목을 카테고리별로 묶어 표로 보여주고, 사용자가
   설치 원하는 항목을 **체크 방식으로 선택**하게 합니다. 각 항목에는 이름,
   용도, 우선순위(required / recommended / optional), API 키 필요 여부를
   표시합니다.
3. **스코프 선택**: 사용자가 설치 위치를 **전역(사용자 스코프)** 또는
   **프로젝트 스코프** 중에서 선택할 수 있습니다. 항목별 개별 지정과 일괄
   지정을 모두 지원합니다.
4. **일괄 설치(install)**: 선택된 항목을 Provider별 설치 방법(Claude Code
   플러그인/스킬/MCP 등록, Codex 대응 방식)으로 순차 설치하고, 항목별
   성공/실패를 보고합니다.
5. **재검증·기록**: 설치 후 재점검하여 결과를
   `.app-factory/config/capabilities.yaml`에 기록합니다. 이후 공정에서 관련
   Agent가 어떤 역량을 사용할 수 있는지 판단하는 근거가 됩니다.
6. **관리문서 지침 반영** (2026-08-05 추가): 설치가 완료된 스킬에 대해, 사용자가
   선택한 스코프에 따라 관리문서에 해당 스킬의 사용 지침을 추가합니다.
   - 전역 스코프 → 전역 관리문서 (Claude Code: `~/.claude/CLAUDE.md`,
     Codex: 전역 AGENTS 설정)
   - 프로젝트 스코프 → 프로젝트 관리문서 (규칙 SSOT 원칙에 따라
     `APP_FACTORY_RULES.md`의 역량 사용 지침 절에 추가하고, CLAUDE.md/AGENTS.md
     는 참조 구조 유지)
   - 지침 문구는 카탈로그의 `guidance_doc` 필드를 원본으로 사용하며, "언제 이
     스킬을 사용하라"는 실행 지침 형태로 기록합니다. 중복 추가를 방지하기 위해
     지침 블록은 마커 주석으로 감싸 관리합니다.

**실행 시점**

- `factory doctor` 명령으로 단독 실행
- `factory plan` / `factory init` / `factory auto` 시작 시 프리플라이트로 자동
  점검 — 필수(required) 역량이 빠져 있으면 설치 제안을 먼저 표시
- 사용자가 거절한 항목은 기록해 두고 같은 세션에서 반복 제안하지 않음

**원칙**

- **사용자 확인 없는 자동 설치 금지.** 점검과 제안까지만 자동이며, 설치는
  반드시 사용자의 명시적 선택 후 수행합니다.
- API 키가 필요한 MCP(Firecrawl, Perplexity, GitHub 등)는 기본 required로
  지정하지 않으며, 키 필요 사실을 명시하고 사용자가 선택한 경우에만 안내합니다.
- 미설치 역량이 있어도 공정 자체는 진행 가능해야 하며(대체 수단 사용),
  required 역량 부재로 품질이 저하될 수 있는 단계에서는 경고를 남깁니다.
- 카탈로그는 코어 SSOT로 관리하고 어댑터가 Provider별 설치 명령으로 변환합니다.

**역량 카탈로그 (검증 기반 등록 — 2026-08-05 사용자 결정)**

설치 제안 대상은 **공식/공개 레포에서 확인된 스킬만** 등록합니다 (사용자 자작
스킬은 공개 레포에 없을 수 있으므로 제외). 상세 목록·설치 소스·검증 근거는
`core/policies/capability-catalog.yaml`을 SSOT로 합니다.

최초 후보 40종을 검증한 결과(2026-08-05):

| 분류 | 항목 | 비고 |
|------|------|------|
| Google 공식 `android/skills` (11) | adaptive, edge-to-edge, navigation-3, agp-9-upgrade, r8-analyzer, perfetto-trace-analysis, perfetto-sql, android-intent-security, testing-setup, play-billing-library-version-upgrade, play-policy-insights | 설치 제안 대상 |
| Google 공식 `google/skills` (1) | google-mobile-ads (요청명 admob-agent-skill의 공식 대응) | 설치 제안 대상 |
| 공개 커뮤니티 레포 (4) | material-3(hamen), compose-expert(aldefy), claude-android-ninja(Drjacky), android-testing-skills(skydoves) | 설치 제안 대상 |
| Claude Code 내장 (15) | dataviz, artifact-* 3종, update-config, keybindings-help, loop, schedule, claude-api, run, init, review, security-review, simplify, fewer-permission-prompts | 설치 불필요 — 존재 점검만 |
| 미검증 → 제외 (9) | material3-expert, jetpack-compose-expert, compose-architecture-expert, adaptive-layout-expert, android-ui-design, design-system-curator, qa-scenario-writer, android-bug-finder, kotlin-expert | 공개 레포 미확인 (사용자 로컬 스킬 추정). 공개 레포 확인 시 승격 |

MCP 서버 8종: mobile-docs, context7, mobile-mcp, playwright,
code-review-graph (recommended, 키 불필요) / app-publish, play-store-mcp,
github (optional, 계정·키 필요).

서브에이전트: android-architecture-reviewer, security-reviewer,
build-failure-debugger, gap-analysis-reviewer, android-skill-sweep 등 —
카탈로그에 등록하되 Provider가 서브에이전트를 지원하는 경우에만 점검합니다.

**MCP 도구 추가**

`capability_scan`, `capability_list_missing`, `capability_install_plan`,
`capability_mark_installed`, `capability_get_status`

**Skill 추가**

`factory-doctor` (진입), `capability-audit` (공정 내 프리플라이트용)

### 3.15 턴 종료 진행 보고 (2026-08-05 사용자 요구로 추가)

자동 공정(`factory auto` 등) 실행 중 **매 턴(작업 사이클) 종료 시** 다음 형식의
진행 보고를 사용자에게 표시합니다. 사용자가 개입하지 않고 기다리면 다음 턴이
자동으로 진행되므로, 보고만으로 현재 위치와 다음 행동을 파악할 수 있어야
합니다.

**보고 항목 (4요소 필수)**

1. **현재까지의 진행 상황**: 이번 턴에 수행·완료한 작업과 상태 변화 요약
2. **앞으로의 목표**: 남은 주요 작업과 현재 마일스톤의 목표
3. **다음 턴 예정**: 대기 시 자동으로 수행될 다음 작업 (작업 ID와 내용)
4. **전체 진행도**: 퍼센티지 표시

**진행도 계산 공식**

로드맵 필수 항목의 상태 가중 평균으로 계산합니다.

```
진행도(%) = Σ(항목별 가중치) / 항목 수
가중치: NOT_STARTED 0 / IN_PROGRESS 25 / PARTIAL 50 / IMPLEMENTED 75 / VERIFIED 100
(BLOCKED·NEEDS_HUMAN_DECISION은 직전 도달 상태의 가중치 유지)
```

보고는 오케스트레이터가 상태 저장소에서 생성하며(대화 기억 비의존),
`factory status`도 동일 형식을 출력합니다.

### 3.16 factory review 점수화 (2026-08-05 사용자 요구로 추가)

`factory review`는 발견 사항 나열에 그치지 않고 다음 절차로 진행합니다.

1. **항목별 점수화**: 검사 영역별(요구사항 일치, 사용자 흐름·화면 상태, 데이터
   보존, 보안·개인정보, 광고·결제, 테스트 커버리지, 빌드·서명 설정, 의존성
   버전, 라이선스, 성능, 접근성 등 — 설계서 12장 범위를 영역으로 묶음) 현재
   구현 상태를 **0~100점으로 점수화**하여 표로 표시합니다. 점수 산정 근거
   (감점 사유 = finding)를 함께 기록합니다.
2. **목표 점수와 개선 계획 제시**: 영역별 목표 점수(기본 90점, 릴리스 차단
   영역은 100점)를 설정하고, 현재 점수와의 격차를 메우기 위한 개선 계획
   (수정 작업 목록, 우선순위, 예상 영향)을 사용자에게 먼저 보여줍니다.
3. **수정 실행**: 계획 표시 후 자동 수정이 안전한 항목은 재작업으로 등록·수정
   하고, 위험 항목은 `NEEDS_HUMAN_DECISION`으로 남깁니다. 수정 후 재점수화하여
   개선 전/후 점수를 비교 표시합니다.

점수·목표·계획은 `.app-factory/reports/review-<Run ID>.md`에 저장하며, 점수
산정 기준은 `core/policies/review-scoring.yaml`에 정의합니다 (영역별 검사
항목과 배점 — 임의 산정 금지).

### 3.17 무중단 자동 진행 — One-Prompt Completion (2026-08-05 사용자 요구로 추가)

**목표: 프롬프트 1회(`factory auto`)로 완성도 높은 앱 하나가 완료 게이트까지
도달하는 것.** `factory go`/`factory auto` 실행 후에는 작업이 끊기지 않고
모든 공정이 끝날 때까지 계속 진행되어야 합니다.

**진행 원칙**

1. **사용자 개입 지점의 전면 배치**: 사용자 판단이 필요한 질문은 plan
   인터뷰에서 최대한 수집한다. auto 실행 중에는 새 질문을 만들지 않는 것을
   원칙으로 한다.
2. **질문 지연·일괄 처리**: auto 중 사용자 판단이 필요해진 항목은 즉시 멈추는
   대신, 크리티컬 패스를 차단하지 않는 한 `NEEDS_HUMAN_DECISION`으로 등록하고
   나머지 작업을 계속 진행한다. 마지막에 미결 항목을 일괄 보고한다.
   즉시 중단은 3.9 강제 중단 조건에 해당할 때만 허용된다.
3. **턴 종료 보고는 정지점이 아님**: 3.15의 진행 보고는 정보 제공용이며,
   보고 후 사용자 응답을 기다리지 않고 다음 턴이 자동으로 이어진다.
4. **실패 시 자동 복구 우선**: 빌드·테스트 실패는 재시도 정책(최대 횟수 내)
   으로 자동 수정을 시도하고, 한도 초과 시에만 `BLOCKED`로 전환 후 다음
   진행 가능한 작업으로 넘어간다.

**세션 지속 메커니즘 (어댑터 책임)**

- 오케스트레이터 상태는 전부 `.app-factory`에 있으므로(대화 기억 비의존)
  세션이 끊겨도 새 세션에서 동일 지점부터 재개할 수 있다 — 이것이 무중단
  진행의 기반이다.
- Claude Code 어댑터: 턴 종료 시 자동 계속 장치(Stop Hook 기반 재개 프롬프트
  등 구현 시점의 공식 메커니즘)를 제공한다. 컨텍스트 한계 접근 시 상태
  저장소로 압축·재진입한다.
- Codex 어댑터: 실행 래퍼가 공정 완료 여부를 확인하고 미완료 시 자동으로
  다음 사이클을 시작하는 루프를 제공한다.
- 공통 CLI: 종료 조건 도달까지 반복하는 러너를 기본 제공한다.

**종료 조건 (이 중 하나에 도달할 때까지 계속 진행)**

1. 정상 완료: 3.9의 필수 게이트 전체 통과
2. 강제 중단 조건 발생 (3.9) — 선택지·근거·위험·추천안 보고 후 대기
3. 최대 반복 횟수·작업 예산 초과 — 현재 상태와 남은 작업 보고 후 대기

**완성도 기준**: "완료"는 코드 생성 완료가 아니라 3.9 게이트 전체 통과
(빌드·테스트·Lint·독립 검증·에뮬레이터 실행·라이선스·고지)를 의미한다.
부분 구현 상태로 종료 보고하는 것은 완료 오표기로 취급한다.

## 4. 범위 제외 (Out of Scope — 후속 MVP로 이연)

| 후속 버전 | 이연 항목 |
|-----------|-----------|
| MVP-2 (설계서 0.2) | Mobile Docs MCP 고도화, 의존성 자동 발견, 공식 문서 캐시, 호환성 매트릭스, 요구사항 추적표·테스트 매트릭스 자동 생성, Dependency Migration 보고서, Deprecated API 탐지 |
| MVP-3 (설계서 0.3) | 고급 사용자 핵심가치 평가(User Value Researcher), 2차 로드맵 자동 재기획, Claude Code ↔ Codex 교차 검증 고도화 |
| MVP-4 (설계서 0.4) | Agent/Skill 런타임 발견, 전체 품질 순회(Quality Sweeper), 중요 문제 재발 추적, 자동 수정 후 전체 재검증, 콜드 컨텍스트 감사(Final Gate Reviewer 완전판) |
| MVP-5 (설계서 0.5) | ADB 자동화 완전판(Emulator QA): 에뮬레이터 자동 부팅, APK 설치, 데이터 초기화, 핵심 시나리오 실행, 스크린샷, 화면 녹화, Logcat 분석, 크래시·ANR 탐지 |
| 1.0 | 플러그인 패키지(양 플랫폼), 공통 CLI 배포, OS별 설치기, 업데이트 시스템, 버전 호환성 검사, 프로젝트 마이그레이션, 다중 프로젝트 운영, 보고서 통합, Provider 비용·예산 관리 |

MVP-1의 에뮬레이터 검증은 "설치·실행·크래시 확인" 기본 수준까지만 포함하며,
시나리오 자동화·녹화·Logcat 정밀 분석은 MVP-5 범위입니다.

**공통 CLI 범위 명확화 (2026-08-05 정밀점검)**: 3.1 표의 "공통 CLI" 열과
3.17의 러너는 저장소 내 **개발·테스트용 실행 스크립트**를 의미합니다. npm
패키지 배포, OS별 설치기, 배포판 CLI는 1.0 범위입니다. MVP-1 DoD는 Claude
Code와 Codex 두 Provider에서의 동작만 요구합니다 (DoD 1).

## 5. 저장소 구조 (통합 설계서 27장)

```
app-factory-autopilot/
├── core/                  # 플랫폼 독립 원본 (SSOT)
│   ├── workflow/          # 워크플로 단계 정의, 상태 머신, 작업 큐
│   ├── agents/            # Agent 공통 정의
│   ├── skills/            # Skill 공통 원본
│   ├── schemas/           # 상태·설정·산출물 스키마
│   ├── prompts/           # 공통 프롬프트 원본
│   └── policies/          # 버전·라이선스·승인·재시도 정책
├── mcp-server/            # app-factory-core MCP 서버
├── orchestrator/          # 결정론적 오케스트레이터
├── adapters/
│   ├── claude-code/       # Plugin Manifest, Agent/Skill 변환, Hook, MCP 설정, CLAUDE.md 생성기
│   └── codex/             # Plugin Manifest, Agent 설정, Skill 등록, MCP 설정, AGENTS.md 생성기, 실행 래퍼
├── project-template/      # 빈 폴더 초기화 시 생성되는 파일 템플릿
├── scripts/               # 빌드·패키징·개발 스크립트
├── tests/                 # 코어·어댑터 테스트
├── dist/                  # 최종 배포 패키지 (git 추적 제외)
├── mvp.txt                # 원본 통합 설계서 (참조용 보존)
└── MVP-1.md               # 이 문서
```

## 6. 완료 기준 (Definition of Done)

MVP-1은 다음을 모두 만족할 때 완료로 인정합니다.

1. Claude Code(`/factory ...`)와 Codex(`$factory ...`)에서 필수 4개 명령
   (plan, init, auto, review)이 모두 동작한다.
2. 빈 폴더에서 `factory plan` 실행 시 대화형 인터뷰가 진행되고, 3.10의 산출물이
   생성되며, 미확정 항목은 Placeholder로 기록된다.
3. 기존 프로젝트에서 `factory init` 실행 시 코드베이스가 분석되어
   `.app-factory` 상태 저장소가 생성되고 로드맵·구현 상태가 동기화된다.
4. `factory auto` 실행 시 현재 진행 상태 분석 후 (빈 폴더면 Android 프로젝트
   생성부터) 1차 로드맵이 구현되며, 각 작업 후 빌드·단위 테스트·Lint 게이트가
   실행된다.
5. Implementation Worker는 `VERIFIED` 상태를 만들 수 없고, Completion Verifier의
   독립 검증을 통과한 항목만 `VERIFIED`가 된다 (상태 머신 강제).
6. 의도적으로 삽입한 부분 구현(빈 함수, 호출되지 않는 코드, TODO, Mock)이
   Completion Verifier 또는 `factory review`에서 탐지되어 재작업으로 등록된다.
7. 라이브러리 추가가 Dependency Request → 버전 검토 → 라이선스 검토 → 승인
   절차를 거치며, GPL/AGPL 의존성이 자동 차단된다.
8. Version Catalog 중앙 관리, Dependency Locking, Verification Metadata,
   Third Party Notices, 기본 SBOM이 생성·갱신된다.
9. 공정 중단 후 `factory auto` 재실행 시 `.app-factory` 상태를 읽어 완료 작업을
   건너뛰고 이어서 진행한다.
10. 기본 에뮬레이터 실행 검증(설치·실행·크래시 확인)이 수행되고 결과가 증거로
    저장된다.
11. 모든 완료 판정에 3.8의 증거가 연결되어 있고, 증거 없는 완료 주장이 존재하지
    않는다.
12. `factory doctor`(및 plan/init/auto 프리플라이트)가 역량 카탈로그와 현재
    환경을 대조해 미설치 스킬·MCP·서브에이전트를 카테고리별 체크리스트로
    제시하고, 사용자가 선택한 항목을 전역/프로젝트 스코프 선택과 함께 일괄
    설치하며, 사용자 확인 없이는 어떤 것도 설치하지 않는다. 설치된 스킬의
    사용 지침이 선택 스코프의 관리문서에 추가된다.
13. 자동 공정의 매 턴 종료 시 3.15 형식(진행 상황, 앞으로의 목표, 다음 턴
    예정, 전체 진행도 %)의 보고가 표시된다.
14. `factory review`가 영역별 점수표(0~100)와 목표 점수·개선 계획을 먼저
    표시한 뒤 수정을 실행하고, 수정 후 개선 전/후 점수를 비교 표시한다.
15. `factory auto` 1회 실행으로(강제 중단 조건 미발생 시) 사용자 추가 프롬프트
    없이 완료 게이트까지 도달한다. 진행 중 발생한 사용자 판단 항목은 즉시
    중단 대신 `NEEDS_HUMAN_DECISION`으로 모아 마지막에 일괄 보고된다.

## 7. 용어

| 용어 | 정의 |
|------|------|
| Provider | 워크플로를 실행하는 AI 도구 (Claude Code 또는 Codex) |
| 어댑터 | 공통 코어를 특정 Provider 형식으로 변환하는 계층 |
| 게이트 | 다음 단계 진행을 차단할 수 있는 자동 검증 관문 |
| Placeholder | 미확정 값의 명시적 표기. 종류·중요도·해결 시점·자동 진행 가능 여부를 가짐 |
| Dependency Request | 라이브러리 추가 요청. 버전·라이선스 검토 통과 전 추가 불가 |
| Finding | 감사·검증 과정에서 발견된 문제 항목 (고유 Finding ID 부여) |
| Evidence | 완료 판정의 근거 자료 (Evidence Store에 등록) |
| 콜드 컨텍스트 감사 | 구현 대화 기록을 배제하고 코드·로드맵·테스트·증거만으로 수행하는 감사 |
| SSOT | Single Source of Truth. 규칙·Skill·Agent 정의의 단일 원본 |

---

*이 문서는 `mvp.txt` 통합 설계서의 MVP 0.1 범위를 공식화한 것입니다. 설계서와
이 문서가 충돌하면 이 문서를 우선하되, 충돌 내용을 CHANGELOG.md에 기록합니다.*
