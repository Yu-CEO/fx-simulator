/*
 * similar_calc.js：「似た局面のその後」と「全期間の基準」の集計（仕様 2-4）
 * 主な関数：findSimilarOutcomes（似た局面のその後の動き）、listAllOutcomes（全期間の基準）、
 *           summarizeOutcomes（件数・割合・散らばり）、computeSimilarReport（画面に出す結果をまとめて作る）、isNearBaseline
 * 過去の事実を数えるだけ。方向を要約する文はここでも作らない。画面には触れない。
 * stats_view.js（画面の 03）から使われる。tests/similar_calc.test.js でテストする。
 */

// 「今の動き」を測る日数。20営業日＝約1か月
const SIMILAR_LOOKBACK_DAYS = 20;
// 似ているとみなす範囲。対数の変化で ±0.01（約±1％）
const SIMILAR_TOLERANCE = 0.01;
// 小数の計算の誤差で、ちょうど端の日が外れないようにするための小さな余裕
const SIMILAR_EPSILON = 1e-12;
// これより少ないときは表を出さない（件数が少ないと、たまたまの偏りが大きく見えるため）
const SIMILAR_MIN_COUNT = 30;
// 「全期間とほぼ同じ」とみなす、上がった割合の差（ポイント）。2026-11-18 決定
const NEAR_BASELINE_POINTS = 5;
// 差がちょうど 5.0 のときに、割り算の誤差で外れないための余裕（ポイント）
const NEAR_EPSILON = 1e-9;
// 散らばりとして出す位置（下位10％・真ん中・上位10％）
const QUANTILE_LOW = 0.1;
const QUANTILE_MIDDLE = 0.5;
const QUANTILE_HIGH = 0.9;
const SIMILAR_PERCENT = 100;

/**
 * 日 t の「その後の動き」（h 営業日後の値 ÷ t の値 − 1）を％で返す。
 */
function outcomePct(values, day, horizonDays) {
	return (values[day + horizonDays] / values[day] - 1) * SIMILAR_PERCENT;
}

/**
 * 直近20営業日の動き c＝ln(最終日の値 ÷ 20営業日前の値) を返す。データが足りなければ null。
 */
function currentMove(values) {
	const last = values.length - 1;
	if (last < SIMILAR_LOOKBACK_DAYS) {
		return null;
	}
	return Math.log(values[last] / values[last - SIMILAR_LOOKBACK_DAYS]);
}

/**
 * 似た局面（直近20営業日の動きが c ± 0.01 に入る過去の日 t。後に h 営業日分のデータがある日）の、その後の動きを集める。
 * @returns {number[]}
 */
function findSimilarOutcomes(values, horizonDays) {
	const move = currentMove(values);
	const outcomes = [];
	if (move === null) {
		return outcomes;
	}
	for (let day = SIMILAR_LOOKBACK_DAYS; day + horizonDays < values.length; day++) {
		const pastMove = Math.log(values[day] / values[day - SIMILAR_LOOKBACK_DAYS]);
		if (Math.abs(pastMove - move) <= SIMILAR_TOLERANCE + SIMILAR_EPSILON) {
			outcomes.push(outcomePct(values, day, horizonDays));
		}
	}
	return outcomes;
}

/**
 * 全期間の基準：後に h 営業日分のデータがある日すべて（似ているかを問わない）の、その後の動きを集める。
 * @returns {number[]}
 */
function listAllOutcomes(values, horizonDays) {
	const outcomes = [];
	for (let day = 0; day + horizonDays < values.length; day++) {
		outcomes.push(outcomePct(values, day, horizonDays));
	}
	return outcomes;
}

/**
 * 並べた一覧の q の位置の値を、線形補間（表計算ソフトの PERCENTILE.INC と同じ）で求める。
 * 並べた n 件の (n−1)×q 番目を、前後の値で按分する。
 * 受け取るもの：sorted＝小さい順に並べた1件以上の一覧、quantile＝0〜1（0.1 なら下から10％の位置）。返すもの：その位置の値
 */
