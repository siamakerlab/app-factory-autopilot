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
  assert.ok(first.has("claude-code/.mcp.json"));
  assert.ok(first.has("claude-code/mcp-server/dist/index.js"));
  assert.ok(first.has("claude-code/mcp-server/package.json"));
  assert.ok(first.has("claude-code/project-template/docs/APP_FACTORY_RULES.md.mustache"));
  assert.ok(first.has("claude-code/scripts/render-app-factory-project.mjs"));
  assert.ok(first.has("codex/prompts/factory.md"));
  assert.ok(first.has("codex/.codex-plugin/plugin.json"));
  assert.ok(first.has("codex/.mcp.json"));
  assert.ok(first.has("codex/config/mcp.toml"));
  assert.ok(first.has("codex/bin/factory-auto-loop.sh"));
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
  assert.match(first.get("claude-code/hooks/factory-continue.mjs"), /decision: "block"/);
  assert.match(first.get("claude-code/hooks/factory-continue.mjs"), /run\.command === "resume"/);
  assert.match(first.get("claude-code/hooks/factory-continue.mjs"), /run\.command === "test"/);
  assert.match(first.get("claude-code/.mcp.json"), /mcp-server\/dist\/index\.js/);
  assert.doesNotMatch(first.get("claude-code/.mcp.json"), /mcp-server\/index\.js/);
  assert.match(first.get("codex/config/mcp.toml"), /mcp-server\/dist\/index\.js/);
  assert.doesNotMatch(first.get("codex/config/mcp.toml"), /mcp-server\/index\.js/);
  assert.match(first.get("codex/bin/factory-auto-loop.sh"), /\$factory auto/);
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

  const mode = fs.statSync(path.join(ROOT, "dist/codex/bin/factory-auto-loop.sh")).mode & 0o777;
  assert.equal(mode, 0o755);
  const codexInstallMode = fs.statSync(path.join(ROOT, "dist/codex/install-local.sh")).mode & 0o777;
  assert.equal(codexInstallMode, 0o755);
  const claudeInstallMode = fs.statSync(path.join(ROOT, "dist/claude-code/install-local.sh")).mode & 0o777;
  assert.equal(claudeInstallMode, 0o755);
});

test("plugin packaging emits provider archives and checksums", () => {
  execFileSync("node", ["scripts/package-plugin.mjs"], { cwd: ROOT, stdio: "pipe" });
  const packages = path.join(ROOT, "packages");
  const claudeArchive = path.join(packages, "app-factory-autopilot-claude-code-v0.1.2.tar.gz");
  const codexArchive = path.join(packages, "app-factory-autopilot-codex-v0.1.2.tar.gz");
  assert.ok(fs.existsSync(claudeArchive));
  assert.ok(fs.existsSync(codexArchive));
  const sums = fs.readFileSync(path.join(packages, "SHA256SUMS"), "utf-8");
  assert.match(sums, /app-factory-autopilot-claude-code-v0\.1\.2\.tar\.gz/);
  assert.match(sums, /app-factory-autopilot-codex-v0\.1\.2\.tar\.gz/);
  assert.match(fs.readFileSync(path.join(packages, "README.md"), "utf-8"), /install-local\.sh/);
});

test("root npm package exposes install CLI", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf-8"));
  assert.equal(pkg.name, "app-factory-autopilot");
  assert.equal(pkg.private, undefined);
  assert.equal(pkg.bin["app-factory-autopilot"], "scripts/app-factory-autopilot.mjs");
  assert.equal(pkg.bin.afa, "scripts/app-factory-autopilot.mjs");
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
      },
    });
    const destination = path.join(pluginParent, "app-factory-autopilot");
    assert.ok(fs.existsSync(path.join(destination, ".codex-plugin", "plugin.json")));
    assert.ok(fs.existsSync(path.join(destination, "mcp-server", "dist", "index.js")));
    const registry = JSON.parse(fs.readFileSync(marketplace, "utf-8"));
    const entry = registry.plugins.find((item) => item.name === "app-factory-autopilot");
    assert.equal(entry.source.path, "./plugins/app-factory-autopilot");
    assert.match(output, /Restart Codex, then run: \$factory doctor/);
    assert.doesNotMatch(output, /parameter not set/);
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
  assert.ok(files.includes("mcp-server/package-lock.json"));
  assert.ok(files.includes("mcp-server/src/index.ts"));
  assert.ok(!files.some((file) => file.includes("node_modules/")));
  assert.ok(!files.some((file) => file.startsWith("mcp-server/dist/test/")));
  assert.ok(!files.some((file) => file.startsWith("packages/")));
});
