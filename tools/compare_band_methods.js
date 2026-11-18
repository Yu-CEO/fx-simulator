/*
 * compare_band_methods.js：帯の計算方法①〜④を、過去データの答え合わせで比べて選ぶ作業（仕様 2-2a。先の長さは5・10・15・20営業日）
 * 主な関数：compareMethods（方法ごと・先の長さごとに (a)(b)(c) を出す）、chooseMethod（採用する方法を選ぶ）、main
 * 結果は docs/band_methods.md（説明と表）と data/band_compare.js（画面の 02 の表に使う小さなデータ）に書く。
 * 書く部分は tools/band_methods_report.js。画面からは使わない（手元・CI の Node.js で動かす）。
 * 使い方：fx-simulator フォルダで `node tools/compare_band_methods.js`
 * 採用した方法は js/band_config.js に手で書く（毎日の自動更新で勝手に替わらないようにするため）。
 */

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const BAND_CONFIG = require("../js/band_config.js");
const { listBacktestDays, methodScaleForDay, runBacktest } = require("../js/band_backtest_calc.js");
const report = require("./band_methods_report.js");
const { legacyReport } = require("./kalman_legacy_check.js");
const { computeDailyChanges } = require("../js/band_calc.js");

const PRODUCT_DIR = path.join(__dirname, "..");
// 比べる方法（この順で表に並べる）
const METHOD_NAMES = ["rolling_std", "ewma", "garch11", "kalman_local_level"];
// 合格がひとつもないときに使う方法（仕様：合格がなければ①のまま）
const FALLBACK_METHOD = "rolling_std";
// 日本時間（UTC+9）にずらすミリ秒。文書の日付を日本の日付で書くため
const JAPAN_OFFSET_MS = 9 * 60 * 60 * 1000;

/**
 * 方法の名前から部品を読み込む。
 * @param {string} name 方法の名前
 * @returns {object} 方法の部品
 */
function loadMethod(name) {
  return require(path.join(PRODUCT_DIR, BAND_CONFIG.methodFiles[name]));
}

/**
 * 答え合わせの結果から、表に使う (a)(b)(c) を取り出す。
 * @returns {{total:number, insideNarrowPct:number, insideWidePct:number, meanWidthPct:number}}
 */
function pickMeasures(result) {
  return {
    total: result.total,
    insideNarrowPct: result.insideNarrowPct,
    insideWidePct: result.insideWidePct,
    meanWidthPct: result.meanNarrowWidthPct,
  };
}

/**
 * 方法ごと・先の長さごとに答え合わせをする。どの方法も同じ日の集まりで比べる。前半・後半に分けた結果も出す。
 * @param {number[]} values 日々の値（古い順）
 * @param {object[]} methods 方法の部品の一覧
 * @returns {object[]} [{ method, horizon, all, firstHalf, secondHalf }]。all などは pickMeasures の形
 */
function compareMethods(values, methods) {
  const rows = [];
  for (const method of methods) {
    const scaleForDay = methodScaleForDay(method);
    for (const horizon of BAND_CONFIG.horizons) {
      const days = listBacktestDays(values.length, horizon);
      const half = Math.floor(days.length / 2);
      rows.push({
        method: method.name,
        horizon,
        all: pickMeasures(runBacktest(values, horizon, scaleForDay, days)),
        firstHalf: pickMeasures(runBacktest(values, horizon, scaleForDay, days.slice(0, half))),
        secondHalf: pickMeasures(runBacktest(values, horizon, scaleForDay, days.slice(half))),
      });
    }
  }
  return rows;
}

/**
 * 1つの行（方法×先の長さ）が合格か。(a) 狭い帯の中に入った割合≧65％ かつ (b) 広い帯の中に入った割合≧93％。
 */
function rowPasses(row) {
  return row.all.total > 0
    && row.all.insideNarrowPct >= BAND_CONFIG.passNarrowPct
    && row.all.insideWidePct >= BAND_CONFIG.passWidePct;
}

/**
 * 採用する方法を選ぶ。5・10・15・20 の4つすべてで合格した方法のうち、(c) 平均の広さ（4つの平均）がいちばん小さいもの。
 * 合格がひとつもなければ①（rolling_std）。
 * @param {object[]} rows compareMethods の結果
 * @returns {{chosen:string, passed:string[], widthByMethod:object}}
 */
function chooseMethod(rows) {
  const names = [];
  for (const row of rows) {
    if (!names.includes(row.method)) {
      names.push(row.method);
    }
  }
  const passed = [];
  const widthByMethod = {};
  for (const name of names) {
    const own = rows.filter(function (row) { return row.method === name; });
    let widthSum = 0;
    for (const row of own) {
      widthSum += row.all.meanWidthPct;
    }
    widthByMethod[name] = widthSum / own.length;
    if (own.length === BAND_CONFIG.horizons.length && own.every(rowPasses)) {
      passed.push(name);
    }
  }
  let chosen = null;
  for (const name of passed) {
    if (chosen === null || widthByMethod[name] < widthByMethod[chosen]) {
      chosen = name;
    }
  }
  if (chosen === null) {
    chosen = FALLBACK_METHOD;
  }
  return { chosen, passed, widthByMethod };
}

/**
 * 画面用のデータファイル（data/usdjpy_older.js・usdjpy_recent.js）を読み、値を古い順につないで返す。
 * @returns {{values:number[], lastDate:string}}
 */
function readScreenValues() {
  const sandbox = {};
  vm.createContext(sandbox);
  for (const name of ["usdjpy_older.js", "usdjpy_recent.js"]) {
    vm.runInContext(fs.readFileSync(path.join(PRODUCT_DIR, "data", name), "utf8"), sandbox);
  }
  return {
    values: sandbox.FX_DATA_OLDER.values.concat(sandbox.FX_DATA_RECENT.values),
    lastDate: sandbox.FX_DATA_RECENT.lastDate,
  };
}

/**
 * 入口：比べて、docs/band_methods.md と data/band_compare.js を書く。
 */
function main() {
  const data = readScreenValues();
  const methods = METHOD_NAMES.map(loadMethod);
  const rows = compareMethods(data.values, methods);
  const choice = chooseMethod(rows);
  const today = new Date(Date.now() + JAPAN_OFFSET_MS).toISOString().slice(0, 10);
  const info = { date: today, dataLastDate: data.lastDate, valueCount: data.values.length, adopted: BAND_CONFIG.methodName,
    legacy: legacyReport(computeDailyChanges(data.values)) };
  fs.mkdirSync(path.join(PRODUCT_DIR, "docs"), { recursive: true });
  fs.writeFileSync(path.join(PRODUCT_DIR, "docs", "band_methods.md"), report.buildMarkdown(rows, choice, info), "utf8");
  fs.writeFileSync(path.join(PRODUCT_DIR, "data", "band_compare.js"), report.buildCompareJs(rows, choice, info), "utf8");
  console.log("比較で選ばれた方法：" + choice.chosen + "（合格：" + (choice.passed.join("・") || "なし") + "）");
  if (choice.chosen !== BAND_CONFIG.methodName) {
    console.log("注意：js/band_config.js の methodName（" + BAND_CONFIG.methodName + "）と違います。作者が決めてから書き換えてください");
  }
}

module.exports = { compareMethods, chooseMethod, rowPasses };

if (require.main === module) {
  main();
}
