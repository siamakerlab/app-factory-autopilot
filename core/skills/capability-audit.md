---
name: capability-audit
description: Lightweight workflow preflight capability check; proposes installs for missing required capabilities without blocking progress
kind: process
---

# capability-audit

Run this lightweight preflight at the start of `plan`, `init`, and `auto`. It
performs only the scan and proposal subset of `factory doctor`.

1. The adapter detects installed capabilities and passes them to
   `capability_scan`.
2. The adapter checks the current user environment, including Android SDK, adb,
   emulator, Gradle or Wrapper, runnable AVD or connected device, and mobile-mcp,
   then passes results to `capability_record_environment`. Use the current user
   environment only; never treat the development machine state as evidence.
3. If required capabilities are missing, show install proposals. The full
   factory-doctor flow may handle the installation. If the user selects nothing,
   continue the workflow and record warnings plus expected quality impact.
4. Show environment gaps as user-action guidance. Block only when the missing
   capability is required for the feature being executed.
5. Record declined items with `capability_mark_declined` so they are not
   repeatedly proposed in the same session.
6. Save results in `.app-factory/config/capabilities.yaml` so later agents can
   decide which capabilities are available.
