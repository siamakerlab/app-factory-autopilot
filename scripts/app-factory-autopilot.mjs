#!/usr/bin/env node
// npm CLI for installing App Factory Autopilot provider packages.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = path.join(ROOT, "dist");
const VALID_TARGETS = new Set(["codex", "claude-code", "both"]);

function usage() {
  return `App Factory Autopilot

Usage:
  app-factory-autopilot install <codex|claude-code|both>
  app-factory-autopilot build
  app-factory-autopilot package
  app-factory-autopilot path

Examples:
  npx app-factory-autopilot install codex
  npx app-factory-autopilot install claude-code
  npx app-factory-autopilot install both
`;
}

function run(command, args, options = {}) {
  execFileSync(command, args, { cwd: ROOT, stdio: "inherit", ...options });
}

function commandExists(command) {
  const result = spawnSync(command, ["--help"], { stdio: "ignore" });
  return result.status === 0;
}

function runOptional(command, args, label, options = {}) {
  if (process.env.APP_FACTORY_SKIP_PROVIDER_ACTIVATION === "1") {
    return { attempted: false, ok: false, detail: `${label} skipped by APP_FACTORY_SKIP_PROVIDER_ACTIVATION=1` };
  }
  if (!commandExists(command)) {
    return { attempted: false, ok: false, detail: `${command} CLI not found; run provider activation manually after installation.` };
  }
  const result = spawnSync(command, args, { cwd: ROOT, encoding: "utf-8" });
  if (result.status === 0) {
    return { attempted: true, ok: true, detail: `${label} completed.` };
  }
  const detail = (result.stderr || result.stdout || `${label} failed with exit code ${result.status}`).trim();
  if (/already (installed|configured|exists|added)|already in use|up to date/i.test(detail)) {
    return { attempted: true, ok: true, detail: `${label} already completed.` };
  }
  if (options.acceptFailure && options.acceptFailure.test(detail)) {
    return { attempted: true, ok: true, detail: `${label} not needed.` };
  }
  return { attempted: true, ok: false, detail };
}

function installMcpDependencies() {
  const nodeModules = path.join(ROOT, "mcp-server", "node_modules");
  const hasLock = fs.existsSync(path.join(ROOT, "mcp-server", "package-lock.json"));
  run("npm", ["--prefix", "mcp-server", hasLock ? "ci" : "install"]);
  if (!fs.existsSync(nodeModules)) {
    throw new Error("MCP server dependencies were not installed.");
  }
}

function ensureMcpDependencies() {
  const nodeModules = path.join(ROOT, "mcp-server", "node_modules");
  if (fs.existsSync(nodeModules)) return;
  installMcpDependencies();
}

function buildAdapters() {
  ensureMcpDependencies();
  try {
    run("npm", ["--prefix", "mcp-server", "run", "build"]);
  } catch (error) {
    installMcpDependencies();
    run("npm", ["--prefix", "mcp-server", "run", "build"]);
  }
  run("node", ["scripts/build-adapters.mjs"]);
}

function packageArchives() {
  buildAdapters();
  run("node", ["scripts/package-plugin.mjs"]);
}

function copyPluginPackage(source, destination) {
  if (!fs.existsSync(source)) {
    throw new Error(`Adapter output was not generated: ${source}`);
  }
  if (path.resolve(source) === path.resolve(destination)) {
    throw new Error(`Refusing to install over the adapter source directory: ${destination}`);
  }
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.rmSync(destination, { recursive: true, force: true });
  fs.cpSync(source, destination, { recursive: true, force: true });
}

function installBundledMcpRuntime(destination) {
  const mcpDir = path.join(destination, "mcp-server");
  if (!fs.existsSync(path.join(mcpDir, "package.json"))) {
    throw new Error(`Bundled MCP server package is missing: ${mcpDir}`);
  }
  run("npm", ["ci", "--omit=dev"], { cwd: mcpDir });
  if (!fs.existsSync(path.join(mcpDir, "node_modules", "@modelcontextprotocol", "sdk"))) {
    throw new Error("Bundled MCP server runtime dependencies were not installed.");
  }
}

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n", "utf-8");
}

function codexCachebuster() {
  if (process.env.APP_FACTORY_CODEX_CACHEBUSTER) return process.env.APP_FACTORY_CODEX_CACHEBUSTER;
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "Z");
  return `local-${stamp}`;
}

function applyCodexCachebuster(destination) {
  const manifestPath = path.join(destination, ".codex-plugin", "plugin.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
  const baseVersion = String(manifest.version ?? "0.0.0").split("+")[0];
  manifest.version = `${baseVersion}+codex.${codexCachebuster()}`;
  writeJson(manifestPath, manifest);
  return manifest.version;
}

function updateCodexMarketplace(marketplacePath) {
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
  const index = marketplace.plugins.findIndex((item) => item && item.name === entry.name);
  if (index >= 0) marketplace.plugins[index] = entry;
  else marketplace.plugins.push(entry);
  writeJson(marketplacePath, marketplace);
}

function writeClaudeMarketplace(marketplaceRoot) {
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
        version: JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf-8")).version,
        author: { name: "Sia Makerlab" },
        category: "development",
        source: "./plugins/app-factory-autopilot",
      },
    ],
  };
  writeJson(marketplacePath, marketplace);
  return marketplacePath;
}

