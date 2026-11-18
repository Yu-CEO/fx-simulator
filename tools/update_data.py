"""update_data.py：毎日1回、為替データを取得してファイルを更新する入口（GitHub Actions が毎日10時に動かす）。

流れ：今日すでに取得が成功していれば何もしない → 取得（fetch_frankfurter.py）→ 形の確認
      → 元の CSV と画面用データ2つ（data/usdjpy_recent.js・data/usdjpy_older.js）を作ってまとめて書き換える。
失敗したときはファイルを書き換えず、終了コード1（失敗）で終わる。
提供元に問い合わせるのは fetch_frankfurter.py だけ。このファイルは「日付と値の一覧」の共通の形だけを受け取る。
使い方：python tools/update_data.py（取得して更新）／python tools/update_data.py --rebuild（取得せず画面用データだけ作り直す）
        ／python tools/update_data.py --reimport（今の CSV を捨てて、約10年分を取得し直す。データ元を替えたときの1回だけ使う。仕様 v3.2）
"""

import datetime
import os
import re
import sys

import data_files
import fetch_frankfurter

TOOL_DIR = os.path.dirname(os.path.abspath(__file__))
PRODUCT_DIR = os.path.dirname(TOOL_DIR)
DATA_DIR = os.path.join(PRODUCT_DIR, "data")
# 最後に取得が成功した日（日本時間）を書いておくファイル。リポジトリには上げず、Actions ではキャッシュで残す
STATE_FILE = os.path.join(PRODUCT_DIR, ".fetch_state", "last_success.txt")
SOURCE_CSV_NAME = "usdjpy_source.csv"
RECENT_JS_NAME = "usdjpy_recent.js"
OLDER_JS_NAME = "usdjpy_older.js"
JAPAN_TIME = datetime.timezone(datetime.timedelta(hours=9))  # 日本時間（UTC+9）。「1日1回」は日本の日付で数える
INITIAL_YEARS = 10      # 初回にまとめて取る年数（約10年分。仕様 2-1）
# 初回に最低これだけの件数がないときは、形がおかしいとみなす。10年分は約2,500営業日あるので、その8割
MIN_INITIAL_ROWS = 2000
DATE_PATTERN = re.compile(r"^\d{4}-\d{2}-\d{2}$")


class UpdateError(Exception):
    """更新を止めるべき問題（形がおかしい・件数が減った など）。"""


def today_in_japan():
    """日本時間の今日の日付を返す。例：datetime.date(2026, 11, 18)"""
    return datetime.datetime.now(JAPAN_TIME).date()


def already_fetched_today(state_file, today):
    """今日すでに取得が成功しているかを調べる（1日1回だけにするため）。

    受け取るもの：state_file（記録ファイルのパス）、today（日本時間の今日）
    返すもの：成功していれば True
    """
    if not os.path.exists(state_file):
        return False
    with open(state_file, encoding="utf-8") as file:
        return file.read().strip() == today.isoformat()


def record_success(state_file, today):
    """今日の取得が成功したことを記録する。"""
    os.makedirs(os.path.dirname(state_file), exist_ok=True)
    with open(state_file, "w", encoding="utf-8") as file:
        file.write(today.isoformat() + "\n")


def decide_start_date(existing_rows, today):
    """どの日から取るかを決める。初回は約10年前から、2回目以降は CSV の最終日の翌日から。

    受け取るもの：existing_rows（今の CSV の行）、today（日本時間の今日）
    返すもの：開始日（date）
    例：最終日が 2026-11-16 なら date(2026, 11, 17)
    """
    if not existing_rows:
        try:
            return today.replace(year=today.year - INITIAL_YEARS)
        except ValueError:  # 2月29日のとき、10年前に同じ日がないので28日にする
            return today.replace(year=today.year - INITIAL_YEARS, day=28)
    last_date = datetime.date.fromisoformat(existing_rows[-1]["date"])
    return last_date + datetime.timedelta(days=1)


def check_dates(rows):
    """日付の形と、古い順に重なりなく並んでいるかを確かめる。おかしければ UpdateError を出す。"""
    previous = ""
    for row in rows:
        if not DATE_PATTERN.match(row["date"]):
            raise UpdateError("日付の形がおかしい行があります（" + row["date"] + "）。更新を止めました")
        try:
            datetime.date.fromisoformat(row["date"])
        except ValueError as error:
            raise UpdateError("ありえない日付があります（" + row["date"] + "）。更新を止めました") from error
        if row["date"] <= previous:
            raise UpdateError("日付が古い順に並んでいません（" + row["date"] + "）。更新を止めました")
        previous = row["date"]


def merge_rows(existing_rows, fetched_rows):
    """今の行に、新しく取った行を足す。今の最終日以前の行は足さない（同じ日を2回入れないため）。

    受け取るもの：existing_rows・fetched_rows（どちらも古い順）
    返すもの：(つないだ行, 新しく足した件数)
    """
    last_date = ""
    if existing_rows:
        last_date = existing_rows[-1]["date"]
    new_rows = [row for row in fetched_rows if row["date"] > last_date]
    return existing_rows + new_rows, len(new_rows)


