# App Factory Autopilot

빈 폴더에서 Android 앱 기획 → 요구사항 수집 → 로드맵 → 구현 → 빌드/테스트 →
독립 검증 → 최종 완료 판정까지 자동화하는 앱 개발 오케스트레이션 시스템입니다.
Claude Code와 Codex 양쪽에서 동작하는 플러그인과 공통 CLI를 목표로 합니다.

## 핵심 명령

| 명령 | 역할 |
|------|------|
| `factory plan "앱 설명"` | 대화형 인터뷰로 프로젝트 계획과 1차 로드맵 생성 (구현 안 함) |
| `factory init` | 기존 프로젝트에 도입 — 코드베이스 분석, 상태 저장소 생성, 로드맵 동기화 |
| `factory auto` | 현재 진행 상태를 분석하고 알아서 진행 (빈 폴더면 프로젝트 생성부터) |
| `factory review` | 구현 기록을 신뢰하지 않는 전체 재감사 |

- Claude Code: `/factory plan|init|auto|review`
- Codex: `$factory plan|init|auto|review`
- `factory go`는 `factory auto`의 호환 별칭, `factory status`는 보조 명령입니다.

## 핵심 원칙

- **구현과 완료 판정 분리** — 구현 Agent는 `IMPLEMENTED`까지만, 독립 검증을
  통과한 항목만 `VERIFIED`(유일한 완료 상태)가 됩니다.
- **모르는 값은 지어내지 않음** — 미확정 항목은 `${PLACEHOLDER_*}`로 관리합니다.
- **증거 기반 판정** — 증거 없는 완료 주장은 인정하지 않습니다.
- **플랫폼 비종속** — 공통 코어 원본 하나 + 플랫폼별 어댑터 구조입니다.

## 문서

- [MVP-1.md](./MVP-1.md) — MVP-1 공식 명세서 (구현 착수 기준 문서)
- [mvp.txt](./mvp.txt) — 원본 통합 설계서
- [CHANGELOG.md](./CHANGELOG.md) — 변경 이력

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

MVP-1 명세 확정, 구현 준비 단계입니다. 자세한 범위는 [MVP-1.md](./MVP-1.md)를
참고하십시오.
