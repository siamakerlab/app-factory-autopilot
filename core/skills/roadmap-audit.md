---
name: roadmap-audit
description: Audits roadmap omissions and contradictions and registers clean-or-not evidence
kind: process
uses_agents: [roadmap-auditor]
---

# roadmap-audit

Invoke Roadmap Auditor. The checklist is defined in the agent.

- Record results as findings plus audit evidence:
  `data: { audit: "roadmap", clean: <bool> }`.
- The orchestrator uses this evidence to decide whether roadmap-audit phase is
  done.
- `clean=true` requires zero blocker and major findings.
