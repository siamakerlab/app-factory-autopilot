# App Factory Autopilot

빈 폴더에서 Android 앱 기획 → 요구사항 수집 → 로드맵 → 구현 → 빌드/테스트 →
독립 검증 → 최종 완료 판정까지 자동화하는 앱 개발 오케스트레이션 시스템입니다.
Claude Code와 Codex 양쪽에서 동작하는 플러그인과 공통 CLI를 목표로 합니다.

## 핵심 명령

| 명령 | 역할 |
|------|------|
| `factory config` | 자동화 실행 옵션을 체크박스로 설정 |
| `factory plan "앱 설명"` | 대화형 인터뷰로 프로젝트 계획과 1차 로드맵 생성 |
| `factory init` | 기존 프로젝트에 도입 — 코드베이스 분석, 상태 저장소 생성, 로드맵 동기화 |
| `factory auto` | 현재 진행 상태를 분석하고 알아서 진행 (빈 폴더면 프로젝트 생성부터) |
| `factory resume` | 토큰 한도·시스템 종료·세션 종료 등으로 중단된 실행을 중단 지점부터 재개 |
| `factory test` | 에뮬레이터 승인 전제로 모든 사용자 시나리오·버튼·기능을 스크린샷 기반 전수검사 |
| `factory review` | 구현 기록을 신뢰하지 않는 전체 재감사 |

- Claude Code: `/factory config|plan|init|auto|resume|test|review`
- Codex: `$factory config|plan|init|auto|resume|test|review`
- `factory go`는 `factory auto`의 호환 별칭이며, 보조 명령으로
  `factory status`(상태 요약)와 `factory doctor`(개발 환경 필수 스킬·MCP 점검
  및 설치 제안)를 제공합니다.

## Capability Doctor

Android 앱 제작에 필요한 스킬·MCP 서버·서브에이전트가 설치되어 있는지
점검하고, 미설치 항목을 카테고리별 체크리스트로 보여 준 뒤 **사용자가 선택한
항목만** 전역/프로젝트 스코프를 골라 일괄 설치합니다. 설치된 스킬의 사용
지침은 선택한 스코프의 관리문서에 자동 추가됩니다. 사용자 확인 없는 자동
설치는 하지 않습니다.

카탈로그에는 공식/공개 레포에서 검증된 스킬만 등록합니다 — Google 공식
`android/skills` 11종, `google/skills`(Mobile Ads) 1종, 공개 커뮤니티 4종,
Claude Code 내장 15종(존재 점검만). SSOT는
[`core/policies/capability-catalog.yaml`](./core/policies/capability-catalog.yaml)입니다.

## 핵심 원칙

- **구현과 완료 판정 분리** — 구현 Agent는 `IMPLEMENTED`까지만, 독립 검증을
  통과한 항목만 `VERIFIED`(유일한 완료 상태)가 됩니다.
- **모르는 값은 지어내지 않음** — 미확정 항목은 `${PLACEHOLDER_*}`로 관리합니다.
- **증거 기반 판정** — 증거 없는 완료 주장은 인정하지 않습니다.
- **플랫폼 비종속** — 공통 코어 원본 하나 + 플랫폼별 어댑터 구조입니다.

## 문서

- [ROADMAP.md](./ROADMAP.md) — MVP-1 공식 명세와 개발 로드맵의 단일 원본
- [mvp.txt](./mvp.txt) — 원본 통합 설계서
- [CHANGELOG.md](./CHANGELOG.md) — 변경 이력
- [LICENSE](./LICENSE) — Apache License 2.0

## 라이선스

Copyright 2026 Sia Makerlab.

Licensed under the Apache License, Version 2.0. See [LICENSE](./LICENSE) and
[NOTICE](./NOTICE).

## 저장소 구조

```
core/               플랫폼 독립 원본 (workflow, agents, skills, schemas, prompts, policies)
mcp-server/         app-factory-core MCP 서버
orchestrator/       결정론적 오케스트레이터
adapters/           claude-code, codex 어댑터
project-template/   빈 폴더 초기화 템플릿
scripts/            빌드·패키징 스크립트
tests/              테스트
dist/               배포 패키지 (git 추적 제외)
```

## 상태

MVP-1 로컬 구현은 실프로젝트 실행 검증이 필요한 항목을 제외하고 진행되었습니다.
범위, 완료 기준, 잔여 검증은 [ROADMAP.md](./ROADMAP.md)의 🟧 항목을 기준으로
추적합니다.
