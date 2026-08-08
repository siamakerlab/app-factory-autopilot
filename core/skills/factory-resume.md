---
name: factory-resume
description: 토큰 한도·시스템 종료·세션 강제 종료 등으로 중단된 factory 실행을 상태 저장소 기준으로 재개
kind: entry
uses_agents: [factory-orchestrator, implementation-worker, completion-verifier]
uses_skills: [capability-audit, roadmap-implement, completion-verify, final-gate]
---

# factory resume

작업 세션이 어떤 이유로든 중단된 경우 명시적으로 재개합니다. `factory auto`도
재진입 가능하지만, `resume`은 복구 의도를 run 기록에 남기고 중단 지점 탐색을
우선 수행합니다.

## 절차

1. `capability-audit` 프리플라이트.
2. `.app-factory` 상태 저장소 존재 확인:
   - 없으면 중단 지점을 찾을 수 없으므로 `factory plan` 또는 `factory init`
     안내 후 종료
3. `factory_recover_stale_claims`로 세션 종료 중 남은 claimed/in_progress 작업을
   회수한다.
4. 최신 run, task queue, roadmap 상태, gate 결과, pending decision을 읽어
   재개 지점을 결정한다.
5. `driveAuto`와 같은 무중단 드라이버를 `command=resume`으로 실행한다.
6. 매 사이클 종료 시 3.15 진행 보고 4요소를 기록하고, 완료·강제 중단·한도
   초과 중 하나에 도달할 때까지 사용자 입력 없이 계속한다.

## 원칙

- 대화 이력은 신뢰하지 않고 `.app-factory` 상태 저장소만 기준으로 재개한다.
- 완료된 작업은 재수행하지 않는다.
- stale claim은 회수하되, 정상 실행 중인 다른 프로세스의 lock은 침범하지 않는다.
- 위험 작업 승인, Placeholder, evidence, gate 정책은 `factory auto`와 동일하게
  적용한다.
