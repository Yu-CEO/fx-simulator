/*
 * band_calc.js：日々の変化と、採用した方法の S(h) から「動く幅（帯）」を作る計算（仕様 2-2）と、旅行代（いま10万円）の円への換算
 * 主な関数：computeDailyChanges、bandRange、buildBand、tripAmountYen・tripAmountRange・tripHalfDifference
 * 帯の真ん中は常に最終日の値。向きや傾きは入れない。画面には触れない。tests/band_calc.test.js・tests/trip_calc.test.js でテストする。
 */

// ブラウザでは先に読んだ名前を、Node.js では require で読む
const BAND_CALC_SETTINGS = (typeof module !== "undefined" && module.exports) ? require("./band_config.js") : BAND_CONFIG;

/**
 * 日々の変化（対数）の一覧を作る。変化＝ln(今日の値 ÷ 前の営業日の値)。
 * @param {number[]} values 日々の値（古い順）
 * @returns {number[]} 変化の一覧（values より1つ少ない）。changes[i] は values[i] から values[i+1] への変化
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

const CENTS_PER_YEN = 100;     // 円→銭。画面に出す小数第2位の値で計算するため（答えの数字と旅行代がずれないように）
const ROUNDING_GUARD = 1e-9;   // 四捨五入の直前に足す小さな数。2進数の誤差で 1523.4999… と切り下がるのを防ぐ

/** 値を画面に出す形（小数第2位）にそろえる。例：toShownRate(145.004) // 145 */
function toShownRate(value) {
	return Math.round(value * CENTS_PER_YEN + ROUNDING_GUARD) / CENTS_PER_YEN;
}

/** 円の金額を設定の単位（100円）で四捨五入する。例：roundTripYen(106666.7) // 106700 */
function roundTripYen(amountYen) {
	const unit = BAND_CALC_SETTINGS.roundYenUnit;
	return Math.round(amountYen / unit + ROUNDING_GUARD) * unit;
}

/**
 * 旅行代（いま○円ぶんのドル）を、あるレートのときの円にして100円単位に丸める。
 * @param {number} rate 帯の端など、円にするときのレート（1ドルあたりの円）
 * @param {number} lastValue 最終日の値（「いま」のレート）
 * @returns {number} 円（100円単位）。「いま」のレートなら設定の旅行代と同じ
 */
function tripAmountYen(rate, lastValue) {
	return roundTripYen(BAND_CALC_SETTINGS.tripYen * toShownRate(rate) / toShownRate(lastValue));
}

/** 帯 {lower, upper} の両端の旅行代を {lower, upper} で返す。例：tripAmountRange({lower:145, upper:155}, 150) // {lower:96700, upper:103300} */
function tripAmountRange(range, lastValue) {
	return { lower: tripAmountYen(range.lower, lastValue), upper: tripAmountYen(range.upper, lastValue) };
}

/** 帯の旅行代の（上端−下端）÷2 を100円単位で返す（「約3,300円の差」）。例：tripHalfDifference({lower:145, upper:155}, 150) // 3300 */
function tripHalfDifference(range, lastValue) {
	const amounts = tripAmountRange(range, lastValue);
	return roundTripYen((amounts.upper - amounts.lower) / 2);
}

const FxBandCalc = {
	computeDailyChanges, bandRange, hasEnoughForBand, buildBand, toShownRate, roundTripYen, tripAmountYen, tripAmountRange, tripHalfDifference,
};

// Node.js（テスト）から require で使えるようにする（ブラウザでは名前がそのまま見える）
if (typeof module !== "undefined" && module.exports) {
	module.exports = FxBandCalc;
}
