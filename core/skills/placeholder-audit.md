---
name: placeholder-audit
description: Scans remaining placeholders with one regex source of truth and updates release-blocking placeholder lists
kind: process
---

# placeholder-audit

1. Scan code, resources, and settings with the single regex
   `\$\{PLACEHOLDER_[A-Z0-9_]+\}` from `placeholder-policy.yaml`.
2. Update each placeholder's locations. If an unregistered placeholder is found,
   register it with `placeholder_create`, inferring kind when possible and
   requiring confirmation when needed.
3. Refresh and report release-blocking placeholders with
   `placeholder_list_blocking`.
4. In release APK/AAB inspection, leftover placeholder strings or test ad IDs are
   blocker findings.
5. Update `PLACEHOLDERS.md`, sorted by status, blocking flag, and expected
   resolution timing.
