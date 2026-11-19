/*
 * story_svg.js：今日の図を SVG（図を文字で書く形式）で描く小さな道具。主な関数：svgText 等の部品、fadeGroup、progress・easeInOut、wrapText
 * 文字列だけを返し、画面には触れない。story_chart.js・story_draw.js から使われる。tests/story_draw.test.js でテストする。
 */

const STORY_SVG_CONFIG = (typeof module !== "undefined" && module.exports) ? require("./story_config.js") : STORY_CONFIG;

const STORY_HALF_WIDTH_RATIO = 0.6;           // 半角の文字の幅は全角のこの倍とみなして折り返しを見積もる
const STORY_NO_LINE_START = "、。）」％,.／";  // 行頭に来てはいけない記号（折り返すとき前の行に残す）
const STORY_MIN_VISIBLE_OPACITY = 0.001;      // 透明度がこれ以下なら描かない（見えないため）
const STORY_BOLD_WEIGHT = 700;                // 太字の太さ
const STORY_NORMAL_WEIGHT = 400;              // ふつうの太さ

/**
 * XML の特別な文字（& < "）を置き換える（SVG の文字や属性に安全に入れるため）。
 * 受け取るもの：text＝文字または数。返すもの：置き換えた文字。例：escapeXml("a<b") → "a&lt;b"
 */
function escapeXml(text) {
	return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
}

/**
 * 文字の SVG 部品を作る。
 * 受け取るもの：x＝横の位置、y＝文字の下端の位置、text＝文字、fontSize＝文字の大きさ、options＝{bold＝太字か, color＝色, anchor＝"start"・"middle"・"end"}（省略可）
 * 返すもの：SVG の文字
 */
function svgText(x, y, text, fontSize, options) {
	const settings = options || {};
	const weight = settings.bold ? STORY_BOLD_WEIGHT : STORY_NORMAL_WEIGHT;
	const color = settings.color || STORY_SVG_CONFIG.colors.ink;
	const anchor = settings.anchor || "start";
	return '<text x="' + round1(x) + '" y="' + round1(y) + '" font-size="' + fontSize + '" font-weight="' + weight + '" fill="' + color
		+ '" text-anchor="' + anchor + '" font-family="' + escapeXml(STORY_SVG_CONFIG.fontFamily) + '" style="font-variant-numeric:tabular-nums">'
		+ escapeXml(text) + "</text>";
}

/** 小数第1位に丸めた数を返す（SVG の座標を短くするため）。例：round1(12.345) → 12.3 */
function round1(value) {
	return Math.round(value * 10) / 10;
}

/** 線の SVG 部品。受け取るもの：始まり(x1,y1)・終わり(x2,y2)・色・太さ・点線の間隔（省略で実線）。返すもの：SVG の文字。 */
function svgLine(x1, y1, x2, y2, color, width, dashArray) {
	const dash = dashArray ? ' stroke-dasharray="' + dashArray + '"' : "";
	return '<line x1="' + round1(x1) + '" x2="' + round1(x2) + '" y1="' + round1(y1) + '" y2="' + round1(y2)
		+ '" stroke="' + color + '" stroke-width="' + width + '"' + dash + "/>";
}

/** 四角の SVG 部品。受け取るもの：左端・上端・幅・高さ・塗りの色・角の丸み（0で角ばる）。返すもの：SVG の文字。 */
function svgRect(x, y, width, height, fill, cornerRadius) {
	const corner = cornerRadius > 0 ? ' rx="' + round1(cornerRadius) + '"' : "";
	return '<rect x="' + round1(x) + '" y="' + round1(y) + '" width="' + round1(width) + '" height="' + round1(height) + '"' + corner + ' fill="' + fill + '"/>';
}

/** 丸の SVG 部品。受け取るもの：中心の横・縦・半径・塗りの色。返すもの：SVG の文字。 */
function svgCircle(centerX, centerY, radius, fill) {
	return '<circle cx="' + round1(centerX) + '" cy="' + round1(centerY) + '" r="' + round1(radius) + '" fill="' + fill + '"/>';
}

/** 折れ線（塗りなし・角は丸く）の SVG 部品。受け取るもの："x,y" の文字の一覧・線の色・太さ。返すもの：SVG の文字。 */
function svgPolyline(points, color, width) {
	return '<polyline points="' + points.join(" ") + '" fill="none" stroke="' + color + '" stroke-width="' + width + '" stroke-linejoin="round"/>';
}

