#!/usr/bin/env node
// Core -> adapter build pipeline (AFA-042).
// Reads core/ as the SSOT and generates dist/claude-code/ and dist/codex/.
// - Deterministic: same input -> same output, with no timestamps.
// - Every generated artifact includes a "do not edit" warning.
// - Unsupported source syntax fails the build; fix core/ instead of adapters.

import * as fs from "node:fs";
import * as path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const CORE = path.join(ROOT, "core");
const DIST = path.join(ROOT, "dist");
const MCP = path.join(ROOT, "mcp-server");
const PROJECT_TEMPLATE = path.join(ROOT, "project-template");
const VERSION = "0.1.9";

const WARN_MD = `<!-- Generated file. Do not edit directly. Source: core/; overwritten by scripts/build-adapters.mjs. -->\n`;
const WARN_JS = `// Generated file. Do not edit directly. Source: core/; overwritten by scripts/build-adapters.mjs.\n`;
const PROMPT_LANGUAGE_POLICY = `## Prompt Language and User Output Policy

- Internal plugin prompts and operational instructions must be written in English.
- Preserve code identifiers, command names, schema keys, file paths, and user-provided text exactly unless a task explicitly asks to change them.
- User-facing responses, progress reports, questions, warnings, and final summaries must be written in the user's language.
- Infer the user's language from the latest user message. If the user switches language, switch user-facing output to that language.
- Do not expose this policy as a feature explanation unless the user asks about language behavior.

## Quiet Automation Policy

- Do not narrate internal routing, skill names, prompt rules, policy clauses, or procedural reasons such as "because factory-xx says so" unless the user explicitly asks.
- During factory auto, prefer doing the next concrete task over explaining the workflow. User-visible updates should describe only material work, blockers, decisions needed, test/build results, commits, pushes, and final status.
- Factory auto's mission is continuous until production readiness or a real blocker. Each provider turn is bounded to one roadmap item or one coherent unit of work, then the auto runner or continuation hook must start the next resume invocation after the configured delay.
- Keep routine cycle updates to at most four short lines: current work, evidence/result, next concrete action, and progress percentage when available.
- Do not print full checklists, scoring tables, or option analyses during normal automation. Save detailed artifacts to files and mention the file path only when useful.
- Ask the user only for decisions that block the critical path or are required by safety, credentials, legal, store-policy, emulator preparation, payment, ads, signing, or destructive operations.
`;

function promptBody(body) {
  return `${WARN_MD}\n${PROMPT_LANGUAGE_POLICY}\n${body}`;
}

// Frontmatter parser with no external dependency.

function parseFrontmatter(text, file) {
  const m = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) throw new Error(`Missing frontmatter: ${file}`);
  const meta = {};
  let currentKey = null;
  for (const line of m[1].split("\n")) {
    const kv = line.match(/^(\w[\w-]*):\s*(.*)$/);
    if (kv) {
      currentKey = kv[1];
      const v = kv[2].trim();
      if (v === "") meta[currentKey] = [];
      else if (v.startsWith("[") && v.endsWith("]")) {
        meta[currentKey] = v.slice(1, -1).split(",").map((s) => s.trim()).filter(Boolean);
      } else meta[currentKey] = v;
    } else {
      const item = line.match(/^\s*-\s+(.*)$/);
      if (item && currentKey && Array.isArray(meta[currentKey])) meta[currentKey].push(item[1].trim());
    }
  }
  return { meta, body: m[2].trim() };
}

function readDirMd(dir) {
  return fs.readdirSync(dir).filter((f) => f.endsWith(".md")).sort()
    .map((f) => {
      const p = path.join(dir, f);
      const { meta, body } = parseFrontmatter(fs.readFileSync(p, "utf-8"), p);
      return { file: f, meta, body };
    });
}

function write(p, content) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content, "utf-8");
}

