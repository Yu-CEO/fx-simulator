/*
 * story_draw.js：今日の図の1コマを描く（「時刻 t を渡すと、その瞬間の絵を返す」作り。仕様 2-8）
 * 主な関数：drawStoryFrame（時刻 t・配置・数字から SVG の文字を返す）、buildAltText（読み上げ用の説明）、formatAsOf（「○月○日時点」）
 * サイト（story_view.js）と縦動画（tools/video/）が同じこの関数を使うので、数字も文言も同じ。場面は ①答え合わせ ②問い ③帯 ④3つの金額 ⑤終わり。
 * 場面の関数（draw○○）は、(t＝時刻の秒, layout＝story_layout.js の配置, model＝buildStoryModel の結果) を受け取り SVG の文字を返す
 * （drawMark・drawAlwaysText は t なし）。tests/story_draw.test.js でテストする。
 */

const IS_NODE_FOR_STORY_DRAW = typeof module !== "undefined" && module.exports;
const STORY_DRAW_CONFIG = IS_NODE_FOR_STORY_DRAW ? require("./story_config.js") : STORY_CONFIG;
const STORY_DRAW_SVG = IS_NODE_FOR_STORY_DRAW ? require("./story_svg.js") : FxStorySvg;
const STORY_DRAW_CHART = IS_NODE_FOR_STORY_DRAW ? require("./story_chart.js") : FxStoryChart;
const STORY_DRAW_FORMAT = IS_NODE_FOR_STORY_DRAW ? require("./format.js") : { formatYen, formatCount, formatPct, formatManYen };

// 見た目の調整用の割合・倍数（理由を横に書く）
const STORY_MARK_TEXT_OFFSET = 0.36;    // 「Yu」を印の中央に置く下端のずらし
const STORY_NOTICE_RULE_GAP = 1.4;      // 注意書きの区切り線を1行目より上げる量
const STORY_NOTICE_BOTTOM_LIFT = 0.25;  // 最終行を下端より上げる量（余白にかからないため）
const STORY_NOTICE_RULE_DIVISOR = 12;   // 区切り線の太さ＝文字の大きさ÷この数
const STORY_AMOUNT_RULE_DIVISOR = 14;   // 金額の下線の太さ（同上）
const STORY_AMOUNT_RULE_OFFSET = 0.32;  // 金額の下線の位置（行の間隔に対する割合）
const STORY_SHARE_LINE_HEIGHT = 1.35;   // 通算の文が複数行のときの行の間隔
const STORY_CHIP_CORNER_RATIO = 0.18;   // 札の角の丸み（札の高さに対する割合）
const STORY_CHIP_LEAD_RATIO = 0.38;     // 札の1行目の位置（同上）
const STORY_CHIP_JUDGE_RATIO = 0.82;    // 札の2行目の位置（同上）
const STORY_SERIES_SUB_GAP = 1.3;       // シリーズ名の下の行までの間隔

/**
 * 「○月○日時点」の文字を作る。
 */
function formatAsOf(isoDate) {
	const parts = isoDate.split("-");
	return Number(parts[1]) + "月" + Number(parts[2]) + "日時点";
}

/** 金額（100円単位）を「約160,000円」の形にする。 */
function formatApproxYen(amount) {
	return "約" + STORY_DRAW_FORMAT.formatCount(amount) + "円";
}

/** 帯の範囲 {lower, upper} を「○○.○○円〜○○.○○円」の形にする。 */
function formatRange(range) {
	return STORY_DRAW_FORMAT.formatYen(range.lower) + "〜" + STORY_DRAW_FORMAT.formatYen(range.upper);
}

/** 左上の「Yu」の印と日付（どの瞬間も出す）。 */
function drawMark(layout, model) {
	const colors = STORY_DRAW_CONFIG.colors;
	const svg = STORY_DRAW_SVG;
	const mark = layout.mark;
	const asOf = layout.asOf;
	const letterY = mark.centerY + mark.fontSize * STORY_MARK_TEXT_OFFSET;
	return svg.svgCircle(mark.centerX, mark.centerY, mark.radius, colors.navy)
		+ svg.svgText(mark.centerX, letterY, "Yu", mark.fontSize, { bold: true, color: colors.background, anchor: "middle" })
		+ svg.svgText(asOf.x, asOf.dateY, formatAsOf(model.lastDate), asOf.dateFontSize, { bold: true, color: colors.navy })
		+ svg.svgText(asOf.x, asOf.sourceY, STORY_DRAW_CONFIG.texts.asOfSource, asOf.sourceFontSize, { color: colors.sub });
}

