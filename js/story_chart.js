/*
 * story_chart.js：今日の図の中の「折れ線と帯」の絵を作る（①と③で同じ部品）。主な関数：drawStoryChart
 * 帯の形は buildBand の結果（path）をそのまま使い、中心の線は描かない（仕様 2-2）。story_draw.js から使われる。tests/story_draw.test.js でテストする。
 */

const IS_NODE_FOR_STORY_CHART = typeof module !== "undefined" && module.exports;
const STORY_CHART_CONFIG = IS_NODE_FOR_STORY_CHART ? require("./story_config.js") : STORY_CONFIG;
const STORY_CHART_SVG = IS_NODE_FOR_STORY_CHART ? require("./story_svg.js") : FxStorySvg;

// 見た目の調整用（文字の大きさの倍数や割合）
const STORY_VERTICAL_PAD_RATIO = 1.5;     // 枠の上下の余白（上下の注記を入れる）
const STORY_RANGE_MARGIN_RATIO = 0.08;    // 値の幅の上下の余裕
const STORY_GRID_STEPS = [0.5, 1, 2, 5, 10];  // 目盛りの間隔の候補（円）。上限内で最小のもの
const STORY_MAX_GRID_LINES = 4;           // 目盛りの本数の上限
const STORY_GRID_WIDTH_DIVISOR = 12;      // 目盛り線の太さ＝文字の大きさ÷この数
const STORY_DIVIDER_WIDTH_DIVISOR = 10;   // 点線の太さ
const STORY_DASH_DIVISOR = 3;             // 点線の細かさ
const STORY_LINE_WIDTH_DIVISOR = 6;       // 過去の線の太さ
const STORY_ACTUAL_WIDTH_DIVISOR = 4.5;   // 実際の線の太さ（過去の線より太く）
const STORY_DOT_RADIUS_DIVISOR = 2.6;     // 終点の丸の半径
const STORY_DAY_EPSILON = 1e-9;           // 小数の誤差を許す幅（営業日）
const STORY_TICK_LABEL_GAP = 0.4;         // 目盛りの数字を線の左にどれだけ離すか
const STORY_TEXT_CENTER_OFFSET = 0.35;    // 文字を線の高さに合わせるずらし
const STORY_AXIS_NOTE_INDENT = 0.3;       // 上下の注記を枠の左端から右へ置く量
const STORY_AXIS_BOTTOM_GAP = 1.15;       // 「下ほど円高」を枠の下へ置く量
const STORY_LABEL_GAP = 0.4;              // 帯の右の名前を右端から離す量

/**
 * 表示する値の範囲（円）を求める。過去の線・先の実際の線・広い帯の先端が入るようにする。
 * 受け取るもの：values＝日々の値、fromIndex・endIndex＝線の始まりと終わりの番号、band＝buildBand の結果
 * 返すもの：上下に余裕を足した {low, high}
 */
function chooseValueRange(values, fromIndex, endIndex, band) {
	let low = Infinity;
	let high = -Infinity;
	for (let index = fromIndex; index <= Math.min(values.length - 1, endIndex); index++) {
		low = Math.min(low, values[index]);
		high = Math.max(high, values[index]);
	}
	const last = band.path[band.path.length - 1];
	low = Math.min(low, last.wideLower);
	high = Math.max(high, last.wideUpper);
	const pad = (high - low) * STORY_RANGE_MARGIN_RATIO;
	return { low: low - pad, high: high + pad };
}

/**
 * 帯（狭い帯か広い帯）の多角形の点の文字列を作る。
 * 受け取るもの：band＝buildBand の結果（path に1日ごとの上端・下端）、kind＝"narrow"か"wide"、daysShown＝帯の始まりから何営業日先まで描くか（小数なら途中まで）、
 *   toX・toY＝番号→横・円→縦の関数、fanIndex＝帯の始まりの日の番号
 * 返すもの："x,y x,y …"（上端を左から右、下端を右から左へたどる）
 */
