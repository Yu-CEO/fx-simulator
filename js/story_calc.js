/*
 * story_calc.js：今日の図に出す数字（3つの金額・1か月前の帯とその答え合わせの判定・通算）を作る計算（仕様 2-8）。画面には触れない
 * 主な関数：buildStoryModelFromRecent（サイトも縦動画もこれで作る）、buildStoryModel、judgeAgainstBands、pickStoryInputs（旅行代の計算は band_calc.js）
 * 帯は band_calc.js の buildBand をそのまま使う。story_draw.js・story_view.js・tools/video/ から使われる。tests/story_calc.test.js でテストする。
 */

// ブラウザでは先に読んだ名前を、Node.js では require で読む
const IS_NODE_FOR_STORY = typeof module !== "undefined" && module.exports;
const STORY_CALC_CONFIG = IS_NODE_FOR_STORY ? require("./story_config.js") : STORY_CONFIG;
const STORY_BAND_CONFIG = IS_NODE_FOR_STORY ? require("./band_config.js") : BAND_CONFIG;
const STORY_BAND_CALC = IS_NODE_FOR_STORY ? require("./band_calc.js") : FxBandCalc;
const STORY_CALC_FORMAT = IS_NODE_FOR_STORY ? require("./format.js") : { formatDateNumber };


// 今日の図を作れない理由（作る作らないの判断とログに使う）
const STORY_REASONS = {
	dataShort: "data_short",   // 値の件数が足りない（1か月前の帯が作れない）
	noState: "no_state",       // 帯の最終日の状態が無い・古い
	noBase: "no_base",         // 今日の図の基準（1か月前の状態・通算）が無い・古い
};

/**
 * 今日の図に必要な値の件数を返す（帯に要る251件＋先の長さ20件）。
 * 返すもの：例：271
 */
function requiredValueCount() {
	return STORY_BAND_CONFIG.windowDays + 1 + STORY_CALC_CONFIG.horizonDays;
}

/**
 * 実際の値が、狭い帯・広い帯のどこに入ったかを3通りで答える（最後の値だけで決める）。ちょうど端の値は「中」。
 * 受け取るもの：actual＝最終日の値、narrow・wide＝{lower, upper}。
 * 返すもの："narrow"（狭い帯の中）・"wide"（広い帯の中で狭い帯の外）・"out"（帯の外）
 */
function judgeAgainstBands(actual, narrow, wide) {
	const shown = STORY_BAND_CALC.toShownRate(actual);
	if (isInsideShown(shown, narrow)) {
		return "narrow";
	}
	if (isInsideShown(shown, wide)) {
		return "wide";
	}
	return "out";
}

/** 画面の形にそろえた値 shownValue が、帯 range（これも画面の形にそろえる）の中にあるか。 */
function isInsideShown(shownValue, range) {
	return shownValue >= STORY_BAND_CALC.toShownRate(range.lower) && shownValue <= STORY_BAND_CALC.toShownRate(range.upper);
}

/**
 * 今日の図に使う帯づくりの追加の設定を、データから取り出す。
 * 方法④のように「最終日の状態」を使う方法では、tools/add_band_state.js が全期間で作った状態を使う（古い状態は使わない）。
 * 受け取るもの：method＝採用した方法の部品、recent＝FX_DATA_RECENT（usdjpy_recent.js の中身）
 * 返すもの：{ok:true, currentOptions, monthAgoOptions, backtest} または {ok:false, reason}（STORY_REASONS のどれか）
 */
function pickStoryInputs(method, recent) {
	const base = recent.storyBase;
	if (!base || base.lastDate !== recent.lastDate || !base.backtest) {
		return { ok: false, reason: STORY_REASONS.noBase };
	}
	if (!method.stateKey) {
		return { ok: true, currentOptions: undefined, monthAgoOptions: undefined, backtest: base.backtest };
	}
	const saved = recent.bandState;
	if (!saved || saved.lastDate !== recent.lastDate || !base.monthAgoState) {
		return { ok: false, reason: STORY_REASONS.noState };
	}
	const currentOptions = {};
	currentOptions[method.stateKey] = saved.state;
	const monthAgoOptions = {};
	monthAgoOptions[method.stateKey] = base.monthAgoState;
	return { ok: true, currentOptions, monthAgoOptions, backtest: base.backtest };
}

