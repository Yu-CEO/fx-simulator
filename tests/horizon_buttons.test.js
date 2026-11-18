/*
 * horizon_buttons.test.js：先の長さの選び方（1・2・3・4週間）の設定と画面の骨組みの自動テスト
 * 受け入れ基準 AC-1（最初は4週間）・AC-3（ボタンは4つだけ・3か月は無い）・AC-11（ECB の出典表示）に対応。
 */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const BAND_CONFIG = require("../js/band_config.js");
const { buildBand } = require("../js/band_calc.js");
const rollingStd = require("../js/band_methods/rolling_std.js");
const { randomWalkValues } = require("./helpers.js");

const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");

test("AC-3：先の長さは5・10・15・20営業日の4つだけで、名前は1〜4週間。3か月（60営業日）は無い", function () {
  assert.deepStrictEqual(BAND_CONFIG.horizons, [5, 10, 15, 20]);
  assert.deepStrictEqual(BAND_CONFIG.horizonLabels, { 5: "1週間", 10: "2週間", 15: "3週間", 20: "4週間" });
  const buttons = html.match(/data-h="\d+"/g);
  assert.deepStrictEqual(buttons, ['data-h="5"', 'data-h="10"', 'data-h="15"', 'data-h="20"']);
  assert.ok(!html.includes("3か月</button>") && !html.includes('data-h="60"'));
});

test("AC-1：最初に選ばれているのは4週間（20営業日）", function () {
  assert.strictEqual(BAND_CONFIG.defaultHorizon, 20);
  assert.match(html, /data-h="20" aria-pressed="true"/);
  assert.strictEqual((html.match(/data-h="\d+" aria-pressed="true"/g) || []).length, 1);
});

test("AC-3：先の長さを短くすると帯がその営業日数先までに縮む（1週間なら5営業日先）", function () {
  const values = randomWalkValues(400, 0.006, 51);
  const widths = [];
  for (const horizon of BAND_CONFIG.horizons) {
    const band = buildBand(values, rollingStd, horizon);
    assert.strictEqual(band.path.length, horizon + 1);
    widths.push(band.narrow.upper - band.narrow.lower);
  }
  for (let index = 1; index < widths.length; index++) {
    assert.ok(widths[index] > widths[index - 1], "先が長いほど帯は広い");
  }
});

test("AC-11：出典は欧州中央銀行（ECB）の参照レート。「各国中央銀行などの公表値をもとに集約」の文は無い", function () {
  assert.ok(html.includes("為替データ：欧州中央銀行（ECB）の参照レート"));
  assert.ok(html.includes("Frankfurter</a> 経由で取得"));
  assert.ok(html.includes("欧州中央銀行が1日1回公表する参照レートです。米ドル／円は、ユーロ基準の値から Frankfurter が計算し、当サイトで小数第3位に丸めたものです。リアルタイムの値ではありません。土日と欧州中央銀行の休業日の値はありません。"));
  assert.ok(html.includes("当サイトで計算したもの"));
  assert.ok(!html.includes("集約"));
});