function percentileInc(sorted, quantile) {
	const position = (sorted.length - 1) * quantile;
	const lowerIndex = Math.floor(position);
	const upperIndex = Math.ceil(position);
	const fraction = position - lowerIndex;
	return sorted[lowerIndex] + (sorted[upperIndex] - sorted[lowerIndex]) * fraction;
}

/**
 * その後の動きの一覧を、件数・上がった／下がった／変わらなかった（件数と割合）・散らばり5つにまとめる。
 * 上がった＋下がった＋変わらなかった＝件数 になる。
 * @returns {object} { count, upCount・downCount・sameCount, upPct・downPct・samePct, min・low10・middle・high10・max }。
 *   件数が 0 のときは散らばり（min〜max）を null にする
 */
function summarizeOutcomes(outcomes) {
	const count = outcomes.length;
	let upCount = 0;
	let downCount = 0;
	for (const outcome of outcomes) {
		if (outcome > 0) {
			upCount++;
		} else if (outcome < 0) {
			downCount++;
		}
	}
	const sameCount = count - upCount - downCount;
	const summary = {
		count, upCount, downCount, sameCount,
		upPct: shareOf(upCount, count), downPct: shareOf(downCount, count), samePct: shareOf(sameCount, count),
		min: null, low10: null, middle: null, high10: null, max: null,
	};
	if (count === 0) {
		return summary;
	}
	const sorted = outcomes.slice().sort(function (a, b) { return a - b; });
	summary.min = sorted[0];
	summary.low10 = percentileInc(sorted, QUANTILE_LOW);
	summary.middle = percentileInc(sorted, QUANTILE_MIDDLE);
	summary.high10 = percentileInc(sorted, QUANTILE_HIGH);
	summary.max = sorted[count - 1];
	return summary;
}

/** 件数の割合（％）。全体が 0 のときは 0 にする（NaN を出さないため）。 */
function shareOf(part, total) {
	if (total === 0) {
		return 0;
	}
	return (part / total) * SIMILAR_PERCENT;
}

/**
 * 似た局面と全期間の基準で、上がった割合の差が5ポイント以内か（ちょうど 5.0 も含む）。
 * 一致の事実だけを判定する。どちらが多いかは返さない。
 */
function isNearBaseline(similarUpPct, baselineUpPct) {
	return Math.abs(similarUpPct - baselineUpPct) <= NEAR_BASELINE_POINTS + NEAR_EPSILON;
}

/**
 * 画面の 03 に出す結果をまとめて作る。
 * @returns {object} { enough, currentMovePct（直近の動き％。値が足りないとき null）, similar, baseline（どちらも summarizeOutcomes の形）, near }。
 *   enough：似た局面が30件以上あるか（false なら表を出さず件数だけ出す）
 */
function computeSimilarReport(values, horizonDays) {
	const similar = summarizeOutcomes(findSimilarOutcomes(values, horizonDays));
	const baseline = summarizeOutcomes(listAllOutcomes(values, horizonDays));
	const move = currentMove(values);
	let currentMovePct = null;
	if (move !== null) {
		currentMovePct = (Math.exp(move) - 1) * SIMILAR_PERCENT;
	}
	return {
		enough: similar.count >= SIMILAR_MIN_COUNT,
		currentMovePct,
		similar,
		baseline,
		near: isNearBaseline(similar.upPct, baseline.upPct),
	};
}

const FxSimilarCalc = {
	SIMILAR_LOOKBACK_DAYS, SIMILAR_MIN_COUNT, NEAR_BASELINE_POINTS,
	currentMove, findSimilarOutcomes, listAllOutcomes, percentileInc, summarizeOutcomes, isNearBaseline, computeSimilarReport,
};

// Node.js（テスト）から require で使えるようにする（ブラウザでは名前がそのまま見える）
if (typeof module !== "undefined" && module.exports) {
	module.exports = FxSimilarCalc;
}
