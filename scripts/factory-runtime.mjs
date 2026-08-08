#!/usr/bin/env node
// Common local runtime CLI for App Factory state inspection and non-LLM helpers.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const MCP_DIST = path.join(ROOT, "mcp-server", "dist");
const COMMANDS = new Set(["doctor", "status", "config", "test", "help", "--help", "-h"]);

function usage() {
  return `App Factory Runtime CLI

Usage:
  factory doctor
  factory status [--json]
  factory config [--json]
  factory config --set key=true [--set other=false]
  factory test prepare [--json]

Provider commands still provide the full agent workflow:
  Claude Code: /factory plan|init|auto|resume|test|review
  Codex:       $factory plan|init|auto|resume|test|review
`;
}

function run(command, args, options = {}) {
  execFileSync(command, args, { cwd: ROOT, stdio: "inherit", ...options });
}

function ensureMcpBuilt() {
  if (fs.existsSync(path.join(MCP_DIST, "index.js"))) return;
  const nodeModules = path.join(ROOT, "mcp-server", "node_modules");
  if (!fs.existsSync(nodeModules)) {
    const hasLock = fs.existsSync(path.join(ROOT, "mcp-server", "package-lock.json"));
    run("npm", ["--prefix", "mcp-server", hasLock ? "ci" : "install"]);
  }
  run("npm", ["--prefix", "mcp-server", "run", "build"]);
}

async function loadCore(projectRoot) {
  ensureMcpBuilt();
  const [{ createContext }, factory, config, ftest] = await Promise.all([
    import(pathToFileURL(path.join(MCP_DIST, "context.js"))),
    import(pathToFileURL(path.join(MCP_DIST, "tools", "factory.js"))),
    import(pathToFileURL(path.join(MCP_DIST, "tools", "config.js"))),
    import(pathToFileURL(path.join(MCP_DIST, "tools", "factory-test.js"))),
  ]);
  return {
    ctx: createContext(projectRoot, path.join(ROOT, "core")),
    factory,
    config,
    ftest,
  };
}

function hasFlag(args, flag) {
  return args.includes(flag);
}

function parseSets(args) {
  const out = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] !== "--set") continue;
    const raw = args[++i];
    if (!raw || !raw.includes("=")) throw new Error("--set requires key=true or key=false");
    const [key, value] = raw.split("=", 2);
    if (!key) throw new Error("--set key is empty");
    if (value !== "true" && value !== "false") throw new Error("--set value must be true or false");
    out[key] = value === "true";
  }
  return out;
}

function printJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function printConfig(result) {
  process.stdout.write("factory config\n");
  for (const item of result.checkboxes) {
    process.stdout.write(`- [${item.value ? "x" : " "}] ${item.key}: ${item.label}\n`);
  }
  process.stdout.write(`emulator_final_prompt_deferred: ${result.emulator_final_prompt_deferred}\n`);
}

function commandAvailable(command) {
  const result = spawnSync(command, ["--version"], { stdio: "ignore" });
  if (result.status === 0) return true;
  const fallback = spawnSync(command, ["version"], { stdio: "ignore" });
  return fallback.status === 0;
}

function checkPath(id, label, candidates) {
  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) {
      return { id, label, status: "available", path: candidate };
    }
  }
  return { id, label, status: "missing" };
}

function environmentChecks() {
  const home = os.homedir();
  const androidHome = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || path.join(home, "Android", "Sdk");
  return [
    { id: "node", label: "Node.js", status: commandAvailable("node") ? "available" : "missing" },
    { id: "npm", label: "npm", status: commandAvailable("npm") ? "available" : "missing" },
    { id: "java", label: "JDK", status: commandAvailable("java") ? "available" : "missing" },
    { id: "gradle", label: "Gradle", status: commandAvailable("gradle") ? "available" : "missing" },
    checkPath("android-sdk", "Android SDK", [androidHome]),
    checkPath("adb", "adb", [
      path.join(androidHome, "platform-tools", process.platform === "win32" ? "adb.exe" : "adb"),
    ]),
    checkPath("emulator", "Android Emulator", [
      path.join(androidHome, "emulator", process.platform === "win32" ? "emulator.exe" : "emulator"),
    ]),
    { id: "mobile-mcp", label: "mobile-mcp", status: commandAvailable("mobile-mcp") ? "available" : "missing" },
    { id: "codex", label: "Codex CLI", status: commandAvailable("codex") ? "available" : "missing" },
    { id: "claude", label: "Claude Code CLI", status: commandAvailable("claude") ? "available" : "missing" },
  ];
}

