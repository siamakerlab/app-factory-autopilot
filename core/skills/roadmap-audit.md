---
name: roadmap-audit
description: 로드맵 누락·모순 감사 — 감사 증거 등록 (clean 여부)
kind: process
uses_agents: [roadmap-auditor]
---

# roadmap-audit

Roadmap Auditor Agent를 호출합니다 (검사 목록은 Agent 정의 참조).

- 결과는 finding + 감사 증거(`data: { audit: "roadmap", clean: <bool> }`)로
  기록된다. 오케스트레이터의 roadmap_audit 단계 done 판정이 이 증거를
  참조한다.
- clean=true 조건: blocker·major finding 0건.
