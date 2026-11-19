"""data_files.py：為替データのファイルを読み書きする部分（元の CSV と、画面用の JavaScript 2つ）。

主な関数：read_source_csv（元の CSV を読む）、build_source_csv（CSV の中身を作る）、
          build_screen_data（画面用に、有効な行だけを小数第3位に丸めて期間で2つに分ける）、
          build_screen_js（画面用の JavaScript の中身を作る）、write_files_together（まとめて書き換える）
tools/update_data.py から使われる。tests/test_update_data.py でテストする。
"""

import datetime
import json
import os
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation

# 元の CSV の先頭に書く出所の説明（「#」で始まる行は読むときに飛ばす）
SOURCE_COMMENT_LINES = [
    "# 為替データ：Frankfurter（https://frankfurter.dev/）。米ドル／円（1米ドルあたりの円）。欧州中央銀行（ECB）の参照レート（ユーロ基準の値から計算）",
    "# tools/update_data.py が取得した元の値をそのまま保存したもの（丸め・補完なし）。手で書き換えない",
]
CSV_HEADER = "date,value"
# 画面用データの値の桁。0.001円（小数第3位）。ファイルを小さくするため（仕様 2-7）
SCREEN_DECIMAL = Decimal("0.001")
# 最初に読む分の件数。今日の図の「1か月前の帯」には 251件（その日まで）＋20件＝271件が要る（仕様 2-8・AC-40a）。
# 1件足りないと今日の図が毎日出なくなるため、余裕を持たせて 280件にする（期間ではなく件数で切る）
RECENT_COUNT = 280
# これを下回ってはいけない件数（271件）。テストと、画面用データを作るときの確認に使う
RECENT_MIN_COUNT = 271
# 画面用データ全体（最近の分＋それより前の分）の件数の上限。約10年分（約255営業日×10年）。仕様 2-1「過去約10年分」。
# 毎朝の更新で古い日から切り落とし、画面が読む量（仕様 2-7 の 200KB）が日々増え続けないようにする。元の CSV には全部残す
SCREEN_MAX_COUNT = 2560
# 土曜・日曜（datetime の weekday で 5・6）。ECB の値に週末はないが、万一入ってきても営業日だけで数えるための保険
# （画面用には平日の値だけを使う。元の CSV には残す）
WEEKEND_DAYS = (5, 6)


def read_source_csv(path):
    """元の CSV を読み、[{"date", "value"}, ...] を返す。ファイルが無ければ空の一覧を返す。

    受け取るもの：path（CSV のパス）
    返すもの：行の一覧（値は文字のまま）
    """
    if not os.path.exists(path):
        return []
    rows = []
    with open(path, encoding="utf-8") as file:
        for line in file:
            line = line.rstrip("\n")
            if line == "" or line.startswith("#") or line == CSV_HEADER:
                continue
            date_text, _, value_text = line.partition(",")
            rows.append({"date": date_text, "value": value_text})
    return rows


def build_source_csv(rows):
    """元の CSV の中身（文字）を作る。値は受け取ったまま書く。

    受け取るもの：rows（[{"date", "value"}, ...]）
    返すもの：CSV の文字
    例：build_source_csv([{"date": "2026-01-05", "value": "156.7"}]) → "# …\\n# …\\ndate,value\\n2026-01-05,156.7\\n"
    """
    lines = SOURCE_COMMENT_LINES + [CSV_HEADER]
    for row in rows:
        lines.append(row["date"] + "," + row["value"])
    return "\n".join(lines) + "\n"