/**
 * 3つの金額を作る。使う帯は設定（amountBand）で決まる。
 * 受け取るもの：band＝buildBand の結果、lastValue＝最終日の値（円）。旅行代は「いま10万円」（画面に出す小数第2位の値で円に直す）
 * 返すもの：{weak＝円安の場合, now＝今のレートのまま, strong＝円高の場合（どれも100円単位）, bandRange＝使った帯の範囲}
 */
function buildAmounts(band, lastValue) {
	const range = band[STORY_CALC_CONFIG.amountBand];
	return {
		weak: STORY_BAND_CALC.tripAmountYen(range.upper, lastValue),
		now: STORY_BAND_CALC.tripAmountYen(lastValue, lastValue),
		strong: STORY_BAND_CALC.tripAmountYen(range.lower, lastValue),
		bandRange: { lower: range.lower, upper: range.upper },
	};
}

/**
 * 今日の図の数字をまとめて作る。
 * 受け取るもの：input＝{values（日々の値・古い順）, dates, lastDate, method, currentOptions, monthAgoOptions, backtest（{total, outsideNarrowPct}）}
 * 返すもの：作れないときは {ok:false, reason}。作れるときは
 *   {ok:true, lastDate, lastValue, values, dates, monthAgoIndex, monthAgo（1か月前の帯）, current（最終日の帯）, judge, tripYen（旅行代・円）, amounts, backtest}
 */
function buildStoryModel(input) {
	const values = input.values;
	if (values.length < requiredValueCount()) {
		return { ok: false, reason: STORY_REASONS.dataShort };
	}
	const horizonDays = STORY_CALC_CONFIG.horizonDays;
	const monthAgoIndex = values.length - 1 - horizonDays;
	// 1か月前の帯は、その日までのデータだけで作る（それより後の値は渡さない）
	const monthAgoBand = STORY_BAND_CALC.buildBand(values.slice(0, monthAgoIndex + 1), input.method, horizonDays, input.monthAgoOptions);
	const currentBand = STORY_BAND_CALC.buildBand(values, input.method, horizonDays, input.currentOptions);
	if (!monthAgoBand.enough || !currentBand.enough) {
		return { ok: false, reason: STORY_REASONS.dataShort };
	}
	const lastValue = values[values.length - 1];
	return {
		ok: true,
		lastDate: input.lastDate,
		lastValue,
		values,
		dates: input.dates,
		monthAgoIndex,
		monthAgo: monthAgoBand,
		current: currentBand,
		judge: judgeAgainstBands(lastValue, monthAgoBand.narrow, monthAgoBand.wide),
		tripYen: STORY_BAND_CONFIG.tripYen,
		amounts: buildAmounts(currentBand, lastValue),
		backtest: input.backtest,
	};
}

/**
 * 画面用データ（usdjpy_recent.js）から今日の図の数字を作る。サイトと縦動画が同じこの関数を使うので、数字がずれない。
 * 受け取るもの：method＝採用した方法の部品、recent＝FX_DATA_RECENT
 * 返すもの：buildStoryModel の結果（基準が古い・無いときも {ok:false, reason}）
 */
function buildStoryModelFromRecent(method, recent) {
	const inputs = pickStoryInputs(method, recent);
	if (!inputs.ok) {
		return { ok: false, reason: inputs.reason };
	}
	return buildStoryModel({
		values: recent.values,
		dates: recent.dates.map(STORY_CALC_FORMAT.formatDateNumber),
		lastDate: recent.lastDate,
		method,
		currentOptions: inputs.currentOptions,
		monthAgoOptions: inputs.monthAgoOptions,
		backtest: inputs.backtest,
	});
}

const FxStoryCalc = {
	requiredValueCount, judgeAgainstBands,
	pickStoryInputs, buildStoryModel, buildStoryModelFromRecent, STORY_REASONS,
};

// Node.js（テスト）から require で使えるようにする（ブラウザでは名前がそのまま見える）
if (IS_NODE_FOR_STORY) {
	module.exports = FxStoryCalc;
}
