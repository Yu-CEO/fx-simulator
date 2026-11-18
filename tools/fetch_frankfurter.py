"""fetch_frankfurter.py：Frankfurter（為替データの無料API）から、ECB（欧州中央銀行）提供分の米ドル／円の日次の値を取ってくるだけのファイル。

主な関数：fetch_rates（期間を指定して取得し、「日付と値の一覧」の共通の形で返す）
tools/update_data.py から使われる。提供元ごとの違い（URL・返ってくる形）はこのファイルの中だけに閉じ込める。
予備の提供元に替えるときは、同じ形を返す別のファイル（例：fetch_boj.py）を作って差し替える。
API の形は公式の説明（https://frankfurter.dev/ と https://api.frankfurter.dev/v2/openapi.json）で確認した（2026-11-18）。
ECB 提供分だけを使う理由（仕様 v3.2）：既定の集約レートは複数の元を混ぜて1日の動きがならされ、帯が狭く出て外れが増えるため。
ECB の値はユーロ基準。米ドル／円（base=USD）は Frankfurter 側で ECB のユーロ／米ドルとユーロ／円から計算されて返る（クロスレート。実際の返答で確認済み）。
"""

import json
import re
import urllib.error
import urllib.parse
import urllib.request

# 期間を指定して取るときの入口（providers/ECB＝ECB 提供分だけ。集約レートは使わない）。返ってくるのは [{"date","base","quote","rate"}, ...] の JSON の配列
API_URL = "https://api.frankfurter.dev/v2/providers/ECB/rates"
BASE_CURRENCY = "USD"   # 1米ドルあたり
QUOTE_CURRENCY = "JPY"  # 何円か
# 値として受け付ける数字の形（例：156.7）。これ以外の文字は CSV・画面用データに入れない（外から来た文字をそのまま書かないため）
NUMBER_PATTERN = re.compile(r"^\d{1,6}(\.\d{1,10})?$")
TIMEOUT_SEC = 60        # 60秒。10年分でも数秒で返るので、これより長いときは止まっているとみなす
# 名乗る名前。個人の情報は入れない
USER_AGENT = "fx-simulator-data-update/1.0"


class FetchError(Exception):
    """取得に失敗した（通信できない・形がおかしい）ことを表すエラー。"""


def build_url(start_date, end_date):
    """取得に使う URL を作る。

    受け取るもの：start_date・end_date（"YYYY-MM-DD" の文字）
    返すもの：URL の文字
    例：build_url("2026-01-01", "2026-01-31")
        → "https://api.frankfurter.dev/v2/providers/ECB/rates?from=2026-01-01&to=2026-01-31&base=USD&quotes=JPY"
    """
    query = urllib.parse.urlencode({
        "from": start_date,
        "to": end_date,
        "base": BASE_CURRENCY,
        "quotes": QUOTE_CURRENCY,
    })
    return API_URL + "?" + query


def download_text(url):
    """URL の中身を文字として取ってくる（本物の通信をするのはこの関数だけ）。

    受け取るもの：url（文字）
    返すもの：返ってきた本文（文字）
    失敗したときは FetchError を出す。
    """
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/json"})
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT_SEC) as response:
            return response.read().decode("utf-8")
    except (urllib.error.URLError, TimeoutError, OSError) as error:
        raise FetchError("Frankfurter に接続できませんでした（" + str(error) + "）。時間をおいてもう一度動かしてください") from error


def parse_response(text):
    """返ってきた本文を「日付と値の一覧」の共通の形に直す。

    値は丸めずに、届いた文字のまま残す（元の CSV に、そのまま保存するため）。
    受け取るもの：text（JSON の文字）
    返すもの：[{"date": "YYYY-MM-DD", "value": "155.12"}, ...]（値が空のときは ""）
    形がおかしいときは FetchError を出す。
    例：parse_response('[{"date":"2026-01-05","base":"USD","quote":"JPY","rate":156.7}]')
        → [{"date": "2026-01-05", "value": "156.7"}]
    """
    try:
        # parse_float=str：小数を数字に直さず文字のまま受け取る（丸めや誤差を入れないため）
        items = json.loads(text, parse_float=str, parse_int=str)
    except json.JSONDecodeError as error:
        raise FetchError("返ってきたデータが JSON の形ではありません。提供元の仕様が変わった可能性があります") from error
    if not isinstance(items, list):
        raise FetchError("返ってきたデータが一覧（配列）の形ではありません。提供元の仕様が変わった可能性があります")
    rows = []
    for item in items:
        rows.append(convert_item(item))
    return rows


def convert_item(item):
    """1件分（1日分）を共通の形に直す。

    受け取るもの：item（{"date","base","quote","rate"} の辞書）
    返すもの：{"date": "YYYY-MM-DD", "value": 値の文字}
    """
    if not isinstance(item, dict) or "date" not in item or "rate" not in item:
        raise FetchError("返ってきたデータに日付か値の欄がありません。提供元の仕様が変わった可能性があります")
    if item.get("base") != BASE_CURRENCY or item.get("quote") != QUOTE_CURRENCY:
        raise FetchError("米ドル／円ではないデータが返ってきました。URL の指定を確認してください")
    raw_value = item["rate"]
    value_text = "" if raw_value is None else str(raw_value)
    if not NUMBER_PATTERN.fullmatch(value_text):
        value_text = ""  # 数字の形でない値は空にする（空の値は画面用データに入らず、件数がログに出る）
    return {"date": str(item["date"]), "value": value_text}


def fetch_rates(start_date, end_date, download=download_text):
    """期間を指定して米ドル／円の日次の値を取得する（update_data.py が呼ぶ入口）。

    受け取るもの：start_date・end_date（"YYYY-MM-DD"）、download（テストで本物の通信の代わりを渡すための引数）
    返すもの：[{"date": "YYYY-MM-DD", "value": "値の文字"}, ...]
    例：fetch_rates("2026-11-10", "2026-11-17")
    """
    text = download(build_url(start_date, end_date))
    return parse_response(text)
