---
name: factory-review
description: Cold full-project re-audit; scores quality, shows improvement targets, fixes safe issues, and reports before/after scores
kind: entry
uses_agents: [completion-verifier, roadmap-auditor, license-compliance-auditor, dependency-version-manager]
uses_skills: [completion-verify, placeholder-audit, license-compliance-review, dependency-version-review, final-gate]
---

# factory review

Do not assume implementation is complete. Re-audit the whole project and workflow
from a cold context. Prefer a different agent or provider than the one that
implemented the code, according to `APP_FACTORY.yaml providers.verification`.

## Procedure

1. **Cold context**: ignore implementation conversation history. Review only
   code, roadmap, tests, build results, and evidence.
2. Run every area in `core/policies/review-scoring.yaml`: requirements,
   competitor and community research, completion mislabeling, user flows, screen
   states, UI modernization, UX intuitiveness, data preservation, security,
   privacy, ads and UMP, billing and restore, in-app review, in-app update,
   tests, build, signing, dependency versions, licenses, notices, performance,
   accessibility, localization, placeholders, TODOs, debug residue, and test ad
   IDs.
3. Score each check as pass, fail, or not applicable. Compute weighted area
   scores from 0 to 100. Register every deduction as a finding.
4. Before applying fixes, show target scores, gaps, and an improvement plan with
   task list, priority, and expected impact.
5. Execute safe automatic fixes through fix tasks. Downgrade falsely completed
   roadmap items to `PARTIAL`. Record product or policy decisions as
   `NEEDS_HUMAN_DECISION`.
6. Re-score with the same rubric and show before/after comparison.
7. Save the report to `.app-factory/reports/review-<RunID>.md`.