function bandPolygonPoints(band, kind, daysShown, toX, toY, fanIndex) {
	const upperKey = kind + "Upper";
	const lowerKey = kind + "Lower";
	const upper = [];
	const lower = [];
	function addPoint(day, upperValue, lowerValue) {
		upper.push([toX(fanIndex + day), toY(upperValue)]);
		lower.push([toX(fanIndex + day), toY(lowerValue)]);
	}
	const wholeDays = Math.floor(daysShown + STORY_DAY_EPSILON);
	for (let day = 0; day <= wholeDays; day++) {
		addPoint(day, band.path[day][upperKey], band.path[day][lowerKey]);
	}
	const rest = daysShown - wholeDays;
	if (rest > STORY_DAY_EPSILON && wholeDays + 1 < band.path.length) {
		const from = band.path[wholeDays];
		const to = band.path[wholeDays + 1];
		addPoint(daysShown, from[upperKey] + (to[upperKey] - from[upperKey]) * rest, from[lowerKey] + (to[lowerKey] - from[lowerKey]) * rest);
	}
	return upper.concat(lower.reverse()).map(function (point) { return point[0].toFixed(1) + "," + point[1].toFixed(1); }).join(" ");
}

/**
 * 目盛り線と数字、「上ほど円安」「下ほど円高」を描く。
 * 受け取るもの：frame＝{x0, x1, yTop, yBottom}（枠の左右・上下）、range＝{low, high}、toY＝円→縦の関数、fontSize＝文字の大きさ。返すもの：SVG の文字
 */
function drawAxes(frame, range, toY, fontSize) {
	const colors = STORY_CHART_CONFIG.colors;
	const texts = STORY_CHART_CONFIG.texts;
	const svg = STORY_CHART_SVG;
	let step = STORY_GRID_STEPS[STORY_GRID_STEPS.length - 1];
	for (const candidate of STORY_GRID_STEPS) {
		if ((range.high - range.low) / candidate <= STORY_MAX_GRID_LINES) {
			step = candidate;
			break;
		}
	}
	let result = "";
	for (let value = Math.ceil(range.low / step) * step; value <= range.high; value += step) {
		const y = toY(value);
		const label = step < 1 ? value.toFixed(1) : String(value);
		result += svg.svgLine(frame.x0, y, frame.x1, y, colors.grid, fontSize / STORY_GRID_WIDTH_DIVISOR);
		result += svg.svgText(frame.x0 - fontSize * STORY_TICK_LABEL_GAP, y + fontSize * STORY_TEXT_CENTER_OFFSET, label, fontSize, { color: colors.sub, anchor: "end" });
	}
	const noteX = frame.x0 + fontSize * STORY_AXIS_NOTE_INDENT;
	result += svg.svgText(noteX, frame.yTop - fontSize * STORY_TEXT_CENTER_OFFSET, texts.axisTop, fontSize, { color: colors.sub });
	result += svg.svgText(noteX, frame.yBottom + fontSize * STORY_AXIS_BOTTOM_GAP, texts.axisBottom, fontSize, { color: colors.sub });
	return result;
}

/**
 * 帯の右の名前を描く（①は「広い帯」「狭い帯」、③は「円安の場合」「円高の場合」）。
 * 受け取るもの：options＝drawStoryChart の options、frame＝枠（toX を持つ）、toY＝円→縦の関数。返すもの：SVG の文字
 */
function drawBandLabels(options, frame, toY) {
	const colors = STORY_CHART_CONFIG.colors;
	const texts = STORY_CHART_CONFIG.texts;
	const svg = STORY_CHART_SVG;
	const fontSize = options.fontSize;
	const end = options.band.path[options.band.path.length - 1];
	const labelX = frame.toX(options.fanIndex + options.band.path.length - 1) + fontSize * STORY_LABEL_GAP;
	const offset = fontSize * STORY_TEXT_CENTER_OFFSET;
	if (options.labelKind === "amount") {
		const kind = STORY_CHART_CONFIG.amountBand;
		return svg.svgText(labelX, toY(end[kind + "Upper"]) + offset, texts.yenWeak, fontSize, { color: colors.ink })
			+ svg.svgText(labelX, toY(end[kind + "Lower"]) + offset, texts.yenStrong, fontSize, { color: colors.ink });
	}
	return svg.svgText(labelX, toY(end.wideUpper) + offset, texts.wideLine, fontSize, { color: colors.sub })
		+ svg.svgText(labelX, toY(end.narrowUpper) + offset, texts.narrowLine, fontSize, { color: colors.sub });
}

/**
 * 値の番号の範囲を折れ線の点（"x,y"）の一覧にする。
 * 受け取るもの：values＝日々の値、firstIndex・lastIndex＝最初と最後の番号、toX・toY＝番号→横・円→縦の関数。返すもの：点の一覧
 */
function linePoints(values, firstIndex, lastIndex, toX, toY) {
	const points = [];
	for (let index = firstIndex; index <= lastIndex; index++) {
		points.push(toX(index).toFixed(1) + "," + toY(values[index]).toFixed(1));
	}
	return points;
}

