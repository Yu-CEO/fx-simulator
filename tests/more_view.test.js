/*
 * more_view.test.js：「くわしく知りたい人へ」の数字・図が入る畳み（js/more_view.js）の自動テスト。作ったデータだけを使う
 * 受け入れ基準 AC-2（長い期間のグラフの期間ボタン）・AC-9a（似た局面の見出しと常に出す文）・AC-23（読み込み中の表示）・AC-50（言い換えと組）に対応。
 */
const test = require("node:test");
const assert = require("node:assert");
const { buildBacktestDetailHtml, buildSimilarDetailHtml, buildLongChartHtml } = require("../js/more_view.js");
const { computeSimilarReport } = require("../js/similar_calc.js");
const { randomWalkValues } = require("./helpers.js");

const enough = { enough: true };

test("AC-2：長い期間のグラフに「1年」「3年」「10年」が出て、選ばれている期間だけ押された見た目。3年・10年は読み込み中なら待ち表示", function () {
  const html = buildLongChartHtml({ band: enough, laterStatus: "ok", horizon: 20, period: 250 });
  assert.ok(html.includes('data-p="250" aria-pressed="true">1年') && html.includes('data-p="750" aria-pressed="false">3年') && html.includes('data-p="2500" aria-pressed="false">10年'));
  assert.ok(html.includes('id="chart"') && html.includes("今日から1か月先までの幅です"));
  const waiting = buildLongChartHtml({ band: enough, laterStatus: "loading", horizon: 20, period: 750 });
  assert.ok(waiting.includes("読み込み中…") && !waiting.includes('id="chart"'));
  assert.ok(buildLongChartHtml({ band: enough, laterStatus: "loading", horizon: 20, period: 250 }).includes('id="chart"'), "1年は最近の分だけで描ける");
});

test("AC-9a：似た局面に見出し・何を数えたかの説明・常に出す文が出る。「％の例」は表があるときだけ", function () {
  const report = computeSimilarReport(randomWalkValues(900, 0.006, 5), 20);
  const html = buildSimilarDetailHtml({ band: enough, laterStatus: "ok", horizon: 20, similar: report });
  assert.ok(html.includes("似た局面のその後（過去の集計。この先を示すものではありません）"));
  assert.ok(html.includes("直近1か月と同じくらい動いた日（±1％くらい）を過去から探して、その1か月後にどれだけ動いたかを数えました。右の列は、似ているかに関係なく、すべての日で数えたものです。"));
  assert.ok(html.includes("過去の事実を数えただけです。重なった期間も別々に数えています。この先が同じになるとは限りません。"));
  assert.strictEqual(html.includes("％の例：−3.0％は、150円が145.50円になったということです。"), report.enough);
});

test("AC-9d：似た局面が30件未満なら表を出さず件数つきの文だけ（％の例は出さない）", function () {
  const html = buildSimilarDetailHtml({ band: enough, laterStatus: "ok", horizon: 20, similar: { enough: false, similar: { count: 12 } } });
  assert.ok(html.includes("似た局面が少ないため表示しません（12件）") && !html.includes("％の例"));
});

test("AC-23：過去の分を読み込み中のあいだ、答え合わせの細かい数字・似た局面は「読み込み中…」。失敗すると「もう一度読み込む」", function () {
  assert.ok(buildBacktestDetailHtml({ band: enough, laterStatus: "loading", horizon: 20 }).includes("読み込み中…"));
  const fail = buildSimilarDetailHtml({ band: enough, laterStatus: "fail", horizon: 20 });
  assert.ok(fail.includes("もう一度読み込む") && fail.includes('data-act="retry"'));
});

test("AC-50：くわしくの中で「狭い帯」「広い帯」は「よくある幅（狭い帯）」のように言い換えと組で出る", function () {
  const html = buildBacktestDetailHtml({
    band: enough, laterStatus: "ok", horizon: 20, backtest: { total: 100, outsideNarrowPct: 30, outsideWidePct: 5 },
    compareData: { dataLastDate: "2026-11-17", rows: [] },
  });
  assert.ok(html.includes("狭い帯（よくある幅）") && html.includes("広い帯（まれな幅）"));
  assert.ok(!html.replace(/狭い帯（よくある幅）/g, "").includes("狭い帯"), "狭い帯は言い換えと組");
  assert.ok(!html.replace(/広い帯（まれな幅）/g, "").includes("広い帯"), "広い帯は言い換えと組");
});
