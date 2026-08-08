---
name: factory-resume
description: Resumes an interrupted factory run from state-store evidence after token limits, shutdowns, forced session exits, or other interruption causes
kind: entry
uses_agents: [factory-orchestrator, implementation-worker, completion-verifier]
uses_skills: [capability-audit, roadmap-implement, completion-verify, final-gate]
---

# factory resume

Explicitly resume a factory workflow that stopped for any reason. `factory auto`
is also reentrant, but `resume` records recovery intent in the run history and
first searches for the interruption point.

## Procedure

1. Run `capability-audit` preflight.
2. Confirm that `.app-factory` exists. If not, there is no interruption point;
   tell the user to run `factory plan` or `factory init`.
3. Recover claimed or in-progress tasks left by ended sessions with
   `factory_recover_stale_claims`.
4. Read the latest run, task queue, roadmap status, gate results, and pending
   decisions to determine the resume point.
5. Run the same bounded work-unit procedure as `factory auto` with
   `command=resume`.
6. Record the four-part progress report after the unit. If the production
   mission is not terminal, leave state ready for the automatic next provider
   turn.

## Principles

- Use only `.app-factory` state store as the resume source. Do not trust
  conversation history.
- Do not redo completed work.
- Recover stale claims, but do not break locks for other live processes.
- Approval, placeholder, evidence, and gate policies are identical to
  `factory auto`.