/**
 * 過去の線と、①だけの「帯を作ったあとの実際の線」を描く。
 * 受け取るもの：options＝drawStoryChart の options、toX・toY＝番号→横・円→縦の関数。返すもの：SVG の文字
 */
function drawLines(options, toX, toY) {
	const colors = STORY_CHART_CONFIG.colors;
	const svg = STORY_CHART_SVG;
	const fontSize = options.fontSize;
	const horizonDays = options.band.path.length - 1;
	let result = "";
	const pastEnd = options.fromIndex + options.pastProgress * (options.fanIndex - options.fromIndex);
	const pastPoints = linePoints(options.values, options.fromIndex, Math.floor(pastEnd), toX, toY);
	if (pastPoints.length > 1) {
		result += svg.svgPolyline(pastPoints, colors.navy, fontSize / STORY_LINE_WIDTH_DIVISOR);
	}
	if (options.actualProgress > 0) {
		const actualEnd = options.fanIndex + options.actualProgress * horizonDays;
		const actualPoints = linePoints(options.values, options.fanIndex, Math.floor(actualEnd), toX, toY);
		result += svg.svgPolyline(actualPoints, colors.navy, fontSize / STORY_ACTUAL_WIDTH_DIVISOR);
		if (options.actualProgress >= 1) {
			const endIndex = options.fanIndex + horizonDays;
			result += svg.svgCircle(toX(endIndex), toY(options.values[endIndex]), fontSize / STORY_DOT_RADIUS_DIVISOR, colors.navy);
		}
	}
	return result;
}

/**
 * 折れ線と帯を描く。
 * 受け取るもの：
 *   box＝{x, y, width, height, leftMargin, rightMargin}（描く場所。左右の余白は目盛り・名前を入れる幅）
 *   options＝{values（日々の値）, fromIndex（線の始まりの番号）, fanIndex（帯を作った日の番号）, band（buildBand の結果）,
 *     pastProgress・fanProgress・actualProgress（過去の線・帯・①の実際の線がどこまで伸びたか 0〜1）, labelOpacity（帯の右の名前の濃さ）,
 *     labelKind（"band"か"amount"）, fontSize（図の中の文字の大きさ）}
 * 返すもの：SVG の文字
 */
function drawStoryChart(box, options) {
	const colors = STORY_CHART_CONFIG.colors;
	const svg = STORY_CHART_SVG;
	const fontSize = options.fontSize;
	const horizonDays = options.band.path.length - 1;
	const stepCount = (options.fanIndex - options.fromIndex) + horizonDays;
	const x0 = box.x + box.leftMargin;
	const x1 = box.x + box.width - box.rightMargin;
	const toX = function (index) { return x0 + (index - options.fromIndex) / stepCount * (x1 - x0); };
	const range = chooseValueRange(options.values, options.fromIndex, options.fanIndex + horizonDays, options.band);
	const yTop = box.y + fontSize * STORY_VERTICAL_PAD_RATIO;
	const yBottom = box.y + box.height - fontSize * STORY_VERTICAL_PAD_RATIO;
	const toY = function (value) { return yTop + (range.high - value) / (range.high - range.low) * (yBottom - yTop); };
	const frame = { x0, x1, yTop, yBottom, toX };
	const fanX = toX(options.fanIndex);
	let result = svg.svgRect(fanX, yTop, x1 - fanX, yBottom - yTop, colors.future, 0);
	result += drawAxes(frame, range, toY, fontSize);
	const daysShown = options.fanProgress * horizonDays;
	if (daysShown > 0) {
		result += svg.svgPolygon(bandPolygonPoints(options.band, "wide", daysShown, toX, toY, options.fanIndex), colors.wide);
		result += svg.svgPolygon(bandPolygonPoints(options.band, "narrow", daysShown, toX, toY, options.fanIndex), colors.narrow);
	}
	const dash = (fontSize / STORY_DASH_DIVISOR) + " " + (fontSize / STORY_DASH_DIVISOR);
	result += svg.svgLine(fanX, yTop, fanX, yBottom, colors.divider, fontSize / STORY_DIVIDER_WIDTH_DIVISOR, dash);
	result += drawLines(options, toX, toY);
	result += svg.fadeGroup(options.labelOpacity, drawBandLabels(options, frame, toY));
	return result;
}

const FxStoryChart = { drawStoryChart };

// Node.js（テスト）から require で使えるようにする（ブラウザでは名前がそのまま見える）
if (IS_NODE_FOR_STORY_CHART) {
	module.exports = FxStoryChart;
}
