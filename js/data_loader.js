/*
 * data_loader.js：あとから読むファイル（方法の部品・過去約9年分のデータ・答え合わせと似た局面の計算と表示）を読み込む
 * 主な関数：loadMethodFile（採用した方法のファイルを1つだけ読む）、loadLaterFiles（最初の画面のあとに読む分）、combineData（データをつなぐ）
 * fetch（通信でファイルを取る命令）は使わず、<script> を後から足して読む。index.html をダブルクリックで開いても動くようにするため。
 * main.js から使われる。読む量の確認（tools/check_size.py）も、下の LATER_FILES の一覧を見る。
 */

// 最初の画面が出たあとに読むファイル（この順に1つずつ読む）。3年・10年・答え合わせ・似た局面に使う
const LATER_FILES = [
  "data/usdjpy_older.js",
  "data/band_compare.js",
  "js/band_backtest_calc.js",
  "js/similar_calc.js",
  "js/result_cache.js",
  "js/stats_view.js",
];

/**
 * <script> を1つ後から足して読む。
 * @param {string} source 読むファイルの場所（index.html から見た場所）
 * @param {function(): void} onLoad 読み終わったときに呼ぶ
 * @param {function(): void} onError 読めなかったときに呼ぶ
 */
function appendScript(source, onLoad, onError) {
  const script = document.createElement("script");
  script.src = source;
  script.onload = onLoad;
  script.onerror = function () {
    script.remove();  // 失敗した <script> は外す（もう一度読むときに、同じものが2つ残らないように）
    onError();
  };
  document.body.appendChild(script);
}

/**
 * band_config.js で選んだ方法のファイルを1つだけ読む（画面が読む方法は採用した1つだけ）。
 * @param {object} config BAND_CONFIG
 * @param {function(object): void} onDone 読み終わったら、方法の部品を渡して呼ぶ
 * @param {function(): void} onFail 読めなかったときに呼ぶ
 */
function loadMethodFile(config, onDone, onFail) {
  const source = config.methodFiles[config.methodName];
  if (!source) {
    onFail();
    return;
  }
  appendScript(source, function () {
    onDone(window.loadedBandMethod);
  }, onFail);
}

// 読み終わったファイルの数。もう一度読むときに、読めた分は読み直さないため
let laterLoadedCount = 0;

/**
 * 最初の画面のあとに読む分を、順に読む。途中で失敗したら onFail を呼び、もう一度呼ぶと失敗した所から読み直す。
 * @param {function(): void} onDone すべて読み終わったときに呼ぶ
 * @param {function(): void} onFail 読めなかったときに呼ぶ
 */
function loadLaterFiles(onDone, onFail) {
  if (laterLoadedCount >= LATER_FILES.length) {
    onDone();
    return;
  }
  appendScript(LATER_FILES[laterLoadedCount], function () {
    laterLoadedCount++;
    loadLaterFiles(onDone, onFail);
  }, onFail);
}

/**
 * 最近の分と、それより前の分のデータを、古い順に1つにつなぐ。
 * @param {object} recent { lastDate, dates, values }
 * @param {object|null} older { dates, values }（まだ読んでいないときは null）
 * @returns {{lastDate:string, dates:number[], values:number[]}}
 * @example combineData({lastDate:"2026-11-17", dates:[3], values:[3]}, {dates:[1, 2], values:[1, 2]}).values // [1, 2, 3]
 */
function combineData(recent, older) {
  if (!older) {
    return { lastDate: recent.lastDate, dates: recent.dates, values: recent.values };
  }
  return {
    lastDate: recent.lastDate,
    dates: older.dates.concat(recent.dates),
    values: older.values.concat(recent.values),
  };
}

// Node.js（テスト）から require で使えるようにする。ブラウザでは関数がそのまま見える
if (typeof module !== "undefined" && module.exports) {
  module.exports = { LATER_FILES, combineData };
}
