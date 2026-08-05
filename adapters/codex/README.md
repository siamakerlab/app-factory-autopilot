# Codex 어댑터

산출물은 `scripts/build-adapters.mjs`가 `dist/codex/`에 생성합니다.

## 산출물 구조

```
dist/codex/
├── prompts/factory*.md          # $factory 커스텀 프롬프트 7종
├── agents/<8종>.md              # 역할 정의 (프롬프트 전환용)
├── skills/<13종>.md             # 공정 절차서
├── config/mcp.toml              # config.toml 병합용 MCP 서버 등록
├── templates/AGENTS.md          # 대상 프로젝트용 (규칙 참조 지시만)
├── bin/factory-auto-loop.sh     # 무중단 래퍼 (종료 조건까지 auto 반복)
└── core/                        # 코어 정책·스키마 사본
```

## 설치 (개발용)

1. `prompts/*.md` → `~/.codex/prompts/`
2. `config/mcp.toml` 내용을 `~/.codex/config.toml`에 병합 (경로 치환)
3. auto 무중단 실행: `bin/factory-auto-loop.sh <프로젝트>`

## 제약·검증 필요 (실환경)

- Codex 서브에이전트 미지원 시 Agent는 역할 전환 프롬프트로 강등 —
  단 worker/verifier는 **세션 분리 실행** (동일 세션 겸임 금지)
- Codex 프롬프트·MCP 설정 규격은 구현 시점 공식 문서로 재확인 필요
- Claude Code ↔ Codex 교차로 열었을 때 `.app-factory` 호환은 상태 저장소
  규약(스키마 버전) 준수로 보장 — 실검증은 양 CLI 설치 환경 필요 (AFA-041)
