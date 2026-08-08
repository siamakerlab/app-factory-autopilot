#!/usr/bin/env node
// 코어 → 어댑터 빌드 파이프라인 (AFA-042)
// core/ 원본(SSOT)을 읽어 dist/claude-code/, dist/codex/ 산출물을 생성한다.
// - 결정론적: 같은 입력 → 같은 출력 (타임스탬프 미포함)
// - 산출물마다 "수동 편집 금지" 경고 헤더 포함
// - 변환 불가 구문 발견 시 실패 (어댑터 편법 금지 — 코어를 고친다)

import * as fs from "node:fs";
import * as path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const CORE = path.join(ROOT, "core");
const DIST = path.join(ROOT, "dist");
const MCP = path.join(ROOT, "mcp-server");
const PROJECT_TEMPLATE = path.join(ROOT, "project-template");

const WARN_MD = `<!-- 자동 생성 파일 — 직접 수정 금지. 원본: core/ (scripts/build-adapters.mjs가 덮어씀) -->\n`;
const WARN_JS = `// 자동 생성 파일 — 직접 수정 금지. 원본: core/ (scripts/build-adapters.mjs가 덮어씀)\n`;

// ── frontmatter 파서 (외부 의존성 없음) ────────────────────────────────

function parseFrontmatter(text, file) {
  const m = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) throw new Error(`frontmatter 없음: ${file}`);
  const meta = {};
  let currentKey = null;
  for (const line of m[1].split("\n")) {
    const kv = line.match(/^(\w[\w-]*):\s*(.*)$/);
    if (kv) {
      currentKey = kv[1];
      const v = kv[2].trim();
      if (v === "") meta[currentKey] = [];
      else if (v.startsWith("[") && v.endsWith("]")) {
        meta[currentKey] = v.slice(1, -1).split(",").map((s) => s.trim()).filter(Boolean);
      } else meta[currentKey] = v;
    } else {
      const item = line.match(/^\s*-\s+(.*)$/);
      if (item && currentKey && Array.isArray(meta[currentKey])) meta[currentKey].push(item[1].trim());
    }
  }
  return { meta, body: m[2].trim() };
}

function readDirMd(dir) {
  return fs.readdirSync(dir).filter((f) => f.endsWith(".md")).sort()
    .map((f) => {
      const p = path.join(dir, f);
      const { meta, body } = parseFrontmatter(fs.readFileSync(p, "utf-8"), p);
      return { file: f, meta, body };
    });
}

function write(p, content) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content, "utf-8");
}

