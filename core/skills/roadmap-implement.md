---
name: roadmap-implement
description: Roadmap implementation loop; claim, implement, build/test, submit, and request IMPLEMENTED
kind: process
uses_agents: [implementation-worker]
uses_skills: [dependency-version-review, license-compliance-review]
---

# roadmap-implement

1. Get the next task with `factory_get_next_task` and delegate it to the
   Implementation Worker.
2. Worker procedure: claim with token, implement one unit with code and tests,
   run build and unit tests, register evidence, submit result, then request
   roadmap transition to `IMPLEMENTED`.
3. After each task, run build and unit-test gates with `gate_run`. On failure,
   call `task_report_failure` and let retry policy decide.
4. If a new library is needed, the Worker creates `dependency_request`.
   `dependency-version-review` and `license-compliance-review` must pass before
   `dependency_approve` creates follow-up tasks. Do not write code using an
   unapproved library.
5. Run only one write task at a time. Parallel writes require separate Git
   worktrees and are outside MVP-1 scope.
