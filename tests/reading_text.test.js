/*
 * reading_text.test.js：結果の「読み方の一言」（js/reading_text.js）の自動テスト。作ったデータだけを使う
 * 受け入れ基準 AC-48（読み方の一言）・AC-54（先の値を当てる言い方がない）に対応。
 */
const test = require("node:test");
const assert = require("node:assert");
const { buildReadingText } = require("../js/result_view.js");

const narrow = { lower: 145, upper: 155 };

test("AC-48：最終日150円・よくある幅145〜155円なら「1か月でも、1ドルが上下に約5.0円動くのは「よくあること」。10万円の旅行代なら、約3,300円の差になります。」", function () {
  assert.strictEqual(buildReadingText("1か月", narrow, 150),
    "1か月でも、1ドルが上下に約5.0円動くのは「よくあること」。10万円の旅行代なら、約3,300円の差になります。");
});

test("AC-48：長さを変えると文の頭が「1週間でも…」に変わる", function () {
  const text = buildReadingText("1週間", { lower: 148, upper: 152 }, 150);
  assert.ok(text.startsWith("1週間でも、1ドルが上下に約2.0円動くのは「よくあること」。"));
  assert.ok(text.includes("約1,300円の差"));
});

test("AC-54：先の値を当てる言い方（円になる・1か月後は○円）がない", function () {
  const text = buildReadingText("1か月", narrow, 150);
  assert.ok(!/円になる|1か月後は/.test(text));
});
