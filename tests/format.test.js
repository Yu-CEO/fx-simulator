/*
 * format.test.js：js/format.js（円・％・件数・日付の表示形式）の自動テスト
 * 実行方法：fx-simulator フォルダで `node --test tests/`
 */
const test = require("node:test");
const assert = require("node:assert");
const { formatYen, formatPct, formatSignedPct, formatCount, formatDateNumber } = require("../js/format.js");

test("円は小数第2位で四捨五入して「円」をつける", function () {
  assert.strictEqual(formatYen(155.1249), "155.12円");
  assert.strictEqual(formatYen(100), "100.00円");
});

test("％は小数第1位", function () {
  assert.strictEqual(formatPct(31.54), "31.5％");
  assert.strictEqual(formatPct(0), "0.0％");
});

test("符号つきの％：＋・−をつけ、0.0 には符号をつけない（色や矢印はつけない）", function () {
  assert.strictEqual(formatSignedPct(1.23), "+1.2％");
  assert.strictEqual(formatSignedPct(-1.23), "−1.2％");
  assert.strictEqual(formatSignedPct(-0.04), "0.0％");
});

test("件数のカンマと日付の形", function () {
  assert.strictEqual(formatCount(2338), "2,338");
  assert.strictEqual(formatDateNumber(20261117), "2026-11-17");
});
