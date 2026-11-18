/*
 * compare_band_methods.test.js：tools/compare_band_methods.js（幅の計算方法を比べて選ぶ・仕様 2-2a）の自動テスト
 * 受け入れ基準 AC-29 に対応。作ったデータ（乱数の種を固定）だけを使う。
 */
const test = require("node:test");
const assert = require("node:assert");
const { compareMethods, chooseMethod } = require("../tools/compare_band_methods.js");
const { buildCompareJs } = require("../tools/band_methods_report.js");
const rollingStd = require("../js/band_methods/rolling_std.js");
const ewma = require("../js/band_methods/ewma.js");
const garch = require("../js/band_methods/garch11.js");
const kalman = require("../js/band_methods/kalman_local_level.js");
const { randomWalkValues } = require("./helpers.js");

/** 表の1行の見せかけ（(a)(b)(c) だけを決めたもの） */
function fakeRow(method, horizon, insideNarrowPct, insideWidePct, meanWidthPct) {
  const measures = { total: 100, insideNarrowPct, insideWidePct, meanWidthPct };
  return { method, horizon, all: measures, firstHalf: measures, secondHalf: measures };
}

test("AC-29：方法ごと・先の長さごとに (a)(b)(c) と前半・後半を出し、どの方法も同じ日の数で比べる", function () {
  const values = randomWalkValues(700, 0.006, 41);
  const rows = compareMethods(values, [rollingStd, ewma, garch, kalman]);
  assert.strictEqual(rows.length, 16);
  assert.ok(!rows.some(function (row) { return row.horizon === 60; }), "60営業日の結果は出さない");
  for (const horizon of [5, 10, 15, 20]) {
    const totals = rows.filter(function (row) { return row.horizon === horizon; }).map(function (row) { return row.all.total; });
    assert.ok(totals.every(function (total) { return total === totals[0] && total > 0; }));
  }
  for (const row of rows) {
    for (const part of [row.all, row.firstHalf, row.secondHalf]) {
      assert.ok(part.insideNarrowPct >= 0 && part.insideNarrowPct <= 100);
      assert.ok(part.insideWidePct >= part.insideNarrowPct);
      assert.ok(part.meanWidthPct > 0 && Number.isFinite(part.meanWidthPct));
    }
  }
});

/** 1つの方法の4つの先の長さ（5・10・15・20）の行を作る。values は [(a), (b), (c)] の4組 */
function fourRows(method, values) {
  return [5, 10, 15, 20].map(function (horizon, index) {
    return fakeRow(method, horizon, values[index][0], values[index][1], values[index][2]);
  });
}

test("AC-29：4つすべてで (a)≧65％・(b)≧93％ の方法のうち、(c)（平均）が最小のものを選ぶ。1つでも下回れば不合格", function () {
  const rows = [
    ...fourRows("rolling_std", [[68, 95, 2.4], [67, 94, 3.4], [67, 94, 4.2], [67, 94, 4.8]]),
    ...fourRows("ewma", [[66, 94, 2.2], [65, 93, 3.0], [66, 94, 3.9], [66, 94, 4.5]]),          // ちょうど線の上も合格
    ...fourRows("garch11", [[70, 96, 1.5], [70, 96, 2.0], [70, 96, 3.0], [64.9, 95, 2.0]]),     // 20 だけ (a) が足りない
    ...fourRows("kalman_local_level", [[70, 96, 1.5], [70, 92.9, 2.0], [70, 96, 3.0], [70, 96, 2.0]]), // 10 だけ (b) が足りない
  ];
  const choice = chooseMethod(rows);
  assert.deepStrictEqual(choice.passed, ["rolling_std", "ewma"]);
  assert.strictEqual(choice.chosen, "ewma");
});

test("AC-29：合格が1つもないデータでは①（rolling_std）を選ぶ", function () {
  const rows = [
    ...fourRows("rolling_std", [[58, 87, 2.4], [58, 87, 3.4], [55, 86, 4.2], [53, 86, 5.7]]),
    ...fourRows("ewma", [[55, 84, 2.0], [55, 84, 3.1], [49, 80, 4.0], [49, 80, 5.4]]),
  ];
  const choice = chooseMethod(rows);
  assert.deepStrictEqual(choice.passed, []);
  assert.strictEqual(choice.chosen, "rolling_std");
});

test("画面用の比較データには、向き・傾きの値が入らない（方法・先の長さ・(a)(b)(c) だけ）", function () {
  const rows = [fakeRow("rolling_std", 20, 58, 87, 3.3)];
  const text = buildCompareJs(rows, { chosen: "rolling_std", passed: [], widthByMethod: {} }, { date: "2026-01-01", dataLastDate: "2026-01-01" });
  const data = JSON.parse(text.slice(text.indexOf("=") + 1, text.lastIndexOf(";")));
  assert.deepStrictEqual(Object.keys(data.rows[0]).sort(), ["horizon", "insideNarrowPct", "insideWidePct", "meanWidthPct", "method"]);
});
