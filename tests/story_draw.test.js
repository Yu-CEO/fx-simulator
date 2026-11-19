/*
 * story_draw.test.js：今日の図の1コマ（story_draw.js・story_layout.js）の自動テスト。作ったデータだけを使う
 * 受け入れ基準 AC-32（場面の順番と秒数）・AC-34（3つの金額が同じ見た目）・AC-36（常に出す文・左上の印と日付）・AC-42a（縦動画の余白と文字の大きさ）・
 * AC-43（サイトと縦動画が同じ文言・同じ順）に対応。
 */
const test = require("node:test");
const assert = require("node:assert");
const STORY_CONFIG = require("../js/story_config.js");
const { buildStoryLayouts } = require("../js/story_layout.js");
const { drawStoryFrame, buildAltText, formatAsOf } = require("../js/story_draw.js");
const { estimateWidth } = require("../js/story_svg.js");
const { MIN_COUNT, fixedScaleMethod, valuesEndingAt, buildTestModel } = require("./story_helpers.js");

const layouts = buildStoryLayouts();
const model = buildTestModel(valuesEndingAt(MIN_COUNT + 30, 150, 152), fixedScaleMethod(0.004));
const TEXTS = STORY_CONFIG.texts;

/** SVG の中の <text> を、{x, y, size, weight, fill, anchor, text} の一覧にする。 */
function listTexts(svg) {
  const pattern = /<text x="([\d.-]+)" y="([\d.-]+)" font-size="([\d.]+)" font-weight="(\d+)" fill="([^"]+)" text-anchor="(\w+)"[^>]*>([^<]*)<\/text>/g;
  return Array.from(svg.matchAll(pattern)).map(function (match) {
    return { x: Number(match[1]), y: Number(match[2]), size: Number(match[3]), weight: Number(match[4]), fill: match[5], anchor: match[6], text: match[7] };
  });
}

/** 文字だけを全部つないだ文字（折り返しの行をつなぐため、空白なしで）。 */
function allText(svg) {
  return listTexts(svg).map(function (item) { return item.text; }).join("");
}

test("AC-32：場面は ①答え合わせ→②問い→③帯→④3つの金額→⑤終わり の順で、秒数は 3・2・7・4・2（約18秒）。合計が15〜20秒", function () {
  const ends = STORY_CONFIG.sceneEnds;
  const seconds = ends.map(function (end, index) { return end - (index === 0 ? 0 : ends[index - 1]); });
  assert.deepStrictEqual(seconds, [3, 2, 7, 4, 2]);
  assert.strictEqual(ends[ends.length - 1], STORY_CONFIG.totalSeconds);
  assert.ok(STORY_CONFIG.totalSeconds >= 15 && STORY_CONFIG.totalSeconds <= 20);
});

test("AC-32：時刻ごとに、答え合わせ→問い→帯→3つの金額→終わりの順に絵が出て、最後の絵に結果・帯・3つの金額がそろう", function () {
  const layout = layouts.site;
  const at1 = allText(drawStoryFrame(1, layout, model));
  assert.ok(at1.includes(TEXTS.answerTitle), "① 答え合わせが最初に出る");
  assert.ok(!at1.includes("何円くらい動く"));
  const at4 = allText(drawStoryFrame(4, layout, model));
  assert.ok(at4.includes("何円くらい動く？"), "② 問い");
  assert.ok(at4.includes(TEXTS.judge[model.judge]), "結果の札");
  assert.ok(!listTexts(drawStoryFrame(4, layout, model)).some(function (item) { return item.text === TEXTS.answerTitle; }), "① は3秒で消える");
  const at8 = allText(drawStoryFrame(8, layout, model));
  assert.ok(at8.includes(TEXTS.axisTop), "③ 帯の図");
  assert.ok(!at8.includes(TEXTS.yenWeak + "約"), "③ の間は金額はまだ出ない");
  const at14 = allText(drawStoryFrame(14, layout, model));
  assert.ok(at14.includes("約"), "④ 3つの金額");
  const at17 = allText(drawStoryFrame(17, layout, model));
  assert.ok(at17.includes(STORY_CONFIG.seriesName), "⑤ シリーズ名");
  assert.ok(at17.includes(TEXTS.everyMorning(model.lastDate)), "⑤ 毎朝更新・データの最終日");
  const last = allText(drawStoryFrame(STORY_CONFIG.totalSeconds, layout, model));
  assert.ok(last.includes(TEXTS.judge[model.judge]) && last.includes(TEXTS.yenWeak) && last.includes(TEXTS.yenStrong) && last.includes(STORY_CONFIG.seriesName), "最後の絵に全部そろう");
});

