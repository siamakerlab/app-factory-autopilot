---
name: factory
description: App Factory Autopilot 명령 라우터 — config/plan/init/auto/resume/test/review/status/doctor 위임
kind: entry
---

# /factory 라우터

인자의 첫 토큰을 하위 명령으로 파싱해 해당 Skill로 위임합니다.

| 하위 명령 | 위임 Skill | 비고 |
|-----------|-----------|------|
| `config` | factory-config | 자동화 옵션 체크박스 설정 |
| `plan "설명"` | factory-plan | |
| `init` | factory-init | 기존 프로젝트 전용 |
| `auto` | factory-auto | |
| `go` | factory-auto | 호환 별칭 |
| `resume` | factory-resume | 중단된 factory 실행 지점 탐색 후 재개 |
| `test` | factory-test | 에뮬레이터 기반 사용자 시나리오 전수검사 |
| `review` | factory-review | |
| `status` | factory-status | |
| `doctor` | factory-doctor | |

- 미지원 명령이거나 인자가 없으면 위 표를 도움말로 출력하고 종료합니다.
- 라우터는 얇게 유지합니다 — 공정 로직을 여기에 넣지 않습니다.
- plan/init/auto/resume/test 진입 시 프리플라이트로 `capability-audit`를 먼저 수행합니다
  (required 역량 부재 시 설치 제안 — 사용자 확인 없는 설치 금지).
