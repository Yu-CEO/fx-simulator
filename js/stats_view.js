/*
 * stats_view.js：画面の「02 帯の答え合わせ」と「03 似た局面のその後」を表示する
 * 主な関数：renderBacktest（答え合わせの一文と2つの％）、renderCompareTable（幅の計算方法の比べ方の表）、renderSimilar（似た局面の表）
 * 計算は band_backtest_calc.js・similar_calc.js が行い、ここでは表示だけをする。
 * 安全策（仕様 2-4）：上がった・下がったは同じ見た目、矢印・色の良し悪しなし、方向を要約する文は出さない。
 * main.js から使われる（最初の画面のあとに読む）。tests/stats_view.test.js でテストする。
 */

// ブラウザでは先に読み込まれたものを、Node.js（テスト）では require で読む
const STATS_IN_NODE = typeof module !== "undefined" && module.exports;
const STATS_FORMAT = STATS_IN_NODE ? require("./format.js") : { formatPct, formatSignedPct, formatCount };
const STATS_CONFIG = STATS_IN_NODE ? require("./band_config.js") : BAND_CONFIG;
const STATS_SIMILAR = STATS_IN_NODE ? require("./similar_calc.js") : FxSimilarCalc;

/**
 * 答え合わせの結果を出す（仕様 2-3 の例どおりの一文と、同じ大きさの2枚）。
 * @param {HTMLElement} container 表示する場所
 * @param {object} result runBacktest の結果
 * @param {string} horizonLabel "4週間" など
 */
function renderBacktest(container, result, horizonLabel) {
  if (result.total === 0) {
    container.innerHTML = '<div class="msg">データが足りないため答え合わせができません</div>';
    return;
  }
  const narrow = STATS_FORMAT.formatPct(result.outsideNarrowPct);
  const wide = STATS_FORMAT.formatPct(result.outsideWidePct);
  const total = STATS_FORMAT.formatCount(result.total);
  container.innerHTML = '<p class="bt-sentence num">過去 <b>' + total + "</b> 回のうち、" + horizonLabel
    + "後の値が狭い帯の外に出たのは <b>" + narrow + "</b>、広い帯の外に出たのは <b>" + wide + "</b> でした</p>"
    + '<div class="tiles num">'
    + backtestTile("狭い帯の外に出た", narrow, total)
    + backtestTile("広い帯の外に出た", wide, total)
    + "</div>"
    + '<p class="bt-design">帯の作り：狭い帯は約3回に1回（約32％）、広い帯は約20回に1回（約5％）外に出る想定で作っています</p>';
}

/** 答え合わせの1枚（2枚とも同じ大きさ・同じ見た目）。 */
function backtestTile(label, value, total) {
  return '<div class="tile"><div class="t-label">' + label + '</div><div class="t-val">' + value
    + '</div><div class="t-help">' + total + "回のうち</div></div>";
}

/**
 * 幅の計算方法の比べ方の表を出す（仕様 2-2a・2-3）。採用した行は文字で「採用」と書き、色の良し悪しはつけない。
 * @param {HTMLElement} container 表示する場所
 * @param {object} compareData data/band_compare.js の FX_BAND_COMPARE
 * @param {number} horizonDays 先の長さ（この長さの行だけを出す）
 */
function renderCompareTable(container, compareData, horizonDays) {
  let rowsHtml = "";
  for (const row of compareData.rows) {
    if (row.horizon !== horizonDays) {
      continue;
    }
    let adopted = "";
    if (row.method === STATS_CONFIG.methodName) {
      adopted = "採用";
    }
    rowsHtml += '<tr><th scope="row">' + STATS_CONFIG.methodLabels[row.method] + "</th><td>" + STATS_FORMAT.formatPct(row.insideNarrowPct)
      + "</td><td>" + STATS_FORMAT.formatPct(row.insideWidePct) + "</td><td>" + row.meanWidthPct.toFixed(2) + "％</td><td>" + adopted + "</td></tr>";
  }
  container.innerHTML = '<h3 class="cmp-title">幅の計算方法の比べ方（当サイトで計算）</h3>'
    + '<div class="table-wrap"><table class="cmp-table num"><caption>' + STATS_CONFIG.horizonLabels[horizonDays] + "（" + horizonDays
    + "営業日）。データの最終日 " + compareData.dataLastDate + " までで比べた結果</caption>"
    + '<thead><tr><th scope="col">方法</th><th scope="col">狭い帯の中に入った割合</th><th scope="col">広い帯の中に入った割合</th>'
    + '<th scope="col">帯の平均の広さ</th><th scope="col">採用</th></tr></thead><tbody>' + rowsHtml + "</tbody></table></div>"
    + '<p class="cmp-note">帯の平均の広さ：狭い帯の上端と下端の差を、その日の値で割った％の平均です。</p>';
}

