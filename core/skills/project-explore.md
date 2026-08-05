---
name: project-explore
description: 프로젝트 구조·설정·구현 상태 분석 (읽기 전용)
kind: process
uses_agents: [project-explorer]
---

# project-explore

Project Explorer Agent를 호출해 폴더·프로젝트 상태를 분석합니다.

1. 프로젝트 종류 판별 (empty / android / non_android)
2. 모듈·Gradle·라이브러리·매니페스트·구현 상태 분석 (출력 계약
   project-exploration-v1)
3. 발견된 문제(하드코딩 버전, 동적 버전, 라이선스 불명 의존성)를 finding으로
   등록
4. 기존 프로젝트면 로드맵 초기 상태 후보 생성 — PARTIAL/IMPLEMENTED
   후보까지만, VERIFIED 부여 불가 (확정은 Completion Verifier)
5. 분석 결과를 evidence로 저장하고 요약을 반환
