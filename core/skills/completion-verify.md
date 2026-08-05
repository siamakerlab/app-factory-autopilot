---
name: completion-verify
description: IMPLEMENTED 항목 독립 검증 — 8단계 체크리스트, VERIFIED 또는 PARTIAL 강등
kind: process
uses_agents: [completion-verifier]
---

# completion-verify

1. `roadmap_get_items(status: IMPLEMENTED)`로 검증 대상을 얻는다.
2. 항목마다 verify 작업을 생성·클레임(role: verifier)하고 Completion
   Verifier의 8단계 체크리스트를 수행한다 (코드 존재 → 호출 경로 → UI 연결
   → 실패 경로 → 설정 반영 → 잔존물 스캔 → 테스트 유효성 → 빌드·실행 증거).
3. 전 항목 통과 → criteria_updates + evidence_ids와 함께 VERIFIED 전이.
   실패 → finding 등록 + PARTIAL 강등 + fix 작업 자동 등록
   (`factory_create_task` type: fix, finding_id 연결).
4. 검증 보고(verification-report-v1)를 증거로 저장한다.
- 구현 대화·로드맵 표시를 신뢰하지 않는다. 증거 없는 완료 주장 불인정.
