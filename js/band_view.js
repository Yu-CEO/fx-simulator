/*
 * band_view.js：画面の「01 この先の動く幅」を表示する（チャート・拡大図・帯の数字）
 * 主な関数：drawChart（過去の線と帯を SVG で描く）、renderBandNumbers（帯の数字2行）、statusMessageHtml（読み込み中・失敗の表示）
 * 外部ライブラリは使わず、SVG（線や形を文字で書く画像の形式）の文字を組み立てて描く。中心の線は描かない。
 * main.js から使われる。計算は band_calc.js が行い、ここでは表示だけをする。
 */

// 表示形式（format.js）。ブラウザでは先に読み込まれた関数を、Node.js（テスト）では require で読む
const BAND_VIEW_FORMAT = (typeof module !== "undefined" && module.exports) ? require("./format.js") : { formatYen };
// チャートの内側の余白（px）。左は目盛りの数字、上は「ここから先は」の2行、下は日付のための場所
const CHART_PAD = { left: 36, right: 6, top: 44, bottom: 26 };
const CHART_MIN_WIDTH = 260;      // これより狭い場所でも、260px として描いて縮める（目盛りが重ならないように）
const CHART_FALLBACK_HEIGHT = 240; // 高さが測れないとき（非表示のとき）に使う高さ
const RANGE_MARGIN_RATE = 0.06;   // 縦の範囲の上下に足す余白（範囲の6％）。線や帯が枠にくっつかないように
const RANGE_MIN_YEN = 0.5;        // 縦の範囲がこれより狭いとき（値が毎日同じなど）は上下1円ずつ広げる
const RANGE_FLAT_PAD_YEN = 1;
const GRID_STEPS = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50]; // 目盛りの間隔の候補（円）。5本以内になる最小の間隔を使う
const GRID_MAX_LINES = 5;
const GRID_STEP_FALLBACK = 100;
const LINES_PER_PIXEL = 2;        // 横1pxに描く点の上限。10年分（約2,600件）でも点の数を画面の幅×2までにする

/**
 * チャートの横・縦の大きさと、過去と「この先」の境目を決める。過去と「この先」は同じ時間の縮尺（1営業日＝同じ横幅）。
 * @returns {object} { width, height, plotWidth, plotHeight, unit, futureWidth, dividerX }
 */
function chartLayout(host, pastCount, futureDays) {
  const width = Math.max(CHART_MIN_WIDTH, host.clientWidth);
  const height = host.clientHeight || CHART_FALLBACK_HEIGHT;
  const plotWidth = width - CHART_PAD.left - CHART_PAD.right;
  const plotHeight = height - CHART_PAD.top - CHART_PAD.bottom;
  const unit = plotWidth / Math.max(1, pastCount - 1 + futureDays);
  const futureWidth = futureDays * unit;
  return { width, height, plotWidth, plotHeight, unit, futureWidth, dividerX: CHART_PAD.left + plotWidth - futureWidth };
}

/**
 * 縦の範囲（円）を決める。過去の値と広い帯がすべて入るようにする。
 * @returns {{low:number, high:number}}
 */
function valueRange(pastValues, band) {
  let low = Math.min.apply(null, pastValues);
  let high = Math.max.apply(null, pastValues);
  if (band.enough) {
    low = Math.min(low, band.wide.lower);
    high = Math.max(high, band.wide.upper);
  }
  if (high - low < RANGE_MIN_YEN) {
    low -= RANGE_FLAT_PAD_YEN;
    high += RANGE_FLAT_PAD_YEN;
  }
  const margin = (high - low) * RANGE_MARGIN_RATE;
  return { low: low - margin, high: high + margin };
}

/**
 * 過去の値の線（SVG の path の文字）を作る。点が横幅の2倍より多いときは、1pxごとに最小・最大の2点だけ残す（軽くするため）。
 */
