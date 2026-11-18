/*
 * band_state.test.js：画面の帯に使う「最終日の状態」（tools/add_band_state.js が usdjpy_recent.js に書く）の自動テスト
 * 画面の S(h)（5・10・15・20）が、全期間のデータで計算した値と一致すること、状態が古くなっていないこと、
 * 毎日の自動更新で同じ状態が作られることを確かめる（レビュー指摘1）。
 */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const BAND_CONFIG = require("../js/band_config.js");
const { computeDailyChanges, buildBand } = require("../js/band_calc.js");
const kalman = require("../js/band_methods/kalman_local_level.js");
const { buildStateLine, stripState } = require("../tools/add_band_state.js");
const { randomWalkValues } = require("./helpers.js");

const DATA_DIR = path.join(__dirname, "..", "data");

/** data の画面用データを読み、全期間の値と最近の分・状態を返す */
function loadScreenData() {
  const sandbox = {};
  vm.createContext(sandbox);
  for (const name of ["usdjpy_older.js", "usdjpy_recent.js"]) {
    vm.runInContext(fs.readFileSync(path.join(DATA_DIR, name), "utf8"), sandbox);
  }
  return {
    all: sandbox.FX_DATA_OLDER.values.concat(sandbox.FX_DATA_RECENT.values),
    recent: sandbox.FX_DATA_RECENT,
  };
}

test("画面の S(h)（5・10・15・20）は、保存した最終日の状態を使うと、全期間のデータで計算した値と一致する", function () {
  const data = loadScreenData();
  assert.strictEqual(BAND_CONFIG.methodName, kalman.name);
  const state = data.recent.bandState.state;
  const fullChanges = computeDailyChanges(data.all);
  const recentChanges = computeDailyChanges(data.recent.values);
  for (const horizon of BAND_CONFIG.horizons) {
    const full = kalman.computeScale(fullChanges, horizon);
    const fromState = kalman.computeScale(recentChanges, horizon, { kalmanState: state });
    assert.ok(Math.abs(full - fromState) < 1e-12, horizon + "営業日：" + full + " と " + fromState);
    const bandFull = buildBand(data.all, kalman, horizon);
    const bandScreen = buildBand(data.recent.values, kalman, horizon, { kalmanState: state });
    assert.ok(Math.abs(bandFull.wide.upper - bandScreen.wide.upper) < 1e-9);
    assert.ok(Math.abs(bandFull.narrow.lower - bandScreen.narrow.lower) < 1e-9);
  }
});

test("保存した状態は最新のデータと同じ日付で、今のデータから作り直した状態と同じ（古い状態が残ったら失敗する）", function () {
  const data = loadScreenData();
  assert.strictEqual(data.recent.bandState.lastDate, data.recent.lastDate);
  const fresh = JSON.parse(buildStateLine(data.all, data.recent.lastDate, kalman).split("bandState = ")[1].replace(/;\s*$/, ""));
  assert.deepStrictEqual(JSON.parse(JSON.stringify(data.recent.bandState)), fresh);
});

test("状態の行は、何度書いても1行だけ（前の行を置き換える）", function () {
  const values = randomWalkValues(600, 0.006, 71);
  const base = "var FX_DATA_RECENT = {};\n";
  const once = base + buildStateLine(values, "2026-01-01", kalman);
  const twice = stripState(once) + buildStateLine(values, "2026-01-01", kalman);
  assert.strictEqual(once, twice);
  assert.strictEqual((twice.match(/bandState =/g) || []).length, 1);
});

test("毎日の自動更新（update_data.yml）は、取得のあと・テストの前に状態を作り、commit に含める", function () {
  const yml = fs.readFileSync(path.join(__dirname, "..", ".github", "workflows", "update_data.yml"), "utf8");
  const fetchAt = yml.indexOf("python tools/update_data.py");
  const stateAt = yml.indexOf("node tools/add_band_state.js");
  const testAt = yml.indexOf("node --test tests/");
  assert.ok(fetchAt >= 0 && fetchAt < stateAt && stateAt < testAt);
  assert.ok(yml.includes("git add data/usdjpy_source.csv data/usdjpy_recent.js"));
});

test("状態を使わなかった場合（状態なし）でも、画面は直近の変化だけで S(h) を出せる（①〜③と同じ動き）", function () {
  const values = randomWalkValues(300, 0.006, 72);
  const band = buildBand(values, kalman, 20);
  assert.ok(band.enough && band.wide.upper > band.lastValue);
});
