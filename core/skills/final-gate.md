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
4. MVP-1 final audit is this gate run. Full cold cross-provider verification is
   MVP-4 scope and can be invoked manually with `factory review`.
