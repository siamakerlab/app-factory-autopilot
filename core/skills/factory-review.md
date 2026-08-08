---
name: factory-review
description: 구현을 신뢰하지 않는 전체 재감사 — 점수화 → 목표·개선 계획 → 수정 → 전/후 비교
kind: entry
uses_agents: [completion-verifier, roadmap-auditor, license-compliance-auditor, dependency-version-manager]
uses_skills: [completion-verify, placeholder-audit, license-compliance-review, dependency-version-review, final-gate]
---

# factory review

구현이 완료되었다고 가정하지 않고 전체 프로젝트와 전체 공정을 처음부터
다시 감사합니다. 가능하면 구현에 참여하지 않은 다른 Agent/Provider가
수행합니다 (APP_FACTORY.yaml providers.verification).

## 절차 (통합 명세 3.16)

1. **콜드 컨텍스트 원칙**: 구현 대화 기록을 읽지 않는다. 코드·로드맵·
   테스트·빌드 결과·증거만 검토한다.
2. 영역별 검사 — `core/policies/review-scoring.yaml`의 검사 항목을 순회:
   요구사항 일치, 경쟁사·커뮤니티 리서치 반영, 완료 오표기, 사용자 흐름·
   화면 상태, UI 현대화, UX 직관성, 데이터 보존, 보안·개인정보, 광고·UMP,
   결제·구매 복원, 인앱리뷰·인앱업데이트, 테스트 커버리지, 빌드·서명,
   의존성 버전, 라이선스·고지, 성능, 접근성, 다국어, Placeholder·TODO·
   디버그 잔존, 테스트 광고 ID 혼입.
3. **점수화**: 각 검사 항목에 통과/실패/해당없음을 매기고 영역별 0~100점
   가중 합산 (해당없음은 분모 제외). 감점 사유는 전부 finding으로 등록.
4. **목표·개선 계획 표시**: 영역별 목표 점수(기본 90, 릴리스 차단 영역
   100)와 격차, 개선 계획(수정 작업 목록·우선순위·예상 영향)을 수정 실행
   **전에** 사용자에게 표시한다.
5. **수정 실행**: 자동 수정이 안전한 항목(auto_fixable)은 fix 작업으로
   등록해 수정한다. 완료 오표기 발견 시 해당 로드맵 항목을 PARTIAL로
   강등·재개방한다. 위험·제품 판단 항목은 `NEEDS_HUMAN_DECISION`.
6. **재점수화**: 동일 배점표로 다시 점수를 매기고 전/후 비교표를 표시한다.
7. 리포트를 `.app-factory/reports/review-<RunID>.md`에 저장한다.
