# Claude Code 어댑터

산출물은 `scripts/build-adapters.mjs`가 `dist/claude-code/`에 생성합니다
(이 디렉터리는 어댑터 문서·수동 자산 전용 — 변환 로직은 빌드 스크립트에
있습니다).

## 산출물 구조

```
dist/claude-code/
├── .claude-plugin/plugin.json   # 플러그인 매니페스트
├── commands/factory.md          # /factory 라우터 커맨드
├── agents/<8종>.md              # 서브에이전트 (mcp__app-factory-core__* 도구 매핑)
├── skills/<19종>/SKILL.md       # 진입·공정 스킬
├── hooks/hooks.json             # Stop Hook 등록
├── hooks/factory-continue.mjs   # auto run 진행 중이면 정지 차단 (3.17)
├── .mcp.json                    # app-factory-core 서버 등록
├── templates/CLAUDE.md          # 대상 프로젝트용 (규칙 참조 지시만)
├── core/                        # 코어 정책·스키마 사본
└── mcp-server/                  # 패키징 시 서버 dist 복사 (1.0 범위)
```

## 로컬 설치 (개발용)

1. `cd mcp-server && npm install && npm run build`
2. `node scripts/build-adapters.mjs`
3. `dist/claude-code/mcp-server/`에 `mcp-server/dist/*` 복사
4. Claude Code에서 로컬 플러그인으로 추가 (marketplace add → install)

## 검증 필요 (실환경)

- 플러그인 매니페스트·훅 스펙은 구현 시점의 공식 문서로 재확인할 것
  (claude-code-guide 에이전트) — 산출물 형식은 2026-08 기준 규격
- Stop Hook의 decision:block 동작으로 auto 무중단 진행 확인 (AFA-040 완료
  조건, 실설치 테스트 필요)
