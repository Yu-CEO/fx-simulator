/*
 * band_backtest_calc.js：帯の答え合わせの計算（仕様 2-3・2-2a）
 * 過去の各日 t で、2-2 と同じ作り方の帯を作り、h 営業日後の実際の値が帯の外に出た割合を数える。
 * 主な関数：listBacktestDays（答え合わせに使う日）、runBacktest（答え合わせ）、methodScaleForDay（方法の部品から「その日の S(h)」を作る）
 * 画面には触れない。stats_view.js（画面の 02）と tools/compare_band_methods.js から使われる。tests/band_backtest_calc.test.js でテストする。
 */

// ブラウザでは先に読んだ名前を、Node.js では require で読む
const BACKTEST_SETTINGS = (typeof module !== "undefined" && module.exports) ? require("./band_config.js") : BAND_CONFIG;
const BACKTEST_BAND = (typeof module !== "undefined" && module.exports) ? require("./band_calc.js") : FxBandCalc;
// 割合を％にする倍率
const PERCENT = 100;

/**
 * 答え合わせに使う日 t の一覧を作る。その日より前に250営業日分（250個の変化）、後に h 営業日分のデータがある日すべて。
 * @returns {number[]}
 */
function listBacktestDays(valueCount, horizonDays) {
	const days = [];
	for (let day = BACKTEST_SETTINGS.windowDays; day + horizonDays < valueCount; day++) {
		days.push(day);
	}
	return days;
}

// 推定が要る方法（③GARCH・④カルマン）が、推定をやり直す間隔（営業日）。250営業日＝約1年ごと（仕様 2-2a）
const REESTIMATE_DAYS = BACKTEST_SETTINGS.windowDays;

/**
 * 方法の部品から「その日 t の S(h)」を返す関数を作る。t より後の変化は渡さない（未来のデータを使わないため）。
 * 推定が要る方法（estimate を持つもの）は、推定を「その日より前の変化だけ」で行い、250営業日ごとにやり直す。
 * 推定した値は覚えておき、同じ区切りの日では使い回す（推定は重いため）。画面と tools/compare_band_methods.js が同じ結果になる。
 * 受け取るもの：method＝方法の部品（computeScale を持つ。推定が要る方法は estimate・optionKey〈推定した値を渡すときの名前〉も持つ）
 * @returns {function(number[], number, number): number} (変化の一覧, t, h) → その日の S(h)
 */
function methodScaleForDay(method) {
	const estimatedByStart = new Map();
	return function (changes, day, horizonDays) {
		// values[day] までの変化は changes[0]〜changes[day−1]
		const known = changes.slice(0, day);
		if (typeof method.estimate !== "function") {
			return method.computeScale(known, horizonDays);
		}
		const start = BACKTEST_SETTINGS.windowDays + Math.floor((day - BACKTEST_SETTINGS.windowDays) / REESTIMATE_DAYS) * REESTIMATE_DAYS;
		if (!estimatedByStart.has(start)) {
			estimatedByStart.set(start, method.estimate(changes.slice(0, start)));
		}
		const options = {};
		options[method.optionKey] = estimatedByStart.get(start);
		return method.computeScale(known, horizonDays, options);
	};
}

/**
 * 帯の答え合わせをする。
 * 受け取るもの：values＝日々の値（古い順）、horizonDays＝先の長さ、scaleForDay＝methodScaleForDay で作った関数、
 *   days＝答え合わせをする日の番号の一覧（省略可。省略すると使える日すべて。比較の作業で日をそろえるときに渡す）
 * @returns {{total:number, outsideNarrowCount:number, outsideWideCount:number, outsideNarrowPct:number, outsideWidePct:number,
 *            insideNarrowPct:number, insideWidePct:number, meanNarrowWidthPct:number}}
 *   meanNarrowWidthPct は「狭い帯の上端と下端の差 ÷ その日の値」の％の平均（帯の平均の広さ）
 */
function runBacktest(values, horizonDays, scaleForDay, days) {
	const changes = BACKTEST_BAND.computeDailyChanges(values);
	let checkDays = days;
	if (!checkDays) {
		checkDays = listBacktestDays(values.length, horizonDays);
	}
	let outsideNarrowCount = 0;
	let outsideWideCount = 0;
	let widthSum = 0;
	for (const day of checkDays) {
		const scale = scaleForDay(changes, day, horizonDays);
		const narrow = BACKTEST_BAND.bandRange(values[day], scale, BACKTEST_SETTINGS.narrowMultiple);
		const wide = BACKTEST_BAND.bandRange(values[day], scale, BACKTEST_SETTINGS.wideMultiple);
		const actual = values[day + horizonDays];
		if (isOutside(actual, narrow)) {
			outsideNarrowCount++;
		}
		if (isOutside(actual, wide)) {
			outsideWideCount++;
		}
		widthSum += ((narrow.upper - narrow.lower) / values[day]) * PERCENT;
	}
	return summarizeBacktest(checkDays.length, outsideNarrowCount, outsideWideCount, widthSum);
}

/**
 * 値が帯の外にあるかを調べる。ちょうど端の値は「中」とする。
 */
function isOutside(actual, range) {
	return actual < range.lower || actual > range.upper;
}

/**
 * 数えた件数を、％にまとめる。日が1つもないときは、すべて 0 にする（NaN を出さないため）。
 */
function summarizeBacktest(total, outsideNarrowCount, outsideWideCount, widthSum) {
	if (total === 0) {
		return {
			total: 0, outsideNarrowCount: 0, outsideWideCount: 0, outsideNarrowPct: 0, outsideWidePct: 0,
			insideNarrowPct: 0, insideWidePct: 0, meanNarrowWidthPct: 0,
		};
	}
	const outsideNarrowPct = (outsideNarrowCount / total) * PERCENT;
	const outsideWidePct = (outsideWideCount / total) * PERCENT;
	return {
		total,
		outsideNarrowCount,
		outsideWideCount,
		outsideNarrowPct,
		outsideWidePct,
		insideNarrowPct: PERCENT - outsideNarrowPct,
		insideWidePct: PERCENT - outsideWidePct,
		meanNarrowWidthPct: widthSum / total,
	};
}

const FxBacktestCalc = { listBacktestDays, methodScaleForDay, runBacktest };

// Node.js（テスト）から require で使えるようにする（ブラウザでは名前がそのまま見える）
if (typeof module !== "undefined" && module.exports) {
	module.exports = FxBacktestCalc;
}
