import { test } from "node:test";
import assert from "node:assert/strict";
import * as os from "node:os";
import * as path from "node:path";
import * as fs from "node:fs";
import { spawn } from "node:child_process";

function waitForToolList(child: ReturnType<typeof spawn>): Promise<unknown> {
  return new Promise((resolve, reject) => {
    assert.ok(child.stdout);
    let out = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`Timed out waiting for tools/list. stdout=${out}`));
    }, 5000);
    child.stdout.on("data", (chunk) => {
      out += chunk.toString("utf-8");
      for (const line of out.split("\n")) {
        if (!line.trim()) continue;
        try {
          const msg = JSON.parse(line);
          if (msg.id === 2) {
            clearTimeout(timer);
            resolve(msg.result);
          }
        } catch {
          // Ignore partial lines until more data arrives.
        }
      }
    });
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("exit", (code) => {
      if (code !== null && code !== 0) {
        clearTimeout(timer);
        reject(new Error(`MCP server exited before tools/list: ${code}`));
      }
    });
  });
}

test("MCP tools expose non-empty input schemas for core mutation tools", async () => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "afa-mcp-schema-"));
  const coreDir = path.resolve(process.cwd(), "..", "core");
  const server = spawn(
    process.execPath,
    ["dist/index.js", "--project-root", projectRoot, "--core-dir", coreDir],
    { cwd: process.cwd(), stdio: ["pipe", "pipe", "pipe"] },
  );
  try {
    server.stdin.write(JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "schema-test", version: "1" },
      },
    }) + "\n");
    server.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized", params: {} }) + "\n");
    server.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }) + "\n");

    const result = await waitForToolList(server) as { tools: { name: string; inputSchema?: { properties?: Record<string, unknown> } }[] };
    const byName = new Map(result.tools.map((tool) => [tool.name, tool]));
    for (const name of [
      "factory_claim_task",
      "roadmap_update_status",
      "evidence_register",
      "gate_run_all",
      "dependency_review_version",
      "approval_decide",
      "placeholder_resolve",
      "task_report_failure",
    ]) {
      const properties = byName.get(name)?.inputSchema?.properties ?? {};
      assert.notEqual(Object.keys(properties).length, 0, `${name} inputSchema.properties must not be empty`);
    }
    assert.ok(byName.get("factory_claim_task")?.inputSchema?.properties?.task_id);
    assert.ok(byName.get("roadmap_update_status")?.inputSchema?.properties?.item_id);
    assert.ok(byName.get("evidence_register")?.inputSchema?.properties?.created_by);
    assert.ok(byName.get("gate_run_all")?.inputSchema?.properties?.release);
    assert.ok(byName.get("dependency_review_version")?.inputSchema?.properties?.dependency_id);
    assert.ok(byName.get("approval_decide")?.inputSchema?.properties?.approved);
    assert.ok(byName.get("placeholder_resolve")?.inputSchema?.properties?.resolved_value);
    assert.ok(byName.get("task_report_failure")?.inputSchema?.properties?.error_message);
  } finally {
    server.kill();
    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
});
