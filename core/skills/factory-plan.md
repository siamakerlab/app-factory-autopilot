---
name: factory-plan
description: 대화형 인터뷰 → 프로젝트 계획·1차 로드맵·산출물 17종 생성 (코드 구현 안 함)
kind: entry
uses_agents: [roadmap-architect, roadmap-auditor]
uses_skills: [capability-audit, roadmap-create]
---

# factory plan

빈 폴더에서도 실행 가능합니다. **코드를 구현하지 않습니다.**

## 절차

1. `capability-audit` 프리플라이트 (미설치 required 역량 제안).
2. `factory_initialize`로 `.app-factory` 생성.
3. 인터뷰 진행 — `core/prompts/interview/interview.yaml` 정의를 따른다:
   - 영역별 작은 묶음으로 질문한다 (한 번에 수십 개 금지)
   - 이미 답한 내용은 다시 묻지 않는다 (답변 즉시
     `.app-factory/config/interview/<영역>.json` 저장)
   - 자동 결정 가능 항목은 추천값 제시 후 변경 여부만 확인
   - 모름/미정 → `placeholder_create` (임의로 지어내지 않는다)
   - 중단 후 재실행 시 남은 질문부터 이어간다
4. 인터뷰 완료 → APP_FACTORY.yaml 구성(defaults.yaml 병합) 후
   `factory_initialize`의 config로 스냅샷 저장.
5. `roadmap-create` Skill로 1차 로드맵 생성·감사.
6. project-template를 렌더링해 **산출물 17종** 생성:
   APP_FACTORY.yaml, APP_FACTORY_RULES.md, PROJECT_SPEC.md, ROADMAP.md,
   REQUIREMENTS_TRACEABILITY.md, TEST_MATRIX.md, DOCS_INDEX.md,
   USER_VALUE.md, DEPENDENCIES.md, DEPENDENCY_MIGRATIONS.md,
   LICENSE_POLICY.yaml, LICENSE_REVIEW.md, THIRD_PARTY_NOTICES.md,
   EMULATOR_SCENARIOS.md, QUALITY_FINDINGS.md, PLACEHOLDERS.md, APPROVALS.md
7. 요약 보고: 로드맵 항목 수, Placeholder 목록(릴리스 차단 구분), 다음 단계
   안내 (`factory auto`).

## 기본값 (미입력 시)

- 구현 언어: Kotlin + 권장 스택 / 기본 언어: 영어 / 다국어 구조: 상시 적용
- 패키지명은 `factory auto`의 프로젝트 생성 전 확정을 요구한다. 미확정 시
  임시 패키지명 사용 여부를 별도 확인한다.

## 모의 응답 주입 모드 (E2E용)

환경 변수 `AFA_INTERVIEW_ANSWERS=<파일>`이 지정되면 대화 대신 해당 JSON의
답변을 사용한다. 형식: `{ "<질문ID>": <답변> }`.
