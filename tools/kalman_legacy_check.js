/*
 * kalman_legacy_check.js：v3.1 までの方法④の作り（変化²をそのまま観測にする）が、固定の重みの EWMA と同じだったことを数で示す部品
 * 主な関数：steadyGain（ゲインが落ち着く値）、legacyReport（比の候補ごとの落ち着いたゲインと、最終日に選ばれた比）
 * 旧い作りの式は、docs/band_methods.md に「改善前の問題」を書くためだけに残す（画面・比較には使わない）。
 * tools/band_methods_report.js から使われる。tests/kalman_method.test.js でテストする。
 */

// 旧い作りで試していた比の候補（見えない値のゆれ ÷ 観測のゆれ）
const LEGACY_RATIO_CANDIDATES = [0.0001, 0.0003, 0.001, 0.003, 0.01, 0.03, 0.1];
// 観測のゆれの大きさ。変化が正規分布なら、変化²のばらつき（分散）は 2×x² になる
const LEGACY_OBSERVATION_FACTOR = 2;
// 旧い作りが使った変化の数（250営業日）
const LEGACY_WINDOW = 250;
// ゲインが落ち着いたとみなすまで回す日数。250日より十分多く回せば、小数点以下の数桁で止まる
const SETTLE_STEPS = 5000;

/**
 * 比を決めたときに、カルマンゲイン（観測をどれだけ取り入れるか）が何回かの更新で落ち着く値を返す。
 * 不確かさは「x² に対する倍率」で持つので、値の大きさによらない。
 * @param {number} ratio 見えない値のゆれ ÷ 観測のゆれ
 * @returns {number} 落ち着いたゲイン（0〜1）。固定の重みの EWMA の λ に直すと 1−ゲイン
 * @example steadyGain(0.001) // 約0.05
 */
function steadyGain(ratio) {
  let uncertainty = 1;
  let gain = 0;
  for (let step = 0; step < SETTLE_STEPS; step++) {
    const predicted = uncertainty + ratio * LEGACY_OBSERVATION_FACTOR;
    gain = predicted / (predicted + LEGACY_OBSERVATION_FACTOR);
    uncertainty = (1 - gain) * predicted;
  }
  return gain;
}

/**
 * 旧い作りで、直近250個の変化に対して比ごとの当てはまり（変化²を観測とした尤度）を求め、いちばん良い比を返す。
 * @param {number[]} changes ある日までの変化
 * @returns {number|null} 選ばれた比。変化が250個に足りない・全部 0 のときは null
 */
function legacyChosenRatio(changes) {
  if (changes.length < LEGACY_WINDOW) {
    return null;
  }
  const recent = changes.slice(changes.length - LEGACY_WINDOW);
  let squaredSum = 0;
  for (const change of recent) {
    squaredSum += change * change;
  }
  const startVariance = squaredSum / LEGACY_WINDOW;
  if (startVariance === 0) {
    return null;
  }
  let bestRatio = null;
  let bestScore = -Infinity;
  for (const ratio of LEGACY_RATIO_CANDIDATES) {
    let variance = startVariance;
    let uncertainty = 1;
    let score = 0;
    for (const change of recent) {
      const predicted = uncertainty + ratio * LEGACY_OBSERVATION_FACTOR;
      const totalSpread = predicted + LEGACY_OBSERVATION_FACTOR;
      const gain = predicted / totalSpread;
      const surprise = change * change - variance;
      const spread = totalSpread * variance * variance;
      score -= 0.5 * (Math.log(spread) + (surprise * surprise) / spread);
      variance = variance + gain * surprise;
      uncertainty = (1 - gain) * predicted;
    }
    if (score > bestScore) {
      bestScore = score;
      bestRatio = ratio;
    }
  }
  return bestRatio;
}

/**
 * docs に書く、旧い作りの確認結果を作る。
 * @param {number[]} changes 最終日までの変化
 * @returns {{rows:{ratio:number, gain:number, lambda:number}[], chosenRatio:number|null, chosenGain:number|null, chosenLambda:number|null}}
 */
function legacyReport(changes) {
  const rows = LEGACY_RATIO_CANDIDATES.map(function (ratio) {
    const gain = steadyGain(ratio);
    return { ratio, gain, lambda: 1 - gain };
  });
  const chosenRatio = legacyChosenRatio(changes);
  if (chosenRatio === null) {
    return { rows, chosenRatio: null, chosenGain: null, chosenLambda: null };
  }
  const chosenGain = steadyGain(chosenRatio);
  return { rows, chosenRatio, chosenGain, chosenLambda: 1 - chosenGain };
}

module.exports = { steadyGain, legacyChosenRatio, legacyReport, LEGACY_RATIO_CANDIDATES };
