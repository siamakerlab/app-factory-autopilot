---
name: factory-test
description: Emulator-based exhaustive user-scenario inspection for every feature, button, screen, and expected output
kind: entry
uses_agents: [completion-verifier, implementation-worker]
uses_skills: [capability-audit, completion-verify, final-gate]
---

# factory test

`factory test` is different from `factory review`. It assumes emulator use, and
running the command counts as approval to use the emulator.

## Purpose

Inspect every feature scenario, button, major screen state, and expected output
from the perspective of a real app user. Use emulator screenshots and execution
results as evidence.

## Procedure

1. Run `capability-audit` preflight:
   - use mobile-mcp first when installed;
   - otherwise fall back to adb, `scripts/emulator-smoke.sh`, and Android SDK
     tools;
   - show environment check results to the user. If runnable AVD/device, adb,
     APK path, or package name is missing, explain the missing item and
     remediation in the user's language and ask whether to prepare it now. After
     approval, prepare and recheck. Without preparation, record the test run as
     blocked.
2. Record emulator approval by calling `factory_test_prepare`, setting
   `automation.emulator=true` and
   `automation.defer_emulator_prompt_until_final=false`.
3. Write user scenarios:
   - include every app flow for core features, supporting features, settings,
     onboarding, empty states, error states, permission denial, data
     save/restore, in-app review, and in-app update;
   - if no explicit scenarios exist, generate scenarios from APP_FACTORY
     features; if features are missing too, generate first launch, primary task,
     and state-preservation scenarios;
   - document steps, buttons, related features, expected screen, expected output,
     and expected failure behavior for each scenario.
4. Exhaust the device matrix:
   - default profiles: phone portrait, phone landscape, foldable inner display,
     and 10-inch tablet;
   - change emulator image when useful for size, resolution, font scale, dark
     mode, locale, foldable, or tablet profiles.
5. Execute and observe every scenario on every device profile. Record screenshots,
   logcat, actual output, and button reactions. Store results with
   `factory_test_record_result`.
6. Handle failures immediately:
   - create findings for failures;
   - enqueue P0 fix tasks for auto-fixable issues;
   - after fixes, rerun the failed scenario and related regression scenarios;
   - never report completion until every failure is resolved.
7. Finish with `factory_test_summary`. Test completion requires every
   scenario-device combination to pass and the emulator gate to pass.

## Prohibited

- Judging behavior as correct without screenshots or execution evidence.
- Skipping foldable, tablet, or landscape validation because one phone profile
  passed.
- Reporting completion while failures are merely documented but unfixed.
