/*
 * main.js：画面の入口。流れだけを書く（細かい処理は各ファイルへ）
 * 流れ：データ確認 → 方法のファイルを読む → ① 答えの箱 → 今日の図・結果カード → 過去の分 → 「くわしく」。先の長さのボタンで表示し直す。index.html の最後に読み込まれる。
 */

const FIRST_PERIOD_DAYS = 250;   // 長い期間のグラフの最初の期間（1年）。最近の分のデータだけで描ける
const FOCUS_WAIT_MS = 400;        // なめらかに動き終わるのを待ってから、ボタンに操作の目印を移す時間（ミリ秒）
const ANSWER_HORIZON = 20;       // 答えの箱の先の長さ（営業日）。1か月で固定（「どのくらい先？」では変えない）
const HIDDEN_ON_FATAL = ["today", "try", "next", "d-bt", "d-long", "d-sim"];  // データを読み込めないときに隠す欄

// 今の表示の状態
const appState = {
	horizon: BAND_CONFIG.defaultHorizon,  // 先の長さ（営業日）。最初は1か月（20営業日）
	period: FIRST_PERIOD_DAYS,
	method: null,          // 採用した方法の部品
	recent: null,          // 最近の分のデータ（日付は YYYY-MM-DD の文字に直したもの）
	full: null,            // 全部のデータ（あとから読み終わったら入る）
	laterStatus: "loading", // あとから読む分の状態："loading"・"fail"・"ok"
	resultReady: false,    // 結果カードのファイルを読み終えたか
	backtestCache: null,
	similarCache: null,
};

/** 画面用データ（日付が数字）を、日付を文字に直した形にする。 */
function withDateTexts(data) {
	return { lastDate: data.lastDate, dates: data.dates.map(formatDateNumber), values: data.values };
}

/** id で要素を返す。 */
function byId(id) {
	return document.getElementById(id);
}

/** 全体の読み込みに失敗したとき：答えの場所に失敗の文を出し、今日の図・結果・数字の欄は隠す（注意書きと出どころは出したまま）。 */
function showFatal() {
	FxAnswerView.renderAnswerMessage(byId("hero-body"));
	for (const id of HIDDEN_ON_FATAL) {
		byId(id).hidden = true;
	}
	byId("hero-date").textContent = "";
	byId("last-date").textContent = "データの最終日：—";
}

/** 「どのくらい先？」のボタンの見た目（押されているか）を今の状態に合わせる。 */
function updateButtons() {
	document.querySelectorAll("[data-h]").forEach(function (button) {
		button.setAttribute("aria-pressed", String(Number(button.dataset.h) === appState.horizon));
	});
}

/**
 * 帯づくりに渡す追加の設定を返す。画面の値は直近280件だけなので、全期間で計算した最終日の状態（bandState）を渡す。古い状態は使わない。
 * @returns {object|undefined}
 */
function bandOptions() {
	const saved = FX_DATA_RECENT.bandState;
	if (!appState.method.stateKey || !saved || saved.lastDate !== FX_DATA_RECENT.lastDate) {
		return undefined;
	}
	const options = {};
	options[appState.method.stateKey] = saved.state;
	return options;
}

/** 先の長さ horizonDays の帯を作って返す。 */
function buildCurrentBand(horizonDays) {
	return FxBandCalc.buildBand(appState.recent.values, appState.method, horizonDays, bandOptions());
}

/** 結果カード（よくある幅・まれな幅・グラフ・読み方・答え合わせの棒）を出す。結果カードのファイルを読み終えるまでは何もしない。 */
function renderResultCard() {
	if (!appState.resultReady) {
		return;
	}
	const loaded = appState.laterStatus === "ok";
	FxResultView.renderResult(byId("res"), {
		band: buildCurrentBand(appState.horizon),
		values: appState.recent.values,
		horizonLabel: BAND_CONFIG.horizonLabels[appState.horizon],
		check: { status: appState.laterStatus, result: loaded ? appState.backtestCache.get(appState.horizon) : null },
	});
}

/** 「くわしく」の答え合わせの細かい数字・長い期間のグラフ・似た局面を出す。表示のファイルを読み終えるまでは「読み込み中…」。 */
function renderMoreCards() {
	const containers = { backtest: byId("bt-detail"), long: byId("long-body"), similar: byId("sim-body") };
	if (typeof FxMoreView === "undefined" || !appState.resultReady) {
		const html = statusMessageHtml(appState.laterStatus === "fail" ? "fail" : "loading", "表示の部品を読み込んでいます");
		containers.backtest.innerHTML = html;
		containers.long.innerHTML = html;
		containers.similar.innerHTML = html;
		return;
	}
	const loaded = appState.laterStatus === "ok";
	FxMoreView.renderMoreSections(containers, {
		band: buildCurrentBand(appState.horizon),
		horizon: appState.horizon,
		period: appState.period,
		laterStatus: appState.laterStatus,
		recent: appState.recent,
		full: appState.full,
		compareData: loaded ? FX_BAND_COMPARE : null,
		backtest: loaded ? appState.backtestCache.get(appState.horizon) : null,
		similar: loaded ? appState.similarCache.get(appState.horizon) : null,
	});
}

