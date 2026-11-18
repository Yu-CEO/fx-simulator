/*
 * band_methods.test.js：帯の計算方法①〜④（js/band_methods/）の自動テスト
 * 受け入れ基準 AC-27・AC-28 に対応。作ったデータ（乱数の種を固定）だけを使う。
 */
const test = require("node:test");
const assert = require("node:assert");
const path = require("node:path");
const BAND_CONFIG = require("../js/band_config.js");
const { computeDailyChanges } = require("../js/band_calc.js");
const { randomWalkValues, flatValues } = require("./helpers.js");

const PRODUCT_DIR = path.join(__dirname, "..");
const METHODS = Object.keys(BAND_CONFIG.methodFiles).map(function (name) {
  return require(path.join(PRODUCT_DIR, BAND_CONFIG.methodFiles[name]));
});
const ewma = require("../js/band_methods/ewma.js");
const garch = require("../js/band_methods/garch11.js");
const kalman = require("../js/band_methods/kalman_local_level.js");

test("AC-27：どの方法でも、値が毎日同じなら S(h)＝0 で NaN にならない", function () {
  const changes = computeDailyChanges(flatValues(400, 100));
  for (const method of METHODS) {
    assert.strictEqual(method.computeScale(changes, 20), 0, method.name);
    assert.strictEqual(method.computeScale(changes, 5), 0, method.name);
  }
});

test("AC-27：ある日 t の S(h) は、t より後のデータを書き換えても変わらない（未来のデータを使わない）", function () {
  const values = randomWalkValues(600, 0.006, 21);
  const changed = values.slice();
  for (let index = 401; index < changed.length; index++) {
    changed[index] = changed[index] * 1.5;
  }
  const day = 400;
  for (const method of METHODS) {
    const before = method.computeScale(computeDailyChanges(values).slice(0, day), 20);
    const after = method.computeScale(computeDailyChanges(changed).slice(0, day), 20);
    assert.strictEqual(before, after, method.name);
  }
});

test("AC-28：方法②（λ＝0.94）は式どおりの σ になる", function () {
  // 直近250個の変化が、最後の1つ（b）を除いて 0 のデータ
  const changes = new Array(260).fill(0);
  const last = 0.02;
  changes[changes.length - 1] = last;
  const lambda = 0.94;
  // 最初の分散＝250個の2乗の平均＝b²÷250 → 0 が249個続いて λ^249 倍 → 最後に λ倍＋(1−λ)b²
  const start = (last * last) / 250;
  const expected = Math.sqrt(start * Math.pow(lambda, 250) + (1 - lambda) * last * last);
  assert.strictEqual(BAND_CONFIG.ewmaLambda, lambda);
  assert.ok(Math.abs(ewma.dailySigma(changes) - expected) < 1e-15);
  assert.ok(Math.abs(ewma.computeScale(changes, 20) - expected * Math.sqrt(20)) < 1e-15);
});

test("AC-28：方法③④は、変動の大きさが決まったデータで、推定した1日の動きの大きさが本当の値の ±15％以内", function () {
  const trueSigma = 0.005;
  for (const seed of [3, 5, 8]) {
    const changes = computeDailyChanges(randomWalkValues(1500, trueSigma, seed));
    const params = garch.estimate(changes);
    const garchSigma = garch.dailySigma(changes, { garchParams: params });
    const kalmanSigma = kalman.dailySigma(changes);
    assert.ok(Math.abs(garchSigma / trueSigma - 1) <= 0.15, "GARCH：" + garchSigma);
    assert.ok(Math.abs(kalmanSigma / trueSigma - 1) <= 0.15, "カルマン：" + kalmanSigma);
  }
});

test("方法③：推定した α・β は範囲の中で、α＋β＜1", function () {
  const params = garch.estimate(computeDailyChanges(randomWalkValues(800, 0.006, 4)));
  assert.ok(params.alpha > 0 && params.beta > 0 && params.alpha + params.beta < 1);
  assert.ok(params.omega > 0);
});
