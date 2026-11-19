/*
 * result_view.js：「長さを変えて、グラフで見る」の結果カード（仕様 2-11 ③）。グラフの絵は今日の図と同じ story_chart.js（中心の線は描かない）
 * 主な関数：buildResultHtml、renderResult、buildChartSvg（過去の値＋幅のグラフ。くわしくの長い期間のグラフにも使う）、buildCheckHtml、buildReadingText（読み方の一言）
 * main.js・more_view.js から使われる。tests/result_view.test.js でテストする。
 */

const RESULT_IN_NODE = typeof module !== "undefined" && module.exports;
const RESULT_FORMAT = RESULT_IN_NODE ? require("./format.js") : { formatYen, formatPct, formatCount, formatManYen };
const RESULT_CALC = RESULT_IN_NODE ? require("./band_calc.js") : FxBandCalc;
const RESULT_STORY_CONFIG = RESULT_IN_NODE ? require("./story_config.js") : STORY_CONFIG;
const RESULT_SVG = RESULT_IN_NODE ? require("./story_svg.js") : FxStorySvg;
const RESULT_CHART = RESULT_IN_NODE ? require("./story_chart.js") : FxStoryChart;
const RESULT_CONFIG = RESULT_IN_NODE ? require("./band_config.js") : BAND_CONFIG;

// グラフの大きさ（図の中の座標）。幅280は、スマホ幅360pxの結果カードの中（約290px）でほぼ等倍になり、文字が13px未満にならない大きさ
const RESULT_CHART_SIZE = { width: 280, height: 230, leftMargin: 36, rightMargin: 74, fontSize: 13 };
const RESULT_PAST_DAYS = 60;  // グラフに出す過去の日数（直近約3か月）
const RESULT_HALF_DIGITS = 1;  // 「上下に約5.0円」の小数の桁（答えの箱と同じ）
const RESULT_SHORT_NOTE = "過去の動きの大きさから作った幅です。予測ではありません。売買の判断には使えません。";  // 仕様 2-2（短い1行）

/**
 * 読み方の一言を作る。
 * 受け取るもの：horizonLabel＝"1週間"〜"1か月"、narrow＝よくある幅 {lower, upper}、lastValue＝最終日の値
 * 返すもの：文の文字。上下の幅＝（上端−下端）÷2（小数第1位）、旅行代の差＝よくある幅の旅行代の（上端−下端）÷2（100円単位）
 */
function buildReadingText(horizonLabel, narrow, lastValue) {
	const rate = RESULT_CALC.toShownRate;
	const shown = { lower: rate(narrow.lower), upper: rate(narrow.upper) };
	const half = ((shown.upper - shown.lower) / 2).toFixed(RESULT_HALF_DIGITS);
	const difference = RESULT_CALC.tripHalfDifference(shown, lastValue);
	return horizonLabel + "でも、1ドルが上下に約" + half + "円動くのは「よくあること」。"
		+ RESULT_FORMAT.formatManYen(RESULT_CONFIG.tripYen) + "の旅行代なら、約" + RESULT_FORMAT.formatCount(difference) + "円の差になります。";
}

/** 範囲 {lower, upper} を「145.00〜155.00円」の形にする。受け取るもの：range＝帯 */
function resultRangeText(range) {
	return RESULT_CALC.toShownRate(range.lower).toFixed(2) + "〜" + RESULT_CALC.toShownRate(range.upper).toFixed(2) + "円";
}

/** 結果の1行（名前・数字・旅行代）の HTML。受け取るもの：name＝見出し、help＝小さな補足、range＝帯、lastValue＝最終日の値 */
function buildResultRow(name, help, range, lastValue) {
	const amounts = RESULT_CALC.tripAmountRange(range, RESULT_CALC.toShownRate(lastValue));
	return '<div class="res-row"><p class="res-name">' + name + "<span>" + help + "</span></p>"
		+ '<p class="res-val num">' + resultRangeText(range) + "</p>"
		+ '<p class="res-trip">ドル払いの旅行代が いま' + RESULT_FORMAT.formatManYen(RESULT_CONFIG.tripYen) + 'なら <span class="num">'
		+ RESULT_FORMAT.formatCount(amounts.lower) + "〜" + RESULT_FORMAT.formatCount(amounts.upper) + "円</span></p></div>";
}

/**
 * 過去の値＋この先の幅のグラフ（SVG）を作る。結果カード（直近約3か月）と、くわしくの長い期間のグラフで同じ部品を使う。
 * 受け取るもの：values＝日々の値（古い順）、band＝buildBand の結果、horizonLabel＝"1か月" など、pastDays＝グラフに出す過去の日数（省略で約3か月）、
 *   periodLabel＝読み上げ用の期間名（省略で「直近約3か月」）。返すもの：<svg> の文字
 */
