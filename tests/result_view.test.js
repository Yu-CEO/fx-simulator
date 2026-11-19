/*
 * result_view.test.js：結果カード（js/result_view.js）の自動テスト。作ったデータだけを使う
 * 受け入れ基準 AC-1（帯の数字の形・中心線がない）・AC-23（答え合わせの読み込み中・失敗の文）・AC-31（短い注意1行）・AC-49（答え合わせの棒）・AC-50（「狭い帯」が単独で出ない）に対応。
 */
const test = require("node:test");
const assert = require("node:assert");
const BAND_CONFIG = require("../js/band_config.js");
const { buildBand } = require("../js/band_calc.js");
const { buildResultHtml, buildCheckHtml } = require("../js/result_view.js");
const { fixedScaleMethod, valuesEndingAt, MIN_COUNT } = require("./story_helpers.js");

const values = valuesEndingAt(MIN_COUNT + 30, 150, 150);
const band = buildBand(values, fixedScaleMethod(0.004), 20);
const backtest = { total: 2288, outsideNarrowPct: 31.5, outsideWidePct: 5.5, insideNarrowPct: 68.5, insideWidePct: 94.5 };
const baseInput = { band, values, horizonLabel: "1か月", check: { status: "ok", result: backtest } };

test("AC-1：結果に「1か月後の よくある幅」「1か月後の まれな幅」の数字と旅行代が出る。帯の中心に線は描かれない", function () {
  const html = buildResultHtml(baseInput);
  assert.ok(html.includes("1か月後の よくある幅<span>3回に2回くらいはこの中</span>"));
  assert.ok(html.includes("1か月後の まれな幅<span>20回に19回くらいはこの中</span>"));
  assert.ok(html.includes("ドル払いの旅行代が いま10万円なら"));
  assert.ok(html.includes("<svg viewBox") && html.includes("よくある幅") && html.includes("まれな幅"));
  assert.ok(!/center|中心/.test(html));
});

test("AC-31・AC-12：結果のすぐ下に短い注意1行と「当サイトで計算」の札が常に出る（方法名は出ない）", function () {
  const html = buildResultHtml(baseInput);
  assert.ok(html.includes("過去の動きの大きさから作った幅です。予測ではありません。売買の判断には使えません。<span class=\"tag\">当サイトで計算</span>"));
  assert.ok(!html.includes("カルマン") && !html.includes(BAND_CONFIG.methodLabels[BAND_CONFIG.methodName]));
});

test("AC-48：読み方の一言が結果に入る", function () {
  assert.match(buildResultHtml(baseInput), /<p class="reading"><span class="r-lab">読み方<\/span>1か月でも、1ドルが上下に約[\d.]+円動くのは「よくあること」。10万円の旅行代なら、約[\d,]+円の差になります。/);
});

test("AC-49：答え合わせの棒は、中に入った割合＝100％−外に出た割合（68.5％・94.5％）で、同じ色の棒", function () {
  const html = buildCheckHtml({ status: "ok", result: backtest }, "1か月");
  assert.ok(html.includes("これまで <b class=\"num\">2,288</b> 回、同じ作り方で幅を作って1か月後を見ると："));
  assert.ok(html.includes("よくある幅の中に入った：<b class=\"num\">68.5％</b>（3回に2回くらい）"));
  assert.ok(html.includes("まれな幅の中に入った：<b class=\"num\">94.5％</b>（20回に19回くらい）"));
  assert.ok(html.includes('style="width:68.5%"') && html.includes('style="width:94.5%"'));
  assert.ok(html.includes("外に出ることもあります。細かい数字と計算方法の比べ方は、下の「くわしく知りたい人へ」にあります。"));
});

test("AC-23：答え合わせの読み込み中・失敗の文（「もう一度読み込む」ボタンつき）", function () {
  assert.ok(buildCheckHtml({ status: "loading" }, "1か月").includes("答え合わせを計算中…（過去のデータを読み込んでいます）"));
  const fail = buildCheckHtml({ status: "fail" }, "1か月");
  assert.ok(fail.includes("過去のデータを読み込めませんでした。上の幅はそのまま見られます。") && fail.includes("もう一度読み込む") && fail.includes('data-act="retry"'));
});

test("AC-6：データが足りないときは結果の代わりに決まった文", function () {
  const html = buildResultHtml({ band: { enough: false }, values: [], horizonLabel: "1か月", check: { status: "loading" } });
  assert.ok(html.includes("データが足りないため、幅を作れません（約1年分のデータが必要です）。"));
});

test("AC-50：「狭い帯」「広い帯」が単独で出る所がない（結果カードには出ない）", function () {
  assert.ok(!/狭い帯|広い帯/.test(buildResultHtml(baseInput)));
});
