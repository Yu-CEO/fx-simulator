/*
 * wording.test.js：画面・README・コードのコメントの言葉と、外部への読み込み・リンクの自動テスト
 * 受け入れ基準 AC-11・AC-12・AC-13・AC-14・AC-16・AC-31 に対応。
 * 「画面に出さない言葉」はこのファイルにも書かないため、\u の形（文字の番号）で書いている。
 */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const BAND_CONFIG = require("../js/band_config.js");

const PRODUCT_DIR = path.join(__dirname, "..");
// 仕様 2-6 の言葉（\u の形）
const BANNED_WORDS = [
  "買い", "売り", "エントリー", "チャンス", "狙い目",
  "おすすめ", "上がりそう", "下がりそう", "予想",
];
const LIMITED_WORD = "予測";  // 決まった否定の文の中でだけ使ってよい言葉
const ALLOWED_PHRASES = ["予測ではありません", "予測・保証するものではなく"];

/** 調べるファイル（画面・README・コード）。tests と docs（仕様書など）は除く */
function listCheckedFiles() {
  const files = ["index.html", "README.md", "css/style.css"];
  for (const folder of ["js", "js/band_methods", "tools", ".github/workflows"]) {
    const full = path.join(PRODUCT_DIR, folder);
    if (!fs.existsSync(full)) {
      continue;
    }
    for (const name of fs.readdirSync(full)) {
      if (/\.(js|py|yml)$/.test(name)) {
        files.push(folder + "/" + name);
      }
    }
  }
  return files;
}

test("AC-13：画面に出さない言葉が、画面・README・コードのコメントに無い（限られた言葉は決まった否定の文だけ）", function () {
  for (const file of listCheckedFiles()) {
    let text = fs.readFileSync(path.join(PRODUCT_DIR, file), "utf8");
    for (const word of BANNED_WORDS) {
      assert.ok(!text.includes(word), file + " に使えない言葉があります");
    }
    for (const phrase of ALLOWED_PHRASES) {
      text = text.split(phrase).join("");
    }
    assert.ok(!text.includes(LIMITED_WORD), file + " で決まった文の外に使われています");
  }
});

test("AC-12：上部・下部の注意書き、帯のそばと似た局面の常に出す文が文言どおりある", function () {
  const html = fs.readFileSync(path.join(PRODUCT_DIR, "index.html"), "utf8");
  const required = [
    "為替がどれくらいの幅で動くものかを、過去のデータで学ぶためのツールです。売買のタイミングや方向を示すものではありません。",
    "このツールは、過去の為替データを決まった計算式で集計・表示するだけのものです。将来の値動きを予測・保証するものではなく、特定の商品・取引・業者をすすめるものでもありません。FX（外国為替証拠金取引）は元本を超える損失が出ることがあります。実際の判断はご自身の責任で行ってください。",
    "過去の事実を数えただけです。重なった期間も別々に数えています。この先が同じになるとは限りません。",
    "）から作った幅です。予測ではありません。",
  ];
  for (const sentence of required) {
    assert.ok(html.includes(sentence), sentence);
  }
});

test("AC-31：帯のそばの文の「計算方法：○○」は、採用した方法の短い名前（main.js が band_config.js から入れる）", function () {
  const html = fs.readFileSync(path.join(PRODUCT_DIR, "index.html"), "utf8");
  assert.ok(html.includes("過去の動きの大きさ（計算方法：<span id=\"method-name\">" + BAND_CONFIG.methodLabels[BAND_CONFIG.methodName] + "</span>）から作った幅です。予測ではありません。"));
  const main = fs.readFileSync(path.join(PRODUCT_DIR, "js", "main.js"), "utf8");
  assert.ok(main.includes('getElementById("method-name").textContent = BAND_CONFIG.methodLabels[BAND_CONFIG.methodName]'));
});

test("AC-11：ページ下部に出典・データの性質・当サイトで計算・データの最終日がある", function () {
  const html = fs.readFileSync(path.join(PRODUCT_DIR, "index.html"), "utf8");
  assert.ok(html.includes("為替データ：欧州中央銀行（ECB）の参照レート（<a href=\"https://frankfurter.dev/\""));
  assert.ok(!html.includes("集約"));
  assert.ok(html.includes("欧州中央銀行が1日1回公表する参照レートです。米ドル／円は、ユーロ基準の値から Frankfurter が計算し、当サイトで小数第3位に丸めたものです。リアルタイムの値ではありません。土日と欧州中央銀行の休業日の値はありません。データの正確さは保証されません。"));
  assert.ok(html.includes("帯・答え合わせ・似た局面の数字は、上のデータをもとに当サイトで計算したものです。"));
  assert.ok(html.includes('id="last-date"'));
});

test("AC-14・AC-16：リンクは Frankfurter と portal だけ。外部のスクリプト・CSS・フォント・画像を読み込まない", function () {
  const html = fs.readFileSync(path.join(PRODUCT_DIR, "index.html"), "utf8");
  const links = html.match(/https?:\/\/[^"'\s)]+/g) || [];
  for (const link of links) {
    assert.ok(link === "https://frankfurter.dev/" || link === "https://yu-ceo.github.io/", link);
  }
  assert.ok(!/<(script|link|img)[^>]+(src|href)="(https?:)?\/\//.test(html));
  const css = fs.readFileSync(path.join(PRODUCT_DIR, "css", "style.css"), "utf8");
  assert.ok(!/@import|url\(|@font-face/.test(css));
  for (const file of listCheckedFiles().filter(function (name) { return name.startsWith("js/"); })) {
    assert.ok(!/fetch\(|XMLHttpRequest|https?:\/\//.test(fs.readFileSync(path.join(PRODUCT_DIR, file), "utf8")), file);
  }
});