function pastLinePath(pastValues, layout, toY) {
  const columns = Math.floor(layout.dividerX - CHART_PAD.left);
  let path = "";
  if (pastValues.length > columns * LINES_PER_PIXEL) {
    for (let column = 0; column < columns; column++) {
      const start = Math.floor((column / columns) * pastValues.length);
      const end = Math.max(start + 1, Math.floor(((column + 1) / columns) * pastValues.length));
      const part = pastValues.slice(start, end);
      const x = (CHART_PAD.left + column).toFixed(1);
      path += (column ? "L" : "M") + x + "," + toY(Math.min.apply(null, part)).toFixed(1);
      path += "L" + x + "," + toY(Math.max.apply(null, part)).toFixed(1);
    }
    return path;
  }
  for (let index = 0; index < pastValues.length; index++) {
    const x = CHART_PAD.left + index * layout.unit;
    path += (index ? "L" : "M") + x.toFixed(1) + "," + toY(pastValues[index]).toFixed(1);
  }
  return path;
}

/**
 * 帯の多角形（広い帯・狭い帯）と「この先」の下地・見出しの2行を作る。上下は同じ色で、中心の線は描かない。
 */
function bandShapes(band, layout, toY) {
  const lastDay = band.path.length - 1;
  function polygon(lowerKey, upperKey) {
    const upperPoints = [];
    const lowerPoints = [];
    for (const point of band.path) {
      const x = (layout.dividerX + (point.day / lastDay) * layout.futureWidth).toFixed(1);
      upperPoints.push(x + "," + toY(point[upperKey]).toFixed(1));
      lowerPoints.push(x + "," + toY(point[lowerKey]).toFixed(1));
    }
    return upperPoints.concat(lowerPoints.reverse()).join(" ");
  }
  const labelX = (layout.dividerX - 5).toFixed(1);
  return '<rect x="' + layout.dividerX.toFixed(1) + '" y="' + CHART_PAD.top + '" width="' + layout.futureWidth.toFixed(1)
    + '" height="' + layout.plotHeight + '" fill="var(--future-bg)"/>'
    + '<polygon points="' + polygon("wideLower", "wideUpper") + '" fill="var(--band-wide)"/>'
    + '<polygon points="' + polygon("narrowLower", "narrowUpper") + '" fill="var(--band-narrow)"/>'
    + '<text class="zone-label" x="' + labelX + '" y="14" text-anchor="end">ここから先は</text>'
    + '<text class="zone-label" x="' + labelX + '" y="31" text-anchor="end">過去の動きから計算した幅</text>';
}

/**
 * 横の目盛り線と、左の数字（円）を作る。
 */
function gridLines(range, layout, toY) {
  let step = GRID_STEP_FALLBACK;
  for (const candidate of GRID_STEPS) {
    if ((range.high - range.low) / candidate <= GRID_MAX_LINES) {
      step = candidate;
      break;
    }
  }
  let svg = "";
  for (let value = Math.ceil(range.low / step) * step; value <= range.high; value += step) {
    const y = toY(value).toFixed(1);
    const label = step < 1 ? value.toFixed(1) : String(Math.round(value));
    svg += '<line x1="' + CHART_PAD.left + '" x2="' + (layout.width - CHART_PAD.right) + '" y1="' + y + '" y2="' + y + '" stroke="var(--grid)"/>'
      + '<text class="axis num" x="' + (CHART_PAD.left - 4) + '" y="' + (Number(y) + 4) + '" text-anchor="end">' + label + "</text>";
  }
  return svg;
}

/**
 * 下の日付（最初の日・最終日）と、拡大図のときは右下の「4週間後」を作る。
 */
function axisLabels(firstDate, lastDate, layout, futureLabel) {
  const bottomY = layout.height - 6;
  let svg = '<text class="axis num" x="' + CHART_PAD.left + '" y="' + bottomY + '">' + firstDate + "</text>"
    + '<text class="axis num" x="' + (layout.dividerX - 3).toFixed(1) + '" y="' + bottomY + '" text-anchor="end">' + lastDate + "</text>";
  if (futureLabel) {
    svg += '<text class="axis" x="' + (layout.width - CHART_PAD.right) + '" y="' + bottomY + '" text-anchor="end">' + futureLabel + "</text>";
  }
  return svg;
}

