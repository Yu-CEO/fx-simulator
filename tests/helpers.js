/*
 * helpers.js：テストで使う「作ったデータ（仮の数字）」を作る道具。本物の為替のデータは使わない
 * 主な関数：seededRandom（種を決めた乱数）、normalRandom（正規分布の乱数）、randomWalkValues（変動の大きさを決めた値の列）、flatValues、fakeContainer
 * tests/*.test.js から使われる。
 */

/**
 * 種を決めた乱数（0〜1）を返す関数を作る。同じ種なら毎回同じ数の並びになる（テストの結果を毎回同じにするため）。
 * @param {number} seed 種
 * @returns {function(): number}
 */
function seededRandom(seed) {
  let state = seed >>> 0;
  return function () {
    // xorshift（ビットをずらして混ぜる、軽い乱数の作り方）
    state ^= state << 13;
    state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return (state + 0.5) / 4294967296;
  };
}

/**
 * 正規分布（平均0・標準偏差1）の乱数を返す関数を作る（ボックス＝ミュラー法）。
 */
function normalRandom(seed) {
  const random = seededRandom(seed);
  return function () {
    return Math.sqrt(-2 * Math.log(random())) * Math.cos(2 * Math.PI * random());
  };
}

/**
 * 1日の動きの大きさ dailySigma が決まった値の列を作る（最初は100）。
 * @param {number} count 件数
 * @param {number} dailySigma 1日の動きの大きさ（対数）
 * @param {number} seed 乱数の種
 * @returns {number[]}
 */
function randomWalkValues(count, dailySigma, seed) {
  const normal = normalRandom(seed);
  const values = [100];
  for (let index = 1; index < count; index++) {
    values.push(values[index - 1] * Math.exp(dailySigma * normal()));
  }
  return values;
}

/** 同じ値が count 件続く列。 */
function flatValues(count, value) {
  return new Array(count).fill(value);
}

/** 画面の表示場所の代わり（innerHTML だけを持つ入れ物）。 */
function fakeContainer() {
  return { innerHTML: "" };
}

module.exports = { seededRandom, normalRandom, randomWalkValues, flatValues, fakeContainer };
