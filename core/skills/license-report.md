---
name: license-report
description: LICENSE_REVIEW.md·THIRD_PARTY_NOTICES.md·SBOM 갱신
kind: process
uses_agents: [license-compliance-auditor]
---

# license-report

1. 의존성 그래프의 라이선스 감사 결과를 LICENSE_REVIEW.md로 갱신한다
   (판정·근거·수동 검토 대기 목록).
2. Third Party Notices를 생성·갱신한다 — 직접+전이 의존성 전체, Apache-2.0
   NOTICE 의무 확인 포함. 앱 내 오픈소스 고지 화면 데이터도 함께 생성한다.
3. 기본 SBOM(CycloneDX)을 생성·갱신한다.
4. 라이선스 불명 의존성이 있으면 생성 실패 + blocker finding (고지 게이트가
   차단한다).
5. 산출물을 증거(kind: license_report / sbom)로 등록한다 — 고지 게이트의
   판정 근거.