function buildChartSvg(values, band, horizonLabel, pastDays, periodLabel) {
	const size = RESULT_CHART_SIZE;
	const lastIndex = values.length - 1;
	const box = { x: 0, y: 0, width: size.width, height: size.height, leftMargin: size.leftMargin, rightMargin: size.rightMargin };
	const inner = RESULT_CHART.drawStoryChart(box, {
		values, fromIndex: lastIndex - Math.min(pastDays || RESULT_PAST_DAYS, lastIndex), fanIndex: lastIndex, band,
		pastProgress: 1, fanProgress: 1, actualProgress: 0, labelOpacity: 1, labelKind: "band", fontSize: size.fontSize,
	});
	const label = (periodLabel || "直近約3か月") + "の値と、" + horizonLabel + "先までの幅（よくある幅・まれな幅）";
	return '<svg viewBox="0 0 ' + size.width + " " + size.height + '" role="img" aria-label="' + label + '">'
		+ RESULT_SVG.svgRect(0, 0, size.width, size.height, RESULT_STORY_CONFIG.colors.background, 0) + inner + "</svg>";
}

/** 割合の棒1本の HTML。受け取るもの：label＝名前、percent＝中に入った割合（％）、help＝「3回に2回くらい」 */
function buildMeterRow(label, percent, help) {
	return '<div class="bar-row">' + label + "：<b class=\"num\">" + RESULT_FORMAT.formatPct(percent) + "</b>（" + help + '）'
		+ '<div class="meter"><i style="width:' + percent.toFixed(1) + '%"></i></div></div>';
}

/**
 * 「この幅に、本当に入ってきた？」の中身の HTML。
 * 受け取るもの：check＝{status: "loading"・"fail"・"ok", result（runBacktest の結果。ok のとき）}、horizonLabel＝"1か月" など
 */
function buildCheckHtml(check, horizonLabel) {
	if (check.status === "loading") {
		return '<div class="msg" role="status">答え合わせを計算中…（過去のデータを読み込んでいます）</div>';
	}
	if (check.status === "fail") {
		return '<div class="msg" role="alert">過去のデータを読み込めませんでした。上の幅はそのまま見られます。<br>'
			+ '<button type="button" class="btn" data-act="retry">もう一度読み込む</button></div>';
	}
	const result = check.result;
	if (result.total === 0) {
		return '<div class="msg">データが足りないため、答え合わせができません。</div>';
	}
	return "<p>これまで <b class=\"num\">" + RESULT_FORMAT.formatCount(result.total) + "</b> 回、同じ作り方で幅を作って" + horizonLabel + "後を見ると：</p>"
		+ '<div class="bars">' + buildMeterRow("よくある幅の中に入った", result.insideNarrowPct, "3回に2回くらい")
		+ buildMeterRow("まれな幅の中に入った", result.insideWidePct, "20回に19回くらい") + "</div>"
		+ '<p class="note-line">外に出ることもあります。細かい数字と計算方法の比べ方は、下の「くわしく知りたい人へ」にあります。</p>';
}

/**
 * 結果カードの HTML を作る。
 * 受け取るもの：input＝{band, values, horizonLabel, check}。band が足りないとき（enough が false）は理由の文だけ
 */
function buildResultHtml(input) {
	const band = input.band;
	if (!band.enough) {
		return '<div class="msg">データが足りないため、幅を作れません（約1年分のデータが必要です）。</div>';
	}
	const label = input.horizonLabel;
	return buildResultRow(label + "後の よくある幅", "3回に2回くらいはこの中", band.narrow, band.lastValue)
		+ buildResultRow(label + "後の まれな幅", "20回に19回くらいはこの中", band.wide, band.lastValue)
		+ '<div class="chart">' + buildChartSvg(input.values, band, label) + "</div>"
		+ '<ul class="legend" aria-label="グラフの見方"><li><span class="sw line"></span>これまでの値</li>'
		+ '<li><span class="sw narrow"></span>よくある幅</li><li><span class="sw wide"></span>まれな幅</li></ul>'
		+ '<p class="reading"><span class="r-lab">読み方</span>' + buildReadingText(label, band.narrow, band.lastValue) + "</p>"
		+ '<p class="note-line">' + RESULT_SHORT_NOTE + '<span class="tag">当サイトで計算</span></p>'
		+ '<div class="check"><h3>この幅に、本当に入ってきた？</h3>' + buildCheckHtml(input.check, label) + "</div>";
}

/** 結果カードを出す。受け取るもの：container＝出す場所、input＝buildResultHtml と同じ */
function renderResult(container, input) {
	container.innerHTML = buildResultHtml(input);
}

const FxResultView = { buildResultHtml, buildCheckHtml, buildChartSvg, buildReadingText, renderResult, RESULT_SHORT_NOTE };

// Node.js（テスト）から require で使えるようにする（ブラウザでは名前がそのまま見える）
if (RESULT_IN_NODE) {
	module.exports = FxResultView;
}
