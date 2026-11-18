/*
 * rolling_std.js：帯の計算方法①「直近1年の動き」（直近250営業日の変化の標本標準偏差）
 * 主なもの：rollingStdMethod（name・computeScale を持つ部品）
 * どの方法も同じ形：「ある日までの変化の一覧」を受け取り、「先の長さ h の動きの大きさ S(h)」を返す。
 * 画面（data_loader.js が採用したときだけ読む）と tools/compare_band_methods.js から使われる。
 * 式：σ＝直近250個の変化の標本標準偏差（n−1 で割る）、S(h)＝σ×√h
 */

// 設定（band_config.js）。ブラウザでは先に読み込まれた BAND_CONFIG を、Node.js では require で読む
const ROLLING_SETTINGS = (typeof module !== "undefined" && module.exports) ? require("../band_config.js") : BAND_CONFIG;
// 使う変化の数。250営業日＝約1年
const ROLLING_WINDOW = ROLLING_SETTINGS.windowDays;

/**
 * 直近 ROLLING_WINDOW 個の変化の標本標準偏差 σ（1日の動きの大きさ）を求める。
 * @param {number[]} changes ある日までの日々の変化（対数）。古い順
 * @returns {number|null} σ。変化が足りないときは null
 * @example rollingStdDaily([0.01, -0.01, ...250個]) // 約 0.01
 */
function rollingStdDaily(changes) {
  if (changes.length < ROLLING_WINDOW) {
    return null;
  }
  const recent = changes.slice(changes.length - ROLLING_WINDOW);
  let sum = 0;
  for (const change of recent) {
    sum += change;
  }
  const mean = sum / ROLLING_WINDOW;
  let squaredSum = 0;
  for (const change of recent) {
    squaredSum += (change - mean) * (change - mean);
  }
  return Math.sqrt(squaredSum / (ROLLING_WINDOW - 1));
}

/**
 * 先の長さ h 営業日の動きの大きさ S(h)＝σ×√h を返す（部品の約束の形）。
 * @param {number[]} changes ある日までの日々の変化（対数）。その日より後の変化は入れない
 * @param {number} horizonDays 先の長さ（営業日）
 * @returns {number|null} S(h)。変化が足りないときは null
 * @example rollingStdScale(changes, 20) // σ×√20
 */
function rollingStdScale(changes, horizonDays) {
  const dailySigma = rollingStdDaily(changes);
  if (dailySigma === null) {
    return null;
  }
  return dailySigma * Math.sqrt(horizonDays);
}

const rollingStdMethod = { name: "rolling_std", computeScale: rollingStdScale, dailySigma: rollingStdDaily };

// Node.js では require で使えるようにする。ブラウザでは「読み込んだ方法」として決まった名前に入れる
// （画面が読む方法のファイルは1つだけなので、どの方法も同じ名前に入れて main.js から使う）
if (typeof module !== "undefined" && module.exports) {
  module.exports = rollingStdMethod;
} else {
  window.loadedBandMethod = rollingStdMethod;
}