/**
 * ①の通算の割合の文を、幅に収まる行にして描く。
 * 受け取るもの：answer＝配置の answer、left＝文の左端、width＝置ける幅、model＝数字（backtest を使う）。返すもの：SVG の文字
 */
function drawShareLines(answer, left, width, model) {
	const countText = STORY_DRAW_FORMAT.formatCount(model.backtest.total);
	const percentText = STORY_DRAW_FORMAT.formatPct(model.backtest.outsideNarrowPct);
	const lines = STORY_DRAW_SVG.wrapText(STORY_DRAW_CONFIG.texts.share(countText, percentText), width, answer.shareFontSize);
	return lines.map(function (line, index) {
		const y = answer.shareY + index * answer.shareFontSize * STORY_SHARE_LINE_HEIGHT;
		return STORY_DRAW_SVG.svgText(left, y, line, answer.shareFontSize, { color: STORY_DRAW_CONFIG.colors.sub });
	}).join("");
}

/** 折れ線の図を置く場所 {x, y, width, height, leftMargin, rightMargin} を返す。受け取るもの：layout＝配置、chart＝配置の chart か answer.chart */
function chartBox(layout, chart) {
	return { x: layout.left, y: chart.y, width: layout.right - layout.left, height: chart.height, leftMargin: chart.leftMargin, rightMargin: chart.rightMargin };
}

/** ①の折れ線の図（1か月前の帯と、そのあとの実際の線）。引数は場面の関数と同じ。 */
function drawAnswerChart(t, layout, model) {
	const svg = STORY_DRAW_SVG;
	const chart = layout.answer.chart;
	return STORY_DRAW_CHART.drawStoryChart(chartBox(layout, chart), {
		values: model.values,
		fromIndex: model.monthAgoIndex - STORY_DRAW_CONFIG.answerPastDays,
		fanIndex: model.monthAgoIndex,
		band: model.monthAgo,
		pastProgress: 1,
		fanProgress: 1,
		actualProgress: svg.easeInOut(svg.progress(t, STORY_DRAW_CONFIG.timing.answerLine)),
		labelOpacity: 1,
		labelKind: "band",
		fontSize: chart.fontSize,
	});
}

/** ① 1か月前の帯の答え合わせ（0〜3秒。大きく出して3秒で消える）。 */
function drawAnswerScene(t, layout, model) {
	const colors = STORY_DRAW_CONFIG.colors;
	const texts = STORY_DRAW_CONFIG.texts;
	const timing = STORY_DRAW_CONFIG.timing;
	const svg = STORY_DRAW_SVG;
	const answer = layout.answer;
	const opacity = 1 - svg.progress(t, timing.answerFade);
	if (opacity <= 0) {
		return "";
	}
	const left = layout.left;
	const narrowText = texts.narrowLine + "：" + formatRange(model.monthAgo.narrow);
	const wideText = texts.wideLine + "：" + formatRange(model.monthAgo.wide);
	const lastValueText = texts.lastValue + " " + STORY_DRAW_FORMAT.formatYen(model.lastValue);
	let inner = svg.svgText(left, answer.titleY, texts.answerTitle, answer.titleFontSize, { bold: true });
	inner += svg.svgText(left, answer.narrowLineY, narrowText, answer.rangeFontSize, { color: colors.sub });
	inner += svg.svgText(left, answer.wideLineY, wideText, answer.rangeFontSize, { color: colors.sub });
	inner += drawAnswerChart(t, layout, model);
	inner += svg.fadeGroup(svg.progress(t, timing.answerLast), svg.svgText(left, answer.lastValueY, lastValueText, answer.lastValueFontSize, { bold: true }));
	const judgeText = svg.svgText(left, answer.judgeY, texts.judge[model.judge], answer.judgeFontSize, { bold: true, color: colors.navy });
	inner += svg.fadeGroup(svg.progress(t, timing.answerJudge), judgeText);
	inner += svg.fadeGroup(svg.progress(t, timing.answerShare), drawShareLines(answer, left, layout.right - left, model));
	return svg.fadeGroup(opacity, inner);
}