/** 割合＋件数のセル（上がった・下がった・変わらなかったで同じ見た目）。 */
function rateCountCell(percent, count) {
  return '<span class="rate">' + STATS_FORMAT.formatPct(percent) + '</span><span class="cnt">' + STATS_FORMAT.formatCount(count) + "件</span>";
}

/** 表の1行（2つの列は同じ文字・同じ色・同じ太さ）。 */
function similarRow(label, similarCell, baselineCell) {
  return '<tr><th scope="row">' + label + "</th><td>" + similarCell + "</td><td>" + baselineCell + "</td></tr>";
}

/**
 * 似た局面の表の中身（行）を作る。
 */
function similarTableRows(similar, baseline) {
  const signed = STATS_FORMAT.formatSignedPct;
  return '<tr class="group"><th colspan="3" scope="colgroup">割合と件数</th></tr>'
    + similarRow("日数", STATS_FORMAT.formatCount(similar.count) + "件", STATS_FORMAT.formatCount(baseline.count) + "件")
    + similarRow("上がった", rateCountCell(similar.upPct, similar.upCount), rateCountCell(baseline.upPct, baseline.upCount))
    + similarRow("下がった", rateCountCell(similar.downPct, similar.downCount), rateCountCell(baseline.downPct, baseline.downCount))
    + similarRow("変わらなかった", rateCountCell(similar.samePct, similar.sameCount), rateCountCell(baseline.samePct, baseline.sameCount))
    + '<tr class="group"><th colspan="3" scope="colgroup">その後の動きの散らばり（％）</th></tr>'
    + similarRow("いちばん下がった", signed(similar.min), signed(baseline.min))
    + similarRow("下位10％", signed(similar.low10), signed(baseline.low10))
    + similarRow("真ん中", signed(similar.middle), signed(baseline.middle))
    + similarRow("上位10％", signed(similar.high10), signed(baseline.high10))
    + similarRow("いちばん上がった", signed(similar.max), signed(baseline.max));
}

/**
 * 似た局面のその後を出す（仕様 2-4）。30件未満なら表を出さず、件数つきの文だけを出す。
 * 出してよい文は「全期間とほぼ同じ」の一文だけ（差が5ポイントを超えるときは何も出さない）。
 * @param {HTMLElement} container 表示する場所
 * @param {object} report computeSimilarReport の結果
 * @param {number} horizonDays 先の長さ（営業日）
 */
function renderSimilar(container, report, horizonDays) {
  if (!report.enough) {
    container.innerHTML = '<div class="msg num">似た局面が少ないため表示しません（' + STATS_FORMAT.formatCount(report.similar.count) + "件）</div>";
    return;
  }
  let nearHtml = "";
  if (report.near) {
    nearHtml = '<p class="near">上がった・下がった割合は、全期間とほぼ同じです（差 ' + STATS_SIMILAR.NEAR_BASELINE_POINTS + "ポイント以内）</p>";
  }
  container.innerHTML = '<p class="cond num">探した条件：直近20営業日の動き（' + STATS_FORMAT.formatSignedPct(report.currentMovePct)
    + "）と、約±1％の範囲で同じ動きをした過去の日</p>"
    + '<div class="table-wrap"><table class="sim-table num"><caption>' + STATS_CONFIG.horizonLabels[horizonDays] + "後（" + horizonDays
    + "営業日後）に実際どう動いたか</caption>"
    + '<thead><tr><th scope="col"><span class="vh">項目</span></th><th scope="col">似た局面</th>'
    + '<th scope="col">全期間の基準<span class="col-sub">どの日から見ても</span></th></tr></thead><tbody>'
    + similarTableRows(report.similar, report.baseline) + "</tbody></table></div>" + nearHtml;
}

// Node.js（テスト）から require で使えるようにする。ブラウザでは関数がそのまま見える
if (STATS_IN_NODE) {
  module.exports = { renderBacktest, renderCompareTable, renderSimilar };
}
