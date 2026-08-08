---
name: factory-config
description: Configures automation options as checkboxes; defaults exclude emulator, ads, and billing
kind: entry
uses_skills: [capability-audit]
---

# factory config

Use this command to change the current project's automation scope. If values
were already selected in `factory plan` or saved in APP_FACTORY config, display
those values as the current checkbox state. Do not spend time resetting the
project to defaults. If the platform supports checkbox UI, use checkboxes; if
not, show the same items as a list and save the user's changed selections.

## Defaults

- Enable all production quality review features by default.
- Exceptions: `automation.emulator=false`, `automation.ads=false`, and
  `automation.billing=false` are defaults. Ads and in-app billing are included
  only when the user explicitly enables them in plan or config.
- `automation.defer_emulator_prompt_until_final=true` is the default. When
  emulator is disabled, do not ask during the middle of the workflow. Implement
  and verify everything possible in code, then recommend emulator verification
  only in the final report.

## Checkbox Items

| Setting | Default | Meaning |
|---|---:|---|
| `market_research` | true | Competitor, community, and user-review research |
| `modern_ui` | true | Material 3 and adaptive UI modernization |
| `ux_intuitiveness_review` | true | Core UX intuitiveness review and fixes |
| `accessibility_review` | true | Accessibility review and fixes |
| `in_app_review` | true | Google Play in-app review |
| `in_app_update` | true | Google Play in-app update |
| `ads` | false | Ads and consent flow |
| `billing` | false | In-app billing and purchase restore |
| `store_readiness` | true | Store listing readiness checks |
| `observability` | true | Crash and analytics observability |
| `performance_review` | true | Performance, memory, and startup review |
| `security_privacy_review` | true | Security and privacy review |
| `license_review` | true | License, notices, and SBOM review |
| `emulator` | false | Emulator execution verification |

## Application Rules

1. Initial checkbox state uses this precedence: `defaults.yaml < factory plan
   answers < saved APP_FACTORY config`.
2. Save selections under APP_FACTORY `automation.*`.
3. Synchronize related settings, such as disabling `in_app_review.enabled` when
   `automation.in_app_review=false`.
4. Treat disabled features as `n_a` in roadmap and review scoring. Keep minimal
   static checks for security, license, and privacy because they affect release
   risk.
5. If `automation.emulator=false`, `factory auto` must not treat emulator gate as
   a mid-workflow hard stop. Leave a release-readiness warning and recommend
   emulator verification only in the final report.

## Output

- Current setting summary.
- Changed item list.
- Review areas marked `n_a` because of disabled features.
- Whether the final emulator recommendation is deferred.
