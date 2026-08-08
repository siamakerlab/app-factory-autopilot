#!/usr/bin/env node
// project-template 렌더러 (AFA-034/035) — {{mustache}} 단일 문법.
// 지원: {{a.b.c}} 치환, {{#key}}...{{/key}} 섹션(불리언/배열), 배열 내 {{.}}
// 사용: render-template.mjs <템플릿 디렉터리> <출력 디렉터리> <컨텍스트 JSON>
// 파일명 규칙: *.mustache 확장자를 벗겨 저장, gitignore.mustache → .gitignore

import * as fs from "node:fs";
import * as path from "node:path";
import { pathToFileURL } from "node:url";

function get(ctx, key) {
  if (key === ".") return ctx["."];
  return key.split(".").reduce((o, k) => (o == null ? undefined : o[k]), ctx);
}

export function render(template, ctx) {
  // 섹션 먼저 (중첩 지원 위해 재귀)
  const section = /\{\{#([\w.]+)\}\}([\s\S]*?)\{\{\/\1\}\}/;
  let out = template;
  let m;
  while ((m = out.match(section))) {
    const [whole, key, body] = m;
    const v = get(ctx, key);
    let rendered = "";
    if (Array.isArray(v)) {
      rendered = v.map((item) =>
        render(body, typeof item === "object" ? { ...ctx, ...item } : { ...ctx, ".": item }),
      ).join("");
    } else if (v) {
      rendered = render(body, ctx);
    }
    out = out.replace(whole, rendered);
  }
  // 변수 치환 — 미해결 변수는 오류 (변환 손실 검사)
  return out.replace(/\{\{([\w.]+)\}\}/g, (_, key) => {
    const v = get(ctx, key);
    if (v === undefined || v === null) {
      throw new Error(`컨텍스트에 없는 변수: {{${key}}}`);
    }
    return String(v);
  });
}

function walk(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

export function renderDirectory(tplDir, outDir, ctx) {
  let count = 0;
  for (const file of walk(tplDir)) {
    if (!file.endsWith(".mustache")) continue;
    const rel = path.relative(tplDir, file).replace(/\.mustache$/, "");
    // gitignore → .gitignore (템플릿 저장소에서 무시되지 않도록 점 없이 보관)
    const target = path.join(outDir, rel.replace(/(^|\/)gitignore$/, "$1.gitignore"));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, render(fs.readFileSync(file, "utf-8"), ctx), "utf-8");
    count += 1;
  }
  return count;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [tplDir, outDir, ctxPath] = process.argv.slice(2);
  if (!tplDir || !outDir || !ctxPath) {
    console.error("사용법: render-template.mjs <템플릿 디렉터리> <출력 디렉터리> <컨텍스트 JSON>");
    process.exit(2);
  }
  const ctx = JSON.parse(fs.readFileSync(ctxPath, "utf-8"));
  const count = renderDirectory(tplDir, outDir, ctx);
  console.log(`렌더링 완료: ${count}개 파일 → ${outDir}`);
}
