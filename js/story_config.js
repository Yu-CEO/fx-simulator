/*
 * story_config.js：「今日の図」と縦動画の設定（使う帯・秒数・文言・シリーズ名・色・縦動画の余白と文字の大きさ。仕様 2-8・2-9・2-10・6章 7〜9）
 * 値を替えたいときはここだけを書き換える。文言は仕様 2-6 の「出さない言葉」を使わない（tests/story_text.test.js が確かめる）。
 */

const STORY_CONFIG = {
	// 旅行代（いま10万円）と100円単位の丸めは band_config.js（tripYen・roundYenUnit）。6章 7
	amountBand: "wide",     // 3つの金額に使う帯。"wide"（広い帯）か "narrow"（狭い帯）。6章 8
	horizonDays: 20,        // 先の長さ（営業日）。20営業日＝1か月で固定
	// 1か月前の帯が作れるのに要る値の件数は、帯に必要な250個の変化＝251件に、先の長さ（20件）を足した数（story_calc.js が計算する）

	answerPastDays: 40,     // ① 1か月前の帯の手前に描く過去の日数
	bandPastDays: 60,       // ③ 帯の手前に描く過去の日数（直近約3か月）

	totalSeconds: 18,       // 合計（15〜20秒の範囲。仕様 2-9）
	sceneEnds: [3, 5, 12, 16, 18],  // ①答え合わせ・②問い・③帯・④3つの金額・⑤終わりの終わりの秒（サイトも縦動画も同じ）
	// 場面の中の細かい出入り（秒）。[始まり, 終わり] の間でふわっと出る（または消える）。名前は story_draw.js の各場面の関数が使う（answer＝①、question＝②、band＝③、amounts＝④、series＝⑤）
	timing: {
		answerLine: [0.3, 2.1],
		answerLast: [2.0, 2.3],
		answerJudge: [2.1, 2.45],
		answerShare: [2.3, 2.6],
		answerFade: [3.0, 3.35],
		chip: [3.1, 3.5],
		questionBig: [3.2, 3.5],
		questionBigOut: [4.7, 5.05],
		questionSmall: [5.0, 5.4],
		questionSmallOut: [16.0, 16.35],
		series: [16.2, 16.6],
		bandChart: [5.0, 5.3],
		bandPastLine: [5.0, 6.3],
		bandFan: [6.3, 10.3],
		bandLabels: [10.3, 11.0],
		amounts: [12.0, 12.5],
		amountsNote: [12.3, 12.8],
	},

	seriesName: "ドル円の幅、答え合わせつき",

	texts: {
		notice: "過去の動きの大きさから作った幅です。予測ではありません。売買をすすめるものではありません。",
		source: function (lastDate) { return "為替データ：欧州中央銀行（ECB）の参照レート（当サイトで計算）／データの最終日：" + lastDate; },
		asOfSource: "（欧州中央銀行の参照レート）",
		answerTitle: "1か月前に作った幅",
		chipLead: "1か月前に作った幅は",
		judge: { narrow: "よくある幅の中に入った", wide: "まれな幅の中に入った", out: "まれな幅の外に出た" },
		narrowLine: "よくある幅",
		wideLine: "まれな幅",
		lastValue: "→ 今日の値",
		// tripText は「10万円」のような旅行代の言い方
		questionLines: function (tripText) { return ["ドル払いの旅行代 " + tripText + "、", "1か月で何円くらい動く？"]; },
		questionBigLines: function (tripText) { return ["ドル払いの旅行代", tripText + "、1か月で", "何円くらい動く？"]; },
		yenWeak: "円安の場合",
		yenNow: "今のレートのまま",
		yenStrong: "円高の場合",
		rangeNote: function (rangeText) { return "（まれな幅 " + rangeText + "で計算）"; },
		everyMorning: function (lastDate) { return "毎朝更新・データの最終日 " + lastDate; },
		share: function (countText, pctText) { return "これまで " + countText + " 回では、よくある幅の外に出たのは " + pctText + "（3回に1回くらい）でした"; },
		axisTop: "上ほど円安（海外の物が高い）",
		axisBottom: "下ほど円高（海外の物が安い）",
		notEnough: "データが足りないため、今日の図を作れません。",
		altIntro: "今日の図",
	},

	colors: {
		ink: "#16171a", sub: "#5b5f66", navy: "#0f1626", blue: "#2563a8",
		narrow: "rgba(37,99,168,.34)", wide: "rgba(37,99,168,.14)", future: "#f2f3f5",
		grid: "#e3e5e9", divider: "#5b5f66", chip: "#eef3f9", background: "#ffffff", line: "#d9dbe0",
	},
	// 外部フォントは読み込まない。端末にある文字だけ（縦動画は Actions に入れた Noto Sans CJK が使われる）
	fontFamily: "'Hiragino Sans','Hiragino Kaku Gothic ProN','Noto Sans JP','Noto Sans CJK JP','Yu Gothic UI','Yu Gothic',Meiryo,system-ui,sans-serif",

	site: { width: 310, height: 610 },  // 図の中の補足を13pxにしたため、590から610に（仕様 2-8）

	video: {
		width: 1080,
		height: 1920,
		fps: 30,                                          // 1秒あたりのコマ数。TikTok で一般的な30
		// 文字を置く範囲の外側の余白（仕様 2-9。最初の1本を作者の実機で確認して調整する）
		safe: { top: 160, bottom: 420, left: 64, right: 160 },
		// 文字の大きさ（仕様 2-9）
		fontSizes: { notice: 34, judge: 70, amount: 60 },
	},
};

// Node.js（テスト）から require で使えるようにする（ブラウザでは名前がそのまま見える）
if (typeof module !== "undefined" && module.exports) {
	module.exports = STORY_CONFIG;
}