function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name);
    const d = path.join(dst, e.name);
    if (e.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

function copyMcpServer(dst) {
  execFileSync("npm", ["run", "build"], { cwd: MCP, stdio: "pipe" });
  copyDir(path.join(MCP, "dist"), path.join(dst, "dist"));
  fs.copyFileSync(path.join(MCP, "package.json"), path.join(dst, "package.json"));
  fs.copyFileSync(path.join(MCP, "package-lock.json"), path.join(dst, "package-lock.json"));
  write(
    path.join(dst, "README.md"),
    WARN_MD +
      "app-factory-core MCP 서버 번들입니다. 설치 후 이 폴더에서 `npm ci --omit=dev`를 실행해 런타임 의존성을 설치하십시오.\n",
  );
}

function copyRenderSupport(dst) {
  copyDir(PROJECT_TEMPLATE, path.join(dst, "project-template"));
  const scriptsDir = path.join(dst, "scripts");
  fs.mkdirSync(scriptsDir, { recursive: true });
  for (const name of ["render-template.mjs", "render-app-factory-project.mjs", "resolve-gradle-version.mjs"]) {
    fs.copyFileSync(path.join(ROOT, "scripts", name), path.join(scriptsDir, name));
  }
}

function writeInstallScript(target, lines) {
  write(target, lines.join("\n") + "\n");
  fs.chmodSync(target, 0o755);
}

// ── 로드 ────────────────────────────────────────────────────────────────

const agents = readDirMd(path.join(CORE, "agents"));
const skills = readDirMd(path.join(CORE, "skills"));
const entrySkills = skills.filter((s) => s.meta.kind === "entry");
const processSkills = skills.filter((s) => s.meta.kind === "process");
if (entrySkills.length === 0 || agents.length === 0) throw new Error("코어 원본이 비어 있습니다");

// ── Claude Code 어댑터 (AFA-040) ────────────────────────────────────────

const CC = path.join(DIST, "claude-code");
fs.rmSync(CC, { recursive: true, force: true });

// plugin manifest
write(
  path.join(CC, ".claude-plugin", "plugin.json"),
  JSON.stringify(
    {
      name: "app-factory-autopilot",
      description:
        "빈 폴더에서 Android 앱 기획→구현→검증→완료 판정까지 자동화하는 오케스트레이션 플러그인",
      version: "0.1.2",
      author: { name: "Sia Makerlab" },
    },
    null,
    2,
  ) + "\n",
);

// /factory 커맨드 (라우터)
const factoryRouter = skills.find((s) => s.meta.name === "factory");
write(
  path.join(CC, "commands", "factory.md"),
  `---\ndescription: "${factoryRouter.meta.description}"\n---\n\n` +
    WARN_MD + "\n" +
    factoryRouter.body +
    "\n\n인자: $ARGUMENTS\n",
);

// Agent → 서브에이전트
for (const a of agents) {
  const tools = (a.meta.mcp_tools ?? []).map((t) => `mcp__app-factory-core__${t}`);
  write(
    path.join(CC, "agents", `${a.meta.name}.md`),
    `---\nname: ${a.meta.name}\ndescription: "${a.meta.description}"\n` +
      (tools.length ? `tools: ${tools.join(", ")}, Read, Grep, Glob, Bash, Edit, Write\n` : "") +
      `---\n\n` + WARN_MD + `\n${a.body}\n`,
  );
}

// Skill 변환 (진입은 커맨드가 라우팅하므로 스킬 본문으로 배치)
for (const s of skills) {
  if (s.meta.name === "factory") continue;
  write(
    path.join(CC, "skills", s.meta.name, "SKILL.md"),
    `---\nname: ${s.meta.name}\ndescription: "${s.meta.description}"\n---\n\n` + WARN_MD + `\n${s.body}\n`,
  );
}

// MCP 등록 — 플러그인 루트 기준 상대 경로 (${CLAUDE_PLUGIN_ROOT})
write(
  path.join(CC, ".mcp.json"),
  JSON.stringify(
    {
      mcpServers: {
        "app-factory-core": {
          command: "node",
          args: [
            "${CLAUDE_PLUGIN_ROOT}/mcp-server/dist/index.js",
            "--project-root",
            ".",
            "--core-dir",
            "${CLAUDE_PLUGIN_ROOT}/core",
          ],
        },
      },
    },
    null,
    2,
  ) + "\n",
);

// Stop Hook — factory auto 실행 중이면 종료를 차단해 다음 사이클 계속 (3.17)
write(
  path.join(CC, "hooks", "hooks.json"),
  JSON.stringify(
    {
      hooks: {
        Stop: [
          {
            matcher: "",
            hooks: [
              { type: "command", command: "node \"${CLAUDE_PLUGIN_ROOT}/hooks/factory-continue.mjs\"" },
            ],
          },
        ],
      },
    },
    null,
    2,
  ) + "\n",
);
write(
  path.join(CC, "hooks", "factory-continue.mjs"),
  WARN_JS +
    `// Stop Hook: factory auto run이 진행 중이면 정지를 차단하고 계속하게 한다.
import * as fs from "node:fs";
import * as path from "node:path";

function latestRun(dir) {
  try {
    const files = fs.readdirSync(dir).filter((f) => /^R-\\d{8}-\\d+\\.json$/.test(f)).sort();
    if (!files.length) return null;
    return JSON.parse(fs.readFileSync(path.join(dir, files[files.length - 1]), "utf-8"));
  } catch { return null; }
}

const run = latestRun(path.join(process.cwd(), ".app-factory", "runs"));
if (run && run.status === "running" && (run.command === "auto" || run.command === "resume" || run.command === "test")) {
  console.log(JSON.stringify({
    decision: "block",
    reason: "factory auto/resume/test 공정이 완료되지 않았습니다. orchestrator_decide_next로 다음 사이클을 계속 진행하십시오 (One-Prompt Completion — 통합 명세 3.17). 종료 조건: 게이트 전체 통과 / 강제 중단 / 한도 초과.",
  }));
}
process.exit(0);
`,
);

// CLAUDE.md 생성기 산출물(참조 지시만 — 내용 중복 금지)
write(
  path.join(CC, "templates", "CLAUDE.md"),
  WARN_MD +
    `# CLAUDE.md

이 프로젝트는 App Factory Autopilot이 관리합니다.

- **공통 규칙의 단일 원본은 \`APP_FACTORY_RULES.md\`입니다. 먼저 읽으십시오.**
- 상태 변경은 app-factory-core MCP 도구로만 수행합니다 (\`.app-factory/\` 직접 수정 금지).
- 명령: \`/factory config|plan|init|auto|resume|test|review|status|doctor\`
`,
);

// 서버·코어 동봉
copyDir(CORE, path.join(CC, "core"));
copyMcpServer(path.join(CC, "mcp-server"));
copyRenderSupport(CC);
write(
  path.join(CC, "INSTALL.md"),
  `# App Factory Autopilot for Claude Code

This directory is a ready-to-copy Claude Code plugin package.

## Quick Install

\`\`\`bash
./install-local.sh
\`\`\`

The installer copies this package to:

\`\`\`text
~/.claude/plugins/app-factory-autopilot
\`\`\`

It does not edit unrelated user files. After installing, restart Claude Code and run:

\`\`\`text
/factory doctor
/factory status
\`\`\`

## Included

- Claude plugin manifest: \`.claude-plugin/plugin.json\`
- /factory command router
- Factory agents and skills
- Stop Hook for auto/resume/test continuation
- app-factory-core MCP server bundle
- Android project templates and render scripts

## Runtime Setup

\`factory doctor\` checks the actual user environment after installation. If Android SDK,
adb, emulator images, AVDs, mobile-mcp, or related tools are missing, it reports what is
missing and asks whether App Factory should prepare it.
`,
);
writeInstallScript(path.join(CC, "install-local.sh"), [
  "#!/bin/sh",
  "set -eu",
  'SRC="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"',
  'DEST="${APP_FACTORY_CLAUDE_PLUGIN_DIR:-$HOME/.claude/plugins/app-factory-autopilot}"',
  'mkdir -p "$(dirname "$DEST")"',
  'rm -rf "$DEST"',
  'cp -R "$SRC" "$DEST"',
  'echo "Installed App Factory Autopilot for Claude Code: $DEST"',
  'echo "Restart Claude Code, then run: /factory doctor"',
]);

// ── Codex 어댑터 (AFA-041) ──────────────────────────────────────────────

const CX = path.join(DIST, "codex");
fs.rmSync(CX, { recursive: true, force: true });

write(
  path.join(CX, ".codex-plugin", "plugin.json"),
  JSON.stringify(
    {
      name: "app-factory-autopilot",
      version: "0.1.2",
      description: "Android app planning, implementation, verification, and emulator testing autopilot.",
      author: { name: "Sia Makerlab" },
      skills: "./skills/",
      mcpServers: "./.mcp.json",
      interface: {
        displayName: "App Factory Autopilot",
        shortDescription: "Generate and verify production-oriented Android apps.",
        longDescription:
          "Plans Android apps, creates roadmaps, drives implementation, resumes interrupted sessions, reviews quality, and runs emulator scenario testing through a bundled MCP core.",
        developerName: "Sia Makerlab",
        category: "Productivity",
        capabilities: [
          "Android project planning",
          "Automated implementation workflow",
          "Capability and runtime environment checks",
          "Emulator scenario testing",
        ],
        defaultPrompt: "$factory doctor",
      },
    },
    null,
    2,
  ) + "\n",
);

// $factory 프롬프트 (Codex 커스텀 프롬프트 — 인자 라우팅 포함)
write(
  path.join(CX, "prompts", "factory.md"),
  WARN_MD + factoryRouter.body + "\n\n인자: $ARGUMENTS\n",
);
for (const s of entrySkills) {
  if (s.meta.name === "factory") continue;
  write(path.join(CX, "prompts", `${s.meta.name}.md`), WARN_MD + s.body + "\n");
}

// AGENTS.md 생성기 산출물 (참조 지시만)
write(
  path.join(CX, "templates", "AGENTS.md"),
  WARN_MD +
    `# AGENTS.md

이 프로젝트는 App Factory Autopilot이 관리합니다.

- **공통 규칙의 단일 원본은 \`APP_FACTORY_RULES.md\`입니다. 먼저 읽으십시오.**
- 역할 정의: \`.app-factory-codex/agents/\` (worker/verifier 분리 원칙 — 구현
  세션과 검증 세션을 분리 실행한다. 서브에이전트 미지원 환경에서는 역할
  전환 프롬프트로 강등하되 동일 세션에서 구현·검증 겸임 금지).
- 명령: \`$factory config|plan|init|auto|resume|test|review|status|doctor\`
`,
);

// Agent 정의 (Codex는 프롬프트 파일로 배치)
for (const a of agents) {
  write(
    path.join(CX, "agents", `${a.meta.name}.md`),
    WARN_MD + `# ${a.meta.name}\n\n(사용 MCP 도구: ${(a.meta.mcp_tools ?? []).join(", ") || "없음"})\n\n${a.body}\n`,
  );
}
for (const s of processSkills) {
  write(
    path.join(CX, "skills", s.meta.name, "SKILL.md"),
    `---\nname: ${s.meta.name}\ndescription: "${s.meta.description}"\n---\n\n` + WARN_MD + `\n${s.body}\n`,
  );
}

// MCP 설정 (config.toml 스니펫)
write(
  path.join(CX, "config", "mcp.toml"),
  `# 자동 생성 — Codex config.toml에 병합
[mcp_servers.app-factory-core]
command = "node"
args = ["<설치 경로>/mcp-server/dist/index.js", "--project-root", ".", "--core-dir", "<설치 경로>/core"]
`,
);
write(
  path.join(CX, ".mcp.json"),
  JSON.stringify(
    {
      mcpServers: {
        "app-factory-core": {
          command: "node",
          args: [
            "${CODEX_PLUGIN_ROOT}/mcp-server/dist/index.js",
            "--project-root",
            ".",
            "--core-dir",
            "${CODEX_PLUGIN_ROOT}/core",
          ],
        },
      },
    },
    null,
    2,
  ) + "\n",
);

// 실행 래퍼 — 공정 완료까지 사이클 자동 반복 (AFA-026 연동)
write(
  path.join(CX, "bin", "factory-auto-loop.sh"),
  `#!/bin/sh
# 자동 생성 — Codex용 무중단 래퍼: 종료 조건 도달까지 $factory auto 재호출
# 사용: factory-auto-loop.sh <프로젝트 경로>
set -e
cd "\${1:-.}"
while :; do
  codex exec "\\$factory auto" || true
  STATUS=$(node -e '
    const fs=require("fs"),p=".app-factory/runs";
    try{const f=fs.readdirSync(p).filter(x=>/^R-/.test(x)).sort().pop();
    const r=JSON.parse(fs.readFileSync(p+"/"+f));
    console.log(r.status==="finished"?r.exit_reason:"running");}catch(e){console.log("none")}')
  case "$STATUS" in
    completed|forced_stop|limit_exceeded|user_abort|none) echo "종료: $STATUS"; break ;;
    *) echo "계속: $STATUS" ;;
  esac
done
`,
);
fs.chmodSync(path.join(CX, "bin", "factory-auto-loop.sh"), 0o755);

copyDir(CORE, path.join(CX, "core"));
copyMcpServer(path.join(CX, "mcp-server"));
copyRenderSupport(CX);
write(
  path.join(CX, "INSTALL.md"),
  `# App Factory Autopilot for Codex

This directory is a local Codex plugin package.

## Quick Install

\`\`\`bash
./install-local.sh
\`\`\`

The installer copies this package to:

\`\`\`text
~/plugins/app-factory-autopilot
\`\`\`

It also creates or updates the default personal marketplace file:

\`\`\`text
~/.agents/plugins/marketplace.json
\`\`\`

After installing, restart Codex and run:

\`\`\`text
$factory doctor
$factory status
\`\`\`

## Included

- Codex plugin manifest: \`.codex-plugin/plugin.json\`
- $factory prompt entry points
- Factory agents and skills
- app-factory-core MCP server bundle
- MCP companion manifest: \`.mcp.json\`
- Android project templates and render scripts

## Runtime Setup

\`factory doctor\` checks the actual user environment after installation. If Android SDK,
adb, emulator images, AVDs, mobile-mcp, or related tools are missing, it reports what is
missing and asks whether App Factory should prepare it.
`,
);
writeInstallScript(path.join(CX, "install-local.sh"), [
  "#!/bin/sh",
  "set -eu",
  'SRC="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"',
  'PLUGIN_PARENT="${APP_FACTORY_CODEX_PLUGIN_PARENT:-$HOME/plugins}"',
  'MARKETPLACE="${APP_FACTORY_CODEX_MARKETPLACE:-$HOME/.agents/plugins/marketplace.json}"',
  'DEST="$PLUGIN_PARENT/app-factory-autopilot"',
  'mkdir -p "$PLUGIN_PARENT"',
  'rm -rf "$DEST"',
  'cp -R "$SRC" "$DEST"',
  'node "$DEST/scripts/install-codex-marketplace.mjs" "$MARKETPLACE"',
  'echo "Installed App Factory Autopilot for Codex: $DEST"',
  'echo \'Restart Codex, then run: $factory doctor\'',
]);
write(
  path.join(CX, "scripts", "install-codex-marketplace.mjs"),
  `#!/usr/bin/env node
import * as fs from "node:fs";
import * as path from "node:path";

const marketplacePath = process.argv[2];
if (!marketplacePath) {
  console.error("Usage: install-codex-marketplace.mjs <marketplace.json>");
  process.exit(2);
}
const root = path.dirname(marketplacePath);
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
const idx = marketplace.plugins.findIndex((item) => item && item.name === entry.name);
if (idx >= 0) marketplace.plugins[idx] = entry;
else marketplace.plugins.push(entry);
fs.mkdirSync(root, { recursive: true });
fs.writeFileSync(marketplacePath, JSON.stringify(marketplace, null, 2) + "\\n", "utf-8");
console.log("Updated Codex marketplace: " + marketplacePath);
`,
);
fs.chmodSync(path.join(CX, "scripts", "install-codex-marketplace.mjs"), 0o755);

console.log("빌드 완료:");
console.log(`- claude-code: 에이전트 ${agents.length}, 스킬 ${skills.length - 1}, 커맨드 1, 훅 1`);
console.log(`- codex: 프롬프트 ${entrySkills.length}, 에이전트 ${agents.length}, 스킬 ${processSkills.length}`);
