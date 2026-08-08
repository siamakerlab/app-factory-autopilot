# App Factory Autopilot

App Factory Autopilot is an Android app production orchestrator for Claude Code,
Codex, and a shared MCP core. Its goal is to take a new folder or an existing
Android project from product planning through roadmap creation, implementation,
build/test/lint gates, independent verification, UX/accessibility review, and
emulator scenario testing.

The project is currently an MVP-1 implementation. The roadmap and completion
criteria are tracked in [ROADMAP.md](./ROADMAP.md), which is the single source of
truth for scope and remaining verification work.

## What It Builds

App Factory Autopilot is designed to generate production-oriented Android apps,
not just starter templates. A full run can include:

- Product planning from an app idea.
- Competitive app, community, and review research when enabled.
- Requirements, roadmap, and project documentation.
- Android project scaffold generation.
- Modern Android UI/UX checks, Material 3, adaptive layout, and accessibility
  review.
- In-app review and in-app update implementation when enabled.
- Build, unit test, lint, license, SBOM, placeholder, and emulator gates.
- Full emulator scenario testing through `factory test`.
- Resume support after token limits, system shutdowns, or interrupted sessions.

AdMob ads and in-app billing are excluded by default. They are implemented only
when the user explicitly enables them through `factory config` or `factory plan`.

## Repository Layout

```text
core/               Platform-neutral source: agents, skills, schemas, prompts, policies
mcp-server/         app-factory-core MCP server
orchestrator/       Deterministic workflow/orchestration logic
adapters/           Claude Code and Codex adapter notes
project-template/   Android project and planning document templates
scripts/            Adapter build, rendering, Gradle version, license scripts
tests/              Repository-level tests
dist/               Generated adapter packages, not the source of truth
```

Generated adapter output is recreated from `core/` by:

```bash
node scripts/build-adapters.mjs
```

Do not edit generated files under `dist/` manually.

## Requirements

For local development of this repository:

- Node.js 20 or newer.
- npm.
- Python 3 for schema tests.

For generated Android projects:

- Android SDK.
- `adb` and emulator tools when emulator testing is enabled.
- A JDK compatible with the generated Android toolchain.
- Gradle wrapper metadata generated from the official Gradle current release
  endpoint.

The plugin does not assume that these tools are already installed. `factory
doctor`, `factory auto`, and `factory test` are expected to inspect the current
user environment and report missing tools, settings, permissions, or devices. For
emulator-related gaps, the user-facing flow should ask: "Prepare it now?" and,
after approval, install or create what can be prepared automatically.

## Build And Test

From the repository root:

```bash
node scripts/build-adapters.mjs
node --test tests/*.mjs
python3 tests/schema-positive-tests.py
python3 tests/schema-negative-tests.py
```

For the MCP server:

```bash
cd mcp-server
npm test
```

Useful validation commands:

```bash
git diff --check
sh -n scripts/emulator-smoke.sh
```

## Installation

### Option A. Install From npm

The package is published on npm as `app-factory-autopilot@0.1.9`.
Install the CLI with:

```bash
npm install -g app-factory-autopilot
```

Then install the provider package:

```bash
app-factory-autopilot install codex
app-factory-autopilot install claude-code
```

For one-off usage:

```bash
npx app-factory-autopilot install codex
npx app-factory-autopilot install claude-code
```

To confirm the published version:

```bash
npm view app-factory-autopilot version
```

The CLI builds the bundled MCP server, generates the adapter package, and copies
it with Node's filesystem APIs so installation does not depend on a POSIX shell.
It also registers provider marketplaces and tries to activate the plugin with
`codex plugin remove`/`codex plugin add` or
`claude plugin marketplace update` plus `claude plugin install`/`update` when
those CLIs are available.
Codex installs to
`~/plugins/app-factory-autopilot` by default and updates
`~/.agents/plugins/marketplace.json`. Each Codex install also updates the copied
plugin manifest with a `+codex.<cachebuster>` version suffix, which forces Codex
to observe refreshed local plugin contents after npm package updates.

Codex install paths can be overridden:

```bash
APP_FACTORY_CODEX_PLUGIN_PARENT="$HOME/plugins" \
APP_FACTORY_CODEX_MARKETPLACE="$HOME/.agents/plugins/marketplace.json" \
app-factory-autopilot install codex
```

Claude Code installs through a local marketplace rooted at
`~/.claude/plugins/marketplaces/app-factory-autopilot-local` by default. Override
it with `APP_FACTORY_CLAUDE_MARKETPLACE_ROOT`. The installer registers and
refreshes the marketplace, then runs Claude Code plugin install/update so the
provider cache observes new plugin versions. Set
`APP_FACTORY_SKIP_PROVIDER_ACTIVATION=1` to copy/register files without invoking
provider CLIs.

Useful CLI commands:

