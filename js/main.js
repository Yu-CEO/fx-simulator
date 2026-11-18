/*
 * main.js：画面の入口。流れだけを書く（細かい処理は各ファイルに任せる）
 * 流れ：最近の分のデータを確かめる → 採用した方法のファイルを読む → 01（チャートと帯）を表示
 *       → 過去約9年分などを後から読む → 02（答え合わせ）・03（似た局面）を表示
 * 先の長さ・期間のボタンが押されたら表示し直す。答え合わせ・似た局面は先の長さごとに1回だけ計算して覚えておく。
 * index.html の最後に読み込まれる。使うファイル：format.js・band_config.js・band_calc.js・data_loader.js・band_view.js（あとから stats_view.js など）
 */

// 期間のボタンの値（営業日）と名前。250営業日＝約1年
const PERIOD_LABELS = { 250: "1年", 750: "3年", 2500: "10年" };
const FIRST_PERIOD_DAYS = 250;   // 最初に表示する期間（1年）。最近の分のデータだけで描ける
const ZOOM_PAST_DAYS = 60;       // 拡大図に出す過去の日数（直近約3か月）
const RESIZE_WAIT_MS = 120;      // 画面の大きさが変わってから描き直すまで待つ時間（ミリ秒）。動かしている間に何度も描かないため

// 今の表示の状態
const appState = {
  horizon: BAND_CONFIG.defaultHorizon,  // 先の長さ（営業日）。最初は4週間（20営業日）
  period: FIRST_PERIOD_DAYS,
  method: null,          // 採用した方法の部品
  recent: null,          // 最近の分のデータ（日付は YYYY-MM-DD の文字に直したもの）
  full: null,            // 全部のデータ（あとから読み終わったら入る）
  laterStatus: "loading", // あとから読む分の状態："loading"・"fail"・"ok"
  backtestCache: null,
  similarCache: null,
};

/** 画面用データ（日付が数字）を、日付を文字に直した形にする。 */
function withDateTexts(data) {
  return { lastDate: data.lastDate, dates: data.dates.map(formatDateNumber), values: data.values };
}

/** 全体の読み込みに失敗したとき：失敗の箱だけを出し、他の欄は隠す（注意書きと出どころは出したまま）。 */
function showFatal() {
  document.getElementById("fatal").hidden = false;
  for (const id of ["horizon", "sec-band", "sec-bt", "sec-sim"]) {
    document.getElementById(id).hidden = true;
  }
  document.getElementById("last-date").textContent = "データの最終日：—";
}

/** ボタンの見た目（押されているか）を今の状態に合わせる。 */
function updateButtons() {
  document.querySelectorAll("[data-h]").forEach(function (button) {
    button.setAttribute("aria-pressed", String(Number(button.dataset.h) === appState.horizon));
  });
  document.querySelectorAll("[data-p]").forEach(function (button) {
    button.setAttribute("aria-pressed", String(Number(button.dataset.p) === appState.period));
  });
}

/** 01 の本体のチャートを描く。3年・10年は、過去の分を読み終えるまで「読み込み中…」を出す。 */
function renderMainChart(band) {
  const host = document.getElementById("chart");
  const needsOlder = appState.period > FIRST_PERIOD_DAYS;
  if (needsOlder && appState.laterStatus !== "ok") {
    host.innerHTML = statusMessageHtml(appState.laterStatus, PERIOD_LABELS[appState.period] + "分のデータを読み込んでいます", true);
    return;
  }
  const data = needsOlder ? appState.full : appState.recent;
  const count = Math.min(appState.period, data.values.length);
  const horizonLabel = BAND_CONFIG.horizonLabels[appState.horizon];
  let label = "米ドル／円の過去" + PERIOD_LABELS[appState.period] + "の値";
  if (band.enough) {
    label += "と、データの最終日から" + horizonLabel + "先までの狭い帯・広い帯";
  }
  drawChart(host, {
    values: data.values.slice(-count), dates: data.dates.slice(-count), band, horizonDays: appState.horizon, label, futureLabel: null,
  });
}

