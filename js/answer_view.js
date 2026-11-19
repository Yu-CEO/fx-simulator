/*
 * answer_view.js：ページ上部の「答えの箱」を出す（仕様 2-11 ①）。先の長さは1か月で固定。
 * 主な関数：buildAnswerHtml、renderAnswer、renderAnswerMessage（足りない・読み込めない日の文）、formatAsOfDate
 * 旅行代は band_calc.js の計算。先の値を当てる言い方は使わない（仕様 2-6）。main.js から使われる。tests/answer_view.test.js でテストする。
 */

const ANSWER_IN_NODE = typeof module !== "undefined" && module.exports;
const ANSWER_FORMAT = ANSWER_IN_NODE ? require("./format.js") : { formatYen, formatCount, formatManYen };
const ANSWER_CALC = ANSWER_IN_NODE ? require("./band_calc.js") : FxBandCalc;
const ANSWER_CONFIG = ANSWER_IN_NODE ? require("./band_config.js") : BAND_CONFIG;

const ANSWER_HALF_DIGITS = 1;  // 「上下に約5.0円」の小数の桁

/** 帯の端の値を「145.00〜155.00」の形（円の字なし）にする。大きな数字のあとに小さな「円」を付けるため。 */
function plainRange(range) {
	return range.lower.toFixed(2) + "〜" + range.upper.toFixed(2);
}

/** 旅行代の範囲を「96,700〜103,300」の形（円の字なし）にする。受け取るもの：range＝帯、lastValue＝最終日の値 */
function tripRangeText(range, lastValue) {
	const amounts = ANSWER_CALC.tripAmountRange(range, lastValue);
	return ANSWER_FORMAT.formatCount(amounts.lower) + "〜" + ANSWER_FORMAT.formatCount(amounts.upper);
}

/**
 * 答えの箱の HTML を作る。
 * 受け取るもの：band＝1か月の buildBand の結果（enough が true のもの）
 * 返すもの：HTML の文字。例：「145.00〜155.00円」「上下に約5.0円」「だいたい 96,700〜103,300円」が入る
 */
function buildAnswerHtml(band) {
	const rate = ANSWER_CALC.toShownRate;
	const narrow = { lower: rate(band.narrow.lower), upper: rate(band.narrow.upper) };
	const wide = { lower: rate(band.wide.lower), upper: rate(band.wide.upper) };
	const last = rate(band.lastValue);
	const half = ((narrow.upper - narrow.lower) / 2).toFixed(ANSWER_HALF_DIGITS);
	const trip = ANSWER_FORMAT.formatManYen(ANSWER_CONFIG.tripYen);
	return '<div class="answer">'
		+ '<p class="ans-lab">これまでの動き方だと、1か月で動く幅は だいたい</p>'
		+ '<p class="ans-big num">' + plainRange(narrow) + "<small>円</small></p>"
		+ '<p class="ans-sub">今日の <b class="num">' + ANSWER_FORMAT.formatYen(last) + "</b> から上下に約" + half
		+ "円。3回に2回くらいは、この中に入ってきました（<b>よくある幅</b>）。</p>"
		+ '<div class="ans-trip"><p class="ans-lab">ドル払いの旅行代が いま' + trip + "なら</p>"
		+ '<p class="trip-big num">だいたい ' + tripRangeText(narrow, last) + "円</p></div>"
		+ '<p class="ans-rare">まれな幅（20回に19回くらいはこの中）：<span class="num">' + plainRange(wide) + "円</span>・旅行代 <span class=\"num\">"
		+ tripRangeText(wide, last) + "円</span></p></div>";
}

/**
 * データが足りない日・読み込めない日の文の HTML を返す。
 * 受け取るもの：kind＝"short"（足りない）か "fatal"（読み込めない）
 */
function buildAnswerMessageHtml(kind) {
	if (kind === "fatal") {
		return '<div class="hero-msg" role="alert">データを読み込めませんでした。<br>時間をおいて、ページを開き直してください。<br>'
			+ '<button type="button" class="btn" data-act="reload">開き直す</button></div>';
	}
	return '<div class="hero-msg" role="status">データが足りないため、幅を作れません（約1年分のデータが必要です）。<br>自動で毎朝データを足しています。</div>';
}

/** 「○月○日の値・毎朝更新」の文を返す。受け取るもの：isoDate＝"2026-11-17" など。例：「11月17日の値・毎朝更新」 */
function formatAsOfDate(isoDate) {
	const parts = isoDate.split("-");
	return Number(parts[1]) + "月" + Number(parts[2]) + "日の値・毎朝更新";
}

/**
 * 答えの箱を出す（作れない日は決まった文を出す）。
 * 受け取るもの：container＝出す場所、band＝buildBand の結果（enough が false なら「足りない」の文）
 */
function renderAnswer(container, band) {
	container.innerHTML = band.enough ? buildAnswerHtml(band) : buildAnswerMessageHtml("short");
}

/** 読み込めない日の文を出す。受け取るもの：container＝出す場所 */
function renderAnswerMessage(container) {
	container.innerHTML = buildAnswerMessageHtml("fatal");
}

const FxAnswerView = { buildAnswerHtml, buildAnswerMessageHtml, renderAnswer, renderAnswerMessage, formatAsOfDate };

// Node.js（テスト）から require で使えるようにする（ブラウザでは名前がそのまま見える）
if (ANSWER_IN_NODE) {
	module.exports = FxAnswerView;
}
