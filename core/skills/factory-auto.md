---
name: factory-auto
description: Continues app development automatically until production readiness, using bounded turn-sized work units
kind: entry
uses_agents: [factory-orchestrator, implementation-worker, completion-verifier]
uses_skills: [capability-audit, roadmap-implement, completion-verify, final-gate]
---

# factory auto

Alias: `factory go`.

Analyze the current project state and keep the autopilot mission moving until
the app reaches production readiness or a real blocker is found. Each provider
turn should complete one roadmap item or one coherent unit of work, then end
with a concise status summary and the next resume prompt. Automatic continuation
must be handled by the provider hook/wrapper or a new invocation within the
configured delay; a one-cycle full stop is a failure mode.

## Procedure

0. Entry-point rule:
   - `factory auto [codex|claude-code] [project-path]` is the unattended
     production-readiness command. It starts provider turns, waits the configured
     delay, and reinvokes `factory resume` until a terminal state.
   - `/factory auto` and `$factory auto` are provider-turn prompts. When launched
     by the auto runner, they perform the current bounded unit and let the runner
     start the next turn. When launched manually, they still leave state ready
     for `factory auto` to continue.
1. Run `capability-audit` preflight.
2. Prepare resume state with `factory_recover_stale_claims`, then read the state
   store in the order defined by `state-store.md`. If `.app-factory` is missing:
   - if no plan artifact exists, tell the user to run `factory plan`;
   - if plan artifacts exist, import them and continue.
3. Run one bounded work unit for the next actionable roadmap item or task:
   - `orchestrator_decide_next` -> delegate phase -> validate result -> record
     progress report.
   - For `project_setup`, generate Android scaffold with
     `scripts/render-app-factory-project.mjs --scope android` only when official
     latest-stable version context is available.
   - Show one four-part progress report in the user's language at the end of the
     turn.
   - If human decisions are needed and do not block the critical path, record
     them as `NEEDS_HUMAN_DECISION` and continue.
   - If `automation.emulator=false`, do not ask about emulator use mid-workflow.
     Implement and statically verify everything possible, then recommend emulator
     verification only in the final report.
   - On build or test failure, call `task_report_failure` and let retry policy
     decide.
4. Before ending the turn, commit and push completed changes when source files
   changed and repository remotes are available.
5. At the turn boundary, report:
   - `completed`: all gates passed plus evidence list;
   - `unit_complete`: completed unit, evidence, commit/push status, and that the
     autopilot will continue with `factory resume`;
   - `forced_stop`: pending decisions with options, rationale, risk, and
     recommendation;
   - `limit_exceeded`: current state and remaining work.

## User Communication

- Treat `factory auto` as an execution mode, not a tutorial. Do not describe
  internal skill routing, prompt rules, state-machine phases, or why a step
  exists unless the user asks.
- Normal updates should be short and outcome-oriented:
  - current concrete work;
  - evidence or result, such as files changed, test result, finding ID, commit,
    or push;
  - next concrete action;
  - progress percentage when available.
- Do not show full checklists, scoring matrices, or long option comparisons
  during the run. Save them as evidence/report artifacts and surface only the
  summary.
- If the next action is obvious and safe, execute it instead of asking or
  explaining. Ask only for blocking product decisions, credentials, legal/store
  policy, signing, ads/billing, emulator preparation, or dangerous operations.
- End the provider turn after one completed unit, but do not end the overall
  autopilot mission. The next turn must resume automatically when the provider
  environment supports the auto runner or a continuation hook.

## Prohibited

- Running dangerous work without approval.
- Reporting completion for partially implemented work. Completion means all
  final gates pass.