function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name);
    const d = path.join(dst, e.name);
    if (e.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

function copyMcpServer(dst) {
  execFileSync("npm", ["run", "build"], { cwd: MCP, stdio: "pipe" });
  copyDir(path.join(MCP, "dist"), path.join(dst, "dist"));
  fs.copyFileSync(path.join(MCP, "package.json"), path.join(dst, "package.json"));
  fs.copyFileSync(path.join(MCP, "package-lock.json"), path.join(dst, "package-lock.json"));
  write(
    path.join(dst, "README.md"),
    WARN_MD +
      "Bundled app-factory-core MCP server. After installation, run `npm ci --omit=dev` in this directory to install runtime dependencies.\n",
  );
}

function copyRenderSupport(dst) {
  copyDir(PROJECT_TEMPLATE, path.join(dst, "project-template"));
  const scriptsDir = path.join(dst, "scripts");
  fs.mkdirSync(scriptsDir, { recursive: true });
  for (const name of ["render-template.mjs", "render-app-factory-project.mjs", "resolve-gradle-version.mjs"]) {
    fs.copyFileSync(path.join(ROOT, "scripts", name), path.join(scriptsDir, name));
  }
}

function writeInstallScript(target, lines) {
  write(target, lines.join("\n") + "\n");
  fs.chmodSync(target, 0o755);
}

// Load source documents.

const agents = readDirMd(path.join(CORE, "agents"));
const skills = readDirMd(path.join(CORE, "skills"));
const entrySkills = skills.filter((s) => s.meta.kind === "entry");
const processSkills = skills.filter((s) => s.meta.kind === "process");
if (entrySkills.length === 0 || agents.length === 0) throw new Error("Core prompt sources are empty");

// Claude Code adapter (AFA-040).

const CC = path.join(DIST, "claude-code");
fs.rmSync(CC, { recursive: true, force: true });

// plugin manifest
write(
  path.join(CC, ".claude-plugin", "plugin.json"),
  JSON.stringify(
    {
      name: "app-factory-autopilot",
      description:
        "Automates Android app planning, implementation, verification, and completion gating from an empty directory.",
      version: VERSION,
      author: { name: "Sia Makerlab" },
    },
    null,
    2,
  ) + "\n",
);

// /factory command router.
const factoryRouter = skills.find((s) => s.meta.name === "factory");
write(
  path.join(CC, "commands", "factory.md"),
  `---\ndescription: "${factoryRouter.meta.description}"\n---\n\n` +
    promptBody(factoryRouter.body) +
    "\n\nArguments: $ARGUMENTS\n",
);

// Agent -> subagent.
for (const a of agents) {
  const tools = (a.meta.mcp_tools ?? []).map((t) => `mcp__app-factory-core__${t}`);
  write(
    path.join(CC, "agents", `${a.meta.name}.md`),
    `---\nname: ${a.meta.name}\ndescription: "${a.meta.description}"\n` +
      (tools.length ? `tools: ${tools.join(", ")}, Read, Grep, Glob, Bash, Edit, Write\n` : "") +
      `---\n\n` + promptBody(a.body) + "\n",
  );
}

// Skill conversion. Entry skills are still shipped as skill bodies; the command routes them.
for (const s of skills) {
  if (s.meta.name === "factory") continue;
  write(
    path.join(CC, "skills", s.meta.name, "SKILL.md"),
    `---\nname: ${s.meta.name}\ndescription: "${s.meta.description}"\n---\n\n` + promptBody(s.body) + "\n",
  );
}

// MCP registration using paths relative to the plugin root (${CLAUDE_PLUGIN_ROOT}).
write(
  path.join(CC, ".mcp.json"),
  JSON.stringify(
    {
      mcpServers: {
        "app-factory-core": {
          command: "node",
          args: [
            "${CLAUDE_PLUGIN_ROOT}/mcp-server/dist/index.js",
            "--project-root",
            ".",
            "--core-dir",
            "${CLAUDE_PLUGIN_ROOT}/core",
          ],
        },
      },
    },
    null,
    2,
  ) + "\n",
);

// Stop Hook. Same-turn continuation fallback; cross-turn auto runner is preferred.
write(
  path.join(CC, "hooks", "hooks.json"),
  JSON.stringify(
    {
      hooks: {
        Stop: [
          {
            matcher: "",
            hooks: [
              { type: "command", command: "node \"${CLAUDE_PLUGIN_ROOT}/hooks/factory-continue.mjs\"" },
            ],
          },
        ],
      },
    },
    null,
    2,
  ) + "\n",
);
write(
  path.join(CC, "hooks", "factory-continue.mjs"),
  WARN_JS +
    `// Stop Hook: optionally blocks session stop while a factory auto/resume/test run is still active.
import * as fs from "node:fs";
import * as path from "node:path";

function latestRun(dir) {
  try {
    const files = fs.readdirSync(dir).filter((f) => /^R-\\d{8}-\\d+\\.json$/.test(f)).sort();
    if (!files.length) return null;
    return JSON.parse(fs.readFileSync(path.join(dir, files[files.length - 1]), "utf-8"));
  } catch { return null; }
}

const run = latestRun(path.join(process.cwd(), ".app-factory", "runs"));
const sameTurn = process.env.APP_FACTORY_CONTINUE_SAME_TURN === "1";
if (sameTurn && run && run.status === "running" && (run.command === "auto" || run.command === "resume" || run.command === "test")) {
  console.log(JSON.stringify({
    decision: "block",
    reason: "Same-turn continuation is enabled. Continue the app-factory mission until production readiness, forced stop, or limit exhaustion.",
  }));
}
process.exit(0);
`,
);

write(
  path.join(CC, "bin", "factory-auto-runner.sh"),
  `#!/bin/sh
# Generated cross-turn runner for Claude Code. Reinvokes factory prompts until a terminal state is reached.
# Usage: factory-auto-runner.sh <project-path>
set -e
cd "\${1:-.}"
DELAY="\${APP_FACTORY_AUTO_CONTINUE_DELAY_SECONDS:-30}"
PROMPT="/factory auto"
while :; do
  APP_FACTORY_AUTO_RUNNER=1 claude -p "$PROMPT" || true
  STATUS=$(node -e '
    const fs=require("fs"),p=".app-factory/runs";
    try{const f=fs.readdirSync(p).filter(x=>/^R-/.test(x)).sort().pop();
    const r=JSON.parse(fs.readFileSync(p+"/"+f));
    console.log(r.status==="finished"?r.exit_reason:"running");}catch(e){console.log("none")}')
  case "$STATUS" in
    completed|forced_stop|limit_exceeded|user_abort|error|none) echo "finished: $STATUS"; break ;;
    *) echo "next turn in \${DELAY}s: $STATUS"; sleep "$DELAY"; PROMPT="/factory resume" ;;
  esac
done
`,
);
fs.chmodSync(path.join(CC, "bin", "factory-auto-runner.sh"), 0o755);

// CLAUDE.md generator output. Reference rules only; do not duplicate process content.
write(
  path.join(CC, "templates", "CLAUDE.md"),
  WARN_MD + "\n" +
    PROMPT_LANGUAGE_POLICY +
    `# CLAUDE.md

This project is managed by App Factory Autopilot.

- **The single source of shared project rules is \`APP_FACTORY_RULES.md\`. Read it first.**
- Change state only through app-factory-core MCP tools. Do not edit \`.app-factory/\` directly.
- Commands: \`/factory config|plan|init|auto|resume|test|review|status|doctor\`
`,
);

// Bundle server and core sources.
copyDir(CORE, path.join(CC, "core"));
copyMcpServer(path.join(CC, "mcp-server"));
copyRenderSupport(CC);
write(
  path.join(CC, "INSTALL.md"),
  `# App Factory Autopilot for Claude Code

This directory is a ready-to-copy Claude Code plugin package.

## Quick Install

\`\`\`bash
./install-local.sh
\`\`\`

The installer creates a local Claude Code marketplace, copies this package to:

\`\`\`text
~/.claude/plugins/marketplaces/app-factory-autopilot-local/plugins/app-factory-autopilot
\`\`\`

It then runs Claude Code marketplace add/update and plugin install/update when
the \`claude\` CLI is available. Set \`APP_FACTORY_SKIP_PROVIDER_ACTIVATION=1\` to
copy/register files without invoking provider CLIs. After installing, restart
Claude Code and run:

\`\`\`text
/factory doctor
/factory status
\`\`\`

## Included

- Claude plugin manifest: \`.claude-plugin/plugin.json\`
- /factory command router
- Factory agents and skills
- Cross-turn auto runner and optional Stop Hook continuation fallback
- app-factory-core MCP server bundle
- Android project templates and render scripts

## Runtime Setup

\`factory doctor\` checks the actual user environment after installation. If Android SDK,
adb, emulator images, AVDs, mobile-mcp, or related tools are missing, it reports what is
missing and asks whether App Factory should prepare it.
`,
);
writeInstallScript(path.join(CC, "install-local.sh"), [
  "#!/bin/sh",
  "set -eu",
  'SRC="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"',
  'MARKETPLACE_ROOT="${APP_FACTORY_CLAUDE_MARKETPLACE_ROOT:-$HOME/.claude/plugins/marketplaces/app-factory-autopilot-local}"',
  'DEST="${APP_FACTORY_CLAUDE_PLUGIN_DIR:-$MARKETPLACE_ROOT/plugins/app-factory-autopilot}"',
  'mkdir -p "$(dirname "$DEST")"',
  'rm -rf "$DEST"',
  'cp -R "$SRC" "$DEST"',
  '(cd "$DEST/mcp-server" && npm ci --omit=dev)',
  'node "$DEST/scripts/install-claude-marketplace.mjs" "$MARKETPLACE_ROOT"',
  'echo "Installed App Factory Autopilot for Claude Code: $DEST"',
  'if [ "${APP_FACTORY_SKIP_PROVIDER_ACTIVATION:-0}" = "1" ]; then',
  '  echo "Activation pending: Claude provider activation skipped by APP_FACTORY_SKIP_PROVIDER_ACTIVATION=1"',
  'elif command -v claude >/dev/null 2>&1; then',
  '  claude plugin marketplace add "$MARKETPLACE_ROOT" --scope user >/dev/null 2>&1 || true',
  '  claude plugin marketplace update app-factory-autopilot-local >/dev/null 2>&1 || true',
  '  claude plugin install app-factory-autopilot@app-factory-autopilot-local --scope user >/dev/null 2>&1 || true',
  '  claude plugin update app-factory-autopilot --scope user >/dev/null 2>&1 || true',
  '  echo "Activated or refreshed Claude Code plugin cache."',
  'else',
  '  echo "Activation pending: claude CLI not found; run claude plugin marketplace add and claude plugin install manually."',
  'fi',
  'echo "Restart Claude Code, then run: /factory doctor"',
]);
write(
  path.join(CC, "scripts", "install-claude-marketplace.mjs"),
  `#!/usr/bin/env node
import * as fs from "node:fs";
import * as path from "node:path";

const marketplaceRoot = process.argv[2];
if (!marketplaceRoot) {
  console.error("Usage: install-claude-marketplace.mjs <marketplace-root>");
  process.exit(2);
}
const marketplacePath = path.join(marketplaceRoot, ".claude-plugin", "marketplace.json");
const marketplace = {
  $schema: "https://anthropic.com/claude-code/marketplace.schema.json",
  name: "app-factory-autopilot-local",
  description: "Local App Factory Autopilot marketplace",
  owner: { name: "Sia Makerlab" },
  plugins: [
    {
      name: "app-factory-autopilot",
      description: "Android app planning, implementation, verification, and emulator testing autopilot.",
      version: "${VERSION}",
      author: { name: "Sia Makerlab" },
      category: "development",
      source: "./plugins/app-factory-autopilot",
    },
  ],
};
fs.mkdirSync(path.dirname(marketplacePath), { recursive: true });
fs.writeFileSync(marketplacePath, JSON.stringify(marketplace, null, 2) + "\\n", "utf-8");
console.log("Updated Claude marketplace: " + marketplacePath);
`,
);
fs.chmodSync(path.join(CC, "scripts", "install-claude-marketplace.mjs"), 0o755);

// Codex adapter (AFA-041).

const CX = path.join(DIST, "codex");
fs.rmSync(CX, { recursive: true, force: true });

write(
  path.join(CX, ".codex-plugin", "plugin.json"),
  JSON.stringify(
    {
      name: "app-factory-autopilot",
      version: VERSION,
      description: "Android app planning, implementation, verification, and emulator testing autopilot.",
      author: { name: "Sia Makerlab" },
      skills: "./skills/",
      mcpServers: "./.mcp.json",
      interface: {
        displayName: "App Factory Autopilot",
        shortDescription: "Generate and verify production-oriented Android apps.",
        longDescription:
          "Plans Android apps, creates roadmaps, drives implementation, resumes interrupted sessions, reviews quality, and runs emulator scenario testing through a bundled MCP core.",
        developerName: "Sia Makerlab",
        category: "Productivity",
        capabilities: [
          "Android project planning",
          "Automated implementation workflow",
          "Capability and runtime environment checks",
          "Emulator scenario testing",
        ],
        defaultPrompt: "$factory doctor",
      },
    },
    null,
    2,
  ) + "\n",
);

// $factory prompt. Codex custom prompt with argument routing.
write(
  path.join(CX, "prompts", "factory.md"),
  promptBody(factoryRouter.body) + "\n\nArguments: $ARGUMENTS\n",
);
for (const s of entrySkills) {
  if (s.meta.name === "factory") continue;
  write(path.join(CX, "prompts", `${s.meta.name}.md`), promptBody(s.body) + "\n");
}

// AGENTS.md generator output. Reference rules only.
write(
  path.join(CX, "templates", "AGENTS.md"),
  WARN_MD + "\n" +
    PROMPT_LANGUAGE_POLICY +
    `# AGENTS.md

This project is managed by App Factory Autopilot.

- **The single source of shared project rules is \`APP_FACTORY_RULES.md\`. Read it first.**
- Role definitions: \`.app-factory-codex/agents/\`. Keep worker and verifier roles separate.
  If subagents are unavailable, use role-switching prompts, but never let the same session both implement and verify the same work.
- Commands: \`$factory config|plan|init|auto|resume|test|review|status|doctor\`
`,
);

// Agent definitions. Codex ships these as prompt files.
for (const a of agents) {
  write(
    path.join(CX, "agents", `${a.meta.name}.md`),
    promptBody(`# ${a.meta.name}\n\nMCP tools: ${(a.meta.mcp_tools ?? []).join(", ") || "none"}\n\n${a.body}`) + "\n",
  );
}
for (const s of processSkills) {
  write(
    path.join(CX, "skills", s.meta.name, "SKILL.md"),
    `---\nname: ${s.meta.name}\ndescription: "${s.meta.description}"\n---\n\n` + promptBody(s.body) + "\n",
  );
}

// MCP config.toml snippet.
write(
  path.join(CX, "config", "mcp.toml"),
  `# Generated snippet. Merge into Codex config.toml.
[mcp_servers.app-factory-core]
command = "node"
args = ["<install-path>/mcp-server/dist/index.js", "--project-root", ".", "--core-dir", "<install-path>/core"]
`,
);
write(
  path.join(CX, ".mcp.json"),
  JSON.stringify(
    {
      mcpServers: {
        "app-factory-core": {
          command: "node",
          args: [
            "${CODEX_PLUGIN_ROOT}/mcp-server/dist/index.js",
            "--project-root",
            ".",
            "--core-dir",
            "${CODEX_PLUGIN_ROOT}/core",
          ],
        },
      },
    },
    null,
    2,
  ) + "\n",
);

// Execution runner. Starts separate provider invocations until the workflow reaches a terminal state.
write(
  path.join(CX, "bin", "factory-auto-runner.sh"),
  `#!/bin/sh
# Generated cross-turn runner for Codex. Reinvokes factory prompts until a terminal state is reached.
# Usage: factory-auto-runner.sh <project-path>
set -e
cd "\${1:-.}"
DELAY="\${APP_FACTORY_AUTO_CONTINUE_DELAY_SECONDS:-30}"
PROMPT="\\$factory auto"
while :; do
  APP_FACTORY_AUTO_RUNNER=1 codex exec "$PROMPT" || true
  STATUS=$(node -e '
    const fs=require("fs"),p=".app-factory/runs";
    try{const f=fs.readdirSync(p).filter(x=>/^R-/.test(x)).sort().pop();
    const r=JSON.parse(fs.readFileSync(p+"/"+f));
    console.log(r.status==="finished"?r.exit_reason:"running");}catch(e){console.log("none")}')
  case "$STATUS" in
    completed|forced_stop|limit_exceeded|user_abort|error|none) echo "finished: $STATUS"; break ;;
    *) echo "next turn in \${DELAY}s: $STATUS"; sleep "$DELAY"; PROMPT="\\$factory resume" ;;
  esac
done
`,
);
fs.chmodSync(path.join(CX, "bin", "factory-auto-runner.sh"), 0o755);

copyDir(CORE, path.join(CX, "core"));
copyMcpServer(path.join(CX, "mcp-server"));
copyRenderSupport(CX);
write(
  path.join(CX, "INSTALL.md"),
  `# App Factory Autopilot for Codex

This directory is a local Codex plugin package.

## Quick Install

\`\`\`bash
./install-local.sh
\`\`\`

The installer copies this package to:

\`\`\`text
~/plugins/app-factory-autopilot
\`\`\`

It also creates or updates the default personal marketplace file:

\`\`\`text
~/.agents/plugins/marketplace.json
\`\`\`

After installing, restart Codex and run:

\`\`\`text
$factory doctor
$factory status
\`\`\`

## Included

- Codex plugin manifest: \`.codex-plugin/plugin.json\`
- $factory prompt entry points
- Factory agents and skills
- app-factory-core MCP server bundle
- MCP companion manifest: \`.mcp.json\`
- Android project templates and render scripts

## Runtime Setup

\`factory doctor\` checks the actual user environment after installation. If Android SDK,
adb, emulator images, AVDs, mobile-mcp, or related tools are missing, it reports what is
missing and asks whether App Factory should prepare it.
`,
);
writeInstallScript(path.join(CX, "install-local.sh"), [
  "#!/bin/sh",
  "set -eu",
  'SRC="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"',
  'PLUGIN_PARENT="${APP_FACTORY_CODEX_PLUGIN_PARENT:-$HOME/plugins}"',
  'MARKETPLACE="${APP_FACTORY_CODEX_MARKETPLACE:-$HOME/.agents/plugins/marketplace.json}"',
  'DEST="$PLUGIN_PARENT/app-factory-autopilot"',
  'mkdir -p "$PLUGIN_PARENT"',
  'rm -rf "$DEST"',
  'cp -R "$SRC" "$DEST"',
  '(cd "$DEST/mcp-server" && npm ci --omit=dev)',
  'node "$DEST/scripts/apply-codex-cachebuster.mjs"',
  'node "$DEST/scripts/install-codex-marketplace.mjs" "$MARKETPLACE"',
  'echo "Installed App Factory Autopilot for Codex: $DEST"',
  'if [ "${APP_FACTORY_SKIP_PROVIDER_ACTIVATION:-0}" = "1" ]; then',
  '  echo "Activation pending: Codex provider activation skipped by APP_FACTORY_SKIP_PROVIDER_ACTIVATION=1"',
  'elif command -v codex >/dev/null 2>&1; then',
  '  codex plugin remove app-factory-autopilot@personal --json >/dev/null 2>&1 || true',
  '  codex plugin add app-factory-autopilot@personal --json >/dev/null 2>&1 || true',
  '  echo "Activated or refreshed Codex plugin cache."',
  'else',
  '  echo "Activation pending: codex CLI not found; run codex plugin add app-factory-autopilot@personal manually."',
  'fi',
  'echo \'Restart Codex, then run: $factory doctor\'',
]);
write(
  path.join(CX, "scripts", "apply-codex-cachebuster.mjs"),
  `#!/usr/bin/env node
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = path.join(root, ".codex-plugin", "plugin.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\\..+$/, "Z");
const cachebuster = process.env.APP_FACTORY_CODEX_CACHEBUSTER || "local-" + stamp;
const baseVersion = String(manifest.version || "0.0.0").split("+")[0];
manifest.version = baseVersion + "+codex." + cachebuster;
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\\n", "utf-8");
console.log("Updated Codex plugin manifest version: " + manifest.version);
`,
);
fs.chmodSync(path.join(CX, "scripts", "apply-codex-cachebuster.mjs"), 0o755);
write(
  path.join(CX, "scripts", "install-codex-marketplace.mjs"),
  `#!/usr/bin/env node
import * as fs from "node:fs";
import * as path from "node:path";

const marketplacePath = process.argv[2];
if (!marketplacePath) {
  console.error("Usage: install-codex-marketplace.mjs <marketplace.json>");
  process.exit(2);
}
const root = path.dirname(marketplacePath);
const entry = {
  name: "app-factory-autopilot",
  source: { source: "local", path: "./plugins/app-factory-autopilot" },
  policy: { installation: "AVAILABLE", authentication: "ON_INSTALL" },
  category: "Productivity",
};
let marketplace = {
  name: "personal",
  interface: { displayName: "Personal" },
  plugins: [],
};
if (fs.existsSync(marketplacePath)) {
  marketplace = JSON.parse(fs.readFileSync(marketplacePath, "utf-8"));
  if (!Array.isArray(marketplace.plugins)) marketplace.plugins = [];
  if (!marketplace.interface) marketplace.interface = { displayName: "Personal" };
}
const idx = marketplace.plugins.findIndex((item) => item && item.name === entry.name);
if (idx >= 0) marketplace.plugins[idx] = entry;
else marketplace.plugins.push(entry);
fs.mkdirSync(root, { recursive: true });
fs.writeFileSync(marketplacePath, JSON.stringify(marketplace, null, 2) + "\\n", "utf-8");
console.log("Updated Codex marketplace: " + marketplacePath);
`,
);
fs.chmodSync(path.join(CX, "scripts", "install-codex-marketplace.mjs"), 0o755);

console.log("Build completed:");
console.log(`- claude-code: agents ${agents.length}, skills ${skills.length - 1}, commands 1, hooks 1`);
console.log(`- codex: prompts ${entrySkills.length}, agents ${agents.length}, skills ${processSkills.length}`);