/** 多角形の SVG 部品。受け取るもの："x,y x,y …" の文字・塗りの色。返すもの：SVG の文字。 */
function svgPolygon(points, fill) {
	return '<polygon points="' + points + '" fill="' + fill + '"/>';
}

/** 透明度つきのグループで包む。受け取るもの：opacity＝0〜1、inner＝中身の SVG。返すもの：包んだ SVG（ほぼ透明なら空の文字）。 */
function fadeGroup(opacity, inner) {
	if (opacity <= STORY_MIN_VISIBLE_OPACITY) {
		return "";
	}
	return '<g opacity="' + Math.min(1, opacity).toFixed(3) + '">' + inner + "</g>";
}

/**
 * 時刻 t が [始まり, 終わり] のどのあたりかを 0〜1 で返す（範囲の外は 0 か 1）。
 * 受け取るもの：t＝時刻（秒）、range＝[始まり, 終わり]（秒）。例：progress(1, [0, 2]) → 0.5
 */
function progress(t, range) {
	const ratio = (t - range[0]) / (range[1] - range[0]);
	return Math.max(0, Math.min(1, ratio));
}

/** ゆっくり始まりゆっくり終わる動き。受け取るもの：ratio＝0〜1。返すもの：0〜1。 */
function easeInOut(ratio) {
	if (ratio < 0.5) {
		return 2 * ratio * ratio;
	}
	return 1 - Math.pow(-2 * ratio + 2, 2) / 2;
}

/** 文字の幅の見込み（全角＝文字の大きさ、半角＝0.6倍）。受け取るもの：文字・文字の大きさ。返すもの：幅。 */
function estimateWidth(text, fontSize) {
	let width = 0;
	for (const character of text) {
		width += (character.charCodeAt(0) < 128 ? STORY_HALF_WIDTH_RATIO : 1) * fontSize;
	}
	return width;
}

/**
 * 文を、決まった幅に収まる行に分ける。「。」で終わる文のまとまりを優先し、長い文は（…）と半角の並びを切らずに折り返す。
 * 受け取るもの：text＝文、maxWidth＝1行の幅、fontSize＝文字の大きさ。返すもの：行の一覧
 */
function wrapText(text, maxWidth, fontSize) {
	const sentences = text.match(/[^。]+。?/gu) || [];
	const lines = [];
	let line = "";
	let lineWidth = 0;
	for (const sentence of sentences) {
		const sentenceWidth = estimateWidth(sentence, fontSize);
		if (lineWidth + sentenceWidth <= maxWidth) {
			line += sentence;
			lineWidth += sentenceWidth;
			continue;
		}
		if (sentenceWidth <= maxWidth) {
			if (line) {
				lines.push(line);
			}
			line = sentence;
			lineWidth = sentenceWidth;
			continue;
		}
		const broken = breakLongSentence(sentence, maxWidth, fontSize, line, lineWidth);
		lines.push(...broken.lines);
		line = broken.line;
		lineWidth = broken.lineWidth;
	}
	if (line) {
		lines.push(line);
	}
	return lines;
}

/**
 * 1つの文が幅に収まらないとき、（…）や半角の並びを切らずに、部品ごとに詰めて折り返す。
 * 受け取るもの：sentence＝長い文、maxWidth＝1行の幅、fontSize＝文字の大きさ、startLine＝今の行（前の文の続き）、startWidth＝その幅
 * 返すもの：{lines＝確定した行の一覧, line＝書きかけの行, lineWidth＝その幅}
 */
function breakLongSentence(sentence, maxWidth, fontSize, startLine, startWidth) {
	const lines = [];
	let line = startLine;
	let lineWidth = startWidth;
	for (const token of sentence.match(/（[^）]*）|[ -~]+|./gu)) {
		const tokenWidth = estimateWidth(token, fontSize);
		if (lineWidth + tokenWidth > maxWidth && line && !STORY_NO_LINE_START.includes(token)) {
			lines.push(line);
			line = "";
			lineWidth = 0;
		}
		line += token;
		lineWidth += tokenWidth;
	}
	return { lines, line, lineWidth };
}

const FxStorySvg = { escapeXml, svgText, svgLine, svgRect, svgCircle, svgPolyline, svgPolygon, fadeGroup, progress, easeInOut, estimateWidth, wrapText, round1 };

// Node.js（テスト）から require で使えるようにする（ブラウザでは名前がそのまま見える）
if (typeof module !== "undefined" && module.exports) {
	module.exports = FxStorySvg;
}
