#!/usr/bin/env node
// npm CLI for installing App Factory Autopilot provider packages.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { execFileSync } from "node:child_process";
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
  fs.mkdirSync(path.dirname(marketplacePath), { recursive: true });
  fs.writeFileSync(marketplacePath, JSON.stringify(marketplace, null, 2) + "\n", "utf-8");
}

function installClaudeCode() {
  const home = os.homedir();
  const source = path.join(DIST, "claude-code");
  const destination =
    process.env.APP_FACTORY_CLAUDE_PLUGIN_DIR ??
    path.join(home, ".claude", "plugins", "app-factory-autopilot");
  copyPluginPackage(source, destination);
  process.stdout.write(`Installed App Factory Autopilot for Claude Code: ${destination}\n`);
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
  updateCodexMarketplace(marketplacePath);
  process.stdout.write(`Installed App Factory Autopilot for Codex: ${destination}\n`);
  process.stdout.write(`Updated Codex marketplace: ${marketplacePath}\n`);
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
