---
name: license-report
description: Updates LICENSE_REVIEW.md, THIRD_PARTY_NOTICES.md, and SBOM artifacts
kind: process
uses_agents: [license-compliance-auditor]
---

# license-report

1. Update `LICENSE_REVIEW.md` from dependency-graph license audit results,
   including decisions, evidence, and pending manual-review items.
2. Generate or update Third Party Notices for direct and transitive dependencies,
   including Apache-2.0 NOTICE obligations. Also generate data for the app's
   open-source notice screen.
3. Generate or update the basic CycloneDX SBOM.
4. Fail generation and create a blocker finding if any dependency license is
   unknown.
5. Register notices and SBOM artifacts as evidence for the notice gate.
