/*
 * screen_data.test.js：画面用データ（data/usdjpy_recent.js・usdjpy_older.js・band_compare.js）の形の自動テスト
 * 受け入れ基準 AC-10a（重なりなし）・AC-24（前半：小数第3位まで）・AC-30（画面の比較の表の元）に対応。
 * データの値そのものは確かめず、形だけを確かめる（値は毎日変わるため）。
 */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const BAND_CONFIG = require("../js/band_config.js");
const { combineData, LATER_FILES } = require("../js/data_loader.js");

const DATA_DIR = path.join(__dirname, "..", "data");

/** data フォルダの JavaScript を読み、中の変数を返す */
function loadDataFiles() {
  const sandbox = {};
  vm.createContext(sandbox);
  for (const name of ["usdjpy_older.js", "usdjpy_recent.js", "band_compare.js"]) {
    vm.runInContext(fs.readFileSync(path.join(DATA_DIR, name), "utf8"), sandbox);
  }
  return sandbox;
}

test("AC-24：画面用データの値は小数第3位まで（それより長い数字がない）", function () {
  for (const name of ["usdjpy_recent.js", "usdjpy_older.js"]) {
    const text = fs.readFileSync(path.join(DATA_DIR, name), "utf8");
    const values = text.slice(text.indexOf('"values":[') + 10, text.lastIndexOf("]"));
    for (const value of values.split(",").filter(Boolean)) {
      assert.match(value, /^\d+(\.\d{1,3})?$/, name + "：" + value);
    }
  }
});

test("AC-10a：recent と older に同じ日付が重ならず、つなぐと古い順。最近の分は約1年＋20営業日（270件）", function () {
  const data = loadDataFiles();
  const all = combineData(data.FX_DATA_RECENT, data.FX_DATA_OLDER);
  assert.strictEqual(all.dates.length, all.values.length);
  for (let index = 1; index < all.dates.length; index++) {
    assert.ok(all.dates[index] > all.dates[index - 1], "古い順・重なりなし");
  }
  assert.ok(data.FX_DATA_RECENT.values.length <= 270);
  assert.strictEqual(String(data.FX_DATA_RECENT.dates[data.FX_DATA_RECENT.dates.length - 1]), data.FX_DATA_RECENT.lastDate.replace(/-/g, ""));
});

test("AC-30：比較の表の元には4つの方法×4つの先の長さ（5・10・15・20）があり、60営業日は無く、採用した方法が含まれる", function () {
  const data = loadDataFiles();
  assert.strictEqual(data.FX_BAND_COMPARE.rows.length, 16);
  assert.deepStrictEqual(Array.from(new Set(data.FX_BAND_COMPARE.rows.map(function (row) { return row.horizon; }))), [5, 10, 15, 20]);
  assert.ok(data.FX_BAND_COMPARE.rows.some(function (row) { return row.method === BAND_CONFIG.methodName; }));
});

test("後から読むファイルがすべてある", function () {
  for (const file of LATER_FILES) {
    assert.ok(fs.existsSync(path.join(__dirname, "..", file)), file);
  }
  for (const file of Object.values(BAND_CONFIG.methodFiles)) {
    assert.ok(fs.existsSync(path.join(__dirname, "..", file)), file);
  }
});