/** すべての欄（長さのボタン・結果カード・くわしく）を表示し直す。答えの箱は1か月で固定なので、ここでは変えない。 */
function renderAll() {
	updateButtons();
	renderResultCard();
	renderMoreCards();
}

/** 過去の分を読み終えたとき：データをつなぎ、答え合わせ・似た局面の計算を「先の長さごとに1回だけ」にする入れ物を作る。 */
function onLaterLoaded() {
	appState.full = withDateTexts(combineData(FX_DATA_RECENT, FX_DATA_OLDER));
	const values = appState.full.values;
	const scaleForDay = FxBacktestCalc.methodScaleForDay(appState.method);
	appState.backtestCache = createResultCache(function (horizon) {
		return FxBacktestCalc.runBacktest(values, horizon, scaleForDay);
	});
	appState.similarCache = createResultCache(function (horizon) {
		return FxSimilarCalc.computeSimilarReport(values, horizon);
	});
	appState.laterStatus = "ok";
	renderAll();
}

/** 過去の分などを後から読み始める（「もう一度読み込む」でも呼ぶ）。 */
function startLaterLoading() {
	appState.laterStatus = "loading";
	renderAll();
	loadLaterFiles(onLaterLoaded, function () {
		appState.laterStatus = "fail";
		renderAll();
	});
}

/** 「動きを減らす」設定がオンか。 */
function prefersReducedMotion() {
	return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** 「条件を変えてもう一度」：「どのくらい先？」の欄まで戻り、今選ばれている長さのボタンに操作の目印（フォーカス）を移す。 */
function scrollToInput() {
	byId("try").scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
	setTimeout(function () {
		byId("seg-h").querySelector('[aria-pressed="true"]').focus({ preventScroll: true });
	}, FOCUS_WAIT_MS);
}

/** ボタンが押されたときの動き（先の長さ・期間・もう一度読み込む・条件を変えてもう一度・開き直す）。 */
function onClick(event) {
	const horizonButton = event.target.closest("[data-h]");
	if (horizonButton) {
		appState.horizon = Number(horizonButton.dataset.h);
		renderAll();
		return;
	}
	const periodButton = event.target.closest("[data-p]");
	if (periodButton) {
		appState.period = Number(periodButton.dataset.p);
		renderMoreCards();
		return;
	}
	const action = event.target.closest("[data-act]");
	if (!action) {
		return;
	}
	if (action.dataset.act === "retry") {
		startLaterLoading();
	} else if (action.dataset.act === "reload") {
		location.reload();
	} else if (action.dataset.act === "again") {
		scrollToInput();
	}
}

/** 今日の図と結果カードのファイルを読み、読めたら結果カードと今日の図を出す。読めなかったときは、その欄にだけ文を出す。 */
function startStory(method) {
	const showFailure = function () {
		byId("today-msg").firstElementChild.textContent = "今日の図を読み込めませんでした。時間をおいて、ページを開き直してください。";
		byId("res").innerHTML = '<div class="msg" role="alert">結果を読み込めませんでした。時間をおいて、ページを開き直してください。</div>';
	};
	loadStoryFiles(function () {
		loadResultFiles(function () {
			appState.resultReady = true;
			renderResultCard();
			renderMoreCards();
			FxStoryView.startStoryView(FX_DATA_RECENT, method, prefersReducedMotion());
		}, showFailure);
	}, showFailure);
}

/** 最初の表示：最近の分のデータを確かめ、方法のファイルを読んでから答えを出し、そのあと今日の図・過去の分を読む。 */
function startApp() {
	document.addEventListener("click", onClick);
	if (typeof FX_DATA_RECENT === "undefined" || typeof FX_DATA_RECENT.values === "undefined") {
		showFatal();
		return;
	}
	appState.recent = withDateTexts(combineData(FX_DATA_RECENT, null));
	byId("hero-date").textContent = FxAnswerView.formatAsOfDate(FX_DATA_RECENT.lastDate);
	byId("last-date").textContent = "データの最終日：" + FX_DATA_RECENT.lastDate + "（毎日10時ごろに自動で更新）";
	document.getElementById("method-name").textContent = BAND_CONFIG.methodLabels[BAND_CONFIG.methodName];
	loadMethodFile(BAND_CONFIG, function (method) {
		appState.method = method;
		FxAnswerView.renderAnswer(byId("hero-body"), buildCurrentBand(ANSWER_HORIZON));
		startLaterLoading();
		startStory(method);
	}, showFatal);
}

startApp();
