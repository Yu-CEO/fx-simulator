/*
 * garch11.js：帯の計算方法③「GARCH(1,1)」（動きの大きさが、大きく動いた翌日は大きくなり、やがて平均に戻るモデル）
 * 主なもの：garchMethod（name・computeScale・dailySigma・estimate を持つ部品）、estimateGarchParams（ω・α・β の推定）
 * どの方法も同じ形：「ある日までの変化の一覧」を受け取り、「先の長さ h の動きの大きさ S(h)」を返す。
 * 画面（data_loader.js が採用したときだけ読む）と tools/compare_band_methods.js から使われる。
 * 式：σ²(翌日)＝ω＋α×変化(今日)²＋β×σ²(今日)。h 日分の分散の見込みを足して S(h)²にする。変化の平均（向き）は使わない。
 */

// 設定（band_config.js）。ブラウザでは先に読み込まれた BAND_CONFIG を、Node.js では require で読む
const GARCH_SETTINGS = (typeof module !== "undefined" && module.exports) ? require("../band_config.js") : BAND_CONFIG;
// 帯を作るときに σ² を順に計算していく変化の数。250営業日＝約1年（①②と同じ日数）
const GARCH_WINDOW = GARCH_SETTINGS.windowDays;
// α・β を探す範囲と刻み。α は大きく動いた日の影響、β は前日の分散を残す割合
const GARCH_ALPHA_MIN = 0.01;
const GARCH_ALPHA_MAX = 0.3;
const GARCH_BETA_MIN = 0.5;
const GARCH_BETA_MAX = 0.98;
const GARCH_COARSE_STEP = 0.01;  // 最初は 0.01 刻みで大まかに探す
const GARCH_FINE_STEP = 0.001;   // 次に、いちばん良かった所の前後 ±0.01 を 0.001 刻みで探す
// α＋β の上限。1 以上だと分散が平均に戻らず、ω が決まらないため
const GARCH_MAX_PERSISTENCE = 0.999;

/**
 * 変化の2乗の平均（平均を引かない分散）を返す。向きを使わないため、平均は 0 とみなす。
 * @param {number[]} changes 変化の一覧
 * @returns {number} 2乗の平均。空なら 0
 */
function meanSquare(changes) {
  if (changes.length === 0) {
    return 0;
  }
  let squaredSum = 0;
  for (const change of changes) {
    squaredSum += change * change;
  }
  return squaredSum / changes.length;
}

/**
 * α・β を決めたときの、データの当てはまりの良さ（対数尤度。大きいほど良い）を返す。
 * ω は「長い目で見た分散＝変化の2乗の平均」になるように決める（分散ターゲティング）。
 * @param {number[]} changes 推定に使う変化
 * @param {number} alpha α
 * @param {number} beta β
 * @param {number} longRunVariance 長い目で見た分散
 * @returns {number} 対数尤度（定数の部分は省く）
 */
function garchLogLikelihood(changes, alpha, beta, longRunVariance) {
  const omega = longRunVariance * (1 - alpha - beta);
  let variance = longRunVariance;
  let total = 0;
  for (const change of changes) {
    total -= 0.5 * (Math.log(variance) + (change * change) / variance);
    variance = omega + alpha * change * change + beta * variance;
  }
  return total;
}

/**
 * α・β の範囲を決まった刻みで調べ、いちばん当てはまりの良い組を返す（乱数を使わないので毎回同じ結果）。
 * @returns {{alpha:number, beta:number, score:number}}
 */
function searchGarchGrid(changes, longRunVariance, range) {
  let best = { alpha: GARCH_ALPHA_MIN, beta: GARCH_BETA_MIN, score: -Infinity };
  const alphaSteps = Math.round((range.alphaMax - range.alphaMin) / range.step);
  const betaSteps = Math.round((range.betaMax - range.betaMin) / range.step);
  for (let alphaIndex = 0; alphaIndex <= alphaSteps; alphaIndex++) {
    const alpha = range.alphaMin + alphaIndex * range.step;
    for (let betaIndex = 0; betaIndex <= betaSteps; betaIndex++) {
      const beta = range.betaMin + betaIndex * range.step;
      if (alpha + beta >= GARCH_MAX_PERSISTENCE) {
        continue;
      }
      const score = garchLogLikelihood(changes, alpha, beta, longRunVariance);
      if (score > best.score) {
        best = { alpha, beta, score };
      }
    }
  }
  return best;
}

