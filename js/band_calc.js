/*
 * band_calc.js：日々の変化と、採用した方法の S(h) から「動く幅（帯）」を作る計算（仕様 2-2）
 * 主な関数：computeDailyChanges（日々の変化）、bandRange（1つの帯の上端・下端）、buildBand（最終日から先の帯）
 * 帯の真ん中は常に最終日の値。向き（上がる・下がる）や傾きは入れない。画面には触れない。
 * band_view.js・band_backtest_calc.js・tools/compare_band_methods.js から使われる。tests/band_calc.test.js でテストする。
 */

// 設定（band_config.js）。ブラウザでは先に読み込まれた BAND_CONFIG を、Node.js では require で読む
const BAND_CALC_SETTINGS = (typeof module !== "undefined" && module.exports) ? require("./band_config.js") : BAND_CONFIG;

/**
 * 日々の変化（対数）の一覧を作る。変化＝ln(今日の値 ÷ 前の営業日の値)。
 * @param {number[]} values 日々の値（古い順）
 * @returns {number[]} 変化の一覧（values より1つ少ない）。changes[i] は values[i] から values[i+1] への変化
 * @example computeDailyChanges([100, 110]) // [0.0953...]
 */
function computeDailyChanges(values) {
  const changes = [];
  for (let index = 1; index < values.length; index++) {
    changes.push(Math.log(values[index] / values[index - 1]));
  }
  return changes;
}

/**
 * 1つの帯の下端と上端を求める。下端＝基準の値×exp(−倍率×S)、上端＝基準の値×exp(＋倍率×S)。
 * 上端×下端＝基準の値² になる（基準の値に対して対称。向きを入れないため）。
 * @param {number} baseValue 帯の真ん中にする値（最終日の値）
 * @param {number} scale 動きの大きさ S（0以上）
 * @param {number} multiple 倍率（狭い帯は1、広い帯は2）
 * @returns {{lower:number, upper:number}}
 * @example bandRange(100, 0.1, 1) // { lower: 90.48..., upper: 110.51... }
 */
function bandRange(baseValue, scale, multiple) {
  return {
    lower: baseValue * Math.exp(-multiple * scale),
    upper: baseValue * Math.exp(multiple * scale),
  };
}

/**
 * 帯を作れるだけのデータがあるかを調べる。250個の変化（＝251件の値）が必要。
 * @param {number[]} values 日々の値
 * @returns {boolean}
 */
function hasEnoughForBand(values) {
  return values.length >= BAND_CALC_SETTINGS.windowDays + 1;
}

/**
 * 最終日から先の帯を作る。最終日から h 営業日先まで、1日ごとに S(経過日数) で広がる形（ラッパ型）。
 * @param {number[]} values 日々の値（古い順）
 * @param {object} method 採用した方法の部品（computeScale(changes, h, options) を持つ）
 * @param {number} horizonDays 先の長さ（営業日）
 * @param {object} [options] 方法に渡す追加の設定
 * @returns {object} データが足りないときは { enough: false }。
 *   足りるときは { enough: true, lastValue, narrow:{lower,upper}, wide:{lower,upper}, path:[{day, narrowLower, narrowUpper, wideLower, wideUpper}] }
 * @example buildBand(values, rollingStdMethod, 20).narrow // { lower: 155.1, upper: 162.0 }
 */
function buildBand(values, method, horizonDays, options) {
  if (!hasEnoughForBand(values)) {
    return { enough: false };
  }
  const changes = computeDailyChanges(values);
  const lastValue = values[values.length - 1];
  const path = [];
  for (let day = 0; day <= horizonDays; day++) {
    let scale = 0;
    if (day > 0) {
      scale = method.computeScale(changes, day, options);
    }
    const narrowAtDay = bandRange(lastValue, scale, BAND_CALC_SETTINGS.narrowMultiple);
    const wideAtDay = bandRange(lastValue, scale, BAND_CALC_SETTINGS.wideMultiple);
    path.push({
      day,
      narrowLower: narrowAtDay.lower,
      narrowUpper: narrowAtDay.upper,
      wideLower: wideAtDay.lower,
      wideUpper: wideAtDay.upper,
    });
  }
  const end = path[path.length - 1];
  return {
    enough: true,
    lastValue,
    narrow: { lower: end.narrowLower, upper: end.narrowUpper },
    wide: { lower: end.wideLower, upper: end.wideUpper },
    path,
  };
}

const FxBandCalc = { computeDailyChanges, bandRange, hasEnoughForBand, buildBand };

// Node.js（テスト・比較の作業）から require で使えるようにする。ブラウザでは FxBandCalc がそのまま他のファイルから見える
if (typeof module !== "undefined" && module.exports) {
  module.exports = FxBandCalc;
}
