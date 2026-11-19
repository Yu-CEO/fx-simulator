/*
 * more_view.js：「くわしく知りたい人へ」の、数字や図が入る3つの畳み（答え合わせの細かい数字・長い期間のグラフ・今と似た動き）を出す（仕様 2-11 ⑤）
 * 主な関数：renderMoreSections、buildBacktestDetailHtml、buildSimilarDetailHtml、buildLongChartHtml（グラフの絵は result_view.js の部品）
 * 文言が決まっている畳み（言葉・注意書き・出どころ）は index.html に直接ある。main.js から使われる。tests/more_view.test.js でテストする。
 */

const MORE_IN_NODE = typeof module !== "undefined" && module.exports;
const MORE_CONFIG = MORE_IN_NODE ? require("./band_config.js") : BAND_CONFIG;
const MORE_STATUS = MORE_IN_NODE ? require("./data_loader.js").statusMessageHtml : statusMessageHtml;
const MORE_STATS = MORE_IN_NODE ? require("./stats_view.js") : { renderBacktest, renderCompareTable, renderSimilar };

// 長い期間のグラフの期間の選び方（営業日と名前）。250営業日＝約1年
const MORE_PERIODS = [{ days: 250, label: "1年" }, { days: 750, label: "3年" }, { days: 2500, label: "10年" }];
const MORE_FIRST_PERIOD_DAYS = 250;  // 最近の分のデータだけで描ける期間（これを超える期間は過去の分を読み終えてから）
// 仕様 2-2・2-4 の常に出す文（文言は変えない）
const MORE_BAND_NOTE = "過去の動きの大きさから作った幅です。予測ではありません。";
const MORE_SIMILAR_NOTE = "過去の事実を数えただけです。重なった期間も別々に数えています。この先が同じになるとは限りません。";

/** 表示の部品（renderXxx）に HTML の文字だけを作らせるための、innerHTML だけを持つ入れ物。 */
function htmlOf(renderPart) {
	const holder = { innerHTML: "" };
	renderPart(holder);
	return holder.innerHTML;
}

/**
 * 「答え合わせの細かい数字」の HTML。
 * 受け取るもの：state＝{band, laterStatus, horizon, backtest（runBacktest の結果。laterStatus が "ok" のとき）, compareData}
 */
function buildBacktestDetailHtml(state) {
	if (!state.band.enough) {
		return '<p>データが足りないため、答え合わせができません。</p>';
	}
	if (state.laterStatus !== "ok") {
		return MORE_STATUS(state.laterStatus, "過去約10年分で答え合わせをしています");
	}
	const label = MORE_CONFIG.horizonLabels[state.horizon];
	return htmlOf(function (holder) { MORE_STATS.renderBacktest(holder, state.backtest, label); })
		+ htmlOf(function (holder) { MORE_STATS.renderCompareTable(holder, state.compareData, state.horizon); });
}

/**
 * 「今と似た動きのあと、どうなった？」の HTML（見出し・何を数えたかの説明・表・％の例・常に出す文）。
 * 受け取るもの：state＝{band, laterStatus, horizon, similar（computeSimilarReport の結果。laterStatus が "ok" のとき）}
 */
function buildSimilarDetailHtml(state) {
	const label = MORE_CONFIG.horizonLabels[state.horizon];
	let html = "<p><b>似た局面のその後（過去の集計。この先を示すものではありません）</b></p>"
		+ "<p>直近1か月と同じくらい動いた日（±1％くらい）を過去から探して、その" + label
		+ "後にどれだけ動いたかを数えました。右の列は、似ているかに関係なく、すべての日で数えたものです。</p>";
	if (!state.band.enough) {
		return html + "<p>データが足りないため、表示しません。</p>";
	}
	if (state.laterStatus !== "ok") {
		return html + MORE_STATUS(state.laterStatus, "過去約10年分から探しています");
	}
	html += htmlOf(function (holder) { MORE_STATS.renderSimilar(holder, state.similar, state.horizon); });
	if (state.similar.enough) {
		html += '<p class="note-line">％の例：−3.0％は、150円が145.50円になったということです。</p>';
	}
	return html + '<p class="note-line">' + MORE_SIMILAR_NOTE + '<span class="tag">当サイトで計算</span></p>';
}

/**
 * 「長い期間のグラフ」の HTML（期間のボタン・グラフ・凡例・常に出す文）。
 * 受け取るもの：state＝{band, laterStatus, horizon, period, recent, full}（recent・full は {values}。full は読み終えたときだけ入る）
 */
function buildLongChartHtml(state) {
	if (!state.band.enough) {
		return "<p>データが足りないため、グラフを作れません。</p>";
	}
	const label = MORE_CONFIG.horizonLabels[state.horizon];
	let buttons = "";
	for (const period of MORE_PERIODS) {
		buttons += '<button type="button" data-p="' + period.days + '" aria-pressed="' + (period.days === state.period) + '">' + period.label + "</button>";
	}
	let chart = '<div class="chart" id="chart">' + buildLongChartSvg(state, label) + "</div>";
	if (state.period > MORE_FIRST_PERIOD_DAYS && state.laterStatus !== "ok") {
		chart = MORE_STATUS(state.laterStatus, "過去のデータを読み込んでいます");
	}
	return "<p>右の色の部分は、今日から" + label + "先までの幅です（上の「どのくらい先？」と連動）。</p>"
		+ '<div class="seg period" role="group" aria-label="グラフの期間">' + buttons + "</div>" + chart
		+ '<ul class="legend" aria-label="グラフの見方"><li><span class="sw line"></span>これまでの値</li>'
		+ '<li><span class="sw narrow"></span>よくある幅</li><li><span class="sw wide"></span>まれな幅</li>'
		+ '<li><span class="sw dash"></span>データの最終日（ここから先は幅）</li></ul>'
		+ '<p class="note-line">' + MORE_BAND_NOTE + '<span class="tag">当サイトで計算</span></p>';
}

/** 長い期間のグラフの絵（SVG）。データが無いとき（テスト・読み込み待ち）は空の文字を返す。受け取るもの：state、label＝先の長さの名前 */
function buildLongChartSvg(state, label) {
	const data = state.period > MORE_FIRST_PERIOD_DAYS ? state.full : state.recent;
	if (!data) {
		return "";
	}
	const period = MORE_PERIODS.find(function (item) { return item.days === state.period; });
	// result_view.js は別の流れで読むので、使う時点で取り出す
	const resultView = MORE_IN_NODE ? require("./result_view.js") : FxResultView;
	return resultView.buildChartSvg(data.values, state.band, label, state.period, "米ドル／円の過去" + period.label);
}

/**
 * 3つの畳みを出す。
 * 受け取るもの：containers＝{backtest, long, similar}（出す場所）、state＝上の3つの関数の state をまとめたもの
 */
function renderMoreSections(containers, state) {
	containers.backtest.innerHTML = buildBacktestDetailHtml(state);
	containers.long.innerHTML = buildLongChartHtml(state);
	containers.similar.innerHTML = buildSimilarDetailHtml(state);
}

const FxMoreView = { renderMoreSections, buildBacktestDetailHtml, buildSimilarDetailHtml, buildLongChartHtml };

// Node.js（テスト）から require で使えるようにする（ブラウザでは名前がそのまま見える）
if (MORE_IN_NODE) {
	module.exports = FxMoreView;
}
