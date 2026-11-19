/*
 * story_view.js：サイトの「今日の図」を出す（1回だけ再生・「もう一度見る」・「動きを減らす」設定への対応）。主な関数：startStoryView、playbackPlan
 * 数字は story_calc.js、絵は story_draw.js から。js/main.js が最初の画面のあとに呼ぶ。作れない日は図を出さず決まった文を出す（仕様 2-8・AC-40）。
 * tests/story_view.test.js でテストする。
 */

const IS_NODE_FOR_STORY_VIEW = typeof module !== "undefined" && module.exports;
const STORY_VIEW_CONFIG = IS_NODE_FOR_STORY_VIEW ? require("./story_config.js") : STORY_CONFIG;
const STORY_VIEW_CALC = IS_NODE_FOR_STORY_VIEW ? require("./story_calc.js") : FxStoryCalc;
const STORY_VIEW_LAYOUT = IS_NODE_FOR_STORY_VIEW ? require("./story_layout.js") : FxStoryLayout;
const STORY_VIEW_DRAW = IS_NODE_FOR_STORY_VIEW ? require("./story_draw.js") : FxStoryDraw;
const STORY_VIEW_SVG = IS_NODE_FOR_STORY_VIEW ? require("./story_svg.js") : FxStorySvg;

const STORY_MS_PER_SECOND = 1000;  // 1秒のミリ秒

// 画面の今の状態（描く数字・配置・再生中か・次のコマの予約）
const storyState = { model: null, layout: null, playing: false, frameRequest: 0 };

/**
 * 動かすか、止めた最後の絵だけを出すかを決める。
 * 受け取るもの：prefersReducedMotion＝OS の「動きを減らす」がオンか
 * 返すもの：{animate, startTime}。animate が false のときは startTime（＝最後の時刻）の絵だけを出す
 */
function playbackPlan(prefersReducedMotion) {
	if (prefersReducedMotion) {
		return { animate: false, startTime: STORY_VIEW_CONFIG.totalSeconds };
	}
	return { animate: true, startTime: 0 };
}

/** 図の場所（index.html の id）をまとめて返す：body・message・story・progress・button・note。 */
function storyElements() {
	return {
		body: document.getElementById("today-body"),
		message: document.getElementById("today-msg"),
		story: document.getElementById("story"),
		progress: document.getElementById("story-prog"),
		button: document.getElementById("btn-replay"),
		note: document.getElementById("rm-note"),
	};
}

/**
 * 時刻 t の絵を描き、進みの線とボタンの文字を合わせる。
 * 受け取るもの：t＝時刻（秒）
 */
function drawStoryAt(t) {
	const elements = storyElements();
	const layout = storyState.layout;
	const altText = STORY_VIEW_SVG.escapeXml(STORY_VIEW_DRAW.buildAltText(storyState.model));
	const frameSvg = STORY_VIEW_DRAW.drawStoryFrame(t, layout, storyState.model);
	elements.story.innerHTML = '<svg viewBox="0 0 ' + layout.width + " " + layout.height + '" role="img" aria-label="' + altText + '">' + frameSvg + "</svg>";
	elements.progress.style.width = (t / STORY_VIEW_CONFIG.totalSeconds * 100) + "%";
	elements.button.textContent = storyState.playing ? "最後の絵へとばす" : "もう一度見る";
}

/**
 * 指定の時刻から1回だけ再生する（最後で止まる）。
 * 受け取るもの：startSeconds＝再生を始める時刻（秒）。最初からなら 0
 */
function playStoryFrom(startSeconds) {
	cancelAnimationFrame(storyState.frameRequest);
	storyState.playing = true;
	const startedAt = performance.now() - startSeconds * STORY_MS_PER_SECOND;
	function tick(now) {
		const t = Math.min(STORY_VIEW_CONFIG.totalSeconds, (now - startedAt) / STORY_MS_PER_SECOND);
		if (t >= STORY_VIEW_CONFIG.totalSeconds) {
			storyState.playing = false;
		}
		drawStoryAt(t);
		if (storyState.playing) {
			storyState.frameRequest = requestAnimationFrame(tick);
		}
	}
	storyState.frameRequest = requestAnimationFrame(tick);
}

/** ボタンが押されたとき：再生中なら最後の絵へとばし、止まっていれば最初から再生する。受け取るものも返すものも無い。 */
function onStoryButton() {
	if (storyState.playing) {
		cancelAnimationFrame(storyState.frameRequest);
		storyState.playing = false;
		drawStoryAt(STORY_VIEW_CONFIG.totalSeconds);
		return;
	}
	playStoryFrom(0);
}

/**
 * 作れない日の文を出す（図は出さない）。
 * 受け取るもの：text＝出す文
 */
function showStoryMessage(text) {
	const elements = storyElements();
	elements.body.hidden = true;
	elements.message.hidden = false;
	elements.message.innerHTML = '<div class="msg" role="status"></div>';
	elements.message.firstChild.textContent = text;
}

/**
 * 今日の図を作って出す。最近の分のデータ（FX_DATA_RECENT）だけで描ける。
 * 受け取るもの：recent＝FX_DATA_RECENT（usdjpy_recent.js の中身）、method＝採用した方法の部品、prefersReducedMotion＝「動きを減らす」がオンか
 * 返すもの：buildStoryModel の結果（作れないときは ok:false）
 */
function startStoryView(recent, method, prefersReducedMotion) {
	const model = STORY_VIEW_CALC.buildStoryModelFromRecent(method, recent);
	if (!model.ok) {
		showStoryMessage(STORY_VIEW_CONFIG.texts.notEnough);
		return model;
	}
	storyState.model = model;
	storyState.layout = STORY_VIEW_LAYOUT.buildStoryLayouts().site;
	const elements = storyElements();
	elements.message.hidden = true;
	elements.body.hidden = false;
	const plan = playbackPlan(prefersReducedMotion);
	elements.note.hidden = plan.animate;
	elements.button.hidden = !plan.animate;
	elements.button.addEventListener("click", onStoryButton);
	if (plan.animate) {
		playStoryFrom(plan.startTime);
	} else {
		drawStoryAt(plan.startTime);
	}
	return model;
}

const FxStoryView = { startStoryView, playbackPlan };

// Node.js（テスト）から require で使えるようにする（ブラウザでは名前がそのまま見える）
if (IS_NODE_FOR_STORY_VIEW) {
	module.exports = FxStoryView;
}
