/*
 * kalman_local_level.js：帯の計算方法④「カルマンフィルタ」（見えない値を、毎日の観測から少しずつ直して推定する方法。仕様 v3.2 の作り）
 * 主なもの：kalmanMethod（name・computeScale・dailySigma・estimate を持つ部品）、runKalmanFilter（フィルタをたどる）、estimateKalmanParams（比の選択）
 * どの方法も同じ形：「ある日までの変化の一覧」を受け取り、「先の長さ h の動きの大きさ S(h)」を返す。
 * 画面（data_loader.js が採用したときだけ読む）と tools/compare_band_methods.js から使われる。tests/kalman_method.test.js でテストする。
 * モデル（ローカルレベル＝水準が毎日ランダムに少しずつ動くだけで、傾きを持たないモデル）：
 *   見えない値 z＝1日の分散の対数。z(今日)＝z(前日)＋小さなゆれ（分散 q）。観測 y＝ln(変化²)＝z＋観測のゆれ（分散 R＝π²/2）。
 *   観測のゆれの形（対数カイ2乗）は正規分布ではないので、正規分布とみなして推定する（QML＝分布の形が正しくなくても使える推定）。
 * 推定するのは変動の大きさだけ。値の水準や傾き（トレンド）は使わない（向きを出さないため）。
 * v3.1 までの作り（変化²をそのまま観測にする）は、ゲインが一定に落ち着き、固定の重みの EWMA と同じ計算だった（docs/band_methods.md）。
 * v3.2 の改善：①比は「変化 r 自体の正規分布の対数尤度 log N(r;0,x)」で選ぶ ②先へ行くほど増える推定の不確かさ P を S(h) に入れる
 *   ③最初の値は最初の250日だけで決め、比はその日までのデータだけで250日ごとに選ぶ（データを2回使わない）。
 */

// 設定（band_config.js）。ブラウザでは先に読み込まれた BAND_CONFIG を、Node.js では require で読む
const KALMAN_SETTINGS = (typeof module !== "undefined" && module.exports) ? require("../band_config.js") : BAND_CONFIG;
// 最初の値を決めるのに使う変化の数。250営業日＝約1年（①〜③と同じ日数）。この期間は比の選択の成績にも入れない
const KALMAN_INIT_DAYS = KALMAN_SETTINGS.windowDays;
// 比を選び直す間隔（営業日）。250営業日ごと（方法③と同じ。仕様 2-2a の「250営業日ごとに選び直す程度でよい」）
const KALMAN_REESTIMATE_DAYS = KALMAN_SETTINGS.windowDays;
// 「見えない値のゆれの分散 q」÷「観測のゆれの分散 R」の候補。小さいほど、ゆっくり動く（長い期間の平均に近い）推定になる
const KALMAN_RATIO_CANDIDATES = [0.00001, 0.00003, 0.0001, 0.0003, 0.001, 0.003, 0.01];
// 比を選ぶ材料（最初の250日の後ろのデータ）がまだ無いときに使う比。候補の真ん中あたり
const KALMAN_DEFAULT_RATIO = 0.0003;
// 観測のゆれの分散 R。ln(変化²) のゆれ（対数カイ2乗分布）の分散は π²/2（約4.93）
const KALMAN_OBSERVATION_VARIANCE = (Math.PI * Math.PI) / 2;
// ln(変化²) のゆれの平均。ψ(1/2)＋ln2＝約−1.2704（変化²が分散の何倍かの対数は、平均すると分散の対数よりこれだけ小さい）
const KALMAN_OBSERVATION_MEAN = -1.2703628;
// 変化が 0 のときに ln(0) にならないよう、変化² に足す小さな値（最初の250日の変化²の平均に対する割合）
const KALMAN_ZERO_GUARD_RATIO = 0.001;
// 最初の値の不確かさ P の初めの値。250個の平均で分散を推定したときの ln のばらつき（約 2÷250＝0.008）より、裾の厚さを見込んで大きめにした
const KALMAN_INITIAL_UNCERTAINTY = 0.02;

/**
 * 変化の2乗の平均（平均を引かない分散）を返す。向きを使わないため、平均は 0 とみなす。
 * @param {number[]} changes 変化の一覧
 * @returns {number} 2乗の平均。空なら 0
 */
