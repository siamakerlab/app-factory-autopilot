---
name: factory-doctor
description: 개발 환경 필수 역량 점검·설치 제안 — 체크리스트 선택, 전역/프로젝트 스코프, 관리문서 지침 추가
kind: entry
uses_skills: [capability-audit]
---

# factory doctor

Android 앱 제작 공정에 필요한 스킬·MCP·서브에이전트 설치 상태를 점검하고,
미설치 항목을 사용자 확인 후 일괄 설치합니다 (통합 명세 3.14).

## 절차

1. **탐지** (어댑터별): 설치된 스킬·MCP·서브에이전트 목록을 수집해
   `capability_scan`에 전달한다.
2. **제안**: 미설치 항목을 카테고리별 체크리스트로 표시한다 — 이름, 용도,
   우선순위(required/recommended/optional), API 키 필요 여부. optional은
   접어서 표시. 거절 이력 항목은 다시 제안하지 않는다.
3. **선택·스코프**: 사용자가 설치할 항목을 체크하고 스코프(전역/프로젝트)를
   선택한다 (일괄 또는 항목별).
4. **설치**: `capability_install_plan`의 명령을 순차 실행하고 항목별
   성공/실패를 보고한다. **사용자 확인 없는 설치 금지.**
5. **재검증·기록**: 재스캔 후 `capability_mark_installed` /
   `capability_mark_declined` 기록.
6. **관리문서 지침 추가**: 설치 성공 항목의 guidance_doc을 스코프에 따라
   반영한다:
   - 전역 → `~/.claude/CLAUDE.md` (Codex: 전역 AGENTS 설정) — **반영 전
     diff를 보여주고 확인받는다** (사용자 소유 문서)
   - 프로젝트 → APP_FACTORY_RULES.md의 역량 지침 절
   - 마커 블록 `<!-- app-factory:capabilities:start -->` ~
     `<!-- app-factory:capabilities:end -->` 내부만 교체 (중복·수동 편집
     충돌 방지)

## 원칙

- 미설치 상태로도 공정은 계속 진행 가능해야 한다 (경고만 기록).
- API 키 필요 MCP는 키 필요 사실을 명시하고 사용자가 선택한 경우에만 안내.
