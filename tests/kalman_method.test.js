/*
 * kalman_method.test.js：方法④カルマンフィルタ（v3.2 の作り）の自動テスト
 * 受け入れ基準 AC-28・AC-28a（尤度・先の分散・データを2回使わない・旧い作りの説明）に対応。作ったデータ（乱数の種を固定）だけを使う。
 */
const test = require("node:test");
const assert = require("node:assert");
const kalman = require("../js/band_methods/kalman_local_level.js");
const BAND_CONFIG = require("../js/band_config.js");
const { computeDailyChanges } = require("../js/band_calc.js");
const { listBacktestDays, methodScaleForDay } = require("../js/band_backtest_calc.js");
const { steadyGain, legacyReport } = require("../tools/kalman_legacy_check.js");
const { buildMarkdown } = require("../tools/band_methods_report.js");
const { randomWalkValues } = require("./helpers.js");

const RATIO = 0.0003;
const changes = computeDailyChanges(randomWalkValues(900, 0.006, 61));

test("AC-28a：フィルタが返す尤度は、各日の分散の見込み x を使った log N(r;0,x) の合計と一致する（r² を観測とする尤度ではない）", function () {
  const result = kalman.runFilter(changes, RATIO);
  let expected = 0;
  for (let index = 0; index < result.variances.length; index++) {
    const r = changes[BAND_CONFIG.windowDays + index];
    const x = result.variances[index];
    expected += -0.5 * Math.log(2 * Math.PI * x) - (r * r) / (2 * x);
  }
  assert.ok(Math.abs(result.logLikelihood - expected) < 1e-9);
  assert.strictEqual(result.count, changes.length - BAND_CONFIG.windowDays, "最初の250日は尤度に入らない");
  assert.ok(Math.abs(kalman.logDensity(0, 1) + 0.9189385332) < 1e-9);
});

test("AC-28a：先の長さを伸ばすと S(h)² は「h×1日の分散」より P の増え方の分だけ大きい。見えない値が動かないとき（q＝0）は差が出ない", function () {
  const horizon = 20;
  const bigRatio = { ratio: 0.01 };
  const daily = kalman.computeScale(changes, 1, { kalmanParams: bigRatio });
  const long = kalman.computeScale(changes, horizon, { kalmanParams: bigRatio });
  assert.ok(long * long > horizon * daily * daily * (1 + 1e-6), "P が増える分だけ大きい");
  const zero = { ratio: 0 };
  const dailyZero = kalman.computeScale(changes, 1, { kalmanParams: zero });
  const longZero = kalman.computeScale(changes, horizon, { kalmanParams: zero });
  assert.ok(Math.abs(longZero * longZero - horizon * dailyZero * dailyZero) < 1e-12, "q＝0 なら差は 0");
});

test("AC-28a：その日 t の S(h)（比の選び方・最初の値を含む）は、t より後のデータを書き換えても変わらない", function () {
  const day = 520;
  const changed = changes.slice();
  for (let index = day; index < changed.length; index++) {
    changed[index] = changed[index] * 3;
  }
  const before = methodScaleForDay(kalman)(changes, day, 20);
  const after = methodScaleForDay(kalman)(changed, day, 20);
  assert.strictEqual(before, after);
  assert.deepStrictEqual(kalman.estimate(changes.slice(0, day)), kalman.estimate(changed.slice(0, day)));
});

test("AC-28a：最初の値は最初の250営業日だけで決まり、その250営業日は尤度の対象にも答え合わせの日にも入らない", function () {
  const changed = changes.slice();
  for (let index = BAND_CONFIG.windowDays; index < changed.length; index++) {
    changed[index] = changed[index] * 2;
  }
  const first = kalman.runFilter(changes.slice(0, BAND_CONFIG.windowDays), RATIO);
  const second = kalman.runFilter(changed.slice(0, BAND_CONFIG.windowDays), RATIO);
  assert.strictEqual(first.level, second.level);
  assert.strictEqual(first.count, 0, "最初の250日は尤度の対象にならない");
  const days = listBacktestDays(changes.length + 1, 20);
  assert.strictEqual(days[0], BAND_CONFIG.windowDays, "答え合わせは最初の250営業日の後から");
});

test("AC-28a：比は250営業日ごとに選び直す（区切りが変化の数から決まる）", function () {
  assert.strictEqual(kalman.estimateStart(250), 250);
  assert.strictEqual(kalman.estimateStart(499), 250);
  assert.strictEqual(kalman.estimateStart(500), 500);
  assert.strictEqual(kalman.estimateStart(749), 500);
});

test("AC-28：推定した1日の動きの大きさが本当の値の ±15％以内（作ったデータ）", function () {
  for (const seed of [3, 5, 8]) {
    const own = computeDailyChanges(randomWalkValues(1500, 0.005, seed));
    const sigma = kalman.dailySigma(own);
    assert.ok(Math.abs(sigma / 0.005 - 1) <= 0.15, "σ＝" + sigma);
  }
});

test("AC-28a：docs/band_methods.md の元が、旧い作りは固定の重みの EWMA と同じだったことと、落ち着いたゲイン（λ に直した値）を出す", function () {
  assert.ok(Math.abs(steadyGain(0.001) - 0.0311) < 1e-3);
  const report = legacyReport(changes);
  assert.strictEqual(report.rows.length, 7);
  assert.ok(report.chosenLambda > 0 && report.chosenLambda < 1);
  assert.ok(Math.abs(report.chosenLambda - (1 - report.chosenGain)) < 1e-12);
  const info = { date: "2026-01-01", dataLastDate: "2026-01-01", valueCount: 0, adopted: "rolling_std", legacy: report };
  const markdown = buildMarkdown([], { passed: [], chosen: "rolling_std", widthByMethod: {} }, info);
  assert.ok(markdown.includes("固定の重みの EWMA"));
  assert.ok(markdown.includes("落ち着いたゲイン"));
});