```bash
app-factory-autopilot build
app-factory-autopilot package
app-factory-autopilot path
```

The package also installs a lightweight local `factory` helper for tasks that do
not require an AI provider:

```bash
factory doctor
factory status
factory config
factory config --set market_research=true --set emulator=false
factory test prepare
```

Full implementation workflows still run inside the provider command surface:
`/factory plan|init|auto|resume|test|review` in Claude Code or
`$factory plan|init|auto|resume|test|review` in Codex.

### Option B. Install From This Repository

```bash
npm install -g git+https://github.com/siamakerlab/app-factory-autopilot.git
app-factory-autopilot install codex
```

For the private Gitea remote:

```bash
npm install -g git+ssh://git@gitea.wody.kr:2929/wody/app-factory-autopilot.git
app-factory-autopilot install codex
```

### Option C. Build The Adapter Packages Manually

```bash
npm --prefix mcp-server install
npm --prefix mcp-server run build
node scripts/build-adapters.mjs
```

This generates:

- `dist/claude-code/`
- `dist/codex/`

For install-friendly archives, run:

```bash
node scripts/package-plugin.mjs
```

This creates:

```text
packages/app-factory-autopilot-claude-code-v0.1.9.tar.gz
packages/app-factory-autopilot-codex-v0.1.9.tar.gz
packages/SHA256SUMS
packages/README.md
```

Each archive contains an `INSTALL.md` and `install-local.sh`. The npm CLI is the
recommended cross-platform installer; the archive `install-local.sh` scripts are
for POSIX shell environments.

### 2. Claude Code

Use the generated Claude Code package in `dist/claude-code/`.

If you built archives, install from the package:

```bash
cd packages
tar -xzf app-factory-autopilot-claude-code-v0.1.9.tar.gz
cd claude-code
./install-local.sh
```

The package contains:

- `.claude-plugin/plugin.json`
- `.mcp.json`
- `/factory` command
- Factory agents
- Factory skills
- Cross-turn automatic continuation runner for production-readiness automation
- Optional Stop Hook fallback for `factory auto`, `factory resume`, and
  `factory test`
- Bundled MCP server files
- Project templates and rendering scripts

After installing or linking the generated package into Claude Code, verify:

```text
/factory doctor
/factory status
```

The expected command form is:

```text
/factory config
/factory plan "app idea"
/factory init
/factory auto
/factory resume
/factory test
/factory review
/factory status
/factory doctor
```

For unattended completion after planning, run the npm CLI from the target
project instead of manually retyping provider prompts:

```bash
factory auto claude-code .
```

### 3. Codex

Use the generated Codex package in `dist/codex/`.

If you built archives, install from the package:

```bash
cd packages
tar -xzf app-factory-autopilot-codex-v0.1.9.tar.gz
cd codex
./install-local.sh
```

The package contains:

- `.codex-plugin/plugin.json`
- `$factory` prompt entry points
- Factory agents and process skills
- `.mcp.json`
- `config/mcp.toml` MCP snippet
- Cross-turn automatic continuation runner
- Bundled MCP server files
- Project templates and rendering scripts

Merge the generated MCP config into the target Codex configuration as appropriate
for the local Codex installation, then verify:

```text
$factory doctor
$factory status
```

The expected command form is:

```text
$factory config
$factory plan "app idea"
$factory init
$factory auto
$factory resume
$factory test
$factory review
$factory status
$factory doctor
```

For unattended completion after planning, run the npm CLI from the target
project:

```bash
factory auto codex .
```

## Command Reference

| Command | Claude Code | Codex | Purpose |
| --- | --- | --- | --- |
| `config` | `/factory config` | `$factory config` | Configure automation options before a run. |
| `plan` | `/factory plan "idea"` | `$factory plan "idea"` | Interview the user and generate project planning artifacts. |
| `init` | `/factory init` | `$factory init` | Adopt an existing Android project without modifying source code. |
| `auto` | `/factory auto` | `$factory auto` | Continue production-readiness automation across bounded turns until done or blocked. |
| `resume` | `/factory resume` | `$factory resume` | Resume from `.app-factory/` state after interruption. |
| `test` | `/factory test` | `$factory test` | Run exhaustive emulator scenario testing. |
| `review` | `/factory review` | `$factory review` | Re-audit implementation without trusting prior claims. |
| `status` | `/factory status` | `$factory status` | Show current run, roadmap, findings, and next work. |
| `doctor` | `/factory doctor` | `$factory doctor` | Inspect skills, MCP servers, agents, and runtime environment. |

`factory go` is a provider command compatibility alias for `factory auto`.

For unattended production-readiness automation from a shell, use the npm CLI:

```bash
factory auto codex .
# or
factory auto claude-code .
```

