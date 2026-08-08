#!/usr/bin/env node
// App Factory project-template 실행 엔진.
// factory plan은 docs 범위만, factory auto의 project_setup은 android 범위를 렌더한다.

import * as fs from "node:fs";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import { renderDirectory } from "./render-template.mjs";

const REQUIRED_ANDROID_VERSIONS = [
  "agp",
  "gradle",
  "gradleDistributionSha256",
  "kotlin",
  "ksp",
  "composeBom",
  "activityCompose",
  "coreKtx",
  "lifecycle",
  "hilt",
  "hiltNavigationCompose",
  "navigationCompose",
  "datastore",
  "junit",
  "coroutinesTest",
];

function usage() {
  return [
    "사용법: render-app-factory-project.mjs --config <APP_FACTORY.json> --out <출력 디렉터리> [--template <project-template>] [--scope docs|android|all] [--today YYYY-MM-DD]",
    "",
    "android/all 범위는 공식 문서/메타데이터로 확인하고 캐시한 config.versions.* 최신 안정화 값이 필요합니다.",
  ].join("\n");
}

function parseArgs(argv) {
  const out = { scope: "all" };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--config" && argv[i + 1]) out.config = argv[++i];
    else if (arg === "--out" && argv[i + 1]) out.out = argv[++i];
    else if (arg === "--template" && argv[i + 1]) out.template = argv[++i];
    else if (arg === "--scope" && argv[i + 1]) out.scope = argv[++i];
    else if (arg === "--today" && argv[i + 1]) out.today = argv[++i];
    else if (arg === "--help" || arg === "-h") out.help = true;
    else throw new Error(`알 수 없는 인자: ${arg}`);
  }
  if (!["docs", "android", "all"].includes(out.scope)) {
    throw new Error(`지원하지 않는 scope: ${out.scope}`);
  }
  return out;
}

function pascalCase(value, fallback) {
  const raw = String(value || fallback || "App");
  const words = raw
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean);
  const result = words.map((w) => w[0].toUpperCase() + w.slice(1)).join("");
  return result || "App";
}

function yamlScalar(value) {
  if (value === null) return "null";
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  const s = String(value);
  if (/^[A-Za-z0-9_.@:/-]+$/.test(s) && !["true", "false", "null"].includes(s)) return s;
  return JSON.stringify(s);
}

function toYaml(value, indent = 0) {
  const pad = " ".repeat(indent);
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    return value.map((item) => {
      if (item && typeof item === "object") {
        return `${pad}-\n${toYaml(item, indent + 2)}`;
      }
      return `${pad}- ${yamlScalar(item)}`;
    }).join("\n");
  }
  if (value && typeof value === "object") {
    return Object.entries(value).map(([key, item]) => {
      if (item && typeof item === "object") {
        const rendered = toYaml(item, indent + 2);
        return `${pad}${key}: ${rendered === "[]" ? "[]" : `\n${rendered}`}`;
      }
      return `${pad}${key}: ${yamlScalar(item)}`;
    }).join("\n");
  }
  return `${pad}${yamlScalar(value)}`;
}

function lastPackageSegment(config) {
  return config.project?.package_name?.split(".").filter(Boolean).pop();
}

export function buildRenderContext(config, opts = {}) {
  const nameBase = config.project?.name_english || lastPackageSegment(config) || config.project?.name || "App";
  const baseName = pascalCase(nameBase, "App");
  const persistence = config.architecture?.persistence ?? [];
  const usesRoom = Array.isArray(persistence) && persistence.includes("room");

  return {
    ...config,
    today: opts.today ?? new Date().toISOString().slice(0, 10),
    app_class_name: `${baseName.endsWith("App") ? baseName.slice(0, -3) : baseName}App`,
    theme_name: baseName.endsWith("App") ? baseName.slice(0, -3) || "App" : baseName,
    uses_room: usesRoom,
    persistence_summary: Array.isArray(persistence) && persistence.length ? persistence.join(" + ") : "none",
    app_factory_yaml: config.app_factory_yaml ?? toYaml(config),
    roadmap_markdown: config.roadmap_markdown ?? "초기 로드맵은 roadmap_parse 결과를 기준으로 갱신합니다.",
    interview: {
      basics: {
        problem: config.project?.description ?? "미정",
        core_value: config.project?.description ?? "미정",
        monetization: config.billing?.enabled ? "인앱 결제 또는 광고 기반 수익화" : "미정",
        ...config.interview?.basics,
      },
      features: {
        main_flow: config.project?.description ?? "미정",
        ...config.interview?.features,
      },
      ...config.interview,
    },
    core_features: config.core_features ?? [],
    supporting_features: config.supporting_features ?? [],
    optional_features: config.optional_features ?? [],
    competitors: config.competitors ?? [],
    research_rows: config.research_rows ?? [],
  };
}

function validateAndroidContext(ctx) {
  const missing = REQUIRED_ANDROID_VERSIONS.filter((key) => !ctx.versions?.[key]);
  if (ctx.uses_room && !ctx.versions?.room) missing.push("room");
  if (missing.length) {
    throw new Error(
      `android 렌더링에는 공식 문서/메타데이터로 확인한 최신 안정화 버전이 필요합니다: versions.${missing.join(", versions.")}`,
    );
  }
}

export function renderAppFactoryProject({ configPath, outDir, templateDir, scope = "all", today }) {
  const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
  const templateRoot = templateDir ?? path.resolve(import.meta.dirname, "..", "project-template");
  const ctx = buildRenderContext(config, { today });
  let count = 0;

  if (scope === "docs" || scope === "all") {
    count += renderDirectory(path.join(templateRoot, "docs"), path.join(outDir, "docs"), ctx);
  }
  if (scope === "android" || scope === "all") {
    validateAndroidContext(ctx);
    count += renderDirectory(path.join(templateRoot, "android"), outDir, ctx);
  }
  return { files_rendered: count, scope, out_dir: outDir };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) {
      console.log(usage());
      process.exit(0);
    }
    if (!args.config || !args.out) {
      console.error(usage());
      process.exit(2);
    }
    const result = renderAppFactoryProject({
      configPath: path.resolve(args.config),
      outDir: path.resolve(args.out),
      templateDir: args.template ? path.resolve(args.template) : undefined,
      scope: args.scope,
      today: args.today,
    });
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
