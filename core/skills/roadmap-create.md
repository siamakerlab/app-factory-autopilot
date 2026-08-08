---
name: roadmap-create
description: Creates the initial roadmap through Architect drafting and Auditor review
kind: process
uses_agents: [roadmap-architect, roadmap-auditor]
---

# roadmap-create

1. Roadmap Architect drafts the roadmap from interview results and app
   description. The `roadmap-draft-v1` output must include requirement, scope,
   completion criteria, test criteria, execution criteria, dependencies,
   priority, and risk for every item.
2. Import the draft with `roadmap_parse`. Items without completion criteria,
   duplicate IDs, and unresolved dependencies are rejected here.
3. Roadmap Auditor runs `roadmap-audit`.
4. If blocker or major findings exist, the Architect fixes the draft and repeats
   steps 2 and 3 up to three times. After that, record
   `NEEDS_HUMAN_DECISION`.
5. When the audit is clean, render `ROADMAP.md` with
   `roadmap_render_markdown` and return a summary.
