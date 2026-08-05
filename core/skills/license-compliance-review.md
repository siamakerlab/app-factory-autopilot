---
name: license-compliance-review
description: 라이선스 검토 — SPDX 정규화 제출, 정책 엔진 판정, 수동 검토 승인 경로
kind: process
uses_agents: [license-compliance-auditor]
---

# license-compliance-review

1. 대기 중인 Dependency Request마다 License Compliance Auditor를 호출한다.
2. Agent가 직접·전이 의존성의 라이선스를 SPDX로 정규화해
   `dependency_review_license`에 근거 URL과 함께 제출한다 — 판정(allow/
   block/manual_review)은 정책 엔진이 한다.
3. block → 요청 자동 거부 (해당 라이브러리 사용 금지, 대안 조사 작업 등록).
   manual_review → `approval_request`로 사용자 판단 요청, 승인 전 진행 불가.
4. 에셋(폰트·이미지·아이콘·음원)과 로컬 AAR/JAR/SO도 검사 대상에 포함한다.
5. 결과를 LICENSE_REVIEW.md 갱신 작업으로 등록한다.
