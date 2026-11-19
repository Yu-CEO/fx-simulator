/*
 * story_view.test.js：サイトの今日の図（story_view.js）と index.html・css の置き場所の自動テスト
 * 受け入れ基準 AC-38（動きを減らす設定）・AC-40（足りない日の文）・AC-40b（置き場所と「この図の見方」の位置）・AC-32（⑤シリーズ名）に対応。
 */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const STORY_CONFIG = require("../js/story_config.js");
const { playbackPlan } = require("../js/story_view.js");

const PRODUCT_DIR = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(PRODUCT_DIR, "index.html"), "utf8");
const css = fs.readFileSync(path.join(PRODUCT_DIR, "css", "style.css"), "utf8");

test("AC-38：「動きを減らす」がオンのときは動かさず、最後の絵の時刻だけを出す。オフのときは最初から動かす", function () {
  assert.deepStrictEqual(playbackPlan(true), { animate: false, startTime: STORY_CONFIG.totalSeconds });
  assert.deepStrictEqual(playbackPlan(false), { animate: true, startTime: 0 });
  const main = fs.readFileSync(path.join(PRODUCT_DIR, "js", "main.js"), "utf8");
  assert.ok(main.includes("prefers-reduced-motion: reduce"), "main.js が OS の設定を読む");
});

test("AC-40：足りない日の文は「データが足りないため、今日の図を作れません。」", function () {
  assert.strictEqual(STORY_CONFIG.texts.notEnough, "データが足りないため、今日の図を作れません。");
});

test("AC-40b：今日の図は紺の帯（hero）のすぐ下・先の長さの上。「この図の見方」は図（story）のあとにある", function () {
  const hero = html.indexOf('class="hero"');
  const today = html.indexOf('id="today"');
  const horizon = html.indexOf('id="try"');
  assert.ok(hero >= 0 && hero < today && today < horizon);
  const between = html.slice(html.indexOf("</header>"), html.lastIndexOf("<section", today));
  assert.ok(!/<section/.test(between), "紺の帯と今日の図のあいだに別の欄が無い");
  const story = html.indexOf('id="story"', today);
  const how = html.indexOf("この図の見方", today);
  assert.ok(story > 0 && how > story && how < horizon, "「この図の見方」は図の下");
});

test("AC-40b：「この図の見方」を横の細い列に置かない（PC幅でも図の下。横並びの設定が無い）", function () {
  const todayRules = css.split("\n").filter(function (line) { return line.includes(".today") || line.includes(".how") || line.includes(".story"); });
  assert.ok(todayRules.length > 0);
  for (const line of todayRules) {
    assert.ok(!/grid-template-columns|flex-direction:\s*row|float:/.test(line), line);
  }
  const wideRule = css.slice(css.indexOf("@media (min-width:720px){.today"), css.indexOf("@media (min-width:720px){.today") + 80);
  assert.ok(wideRule.includes(".today{padding") && !/grid-template-columns/.test(wideRule));
  assert.match(html, /<h3>この図の見方<\/h3>/);
});

test("AC-32：「もう一度見る」ボタン・進みの線・動きを減らす注記が index.html にある。今日の図の読み込み先は最初の表示に入れない", function () {
  for (const id of ["btn-replay", "story-prog", "rm-note", "today-msg", "today-body", "story"]) {
    assert.ok(html.includes('id="' + id + '"'), id);
  }
  assert.ok(html.includes("もう一度見る"));
});
