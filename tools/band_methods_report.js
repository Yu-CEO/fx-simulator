/*
 * band_methods_report.js：帯の計算方法の比較結果を、文書（docs/band_methods.md）と画面用の小さなデータ（data/band_compare.js）に書く部分
 * 主な関数：buildMarkdown（文書の中身）、buildCompareJs（画面用データの中身）
 * tools/compare_band_methods.js から使われる。
 */

const BAND_CONFIG = require("../js/band_config.js");

// 表の％の桁（小数第1位）。帯の平均の広さは小数第2位
const PCT_DIGITS = 1;
const WIDTH_DIGITS = 2;

// 文書に載せる、各方法の式と決め方の説明
const METHOD_NOTES = {
  rolling_std: "直近250営業日の変化（対数）の標本標準偏差 σ（n−1 で割る）。S(h)＝σ×√h。",
  ewma: "直近250営業日の変化について、σ²(今日)＝λ×σ²(前日)＋(1−λ)×変化(前日)²（λ＝" + BAND_CONFIG.ewmaLambda
    + "）。最初の σ² はその250個の変化の2乗の平均。変化の平均は引かない（向きを使わないため）。S(h)＝σ×√h。",
  garch11: "σ²(翌日)＝ω＋α×変化(今日)²＋β×σ²(今日)。ω は「長い目で見た分散＝変化の2乗の平均」になるように決め（分散ターゲティング）、"
    + "α・β は当てはまりの良さ（正規分布の対数尤度）が最大になる組を、0.01 刻み→その前後を 0.001 刻みで探す（α＋β＜0.999）。"
    + "答え合わせでは、その日より前の変化だけで推定し、250営業日ごとに推定し直す。σ² は直近250営業日をたどって求め、"
    + "k 日先の分散の見込み＝長い目で見た分散＋(α＋β)^(k−1)×(翌日の分散−長い目で見た分散) を1〜h 日分足して S(h)² にする。",
  kalman_local_level: "（v3.2 の作り）見えない値 z＝1日の分散の対数が毎日ランダムに少しずつ動くだけ（ローカルレベル。傾きなし。ゆれの分散 q）とし、"
    + "観測を ln(変化²)＝z＋観測のゆれ（分散 R＝π²/2。対数カイ2乗分布を正規分布とみなす QML）としてカルマンフィルタをたどる。"
    + "最初の z は最初の250営業日の変化²の平均の対数で決め、その250営業日は尤度にも答え合わせの成績にも使わない。"
    + "q÷R の比は、7つの候補（0.00001〜0.01）から、変化 r 自体の正規分布の対数尤度 log N(r;0,x) の合計が最大のものを、"
    + "その日までのデータだけで選び、250営業日ごとに選び直す（x＝前日までのデータから求めたその日の分散の見込み＝exp(推定値＋P÷2)）。"
    + "S(h)²＝k＝1〜h の exp(推定値＋(P＋k×q)÷2) の合計（P は先へ行くほど q ずつ増える＝推定の不確かさ）。推定するのは変動の大きさだけで、値の水準・傾きは使わない。",
};

/** 旧い作り（v3.1 まで）の問題の説明（docs/band_methods.md の「改善前の問題」）を作る。legacy は kalman_legacy_check.legacyReport の結果 */
function legacySection(legacy) {
  const rowLines = legacy.rows.map(function (row) {
    return "  - 比 " + row.ratio + "：落ち着いたゲイン " + row.gain.toFixed(4) + "（EWMA の λ に直すと " + row.lambda.toFixed(4) + "）";
  });
  const chosenLine = legacy.chosenRatio === null
    ? "- 最終日に選ばれていた比：求められませんでした"
    : "- 最終日（今のデータ）に旧い作りが選んでいた比：" + legacy.chosenRatio + " → 落ち着いたゲイン " + legacy.chosenGain.toFixed(4)
      + "＝固定の重みの EWMA の λ＝" + legacy.chosenLambda.toFixed(4) + " と同じ計算";
  return [
    "## 改善前の問題（v3.1 までの方法④）",
    "- 変化の2乗 r² をそのまま観測とし、「見えない値のゆれ」と「観測のゆれ」の比を固定すると、カルマンゲインが250日のうちにほぼ一定の値に落ち着く。"
      + "その結果、**固定の重みの EWMA（方法②で λ＝1−落ち着いたゲイン としたもの）と同じ計算**になり、カルマンフィルタを使う意味がなかった",
    "- 比の候補ごとの、落ち着いたゲイン：",
    ...rowLines,
    chosenLine,
    "- v3.2 では、この問題を直すため ①尤度を log N(r;0,x) にする ②先の分散の見込みに推定の不確かさ P の増え方を入れる ③最初の値・比をその日までのデータだけで決める、に作り直した",
    "",
  ];
}