def to_screen_value(value_text):
    """値の文字を、画面用の小数第3位までの数字の文字に直す。使えない値なら None を返す。

    使えない値：空・数字でない・0以下・無限大など（チャートや計算が壊れるため画面用には入れない）
    受け取るもの：value_text（元の値の文字）
    返すもの：丸めた数字の文字（末尾の0は省く）または None
    例：to_screen_value("156.7049") → "156.705" ／ to_screen_value("156.700") → "156.7" ／ to_screen_value("") → None
    """
    try:
        number = Decimal(value_text.strip())
    except InvalidOperation:
        return None
    if not number.is_finite() or number <= 0:
        return None
    # 四捨五入（ROUND_HALF_UP）。元の値を10進数のまま丸めるので、2進数の誤差が入らない
    rounded = number.quantize(SCREEN_DECIMAL, rounding=ROUND_HALF_UP)
    text = format(rounded, "f")
    if "." in text:
        text = text.rstrip("0").rstrip(".")
    return text


def is_weekend(date_text):
    """日付が土曜・日曜なら True を返す。例：is_weekend("2026-11-14") → True（土曜）"""
    return datetime.date.fromisoformat(date_text).weekday() in WEEKEND_DAYS


def build_screen_data(rows):
    """画面用のデータ（最近の分・それより前の分）と、除いた件数を作る。

    除くもの：値が空・数字でない行（件数を数える）と、土曜・日曜の行（営業日だけにするため。別に数える）
    受け取るもの：rows（元の CSV の行。古い順）
    返すもの：(recent, older, 値が使えず除いた件数, 週末で除いた件数)。recent と older は [("YYYYMMDD", "値"), ...]
    """
    valid = []
    skipped_count = 0
    weekend_count = 0
    for row in rows:
        screen_value = to_screen_value(row["value"])
        if screen_value is None:
            skipped_count += 1
            continue
        if is_weekend(row["date"]):
            weekend_count += 1
            continue
        valid.append((row["date"].replace("-", ""), screen_value))
    # 古い方から上限を超えた分を切り落とす（画面用だけ。CSV は変えない）
    valid = valid[-SCREEN_MAX_COUNT:]
    # 元のデータが十分あるのに最近の分が少ないと今日の図が出なくなる。件数で切るので RECENT_MIN_COUNT 以上になる
    split_at = max(0, len(valid) - RECENT_COUNT)
    return valid[split_at:], valid[:split_at], skipped_count, weekend_count


def build_screen_js(variable_name, pairs, last_date):
    """画面用の JavaScript の中身（文字）を作る。index.html を直接開いても読めるよう、変数に入れる形にする。

    受け取るもの：variable_name（"FX_DATA_RECENT" など）、pairs（[("YYYYMMDD", "値"), ...]）、last_date（データの最終日 "YYYY-MM-DD"）
    返すもの：JavaScript の文字
    """
    header = (
        "/* 自動生成（tools/update_data.py。手で書き換えない）。出どころ：欧州中央銀行（ECB）の参照レート（Frankfurter 経由）米ドル／円。"
        "dates＝YYYYMMDD、values＝円（小数第3位） */\n"
    )
    # 数字は JSON の形でそのまま並べる（JavaScript でもそのまま読める）
    dates_text = ",".join(date for date, _ in pairs)
    values_text = ",".join(value for _, value in pairs)
    body = (
        "var " + variable_name + " = {\"lastDate\":" + json.dumps(last_date)
        + ",\"dates\":[" + dates_text + "],\"values\":[" + values_text + "]};\n"
    )
    return header + body


def write_files_together(contents_by_path):
    """いくつかのファイルを、全部の中身ができてからまとめて書き換える。

    いったん「.tmp」に書いてから置き換えるので、途中で止まっても元のファイルが半端に壊れない。
    受け取るもの：contents_by_path（{パス: 中身の文字}）
    返すもの：なし
    """
    temporary_paths = {}
    for path, content in contents_by_path.items():
        temporary_path = path + ".tmp"
        with open(temporary_path, "w", encoding="utf-8", newline="\n") as file:
            file.write(content)
        temporary_paths[path] = temporary_path
    for path, temporary_path in temporary_paths.items():
        os.replace(temporary_path, path)
