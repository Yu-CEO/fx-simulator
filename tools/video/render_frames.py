"""render_frames.py：描画ページ（frame.html）を開き、時刻を進めながら1コマずつ画像にする（仕様 2-9）

道具：Playwright（ブラウザを自動で動かす道具）で Chromium を開く。Actions の中だけで使い、サイトからは使わない。
主な関数：render_frames。1コマ＝frame_00000.png から始まる連番。サイトの今日の図と同じ描く関数を使うので、見た目はずれない。
make_video.py から使われる。
"""

import os
import pathlib

import video_settings

# Playwright は縦動画づくり（Actions の中）でだけ入れる。入っていない環境（テストなど）でもこのファイルを読めるようにしておく
try:
    from playwright.sync_api import Error as PlaywrightError
    from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
    from playwright.sync_api import sync_playwright
except ImportError:
    PlaywrightError = Exception
    PlaywrightTimeoutError = TimeoutError
    sync_playwright = None

# 準備ができるまで待つ上限（ミリ秒）。方法のファイルを読むだけなので数秒で終わる
READY_TIMEOUT_MS = 30000


def frame_count(total_seconds, fps):
    """動画の全コマ数。最後の絵（total_seconds）も1コマ入れる。

    例：frame_count(18, 30) → 541（0秒〜18秒を30コマ/秒で）
    """
    return int(round(total_seconds * fps)) + 1


def render_frames(frames_dir, chromium_path=None):
    """描画ページを開いて、全コマを画像にする。

    受け取るもの：frames_dir（画像の置き場所。無ければ作る）、chromium_path（手元で入れ済みの Chromium を使うとき。省略時は Playwright が入れたもの）
    返すもの：描画ページの情報（{"ok", "reason", "lastDate", "totalSeconds", "fps", ...}）。ok が False のときは画像を作らない
    """
    if sync_playwright is None:
        raise RuntimeError("playwright が入っていません。README の手順（pip install -r tools/video/requirements.txt）で入れてください")
    os.makedirs(frames_dir, exist_ok=True)
    page_url = pathlib.Path(video_settings.FRAME_PAGE_PATH).as_uri()
    with sync_playwright() as playwright:
        browser = launch_browser(playwright, chromium_path)
        try:
            return capture_all_frames(browser, page_url, frames_dir)
        except PlaywrightTimeoutError as error:
            raise RuntimeError(
                "描画ページの準備が " + str(READY_TIMEOUT_MS // 1000) + " 秒で終わりません。tools/video/frame.html をブラウザで開いて、コンソールのエラーを見てください"
            ) from error
        except PlaywrightError as error:
            raise RuntimeError("コマの撮影に失敗しました。もう一度動かし、直らなければ次の文を確かめてください：" + str(error).splitlines()[0]) from error
        finally:
            browser.close()


def launch_browser(playwright, chromium_path):
    """Chromium を起動する。起動できないときは、次にすることを書いた RuntimeError にする。

    受け取るもの：playwright（sync_playwright の中身）、chromium_path（手元の Chromium。省略可）
    返すもの：起動したブラウザ
    """
    launch_options = {}
    if chromium_path:
        launch_options["executable_path"] = chromium_path
    try:
        return playwright.chromium.launch(**launch_options)
    except PlaywrightError as error:
        raise RuntimeError("Chromium を起動できません。python -m playwright install chromium を動かしてください（" + str(error).splitlines()[0] + "）") from error


def capture_all_frames(browser, page_url, frames_dir):
    """描画ページを開き、準備ができたら全コマを画像にする。

    受け取るもの：browser（起動した Chromium）、page_url（描画ページの場所）、frames_dir（画像の置き場所）
    返すもの：描画ページの情報（ok が False のときは画像を作らない）
    """
    page = browser.new_page(viewport={"width": video_settings.EXPECTED_WIDTH, "height": video_settings.EXPECTED_HEIGHT})
    page.goto(page_url)
    page.wait_for_function("window.storyReady === true", timeout=READY_TIMEOUT_MS)
    info = page.evaluate("window.storyInfo")
    if not info["ok"]:
        return info
    total = frame_count(info["totalSeconds"], info["fps"])
    for index in range(total):
        page.evaluate("time => window.renderStoryFrame(time)", index / info["fps"])
        page.screenshot(path=os.path.join(frames_dir, "frame_" + format(index, "05d") + ".png"))
    return info
