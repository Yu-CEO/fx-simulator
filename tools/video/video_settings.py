"""video_settings.py：縦動画づくり（tools/video/）の設定をまとめたファイル（仕様 2-9）

書き出し先・ファイル名・動画の確認の基準（大きさ・長さ）・ffmpeg の設定など。
動画の中身（余白・文字の大きさ・秒数・文言）は js/story_config.js にある（サイトの図と同じ設定を使うため）。
make_video.py・render_frames.py・encode_video.py・check_video.py・video_gate.py から使われる。
"""

import os

# fx-simulator フォルダ（この設定ファイルの3つ上）
PRODUCT_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
# 画面用データ。データの最終日をここから読む
RECENT_DATA_PATH = os.path.join(PRODUCT_DIR, "data", "usdjpy_recent.js")
# コマを撮る描画ページ（サイトの公開ページからはリンクせず、Pages にも載せない）
FRAME_PAGE_PATH = os.path.join(PRODUCT_DIR, "tools", "video", "frame.html")

# 書き出し先（.gitignore に入れてある。動画を git の履歴に入れないため。仕様 2-9）
OUTPUT_DIR = os.path.join(PRODUCT_DIR, "video_output")
# 1コマずつの画像の置き場所（動画にしたあとは要らない）
FRAMES_DIR = os.path.join(OUTPUT_DIR, "frames")
# 動画のファイル名：fx_daily_YYYY-MM-DD.mp4（日付＝データの最終日）
FILE_PREFIX = "fx_daily_"
FILE_SUFFIX = ".mp4"

# 動画の確認の基準（仕様 2-9・AC-41）。作った動画がこれに合わなければ失敗にする
EXPECTED_WIDTH = 1080            # 画素
EXPECTED_HEIGHT = 1920           # 画素。縦長（TikTok の縦動画）
MIN_SECONDS = 15                 # 秒。短すぎる動画は見せたい内容が入らない
MAX_SECONDS = 20                 # 秒。仕様の長さの上限
DURATION_TOLERANCE_SECONDS = 0.1  # 秒。コマ数の端数で生じる長さのずれの許容

# ffmpeg の設定
VIDEO_CODEC = "libx264"          # H.264（TikTok に上げられる一般的な形式）
PIXEL_FORMAT = "yuv420p"         # スマホで再生できる色の形式
QUALITY_CRF = "18"               # 画質（小さいほど高画質。18 は見た目ほぼ劣化なし）
ENCODE_PRESET = "medium"         # 圧縮の手間。medium は速さと大きさの釣り合いがよい

# 終了コード。作らなかった日（1か月前の帯が作れない日）は Actions を失敗にしない（理由はログに出す）
EXIT_OK = 0
EXIT_ERROR = 1