def check_counts(existing_rows, merged_rows):
    """件数がおかしくないかを確かめる（前回より減った・初回なのに少なすぎる）。"""
    if len(merged_rows) < len(existing_rows):
        raise UpdateError("件数が前回より減りました。更新を止めました")
    if not existing_rows and len(merged_rows) < MIN_INITIAL_ROWS:
        raise UpdateError(
            "初回の取得で " + str(len(merged_rows)) + " 件しかありません（"
            + str(MIN_INITIAL_ROWS) + " 件以上のはず）。提供元の状態を確かめてください"
        )


def build_all_files(merged_rows, data_dir):
    """書き換える3つのファイルの中身を作る。

    受け取るもの：merged_rows（つないだ全部の行）、data_dir（data フォルダのパス）
    返すもの：({パス: 中身}, ログに出す文の一覧)
    """
    recent, older, skipped_count, weekend_count = data_files.build_screen_data(merged_rows)
    if not recent:
        raise UpdateError("画面に使える値が1件もありません。更新を止めました")
    last = recent[-1][0]
    last_date = last[0:4] + "-" + last[4:6] + "-" + last[6:8]
    contents = {
        os.path.join(data_dir, SOURCE_CSV_NAME): data_files.build_source_csv(merged_rows),
        os.path.join(data_dir, RECENT_JS_NAME): data_files.build_screen_js("FX_DATA_RECENT", recent, last_date),
        os.path.join(data_dir, OLDER_JS_NAME): data_files.build_screen_js("FX_DATA_OLDER", older, last_date),
    }
    logs = [
        "値が空・数字でないため画面用データに入れなかった行：" + str(skipped_count) + " 件（元の CSV には残しています）",
        "土曜・日曜のため画面用データに入れなかった行：" + str(weekend_count) + " 件（元の CSV には残しています）",
        "画面用データ：最近の分 " + str(len(recent)) + " 件・それより前の分 " + str(len(older)) + " 件（最終日 " + last_date + "）",
    ]
    return contents, logs


def rebuild_screen_files(data_dir=DATA_DIR):
    """API に問い合わせず、今の CSV から画面用データ2つだけを作り直す（計算の確認や形を変えたときに使う）。

    受け取るもの：data_dir（data フォルダのパス）
    返すもの：ログに出す文の一覧
    """
    rows = data_files.read_source_csv(os.path.join(data_dir, SOURCE_CSV_NAME))
    if not rows:
        raise UpdateError("元の CSV がありません。先に python tools/update_data.py で取得してください")
    contents, logs = build_all_files(rows, data_dir)
    del contents[os.path.join(data_dir, SOURCE_CSV_NAME)]  # 元の CSV は書き換えない
    data_files.write_files_together(contents)
    return logs


def run_update(data_dir=DATA_DIR, state_file=STATE_FILE, today=None, fetch=fetch_frankfurter.fetch_rates, reimport=False):
    """更新の流れ全体。テストでは fetch に仮の取得関数を渡す。

    受け取るもの：data_dir・state_file（パス）、today（日本時間の今日。省略時は今日）、fetch（取得する関数）、
                  reimport（True なら今の CSV を無いものとして、約10年分を取り直す。データ元を替えたときの1回だけ。
                  件数が減っても止めず、「今日はすでに取得した」の記録も無視する）
    返すもの：ログに出す文の一覧
    失敗したときは UpdateError か fetch_frankfurter.FetchError を出す（ファイルは書き換えない）。
    """
    if today is None:
        today = today_in_japan()
    if already_fetched_today(state_file, today) and not reimport:
        return ["今日（" + today.isoformat() + "）はすでに取得が成功しているので、問い合わせませんでした（1日1回だけ）"]
    existing_rows = data_files.read_source_csv(os.path.join(data_dir, SOURCE_CSV_NAME))
    if reimport:
        existing_rows = []
    start_date = decide_start_date(existing_rows, today)
    logs = []
    fetched_rows = []
    if start_date <= today:
        fetched_rows = fetch(start_date.isoformat(), today.isoformat())
    check_dates(fetched_rows)
    merged_rows, added_count = merge_rows(existing_rows, fetched_rows)
    check_counts(existing_rows, merged_rows)
    contents, build_logs = build_all_files(merged_rows, data_dir)
    os.makedirs(data_dir, exist_ok=True)
    data_files.write_files_together(contents)
    record_success(state_file, today)
    logs.append("新しく足した行：" + str(added_count) + " 件（全部で " + str(len(merged_rows)) + " 件）")
    return logs + build_logs


def main():
    """コマンドから動かしたときの入口。失敗したら終了コード1で終わる（Actions の結果を失敗にするため）。

    「--rebuild」をつけると、API に問い合わせずに画面用データだけを作り直す。「--reimport」は約10年分の取り直し（1回だけ）。
    """
    try:
        if "--rebuild" in sys.argv[1:]:
            lines = rebuild_screen_files()
        elif "--reimport" in sys.argv[1:]:
            lines = run_update(reimport=True)
        else:
            lines = run_update()
        for line in lines:
            print(line)
    except (UpdateError, fetch_frankfurter.FetchError) as error:
        print("更新に失敗しました。ファイルは書き換えていません：" + str(error), file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