/** 結果の札（3秒から最後まで残る）。 */
function drawResultChip(t, layout, model) {
	const colors = STORY_DRAW_CONFIG.colors;
	const texts = STORY_DRAW_CONFIG.texts;
	const svg = STORY_DRAW_SVG;
	const chip = layout.chip;
	const textX = layout.left + chip.leadFontSize;
	const inner = svg.svgRect(layout.left, chip.y, layout.right - layout.left, chip.height, colors.chip, chip.height * STORY_CHIP_CORNER_RATIO)
		+ svg.svgText(textX, chip.y + chip.height * STORY_CHIP_LEAD_RATIO, texts.chipLead, chip.leadFontSize, { color: colors.sub })
		+ svg.svgText(textX, chip.y + chip.height * STORY_CHIP_JUDGE_RATIO, texts.judge[model.judge], chip.judgeFontSize, { bold: true, color: colors.navy });
	return svg.fadeGroup(svg.progress(t, STORY_DRAW_CONFIG.timing.chip), inner);
}

/** ② 問い（大きく3〜5秒）と、小さな見出し（5秒から。⑤でシリーズ名に替わる）。 */
function drawQuestionScene(t, layout, model) {
	const colors = STORY_DRAW_CONFIG.colors;
	const texts = STORY_DRAW_CONFIG.texts;
	const timing = STORY_DRAW_CONFIG.timing;
	const svg = STORY_DRAW_SVG;
	const tripText = STORY_DRAW_FORMAT.formatManYen(model.tripYen);
	const centerX = (layout.left + layout.right) / 2;
	const bigOpacity = svg.progress(t, timing.questionBig) * (1 - svg.progress(t, timing.questionBigOut));
	const bigLines = texts.questionBigLines(tripText).map(function (line, index) {
		return svg.svgText(centerX, layout.question.lineYs[index], line, layout.question.fontSize, { bold: true, anchor: "middle" });
	});
	const smallOpacity = svg.progress(t, timing.questionSmall) * (1 - svg.progress(t, timing.questionSmallOut));
	const smallLines = texts.questionLines(tripText).map(function (line, index) {
		return svg.svgText(layout.left, layout.title.y + index * layout.title.lineHeight, line, layout.title.fontSize, { bold: true });
	});
	const series = layout.series;
	const seriesSvg = svg.svgText(layout.left, series.y, STORY_DRAW_CONFIG.seriesName, series.fontSize, { bold: true, color: colors.navy })
		+ svg.svgText(layout.left, series.y + series.fontSize * STORY_SERIES_SUB_GAP, texts.everyMorning(model.lastDate), series.subFontSize, { color: colors.sub });
	return svg.fadeGroup(bigOpacity, bigLines.join("")) + svg.fadeGroup(smallOpacity, smallLines.join(""))
		+ svg.fadeGroup(svg.progress(t, timing.series), seriesSvg);
}

/** ③ 帯が広がる図（5〜12秒）。直近約3か月の線のあと、帯がラッパ型に広がる。 */
function drawBandScene(t, layout, model) {
	const timing = STORY_DRAW_CONFIG.timing;
	const svg = STORY_DRAW_SVG;
	const lastIndex = model.values.length - 1;
	const chart = layout.chart;
	const inner = STORY_DRAW_CHART.drawStoryChart(chartBox(layout, chart), {
		values: model.values,
		fromIndex: lastIndex - STORY_DRAW_CONFIG.bandPastDays,
		fanIndex: lastIndex,
		band: model.current,
		pastProgress: svg.easeInOut(svg.progress(t, timing.bandPastLine)),
		fanProgress: svg.easeInOut(svg.progress(t, timing.bandFan)),
		actualProgress: 0,
		labelOpacity: svg.progress(t, timing.bandLabels),
		labelKind: "amount",
		fontSize: chart.fontSize,
	});
	return svg.fadeGroup(svg.progress(t, timing.bandChart), inner);
}