test("AC-34：3つの金額は同じ色・同じ文字の大きさ・同じ太さで並び、記号（矢印・丸・ばつ）がなく、「円安の場合」が帯の上端・「円高の場合」が下端の金額", function () {
  for (const layout of [layouts.site, layouts.tall]) {
    const items = listTexts(drawStoryFrame(14, layout, model));
    const names = [TEXTS.yenWeak, TEXTS.yenNow, TEXTS.yenStrong].map(function (name) {
      return items.find(function (item) { return item.text === name && item.x === layout.left && item.y >= layout.amounts.firstY; });
    });
    const amounts = items.filter(function (item) { return item.text.startsWith("約") && item.anchor === "end"; });
    assert.strictEqual(names.length, 3);
    assert.strictEqual(amounts.length, 3);
    for (const group of [names, amounts]) {
      assert.strictEqual(new Set(group.map(function (item) { return item.size; })).size, 1, "文字の大きさが同じ");
      assert.strictEqual(new Set(group.map(function (item) { return item.weight; })).size, 1, "太さが同じ");
      assert.strictEqual(new Set(group.map(function (item) { return item.fill; })).size, 1, "色が同じ");
    }
    assert.ok(amounts[0].y < amounts[1].y && amounts[1].y < amounts[2].y);
    assert.ok(model.amounts.weak >= model.amounts.now && model.amounts.now >= model.amounts.strong);
    const amountText = amounts.map(function (item) { return item.text; });
    assert.deepStrictEqual(amountText, [
      "約" + model.amounts.weak.toLocaleString("ja-JP") + "円", "約" + model.amounts.now.toLocaleString("ja-JP") + "円", "約" + model.amounts.strong.toLocaleString("ja-JP") + "円",
    ]);
  }
  const allSvg = drawStoryFrame(14, layouts.site, model);
  assert.ok(!/[▲▼△▽↑↓○×✕✓●]/u.test(allText(allSvg)), "矢印・丸・ばつなどの記号がない");
  assert.ok(!/(red|green|#[ef][0-9a-f]{2}[0-4][0-9a-f]{3})/i.test(JSON.stringify(STORY_CONFIG.colors)), "赤・緑の色を使わない");
});

test("AC-36：どの瞬間で止めても、注意書き・出典と最終日・左上の「Yu」の印と「○月○日時点」が見える。画像ファイルは使わない", function () {
  for (const layout of [layouts.site, layouts.tall]) {
    for (let t = 0; t <= STORY_CONFIG.totalSeconds; t += 0.5) {
      const svg = drawStoryFrame(t, layout, model);
      const text = allText(svg);
      assert.ok(text.includes(TEXTS.notice), "注意書き t=" + t);
      assert.ok(text.includes(TEXTS.source(model.lastDate)), "出典と最終日 t=" + t);
      assert.ok(text.includes("Yu") && text.includes(formatAsOf(model.lastDate) + TEXTS.asOfSource), "印と日付 t=" + t);
      assert.ok(!/<(image|img|foreignObject)/.test(svg), "画像・外部の物を使わない");
    }
  }
  assert.strictEqual(formatAsOf("2026-11-17"), "11月17日時点");
});

test("AC-42a：縦動画の文字は余白（上160・下420・左64・右160）の内側にあり、注意書き34・判定70・金額60の大きさになる（設定と一致）", function () {
  const video = STORY_CONFIG.video;
  assert.deepStrictEqual(video.safe, { top: 160, bottom: 420, left: 64, right: 160 });
  assert.deepStrictEqual(video.fontSizes, { notice: 34, judge: 70, amount: 60 });
  const tall = layouts.tall;
  const bounds = { left: video.safe.left, right: video.width - video.safe.right, top: video.safe.top, bottom: video.height - video.safe.bottom };
  let noticeChecked = false;
  let judgeChecked = false;
  let amountChecked = false;
  for (let t = 0; t <= STORY_CONFIG.totalSeconds; t += 0.5) {
    for (const item of listTexts(drawStoryFrame(t, tall, model))) {
      // 文字の左右の端（半角は0.6倍・全角は1倍で見積もる）
      const width = estimateWidth(item.text, item.size);
      let left = item.x;
      let right = item.x + width;
      if (item.anchor === "end") {
        left = item.x - width;
        right = item.x;
      } else if (item.anchor === "middle") {
        left = item.x - width / 2;
        right = item.x + width / 2;
      }
      assert.ok(left >= bounds.left - 1, item.text + " の左 " + left + " t=" + t);
      assert.ok(right <= bounds.right + 1, item.text + " の右 " + right + " t=" + t);
      assert.ok(item.y - item.size <= bounds.bottom && item.y <= bounds.bottom, item.text + " の下 " + item.y + " t=" + t);
      assert.ok(item.y - item.size >= bounds.top - 1, item.text + " の上 " + item.y + " t=" + t);
      if (item.text === TEXTS.notice.slice(0, 1) || item.fill === STORY_CONFIG.colors.sub && item.size === video.fontSizes.notice) {
        noticeChecked = true;
      }
      if (item.text === TEXTS.judge[model.judge] && item.size === video.fontSizes.judge) {
        judgeChecked = true;
      }
      if (item.text.startsWith("約") && item.size === video.fontSizes.amount) {
        amountChecked = true;
      }
    }
  }
  assert.ok(noticeChecked && judgeChecked && amountChecked, "注意書き34・判定70・金額60の文字が実際に使われている");
});

test("AC-43：サイトと縦動画は、同じ順・同じ文言・同じ数字（折り返しを除いて、文字を全部つなぐと同じ）", function () {
  for (const t of [1, 2.9, 4, 8, 12.9, 14, 17, 18]) {
    assert.strictEqual(allText(drawStoryFrame(t, layouts.site, model)), allText(drawStoryFrame(t, layouts.tall, model)), "t=" + t);
  }
});

const MARKER = "\u0001";  // 数字などが入る場所の目印（関数の文言をこの字で切って、固定のかけらにする）

/** 設定の文言（関数のものは目印で切ったかけら）と、日付・金額に付く短い字の一覧。空白は取り、長い順に並べる。 */
function listAllowedPhrases() {
  const phrases = ["Yu", "月", "日時点", "約", "円", "万", "は", STORY_CONFIG.seriesName];
  for (const value of Object.values(TEXTS)) {
    if (typeof value === "string") {
      phrases.push(value);
    } else if (typeof value === "function") {
      for (const result of [].concat(value(MARKER, MARKER))) {
        phrases.push(...result.split(MARKER));
      }
    } else {
      phrases.push(...Object.values(value));
    }
  }
  return phrases.map(function (phrase) { return phrase.replace(/\s/g, ""); }).filter(Boolean).sort(function (a, b) { return b.length - a.length; });
}

/** 文から、許可した文言を取り除いたあとに残る文字（数字・記号・空白は除く）を返す。 */
function findLeftover(text) {
  let rest = text.replace(/\s/g, "");
  for (const phrase of listAllowedPhrases()) {
    rest = rest.split(phrase).join("");
  }
  return rest.replace(/[\d.,:：〜／\-－→（）()％、。・]/g, "");
}

test("AC-43：描いた文字は、0〜18秒のどの瞬間も（サイトも縦動画も）、設定の文言と数字・記号だけでできている", function () {
  for (const layout of [layouts.site, layouts.tall]) {
    for (let t = 0; t <= STORY_CONFIG.totalSeconds; t += 0.5) {
      assert.strictEqual(findLeftover(allText(drawStoryFrame(t, layout, model))), "", layout.kind + " t=" + t);
    }
  }
  assert.strictEqual(findLeftover(buildAltText(model)), "", "読み上げ用の説明");
});

test("AC-43：許可リストのテストは、余計な文字が1つ混ざると失敗する（確認）", function () {
  const text = allText(drawStoryFrame(STORY_CONFIG.totalSeconds, layouts.tall, model));
  assert.strictEqual(findLeftover(text + "口"), "口");
  assert.strictEqual(findLeftover("座" + text), "座");
});

test("読み上げ用の説明に、日付・結果・3つの金額・注意書きが入る", function () {
  const alt = buildAltText(model);
  assert.ok(alt.includes(TEXTS.judge[model.judge]) && alt.includes(TEXTS.notice) && alt.includes("約" + model.amounts.now.toLocaleString("ja-JP") + "円"));
  assert.ok(alt.includes("ドル払いの旅行代10万円"));
});