async function doctor(args) {
  const checks = environmentChecks();
  if (hasFlag(args, "--json")) {
    printJson({ checks });
    return;
  }
  process.stdout.write("factory doctor\n");
  for (const check of checks) {
    const mark = check.status === "available" ? "ok" : "missing";
    process.stdout.write(`- ${mark}: ${check.label}${check.path ? ` (${check.path})` : ""}\n`);
  }
  const emulatorMissing = checks.some((c) => ["android-sdk", "adb", "emulator"].includes(c.id) && c.status !== "available");
  if (emulatorMissing) {
    process.stdout.write('Emulator-related tools are incomplete. Prepare it now?\n');
  }
}

async function status(args) {
  const { ctx, factory } = await loadCore(process.cwd());
  if (!ctx.store.exists()) {
    const result = { initialized: false, message: ".app-factory state not found. Run provider factory plan or factory init first." };
    if (hasFlag(args, "--json")) printJson(result);
    else process.stdout.write(`${result.message}\n`);
    return;
  }
  const result = factory.factoryGetStatus(ctx);
  if (hasFlag(args, "--json")) printJson(result);
  else {
    process.stdout.write("factory status\n");
    process.stdout.write(`- progress: ${result.progress_pct}%\n`);
    process.stdout.write(`- open findings: ${result.open_findings}\n`);
    process.stdout.write(`- blocker findings: ${result.blocker_findings}\n`);
    process.stdout.write(`- pending approvals: ${result.pending_approvals}\n`);
    if (result.latest_run) {
      process.stdout.write(`- latest run: ${result.latest_run.id} ${result.latest_run.status}${result.latest_run.exit_reason ? `/${result.latest_run.exit_reason}` : ""}\n`);
    }
  }
}

async function configCommand(args) {
  const { ctx, config } = await loadCore(process.cwd());
  ctx.store.initialize();
  const sets = parseSets(args);
  if (Object.keys(sets).length) {
    const saved = await config.factoryConfigUpdate(ctx, { automation: sets });
    if (hasFlag(args, "--json")) printJson(saved);
    else {
      process.stdout.write(`saved: ${saved.changed.join(", ")}\n`);
      printConfig(config.factoryConfigGet(ctx));
    }
    return;
  }
  const current = config.factoryConfigGet(ctx);
  if (hasFlag(args, "--json")) printJson(current);
  else printConfig(current);
}

async function testCommand(args) {
  if (args[0] !== "prepare") {
    process.stdout.write("factory test currently supports: factory test prepare [--json]\n");
    return;
  }
  const { ctx, ftest } = await loadCore(process.cwd());
  ctx.store.initialize();
  const result = await ftest.factoryTestPrepare(ctx, {});
  if (hasFlag(args, "--json")) printJson(result);
  else {
    process.stdout.write("factory test prepare\n");
    process.stdout.write(`- scenarios: ${result.scenario_count}\n`);
    process.stdout.write(`- devices: ${result.device_profiles.join(", ")}\n`);
    process.stdout.write(`- checklist: ${result.checklist_path}\n`);
    process.stdout.write("- emulator use is now enabled for this project.\n");
  }
}

async function main() {
  const [command = "help", ...args] = process.argv.slice(2);
  if (!COMMANDS.has(command)) throw new Error(`Unknown command: ${command}\n\n${usage()}`);
  if (command === "help" || command === "--help" || command === "-h") {
    process.stdout.write(usage());
    return;
  }
  if (command === "doctor") return doctor(args);
  if (command === "status") return status(args);
  if (command === "config") return configCommand(args);
  if (command === "test") return testCommand(args);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
