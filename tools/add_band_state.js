/*
 * add_band_state.js：画面の帯に必要な「最終日の状態」を、全期間のデータで計算して data/usdjpy_recent.js の末尾に書く作業
 * 理由：画面が最初に読むのは直近270件だけだが、方法④（カルマン）の S(h) は全期間をたどって決まる（比の選び方・フィルタの状態）。
 *       そのため全データで計算した状態（比・level・不確かさ）を先に作って渡し、画面はそれを使って帯を描く。
 * 主な関数：buildStateLine（書く1行を作る）、main。毎日の自動更新（.github/workflows/update_data.yml）で update_data.py の後に動かす。
 * 使い方：fx-simulator フォルダで `node tools/add_band_state.js`。何度動かしても同じ結果（前に書いた行は置き換える）。
 * 採用した方法に状態づくり（computeState）が無いとき（①〜③）は、最終日の状態の行は書かず前の行も消す。
 * 第2段階（今日の図）：もう1行 FX_DATA_RECENT.storyBase も書く。「1か月前（20営業日前）の日の状態」と「全期間の答え合わせの通算」
 *   （今日の図の①に使う。画面には直近280件しかなく、全期間の計算ができないため。仕様 2-8）。
 */

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const BAND_CONFIG = require("../js/band_config.js");
const { computeDailyChanges } = require("../js/band_calc.js");
const { runBacktest, methodScaleForDay } = require("../js/band_backtest_calc.js");
const STORY_CONFIG = require("../js/story_config.js");

const PRODUCT_DIR = path.join(__dirname, "..");
const RECENT_PATH = path.join(PRODUCT_DIR, "data", "usdjpy_recent.js");
const OLDER_PATH = path.join(PRODUCT_DIR, "data", "usdjpy_older.js");
// 状態の行の目印。この行から後ろを毎回作り直す
const STATE_MARKER = "/* 最終日の状態";
// ％を小数第3位に丸める倍率（1000倍して四捨五入し、1000で割る）
const BACKTEST_PCT_SCALE = 1000;

/**
 * 全期間の値から、書く1行（コメント＋代入）を作る。
 * @param {number[]} values 全期間の値（古い順）
 * @param {string} lastDate データの最終日 "YYYY-MM-DD"
 * @param {object} method 採用した方法の部品
 * @returns {string} 書く文字。状態づくりが無い方法なら ""
 */
function buildStateLine(values, lastDate, method) {
  if (typeof method.computeState !== "function") {
    return "";
  }
  const state = method.computeState(computeDailyChanges(values));
  const body = JSON.stringify({ lastDate, state });
  return STATE_MARKER + "（自動生成：tools/add_band_state.js が全期間のデータで計算。手で書き換えない）。画面の帯の S(h) に使う */\n"
    + "FX_DATA_RECENT.bandState = " + body + ";\n";
}

/**
 * 今日の図に使う基準（1か月前の日の状態と、答え合わせの通算）の1行を作る。
 * @param {number[]} values 全期間の値（古い順）
 * @param {string} lastDate データの最終日 "YYYY-MM-DD"
 * @param {object} method 採用した方法の部品
 * @returns {string} 書く文字（コメント＋代入）
 */
function buildStoryBaseLine(values, lastDate, method) {
  const horizonDays = STORY_CONFIG.horizonDays;
  const monthAgoIndex = values.length - 1 - horizonDays;
  const base = { lastDate, horizonDays };
  if (typeof method.computeState === "function") {
    base.monthAgoState = method.computeState(computeDailyChanges(values.slice(0, monthAgoIndex + 1)));
  }
  const backtest = runBacktest(values, horizonDays, methodScaleForDay(method));
  // ％は小数第3位まで（表示は小数第1位。ファイルを小さくするため）
  base.backtest = {
    total: backtest.total,
    outsideNarrowPct: Math.round(backtest.outsideNarrowPct * BACKTEST_PCT_SCALE) / BACKTEST_PCT_SCALE,
    outsideWidePct: Math.round(backtest.outsideWidePct * BACKTEST_PCT_SCALE) / BACKTEST_PCT_SCALE,
  };
  return STATE_MARKER + "（今日の図用・自動生成。手で書き換えない） */\n"
    + "FX_DATA_RECENT.storyBase = " + JSON.stringify(base) + ";\n";
}

/** 前に書いた状態の行を取り除いた、usdjpy_recent.js の中身を返す。 */
function stripState(text) {
  const index = text.indexOf(STATE_MARKER);
  return index === -1 ? text : text.slice(0, index);
}

/** 入口：全期間の値を読み、状態を usdjpy_recent.js の末尾に書く。 */
function main() {
  const recentText = stripState(fs.readFileSync(RECENT_PATH, "utf8"));
  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(OLDER_PATH, "utf8"), sandbox);
  vm.runInContext(recentText, sandbox);
  const values = sandbox.FX_DATA_OLDER.values.concat(sandbox.FX_DATA_RECENT.values);
  const method = require(path.join(PRODUCT_DIR, BAND_CONFIG.methodFiles[BAND_CONFIG.methodName]));
  const lastDate = sandbox.FX_DATA_RECENT.lastDate;
  const line = buildStateLine(values, lastDate, method);
  const storyLine = buildStoryBaseLine(values, lastDate, method);
  fs.writeFileSync(RECENT_PATH, recentText + line + storyLine, "utf8");
  console.log(line === "" ? "状態は書きませんでした（採用した方法に状態づくりがありません）" : "最終日の状態を書きました（全期間 " + values.length + " 件）");
  console.log("今日の図の基準を書きました");
}

module.exports = { buildStateLine, buildStoryBaseLine, stripState };

if (require.main === module) {
  main();
}
