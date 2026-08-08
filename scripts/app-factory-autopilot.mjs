#!/usr/bin/env node
// npm CLI for installing App Factory Autopilot provider packages.

import * as fs from "node:fs";
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

function ensureMcpDependencies() {
  const nodeModules = path.join(ROOT, "mcp-server", "node_modules");
  if (fs.existsSync(nodeModules)) return;
  const hasLock = fs.existsSync(path.join(ROOT, "mcp-server", "package-lock.json"));
  run("npm", ["--prefix", "mcp-server", hasLock ? "ci" : "install"]);
}

function buildAdapters() {
  ensureMcpDependencies();
  run("npm", ["--prefix", "mcp-server", "run", "build"]);
  run("node", ["scripts/build-adapters.mjs"]);
}

function packageArchives() {
  buildAdapters();
  run("node", ["scripts/package-plugin.mjs"]);
}

function installTarget(target) {
  const installer = path.join(DIST, target, "install-local.sh");
  if (!fs.existsSync(installer)) {
    buildAdapters();
  }
  if (!fs.existsSync(installer)) {
    throw new Error(`Installer was not generated: ${installer}`);
  }
  const result = spawnSync("sh", [installer], { cwd: path.dirname(installer), stdio: "inherit" });
  if (result.status !== 0) {
    throw new Error(`${target} installer failed with exit code ${result.status}`);
  }
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
