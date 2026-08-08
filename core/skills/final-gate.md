---
name: final-gate
description: Final completion gate; runs all gates and determines automatic terminal conditions
kind: process
---

# final-gate

1. Run all nine gates with `gate_run_all`. The caller chooses whether the context
   is release mode; in release mode, the Placeholder gate blocks.
2. If `all_passed`, register final gate evidence:
   `kind: gate_result`, `data: { final_gate: true, all_passed: true }`. The
   orchestrator uses this evidence for completed-state decisions.
3. If any gate fails, report findings and enqueue fix tasks for auto-fixable
   items. Do not mark the workflow complete.
4. `factory auto` must not stop at this gate if full quality-review evidence is
   missing. When the configured production-quality areas require competitor or
   community research, UX/accessibility review, in-app review/update checks, or
   other rubric items, enqueue the missing review/fix work and rerun the gate
   after evidence is recorded.
