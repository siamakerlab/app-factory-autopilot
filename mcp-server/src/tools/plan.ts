// factory plan 인터뷰 코어 도구 (AFA-034)
// 어댑터는 질문 표시만 담당하고, 코어는 질문 정의·답변 저장·재개·모의 응답을 보장한다.

import * as fs from "node:fs";
import * as path from "node:path";
import { parse as parseYaml } from "yaml";
import type { Ctx } from "../context.js";
import { ToolError } from "../errors.js";
import { placeholderCreate } from "./approval-placeholder.js";

interface InterviewDoc {
  version: number;
  defaults?: Record<string, unknown>;
  areas: InterviewArea[];
}

interface InterviewArea {
  id: string;
  title: string;
  questions: InterviewQuestion[];
}

interface InterviewQuestion {
  id: string;
  ask: string;
  type: string;
  config?: string | null;
  optional?: boolean;
  default?: unknown;
  recommend?: unknown;
  recommend_from?: string;
  when?: string;
  options?: unknown[];
  placeholder?: { kind: string; name: string };
}

function loadInterview(ctx: Ctx): InterviewDoc {
  const p = path.join(ctx.coreDir, "prompts", "interview", "interview.yaml");
  return parseYaml(fs.readFileSync(p, "utf-8")) as InterviewDoc;
}

function allAnswers(ctx: Ctx, doc: InterviewDoc): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const area of doc.areas) {
    Object.assign(out, ctx.store.loadInterviewAreaIfExists(area.id).answers);
  }
  return out;
}

function questionById(doc: InterviewDoc, id: string): { area: InterviewArea; question: InterviewQuestion } | undefined {
  for (const area of doc.areas) {
    const question = area.questions.find((q) => q.id === id);
    if (question) return { area, question };
  }
  return undefined;
}

function isUnknownAnswer(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value !== "string") return false;
  return ["", "unknown", "unsure", "tbd", "모름", "미정", "나중에"].includes(value.trim().toLowerCase());
}

function isActive(question: InterviewQuestion, answers: Record<string, unknown>): boolean {
  if (!question.when) return true;
  return answers[question.when] === true;
}

function publicQuestion(q: InterviewQuestion) {
  return {
    id: q.id,
    ask: q.ask,
    type: q.type,
    optional: q.optional === true,
    default: q.default,
    recommend: q.recommend,
    recommend_from: q.recommend_from,
    options: q.options,
    placeholder: q.placeholder,
  };
}

export function planGetNextQuestions(
  ctx: Ctx,
  input: { max_questions?: number } = {},
): { complete: boolean; area?: { id: string; title: string }; questions: ReturnType<typeof publicQuestion>[]; answered_count: number; total_active_count: number } {
  const doc = loadInterview(ctx);
  const answers = allAnswers(ctx, doc);
  let totalActive = 0;
  for (const area of doc.areas) {
    const pending = area.questions.filter((q) => {
      if (!isActive(q, answers)) return false;
      totalActive += 1;
      return !(q.id in answers);
    });
    if (pending.length > 0) {
      return {
        complete: false,
        area: { id: area.id, title: area.title },
        questions: pending.slice(0, input.max_questions ?? 5).map(publicQuestion),
        answered_count: Object.keys(answers).length,
        total_active_count: totalActive,
      };
    }
  }
  return {
    complete: true,
    questions: [],
    answered_count: Object.keys(answers).length,
    total_active_count: totalActive,
  };
}

export async function planSubmitAnswers(
  ctx: Ctx,
  input: { answers: Record<string, unknown>; source?: "interactive" | "mock" },
): Promise<{ saved: string[]; placeholders: string[]; next: ReturnType<typeof planGetNextQuestions> }> {
  const doc = loadInterview(ctx);
  const saved: string[] = [];
  const placeholders: string[] = [];

  for (const [id, raw] of Object.entries(input.answers)) {
    const found = questionById(doc, id);
    if (!found) throw new ToolError("INVALID_INPUT", `알 수 없는 인터뷰 질문 ID: ${id}`);

    let value = raw;
    if (isUnknownAnswer(raw) && found.question.placeholder) {
      value = found.question.placeholder.name;
      const { name } = await placeholderCreate(ctx, {
        name: found.question.placeholder.name,
        kind: found.question.placeholder.kind,
        description: `factory plan '${found.question.id}' 미정 응답`,
        locations: ["APP_FACTORY.yaml"],
      });
      placeholders.push(name);
    }

    await ctx.store.withLock("plan_submit_answers", () => {
      const areaDoc = ctx.store.loadInterviewAreaIfExists(found.area.id);
      areaDoc.answers[id] = value;
      ctx.store.saveInterviewArea(areaDoc);
    });
    saved.push(id);
  }

  return { saved, placeholders, next: planGetNextQuestions(ctx) };
}

export async function planApplyMockAnswers(
  ctx: Ctx,
  input: { answers?: Record<string, unknown>; answers_path?: string } = {},
): Promise<ReturnType<typeof planSubmitAnswers>> {
  let answers = input.answers;
  if (!answers) {
    const source = input.answers_path ?? process.env.AFA_INTERVIEW_ANSWERS;
    if (!source) throw new ToolError("INVALID_INPUT", "answers 또는 answers_path/AFA_INTERVIEW_ANSWERS가 필요합니다");
    const raw = fs.readFileSync(path.resolve(source), "utf-8");
    answers = JSON.parse(raw) as Record<string, unknown>;
  }
  return planSubmitAnswers(ctx, { answers, source: "mock" });
}
