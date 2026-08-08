---
name: factory-doctor
description: 개발 환경 필수 역량 점검·설치 제안 — 체크리스트 선택, 전역/프로젝트 스코프, 관리문서 지침 추가
kind: entry
uses_skills: [capability-audit]
---

# factory doctor

Android 앱 제작 공정에 필요한 스킬·MCP·서브에이전트 설치 상태를 점검하고,
미설치 항목을 사용자 확인 후 일괄 설치합니다 (통합 명세 3.14).
특정 개발자 머신의 상태를 전제로 하지 않고, 실행된 사용자 환경에서 매번
점검한 결과를 기준으로 부족한 도구·설정·권한·디바이스를 안내합니다.

## 절차

1. **탐지** (어댑터별): 설치된 스킬·MCP·서브에이전트 목록을 수집해
   `capability_scan`에 전달한다.
   Android SDK, adb, emulator, Gradle/Wrapper, AVD/연결 디바이스, mobile-mcp
   연결 상태 등 실행 환경 점검 결과는 `capability_record_environment`에
   전달한다.
2. **제안**: 미설치 항목을 카테고리별 체크리스트로 표시한다 — 이름, 용도,
   우선순위(required/recommended/optional), API 키 필요 여부. optional은
   접어서 표시. 거절 이력 항목은 다시 제안하지 않는다.
   환경 부족분은 상태(available/missing/blocked/unknown), 필요한 기능,
   사용자가 취할 조치, 차단 조건을 함께 표시한다. 에뮬레이터/AVD/adb처럼
   자동 준비가 가능한 항목은 "바로 준비해드릴까요?"라고 묻고, 사용자가
   승인하면 설치·생성·재점검까지 진행한다.
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
- 환경 부족분은 사용자에게 명확히 알리되, 해당 기능을 실제로 실행해야 하는
  시점에만 차단한다. 예: `factory test`는 실행 가능한 에뮬레이터가 없으면
  blocked, `factory auto`에서 `automation.emulator=false`이면 마지막 권유만 표시.
- 에뮬레이터 관련 부족분은 단순 안내로 끝내지 않는다. 사용자가 승인하면
  Android SDK 구성, system image 설치, AVD 생성, 부팅 확인을 가능한 범위에서
  자동 진행한 뒤 다시 점검한다.
- API 키 필요 MCP는 키 필요 사실을 명시하고 사용자가 선택한 경우에만 안내.
