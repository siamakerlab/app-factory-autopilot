---
name: dependency-report
description: Updates DEPENDENCIES.md with approval history, versions, review evidence, and decisions
kind: process
---

# dependency-report

1. Read every request under `.app-factory/state/dependencies/`.
2. Update `DEPENDENCIES.md` with coordinates, approved versions, review URLs,
   license decisions, approval or rejection status, and request rationale.
3. Preserve rejection history with reasons so repeated requests for the same
   library can reference it.
4. Register the updated report as evidence.
