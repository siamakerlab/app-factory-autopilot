---
name: license-compliance-review
description: License review; submits SPDX normalization, applies policy-engine decisions, and routes manual review approvals
kind: process
uses_agents: [license-compliance-auditor]
---

# license-compliance-review

1. Invoke License Compliance Auditor for each pending Dependency Request.
2. The agent normalizes direct and transitive dependency licenses to SPDX and
   submits them to `dependency_review_license` with source URLs. The policy
   engine decides allow, block, or manual review.
3. Blocked requests are rejected automatically, and alternative-research tasks
   are registered. Manual-review items require `approval_request` and cannot
   proceed before approval.
4. Include fonts, images, icons, audio, local AAR/JAR files, and native SO files
   in the review scope.
5. Register work to update `LICENSE_REVIEW.md`.
