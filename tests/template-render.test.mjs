import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { render, renderDirectory } from "../scripts/render-template.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");

function sampleContext(overrides = {}) {
  const config = JSON.parse(
    fs.readFileSync(
      path.join(ROOT, "core/schemas/examples/app-factory-config.example.json"),
      "utf-8",
    ),
  );

  return {
    ...config,
    today: "2026-08-08",
    app_class_name: "MemoApp",
    theme_name: "Memo",
    uses_room: config.architecture.persistence.includes("room"),
    versions: {
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
    },
    ...overrides,
  };
}

function readRendered(outDir, rel) {
  return fs.readFileSync(path.join(outDir, rel), "utf-8");
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

test("project templates do not pin dependency or Gradle versions", () => {
  const templateRoot = path.join(ROOT, "project-template");
  const offenders = [];
  for (const file of renderedFiles(templateRoot).filter((name) => name.endsWith(".mustache"))) {
    const rel = path.relative(templateRoot, file);
    const text = fs.readFileSync(file, "utf-8");
    for (const [idx, line] of text.split("\n").entries()) {
      if (line.includes("{{versions.")) continue;
      if (line.trim().startsWith("#") || line.trim().startsWith("//") || line.trim().startsWith("<!--")) continue;
      if (/^<\?xml version="1\.0"/.test(line)) continue;
      if (/\b\d+\.\d+(?:\.\d+)?(?:[-+][A-Za-z0-9_.-]+)?\b/.test(line)) {
        offenders.push(`${rel}:${idx + 1}: ${line.trim()}`);
      }
    }
  }
  assert.deepEqual(offenders, []);
});

test("render rejects unresolved variables", () => {
  assert.throws(
    () => render("name={{project.name}} missing={{project.missing}}", sampleContext()),
    /컨텍스트에 없는 변수: \{\{project\.missing\}\}/,
  );
});

test("android template renders a buildable scaffold shape", () => {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "afa-template-"));
  const count = renderDirectory(path.join(ROOT, "project-template/android"), outDir, sampleContext());

  assert.equal(count, 16);
  assert.ok(fs.existsSync(path.join(outDir, ".gitignore")));
  assert.ok(fs.existsSync(path.join(outDir, "app/src/main/kotlin/App.kt")));
  assert.ok(fs.existsSync(path.join(outDir, "app/src/main/kotlin/ui/AppRoot.kt")));

  const allRendered = renderedFiles(outDir)
    .map((file) => fs.readFileSync(file, "utf-8"))
    .join("\n");
  assert.doesNotMatch(allRendered, /\{\{[#/]?[\w.]+\}\}/);

  const rootBuild = readRendered(outDir, "build.gradle.kts");
  const appBuild = readRendered(outDir, "app/build.gradle.kts");
  const catalog = readRendered(outDir, "gradle/libs.versions.toml");
  const manifest = readRendered(outDir, "app/src/main/AndroidManifest.xml");
  const wrapper = readRendered(outDir, "gradle/wrapper/gradle-wrapper.properties");

  assert.doesNotMatch(rootBuild, /alias\(libs\.plugins\.kotlin\.android\)/);
  assert.doesNotMatch(appBuild, /alias\(libs\.plugins\.kotlin\.android\)/);
  assert.doesNotMatch(catalog, /org\.jetbrains\.kotlin\.android/);
  assert.match(appBuild, /alias\(libs\.plugins\.kotlin\.compose\)/);
  assert.match(appBuild, /implementation\(libs\.room\.runtime\)/);
  assert.match(appBuild, /릴리스 키스토어가 없습니다/);
  assert.match(manifest, /android:name="\.MemoApp"/);
  assert.match(manifest, /android:icon="@drawable\/ic_launcher"/);
  assert.match(wrapper, /gradle-9\.7\.0-bin\.zip/);
  assert.match(wrapper, /distributionSha256Sum=84fbba45c7f4c64abc77460e1c00f541e9f960e3c7ed2538f1ede19eacd873ae/);
});

test("room dependencies are omitted when Room is not selected", () => {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "afa-template-no-room-"));
  const context = sampleContext({ uses_room: false });
  renderDirectory(path.join(ROOT, "project-template/android"), outDir, context);

  const appBuild = readRendered(outDir, "app/build.gradle.kts");
  const catalog = readRendered(outDir, "gradle/libs.versions.toml");

  assert.doesNotMatch(appBuild, /libs\.room\./);
  assert.doesNotMatch(catalog, /^room = /m);
  assert.doesNotMatch(catalog, /^room-runtime = /m);
});
