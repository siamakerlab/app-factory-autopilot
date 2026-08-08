---
name: factory-doctor
description: Checks required development capabilities and proposes installs with checklist selection, scope, and guidance-doc updates
kind: entry
uses_skills: [capability-audit]
---

# factory doctor

Check installed skills, MCP servers, subagents, and runtime tools required for
Android app production. Do not assume a specific developer machine. Every run
must inspect the current user environment and explain missing tools, settings,
permissions, or devices.

## Procedure

1. **Detect** provider capabilities and pass installed skill, MCP, and subagent
   lists to `capability_scan`. Pass Android SDK, adb, emulator, Gradle or
   Wrapper, runnable AVD or connected device, and mobile-mcp environment checks
   to `capability_record_environment`.
2. **Propose** missing items by category as a checklist. Show name, purpose,
   priority, and whether an API key is required. Collapse optional items by
   default. Do not re-propose declined items. For environment gaps, show status,
   required feature, user action, and blocking condition. For emulator, AVD, and
   adb gaps that can be prepared automatically, ask "Would you like me to prepare
   it now?" in the user's language, then install, create, and recheck after user
   approval.
3. **Select scope** globally or per project.
4. **Install** commands from `capability_install_plan` only after user
   confirmation. Report success or failure per item.
5. **Recheck and record** with `capability_mark_installed` or
   `capability_mark_declined`.
6. **Guidance docs**: add successful guidance to the selected scope. For global
   scope, update the user's global Claude/Codex guidance only after showing a
   diff and receiving confirmation. For project scope, update the capability
   section of `APP_FACTORY_RULES.md`.

## Principles

- The workflow can continue with missing capabilities as warnings.
- Environment gaps should block only when the related feature is actually run.
- Emulator gaps should offer preparation, not just static advice.
- MCP servers that need API keys must clearly say so and proceed only if the user
  selects them.
