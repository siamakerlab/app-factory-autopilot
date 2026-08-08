# `.app-factory` 상태 저장소 규약 (SSOT)

- 근거: 통합 명세 3.7, ROADMAP AFA-003
- 이 문서는 대상 앱 프로젝트의 `.app-factory/` 디렉터리 구조, 파일 포맷,
  ID 채번, 잠금, 재개 절차의 단일 원본이다. MCP 서버(`app-factory-core`)의
  상태 저장소 접근 계층은 이 규약을 구현한다.

## 1. 디렉터리 구조

```
.app-factory/
├── config/
│   ├── app-factory.snapshot.json   # APP_FACTORY.yaml의 정규화 스냅샷 (JSON)
│   ├── capabilities.yaml           # Capability Doctor 점검·설치 결과
│   └── interview/                  # plan 인터뷰 답변 (영역별 1파일)
│       └── <영역ID>.json
├── state/
│   ├── .lock                       # 쓰기 잠금 파일 (아래 4절)
│   ├── roadmap.json                # 로드맵 SSOT (roadmap-item[] — ROADMAP.md는 렌더링본)
│   └── placeholders/
│       └── <이름>.json             # placeholder.schema.json (1건 = 1파일)
├── task-queue/
│   ├── counter.json                # ID 채번 카운터 (아래 3절)
│   └── T-0001.json …               # task.schema.json
├── findings/
│   └── F-0001.json …               # finding.schema.json
├── approvals/
│   └── A-0001.json …               # 승인 요청·응답
├── budgets/
│   └── budget.json                 # 작업 예산 사용량
├── cycles/
│   └── (예약 — 사이클 통계, MVP-1은 runs/ 내 cycles로 충분)
├── runs/
│   └── R-YYYYMMDD-001.json …       # run.schema.json (감사 로그 포함)
├── evidence/
│   └── E-0001/
│       ├── meta.json               # evidence.schema.json
│       └── <원본 파일들>           # 로그 요약본·스크린샷 등
└── reports/
    └── review-R-YYYYMMDD-001.md …  # factory review 리포트
```

## 2. 파일 포맷 원칙

- **1 엔티티 = 1 파일**(JSON, UTF-8, LF). 단일 대형 state.json 금지 —
  부분 손상 시 전체 유실 위험.
- 모든 파일은 대응 스키마(`core/schemas/*.schema.json`)를 따라야 하며
  `version` 필드를 포함한다.
- 쓰기는 **임시 파일 작성 → fsync → rename(원자적 교체)** 로만 수행한다.
  임시 파일명은 `<대상>.tmp-<PID>`.
- 사람이 읽는 산출물(ROADMAP.md, PLACEHOLDERS.md 등)은 상태에서 렌더링하는
  파생물이다. 파생물 직접 수정이 감지되면(`roadmap_parse`의 diff 검사) 동기화
  확인을 요구한다.

## 3. ID 채번

`task-queue/counter.json`이 모든 카운터를 보유한다 (잠금 하에서만 갱신):

```json
{ "version": 1, "task": 12, "finding": 3, "evidence": 27, "approval": 1, "run_date": "20260805", "run_seq": 2 }
```

| 종류 | 형식 | 규칙 |
|------|------|------|
| 작업 | `T-0001` | 4자리 순차, 프로젝트 수명 동안 재사용 금지 |
| 발견 | `F-0001` | 동일 |
| 증거 | `E-0001` | 동일 |
| 승인 | `A-0001` | 동일 |
| 실행 | `R-YYYYMMDD-001` | 날짜별 3자리 순차, 날짜 변경 시 001로 초기화 |
| 로드맵 | `RM-001` | 3자리 순차 (roadmap.json 내에서 관리) |

- 4자리/3자리 초과 시 자릿수를 늘린다 (스키마 정규식은 `\d{4}` 최소 보장 —
  구현은 `\d{4,}`로 처리하고 스키마를 v2에서 갱신한다).

## 4. 잠금 (동시 쓰기 방지)

- 쓰기 Agent는 항상 1개(설계서 17장). 잠금은 이를 강제하는 안전장치다.
- 잠금 파일: `state/.lock`, 내용:

```json
{ "pid": 12345, "owner": "run:R-20260805-001", "acquired_at": "2026-08-05T10:00:00+09:00" }
```

- **획득**: `O_CREAT|O_EXCL`(원자적 생성)로 생성 성공 시 획득. 실패 시 대기
  (기본 250ms 간격, 최대 30초) 후 오류.
- **해제**: 쓰기 완료 시 삭제. run 종료 시 반드시 해제.
- **stale 회수**: `acquired_at`이 10분 초과 && 해당 PID 미생존이면 경고
  로그 후 회수. PID가 살아 있으면 회수하지 않고 오류 보고 (다른 세션이
  실제 작업 중일 수 있음).
- 읽기는 잠금 불요 (rename 원자성으로 파일 단위 일관성 보장).

## 5. 클레임 stale 회수

- `task-queue/`의 `claimed`/`in_progress` 작업 중 클레임 후 60분(설정:
  limits.yaml) 경과 && 소유 run이 `finished`이거나 존재하지 않으면 stale로
  판정 → `queued`로 되돌리고 `attempts`는 유지, 회수 사실을 run 감사
  로그에 기록한다 (E2E AFA-054가 검증).

## 6. 중단 후 재개 읽기 순서

`factory auto` 재실행(또는 새 세션 재진입) 시 다음 순서로 읽는다:

1. `config/app-factory.snapshot.json` — 설정 로드 (없으면 plan 미완료 →
   plan 안내)
2. `state/.lock` — stale 검사·회수
3. `runs/` 최신 run — `running`이면 비정상 종료로 판정, `finished` 처리
   (`exit_reason: error`) 후 새 run을 `resumed_from_run_id`로 연결
4. `state/roadmap.json` + `task-queue/` — stale 클레임 회수(5절) 후
   `factory_get_next_task`로 재개 지점 결정
5. `findings/` 중 `open`·`in_fix` — 재작업 큐 반영
6. `budgets/budget.json` — 잔여 예산 확인

- 완료(`VERIFIED`·`completed`) 항목은 재수행하지 않는다. 단 factory review가
  완료 오표기를 발견하면 `factory_reopen_task`로 다시 연다.

## 7. 스키마 매핑

| 파일 | 스키마 |
|------|--------|
| `state/roadmap.json` (items[]) | `roadmap-item.schema.json` |
| `task-queue/T-*.json` | `task.schema.json` |
| `findings/F-*.json` | `finding.schema.json` |
| `runs/R-*.json` | `run.schema.json` |
| `state/placeholders/*.json` | `placeholder.schema.json` |
| `evidence/E-*/meta.json` | `evidence.schema.json` |
| `config/app-factory.snapshot.json` | `app-factory-config.schema.json` |
| `approvals/A-*.json` | `approval.schema.json` (M2에서 정의) |

## 8. 버전·마이그레이션

- 모든 파일의 `version` 필드로 스키마 버전을 식별한다.
- 상위 버전 파일을 만난 하위 구현은 **수정 없이 중단**하고 사용자에게
  플러그인 업데이트를 안내한다 (silent downgrade 금지).