function activateCodex() {
  const remove = runOptional(
    "codex",
    ["plugin", "remove", "app-factory-autopilot@personal", "--json"],
    "Codex plugin cache refresh",
    { acceptFailure: /not (installed|configured|found)|no installed plugin|unknown plugin/i },
  );
  if (!remove.attempted) return remove;
  const add = runOptional("codex", ["plugin", "add", "app-factory-autopilot@personal", "--json"], "Codex plugin activation");
  if (add.ok) return { attempted: true, ok: true, detail: `${remove.detail} ${add.detail}` };
  return { attempted: true, ok: false, detail: `${remove.detail} ${add.detail}` };
}

function activateClaudeCode(marketplaceRoot) {
  const add = runOptional("claude", ["plugin", "marketplace", "add", marketplaceRoot, "--scope", "user"], "Claude marketplace registration");
  if (!add.attempted) return add;
  const refresh = runOptional(
    "claude",
    ["plugin", "marketplace", "update", "app-factory-autopilot-local"],
    "Claude marketplace refresh",
  );
  const install = runOptional(
    "claude",
    ["plugin", "install", "app-factory-autopilot@app-factory-autopilot-local", "--scope", "user"],
    "Claude plugin activation",
  );
  const update = runOptional(
    "claude",
    ["plugin", "update", "app-factory-autopilot", "--scope", "user"],
    "Claude plugin update",
    { acceptFailure: /not (installed|found)|no installed plugin|unknown plugin/i },
  );
  if (install.ok || update.ok) return { attempted: true, ok: true, detail: `${add.detail} ${refresh.detail} ${install.detail} ${update.detail}` };
  return { attempted: true, ok: false, detail: `${add.detail} ${refresh.detail} ${install.detail} ${update.detail}` };
}

function installClaudeCode() {
  const home = os.homedir();
  const source = path.join(DIST, "claude-code");
  const marketplaceRoot =
    process.env.APP_FACTORY_CLAUDE_MARKETPLACE_ROOT ??
    path.join(home, ".claude", "plugins", "marketplaces", "app-factory-autopilot-local");
  const destination = path.join(marketplaceRoot, "plugins", "app-factory-autopilot");
  copyPluginPackage(source, destination);
  installBundledMcpRuntime(destination);
  const marketplacePath = writeClaudeMarketplace(marketplaceRoot);
  process.stdout.write(`Installed App Factory Autopilot for Claude Code: ${destination}\n`);
  process.stdout.write(`Updated Claude marketplace: ${marketplacePath}\n`);
  const activation = activateClaudeCode(marketplaceRoot);
  process.stdout.write(`${activation.ok ? "Activated" : "Activation pending"}: ${activation.detail}\n`);
  process.stdout.write("Restart Claude Code, then run: /factory doctor\n");
}

function installCodex() {
  const home = os.homedir();
  const pluginParent = process.env.APP_FACTORY_CODEX_PLUGIN_PARENT ?? path.join(home, "plugins");
  const marketplacePath =
    process.env.APP_FACTORY_CODEX_MARKETPLACE ??
    path.join(home, ".agents", "plugins", "marketplace.json");
  const source = path.join(DIST, "codex");
  const destination = path.join(pluginParent, "app-factory-autopilot");
  copyPluginPackage(source, destination);
  installBundledMcpRuntime(destination);
  const manifestVersion = applyCodexCachebuster(destination);
  updateCodexMarketplace(marketplacePath);
  process.stdout.write(`Installed App Factory Autopilot for Codex: ${destination}\n`);
  process.stdout.write(`Updated Codex plugin manifest version: ${manifestVersion}\n`);
  process.stdout.write(`Updated Codex marketplace: ${marketplacePath}\n`);
  const activation = activateCodex();
  process.stdout.write(`${activation.ok ? "Activated" : "Activation pending"}: ${activation.detail}\n`);
  process.stdout.write("Restart Codex, then run: $factory doctor\n");
}

function installTarget(target) {
  if (target === "codex") installCodex();
  else if (target === "claude-code") installClaudeCode();
  else throw new Error(`Unsupported install target: ${target}`);
}

function main() {
  const [command, target] = process.argv.slice(2);
  if (!command || command === "help" || command === "--help" || command === "-h") {
    process.stdout.write(usage());
    return;
  }
  if (command === "path") {
    process.stdout.write(`${ROOT}\n`);
    return;
  }
  if (command === "build") {
    buildAdapters();
    return;
  }
  if (command === "package") {
    packageArchives();
    return;
  }
  if (command === "install") {
    if (!target || !VALID_TARGETS.has(target)) {
      throw new Error("install requires one of: codex, claude-code, both");
    }
    buildAdapters();
    const targets = target === "both" ? ["codex", "claude-code"] : [target];
    for (const item of targets) installTarget(item);
    process.stdout.write("App Factory Autopilot installation completed.\n");
    return;
  }
  throw new Error(`Unknown command: ${command}\n\n${usage()}`);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
