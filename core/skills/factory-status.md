---
name: factory-status
description: Read-only current state summary with four-part progress report and pending items
kind: entry
---

# factory status

Show current state without changing it.

## Procedure

1. Call `factory_get_status` and `factory_progress_report`.
2. Render the same four-part report as spec 3.15: current progress, future goal,
   next-turn plan, and total progress percentage.
3. Also show roadmap status distribution, open findings with blockers
   highlighted, pending approvals, release-blocking placeholders, and latest run
   exit reason.
4. If `.app-factory` is missing, tell the user in their language to start with
   `factory plan` for a new project or `factory init` for an existing project.

Keep the report concise. Do not explain how `factory-status` works unless the
user asks.
