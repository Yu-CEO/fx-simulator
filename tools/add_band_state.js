/*
 * add_band_state.js：画面の帯に必要な「最終日の状態」を、全期間のデータで計算して data/usdjpy_recent.js の末尾に書く作業
 * 理由：画面が最初に読むのは直近270件だけだが、方法④（カルマン）の S(h) は全期間をたどって決まる（比の選び方・フィルタの状態）。
 *       そのため全データで計算した状態（比・level・不確かさ）を先に作って渡し、画面はそれを使って帯を描く。
 * 主な関数：buildStateLine（書く1行を作る）、main。毎日の自動更新（.github/workflows/update_data.yml）で update_data.py の後に動かす。
 * 使い方：fx-simulator フォルダで `node tools/add_band_state.js`。何度動かしても同じ結果（前に書いた行は置き換える）。
 * 採用した方法に状態づくり（computeState）が無いとき（①〜③）は、何も書かず前の行も消す。
 */

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const BAND_CONFIG = require("../js/band_config.js");
const { computeDailyChanges } = require("../js/band_calc.js");

const PRODUCT_DIR = path.join(__dirname, "..");
const RECENT_PATH = path.join(PRODUCT_DIR, "data", "usdjpy_recent.js");
const OLDER_PATH = path.join(PRODUCT_DIR, "data", "usdjpy_older.js");
// 状態の行の目印。この行から後ろを毎回作り直す
const STATE_MARKER = "/* 最終日の状態";

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
  const line = buildStateLine(values, sandbox.FX_DATA_RECENT.lastDate, method);
  fs.writeFileSync(RECENT_PATH, recentText + line, "utf8");
  console.log(line === "" ? "状態は書きませんでした（採用した方法に状態づくりがありません）" : "最終日の状態を書きました（全期間 " + values.length + " 件）");
}

module.exports = { buildStateLine, stripState };

if (require.main === module) {
  main();
}
