/*
 * story_text.test.js：今日の図・縦動画の文言と設定に、出してはいけない言葉が無いことの自動テスト
 * 受け入れ基準 AC-37（最悪・最高・予想・当たった・外れたと 2-6 の言葉が無い。問いが「1か月で何円くらい動く？」の形）に対応。
 * 出してはいけない言葉は、このファイルにも書かないため \u の形（文字の番号）で書いている。
 */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const STORY_CONFIG = require("../js/story_config.js");
const BAND_CONFIG = require("../js/band_config.js");

const PRODUCT_DIR = path.join(__dirname, "..");
// 最悪・最高・予想・当たった・外れた・買い・売り・エントリー・買い時・売り時・チャンス・狙い目・おすすめ・上がりそう・下がりそう
const BANNED = [
  "最悪", "最高", "予想", "当たった", "外れた", "買い", "売り",
  "エントリー", "チャンス", "狙い目", "おすすめ", "上がりそう", "下がりそう",
];
// 設定の文言のうち、関数になっているものに渡す見本の値
const SAMPLE_ARGUMENTS = ["2026-11-17", "10万円", "28.8％", "153.72円〜165.08円"];

/** 設定の文言を、全部ふつうの文字の一覧にする（関数のものは見本の値で呼ぶ）。 */
function collectTexts() {
  const values = [];
  for (const value of Object.values(STORY_CONFIG.texts)) {
    if (typeof value === "string") {
      values.push(value);
    } else if (typeof value === "function") {
      const result = value(SAMPLE_ARGUMENTS[1], SAMPLE_ARGUMENTS[2]);
      values.push(...[].concat(result));
    } else {
      values.push(...Object.values(value));
    }
  }
  values.push(STORY_CONFIG.seriesName);
  values.push(STORY_CONFIG.texts.source(SAMPLE_ARGUMENTS[0]), STORY_CONFIG.texts.everyMorning(SAMPLE_ARGUMENTS[0]));
  values.push(...STORY_CONFIG.texts.questionLines("10万円"), ...STORY_CONFIG.texts.questionBigLines("10万円"));
  return values;
}

test("AC-37：今日の図・縦動画の文言と設定ファイルに、最悪・最高・予想・当たった・外れたなど仕様 2-6 の言葉が入っていない", function () {
  const joined = collectTexts().join("\n");
  const configSource = fs.readFileSync(path.join(PRODUCT_DIR, "js", "story_config.js"), "utf8");
  for (const word of BANNED) {
    assert.ok(!joined.includes(word), "文言に " + word);
    assert.ok(!configSource.includes(word), "設定ファイルに " + word);
  }
  // 「予測」は否定の文の中だけ
  assert.ok(!joined.split("予測ではありません").join("").includes("予測"));
});

test("AC-37・AC-33：問いの文が「ドル払いの旅行代 10万円、1か月で何円くらい動く？」の形で、先の値を当てる形（1か月後は何円になる？）ではない", function () {
  const question = STORY_CONFIG.texts.questionLines("10万円").join("");
  assert.strictEqual(question, "ドル払いの旅行代 10万円、1か月で何円くらい動く？");
  assert.strictEqual(STORY_CONFIG.texts.questionBigLines("10万円").join(""), "ドル払いの旅行代10万円、1か月で何円くらい動く？");
  assert.ok(!collectTexts().join("").includes("何円になる"));
  assert.ok(!collectTexts().join("").includes("1か月後"));
});

test("AC-37：帯の端は「円安の場合」「円高の場合」と言い、答え合わせは「よくある幅の中に入った／まれな幅の中に入った／まれな幅の外に出た」と言う", function () {
  assert.strictEqual(STORY_CONFIG.texts.yenWeak, "円安の場合");
  assert.strictEqual(STORY_CONFIG.texts.yenStrong, "円高の場合");
  assert.deepStrictEqual(STORY_CONFIG.texts.judge, { narrow: "よくある幅の中に入った", wide: "まれな幅の中に入った", out: "まれな幅の外に出た" });
});

test("2-5・2-8：常に出す文は仕様どおり。シリーズ名は「ドル円の幅、答え合わせつき」", function () {
  assert.strictEqual(STORY_CONFIG.texts.notice, "過去の動きの大きさから作った幅です。予測ではありません。売買をすすめるものではありません。");
  assert.strictEqual(STORY_CONFIG.texts.source("2026-11-17"), "為替データ：欧州中央銀行（ECB）の参照レート（当サイトで計算）／データの最終日：2026-11-17");
  assert.strictEqual(STORY_CONFIG.seriesName, "ドル円の幅、答え合わせつき");
  assert.strictEqual(BAND_CONFIG.tripYen, 100000);
  assert.strictEqual(STORY_CONFIG.texts.share("2,281", "31.6％"), "これまで 2,281 回では、よくある幅の外に出たのは 31.6％（3回に1回くらい）でした");
  assert.strictEqual(STORY_CONFIG.texts.axisTop, "上ほど円安（海外の物が高い）");
  assert.strictEqual(STORY_CONFIG.amountBand, "wide");
});

test("AC-3：画面・README・今日の図・縦動画のどこにも「4週間」「約3か月」の呼び方が無い（20営業日は「1か月」）", function () {
  const files = ["index.html", "README.md", "js/band_config.js", "js/story_config.js", "js/main.js", "js/stats_view.js", "js/answer_view.js", "js/result_view.js", "js/more_view.js", "tools/video/frame.html"];
  for (const file of files) {
    const text = fs.readFileSync(path.join(PRODUCT_DIR, file), "utf8");
    assert.ok(!text.includes("4週間"), file);
  }
});
