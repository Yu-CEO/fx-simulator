"""check_video.py：書き出した動画の確認（仕様 2-9・AC-41）

大きさ（1080×1920）・長さ（15〜20秒）・ファイル名（fx_daily_YYYY-MM-DD.mp4。日付＝データの最終日）・音が入っていないことを確かめ、基準に合わなければ失敗にする。
主な関数：check_video_facts（調べた事実を基準と比べる。ファイルは読まない）、probe_video（ffprobe で事実を調べる）、check_video_file（両方まとめて）。
make_video.py から使われる。tests/test_video_tools.py でテストする。
"""

import json
import os
import subprocess

import video_settings


def video_file_name(last_date):
    """データの最終日から、動画のファイル名を作る。例：video_file_name("2026-11-18") → "fx_daily_2026-11-18.mp4" """
    return video_settings.FILE_PREFIX + last_date + video_settings.FILE_SUFFIX


def check_video_facts(facts, file_name, last_date):
    """調べた事実（大きさ・長さなど）を基準と比べ、問題の一覧を返す（空なら合格）。

    受け取るもの：facts（{"width", "height", "duration", "has_audio"}）、file_name、last_date（データの最終日）
    返すもの：問題の文の一覧
    例：check_video_facts({"width": 1080, "height": 1920, "duration": 18.0, "has_audio": False}, "fx_daily_2026-11-18.mp4", "2026-11-18") → []
    """
    problems = []
    if file_name != video_file_name(last_date):
        problems.append("ファイル名が " + video_file_name(last_date) + " ではありません（" + file_name + "）")
    if facts["width"] != video_settings.EXPECTED_WIDTH or facts["height"] != video_settings.EXPECTED_HEIGHT:
        problems.append("大きさが " + str(video_settings.EXPECTED_WIDTH) + "×" + str(video_settings.EXPECTED_HEIGHT) + " ではありません（"
                        + str(facts["width"]) + "×" + str(facts["height"]) + "）")
    tolerance = video_settings.DURATION_TOLERANCE_SECONDS
    too_short = facts["duration"] < video_settings.MIN_SECONDS - tolerance
    too_long = facts["duration"] > video_settings.MAX_SECONDS + tolerance
    if too_short or too_long:
        problems.append("長さが " + str(video_settings.MIN_SECONDS) + "〜" + str(video_settings.MAX_SECONDS) + " 秒ではありません（"
                        + format(facts["duration"], ".2f") + " 秒）")
    if facts["has_audio"]:
        problems.append("音が入っています（音は TikTok で付けるため、無音にする決まりです）")
    return problems


def probe_video(path):
    """ffprobe（動画の情報を調べる道具）で、大きさ・長さ・音の有無・形式を調べる。

    受け取るもの：path（動画ファイルの場所）
    返すもの：{"width", "height", "duration", "has_audio", "codec"}
    失敗したとき（ffprobe が無い・動画を読めない・映像が無い）は、次の行動つきの文で RuntimeError にする
    """
    command = ["ffprobe", "-v", "error", "-print_format", "json", "-show_streams", "-show_format", path]
    try:
        result = subprocess.run(command, capture_output=True, text=True, check=True)
    except FileNotFoundError as error:
        raise RuntimeError("ffprobe が見つかりません。README の手順で ffmpeg を入れてください") from error
    except subprocess.CalledProcessError as error:
        raise RuntimeError("ffprobe が動画を読めませんでした。動画が壊れていないか確かめてください：" + error.stderr.strip()) from error
    info = json.loads(result.stdout)
    video_streams = [stream for stream in info["streams"] if stream["codec_type"] == "video"]
    if not video_streams:
        raise RuntimeError("動画に映像が入っていません。encode_video.py の ffmpeg のログを確かめてください")
    video_stream = video_streams[0]
    has_audio = any(stream["codec_type"] == "audio" for stream in info["streams"])
    return {
        "width": int(video_stream["width"]), "height": int(video_stream["height"]),
        "duration": float(info["format"]["duration"]), "has_audio": has_audio, "codec": video_stream["codec_name"],
    }


def check_video_file(path, last_date):
    """動画ファイルを調べて、問題の一覧を返す（空なら合格）。

    受け取るもの：path（動画ファイルの場所）、last_date（データの最終日 "YYYY-MM-DD"）
    返すもの：問題の文の一覧。調べられなかったときは RuntimeError（probe_video）
    """
    facts = probe_video(path)
    problems = check_video_facts(facts, os.path.basename(path), last_date)
    if facts["codec"] != "h264":
        problems.append("H.264 ではありません（" + facts["codec"] + "）")
    return problems