/** ④ 3つの金額（12〜16秒）。同じ色・同じ大きさ・同じ太さで、同時に出す。 */
function drawAmountScene(t, layout, model) {
	const colors = STORY_DRAW_CONFIG.colors;
	const texts = STORY_DRAW_CONFIG.texts;
	const timing = STORY_DRAW_CONFIG.timing;
	const svg = STORY_DRAW_SVG;
	const amounts = layout.amounts;
	const rows = [[texts.yenWeak, model.amounts.weak], [texts.yenNow, model.amounts.now], [texts.yenStrong, model.amounts.strong]];
	let inner = "";
	rows.forEach(function (row, index) {
		const y = amounts.firstY + index * amounts.rowStep;
		const ruleY = y + amounts.rowStep * STORY_AMOUNT_RULE_OFFSET;
		inner += svg.svgText(layout.left, y, row[0], amounts.labelFontSize);
		inner += svg.svgText(layout.right, y, formatApproxYen(row[1]), amounts.valueFontSize, { bold: true, anchor: "end" });
		inner += svg.svgLine(layout.left, ruleY, layout.right, ruleY, colors.grid, amounts.labelFontSize / STORY_AMOUNT_RULE_DIVISOR);
	});
	const noteText = texts.rangeNote(formatRange(model.amounts.bandRange));
	const note = svg.svgText(layout.left, layout.rangeNote.y, noteText, layout.rangeNote.fontSize, { color: colors.sub });
	return svg.fadeGroup(svg.progress(t, timing.amounts), inner) + svg.fadeGroup(svg.progress(t, timing.amountsNote), note);
}

/** 常に出す文（どの瞬間も画面の下に出す）。注意書きと、出典・最終日。 */
function drawAlwaysText(layout, model) {
	const colors = STORY_DRAW_CONFIG.colors;
	const texts = STORY_DRAW_CONFIG.texts;
	const notice = layout.notice;
	const width = layout.right - layout.left;
	const lines = STORY_DRAW_SVG.wrapText(texts.notice, width, notice.fontSize).concat(STORY_DRAW_SVG.wrapText(texts.source(model.lastDate), width, notice.fontSize));
	const firstLineY = layout.bottom - (lines.length - 1) * notice.lineHeight - notice.fontSize * STORY_NOTICE_BOTTOM_LIFT;
	const ruleY = firstLineY - notice.fontSize * STORY_NOTICE_RULE_GAP;
	let svg = STORY_DRAW_SVG.svgLine(layout.left, ruleY, layout.right, ruleY, colors.line, notice.fontSize / STORY_NOTICE_RULE_DIVISOR);
	svg += lines.map(function (line, index) {
		return STORY_DRAW_SVG.svgText(layout.left, firstLineY + index * notice.lineHeight, line, notice.fontSize, { color: colors.sub });
	}).join("");
	return svg;
}

/**
 * 時刻 t の瞬間の絵（SVG の中身）を返す。
 * 受け取るもの：t＝時刻の秒（0〜totalSeconds）、layout＝buildStoryLayouts() の site か tall、model＝buildStoryModel の結果（ok:true のもの）
 * 返すもの：<svg> の中に入れる文字。例：drawStoryFrame(18, layouts.site, model) // 最後の絵
 */
function drawStoryFrame(t, layout, model) {
	const background = STORY_DRAW_SVG.svgRect(0, 0, layout.width, layout.height, STORY_DRAW_CONFIG.colors.background, 0);
	return background + drawMark(layout, model) + drawAnswerScene(t, layout, model) + drawResultChip(t, layout, model)
		+ drawQuestionScene(t, layout, model) + drawBandScene(t, layout, model) + drawAmountScene(t, layout, model) + drawAlwaysText(layout, model);
}

/** 読み上げ用の説明（SVG の aria-label）。受け取るもの：model＝buildStoryModel の結果。返すもの：最後の絵の中身を文にしたもの。 */
function buildAltText(model) {
	const texts = STORY_DRAW_CONFIG.texts;
	const amounts = model.amounts;
	return texts.altIntro + "（" + formatAsOf(model.lastDate) + "）。" + texts.chipLead + texts.judge[model.judge] + "。ドル払いの旅行代"
		+ STORY_DRAW_FORMAT.formatManYen(model.tripYen) + "は、" + texts.yenWeak + formatApproxYen(amounts.weak) + "、"
		+ texts.yenNow + formatApproxYen(amounts.now) + "、" + texts.yenStrong + formatApproxYen(amounts.strong) + "。" + texts.notice;
}

const FxStoryDraw = { drawStoryFrame, buildAltText, formatAsOf, formatApproxYen };

// Node.js（テスト）から require で使えるようにする（ブラウザでは名前がそのまま見える）
if (IS_NODE_FOR_STORY_DRAW) {
	module.exports = FxStoryDraw;
}