/** ％の数字を表に出す形にする。例：68.04 → "68.0％" */
function pctText(value) {
  return value.toFixed(PCT_DIGITS) + "％";
}

/** 方法の名前を、表に出す名前（番号つき）にする。例："ewma" → "② 直近を重く見た1年の動き（ewma）" */
function methodTitle(name) {
  const numbers = { rolling_std: "①", ewma: "②", garch11: "③", kalman_local_level: "④" };
  return numbers[name] + " " + BAND_CONFIG.methodLabels[name] + "（" + name + "）";
}

/** 1行（方法×先の長さ）が合格かを「合格」「—」で返す。 */
function passText(row) {
  const passes = row.all.insideNarrowPct >= BAND_CONFIG.passNarrowPct && row.all.insideWidePct >= BAND_CONFIG.passWidePct;
  return passes ? "合格" : "—";
}

/**
 * 全期間の比較の表（Markdown）を作る。
 */
function mainTable(rows, adopted) {
  const lines = [
    "| 方法 | 先の長さ | 日数 | (a) 狭い帯の中に入った割合 | (b) 広い帯の中に入った割合 | (c) 帯の平均の広さ | 合格 | 採用 |",
    "|---|---|---|---|---|---|---|---|",
  ];
  for (const row of rows) {
    lines.push("| " + [
      methodTitle(row.method), row.horizon + "営業日", row.all.total, pctText(row.all.insideNarrowPct),
      pctText(row.all.insideWidePct), row.all.meanWidthPct.toFixed(WIDTH_DIGITS) + "％", passText(row),
      row.method === adopted ? "採用" : "",
    ].join(" | ") + " |");
  }
  return lines.join("\n");
}

/**
 * 前半・後半に分けた結果の表（Markdown）を作る（たまたま合った方法を選んでいないかの確認用）。
 */
function halfTable(rows) {
  const lines = [
    "| 方法 | 先の長さ | 前半 (a) | 前半 (b) | 前半 (c) | 後半 (a) | 後半 (b) | 後半 (c) |",
    "|---|---|---|---|---|---|---|---|",
  ];
  for (const row of rows) {
    lines.push("| " + [
      methodTitle(row.method), row.horizon + "営業日",
      pctText(row.firstHalf.insideNarrowPct), pctText(row.firstHalf.insideWidePct), row.firstHalf.meanWidthPct.toFixed(WIDTH_DIGITS) + "％",
      pctText(row.secondHalf.insideNarrowPct), pctText(row.secondHalf.insideWidePct), row.secondHalf.meanWidthPct.toFixed(WIDTH_DIGITS) + "％",
    ].join(" | ") + " |");
  }
  return lines.join("\n");
}

/**
 * 採用の理由の文を作る。合格がないときは「決まりにより①のまま」と書く。
 */
function reasonText(choice) {
  if (choice.passed.length === 0) {
    return "5・10・15・20 の4つすべてで合格した方法がなかったため、決まり（合格がなければ①のまま）により①を使う";
  }
  return "5・10・15・20 の4つすべてで合格した方法（" + choice.passed.map(methodTitle).join("・")
    + "）のうち、(c) 帯の平均の広さ（4つの平均）がいちばん小さいため";
}

/**
 * docs/band_methods.md の中身を作る。
 * @param {object[]} rows compareMethods の結果
 * @param {object} choice chooseMethod の結果
 * @param {object} info { date, dataLastDate, valueCount, adopted }
 * @returns {string}
 */
