/*
 * similar_calc.test.js：js/similar_calc.js（似た局面のその後・仕様 2-4）と、その表示の自動テスト
 * 受け入れ基準 AC-8・AC-8a・AC-9・AC-9a〜9e に対応。作ったデータ（仮の数字）だけを使う。
 */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const calc = require("../js/similar_calc.js");
const { renderSimilar } = require("../js/stats_view.js");
const { randomWalkValues, fakeContainer } = require("./helpers.js");

/** 周期のある値の列（20営業日の動きが何度も同じになるので、似た局面がたくさんある） */
function wavyValues(count) {
  const values = [];
  for (let index = 0; index < count; index++) {
    values.push(Math.round(100 * Math.exp(0.03 * Math.sin((2 * Math.PI * index) / 37)) * 1000) / 1000);
  }
  return values;
}

/** 見せかけの集計（割合だけを決めたもの）。表示のテストに使う */
function fakeSummary(count, upCount, downCount) {
  return calc.summarizeOutcomes(
    new Array(upCount).fill(1).concat(new Array(downCount).fill(-1), new Array(count - upCount - downCount).fill(0)),
  );
}

test("PERCENTILE.INC と同じ線形補間", function () {
  assert.strictEqual(calc.percentileInc([1, 2, 3, 4], 0.5), 2.5);
  assert.ok(Math.abs(calc.percentileInc([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], 0.1) - 2) < 1e-12);
  assert.ok(Math.abs(calc.percentileInc([10, 20], 0.9) - 19) < 1e-12);
});

test("AC-8：似た局面が30件以上なら2列に件数・割合と件数・5つの％が出て、上がった＋下がった＋変わらず＝件数", function () {
  const values = wavyValues(800);
  for (const horizon of [5, 10, 15, 20]) {
    const report = calc.computeSimilarReport(values, horizon);
    assert.ok(report.enough);
    for (const column of [report.similar, report.baseline]) {
      assert.strictEqual(column.upCount + column.downCount + column.sameCount, column.count);
      assert.ok(column.min <= column.low10 && column.low10 <= column.middle && column.middle <= column.high10 && column.high10 <= column.max);
    }
    assert.strictEqual(report.baseline.count, values.length - horizon, "全期間の基準＝後に h 日分のデータがある日の数");
    const container = fakeContainer();
    renderSimilar(container, report, horizon);
    for (const label of ["似た局面", "全期間の基準", "日数", "上がった", "下がった", "変わらなかった", "いちばん下がった", "下位10％", "真ん中", "上位10％", "いちばん上がった"]) {
      assert.ok(container.innerHTML.includes(label), label);
    }
  }
});

test("AC-8a：上がった割合の差が5ポイント以内（ちょうど5.0も）なら「全期間とほぼ同じ」の一文、5.1以上ではどの文も出ない", function () {
  assert.ok(calc.isNearBaseline(61.2, 58.5));
  const sentence = "上がった・下がった割合は、全期間とほぼ同じです（差 5ポイント以内）";
  const cases = [
    { similar: fakeSummary(1000, 612, 388), baseline: fakeSummary(1000, 585, 415), shown: true },   // 差 2.7
    { similar: fakeSummary(100, 55, 45), baseline: fakeSummary(100, 50, 50), shown: true },         // 差ちょうど 5.0
    { similar: fakeSummary(1000, 551, 449), baseline: fakeSummary(1000, 500, 500), shown: false },  // 差 5.1
    { similar: fakeSummary(1000, 449, 551), baseline: fakeSummary(1000, 500, 500), shown: false },  // 差 −5.1
  ];
  for (const item of cases) {
    const report = { enough: true, currentMovePct: 1, similar: item.similar, baseline: item.baseline, near: calc.isNearBaseline(item.similar.upPct, item.baseline.upPct) };
    const container = fakeContainer();
    renderSimilar(container, report, 20);
    assert.strictEqual(container.innerHTML.includes(sentence), item.shown);
    assert.strictEqual(container.innerHTML.includes('class="near"'), item.shown, "代わりの文も出さない");
  }
});

test("AC-9：似た局面が30件未満なら表を出さず、件数つきの文だけを出す", function () {
  // 20営業日の動きが毎日大きく変わるデータ（対数の値が日数の2乗で増える）→ 似た日はわずか
  const values = [];
  for (let index = 0; index < 400; index++) {
    values.push(100 * Math.exp(0.0002 * index * index));
  }
  const report = calc.computeSimilarReport(values, 20);
  assert.ok(report.similar.count < 30);
  const container = fakeContainer();
  renderSimilar(container, report, 20);
  assert.strictEqual(container.innerHTML.includes("<table"), false);
  assert.ok(container.innerHTML.includes("似た局面が少ないため表示しません（" + report.similar.count + "件）"));
});

test("AC-9a：見出しに「過去の集計。この先を示すものではありません」がある", function () {
  const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  assert.ok(html.includes("似た局面のその後<span class=\"h2-sub\">（過去の集計。この先を示すものではありません）</span>"));
});

test("AC-9b・9c・9e：上下の行も2つの列も同じ見た目。矢印・記号・色の指定がなく、真ん中は件数・幅と同じ表にある", function () {
  const report = calc.computeSimilarReport(wavyValues(800), 20);
  const container = fakeContainer();
  renderSimilar(container, report, 20);
  const html = container.innerHTML;
  assert.ok(!/[↑↓→←▲▼△▽⬆⬇]/.test(html), "矢印・記号がない");
  assert.ok(!/style=|color|green|red|up-|down-/.test(html), "色や向きのクラスがない");
  const upRow = html.match(/<tr><th scope="row">上がった<\/th>(.*?)<\/tr>/)[1];
  const downRow = html.match(/<tr><th scope="row">下がった<\/th>(.*?)<\/tr>/)[1];
  assert.strictEqual(upRow.replace(/[\d.,％]/g, ""), downRow.replace(/[\d.,％]/g, ""), "上がった・下がったは同じ形");
  const cells = html.match(/<td[^>]*>/g);
  assert.ok(cells.every(function (cell) { return cell === "<td>"; }), "セルはすべて同じ（特別な目立たせ方がない）");
  const table = html.slice(html.indexOf("<table"), html.indexOf("</table>"));
  for (const label of ["真ん中", "下位10％", "上位10％", "日数"]) {
    assert.ok(table.includes(label), label);
  }
});

test("AC-9d：どのデータを入れても、方向や基準との大小を要約する文が出ない", function () {
  const banned = [/上がりやすい/, /下がりやすい/, /傾向/, /割が上昇/, /割が下落/, /より多い/, /より少ない/, /上昇/, /下落/];
  const datasets = [wavyValues(800), randomWalkValues(900, 0.006, 31), randomWalkValues(900, 0.01, 32)];
  for (const values of datasets) {
    for (const horizon of [5, 10, 15, 20]) {
      const container = fakeContainer();
      renderSimilar(container, calc.computeSimilarReport(values, horizon), horizon);
      const text = container.innerHTML.replace(/<[^>]+>/g, " ");
      for (const pattern of banned) {
        assert.ok(!pattern.test(text), String(pattern));
      }
      const sentences = text.split(/\s+/).filter(function (part) { return part.endsWith("です（差"); });
      assert.ok(sentences.length <= 1);
    }
  }
});
