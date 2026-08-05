---
name: roadmap-implement
description: 로드맵 항목 구현 루프 — 클레임→구현→빌드·테스트→제출→IMPLEMENTED 요청
kind: process
uses_agents: [implementation-worker]
uses_skills: [dependency-version-review, license-compliance-review]
---

# roadmap-implement

1. `factory_get_next_task`로 작업을 받아 Implementation Worker에 위임한다.
2. Worker 절차: 클레임(토큰) → 한 번에 하나 구현 (코드+테스트, 성공·실패
   경로) → 빌드·단위 테스트 실행 → 증거 등록 → 결과 제출 →
   로드맵 IMPLEMENTED 전이 요청.
3. 각 작업 후 빌드·테스트 게이트(`gate_run`: build, unit_test)를 실행한다.
   실패 시 `task_report_failure` — 재시도 정책 적용.
4. 새 라이브러리 필요 시: Worker가 `dependency_request` 생성 →
   `dependency-version-review` + `license-compliance-review` 통과 →
   `dependency_approve` → 후속 작업 9건이 큐에 자동 등록된다. 승인 전
   해당 라이브러리 사용 코드 작성 금지.
5. 쓰기 작업은 동시에 하나만 실행한다 (병렬 쓰기 필요 시 Git Worktree 분리
   — MVP-1 범위 밖).
