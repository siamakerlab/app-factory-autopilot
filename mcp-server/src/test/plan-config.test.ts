// AFA-034/AFA-058 — factory plan 인터뷰 재개·모의 응답, factory config 저장.

import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { makeCtx } from "./helpers.js";
import { factoryConfigGet, factoryConfigUpdate } from "../tools/config.js";
import { factoryStartCycle } from "../tools/factory.js";
import { planApplyMockAnswers, planGetNextQuestions, planSubmitAnswers } from "../tools/plan.js";

test("factory config — 기본은 광고·결제·에뮬레이터 제외, 나머지 품질 검토 활성", () => {
  const { ctx, cleanup } = makeCtx();
  try {
    const current = factoryConfigGet(ctx);
    const automation = current.config.automation as Record<string, unknown>;
    assert.equal(automation.ads, false);
    assert.equal(automation.billing, false);
    assert.equal(automation.emulator, false);
    assert.equal(automation.market_research, true);
    assert.equal(current.emulator_final_prompt_deferred, true);
  } finally {
    cleanup();
  }
});

test("factory config — 체크박스 저장 시 관련 설정과 n_a 영역을 동기화", async () => {
  const { ctx, cleanup } = makeCtx();
  try {
    const saved = await factoryConfigUpdate(ctx, {
      automation: {
        ads: true,
        billing: false,
        in_app_review: false,
        in_app_update: true,
        market_research: false,
        emulator: false,
      },
    });
    assert.deepEqual(saved.changed, ["ads", "billing", "emulator", "in_app_review", "in_app_update", "market_research"]);
    assert.equal((saved.config.ads as Record<string, unknown>).enabled, true);
    assert.equal((saved.config.billing as Record<string, unknown>).enabled, false);
    assert.equal((saved.config.in_app_review as Record<string, unknown>).enabled, false);
    assert.equal((saved.config.market_research as Record<string, unknown>).enabled, false);
    assert.deepEqual(saved.n_a_review_areas.sort(), ["billing", "in_app_review", "market_research"]);
    assert.equal(saved.final_emulator_prompt, true);
  } finally {
    cleanup();
  }
});

test("factory config — plan 답변을 현재 체크박스 설정으로 표시한다", async () => {
  const { ctx, cleanup } = makeCtx();
  try {
    await planSubmitAnswers(ctx, {
      answers: {
        emulator_enabled: true,
        ads_enabled: true,
        billing_enabled: true,
        review_enabled: false,
        update_enabled: true,
      },
    });

    const current = factoryConfigGet(ctx);
    const automation = current.config.automation as Record<string, unknown>;
    assert.equal(automation.emulator, true);
    assert.equal(automation.ads, true);
    assert.equal(automation.billing, true);
    assert.equal(automation.in_app_review, false);
    assert.equal(automation.in_app_update, true);
    assert.equal(current.checkboxes.find((item) => item.key === "emulator")?.value, true);
    assert.equal(current.checkboxes.find((item) => item.key === "ads")?.value, true);
    assert.equal(current.checkboxes.find((item) => item.key === "billing")?.value, true);
    assert.equal(current.checkboxes.find((item) => item.key === "in_app_review")?.value, false);
    assert.equal(current.emulator_final_prompt_deferred, false);
  } finally {
    cleanup();
  }
});

test("factory config — 저장된 config는 plan 답변보다 우선한다", async () => {
  const { ctx, cleanup } = makeCtx();
  try {
    await planSubmitAnswers(ctx, {
      answers: {
        emulator_enabled: true,
        ads_enabled: true,
      },
    });
    await factoryConfigUpdate(ctx, {
      automation: {
        emulator: false,
        ads: false,
      },
    });

    const current = factoryConfigGet(ctx);
    const automation = current.config.automation as Record<string, unknown>;
    assert.equal(automation.emulator, false);
    assert.equal(automation.ads, false);
    assert.equal(current.checkboxes.find((item) => item.key === "emulator")?.value, false);
    assert.equal(current.checkboxes.find((item) => item.key === "ads")?.value, false);
    assert.equal(current.emulator_final_prompt_deferred, true);
  } finally {
    cleanup();
  }
});

test("factory plan — 영역별 작은 질문 묶음, 답변 저장 후 같은 질문을 다시 묻지 않음", async () => {
  const { ctx, cleanup } = makeCtx();
  try {
    const first = planGetNextQuestions(ctx, { max_questions: 2 });
    assert.equal(first.area?.id, "automation");
    assert.equal(first.questions.length, 2);
    assert.deepEqual(first.questions.map((q) => q.id), ["config_hint", "emulator_enabled"]);

    await planSubmitAnswers(ctx, {
      answers: { config_hint: "기본값 유지", emulator_enabled: false },
    });
    const next = planGetNextQuestions(ctx, { max_questions: 3 });
    assert.equal(next.area?.id, "basics");
    assert.ok(!next.questions.some((q) => q.id === "config_hint"));
    assert.ok(!next.questions.some((q) => q.id === "emulator_enabled"));
  } finally {
    cleanup();
  }
});

test("factory plan — 미정 응답은 Placeholder로 저장되고 중단 후 재개 가능", async () => {
  const { ctx, cleanup } = makeCtx();
  try {
    await planSubmitAnswers(ctx, { answers: { package_name: "미정" } });
    const area = ctx.store.loadInterviewArea("basics");
    assert.equal(area.answers.package_name, "${PLACEHOLDER_APPLICATION_ID}");
    const placeholders = ctx.store.listPlaceholders();
    assert.equal(placeholders[0]?.name, "${PLACEHOLDER_APPLICATION_ID}");
    assert.equal(placeholders[0]?.kind, "package_name");

    const next = planGetNextQuestions(ctx);
    assert.ok(!next.questions.some((q) => q.id === "package_name"));
  } finally {
    cleanup();
  }
});

test("factory plan — 모의 응답 파일 주입을 지원", async () => {
  const { ctx, projectRoot, cleanup } = makeCtx();
  try {
    const answersPath = path.join(projectRoot, "answers.json");
    fs.writeFileSync(answersPath, JSON.stringify({
      config_hint: "기본값 유지",
      emulator_enabled: false,
      app_name: "Sample",
      app_one_liner: "Simple sample app",
    }), "utf-8");
    const result = await planApplyMockAnswers(ctx, { answers_path: answersPath });
    assert.deepEqual(result.saved, ["config_hint", "emulator_enabled", "app_name", "app_one_liner"]);
    assert.equal(ctx.store.loadInterviewArea("automation").answers.emulator_enabled, false);
    assert.equal(ctx.store.loadInterviewArea("basics").answers.app_name, "Sample");
  } finally {
    cleanup();
  }
});

test("factory resume — run command로 기록 가능", async () => {
  const { ctx, cleanup } = makeCtx();
  try {
    const run = await factoryStartCycle(ctx, {
      command: "resume",
      provider: "cli",
      phase: "재개 지점 탐색",
    });
    assert.match(run.run_id, /^R-\d{8}-001$/);
    assert.equal(ctx.store.loadRun(run.run_id).command, "resume");
  } finally {
    cleanup();
  }
});
