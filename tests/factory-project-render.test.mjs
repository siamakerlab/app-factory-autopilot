import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { buildRenderContext, renderAppFactoryProject } from "../scripts/render-app-factory-project.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");

function configWithVersions() {
  const config = JSON.parse(
    fs.readFileSync(path.join(ROOT, "core/schemas/examples/app-factory-config.example.json"), "utf-8"),
  );
  config.versions = {
    agp: "9.0.1",
    gradle: "9.7.0",
    gradleDistributionSha256: "84fbba45c7f4c64abc77460e1c00f541e9f960e3c7ed2538f1ede19eacd873ae",
    kotlin: "2.2.0",
    ksp: "2.2.0-2.0.2",
    composeBom: "2026.01.00",
    activityCompose: "1.12.0",
    coreKtx: "1.17.0",
    lifecycle: "2.10.0",
    hilt: "2.57",
    hiltNavigationCompose: "1.3.0",
    navigationCompose: "2.9.3",
    datastore: "1.2.0",
    room: "2.8.0",
    junit: "4.13.2",
    coroutinesTest: "1.10.2",
  };
  return config;
}

function writeConfig(config) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "afa-render-config-"));
  const file = path.join(dir, "APP_FACTORY.json");
  fs.writeFileSync(file, JSON.stringify(config, null, 2), "utf-8");
  return file;
}

function renderedFiles(dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...renderedFiles(file));
    else files.push(file);
  }
  return files;
}

test("factory project render derives required context and renders docs plus Android scaffold", () => {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "afa-render-out-"));
  const configPath = writeConfig(configWithVersions());

  const result = renderAppFactoryProject({
    configPath,
    outDir,
    templateDir: path.join(ROOT, "project-template"),
    scope: "all",
    today: "2026-08-08",
  });

  assert.equal(result.files_rendered, 33);
  assert.ok(fs.existsSync(path.join(outDir, "docs", "APP_FACTORY_RULES.md")));
  assert.ok(fs.existsSync(path.join(outDir, "docs", "DOCS_INDEX.md")));
  assert.ok(fs.existsSync(path.join(outDir, "settings.gradle.kts")));
  assert.ok(fs.existsSync(path.join(outDir, "gradle", "wrapper", "gradle-wrapper.properties")));

  const allRendered = renderedFiles(outDir).map((file) => fs.readFileSync(file, "utf-8")).join("\n");
  assert.doesNotMatch(allRendered, /\{\{[#/]?[\w.]+\}\}/);
  assert.match(fs.readFileSync(path.join(outDir, "app/src/main/kotlin/App.kt"), "utf-8"), /class MemoApp : Application/);
});

test("factory project render refuses Android scaffold without official version context", () => {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "afa-render-missing-"));
  const config = configWithVersions();
  delete config.versions.gradleDistributionSha256;
  const configPath = writeConfig(config);

  assert.throws(
    () => renderAppFactoryProject({ configPath, outDir, templateDir: path.join(ROOT, "project-template"), scope: "android" }),
    /versions\.gradleDistributionSha256/,
  );
});

test("factory project render CLI supports docs-only plan output without dependency versions", () => {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "afa-render-docs-"));
  const config = configWithVersions();
  delete config.versions;
  const configPath = writeConfig(config);

  const stdout = execFileSync(
    "node",
    ["scripts/render-app-factory-project.mjs", "--config", configPath, "--out", outDir, "--scope", "docs", "--today", "2026-08-08"],
    { cwd: ROOT, encoding: "utf-8" },
  );

  assert.match(stdout, /"scope": "docs"/);
  assert.ok(fs.existsSync(path.join(outDir, "docs", "PROJECT_SPEC.md")));
  assert.ok(!fs.existsSync(path.join(outDir, "settings.gradle.kts")));
});

test("factory project render context sanitizes Kotlin class and theme names", () => {
  const ctx = buildRenderContext({
    project: { name_english: "SSH terminal", package_name: "com.example.ssh" },
    architecture: { persistence: ["datastore"] },
  });
  assert.equal(ctx.app_class_name, "SSHTerminalApp");
  assert.equal(ctx.theme_name, "SSHTerminal");
  assert.equal(ctx.uses_room, false);
});
