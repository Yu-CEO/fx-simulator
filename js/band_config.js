/*
 * band_config.js：帯（動く幅）の作り方の設定をまとめたファイル
 * 採用した計算方法の名前・画面に出す短い名前・目標の割合・合格の線など。
 * band_calc.js・data_loader.js・main.js・tools/compare_band_methods.js から使われる。
 * 方法を替えるときは、tools/compare_band_methods.js で比べ直して作者が決め、methodName を書き換える
 * （毎日の自動更新では替わらない）。
 */

const BAND_CONFIG = {
	// 採用した計算方法の名前（下の methodFiles の名前のどれか）。2026-11-18 の比較（v3.2・ECB データ・5/10/15/20営業日の4つすべてで合格のうち (c) 最小）で決定。docs/band_methods.md
	methodName: "kalman_local_level",

	// 方法の名前 → 画面が読み込むファイル。画面はここで選んだ1つだけを読む
	methodFiles: {
		rolling_std: "js/band_methods/rolling_std.js",
		ewma: "js/band_methods/ewma.js",
		garch11: "js/band_methods/garch11.js",
		kalman_local_level: "js/band_methods/kalman_local_level.js",
	},

	// 帯のそばの文「過去の動きの大きさ（計算方法：○○）から作った幅です。」の ○○ と、比べ方の表の「方法」の列
	methodLabels: {
		rolling_std: "直近1年の動き",
		ewma: "直近を重く見た1年の動き",
		garch11: "GARCH（平均に戻る動き）",
		kalman_local_level: "カルマンフィルタ",
	},

	// 動きの大きさを測るのに使う日数。250営業日＝約1年。これより前の日は帯も答え合わせも作らない
	windowDays: 250,

	// 先の長さ（営業日）。5営業日＝1週間・10＝2週間・15＝3週間・20＝1か月（仕様 v3.2・v4。3か月はやめた。20営業日の呼び方は「1か月」にそろえる）
	horizons: [5, 10, 15, 20],
	horizonLabels: { 5: "1週間", 10: "2週間", 15: "3週間", 20: "1か月" },
	// 最初に選ばれている先の長さ（営業日）。20＝1か月
	defaultHorizon: 20,

	// 旅行代（円）。「ドル払いの旅行代が いま10万円」＝今のレートで10万円ぶんのドル（仕様 6章 7）。金額はここで変えられる
	tripYen: 100000,
	// 旅行代の円への換算を四捨五入する単位（円）。細かい桁は意味がないため
	roundYenUnit: 100,

	// 帯の太さ（S(h) の何倍か）。狭い帯は ±1 倍、広い帯は ±2 倍
	narrowMultiple: 1,
	wideMultiple: 2,

	// 目標の割合（％）：狭い帯は約68％、広い帯は約95％の日で中に入る想定で作る（正規分布の ±1・±2 倍の範囲）
	targetNarrowPct: 68,
	targetWidePct: 95,

	// 合格の線（％）。作者が決めた初めの値（2026-11-18）。狭くしすぎて外れが増えるのを防ぐ
	passNarrowPct: 65,
	passWidePct: 93,

	// 方法②（EWMA）で前日までの分散をどれだけ残すか。0.94 は広く使われている日次の値（作者が了承した初めの値）
	ewmaLambda: 0.94,
};

// Node.js（テストや比較の作業）から require で使えるようにする。module（Node.jsでファイルの外に渡すものを入れる箱）は
// ブラウザにはないので、ブラウザでは何もしない（BAND_CONFIG がそのまま他のファイルから見える）
if (typeof module !== "undefined" && module.exports) {
	module.exports = BAND_CONFIG;
}
