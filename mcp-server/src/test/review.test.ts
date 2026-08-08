// AFA-036 review 점수화 테스트 — 배점표 가중 합산, n_a 분모 제외, 미검사=fail.

import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import { makeCtx } from "./helpers.js";
import { reviewScore, reviewSaveReport } from "../tools/review.js";

test("점수 산정 — pass/fail 가중 합산, n_a 분모 제외", () => {
  const { ctx, cleanup } = makeCtx();
  try {
    const r = reviewScore(ctx, {
      results: {
        // ads 영역: ump(3) pass, no_test_ids(3) pass, banner(1) n_a, remove_ads(2) fail
        ads: { ump_consent: "pass", no_test_ids_release: "pass", banner_policy: "n_a", remove_ads_effective: "fail" },
        // billing 전부 n_a → score null (해당 없음 — 결제 미사용 앱)
        billing: { purchase_flow: "n_a", restore: "n_a", offline_grace: "n_a" },
      },
    });
    const ads = r.areas.find((a) => a.area === "ads")!;
    assert.equal(ads.score, 75); // 6/8
    assert.equal(ads.target, 100); // release_blocking
    assert.equal(ads.gap, 25);
    assert.equal(ads.failed_checks.length, 1);
    const billing = r.areas.find((a) => a.area === "billing")!;
    assert.equal(billing.score, null);
  } finally {
    cleanup();
  }
});

test("미검사 항목은 fail로 취급 (검사 안 함 ≠ 통과)", () => {
  const { ctx, cleanup } = makeCtx();
  try {
    const r = reviewScore(ctx, { results: { i18n: { no_hardcoded_strings: "pass" } } });
    const i18n = r.areas.find((a) => a.area === "i18n")!;
    assert.equal(i18n.score, 75); // locale_safe(1) 미제출 → fail, 3/4
  } finally {
    cleanup();
  }
});

test("제품 품질 영역 — 리서치·UX·인앱업데이트는 점수표에 포함된다", () => {
  const { ctx, cleanup } = makeCtx();
  try {
    const r = reviewScore(ctx, {
      results: {
        market_research: {
          competitor_matrix: "pass",
          community_pain_points: "pass",
          roadmap_inputs: "pass",
          evidence_sources: "pass",
        },
        ux_intuitiveness: {
          first_run_success: "pass",
          primary_task_steps: "pass",
          labels_affordance: "fail",
          recovery_paths: "pass",
        },
        in_app_update: {
          flexible_flow: "pass",
          immediate_flow: "pass",
          resume_handling: "pass",
          play_core_policy: "pass",
        },
      },
    });

    assert.equal(r.areas.find((a) => a.area === "market_research")?.score, 100);
    assert.equal(r.areas.find((a) => a.area === "market_research")?.release_blocking, true);
    assert.equal(r.areas.find((a) => a.area === "ux_intuitiveness")?.score, 78);
    assert.equal(r.areas.find((a) => a.area === "in_app_update")?.release_blocking, true);
  } finally {
    cleanup();
  }
});

test("리포트 저장 — 전/후 비교표", () => {
  const { ctx, cleanup } = makeCtx();
  try {
    const before = reviewScore(ctx, { results: { i18n: { no_hardcoded_strings: "fail", locale_safe: "pass" } } });
    const after = reviewScore(ctx, { results: { i18n: { no_hardcoded_strings: "pass", locale_safe: "pass" } } });
    const { report_path } = reviewSaveReport(ctx, {
      run_id: "R-20260805-001",
      before,
      after,
      plan: "하드코딩 문자열 12건 strings.xml 이관",
    });
    const content = fs.readFileSync(report_path, "utf-8");
    assert.match(content, /다국어/);
    assert.match(content, /개선 계획/);
    assert.match(content, new RegExp(`${before.overall}점 → ${after.overall}점`));
  } finally {
    cleanup();
  }
});