function buildMarkdown(rows, choice, info) {
  const methodLines = Object.keys(METHOD_NOTES).map(function (name) { return "- " + methodTitle(name) + "：" + METHOD_NOTES[name]; });
  const widthLines = Object.keys(choice.widthByMethod).map(function (name) {
    return "- " + methodTitle(name) + "：" + choice.widthByMethod[name].toFixed(WIDTH_DIGITS) + "％" + (choice.passed.includes(name) ? "（合格）" : "（不合格）");
  });
  return [
    "# 帯の計算方法の比べ方（fx-simulator・仕様 2-2a）",
    "",
    "- 比べた日：" + info.date + "（`node tools/compare_band_methods.js` が自動で書いた文書。手で書き換えない）",
    "- 使ったデータ：画面用データ（ECB が公表した日の値・小数第3位）" + info.valueCount + " 件。最終日 " + info.dataLastDate + "。データ元：欧州中央銀行（ECB）の参照レート（Frankfurter 経由。仕様 v3.2）",
    "- 比べ方：その日より前に250営業日分、後に h 営業日分のデータがある日すべて（どの方法も同じ日の集まり）で、その日までのデータだけを使って帯を作り、h 営業日後の値を見る",
    "- 見るもの：(a) 狭い帯（±1×S(h)）の中に入った割合（目標 " + BAND_CONFIG.targetNarrowPct + "％）／(b) 広い帯（±2×S(h)）の中に入った割合（目標 "
      + BAND_CONFIG.targetWidePct + "％）／(c) 帯の平均の広さ（狭い帯の上端と下端の差 ÷ その日の値、の平均）",
    "- 合格：5・10・15・20 の4つすべてで (a) が " + BAND_CONFIG.passNarrowPct + "％以上、(b) が " + BAND_CONFIG.passWidePct
      + "％以上（1つでも下回れば不合格）。採用：合格した方法のうち、(c)（4つの平均）がいちばん小さいもの。合格がなければ①",
    "",
    "## 4つの方法（どれも「その日までの変化の一覧」を受け取り S(h) を返す。向き・傾きは使わない）",
    ...methodLines,
    "",
    ...legacySection(info.legacy),
    "## 結果（全期間）",
    mainTable(rows, info.adopted),
    "",
    "## 参考：前半・後半に分けた結果",
    halfTable(rows),
    "",
    "## 採用",
    "- 比較で選ばれた方法：" + methodTitle(choice.chosen),
    "- 画面で使っている方法（`js/band_config.js` の methodName）：" + methodTitle(info.adopted),
    "- 理由：" + reasonText(choice),
    "- (c) 帯の平均の広さ（5・10・15・20 の平均）：",
    ...widthLines,
    "- 方法を替えるときは、このツールで比べ直して作者が決め、`js/band_config.js` を書き換える（毎日の自動更新では替わらない）",
    "",
  ].join("\n");
}

/**
 * data/band_compare.js（画面の 02 の「幅の計算方法の比べ方」の表に使う小さなデータ）の中身を作る。
 * @returns {string}
 */
function buildCompareJs(rows, choice, info) {
  const compact = rows.map(function (row) {
    return {
      method: row.method,
      horizon: row.horizon,
      insideNarrowPct: Number(row.all.insideNarrowPct.toFixed(PCT_DIGITS)),
      insideWidePct: Number(row.all.insideWidePct.toFixed(PCT_DIGITS)),
      meanWidthPct: Number(row.all.meanWidthPct.toFixed(WIDTH_DIGITS)),
    };
  });
  const data = { date: info.date, dataLastDate: info.dataLastDate, chosen: choice.chosen, rows: compact };
  return "/* 自動生成：tools/compare_band_methods.js が作るファイル（帯の計算方法の比較結果。当サイトで計算）。手で書き換えない。 */\n"
    + "var FX_BAND_COMPARE = " + JSON.stringify(data) + ";\n";
}

module.exports = { buildMarkdown, buildCompareJs };
