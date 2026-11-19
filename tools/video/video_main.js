/*
 * video_main.js：縦動画用の描画ページ（frame.html）の入口
 * 流れ：採用した方法のファイルを読む → サイトと同じ数字（story_calc.js）を作る → 「時刻 t の絵を描く」関数を外（撮影する Python）に渡す
 * 外に渡すもの（window に置く）：
 *   storyReady … 準備ができたら true
 *   storyInfo  … { ok, reason, lastDate, totalSeconds, fps, width, height }。ok が false なら動画は作らない（1か月前の帯が作れない日など）
 *   renderStoryFrame(t) … 時刻 t（秒）の絵を 1080×1920 の SVG で描く
 * tools/video/render_frames.py から使われる。サイトからは読み込まない。
 */

(function () {
  const video = STORY_CONFIG.video;

  /**
   * 準備ができたことと、作れるかどうかを知らせる。
   * @param {object} info storyInfo として渡す中身（ok・reason・lastDate など）
   */
  function publishInfo(info) {
    window.storyInfo = info;
    window.storyReady = true;
  }

  /**
   * 数字を作り、作れるときは描く関数（renderStoryFrame）を用意して、storyInfo を知らせる。
   * @param {object} method 採用した方法の部品
   */
  function prepare(method) {
    const model = FxStoryCalc.buildStoryModelFromRecent(method, FX_DATA_RECENT);
    const info = {
      ok: model.ok,
      reason: model.reason || "",
      lastDate: FX_DATA_RECENT.lastDate,
      totalSeconds: STORY_CONFIG.totalSeconds,
      fps: video.fps,
      width: video.width,
      height: video.height,
    };
    if (model.ok) {
      const layout = FxStoryLayout.buildStoryLayouts().tall;
      window.renderStoryFrame = function (t) {
        const frameSvg = FxStoryDraw.drawStoryFrame(t, layout, model);
        document.getElementById("stage").innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="' + layout.width + '" height="' + layout.height
          + '" viewBox="0 0 ' + layout.width + " " + layout.height + '">' + frameSvg + "</svg>";
      };
    }
    publishInfo(info);
  }

  loadMethodFile(BAND_CONFIG, prepare, function () {
    publishInfo({ ok: false, reason: "method_load_failed", lastDate: FX_DATA_RECENT.lastDate });
  });
})();