function kalmanMeanSquare(changes) {
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
 * 正規分布 N(0, variance) で変化 r を見たときの対数尤度（当てはまりの良さ。大きいほど良い）。
 * @param {number} change 変化 r
 * @param {number} variance その日の分散の見込み x（0より大きい）
 * @returns {number} log N(r; 0, x)＝−0.5×(ln(2π×x)＋r²÷x)
 * @example kalmanLogDensity(0, 1) // −0.9189...
 */
function kalmanLogDensity(change, variance) {
  return -0.5 * (Math.log(2 * Math.PI * variance) + (change * change) / variance);
}

/**
 * フィルタを、最初の250日の後ろの変化に対して順にたどる。最初の値は最初の250日の変化だけで決める。
 * 各日の分散の見込み x は、その日の前日までのデータから求める（1日進めたあとの不確かさ P⁻ を使い、x＝exp(推定値＋P⁻÷2)）。
 * @param {number[]} changes ある日までの変化（古い順）。最初の250個が「最初の値」づくり、残りがフィルタと尤度の対象
 * @param {number} ratio q÷R（見えない値のゆれ ÷ 観測のゆれ）
 * @returns {{level:number, uncertainty:number, logLikelihood:number, variances:number[], count:number}|null}
 *   level は見えない値 z（分散の対数）の推定、uncertainty は P、logLikelihood は log N(r;0,x) の合計、
 *   variances は各日の x。最初の250日に足りない・変化が全部 0 のときは null
 */
function runKalmanFilter(changes, ratio) {
  if (changes.length < KALMAN_INIT_DAYS) {
    return null;
  }
  const startVariance = kalmanMeanSquare(changes.slice(0, KALMAN_INIT_DAYS));
  if (startVariance === 0) {
    return null;
  }
  const processVariance = ratio * KALMAN_OBSERVATION_VARIANCE;
  const zeroGuard = startVariance * KALMAN_ZERO_GUARD_RATIO;
  let level = Math.log(startVariance);
  let uncertainty = KALMAN_INITIAL_UNCERTAINTY;
  let logLikelihood = 0;
  const variances = [];
  for (let index = KALMAN_INIT_DAYS; index < changes.length; index++) {
    const change = changes[index];
    // 1日たつと、見えない値がゆれる分だけ不確かさが増える（1日進める段階）
    const predictedUncertainty = uncertainty + processVariance;
    const variance = Math.exp(level + predictedUncertainty / 2);
    variances.push(variance);
    logLikelihood += kalmanLogDensity(change, variance);
    // 観測 ln(変化²) を見て、推定を直す（更新の段階）。ゲイン＝観測をどれだけ取り入れるか（0〜1）
    const observation = Math.log(change * change + zeroGuard);
    const gain = predictedUncertainty / (predictedUncertainty + KALMAN_OBSERVATION_VARIANCE);
    level = level + gain * (observation - (level + KALMAN_OBSERVATION_MEAN));
    uncertainty = (1 - gain) * predictedUncertainty;
  }
  return { level, uncertainty, logLikelihood, variances, count: variances.length };
}

/**
 * 比を、その日までの変化だけで選ぶ。候補のうち、対数尤度 log N(r;0,x) の合計がいちばん大きいもの。
 * 最初の250日は尤度に入れない（最初の値づくりに使ったため）。尤度の材料がまだ無いときは既定の比。
 * @param {number[]} changes 選ぶのに使う変化（その日までのもの。それより後は渡さない）
 * @returns {{ratio:number}} 選んだ比
 */
function estimateKalmanParams(changes) {
  let best = { ratio: KALMAN_DEFAULT_RATIO, score: -Infinity };
  if (changes.length <= KALMAN_INIT_DAYS) {
    return { ratio: KALMAN_DEFAULT_RATIO };
  }
  for (const ratio of KALMAN_RATIO_CANDIDATES) {
    const result = runKalmanFilter(changes, ratio);
    if (result !== null && result.logLikelihood > best.score) {
      best = { ratio, score: result.logLikelihood };
    }
  }
  return { ratio: best.ratio };
}

/**
 * 比を選び直す区切りの変化の数を返す。250個を最初の区切りとして、250個ごと（方法③と同じ）。
 * 例：変化が 250〜499 個なら 250、500〜749 個なら 500
 * @param {number} changeCount ある日までの変化の数
 * @returns {number}
 */
function kalmanEstimateStart(changeCount) {
  const blocks = Math.floor((changeCount - KALMAN_INIT_DAYS) / KALMAN_REESTIMATE_DAYS);
  return KALMAN_INIT_DAYS + Math.max(0, blocks) * KALMAN_REESTIMATE_DAYS;
}

/**
 * 比を options から受け取る。無ければ、その日までの変化だけで、250日ごとの区切りまでを使って選ぶ（画面の最終日の分もこの決め方）。
 * @param {number[]} changes ある日までの変化（その日より後は渡さない）
 * @param {object} [options] { kalmanParams: {ratio} }。あればそのまま使う（比較の作業が先に選んだ値を渡すため）
 * @returns {{ratio:number}} 使う比
 * @example kalmanParamsFrom(changes) // { ratio: 0.0003 }
 */
function kalmanParamsFrom(changes, options) {
  if (options && options.kalmanParams !== undefined) {
    return options.kalmanParams;
  }
  return estimateKalmanParams(changes.slice(0, kalmanEstimateStart(changes.length)));
}

/**
 * 先の長さ h 営業日の動きの大きさ S(h) を返す（部品の約束の形）。
 * k 日先の分散の見込み＝exp(推定値＋(P＋k×q)÷2)。P は先へ行くほど q ずつ増える（推定の不確かさ）。S(h)² は k＝1〜h を足したもの。
 * @param {number[]} changes ある日までの変化。その日より後の変化は入れない
 * @param {number} horizonDays 先の長さ（営業日）
 * @param {object} [options] { kalmanParams: {ratio} } または { kalmanState }（作ってある最終日の状態。あれば変化の一覧は使わない）
 * @returns {number|null} S(h)。変化が250個に足りないときは null、変化が全部 0 のときは 0
 */
function kalmanScale(changes, horizonDays, options) {
  if (options && options.kalmanState !== undefined) {
    return scaleFromState(options.kalmanState, horizonDays);
  }
  if (changes.length < KALMAN_INIT_DAYS) {
    return null;
  }
  return scaleFromState(computeKalmanState(changes, options), horizonDays);
}

/**
 * 最終日の状態（見えない値の推定・不確かさ・比）から S(h) を求める。k 日先の分散の見込み＝exp(推定値＋(P＋k×q)÷2) を k＝1〜h 足す。
 * @param {{ratio:number, level:number, uncertainty:number}|null} state computeKalmanState の結果（null は変化が全部 0 のとき）
 * @param {number} horizonDays 先の長さ（営業日）
 * @returns {number} S(h)。state が null なら 0
 */
function scaleFromState(state, horizonDays) {
  if (state === null) {
    return 0;
  }
  const processVariance = state.ratio * KALMAN_OBSERVATION_VARIANCE;
  let totalVariance = 0;
  for (let day = 1; day <= horizonDays; day++) {
    totalVariance += Math.exp(state.level + (state.uncertainty + day * processVariance) / 2);
  }
  return Math.sqrt(totalVariance);
}

/**
 * ある日までの変化から、その日の状態（比・見えない値の推定 level・不確かさ P）を作る。
 * 画面は、全期間の変化から tools/add_band_state.js が作ったこの状態を usdjpy_recent.js から読む（画面には直近270件しかないため）。
 * @param {number[]} changes ある日までの変化（250個以上）
 * @param {object} [options] { kalmanParams: {ratio} }
 * @returns {{ratio:number, level:number, uncertainty:number}|null} 変化が全部 0 のときは null
 */
function computeKalmanState(changes, options) {
  const params = kalmanParamsFrom(changes, options);
  const result = runKalmanFilter(changes, params.ratio);
  if (result === null) {
    return null;
  }
  return { ratio: params.ratio, level: result.level, uncertainty: result.uncertainty };
}

/**
 * 翌日の1日の動きの大きさ σ（S(1)）を返す。
 * @param {number[]} changes ある日までの変化
 * @param {object} [options] { kalmanParams }
 * @returns {number|null}
 */
function kalmanDaily(changes, options) {
  return kalmanScale(changes, 1, options);
}

// 方法④の部品（どの方法も同じ形）。computeScale＝S(h)、dailySigma＝1日の動きの大きさ、estimate＝比の選択、
// optionKey＝選んだ値を computeScale に渡すときの名前、estimateStart＝選び直す区切り。
// runFilter・logDensity はテスト用（フィルタの途中経過と尤度の確認）
const kalmanMethod = {
  name: "kalman_local_level",
  computeScale: kalmanScale,
  dailySigma: kalmanDaily,
  estimate: estimateKalmanParams,
  optionKey: "kalmanParams",
  estimateStart: kalmanEstimateStart,
  computeState: computeKalmanState,
  stateKey: "kalmanState",
  runFilter: runKalmanFilter,
  logDensity: kalmanLogDensity,
};

// Node.js では require で使えるようにする。ブラウザでは「読み込んだ方法」として決まった名前に入れる
if (typeof module !== "undefined" && module.exports) {
  module.exports = kalmanMethod;
} else {
  window.loadedBandMethod = kalmanMethod;
}
