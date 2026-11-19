/*
 * format.js：数字の表示形式（円・％・件数・日付）
 * 主な関数：formatYen（小数第2位の円）、formatPct（小数第1位の％）、formatSignedPct（＋・−つきの％）、formatCount（件数）、formatDateNumber（日付）、formatManYen（万円）
 * answer_view.js・reading_text.js・stats_view.js・main.js から使われる。tests/format.test.js でテストする。
 * 符号の「＋」「−」は値の大きさを示すだけで、色や矢印はつけない（向きを強調しないため）。
 */

// マイナスの先頭につける記号。全角のマイナス記号（数字の幅がそろって読みやすいため）
const MINUS_SIGN = "−";
const PLUS_SIGN = "+";
// 円は小数第2位、％は小数第1位で四捨五入する（仕様 2-2・2-3・2-4）
const YEN_DIGITS = 2;
const PCT_DIGITS = 1;
const YEN_PER_MAN = 10000;  // 1万円＝10,000円

/**
 * 円の値を「155.12円」の形にする（小数第2位で四捨五入）。
 * @param {number} value 円
 */
function formatYen(value) {
	return value.toFixed(YEN_DIGITS) + "円";
}

/**
 * 割合を「31.5％」の形にする（小数第1位で四捨五入）。
 * @param {number} value ％の数字
 */
function formatPct(value) {
	return value.toFixed(PCT_DIGITS) + "％";
}

/**
 * 変化の％を「+1.2％」「−1.2％」「0.0％」の形にする。丸めて 0.0 になるときは符号をつけない。
 * @param {number} value ％の数字
 */
function formatSignedPct(value) {
	const rounded = Number(value.toFixed(PCT_DIGITS));
	if (rounded === 0) {
		return (0).toFixed(PCT_DIGITS) + "％";
	}
	let sign = PLUS_SIGN;
	if (rounded < 0) {
		sign = MINUS_SIGN;
	}
	return sign + Math.abs(rounded).toFixed(PCT_DIGITS) + "％";
}

/**
 * 件数を3けたごとのカンマつきにする。
 * @param {number} count 件数
 */
function formatCount(count) {
	return count.toLocaleString("ja-JP");
}

/**
 * YYYYMMDD の数字の日付を「YYYY-MM-DD」の文字にする（画面用データは日付を数字で持っているため）。
 * @param {number} dateNumber 例：20261117
 */
function formatDateNumber(dateNumber) {
	const text = String(dateNumber);
	return text.slice(0, 4) + "-" + text.slice(4, 6) + "-" + text.slice(6, 8);
}

/**
 * 円の金額を「10万円」の形にする（旅行代の言い方。10,000円の倍数のときだけ使う）。
 * @param {number} yen 円
 */
function formatManYen(yen) {
	return formatCount(yen / YEN_PER_MAN) + "万円";
}

// Node.js（テスト）から require で使えるようにする（ブラウザでは名前がそのまま見える）
if (typeof module !== "undefined" && module.exports) {
	module.exports = { formatYen, formatPct, formatSignedPct, formatCount, formatDateNumber, formatManYen };
}
