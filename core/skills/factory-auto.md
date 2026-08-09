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
the app reaches production readiness or a real blocker is found. In a manual
provider session, the main session is the long-running orchestrator: it selects
one agent/skill, delegates one bounded unit, validates the structured report,
checkpoints durable state, and then selects the next unit. External provider
turn runners are CLI fallbacks, not the core UX.

## Goal Completion Boundary

If the host provides a Goal or loop primitive, the Goal objective must be
production readiness, not roadmap depletion. The Goal is complete only when all
of these are true:

- All required roadmap items are `VERIFIED`.
- Competitor-app, community, and user-review research has been performed when
  enabled, and the roadmap has been revised to reflect useful findings,
  differentiation opportunities, UX gaps, accessibility gaps, and explicit
  exclusions.
- Roadmap audit is clean after any mid-run research, review, or implementation
  discoveries. New findings must create or update roadmap items instead of being
  ignored because the original roadmap is done.
- The full quality review rubric has passed or all deductions have linked
  findings, fixes, and re-review evidence.
- Final gates pass in release context, including build, unit test, lint,
  completion, placeholder, license/notice/SBOM, enabled in-app review/update,
  accessibility, security/privacy, performance, and emulator evidence when
  emulator automation is enabled.
- The blocking `production_readiness` gate passes. Final-gate evidence alone is
  not enough to complete the Goal.

Never treat "no remaining roadmap item" as terminal by itself. If research,
review, scoring, audit, or final-gate evidence is missing, add the missing work
to the roadmap/task queue and continue.

## Procedure

0. Entry-point rule:
   - `factory auto [codex|claude-code] [project-path]` is the unattended
     production-readiness command. It starts provider turns, waits the configured
     delay, and reinvokes `factory resume` until a terminal state.
   - `/factory auto` and `$factory auto` are provider-turn prompts. When
     `APP_FACTORY_AUTO_RUNNER=1`, perform the current bounded unit, call
     `factory_finish_cycle`, leave the run `running` for non-terminal unit
     boundaries, and let the runner start the next turn. When launched manually,
     continue immediately with the next bounded unit in the same provider
     session until production readiness, forced stop, limit exhaustion, user
     abort, or error.
   - Never call `factory_abort_cycle` or write `run.status=finished` for a
     normal commit boundary, cycle boundary, or "one unit completed" state.
     Valid terminal reasons are only `completed`, `forced_stop`,
     `limit_exceeded`, `user_abort`, and `error`.
1. Run `capability-audit` preflight.
2. Prepare resume state with `factory_recover_stale_claims`, then read the state
   store in the order defined by `state-store.md`. If `.app-factory` is missing:
   - if no plan artifact exists, tell the user to run `factory plan`;
   - if plan artifacts exist, import them and continue.
   If the app-factory-core MCP tools are not callable in the current provider
   session, stop before changing `.app-factory`, report that provider MCP
   activation is missing, and recommend `factory doctor` or provider restart.
   Do not hand-edit state files as a fallback.
3. Follow `core/policies/delegation.yaml` for the in-session autopilot model:
   - the main session does not code directly;
   - choose exactly one agent/skill from the delegation matrix;
   - never run parallel agents, including read-only research/review agents;
   - pass the required subagent report contract;
   - if a subagent is delayed, check every 5 minutes and choose wait, retry,
     forced termination plus retry, or blocker conversion;
   - save watchdog outcomes to run/cycle state or reports, and surface only
     meaningful actions to the user.
4. Run one bounded work unit for the next actionable roadmap item or task:
   - `orchestrator_decide_next` -> delegate phase -> validate result -> record
     progress report.
   - For `project_setup`, generate Android scaffold with
     `scripts/render-app-factory-project.mjs --scope android` only when official
     latest-stable version context is available.
   - For `market_research`, save evidence with `kind: market_research_report`
     after competitor, community, and user-review inputs are summarized.
   - For `roadmap_refinement`, update or add roadmap items from useful research
     and review findings, then save evidence with
     `kind: roadmap_reflection_report`.
   - For `quality_review`, run the review rubric, save the report through
     `review_save_report`, and continue fixing until all release-blocking targets
     pass or a real blocker is recorded.
   - Show one four-part progress report in the user's language at the end of the
     turn.
   - If human decisions are needed and do not block the critical path, record
     them as `NEEDS_HUMAN_DECISION` and continue.
   - If `automation.emulator=false`, do not ask about emulator use mid-workflow.
     Implement and statically verify everything possible, then recommend emulator
     verification only in the final report.
   - On build or test failure, call `task_report_failure` and let retry policy
     decide.
5. Before ending each unit, commit and push completed changes when source files
   changed and repository remotes are available. This is a required checkpoint,
   not a terminal run state. A provider turn is not unit-complete until
   `git status`, `git commit`, and `git push` have been attempted and the
   commit/push result is included in the progress report. If commit or push
   cannot run, record the blocker/failure evidence instead of silently stopping.
6. At the turn boundary, report:
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
- Do not print full diffs, generated files, full roadmaps, large checklists, or
  skill/prompt text in chat. Save details to files or evidence and summarize the
  outcome, file paths, and verification result.
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
- In CLI runner mode, end the provider turn after one completed unit and keep
  the run `running` so the runner can reinvoke `factory resume`.
- In a manual provider session, do not stop after "1 cycle completed"; continue
  through the main-session orchestrator with the next safe bounded unit.

## Prohibited

- Running dangerous work without approval.
- Running parallel agents or subagents.
- Reporting completion for partially implemented work. Completion means all
  final gates pass.
