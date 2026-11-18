/*
 * band_calc.test.js：js/band_calc.js（帯の作り方・仕様 2-2）と帯の数字の表示の自動テスト
 * 受け入れ基準 AC-4・AC-5・AC-6・AC-25・AC-26 に対応。作ったデータ（仮の数字）だけを使う。
 */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const BAND_CONFIG = require("../js/band_config.js");
const { computeDailyChanges, buildBand } = require("../js/band_calc.js");
const { renderBandNumbers } = require("../js/band_view.js");
const { randomWalkValues, flatValues, fakeContainer } = require("./helpers.js");

const PRODUCT_DIR = path.join(__dirname, "..");
const METHODS = Object.keys(BAND_CONFIG.methodFiles).map(function (name) {
  return require(path.join(PRODUCT_DIR, BAND_CONFIG.methodFiles[name]));
});
const rollingStd = require("../js/band_methods/rolling_std.js");

test("AC-4：値が毎日同じ（100が300日）なら σ＝0、帯の数字は 100.00円〜100.00円。NaN は出ない", function () {
  const band = buildBand(flatValues(300, 100), rollingStd, 20);
  assert.strictEqual(rollingStd.dailySigma(computeDailyChanges(flatValues(300, 100))), 0);
  const container = fakeContainer();
  renderBandNumbers(container, band, "約1か月");
  assert.match(container.innerHTML, /約1か月後の幅（狭い帯）<\/dt><dd>100\.00円〜100\.00円/);
  assert.match(container.innerHTML, /約1か月後の幅（広い帯）<\/dt><dd>100\.00円〜100\.00円/);
  assert.ok(!container.innerHTML.includes("NaN"));
});

test("AC-5：方法①で変化が +a・−a の交互なら σ は式どおり、狭い帯の上端＝最終日の値×exp(σ×√20)", function () {
  const step = 0.01;
  const values = [100];
  for (let index = 1; index < 301; index++) {
    values.push(values[index - 1] * Math.exp(index % 2 === 1 ? step : -step));
  }
  // 直近250個の変化は +a と −a が125個ずつ → 平均0、標本分散＝250a²÷249
  const expectedSigma = Math.sqrt((250 * step * step) / 249);
  assert.ok(Math.abs(rollingStd.dailySigma(computeDailyChanges(values)) - expectedSigma) < 1e-12);
  const band = buildBand(values, rollingStd, 20);
  const last = values[values.length - 1];
  assert.strictEqual(band.narrow.upper.toFixed(2), (last * Math.exp(expectedSigma * Math.sqrt(20))).toFixed(2));
});

test("AC-6：データが250件以下なら帯を作らず、決まった文を出す", function () {
  const band = buildBand(randomWalkValues(250, 0.005, 1), rollingStd, 20);
  assert.strictEqual(band.enough, false);
  const container = fakeContainer();
  renderBandNumbers(container, band, "約1か月");
  assert.ok(container.innerHTML.includes("データが足りないため幅を作れません（250営業日分以上が必要です）"));
  assert.strictEqual(buildBand(randomWalkValues(251, 0.005, 1), rollingStd, 20).enough, true);
});

test("AC-25：4つの方法が同じ形の部品で、方法を替えると帯が替わる。画面が最初に読むのは方法のファイルではない", function () {
  assert.strictEqual(METHODS.length, 4);
  const values = randomWalkValues(400, 0.006, 7);
  const uppers = new Set();
  for (const method of METHODS) {
    assert.strictEqual(typeof method.computeScale, "function");
    assert.ok(BAND_CONFIG.methodLabels[method.name]);
    uppers.add(buildBand(values, method, 20).narrow.upper.toFixed(6));
  }
  assert.ok(uppers.size > 1, "方法によって帯が違うはず");
  assert.ok(BAND_CONFIG.methodFiles[BAND_CONFIG.methodName], "採用した方法のファイルが決まっている");
  const html = fs.readFileSync(path.join(PRODUCT_DIR, "index.html"), "utf8");
  assert.ok(!html.includes("band_methods/"), "方法のファイルは band_config.js の名前で1つだけ後から読む");
});

test("AC-26：どの方法でも帯の真ん中は最終日の値（上端×下端＝最終日の値²）。中心線・傾きの値は結果に無い", function () {
  const values = randomWalkValues(500, 0.006, 11);
  const last = values[values.length - 1];
  for (const method of METHODS) {
    for (const horizon of [5, 10, 15, 20]) {
      const band = buildBand(values, method, horizon);
      assert.strictEqual(band.lastValue, last);
      for (const point of band.path) {
        assert.ok(Math.abs((point.narrowUpper * point.narrowLower) / (last * last) - 1) < 1e-9);
        assert.ok(Math.abs((point.wideUpper * point.wideLower) / (last * last) - 1) < 1e-9);
      }
      assert.deepStrictEqual(Object.keys(band).sort(), ["enough", "lastValue", "narrow", "path", "wide"]);
      assert.strictEqual(band.path.length, horizon + 1);
    }
  }
});
