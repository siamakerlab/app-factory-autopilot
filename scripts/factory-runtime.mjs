#!/usr/bin/env node
// Common local runtime CLI for App Factory state inspection and non-LLM helpers.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const MCP_DIST = path.join(ROOT, "mcp-server", "dist");
const COMMANDS = new Set(["doctor", "status", "config", "test", "auto", "help", "--help", "-h"]);

function usage() {
  return `App Factory Runtime CLI

Usage:
  factory doctor
  factory status [--json]
  factory config [--json]
  factory config --set key=true [--set other=false]
  factory test prepare [--json]
  factory auto [codex|claude-code] [project-path]

Provider commands still provide the full agent workflow:
  Claude Code: /factory plan|init|auto|resume|test|review
  Codex:       $factory plan|init|auto|resume|test|review

Use factory auto when you want the provider to continue the production-readiness
mission across separate turns. The default delay between turns is 30 seconds;
override it with APP_FACTORY_AUTO_CONTINUE_DELAY_SECONDS.
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

function latestRunStatus(projectRoot) {
  const runsDir = path.join(projectRoot, ".app-factory", "runs");
  try {
    const file = fs.readdirSync(runsDir).filter((name) => /^R-\d{8}-\d+\.json$/.test(name)).sort().pop();
    if (!file) return "none";
    const run = JSON.parse(fs.readFileSync(path.join(runsDir, file), "utf-8"));
    if (run.status !== "finished") return "running";
    const terminal = new Set(["completed", "forced_stop", "limit_exceeded", "user_abort", "error"]);
    return terminal.has(run.exit_reason) ? run.exit_reason : "running";
  } catch {
    return "none";
  }
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

function parseDelay() {
  const raw = process.env.APP_FACTORY_AUTO_CONTINUE_DELAY_SECONDS || "30";
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : 30;
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function splitArgs(raw) {
  if (!raw) return [];
  const args = [];
  let current = "";
  let quote = "";
  let escaped = false;
  for (const ch of raw) {
    if (escaped) {
      current += ch;
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      escaped = true;
      continue;
    }
    if (quote) {
      if (ch === quote) quote = "";
      else current += ch;
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      continue;
    }
    if (/\s/.test(ch)) {
      if (current) {
        args.push(current);
        current = "";
      }
      continue;
    }
    current += ch;
  }
  if (current) args.push(current);
  return args;
}

function codexExecArgs(prompt) {
  if (process.env.APP_FACTORY_CODEX_BYPASS_SANDBOX === "1") {
    return ["exec", "--dangerously-bypass-approvals-and-sandbox", prompt];
  }
  const extra = splitArgs(process.env.APP_FACTORY_CODEX_EXEC_ARGS || "--sandbox workspace-write");
  return ["exec", ...extra, prompt];
}

function autoCommand(args) {
  const provider = args[0] && !args[0].startsWith("-") ? args[0] : "codex";
  if (provider !== "codex" && provider !== "claude-code") {
    throw new Error("factory auto provider must be codex or claude-code");
  }
  const projectRoot = path.resolve(args[1] || process.cwd());
  const delay = parseDelay();
  const maxTurns = Number.parseInt(process.env.APP_FACTORY_AUTO_MAX_TURNS || "0", 10);
  let prompt = provider === "codex" ? "$factory auto" : "/factory auto";
  let turns = 0;

  process.stdout.write(`factory auto: ${provider}, delay ${delay}s, project ${projectRoot}\n`);
  for (;;) {
    turns += 1;
    const env = { ...process.env, APP_FACTORY_AUTO_RUNNER: "1" };
    const result = provider === "codex"
      ? spawnSync("codex", codexExecArgs(prompt), { cwd: projectRoot, stdio: "inherit", env })
      : spawnSync("claude", ["-p", prompt], { cwd: projectRoot, stdio: "inherit", env });
    if (result.error) throw result.error;

    const status = latestRunStatus(projectRoot);
    if (result.status !== 0 && status === "none") {
      throw new Error(`provider command failed before factory state was written: ${provider} exit ${result.status ?? "unknown"}`);
    }
    if (["completed", "forced_stop", "limit_exceeded", "user_abort", "error", "none"].includes(status)) {
      process.stdout.write(`finished: ${status}\n`);
      return;
    }
    if (maxTurns > 0 && turns >= maxTurns) {
      process.stdout.write(`paused: max turns reached (${turns}); latest status ${status}\n`);
      return;
    }
    process.stdout.write(`next turn in ${delay}s: ${status}\n`);
    sleep(delay * 1000);
    prompt = provider === "codex" ? "$factory resume" : "/factory resume";
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
  if (command === "auto") return autoCommand(args);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
