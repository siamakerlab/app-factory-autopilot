---
name: completion-verify
description: Independently verifies IMPLEMENTED items with a strict checklist, then grants VERIFIED or downgrades to PARTIAL
kind: process
uses_agents: [completion-verifier]
---

# completion-verify

1. Get verification targets with `roadmap_get_items(status: IMPLEMENTED)`.
2. For each item, create and claim a verification task with role `verifier`, then
   run the Completion Verifier checklist: code existence, call path, UI wiring,
   failure paths, configuration application, residue scan, test validity, and
   build or execution evidence.
3. If all checks pass, transition the item to `VERIFIED` with `criteria_updates`
   and `evidence_ids`. If any check fails, create findings, downgrade the item to
   `PARTIAL`, and enqueue a linked fix task.
4. Save the verification report as evidence.
5. Do not trust implementation conversations or roadmap labels. Completion
   claims without evidence are invalid.
