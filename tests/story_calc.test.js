/*
 * story_calc.test.js：今日の図の数字（story_calc.js）の自動テスト。作ったデータだけを使う
 * 受け入れ基準 AC-33（3つの金額と100円単位の丸め）・AC-35（3通りの判定・1か月前の帯は20営業日前までのデータだけ）・AC-40（足りない日は作らない）に対応。
 */
const test = require("node:test");
const assert = require("node:assert");
const {
  judgeAgainstBands, buildStoryModel, pickStoryInputs, requiredValueCount, STORY_REASONS,
} = require("../js/story_calc.js");
const rollingStd = require("../js/band_methods/rolling_std.js");
const { tripAmountYen, roundTripYen } = require("../js/band_calc.js");
const { randomWalkValues } = require("./helpers.js");
const { MIN_COUNT, fixedScaleMethod, valuesEndingAt, buildTestModel } = require("./story_helpers.js");

test("AC-33：最終日150円・広い帯140〜160円・旅行代 いま10万円なら、円安の場合106,700円・今のレートのまま100,000円・円高の場合93,300円", function () {
  assert.strictEqual(tripAmountYen(160, 150), 106700);  // 10万円 × 160 ÷ 150 ＝ 106,666.7円
  assert.strictEqual(tripAmountYen(150, 150), 100000);
  assert.strictEqual(tripAmountYen(140, 150), 93300);   // 93,333.3円
});

test("AC-33：作った帯（上端160円）の3つの金額が、円安の場合＝帯の上端・円高の場合＝帯の下端・今のレートのまま＝最終日の値になる", function () {
  // 最終日 150円。広い帯の上端が 160円になる大きさ（2S＝ln(160÷150)。S(20)＝その半分）
  const scalePerRootDay = Math.log(160 / 150) / 2 / Math.sqrt(20);
  const values = valuesEndingAt(MIN_COUNT, 150, 150);
  const model = buildTestModel(values, fixedScaleMethod(scalePerRootDay));
  assert.strictEqual(model.amounts.weak, 106700);
  assert.strictEqual(model.amounts.now, 100000);
  // 下端は 150×150÷160＝140.625円（帯は最終日の値に対して比で対称）。画面の値 140.63円 で計算して 93,753円 → 93,800円
  assert.strictEqual(model.amounts.strong, 93800);
  assert.strictEqual(model.tripYen, 100000);
  assert.ok(model.amounts.weak > model.amounts.now && model.amounts.now > model.amounts.strong);
});

test("AC-33：金額は100円単位で四捨五入（152,349円→152,300円、152,350円→152,400円）", function () {
  assert.strictEqual(roundTripYen(152349), 152300);
  assert.strictEqual(roundTripYen(152350), 152400);
  assert.strictEqual(roundTripYen(152349.9), 152300);
  // 最終日と同じレートなら、旅行代はちょうど10万円のまま（帯の端の値は画面の小数第2位でそろえる）
  assert.strictEqual(tripAmountYen(152.349, 152.349), 100000);
});

test("AC-35：最終日の値が狭い帯の中／広い帯の中だけ／広い帯の外になる作ったデータで、3通りの判定が出る", function () {
  // 1日の大きさ 0.01 → S(20)＝約0.0447。1か月前の値 100 のとき、狭い帯 約95.6〜104.6、広い帯 約91.4〜109.4
  const method = fixedScaleMethod(0.01);
  assert.strictEqual(buildTestModel(valuesEndingAt(MIN_COUNT, 100, 103), method).judge, "narrow");
  assert.strictEqual(buildTestModel(valuesEndingAt(MIN_COUNT, 100, 107), method).judge, "wide");
  assert.strictEqual(buildTestModel(valuesEndingAt(MIN_COUNT, 100, 115), method).judge, "out");
  assert.strictEqual(buildTestModel(valuesEndingAt(MIN_COUNT, 100, 85), method).judge, "out");
});

