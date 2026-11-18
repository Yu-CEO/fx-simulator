/*
 * result_cache.js：計算の結果を覚えておく入れ物（仕様 2-7「同じ選択では計算し直さない」）
 * 主な関数：createResultCache（「鍵 → 結果」を覚える入れ物を作る）
 * 帯の答え合わせ・似た局面の結果を、先の長さ（5／10／15／20）ごとに1回だけ計算するために main.js から使われる。
 * tests/result_cache.test.js で、同じ鍵では計算の関数が呼ばれないことを確かめる。
 */

/**
 * 「鍵 → 結果」を覚える入れ物を作る。初めての鍵のときだけ compute を呼び、2回目からは覚えた結果を返す。
 * @param {function(*): *} compute 鍵を受け取って結果を返す計算の関数
 * @returns {{get: function(*): *, clear: function(): void}}
 * @example
 *   const cache = createResultCache(function (horizon) { return heavyCalc(horizon); });
 *   cache.get(20); // 計算する
 *   cache.get(20); // 覚えた結果を返す（計算しない）
 */
function createResultCache(compute) {
  const saved = new Map();
  return {
    get: function (key) {
      if (!saved.has(key)) {
        saved.set(key, compute(key));
      }
      return saved.get(key);
    },
    clear: function () {
      saved.clear();
    },
  };
}

// Node.js（テスト）から require で使えるようにする。ブラウザでは createResultCache がそのまま見える
if (typeof module !== "undefined" && module.exports) {
  module.exports = { createResultCache };
}