/** 01 の拡大図（直近約3か月＋この先）を描く。最近の分だけで描けるので「読み込み中」にならない。データが足りないときは隠す。 */
function renderZoomChart(band) {
  const box = document.getElementById("zoom-box");
  box.hidden = !band.enough;
  if (!band.enough) {
    return;
  }
  const data = appState.recent;
  const horizonLabel = BAND_CONFIG.horizonLabels[appState.horizon];
  drawChart(document.getElementById("chart-zoom"), {
    values: data.values.slice(-ZOOM_PAST_DAYS), dates: data.dates.slice(-ZOOM_PAST_DAYS), band, horizonDays: appState.horizon,
    label: "拡大図：米ドル／円の直近約3か月の値と、データの最終日から" + horizonLabel + "先までの狭い帯・広い帯",
    futureLabel: horizonLabel + "後",
  });
}

/**
 * 帯づくりに渡す追加の設定を返す。画面の値は直近270件だけなので、全期間で計算した最終日の状態（usdjpy_recent.js の bandState。
 * tools/add_band_state.js が作る）がある方法では、それを渡す。最終日が違う（古い）状態は使わない。
 * @returns {object|undefined} 例：{ kalmanState: {...} }。状態を使わない方法・状態が無いときは undefined
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

/** 01 全体（チャート・拡大図・帯の数字）を表示する。 */
function renderBandSection() {
  const band = FxBandCalc.buildBand(appState.recent.values, appState.method, appState.horizon, bandOptions());
  renderMainChart(band);
  renderZoomChart(band);
  renderBandNumbers(document.getElementById("band-out"), band, BAND_CONFIG.horizonLabels[appState.horizon]);
}

/** 02・03 を表示する。過去の分を読み終えるまでは「読み込み中…」、失敗したら「もう一度読み込む」を出す。 */
function renderStatsSections() {
  const backtestOut = document.getElementById("bt-out");
  const compareOut = document.getElementById("cmp-out");
  const similarOut = document.getElementById("sim-out");
  if (appState.laterStatus !== "ok") {
    backtestOut.innerHTML = statusMessageHtml(appState.laterStatus, "過去約10年分で答え合わせをしています", false);
    similarOut.innerHTML = statusMessageHtml(appState.laterStatus, "過去約10年分から探しています", false);
    compareOut.innerHTML = "";
    return;
  }
  const horizonLabel = BAND_CONFIG.horizonLabels[appState.horizon];
  renderBacktest(backtestOut, appState.backtestCache.get(appState.horizon), horizonLabel);
  renderCompareTable(compareOut, FX_BAND_COMPARE, appState.horizon);
  renderSimilar(similarOut, appState.similarCache.get(appState.horizon), appState.horizon);
}

/** すべての欄を表示し直す。 */
function renderAll() {
  updateButtons();
  renderBandSection();
  renderStatsSections();
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

/** ボタンが押されたときの動き（先の長さ・期間・もう一度読み込む・開き直す）。 */
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
    updateButtons();
    renderBandSection();
    return;
  }
  const action = event.target.closest("[data-act]");
  if (action && action.dataset.act === "retry") {
    startLaterLoading();
  } else if (action && action.dataset.act === "reload") {
    location.reload();
  }
}

/** 最初の表示：最近の分のデータを確かめ、方法のファイルを読んでから 01 を出し、そのあと過去の分を読む。 */
function startApp() {
  document.addEventListener("click", onClick);
  if (typeof FX_DATA_RECENT === "undefined" || typeof FX_DATA_RECENT.values === "undefined") {
    showFatal();
    return;
  }
  appState.recent = withDateTexts(combineData(FX_DATA_RECENT, null));
  document.getElementById("last-date").textContent = "データの最終日：" + FX_DATA_RECENT.lastDate + "（毎日10時ごろに自動で更新）";
  document.getElementById("method-name").textContent = BAND_CONFIG.methodLabels[BAND_CONFIG.methodName];
  loadMethodFile(BAND_CONFIG, function (method) {
    appState.method = method;
    startLaterLoading();
  }, showFatal);
  let resizeTimer = null;
  window.addEventListener("resize", function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      if (appState.method) {
        renderBandSection();
      }
    }, RESIZE_WAIT_MS);
  });
}

startApp();
