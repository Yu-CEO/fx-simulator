/*
 * story_layout.js：今日の図の「どこに何を置くか」（座標と文字の大きさ）。主な関数：buildStoryLayouts（サイト用 site と縦動画用 tall）
 * 数字はプロトタイプのとおり。縦動画の余白と文字の大きさは story_config.js の値（仕様 2-9）。
 * 単位：サイトは図の幅 310 の中の座標、縦動画は 1080×1920 の画素（y は文字の下端）。
 * 項目：left・right・bottom＝文字を置ける範囲／mark・asOf・chip・chart・amounts・answer・question＝各場面の位置と文字の大きさ。
 * story_draw.js から使われる。tests/story_draw.test.js でテストする。
 */

const STORY_LAYOUT_CONFIG = (typeof module !== "undefined" && module.exports) ? require("./story_config.js") : STORY_CONFIG;

/** サイト用の配置（幅 310・高さ 610 の図。図の中の文字は13px以上）を返す。項目は冒頭のとおり。 */
function buildSiteLayout() {
	const size = STORY_LAYOUT_CONFIG.site;
	return {
		kind: "site",
		width: size.width,
		height: size.height,
		left: 10,
		right: 300,
		bottom: 602,
		mark: { centerX: 27, centerY: 28, radius: 17, fontSize: 13 },
		asOf: { x: 52, dateY: 25, dateFontSize: 14, sourceY: 44, sourceFontSize: 13 },
		chip: { y: 56, height: 50, leadFontSize: 13, judgeFontSize: 16 },
		title: { y: 132, fontSize: 16, lineHeight: 22 },
		series: { y: 134, fontSize: 16, subFontSize: 13 },
		chart: { y: 168, height: 186, leftMargin: 36, rightMargin: 70, fontSize: 13 },
		amounts: { firstY: 382, rowStep: 30, labelFontSize: 14, valueFontSize: 18 },
		rangeNote: { y: 466, fontSize: 13 },
		notice: { fontSize: 13, lineHeight: 18 },
		answer: {
			titleY: 76,
			titleFontSize: 15,
			narrowLineY: 97,
			wideLineY: 115,
			rangeFontSize: 13,
			chart: { y: 124, height: 212, leftMargin: 36, rightMargin: 70, fontSize: 13 },
			lastValueY: 356,
			lastValueFontSize: 14,
			judgeY: 388,
			judgeFontSize: 22,
			shareY: 412,
			shareFontSize: 13,
		},
		question: { lineYs: [236, 272, 308], fontSize: 26 },
	};
}

/** 縦動画用の配置（1080×1920）を返す。safe は余白の内側の範囲。 */
function buildTallLayout() {
	const video = STORY_LAYOUT_CONFIG.video;
	const top = video.safe.top;
	const left = video.safe.left;
	const right = video.width - video.safe.right;
	const bottom = video.height - video.safe.bottom;
	const sizes = video.fontSizes;
	return {
		kind: "tall",
		width: video.width,
		height: video.height,
		left,
		right,
		bottom,
		safe: { top, bottom, left, right },
		mark: { centerX: left + 46, centerY: top + 62, radius: 46, fontSize: 36 },
		asOf: { x: left + 112, dateY: top + 52, dateFontSize: 42, sourceY: top + 100, sourceFontSize: 32 },
		chip: { y: top + 140, height: 128, leadFontSize: 34, judgeFontSize: 48 },
		title: { y: top + 336, fontSize: 52, lineHeight: 66 },
		series: { y: top + 340, fontSize: 54, subFontSize: 34 },
		// rightMargin：帯の右の名前（「円安の場合」「よくある幅」＝5文字×32）が右の余白にかからない幅（試作は180）
		chart: { y: top + 430, height: 350, leftMargin: 104, rightMargin: 180, fontSize: 32 },
		amounts: { firstY: top + 850, rowStep: 80, labelFontSize: 44, valueFontSize: sizes.amount },
		rangeNote: { y: top + 1076, fontSize: 32 },
		notice: { fontSize: sizes.notice, lineHeight: 46 },
		answer: {
			titleY: top + 200,
			titleFontSize: 46,
			narrowLineY: top + 262,
			wideLineY: top + 310,
			rangeFontSize: 36,
			chart: { y: top + 340, height: 460, leftMargin: 104, rightMargin: 180, fontSize: 32 },
			lastValueY: top + 870,
			lastValueFontSize: 46,
			judgeY: top + 955,
			judgeFontSize: sizes.judge,
			shareY: top + 1015,
			shareFontSize: 34,
		},
		question: { lineYs: [top + 520, top + 640, top + 760], fontSize: 88 },
	};
}

/** サイト用と縦動画用の配置 {site, tall} を返す。 */
function buildStoryLayouts() {
	return { site: buildSiteLayout(), tall: buildTallLayout() };
}

const FxStoryLayout = { buildStoryLayouts };

// Node.js（テスト）から require で使えるようにする（ブラウザでは名前がそのまま見える）
if (typeof module !== "undefined" && module.exports) {
	module.exports = FxStoryLayout;
}
