/*
 * ewma.js：帯の計算方法②「直近を重く見た1年の動き」（EWMA＝指数加重移動平均。新しい日ほど重く数える平均）
 * 主なもの：ewmaMethod（name・computeScale・dailySigma を持つ部品）
 * どの方法も同じ形：「ある日までの変化の一覧」を受け取り、「先の長さ h の動きの大きさ S(h)」を返す。
 * 画面（data_loader.js が採用したときだけ読む）と tools/compare_band_methods.js から使われる。
 * 式：σ²(今日)＝λ×σ²(前日)＋(1−λ)×変化(前日)²、S(h)＝σ×√h。変化の平均（向き）は使わない。
 */

// 設定（band_config.js）。ブラウザでは先に読み込まれた BAND_CONFIG を、Node.js では require で読む
const EWMA_SETTINGS = (typeof module !== "undefined" && module.exports) ? require("../band_config.js") : BAND_CONFIG;
// 使う変化の数。250営業日＝約1年。①と同じ日数にして、答え合わせの日の集まりをそろえる
const EWMA_WINDOW = EWMA_SETTINGS.windowDays;
// 前日までの分散をどれだけ残すか（0〜1）。0.94 なら、約1か月前の変化の重みは今日の約3割
const EWMA_LAMBDA = EWMA_SETTINGS.ewmaLambda;

/**
 * 直近 EWMA_WINDOW 個の変化から、EWMA で翌日の1日の動きの大きさ σ を求める。
 * 最初の分散は、その250個の変化の2乗の平均から始める（どこから始めても、0.94 の重みで約1か月たつと影響は小さくなる）。
 * @param {number[]} changes ある日までの日々の変化（対数）。古い順
 * @param {object} [options] { lambda } λ を替えて試すとき（省略時は band_config.js の値）
 * @returns {number|null} σ。変化が足りないときは null
 * @example ewmaDaily(changes) // 約 0.005
 */
function ewmaDaily(changes, options) {
  if (changes.length < EWMA_WINDOW) {
    return null;
  }
  let lambda = EWMA_LAMBDA;
  if (options && typeof options.lambda === "number") {
    lambda = options.lambda;
  }
  const recent = changes.slice(changes.length - EWMA_WINDOW);
  let squaredSum = 0;
  for (const change of recent) {
    squaredSum += change * change;
  }
  let variance = squaredSum / EWMA_WINDOW;
  for (const change of recent) {
    variance = lambda * variance + (1 - lambda) * change * change;
  }
  return Math.sqrt(variance);
}

/**
 * 先の長さ h 営業日の動きの大きさ S(h)＝σ×√h を返す（部品の約束の形）。
 * @param {number[]} changes ある日までの日々の変化（対数）。その日より後の変化は入れない
 * @param {number} horizonDays 先の長さ（営業日）
 * @param {object} [options] { lambda }
 * @returns {number|null} S(h)。変化が足りないときは null
 */
function ewmaScale(changes, horizonDays, options) {
  const dailySigma = ewmaDaily(changes, options);
  if (dailySigma === null) {
    return null;
  }
  return dailySigma * Math.sqrt(horizonDays);
}

const ewmaMethod = { name: "ewma", computeScale: ewmaScale, dailySigma: ewmaDaily };

// Node.js では require で使えるようにする。ブラウザでは「読み込んだ方法」として決まった名前に入れる
if (typeof module !== "undefined" && module.exports) {
  module.exports = ewmaMethod;
} else {
  window.loadedBandMethod = ewmaMethod;
}
