/*
 * story_helpers.js：今日の図のテストで使う「作ったデータ（仮の数字）」を作る道具。本物の為替のデータは使わない
 * 主な関数：fixedScaleMethod（決まった大きさの帯を作る部品）、valuesEndingAt（最終日の値を決めた列）、buildTestModel（今日の図の数字）
 * tests/story_*.test.js から使われる。
 */
const { buildStoryModel } = require("../js/story_calc.js");
const STORY_CONFIG = require("../js/story_config.js");
const BAND_CONFIG = require("../js/band_config.js");

// 作ったデータの件数（1か月前の帯が作れる最小の件数＝251件＋20件）
const MIN_COUNT = BAND_CONFIG.windowDays + 1 + STORY_CONFIG.horizonDays;

/**
 * 先の長さ h に対して S(h)＝scalePerRootDay×√h になる、決まった大きさの帯を作る部品（どの日でも同じ大きさ）。
 * @param {number} scalePerRootDay 1日の動きの大きさ
 * @returns {{computeScale: function}}
 */
function fixedScaleMethod(scalePerRootDay) {
  return {
    computeScale: function (changes, horizonDays) {
      return scalePerRootDay * Math.sqrt(horizonDays);
    },
  };
}

/**
 * 1か月前の日までは basePrice のまま、最終日の値が finalPrice になる値の列を作る（途中は直線）。
 * @param {number} count 件数
 * @param {number} basePrice 1か月前までの値
 * @param {number} finalPrice 最終日の値
 * @returns {number[]}
 */
function valuesEndingAt(count, basePrice, finalPrice) {
  const horizonDays = STORY_CONFIG.horizonDays;
  const monthAgoIndex = count - 1 - horizonDays;
  const values = [];
  for (let index = 0; index < count; index++) {
    if (index <= monthAgoIndex) {
      values.push(basePrice);
    } else {
      values.push(basePrice + (finalPrice - basePrice) * (index - monthAgoIndex) / horizonDays);
    }
  }
  return values;
}

/** 日付の一覧（"2026-01-01" から1日ずつ。中身は使わない）。 */
function fakeDates(count) {
  const dates = [];
  for (let index = 0; index < count; index++) {
    const date = new Date(Date.UTC(2026, 0, 1 + index));
    dates.push(date.toISOString().slice(0, 10));
  }
  return dates;
}

/**
 * 今日の図の数字（モデル）を作る。
 * @param {number[]} values 値の列
 * @param {object} method 帯の部品
 * @returns {object} buildStoryModel の結果
 */
function buildTestModel(values, method) {
  const dates = fakeDates(values.length);
  return buildStoryModel({
    values, dates, lastDate: dates[dates.length - 1], method,
    backtest: { total: 2288, outsideNarrowPct: 28.8, outsideWidePct: 6.3 },
  });
}

module.exports = { MIN_COUNT, fixedScaleMethod, valuesEndingAt, fakeDates, buildTestModel };
