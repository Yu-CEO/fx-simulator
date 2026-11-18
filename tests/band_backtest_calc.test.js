/*
 * band_backtest_calc.test.js：js/band_backtest_calc.js（帯の答え合わせ・仕様 2-3）と、その表示の自動テスト
 * 受け入れ基準 AC-7 に対応。作ったデータ（帯の外に出る日が分かっているもの）を使う。
 */
const test = require("node:test");
const assert = require("node:assert");
const { listBacktestDays, methodScaleForDay, runBacktest } = require("../js/band_backtest_calc.js");
const { renderBacktest } = require("../js/stats_view.js");
const rollingStd = require("../js/band_methods/rolling_std.js");
const { flatValues, fakeContainer } = require("./helpers.js");

test("答え合わせに使う日は、前に250営業日分・後に h 営業日分のデータがある日すべて", function () {
  const days = listBacktestDays(300, 20);
  assert.strictEqual(days[0], 250);
  assert.strictEqual(days[days.length - 1], 279);
  assert.strictEqual(days.length, 30);
});

test("AC-7：帯の外に出る日が分かっているデータで、外に出た割合が式どおりになり、決まった一文で表示される", function () {
  // 300件。基準の日（250〜279）の値は100。S(h)＝ln(1.1) に固定 → 狭い帯 100/1.1〜110、広い帯 100/1.21〜121
  const values = flatValues(300, 100);
  for (let index = 280; index <= 284; index++) {
    values[index] = 115;  // 狭い帯の外・広い帯の中（5日）
  }
  values[285] = 130;      // 両方の外（2日）
  values[286] = 130;
  const fixedScale = function () { return Math.log(1.1); };
  const result = runBacktest(values, 20, fixedScale);
  assert.strictEqual(result.total, 30);
  assert.strictEqual(result.outsideNarrowCount, 7);
  assert.strictEqual(result.outsideWideCount, 2);
  assert.ok(Math.abs(result.outsideNarrowPct - (7 / 30) * 100) < 1e-9);
  assert.ok(Math.abs(result.outsideWidePct - (2 / 30) * 100) < 1e-9);
  const container = fakeContainer();
  renderBacktest(container, result, "約1か月");
  assert.ok(container.innerHTML.includes("過去 <b>30</b> 回のうち、約1か月後の値が狭い帯の外に出たのは <b>23.3％</b>、広い帯の外に出たのは <b>6.7％</b> でした"));
  assert.ok(container.innerHTML.includes("帯の作り：狭い帯は約3回に1回（約32％）、広い帯は約20回に1回（約5％）外に出る想定で作っています"));
});

test("値が毎日同じなら外に出た割合は 0.0％（NaN にならない）。日が無いときは「答え合わせができません」", function () {
  const result = runBacktest(flatValues(300, 100), 20, methodScaleForDay(rollingStd));
  assert.strictEqual(result.outsideNarrowPct, 0);
  const empty = runBacktest(flatValues(200, 100), 20, methodScaleForDay(rollingStd));
  assert.strictEqual(empty.total, 0);
  const container = fakeContainer();
  renderBacktest(container, empty, "約1か月");
  assert.ok(container.innerHTML.includes("答え合わせができません"));
  assert.ok(!container.innerHTML.includes("NaN"));
});
