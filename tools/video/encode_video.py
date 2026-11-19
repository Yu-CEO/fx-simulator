"""encode_video.py：1コマずつの画像を、mp4（1080×1920・H.264・無音）につなぐ（仕様 2-9）

主な関数：encode_video。ffmpeg（動画を作る道具）を使う。Actions の中だけで使い、サイトからは使わない。
make_video.py から使われる。
"""

import os
import subprocess

import video_settings


def encode_video(frames_dir, fps, output_path):
    """frame_00000.png から始まる連番の画像を、無音の mp4 にする。

    受け取るもの：frames_dir（画像の置き場所）、fps（1秒あたりのコマ数）、output_path（書き出す mp4 の場所）
    返すもの：なし。ffmpeg が失敗したときは RuntimeError（理由の文つき）
    """
    command = [
        "ffmpeg", "-y", "-loglevel", "error", "-framerate", str(fps), "-i", os.path.join(frames_dir, "frame_%05d.png"),
        "-c:v", video_settings.VIDEO_CODEC, "-pix_fmt", video_settings.PIXEL_FORMAT, "-crf", video_settings.QUALITY_CRF,
        "-preset", video_settings.ENCODE_PRESET, "-movflags", "+faststart", "-an", output_path,
    ]
    try:
        subprocess.run(command, check=True, capture_output=True, text=True)
    except FileNotFoundError as error:
        raise RuntimeError("ffmpeg が見つかりません。README の手順で ffmpeg を入れてください") from error
    except subprocess.CalledProcessError as error:
        raise RuntimeError("ffmpeg が失敗しました：" + error.stderr.strip()) from error
