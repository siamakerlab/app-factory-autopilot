---
name: dependency-report
description: DEPENDENCIES.md 갱신 — 승인 이력·버전·검토 근거 일람
kind: process
---

# dependency-report

1. `.app-factory/state/dependencies/`의 전체 요청을 읽는다.
2. DEPENDENCIES.md를 갱신한다: 좌표, 승인 버전, 검토 근거 URL, 라이선스
   판정, 승인/거부 상태, 요청 사유.
3. 거부 이력도 사유와 함께 보존한다 (같은 라이브러리 재요청 시 참조).
4. 갱신 결과를 증거로 등록한다.
