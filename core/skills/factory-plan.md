---
name: factory-plan
description: Interactive interview that creates project plan, initial roadmap, and 17 documentation artifacts without implementing code
kind: entry
uses_agents: [roadmap-architect, roadmap-auditor]
uses_skills: [capability-audit, roadmap-create]
---

# factory plan

This command can run in an empty directory. Do not implement code.

## Procedure

1. Run `capability-audit` preflight and propose missing required capabilities.
2. Create `.app-factory` with `factory_initialize`.
3. Run the interview defined in `core/prompts/interview/interview.yaml`:
   - ask small groups by area; never ask dozens of questions at once;
   - never ask already answered questions again; save answers immediately under
     `.app-factory/config/interview/<area>.json`;
   - present recommended values for automatically decidable items and ask only
     whether the user wants to change them;
   - convert unknown or undecided answers to placeholders; do not invent values;
   - resume from remaining questions after interruption.
4. After the interview, merge defaults into APP_FACTORY.yaml and save the config
   snapshot with `factory_initialize`.
5. Create and audit the initial roadmap with `roadmap-create`.
6. Render 17 documentation artifacts with
   `scripts/render-app-factory-project.mjs --scope docs`.
7. Report roadmap item count, release-blocking placeholders, and next step
   (`factory auto`) in the user's language.

## Defaults When Unspecified

- Implementation language: Kotlin with the recommended Android stack.
- App default language: English.
- Localization structure: always enabled.
- The package name must be confirmed before project generation in `factory auto`.
  If unknown, ask separately whether a temporary package name may be used.

## Mock Answer Mode

If `AFA_INTERVIEW_ANSWERS=<file>` is set, use the JSON answers instead of an
interactive interview. Shape: `{ "<questionID>": <answer> }`.
