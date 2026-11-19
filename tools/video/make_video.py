"""make_video.py：縦動画を1本作る入口（仕様 2-9）。Actions の中で動かす

流れ：描画ページで全コマを画像にする → mp4 につなぐ → 大きさ・長さ・ファイル名を確かめる → 1コマずつの画像を消す。
1か月前の帯が作れない日（値の件数が足りない日）だけは、動画を作らず、理由をログに出して成功で終わる（Actions を失敗にしない。仕様 2-9）。
それ以外の理由（状態づくりの忘れ・ファイルの読み込み失敗など）で作れないときは不具合なので、次にすることを書いて失敗で終わる。
書き出し先は video_output/（.gitignore 済み。commit・push しない）。
使い方：python tools/video/make_video.py [--chromium-path <手元の Chromium>]
Actions の出力（GITHUB_OUTPUT）があるときは、make（true/false）・last_date・file を書く。
"""

import argparse
import os
import shutil
import sys

import check_video
import encode_video
import render_frames
import video_settings

# 作らなくてよい日の理由（描画ページが返す reason）。仕様 2-9：失敗にしないのは「1か月前の帯が作れない日」だけ
SKIP_REASON_DATA_SHORT = "data_short"
SKIP_MESSAGE = "値の件数が足りず、1か月前の帯が作れないため"
# 不具合の理由（描画ページが返す reason）と、次にすること。これらのときは失敗で終わる
FAILURE_ADVICE = {
    "no_state": "帯の最終日の状態が無い・古いです。node tools/add_band_state.js が動いたか確かめてください",
    "no_base": "今日の図の基準（1か月前の状態・通算）が無い・古いです。node tools/add_band_state.js が動いたか確かめてください",
    "method_load_failed": "帯の計算方法のファイルを読めませんでした。js/band_config.js の methodFiles の場所を確かめてください",
}


def write_github_outputs(values):
    """GitHub Actions の出力ファイルに「名前=値」を書く（Actions の外では何もしない）。"""
    path = os.environ.get("GITHUB_OUTPUT")
    if not path:
        return
    with open(path, "a", encoding="utf-8") as file:
        for name, value in values.items():
            file.write(name + "=" + value + "\n")


def make_video(chromium_path=None):
    """動画を作る。作らなかったときは None、作ったときはファイルの場所を返す。確認で問題があれば RuntimeError。"""
    if os.path.isdir(video_settings.FRAMES_DIR):
        shutil.rmtree(video_settings.FRAMES_DIR)
    info = render_frames.render_frames(video_settings.FRAMES_DIR, chromium_path)
    if not info["ok"]:
        if info["reason"] != SKIP_REASON_DATA_SHORT:
            advice = FAILURE_ADVICE.get(info["reason"], "理由：" + str(info["reason"]) + "。tools/video/video_main.js のコンソールのエラーを確かめてください")
            raise RuntimeError("動画を作れません。" + advice)
        print("今日の動画は作りません：" + SKIP_MESSAGE + "（データの最終日 " + info.get("lastDate", "不明") + "）")
        write_github_outputs({"make": "false", "last_date": info.get("lastDate", "")})
        return None
    output_path = os.path.join(video_settings.OUTPUT_DIR, check_video.video_file_name(info["lastDate"]))
    encode_video.encode_video(video_settings.FRAMES_DIR, info["fps"], output_path)
    shutil.rmtree(video_settings.FRAMES_DIR)
    problems = check_video.check_video_file(output_path, info["lastDate"])
    if problems:
        raise RuntimeError("作った動画の確認で問題が見つかりました：" + " / ".join(problems))
    print("動画を作りました：" + output_path)
    write_github_outputs({"make": "true", "last_date": info["lastDate"], "file": output_path})
    return output_path


def main():
    """コマンドから動かしたときの入口。失敗したら終了コード1で終わる。"""
    parser = argparse.ArgumentParser(description="縦動画を1本作る")
    parser.add_argument("--chromium-path", default=None, help="手元の Chromium を使うとき（省略時は Playwright が入れたもの）")
    arguments = parser.parse_args()
    try:
        make_video(arguments.chromium_path)
    except RuntimeError as error:
        print("動画を作れませんでした：" + str(error), file=sys.stderr)
        sys.exit(video_settings.EXIT_ERROR)
    sys.exit(video_settings.EXIT_OK)


if __name__ == "__main__":
    main()
