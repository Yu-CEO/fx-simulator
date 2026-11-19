/*
 * page_scripts.test.js：ページが読み込む JavaScript を、ブラウザと同じように1つの場所にまとめて読んでも、名前がぶつからないかの自動テスト
 * 理由：ブラウザでは、<script> で読んだファイルの一番外側の const・let・function は全部同じ名前の置き場に入るので、同じ名前があると
 *       あとから読んだファイルが動かなくなる（Node.js の require では気づけない）。
 * 受け入れ基準 AC-32（今日の図が動く）・AC-39（今日の図を含めても外への読み込みがない）・AC-40a の土台。
 */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { STORY_FILES, RESULT_FILES, LATER_FILES } = require("../js/data_loader.js");

const PRODUCT_DIR = path.join(__dirname, "..");

/** index.html が読む <script> の一覧（読む順）。 */
function listPageScripts() {
  const html = fs.readFileSync(path.join(PRODUCT_DIR, "index.html"), "utf8");
  return Array.from(html.matchAll(/<script[^>]+src="([^"]+)"/g)).map(function (match) { return match[1]; });
}

/** 縦動画の描画ページ（frame.html）が読む <script> の一覧。<base> で fx-simulator フォルダにそろえてある。 */
function listFrameScripts() {
  const html = fs.readFileSync(path.join(PRODUCT_DIR, "tools", "video", "frame.html"), "utf8");
  return Array.from(html.matchAll(/<script[^>]+src="([^"]+)"/g)).map(function (match) { return match[1]; });
}

/** ブラウザの代わりの入れ物（document・window の最低限）の中で、ファイルを順に読む。 */
function loadAll(files) {
  const context = vm.createContext({ document: { addEventListener() {}, getElementById() { return null; }, createElement() { return {}; } }, console });
  context.window = context;
  context.location = { reload() {} };
  for (const file of files) {
    // main.js は読み込んだ瞬間に画面を動かし始める（ブラウザ専用の処理）ので、名前の確認からは外す
    if (file === "js/main.js") {
      continue;
    }
    vm.runInContext(fs.readFileSync(path.join(PRODUCT_DIR, file), "utf8"), context, { filename: file });
  }
  return context;
}

test("AC-32：ページが読むファイル（最初の分＋今日の図）は、同じ名前の const・function がぶつからず、全部読める", function () {
  const files = listPageScripts().concat(["js/band_methods/kalman_local_level.js"], STORY_FILES, RESULT_FILES, LATER_FILES);
  const context = loadAll(files);
  assert.strictEqual(typeof vm.runInContext("FxResultView.renderResult", context), "function");
  assert.strictEqual(typeof vm.runInContext("FxMoreView.renderMoreSections", context), "function");
  assert.strictEqual(typeof vm.runInContext("FxAnswerView.renderAnswer", context), "function");
  assert.strictEqual(typeof vm.runInContext("FxStoryView.startStoryView", context), "function");
  assert.strictEqual(typeof vm.runInContext("FxStoryDraw.drawStoryFrame", context), "function");
});

test("AC-43：縦動画の描画ページ（frame.html）も、サイトと同じ story_*.js を読み、名前がぶつからない", function () {
  const files = listFrameScripts().filter(function (name) { return name.startsWith("js/") || name.startsWith("data/"); });
  assert.ok(files.includes("js/story_draw.js") && files.includes("js/story_calc.js"), "サイトと同じ描く関数・計算を読む");
  const context = loadAll(files);
  assert.strictEqual(typeof vm.runInContext("FxStoryDraw.drawStoryFrame", context), "function");
});

test("AC-39：今日の図・結果カードのファイルは、最初の画面（index.html）では読まず、あとから読む（最初の表示を10ファイル以内にするため）", function () {
  const initial = listPageScripts();
  for (const file of STORY_FILES.concat(RESULT_FILES)) {
    assert.ok(!initial.includes(file), file + " が最初の表示で読まれています");
  }
  assert.ok(fs.readFileSync(path.join(PRODUCT_DIR, "js", "main.js"), "utf8").includes("loadStoryFiles(") && fs.readFileSync(path.join(PRODUCT_DIR, "js", "main.js"), "utf8").includes("loadResultFiles("), "main.js が最初の画面のあとに読み込む");
});
