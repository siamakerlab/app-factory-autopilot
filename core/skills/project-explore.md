---
name: project-explore
description: Read-only analysis of project structure, configuration, and implementation state
kind: process
uses_agents: [project-explorer]
---

# project-explore

Invoke Project Explorer to analyze the folder and project state.

1. Classify project kind: empty, Android, or non-Android.
2. Analyze modules, Gradle, libraries, manifest, and implementation state with
   output contract `project-exploration-v1`.
3. Register findings for hardcoded versions, dynamic versions, and dependencies
   with unknown licenses.
4. For existing projects, create initial roadmap status candidates only up to
   `PARTIAL` or `IMPLEMENTED`. Never grant `VERIFIED`; that belongs to the
   Completion Verifier.
5. Save the analysis as evidence and return a summary.
