#!/usr/bin/env node
// Build install-friendly plugin archives for Claude Code and Codex.

import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = path.join(ROOT, "dist");
const OUT = path.join(ROOT, "packages");
const VERSION = "0.1.0";
const TARGETS = ["claude-code", "codex"];

function sha256(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, "utf-8");
}

function packageTarget(target) {
  const source = path.join(DIST, target);
  if (!fs.existsSync(source)) {
    throw new Error(`Missing adapter output: ${source}. Run scripts/build-adapters.mjs first.`);
  }
  const archive = path.join(OUT, `app-factory-autopilot-${target}-v${VERSION}.tar.gz`);
  fs.rmSync(archive, { force: true });
  execFileSync(
    "tar",
    [
      "--sort=name",
      "--mtime=@0",
      "--owner=0",
      "--group=0",
      "--numeric-owner",
      "-czf",
      archive,
      "-C",
      DIST,
      target,
    ],
    { stdio: "pipe" },
  );
  return { target, archive, checksum: sha256(archive) };
}

function main() {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  execFileSync("node", ["scripts/build-adapters.mjs"], { cwd: ROOT, stdio: "inherit" });
  const packages = TARGETS.map(packageTarget);
  write(
    path.join(OUT, "SHA256SUMS"),
    packages
      .map((pkg) => `${pkg.checksum}  ${path.basename(pkg.archive)}`)
      .join("\n") + "\n",
  );
  write(
    path.join(OUT, "README.md"),
    `# App Factory Autopilot Packages

Generated install-friendly archives.

## Archives

${packages.map((pkg) => `- \`${path.basename(pkg.archive)}\` (${pkg.target})`).join("\n")}

## Install

Extract the archive for your provider and run the bundled installer:

\`\`\`bash
tar -xzf app-factory-autopilot-codex-v${VERSION}.tar.gz
cd codex
./install-local.sh
\`\`\`

or:

\`\`\`bash
tar -xzf app-factory-autopilot-claude-code-v${VERSION}.tar.gz
cd claude-code
./install-local.sh
\`\`\`

Each extracted package also contains an \`INSTALL.md\` with provider-specific details.

## Verify

\`\`\`bash
sha256sum -c SHA256SUMS
\`\`\`
`,
  );
  console.log("Plugin packages created:");
  for (const pkg of packages) {
    console.log(`- ${pkg.archive}`);
  }
  console.log(`- ${path.join(OUT, "SHA256SUMS")}`);
}

main();
