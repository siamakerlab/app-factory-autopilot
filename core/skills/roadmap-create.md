---
name: roadmap-create
description: 1차 로드맵 생성 — Architect 작성 후 Auditor 감사까지 한 절차
kind: process
uses_agents: [roadmap-architect, roadmap-auditor]
---

# roadmap-create

1. Roadmap Architect가 인터뷰 결과·앱 설명으로 로드맵 초안을 작성한다
   (roadmap-draft-v1 — 항목별 요구사항·범위·완료/테스트/실행 조건·의존성·
   우선순위·위험도 필수).
2. `roadmap_parse`로 반입한다 (완료 조건 없는 항목·중복 ID·미해결 의존성은
   여기서 거부된다).
3. Roadmap Auditor가 감사한다 (`roadmap-audit` Skill).
4. blocker/major finding이 있으면 Architect가 수정 후 2~3을 반복한다
   (최대 3회 — 초과 시 NEEDS_HUMAN_DECISION).
5. 감사 clean 시 ROADMAP.md를 렌더링(`roadmap_render_markdown`)하고 요약을
   반환한다.
