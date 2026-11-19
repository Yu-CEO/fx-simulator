"""video_gate.py：縦動画を作るかどうかを決める（仕様 2-9）

作るのは「取得が成功し、データの最終日が前回から変わった日」だけ。
取得に失敗した日・最終日が前回と同じ日（土日・祝日など新しい値がない日）は作らない（古いデータの動画を「今日の分」として出さないため）。
1か月前の帯が作れない日を作らないのは、描画ページ側の判定（render_frames.py）。
主な関数：read_last_date（画面用データから最終日を読む）、decide_video（作るかを決める）。
使い方：python tools/video/video_gate.py read <data/usdjpy_recent.js>   → 最終日を表示
        python tools/video/video_gate.py decide --before <前回の最終日> --after-file <data/usdjpy_recent.js>   → make=true/false などを表示
update_data.yml から使われる。tests/test_video_tools.py でテストする。
"""

import argparse
import re
import sys

# 画面用データにある "lastDate":"YYYY-MM-DD" を探すパターン
LAST_DATE_PATTERN = re.compile(r'"lastDate"\s*:\s*"(\d{4}-\d{2}-\d{2})"')


def read_last_date(text):
    """画面用データ（usdjpy_recent.js の文字）から、データの最終日 "YYYY-MM-DD" を返す。見つからなければ None。

    例：read_last_date('var FX_DATA_RECENT = {"lastDate":"2026-11-17",...}') → "2026-11-17"
    """
    found = LAST_DATE_PATTERN.search(text)
    if found is None:
        return None
    return found.group(1)


def decide_video(before_date, after_date, fetch_succeeded=True):
    """動画を作るかを決める。

    受け取るもの：before_date（取得の前のデータの最終日。無ければ None）、after_date（取得のあとの最終日）、fetch_succeeded（取得が成功したか）
    返すもの：(作るか True/False, 理由の文)
    例：decide_video("2026-11-17", "2026-11-18") → (True, "データの最終日が変わりました（2026-11-17 → 2026-11-18）")
    """
    if not fetch_succeeded:
        return False, "取得に失敗した日は動画を作りません（古いデータの動画を出さないため）"
    if after_date is None:
        return False, "データの最終日を読めないため動画を作りません"
    if before_date == after_date:
        return False, "データの最終日が前回と同じ（" + after_date + "）ため動画を作りません（土日・祝日など新しい値がない日）"
    return True, "データの最終日が変わりました（" + str(before_date) + " → " + after_date + "）"


def read_file_text(path):
    """ファイルを文字として読む。受け取るもの：path。返すもの：中身の文字。"""
    with open(path, encoding="utf-8") as file:
        return file.read()


def main():
    """コマンドから動かしたときの入口（受け取るもの・返すものは無い）。read は最終日を、decide は GitHub Actions の出力に貼れる「名前=値」の行を表示する。"""
    parser = argparse.ArgumentParser(description="縦動画を作るかどうかを決める")
    commands = parser.add_subparsers(dest="command", required=True)
    read_parser = commands.add_parser("read")
    read_parser.add_argument("path")
    decide_parser = commands.add_parser("decide")
    decide_parser.add_argument("--before", default="")
    decide_parser.add_argument("--after-file", required=True)
    arguments = parser.parse_args()
    if arguments.command == "read":
        print(read_last_date(read_file_text(arguments.path)) or "")
        return
    after_date = read_last_date(read_file_text(arguments.after_file))
    should_make, reason = decide_video(arguments.before or None, after_date)
    print("make=" + ("true" if should_make else "false"))
    print("last_date=" + (after_date or ""))
    # 理由はログ用に標準エラーへ（出力の行には改行を入れない）
    print(reason, file=sys.stderr)


if __name__ == "__main__":
    main()