/**
 * 変化の一覧から ω・α・β を推定する。答え合わせでは、その日より前の変化だけを渡すこと（未来のデータを使わないため）。
 * @param {number[]} changes 推定に使う変化（古い順）
 * @returns {{omega:number, alpha:number, beta:number}|null} 変化が全部 0 のときは null
 * @example estimateGarchParams(changes) // { omega: 0.0000003, alpha: 0.05, beta: 0.93 }
 */
function estimateGarchParams(changes) {
  const longRunVariance = meanSquare(changes);
  if (longRunVariance === 0) {
    return null;
  }
  const coarse = searchGarchGrid(changes, longRunVariance, {
    alphaMin: GARCH_ALPHA_MIN, alphaMax: GARCH_ALPHA_MAX, betaMin: GARCH_BETA_MIN, betaMax: GARCH_BETA_MAX, step: GARCH_COARSE_STEP,
  });
  const fine = searchGarchGrid(changes, longRunVariance, {
    alphaMin: Math.max(GARCH_ALPHA_MIN / 10, coarse.alpha - GARCH_COARSE_STEP),
    alphaMax: Math.min(GARCH_ALPHA_MAX, coarse.alpha + GARCH_COARSE_STEP),
    betaMin: Math.max(0, coarse.beta - GARCH_COARSE_STEP),
    betaMax: Math.min(GARCH_BETA_MAX, coarse.beta + GARCH_COARSE_STEP),
    step: GARCH_FINE_STEP,
  });
  return { omega: longRunVariance * (1 - fine.alpha - fine.beta), alpha: fine.alpha, beta: fine.beta };
}

/**
 * 直近 GARCH_WINDOW 個の変化を順にたどり、翌日の分散 σ² を求める。
 * @param {number[]} changes ある日までの変化
 * @param {{omega:number, alpha:number, beta:number}|null} params 推定した値（null は変化が全部 0 のとき）
 * @returns {number|null} 翌日の分散。変化が足りないときは null
 */
function garchNextVariance(changes, params) {
  if (changes.length < GARCH_WINDOW) {
    return null;
  }
  const recent = changes.slice(changes.length - GARCH_WINDOW);
  let variance = meanSquare(recent);
  if (variance === 0 || params === null) {
    return 0;
  }
  for (const change of recent) {
    variance = params.omega + params.alpha * change * change + params.beta * variance;
  }
  return variance;
}

/**
 * 推定した値を options から受け取る。無ければ、受け取った変化だけで推定する（重いので比較の作業では先に推定して渡す）。
 */
function garchParamsFrom(changes, options) {
  if (options && options.garchParams !== undefined) {
    return options.garchParams;
  }
  return estimateGarchParams(changes);
}

/**
 * 翌日の1日の動きの大きさ σ を返す。
 * @param {number[]} changes ある日までの変化
 * @param {object} [options] { garchParams: {omega, alpha, beta} }
 * @returns {number|null}
 */
function garchDaily(changes, options) {
  const variance = garchNextVariance(changes, garchParamsFrom(changes, options));
  if (variance === null) {
    return null;
  }
  return Math.sqrt(variance);
}

/**
 * 先の長さ h 営業日の動きの大きさ S(h) を返す（部品の約束の形）。
 * k 日先の分散の見込み＝長い目で見た分散＋(α＋β)^(k−1)×（翌日の分散−長い目で見た分散）を、1〜h 日分足す。
 * @param {number[]} changes ある日までの変化。その日より後の変化は入れない
 * @param {number} horizonDays 先の長さ（営業日）
 * @param {object} [options] { garchParams }
 * @returns {number|null} S(h)
 */
function garchScale(changes, horizonDays, options) {
  const params = garchParamsFrom(changes, options);
  const nextVariance = garchNextVariance(changes, params);
  if (nextVariance === null) {
    return null;
  }
  if (nextVariance === 0) {
    return 0;
  }
  const persistence = params.alpha + params.beta;
  const longRunVariance = params.omega / (1 - persistence);
  let totalVariance = 0;
  for (let day = 1; day <= horizonDays; day++) {
    totalVariance += longRunVariance + Math.pow(persistence, day - 1) * (nextVariance - longRunVariance);
  }
  return Math.sqrt(totalVariance);
}

const garchMethod = { name: "garch11", computeScale: garchScale, dailySigma: garchDaily, estimate: estimateGarchParams, optionKey: "garchParams" };

// Node.js では require で使えるようにする。ブラウザでは「読み込んだ方法」として決まった名前に入れる
if (typeof module !== "undefined" && module.exports) {
  module.exports = garchMethod;
} else {
  window.loadedBandMethod = garchMethod;
}
