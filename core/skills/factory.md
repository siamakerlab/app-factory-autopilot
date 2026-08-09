---
name: factory
description: App Factory Autopilot command router for config, plan, init, auto, resume, test, review, status, and doctor
kind: entry
---

# /factory Router

Parse the first argument token as a subcommand and delegate to the matching
skill.

| Subcommand | Delegated skill | Notes |
|---|---|---|
| `config` | factory-config | Automation checkbox settings |
| `plan "description"` | factory-plan | |
| `init` | factory-init | Existing projects only |
| `auto` | factory-auto | |
| `go` | factory-auto | Compatibility alias |
| `resume` | factory-resume | Finds interruption point and resumes |
| `test` | factory-test | Emulator-based exhaustive user scenario testing |
| `review` | factory-review | |
| `status` | factory-status | |
| `doctor` | factory-doctor | |

- If the command is unsupported or missing, show the table as help and stop.
- Keep the router thin. Do not put workflow logic here.
- For unattended completion after `plan`, `factory auto [codex|claude-code]
  [project-path]` is the CLI runner. Provider prompts `/factory auto` and
  `$factory auto` must not mark a one-unit boundary as terminal. If
  `APP_FACTORY_AUTO_RUNNER=1`, finish exactly one bounded unit and leave the run
  `running` unless production readiness, forced stop, limit exhaustion, user
  abort, or error is real. If not launched by the runner, continue selecting and
  executing the next bounded unit in the same provider session.
- Before `plan`, `init`, `auto`, `resume`, or `test`, run `capability-audit` as
  preflight. Missing required capabilities should be proposed, but installs must
  not run without user confirmation.
- Do not tell the user which internal skill you are delegating to during normal
  execution. Route silently and report only concrete outcomes.
