---
name: factory-init
description: Introduces App Factory Autopilot to an existing project through codebase analysis, state-store creation, and roadmap synchronization
kind: entry
uses_agents: [project-explorer]
uses_skills: [capability-audit, project-explore]
---

# factory init

Use this command only for an existing project.

## Procedure

1. If the folder is empty, stop and tell the user that `factory init` is for
   existing projects and new projects should start with `factory plan`.
2. Run `capability-audit` preflight.
3. Create `.app-factory` with `factory_initialize`. Do not modify existing source
   files; this is read-only analysis.
4. Run `project-explore` to analyze modules, Gradle, libraries, and
   implementation state.
5. Synchronize roadmap candidates through `roadmap_parse`. Candidate statuses may
   reach only `PARTIAL` or `IMPLEMENTED`; `VERIFIED` is possible only after
   Completion Verifier review.
6. Register unresolved values as placeholders.
7. If key requirements or value propositions are missing, recommend `factory
   plan`, then continue with `factory auto` afterward.

## Report

Show module and stack summary, implementation-state summary, roadmap candidates,
placeholders, and findings such as hardcoded versions, dynamic versions, or
dependencies with unclear licenses.
