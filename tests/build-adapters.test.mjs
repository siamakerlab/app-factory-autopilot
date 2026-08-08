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
  assert.ok(first.has("codex/prompts/factory.md"));
  assert.ok(first.has("codex/config/mcp.toml"));
  assert.ok(first.has("codex/bin/factory-auto-loop.sh"));

  const manifest = JSON.parse(first.get("claude-code/.claude-plugin/plugin.json"));
  assert.equal(manifest.name, "app-factory-autopilot");
  assert.match(first.get("claude-code/hooks/factory-continue.mjs"), /decision: "block"/);
  assert.match(first.get("codex/bin/factory-auto-loop.sh"), /\$factory auto/);

  const mode = fs.statSync(path.join(ROOT, "dist/codex/bin/factory-auto-loop.sh")).mode & 0o777;
  assert.equal(mode, 0o755);
});
