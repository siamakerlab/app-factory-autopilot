---
name: final-gate
description: 최종 완료 게이트 — 전체 게이트 실행, 자동 종료 조건 판정
kind: process
---

# final-gate

1. `gate_run_all`로 9개 게이트를 전부 실행한다 (release 컨텍스트 여부는
   호출자가 지정 — 릴리스 단계에서는 Placeholder 게이트가 차단으로 동작).
2. 결과가 all_passed면 최종 게이트 통과 증거를 등록한다:
   `kind: gate_result, data: { final_gate: true, all_passed: true }` —
   오케스트레이터의 completed 판정이 이 증거를 참조한다.
3. 실패 게이트가 있으면 finding 목록과 함께 보고하고, 자동 수정 가능
   항목은 fix 작업으로 등록한다. 완료 처리하지 않는다.
4. MVP-1의 최종 감사는 이 게이트 실행이며, 콜드 컨텍스트 감사 완전판
   (다른 Provider 교차 검증)은 MVP-4 범위다 — factory review로 수동 수행
   가능.
