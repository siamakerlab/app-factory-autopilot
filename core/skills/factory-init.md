---
name: factory-init
description: 기존 프로젝트에 App Factory Autopilot 도입 — 코드베이스 분석·상태 저장소 생성·로드맵 동기화
kind: entry
uses_agents: [project-explorer]
uses_skills: [capability-audit, project-explore]
---

# factory init (기존 프로젝트 전용)

기존에 제작된 프로젝트에 App Factory Autopilot을 도입할 때 코드베이스를
분석하는 용도입니다.

## 절차

1. 빈 폴더면 중단하고 안내한다: "factory init은 기존 프로젝트 전용입니다.
   새 프로젝트는 `factory plan`부터 시작하십시오."
2. `capability-audit` 프리플라이트.
3. `factory_initialize`로 `.app-factory` 생성 (**기존 소스는 수정하지
   않는다 — 읽기 전용 분석**).
4. `project-explore` Skill 실행 — 모듈·Gradle·라이브러리·구현 상태 분석.
5. 로드맵 동기화: 분석 결과의 roadmap_candidates를 `roadmap_parse`로
   반입한다. 상태 후보는 PARTIAL/IMPLEMENTED까지만 — VERIFIED는 이후
   Completion Verifier 검증으로만 도달한다.
6. 미확정 값을 Placeholder로 등록한다.
7. 부족한 계획(핵심가치·요구사항)이 있으면 `factory plan`으로 보완을
   권한다. 이후 `factory auto`로 진행.

## 보고

분석 요약(모듈·스택·구현 상태), 로드맵 후보 목록, Placeholder 목록,
발견된 문제(하드코딩 버전·동적 버전·라이선스 불명 의존성 등 finding)를
표시한다.