test("AC-35：狭い帯の外で広い帯の中の値は「帯の外に出た」にならず、ちょうど端の値は中とする", function () {
  const narrow = { lower: 95, upper: 105 };
  const wide = { lower: 90, upper: 110 };
  assert.strictEqual(judgeAgainstBands(107, narrow, wide), "wide");
  assert.strictEqual(judgeAgainstBands(105, narrow, wide), "narrow");
  assert.strictEqual(judgeAgainstBands(110, narrow, wide), "wide");
  assert.strictEqual(judgeAgainstBands(110.01, narrow, wide), "out");
  // 判定は画面に出る小数第2位の値どうしで比べる（104.996 は画面では 105.00 円）
  assert.strictEqual(judgeAgainstBands(105.004, narrow, wide), "narrow");
});

test("AC-35：1か月前の帯は20営業日前までのデータだけで作られる（それより後の値を書き換えても帯は変わらない）", function () {
  const values = randomWalkValues(MIN_COUNT + 30, 0.006, 7);
  const changed = values.slice();
  for (let index = changed.length - 20; index < changed.length; index++) {
    changed[index] = changed[index] * 1.3;
  }
  const before = buildTestModel(values, rollingStd);
  const after = buildTestModel(changed, rollingStd);
  assert.deepStrictEqual(before.monthAgo.narrow, after.monthAgo.narrow);
  assert.deepStrictEqual(before.monthAgo.wide, after.monthAgo.wide);
  assert.strictEqual(before.monthAgoIndex, values.length - 1 - 20);
});

test("AC-40：値が250件以下・270件（1か月前の帯が作れない）のデータでは作れない。271件なら作れる", function () {
  assert.strictEqual(requiredValueCount(), 271);
  for (const count of [100, 250, 270]) {
    const model = buildTestModel(randomWalkValues(count, 0.006, 3), rollingStd);
    assert.strictEqual(model.ok, false, count + "件");
    assert.strictEqual(model.reason, STORY_REASONS.dataShort);
  }
  assert.strictEqual(buildTestModel(randomWalkValues(271, 0.006, 3), rollingStd).ok, true);
});

test("AC-40：帯の最終日の状態や今日の図の基準が無い・古いデータでは、作れない扱いになる", function () {
  const stateMethod = { stateKey: "kalmanState", computeScale: function () { return 0.01; } };
  const base = { lastDate: "2026-11-17", backtest: { total: 10, outsideNarrowPct: 30 }, monthAgoState: { ratio: 0.003 } };
  const recent = { lastDate: "2026-11-17", bandState: { lastDate: "2026-11-17", state: { ratio: 0.003 } }, storyBase: base };
  assert.strictEqual(pickStoryInputs(stateMethod, recent).ok, true);
  assert.strictEqual(pickStoryInputs(stateMethod, Object.assign({}, recent, { storyBase: undefined })).reason, STORY_REASONS.noBase);
  assert.strictEqual(pickStoryInputs(stateMethod, Object.assign({}, recent, { storyBase: Object.assign({}, base, { lastDate: "2026-11-16" }) })).reason, STORY_REASONS.noBase);
  assert.strictEqual(pickStoryInputs(stateMethod, Object.assign({}, recent, { bandState: undefined })).reason, STORY_REASONS.noState);
  // 状態を使わない方法（①〜③）は、基準だけあればよい
  assert.strictEqual(pickStoryInputs(rollingStd, recent).ok, true);
});

test("今日の図の数字：最終日の帯は最終日の値を真ん中にした帯（中心線なし）で、判定は最終日の値だけで決まる", function () {
  const values = randomWalkValues(MIN_COUNT + 5, 0.006, 11);
  const model = buildStoryModel({ values, dates: values.map(String), lastDate: "2026-01-01", method: rollingStd, backtest: { total: 1, outsideNarrowPct: 0 } });
  assert.strictEqual(model.lastValue, values[values.length - 1]);
  assert.strictEqual(model.current.lastValue, model.lastValue);
  assert.strictEqual(model.current.path.length, 21);
  assert.ok(!("center" in model.current));
});