/**
 * チャートを描く（本体・拡大図の両方に使う）。
 * @param {HTMLElement} host 描く場所
 * @param {object} options { values, dates（YYYY-MM-DD の文字）, band（buildBand の結果）, horizonDays, label（読み上げ用の説明）, futureLabel（拡大図の右下の文字。本体は null） }
 */
function drawChart(host, options) {
  const futureDays = options.band.enough ? options.horizonDays : 0;
  const layout = chartLayout(host, options.values.length, futureDays);
  const range = valueRange(options.values, options.band);
  function toY(value) {
    return CHART_PAD.top + ((range.high - value) / (range.high - range.low)) * layout.plotHeight;
  }
  let shapes = "";
  if (options.band.enough) {
    shapes = bandShapes(options.band, layout, toY);
  }
  const divider = '<line x1="' + layout.dividerX.toFixed(1) + '" x2="' + layout.dividerX.toFixed(1) + '" y1="4" y2="' + (layout.height - CHART_PAD.bottom)
    + '" stroke="var(--divider)" stroke-width="1.5" stroke-dasharray="3 3"/>';
  host.innerHTML = '<svg viewBox="0 0 ' + layout.width + " " + layout.height + '" role="img" aria-label="' + options.label + '">'
    + gridLines(range, layout, toY) + shapes + divider
    + '<path d="' + pastLinePath(options.values, layout, toY) + '" fill="none" stroke="var(--chart-line)" stroke-width="1.6" stroke-linejoin="round"/>'
    + axisLabels(options.dates[0], options.dates[options.dates.length - 1], layout, options.futureLabel) + "</svg>";
}

/**
 * 「読み込み中…」か「読み込めませんでした（もう一度読み込むボタンつき）」の表示の HTML を作る。
 * チャート・答え合わせ・似た局面の欄で共通に使う。
 * @param {string} kind "loading" か "fail"
 * @param {string} detail 読み込み中のときに添える文
 * @param {boolean} forChart チャートの場所に出すときは true（チャートと同じ高さにする）
 * @returns {string}
 */
function statusMessageHtml(kind, detail, forChart) {
  let className = "msg";
  if (forChart) {
    className += " chart-msg";
  }
  if (kind === "fail") {
    return '<div class="' + className + '" role="alert">過去のデータを読み込めませんでした。'
      + '<button type="button" class="btn-retry" data-act="retry">もう一度読み込む</button></div>';
  }
  return '<div class="' + className + '" role="status"><span><span class="loading-dot" aria-hidden="true"></span>読み込み中…</span>'
    + '<span class="msg-sub">' + detail + "</span></div>";
}

/**
 * 帯の数字2行（狭い帯・広い帯）を出す。データが足りないときは決まった文を出す。
 * @param {HTMLElement} container 表示する場所
 * @param {object} band buildBand の結果
 * @param {string} horizonLabel "約1か月" など
 */
function renderBandNumbers(container, band, horizonLabel) {
  if (!band.enough) {
    container.innerHTML = '<div class="msg msg-gap">データが足りないため幅を作れません（250営業日分以上が必要です）</div>';
    return;
  }
  container.innerHTML = '<dl class="bands num">'
    + "<div><dt>" + horizonLabel + "後の幅（狭い帯）</dt><dd>" + BAND_VIEW_FORMAT.formatYen(band.narrow.lower) + "〜" + BAND_VIEW_FORMAT.formatYen(band.narrow.upper) + "</dd></div>"
    + "<div><dt>" + horizonLabel + "後の幅（広い帯）</dt><dd>" + BAND_VIEW_FORMAT.formatYen(band.wide.lower) + "〜" + BAND_VIEW_FORMAT.formatYen(band.wide.upper) + "</dd></div></dl>";
}

// Node.js（テスト）から require で使えるようにする。ブラウザでは関数がそのまま見える
if (typeof module !== "undefined" && module.exports) {
  module.exports = { renderBandNumbers, statusMessageHtml };
}
