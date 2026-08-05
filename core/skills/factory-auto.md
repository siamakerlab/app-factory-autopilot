---
name: factory-auto
description: 진행 상태 분석 후 완료까지 무중단 자동 진행 (One-Prompt Completion)
kind: entry
uses_agents: [factory-orchestrator, implementation-worker, completion-verifier]
uses_skills: [capability-audit, roadmap-implement, completion-verify, final-gate]
---

# factory auto (별칭: factory go)

어디까지 진행되었는지 현재 프로젝트를 분석하고 알아서 진행합니다. 작업이
끊기지 않고 **모든 공정이 끝날 때까지** 계속됩니다 (MVP-1.md 3.17).

## 절차

1. `capability-audit` 프리플라이트.
2. 재개 준비: `factory_recover_stale_claims` → 상태 저장소 읽기
   (state-store.md 6절 순서). `.app-factory` 부재 시:
   - plan 산출물도 없으면 `factory plan` 안내 후 종료
   - plan 산출물이 있으면 반입 후 진행
3. **드라이버 루프** (`driveAuto` — 어댑터의 세션 지속 장치와 연동):
   - `orchestrator_decide_next` → 단계 위임 → 결과 검증 → 진행 보고 기록
   - 매 사이클 종료 시 3.15 진행 보고 4요소를 표시하되 **사용자 응답을
     기다리지 않고 계속한다**
   - 사용자 판단 필요 항목은 크리티컬 패스 비차단 시
     `NEEDS_HUMAN_DECISION`으로 적재하고 계속 (질문 지연·일괄 처리)
   - 빌드·테스트 실패는 `task_report_failure` — 재시도 정책이 처리
4. 종료 조건 도달 시 최종 보고:
   - completed: 게이트 전체 통과 요약 + 증거 목록
   - forced_stop: 미결 항목(pending_decisions) 일괄 보고 + 선택지·근거·
     위험·추천안
   - limit_exceeded: 현재 상태와 남은 작업 보고

## 금지

- 승인 없는 위험 작업(dangerous 태그) 실행
- 부분 구현 상태로 "완료" 보고 (완료 = 3.9 게이트 전체 통과뿐)
