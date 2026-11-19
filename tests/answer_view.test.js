/*
 * answer_view.test.js：ページ上部の答えの箱（js/answer_view.js）の自動テスト。作ったデータだけを使う
 * 受け入れ基準 AC-46（答えの箱に出るもの）・AC-47（数字）・AC-54（先の値を当てる言い方がない）に対応。
 */
const test = require("node:test");
const assert = require("node:assert");
const { buildAnswerHtml, buildAnswerMessageHtml, renderAnswer, formatAsOfDate } = require("../js/answer_view.js");
const { fakeContainer } = require("./helpers.js");

// 最終日150.000円・1か月のよくある幅145〜155円・まれな幅140〜160円の作った帯
const band = { enough: true, lastValue: 150, narrow: { lower: 145, upper: 155 }, wide: { lower: 140, upper: 160 } };

test("AC-47：答えの箱に「145.00〜155.00円」「上下に約5.0円」「だいたい 96,700〜103,300円」が出る", function () {
  const html = buildAnswerHtml(band);
  assert.ok(html.includes("145.00〜155.00<small>円</small>"));
  assert.ok(html.includes("今日の <b class=\"num\">150.00円</b> から上下に約5.0円。3回に2回くらいは、この中に入ってきました（<b>よくある幅</b>）。"));
  assert.ok(html.includes("ドル払いの旅行代が いま10万円なら"));
  assert.ok(html.includes("だいたい 96,700〜103,300円"));
});

test("AC-46：まれな幅の1行（20回に19回くらいはこの中）と、旅行代の範囲が小さく出る", function () {
  const html = buildAnswerHtml(band);
  assert.ok(html.includes("まれな幅（20回に19回くらいはこの中）：<span class=\"num\">140.00〜160.00円</span>・旅行代 <span class=\"num\">93,300〜106,700円</span>"));
});

test("AC-54：「だいたい ○〜○円」は「これまでの動き方だと」と組。先の値を当てる言い方がない", function () {
  const html = buildAnswerHtml(band);
  assert.ok(html.includes("これまでの動き方だと、1か月で動く幅は だいたい"));
  assert.ok(!/になる|1か月後は/.test(html));
});

test("AC-46：データが足りない日は決まった文、読み込めない日は「開き直す」ボタンつきの文", function () {
  const container = fakeContainer();
  renderAnswer(container, { enough: false });
  assert.ok(container.innerHTML.includes("データが足りないため、幅を作れません（約1年分のデータが必要です）。<br>自動で毎朝データを足しています。"));
  const fatal = buildAnswerMessageHtml("fatal");
  assert.ok(fatal.includes("データを読み込めませんでした。<br>時間をおいて、ページを開き直してください。") && fatal.includes('data-act="reload"') && fatal.includes("開き直す"));
});

test("AC-46：日付の1行は「○月○日の値・毎朝更新」", function () {
  assert.strictEqual(formatAsOfDate("2026-11-17"), "11月17日の値・毎朝更新");
});

test("AC-53：金額の桁が多い帯（150円が1,500円の値）でも NaN などが出ず、折り返せる作りの文字になる", function () {
  const big = buildAnswerHtml({ enough: true, lastValue: 1500, narrow: { lower: 1450, upper: 1550 }, wide: { lower: 1400, upper: 1600 } });
  assert.ok(!big.includes("NaN") && !big.includes("Infinity"));
  assert.ok(big.includes("1450.00〜1550.00"));
});
