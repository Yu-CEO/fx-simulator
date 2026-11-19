/*
 * data_loader.js：あとから読むファイル（方法の部品・今日の図・結果・過去約9年分・くわしくの表示）を <script> を足して読み込む（fetch＝通信でファイルを取る命令は、index.html を直接開くと使えないため使わない）
 * 主な関数：loadMethodFile、loadStoryFiles、loadResultFiles、loadLaterFiles、combineData、statusMessageHtml。main.js と tools/check_size.py（下の一覧）から使われる。
 */

// 最初の画面が出たあとに読むファイル（この順に1つずつ読む）。3年・10年・答え合わせ・似た局面に使う。表示のファイルは、計算のファイルのあとに読む
const LATER_FILES = [
	"data/usdjpy_older.js",
	"data/band_compare.js",
	"js/band_backtest_calc.js",
	"js/similar_calc.js",
	"js/result_cache.js",
	"js/stats_view.js",
	"js/more_view.js",
];

// 今日の図のファイル（最初の画面のあと、この順に1つずつ読む。最初の表示を10ファイル以内にするため。仕様 2-7）
const STORY_FILES = [
	"js/story_config.js", "js/story_calc.js", "js/story_layout.js", "js/story_svg.js", "js/story_chart.js", "js/story_draw.js", "js/story_view.js",
];
// 結果カード・次の行動のファイル（今日の図のあとに読む。グラフの絵は今日の図の story_chart.js を使う）
const RESULT_FILES = ["js/result_view.js"];
let storyLoadedCount = 0;   // 読み終わった今日の図のファイルの数
let resultLoadedCount = 0;  // 読み終わった結果カードのファイルの数

/**
 * <script> を1つ後から足して読む。受け取るもの：source＝ファイルの場所（index.html から見た）、onLoad＝読めたとき・onError＝読めなかったときに呼ぶ関数
 */
function appendScript(source, onLoad, onError) {
	const script = document.createElement("script");
	script.src = source;
	script.onload = onLoad;
	script.onerror = function () {
		script.remove();  // 失敗した <script> は外す（もう一度読むときに、同じものが2つ残らないように）
		onError();
	};
	document.body.appendChild(script);
}

/**
 * band_config.js で選んだ方法のファイルを1つだけ読む（画面が読む方法は採用した1つだけ）。
 * 受け取るもの：config＝BAND_CONFIG、onDone＝読み終えたら方法の部品を渡して呼ぶ関数、onFail＝読めなかったときに呼ぶ関数
 */
function loadMethodFile(config, onDone, onFail) {
	const source = config.methodFiles[config.methodName];
	if (!source) {
		onFail();
		return;
	}
	appendScript(source, function () {
		onDone(window.loadedBandMethod);
	}, onFail);
}

// 読み終わったファイルの数。もう一度読むときに、読めた分は読み直さないため
let laterLoadedCount = 0;

/**
 * 最初の画面のあとに読む分を、順に読む。途中で失敗したら onFail を呼び、もう一度呼ぶと失敗した所から読み直す。
 * 受け取るもの：onDone＝すべて読み終わったとき・onFail＝読めなかったときに呼ぶ関数
 */
function loadLaterFiles(onDone, onFail) {
	if (laterLoadedCount >= LATER_FILES.length) {
		onDone();
		return;
	}
	appendScript(LATER_FILES[laterLoadedCount], function () {
		laterLoadedCount++;
		loadLaterFiles(onDone, onFail);
	}, onFail);
}

/**
 * 今日の図のファイルを順に読む。受け取るもの：onDone＝全部読めたとき・onFail＝読めなかったときに呼ぶ関数。返すものは無い。
 */
function loadStoryFiles(onDone, onFail) {
	if (storyLoadedCount >= STORY_FILES.length) {
		onDone();
		return;
	}
	appendScript(STORY_FILES[storyLoadedCount], function () {
		storyLoadedCount++;
		loadStoryFiles(onDone, onFail);
	}, onFail);
}

/** 結果カードのファイルを順に読む（今日の図を読んだあとに呼ぶ）。受け取るもの・返すものは loadStoryFiles と同じ。 */
function loadResultFiles(onDone, onFail) {
	if (resultLoadedCount >= RESULT_FILES.length) {
		onDone();
		return;
	}
	appendScript(RESULT_FILES[resultLoadedCount], function () {
		resultLoadedCount++;
		loadResultFiles(onDone, onFail);
	}, onFail);
}

/**
 * 「読み込み中…」か「読み込めませんでした（もう一度読み込むボタンつき）」の表示の HTML を作る。
 * 長い期間のグラフ・答え合わせ・似た局面の欄で共通に使う。
 * 受け取るもの：kind＝"loading"（読み込み中）か "fail"（失敗）、detail＝読み込み中のときに添える文
 */
function statusMessageHtml(kind, detail) {
	if (kind === "fail") {
		return '<div class="msg" role="alert">過去のデータを読み込めませんでした。'
			+ '<button type="button" class="btn" data-act="retry">もう一度読み込む</button></div>';
	}
	return '<div class="msg" role="status"><span class="loading-dot" aria-hidden="true"></span>読み込み中…<br><span class="msg-sub">' + detail + "</span></div>";
}

/**
 * 最近の分と、それより前の分のデータを、古い順に1つにつなぐ。
 * 受け取るもの：recent＝{lastDate, dates, values}、older＝{dates, values}（まだ読んでいないときは null）
 * @returns {{lastDate:string, dates:number[], values:number[]}}
 */
function combineData(recent, older) {
	if (!older) {
		return { lastDate: recent.lastDate, dates: recent.dates, values: recent.values };
	}
	return {
		lastDate: recent.lastDate,
		dates: older.dates.concat(recent.dates),
		values: older.values.concat(recent.values),
	};
}

// Node.js（テスト）から require で使えるようにする（ブラウザでは名前がそのまま見える）
if (typeof module !== "undefined" && module.exports) {
	module.exports = { LATER_FILES, STORY_FILES, RESULT_FILES, combineData, statusMessageHtml };
}
