/*
 * trip_calc.test.js：旅行代（いま10万円）を帯の端のレートで円にする計算（js/band_calc.js の tripAmountYen など）の自動テスト
 * 受け入れ基準 AC-33（3つの金額と100円単位の丸め）・AC-47（答えの箱の旅行代）・AC-48（旅行代の差）に対応。作ったデータだけを使う。
 */
const test = require("node:test");
const assert = require("node:assert");
const BAND_CONFIG = require("../js/band_config.js");
const { tripAmountYen, tripAmountRange, tripHalfDifference, roundTripYen, toShownRate } = require("../js/band_calc.js");
const { formatManYen } = require("../js/format.js");

test("AC-33：旅行代は設定で「いま10万円」・100円単位", function () {
  assert.strictEqual(BAND_CONFIG.tripYen, 100000);
  assert.strictEqual(BAND_CONFIG.roundYenUnit, 100);
  assert.strictEqual(formatManYen(BAND_CONFIG.tripYen), "10万円");
});

test("AC-33：最終日150円・広い帯140〜160円なら、円安の場合 約106,700円・今のレートのまま 約100,000円・円高の場合 約93,300円", function () {
  assert.strictEqual(tripAmountYen(160, 150), 106700);
  assert.strictEqual(tripAmountYen(150, 150), 100000);
  assert.strictEqual(tripAmountYen(140, 150), 93300);
});

test("AC-33：端数は100円単位で四捨五入（106,649円→106,600円、106,650円→106,700円）", function () {
  assert.strictEqual(roundTripYen(106649), 106600);
  assert.strictEqual(roundTripYen(106650), 106700);
  assert.strictEqual(roundTripYen(106649.9), 106600);
});

test("AC-47：最終日150円・よくある幅145〜155円なら、旅行代は 96,700〜103,300円、差は約3,300円", function () {
  assert.deepStrictEqual(tripAmountRange({ lower: 145, upper: 155 }, 150), { lower: 96700, upper: 103300 });
  assert.strictEqual(tripHalfDifference({ lower: 145, upper: 155 }, 150), 3300);
});

test("旅行代の計算は、画面に出る小数第2位の値で行う（答えの数字と旅行代がずれない）", function () {
  assert.strictEqual(toShownRate(145.004), 145);
  assert.strictEqual(toShownRate(145.005), 145.01);
  assert.strictEqual(tripAmountYen(152.349, 152.349), 100000);
});
