/*
 * result_cache.test.js：js/result_cache.js（同じ選択では計算し直さない）の自動テスト
 * 受け入れ基準 AC-24（後半：呼ばれた回数）に対応。
 */
const test = require("node:test");
const assert = require("node:assert");
const { createResultCache } = require("../js/result_cache.js");

test("AC-24：同じ先の長さを選び直しても、計算の関数は先の長さごとに1回しか呼ばれない", function () {
  const calls = { 5: 0, 20: 0 };
  const cache = createResultCache(function (horizon) {
    calls[horizon]++;
    return { horizon };
  });
  for (const horizon of [20, 5, 20, 20, 5, 20]) {
    assert.strictEqual(cache.get(horizon).horizon, horizon);
  }
  assert.deepStrictEqual(calls, { 5: 1, 20: 1 });
});
