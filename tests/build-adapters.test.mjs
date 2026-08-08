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
  assert.ok(first.has("codex/config/mcp.toml"));
  assert.ok(first.has("codex/bin/factory-auto-loop.sh"));
  assert.ok(first.has("codex/mcp-server/dist/index.js"));
  assert.ok(first.has("codex/mcp-server/package.json"));
  assert.ok(first.has("codex/project-template/android/settings.gradle.kts.mustache"));
  assert.ok(first.has("codex/scripts/render-app-factory-project.mjs"));

  const manifest = JSON.parse(first.get("claude-code/.claude-plugin/plugin.json"));
  assert.equal(manifest.name, "app-factory-autopilot");
  assert.match(first.get("claude-code/hooks/factory-continue.mjs"), /decision: "block"/);
  assert.match(first.get("claude-code/hooks/factory-continue.mjs"), /run\.command === "resume"/);
  assert.match(first.get("claude-code/.mcp.json"), /mcp-server\/dist\/index\.js/);
  assert.doesNotMatch(first.get("claude-code/.mcp.json"), /mcp-server\/index\.js/);
  assert.match(first.get("codex/config/mcp.toml"), /mcp-server\/dist\/index\.js/);
  assert.doesNotMatch(first.get("codex/config/mcp.toml"), /mcp-server\/index\.js/);
  assert.match(first.get("codex/bin/factory-auto-loop.sh"), /\$factory auto/);
  assert.match(first.get("claude-code/templates/CLAUDE.md"), /auto\|resume\|review/);
  assert.match(first.get("codex/templates/AGENTS.md"), /auto\|resume\|review/);

  const mode = fs.statSync(path.join(ROOT, "dist/codex/bin/factory-auto-loop.sh")).mode & 0o777;
  assert.equal(mode, 0o755);
});