The CLI runs the provider `factory auto`, waits 30 seconds between provider
turns, then continues with `factory resume` until the app reaches a terminal state:
`completed`, `forced_stop`, `limit_exceeded`, `user_abort`, or `error`.
Override the delay with `APP_FACTORY_AUTO_CONTINUE_DELAY_SECONDS`.

## Typical Workflows

### New App

```text
factory config
factory plan "A habit tracker for busy students"
factory auto codex .
factory review
factory test
```

### Existing Android Project

```text
factory init
factory config
factory plan "Improve the existing app toward production readiness"
factory auto codex .
factory review
factory test
```

### Interrupted Session

```text
factory resume
```

Resume never relies on chat history. It reads `.app-factory/`, recovers stale
claims, skips completed work, and continues from the next valid task.

## Configuration Defaults

`factory config` edits `APP_FACTORY.automation.*`.

Default behavior:

- `market_research`: enabled
- `modern_ui`: enabled
- `ux_intuitiveness_review`: enabled
- `accessibility_review`: enabled
- `in_app_review`: enabled
- `in_app_update`: enabled
- `store_readiness`: enabled
- `observability`: enabled
- `performance_review`: enabled
- `security_privacy_review`: enabled
- `license_review`: enabled
- `emulator`: disabled by default
- `ads`: disabled by default
- `billing`: disabled by default

When `emulator=false`, automation should implement all code-verifiable work and
only recommend enabling emulator validation in the final report. It should not
ask about emulator use in the middle of the run.

When `factory test` is executed, emulator use is considered approved for that
command. If emulator tools or devices are missing, the plugin should report what
is missing and ask whether it should prepare them now.

## Version And Dependency Policy

No Gradle or library version is pinned in templates.

Before adding or rendering a dependency, the plugin must:

1. Check the official documentation or metadata for the latest stable version.
2. Prefer mobile docs MCP.
3. Use context7 as a secondary source when installed.
4. Fall back to the official web page only when the MCP sources are unavailable.
5. Reject preview, alpha, beta, rc, canary, nightly, snapshot, dynamic, or unknown
   versions unless an explicit user approval path exists.
6. Cache the confirmed latest stable version and source URL.

The cache is not a stale-version fallback. User-facing messaging should say:

```text
The latest stable Gradle version has been updated to 9.7. Downloading it and continuing.
```

It should not say:

```text
Gradle 9.7 is unavailable, so using cached 9.6.1.
```

Gradle itself is resolved by:

```bash
node scripts/resolve-gradle-version.mjs --cache .app-factory/cache/gradle-current.json
```

The script trusts only `https://services.gradle.org/versions/current`, requires a
stable final release, and records the distribution SHA-256.

## Capability Doctor

`factory doctor` checks:

- Required/recommended/optional skills.
- MCP servers such as mobile-docs, context7, mobile-mcp, and GitHub.
- Provider-specific agents or subagents.
- Android SDK, `adb`, emulator, Gradle/Wrapper, AVDs, connected devices, and
  other runtime prerequisites.

Missing capabilities are shown with:

- Status: available, missing, blocked, or unknown.
- Required feature or command.
- Remediation.
- Whether the gap blocks the current command.
- Whether App Factory can prepare it after user approval.

Automatic installation or environment modification requires user confirmation.

## Completion Model

Only `VERIFIED` is complete.

Implementation workers may submit `IMPLEMENTED`, but they cannot mark roadmap
items as verified. Completion requires independent verifier evidence such as
code references, tests, build logs, lint output, screenshots, emulator results,
license reports, SBOMs, or gate results.

The state machine is:

```text
NOT_STARTED -> IN_PROGRESS -> IMPLEMENTED -> VERIFIED
                    |              |
                    +-> PARTIAL ---+
                    +-> BLOCKED
                    +-> NEEDS_HUMAN_DECISION
```

## Important Safety Rules

- Do not invent unknown values. Use `${PLACEHOLDER_*}` with metadata.
- Do not generate release keystores automatically.
- Do not perform real store deployment without explicit user approval.
- Do not enable ads or billing unless the plan/config explicitly enables them.
- Do not mark work complete without evidence.
- Do not treat skipped emulator checks as passed.
- Do not use cached old Gradle/library versions as a substitute for latest stable
  official verification.
- Do not modify generated adapter output manually.

## Documentation

- [ROADMAP.md](./ROADMAP.md) - MVP-1 scope, completion criteria, and remaining work.
- [CHANGELOG.md](./CHANGELOG.md) - Change history.
- [LICENSE](./LICENSE) - Apache License 2.0.
- [NOTICE](./NOTICE) - Copyright notice.
- [mvp.txt](./mvp.txt) - Original planning notes retained for historical context.

## License

Copyright 2026 Sia Makerlab.

Licensed under the Apache License, Version 2.0. See [LICENSE](./LICENSE) and
[NOTICE](./NOTICE).
