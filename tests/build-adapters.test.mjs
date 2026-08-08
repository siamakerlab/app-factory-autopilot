import assert from "node:assert/strict";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import test from "node:test";

const ROOT = path.resolve(import.meta.dirname, "..");

function snapshotDist() {
  const dist = path.join(ROOT, "dist");
  const out = new Map();
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(p);
      else out.set(path.relative(dist, p), fs.readFileSync(p, "utf-8"));
    }
  }
  walk(dist);
  return out;
}

test("adapter build emits required Claude Code and Codex artifacts deterministically", () => {
  execFileSync("node", ["scripts/build-adapters.mjs"], { cwd: ROOT, stdio: "pipe" });
  const first = snapshotDist();
  execFileSync("node", ["scripts/build-adapters.mjs"], { cwd: ROOT, stdio: "pipe" });
  const second = snapshotDist();

  assert.deepEqual(second, first);

  assert.ok(first.has("claude-code/.claude-plugin/plugin.json"));
  assert.ok(first.has("claude-code/commands/factory.md"));
  assert.ok(first.has("claude-code/hooks/hooks.json"));
  assert.ok(first.has("claude-code/bin/factory-auto-runner.sh"));
  assert.ok(first.has("claude-code/.mcp.json"));
  assert.ok(first.has("claude-code/mcp-server/dist/index.js"));
  assert.ok(first.has("claude-code/mcp-server/package.json"));
  assert.ok(first.has("claude-code/project-template/docs/APP_FACTORY_RULES.md.mustache"));
  assert.ok(first.has("claude-code/scripts/render-app-factory-project.mjs"));
  assert.ok(first.has("codex/prompts/factory.md"));
  assert.ok(first.has("codex/.codex-plugin/plugin.json"));
  assert.ok(first.has("codex/.mcp.json"));
  assert.ok(first.has("codex/config/mcp.toml"));
  assert.ok(first.has("codex/bin/factory-auto-runner.sh"));
  assert.ok(first.has("codex/mcp-server/dist/index.js"));
  assert.ok(first.has("codex/mcp-server/package.json"));
  assert.ok(first.has("codex/project-template/android/settings.gradle.kts.mustache"));
  assert.ok(first.has("codex/scripts/render-app-factory-project.mjs"));
  assert.ok(first.has("codex/INSTALL.md"));
  assert.ok(first.has("codex/install-local.sh"));
  assert.ok(first.has("claude-code/INSTALL.md"));
  assert.ok(first.has("claude-code/install-local.sh"));

  const manifest = JSON.parse(first.get("claude-code/.claude-plugin/plugin.json"));
  assert.equal(manifest.name, "app-factory-autopilot");
  const codexManifest = JSON.parse(first.get("codex/.codex-plugin/plugin.json"));
  assert.equal(codexManifest.name, "app-factory-autopilot");
  assert.equal(codexManifest.mcpServers, "./.mcp.json");
  assert.match(first.get("claude-code/hooks/factory-continue.mjs"), /APP_FACTORY_CONTINUE_SAME_TURN/);
  assert.match(first.get("claude-code/hooks/factory-continue.mjs"), /decision: "block"/);
  assert.match(first.get("claude-code/hooks/factory-continue.mjs"), /run\.command === "resume"/);
  assert.match(first.get("claude-code/hooks/factory-continue.mjs"), /run\.command === "test"/);
  assert.match(first.get("claude-code/bin/factory-auto-runner.sh"), /APP_FACTORY_AUTO_CONTINUE_DELAY_SECONDS/);
  assert.match(first.get("claude-code/bin/factory-auto-runner.sh"), /APP_FACTORY_AUTO_RUNNER=1/);
  assert.match(first.get("claude-code/bin/factory-auto-runner.sh"), /\/factory resume/);
  assert.match(first.get("claude-code/.mcp.json"), /mcp-server\/dist\/index\.js/);
  assert.doesNotMatch(first.get("claude-code/.mcp.json"), /mcp-server\/index\.js/);
  assert.match(first.get("codex/config/mcp.toml"), /mcp-server\/dist\/index\.js/);
  assert.doesNotMatch(first.get("codex/config/mcp.toml"), /mcp-server\/index\.js/);
  assert.match(first.get("codex/bin/factory-auto-runner.sh"), /\$factory auto/);
  assert.match(first.get("codex/bin/factory-auto-runner.sh"), /APP_FACTORY_AUTO_CONTINUE_DELAY_SECONDS/);
  assert.match(first.get("codex/bin/factory-auto-runner.sh"), /APP_FACTORY_AUTO_RUNNER=1/);
  assert.match(first.get("codex/bin/factory-auto-runner.sh"), /\$factory resume/);
  assert.match(first.get("codex/install-local.sh"), /marketplace\.json/);
  assert.match(first.get("codex/install-local.sh"), /\$HOME\/plugins/);
  assert.match(first.get("codex/install-local.sh"), /\$HOME\/\.agents\/plugins\/marketplace\.json/);
  assert.match(first.get("codex/install-local.sh"), /echo 'Restart Codex, then run: \$factory doctor'/);
  assert.doesNotMatch(first.get("codex/install-local.sh"), /echo "Restart Codex, then run: \$factory doctor"/);
  assert.doesNotMatch(first.get("codex/INSTALL.md"), /~\/.agents\/plugins\/app-factory-autopilot/);
  assert.match(first.get("codex/INSTALL.md"), /\$factory doctor/);
  assert.match(first.get("claude-code/INSTALL.md"), /\/factory doctor/);
  assert.match(first.get("claude-code/templates/CLAUDE.md"), /auto\|resume\|test\|review/);
  assert.match(first.get("codex/templates/AGENTS.md"), /auto\|resume\|test\|review/);
  for (const file of [
    "claude-code/commands/factory.md",
    "claude-code/agents/factory-orchestrator.md",
    "claude-code/skills/factory-auto/SKILL.md",
    "claude-code/templates/CLAUDE.md",
    "codex/prompts/factory.md",
    "codex/prompts/factory-auto.md",
    "codex/agents/factory-orchestrator.md",
    "codex/skills/roadmap-implement/SKILL.md",
    "codex/templates/AGENTS.md",
  ]) {
    assert.match(first.get(file), /Prompt Language and User Output Policy/);
    assert.match(first.get(file), /User-facing responses, progress reports, questions, warnings, and final summaries must be written in the user's language/);
    assert.match(first.get(file), /Quiet Automation Policy/);
    assert.match(first.get(file), /Do not narrate internal routing, skill names, prompt rules, policy clauses/);
  }
  assert.match(first.get("claude-code/skills/factory-auto/SKILL.md"), /production readiness/);
  assert.match(first.get("claude-code/skills/factory-auto/SKILL.md"), /factory auto \[codex\|claude-code\] \[project-path\]/);
  assert.match(first.get("claude-code/skills/factory-auto/SKILL.md"), /Goal Completion Boundary/);
  assert.match(first.get("claude-code/skills/factory-auto/SKILL.md"), /Never treat "no remaining roadmap item" as terminal by itself/);
  assert.match(first.get("claude-code/agents/factory-orchestrator.md"), /roadmap depletion alone is not terminal/);
  assert.match(first.get("claude-code/skills/final-gate/SKILL.md"), /factory auto` must not stop at this gate if production-readiness evidence is\s+missing/);
  assert.match(first.get("claude-code/skills/final-gate/SKILL.md"), /production_readiness/);
  assert.match(first.get("claude-code/skills/factory-auto/SKILL.md"), /Treat `factory auto` as an execution mode, not a tutorial/);
  assert.match(first.get("codex/prompts/factory.md"), /Route silently and report only concrete outcomes/);

  const mode = fs.statSync(path.join(ROOT, "dist/codex/bin/factory-auto-runner.sh")).mode & 0o777;
  assert.equal(mode, 0o755);
  const claudeLoopMode = fs.statSync(path.join(ROOT, "dist/claude-code/bin/factory-auto-runner.sh")).mode & 0o777;
  assert.equal(claudeLoopMode, 0o755);
  const codexInstallMode = fs.statSync(path.join(ROOT, "dist/codex/install-local.sh")).mode & 0o777;
  assert.equal(codexInstallMode, 0o755);
  const claudeInstallMode = fs.statSync(path.join(ROOT, "dist/claude-code/install-local.sh")).mode & 0o777;
  assert.equal(claudeInstallMode, 0o755);
});

test("plugin packaging emits provider archives and checksums", () => {
  execFileSync("node", ["scripts/package-plugin.mjs"], { cwd: ROOT, stdio: "pipe" });
  const packages = path.join(ROOT, "packages");
  const claudeArchive = path.join(packages, "app-factory-autopilot-claude-code-v0.1.7.tar.gz");
  const codexArchive = path.join(packages, "app-factory-autopilot-codex-v0.1.7.tar.gz");
  assert.ok(fs.existsSync(claudeArchive));
  assert.ok(fs.existsSync(codexArchive));
  const sums = fs.readFileSync(path.join(packages, "SHA256SUMS"), "utf-8");
  assert.match(sums, /app-factory-autopilot-claude-code-v0\.1\.7\.tar\.gz/);
  assert.match(sums, /app-factory-autopilot-codex-v0\.1\.7\.tar\.gz/);
  assert.match(fs.readFileSync(path.join(packages, "README.md"), "utf-8"), /install-local\.sh/);
});

test("root npm package exposes install CLI", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf-8"));
  assert.equal(pkg.name, "app-factory-autopilot");
  assert.equal(pkg.private, undefined);
  assert.equal(pkg.bin["app-factory-autopilot"], "scripts/app-factory-autopilot.mjs");
  assert.equal(pkg.bin.afa, "scripts/app-factory-autopilot.mjs");
  assert.equal(pkg.bin.factory, "scripts/factory-runtime.mjs");
  const help = execFileSync("node", ["scripts/app-factory-autopilot.mjs", "--help"], {
    cwd: ROOT,
    encoding: "utf-8",
  });
  assert.match(help, /install <codex\|claude-code\|both>/);
  assert.match(help, /npx app-factory-autopilot install codex/);
  const cli = fs.readFileSync(path.join(ROOT, "scripts/app-factory-autopilot.mjs"), "utf-8");
  assert.doesNotMatch(cli, /spawnSync\("sh"/);
  assert.match(cli, /fs\.cpSync/);
  assert.match(cli, /os\.homedir/);
  assert.ok(cli.includes('"codex", ["plugin", "add"'));
  assert.ok(cli.includes('"claude", ["plugin", "marketplace", "add"'));
});

test("common factory runtime CLI exposes local status, config, doctor, and test helpers", () => {
  const project = fs.mkdtempSync(path.join(ROOT, ".tmp-runtime-"));
  try {
    const help = execFileSync("node", ["scripts/factory-runtime.mjs", "--help"], {
      cwd: ROOT,
      encoding: "utf-8",
    });
    assert.match(help, /factory doctor/);
    assert.match(help, /factory config --set key=true/);
    assert.match(help, /factory auto \[codex\|claude-code\]/);
    const runtime = fs.readFileSync(path.join(ROOT, "scripts/factory-runtime.mjs"), "utf-8");
    assert.match(runtime, /APP_FACTORY_AUTO_CONTINUE_DELAY_SECONDS/);
    assert.match(runtime, /APP_FACTORY_AUTO_RUNNER/);
    assert.match(runtime, /\$factory resume/);
    assert.match(runtime, /\/factory resume/);

    const config = execFileSync("node", [path.join(ROOT, "scripts/factory-runtime.mjs"), "config", "--set", "ads=true", "--json"], {
      cwd: project,
      encoding: "utf-8",
    });
    assert.equal(JSON.parse(config).config.automation.ads, true);

    const current = execFileSync("node", [path.join(ROOT, "scripts/factory-runtime.mjs"), "config", "--json"], {
      cwd: project,
      encoding: "utf-8",
    });
    assert.equal(JSON.parse(current).checkboxes.find((item) => item.key === "ads").value, true);

    const prepared = execFileSync("node", [path.join(ROOT, "scripts/factory-runtime.mjs"), "test", "prepare", "--json"], {
      cwd: project,
      encoding: "utf-8",
    });
    assert.equal(JSON.parse(prepared).emulator_enabled, true);
    assert.ok(fs.existsSync(path.join(project, ".app-factory")));
  } finally {
    fs.rmSync(project, { recursive: true, force: true });
  }
});

test("npm CLI installs Codex package under the current user's configured paths", () => {
  const home = fs.mkdtempSync(path.join(ROOT, ".tmp-install-"));
  try {
    const pluginParent = path.join(home, "plugins");
    const marketplace = path.join(home, ".agents", "plugins", "marketplace.json");
    const output = execFileSync("node", ["scripts/app-factory-autopilot.mjs", "install", "codex"], {
      cwd: ROOT,
      encoding: "utf-8",
      env: {
        ...process.env,
        HOME: home,
        APP_FACTORY_CODEX_PLUGIN_PARENT: pluginParent,
        APP_FACTORY_CODEX_MARKETPLACE: marketplace,
        APP_FACTORY_SKIP_PROVIDER_ACTIVATION: "1",
      },
    });
    const destination = path.join(pluginParent, "app-factory-autopilot");
    assert.ok(fs.existsSync(path.join(destination, ".codex-plugin", "plugin.json")));
    assert.ok(fs.existsSync(path.join(destination, "mcp-server", "dist", "index.js")));
    const registry = JSON.parse(fs.readFileSync(marketplace, "utf-8"));
    const entry = registry.plugins.find((item) => item.name === "app-factory-autopilot");
    assert.equal(entry.source.path, "./plugins/app-factory-autopilot");
    assert.match(output, /Restart Codex, then run: \$factory doctor/);
    assert.match(output, /Activation pending: Codex plugin activation skipped/);
    assert.doesNotMatch(output, /parameter not set/);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test("npm CLI installs Claude package as a local marketplace and skips activation in CI", () => {
  const home = fs.mkdtempSync(path.join(ROOT, ".tmp-install-"));
  try {
    const marketplaceRoot = path.join(home, ".claude", "plugins", "marketplaces", "app-factory-autopilot-local");
    const output = execFileSync("node", ["scripts/app-factory-autopilot.mjs", "install", "claude-code"], {
      cwd: ROOT,
      encoding: "utf-8",
      env: {
        ...process.env,
        HOME: home,
        APP_FACTORY_CLAUDE_MARKETPLACE_ROOT: marketplaceRoot,
        APP_FACTORY_SKIP_PROVIDER_ACTIVATION: "1",
      },
    });
    const destination = path.join(marketplaceRoot, "plugins", "app-factory-autopilot");
    assert.ok(fs.existsSync(path.join(destination, ".claude-plugin", "plugin.json")));
    const marketplace = JSON.parse(fs.readFileSync(path.join(marketplaceRoot, ".claude-plugin", "marketplace.json"), "utf-8"));
    assert.equal(marketplace.name, "app-factory-autopilot-local");
    assert.equal(marketplace.plugins[0].source, "./plugins/app-factory-autopilot");
    assert.match(output, /Activation pending: Claude marketplace registration skipped/);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test("npm package excludes generated dependencies and test build output", () => {
  const output = execFileSync("npm", ["pack", "--dry-run", "--json"], {
    cwd: ROOT,
    encoding: "utf-8",
  });
  const [pack] = JSON.parse(output);
  const files = pack.files.map((file) => file.path);
  assert.ok(files.includes("package.json"));
  assert.ok(files.includes("scripts/app-factory-autopilot.mjs"));
  assert.ok(files.includes("scripts/factory-runtime.mjs"));
  assert.ok(files.includes("mcp-server/package-lock.json"));
  assert.ok(files.includes("mcp-server/src/index.ts"));
  assert.ok(!files.some((file) => file.includes("node_modules/")));
  assert.ok(!files.some((file) => file.startsWith("mcp-server/dist/test/")));
  assert.ok(!files.some((file) => file.startsWith("packages/")));
});
