"""test_update_data.py：取得・変換（tools/update_data.py・data_files.py・fetch_frankfurter.py）と大きさの確認の自動テスト

受け入れ基準 AC-10・AC-10a〜10g・AC-22 に対応。仮の API 応答を使い、本物の API には問い合わせない。
実行方法：fx-simulator フォルダで `python -m unittest discover -s tests -p "test_*.py"`
"""

import datetime
import json
import os
import re
import sys
import tempfile
import unittest

PRODUCT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(PRODUCT_DIR, "tools"))

import check_size  # noqa: E402
import data_files  # noqa: E402
import fetch_frankfurter  # noqa: E402
import update_data  # noqa: E402

TODAY = datetime.date(2026, 1, 20)


def fake_api_text(rows):
    """仮の API 応答（JSON の文字）を作る。rows は [(日付, 値の JSON 表記), ...]"""
    items = ['{"date":"' + date + '","base":"USD","quote":"JPY","rate":' + value + "}" for date, value in rows]
    return "[" + ",".join(items) + "]"


def weekday_dates(start, count):
    """start から平日だけを count 日分、"YYYY-MM-DD" で返す。"""
    dates = []
    day = start
    while len(dates) < count:
        if day.weekday() < 5:
            dates.append(day.isoformat())
        day += datetime.timedelta(days=1)
    return dates


def read_js_data(path):
    """画面用の JavaScript から {"lastDate","dates","values"} を取り出す。"""
    with open(path, encoding="utf-8") as file:
        text = file.read()
    return json.loads(text[text.index("= ") + 2:text.rindex(";")])


class UpdateDataTest(unittest.TestCase):
    """update_data.run_update を、一時フォルダと仮の取得関数で動かすテスト。"""

    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.data_dir = os.path.join(self.folder.name, "data")
        self.state_file = os.path.join(self.folder.name, "state", "last_success.txt")
        self.calls = []

    def tearDown(self):
        self.folder.cleanup()

    def make_fetch(self, text):
        """仮の取得関数（本物の通信の代わりに text を返す）を作る。呼ばれた回数を self.calls に残す。"""
        def fetch(start_date, end_date):
            self.calls.append((start_date, end_date))
            return fetch_frankfurter.fetch_rates(start_date, end_date, download=lambda url: text)
        return fetch

    def initial_rows(self, count=2100):
        """初回の取得に使う、平日だけの仮のデータ（値は 100 から少しずつ変わる）。"""
        dates = weekday_dates(datetime.date(2017, 1, 2), count)
        return [(date, format(100 + index * 0.0123456, ".7f")) for index, date in enumerate(dates)]

    def run_once(self, rows, today=TODAY):
        return update_data.run_update(self.data_dir, self.state_file, today, self.make_fetch(fake_api_text(rows)))

    def test_ac10_invalid_values_kept_in_csv_but_removed_from_screen_data(self):
        """AC-10：空の値・数字でない値は CSV にそのまま残し、画面用からは除き、件数をログに出す。日付は古い順。"""
        rows = self.initial_rows()
        rows[5] = (rows[5][0], "null")
        rows[9] = (rows[9][0], '"abc"')
        logs = self.run_once(rows)
        csv_rows = data_files.read_source_csv(os.path.join(self.data_dir, "usdjpy_source.csv"))
        self.assertEqual(len(csv_rows), len(rows))
        self.assertEqual(csv_rows[5]["value"], "")
        self.assertEqual(csv_rows[9]["value"], "", "数字の形でない値は空にして保存する")
        self.assertEqual([row["date"] for row in csv_rows], sorted(row["date"] for row in csv_rows))
        self.assertTrue(any("入れなかった行：2 件" in line for line in logs))
        screen_dates = read_js_data(os.path.join(self.data_dir, "usdjpy_older.js"))["dates"]
        self.assertNotIn(int(rows[5][0].replace("-", "")), screen_dates)

    def test_ac10a_screen_values_are_csv_values_rounded_without_overlap(self):
        """AC-10a：画面用の値＝CSV の値を小数第3位に丸めたもの。recent と older は重ならず、合わせて有効な行の数。"""
        rows = self.initial_rows()
        rows[3] = (rows[3][0], "123.4565")   # 四捨五入で 123.457
        self.run_once(rows)
        recent = read_js_data(os.path.join(self.data_dir, "usdjpy_recent.js"))
        older = read_js_data(os.path.join(self.data_dir, "usdjpy_older.js"))
        self.assertEqual(len(recent["dates"]), data_files.RECENT_COUNT)
        self.assertFalse(set(recent["dates"]) & set(older["dates"]))
        self.assertEqual(len(recent["dates"]) + len(older["dates"]), len(rows))
        self.assertEqual(older["values"][3], 123.457)
        csv_by_date = {row["date"].replace("-", ""): row["value"] for row in data_files.read_source_csv(os.path.join(self.data_dir, "usdjpy_source.csv"))}
        for date, value in zip(older["dates"] + recent["dates"], older["values"] + recent["values"]):
            self.assertEqual(format(value, "f").rstrip("0").rstrip("."), data_files.to_screen_value(csv_by_date[str(date)]))

    def test_weekend_rows_kept_in_csv_but_not_in_screen_data(self):
        """土曜・日曜の行は CSV に残し、画面用には入れない（20営業日＝約1か月にそろえるため）。"""
        rows = self.initial_rows()
        rows.append(("2026-01-24", "150.0"))  # 土曜
        self.run_once(rows)
        recent = read_js_data(os.path.join(self.data_dir, "usdjpy_recent.js"))
        self.assertNotIn(20260124, recent["dates"])
        self.assertEqual(data_files.read_source_csv(os.path.join(self.data_dir, "usdjpy_source.csv"))[-1]["date"], "2026-01-24")

    def test_ac10b_failure_does_not_change_files(self):
        """AC-10b：通信エラー・形がおかしい応答では、ファイルを書き換えずに失敗で終わる。"""
        self.run_once(self.initial_rows())
        before = {name: open(os.path.join(self.data_dir, name), encoding="utf-8").read() for name in os.listdir(self.data_dir)}
        next_day = TODAY + datetime.timedelta(days=1)

        def broken_download(url):
            raise fetch_frankfurter.FetchError("通信エラー（テスト）")

        bad_cases = [
            lambda start, end: fetch_frankfurter.fetch_rates(start, end, download=broken_download),
            lambda start, end: fetch_frankfurter.fetch_rates(start, end, download=lambda url: '{"error":"x"}'),
            lambda start, end: fetch_frankfurter.fetch_rates(start, end, download=lambda url: "<html>"),
            lambda start, end: fetch_frankfurter.fetch_rates(start, end, download=lambda url: fake_api_text([("2026-01-22", "1"), ("2026-01-21", "1")])),
        ]
        for fetch in bad_cases:
            with self.assertRaises((update_data.UpdateError, fetch_frankfurter.FetchError)):
                update_data.run_update(self.data_dir, self.state_file, next_day, fetch)
        after = {name: open(os.path.join(self.data_dir, name), encoding="utf-8").read() for name in os.listdir(self.data_dir)}
        self.assertEqual(before, after)

    def test_ac10b_too_few_rows_on_first_fetch_fails(self):
        """初回なのに件数が少なすぎる応答は、形がおかしいとみなして止める（ファイルを作らない）。"""
        with self.assertRaises(update_data.UpdateError):
            self.run_once(self.initial_rows(count=100))
        self.assertFalse(os.path.exists(os.path.join(self.data_dir, "usdjpy_source.csv")))

    def test_ac10c_second_run_on_same_day_does_not_call_api(self):
        """AC-10c：同じ日にすでに成功していれば、もう一度動かしても API に問い合わせない。翌日は最終日の翌日から取る。"""
        self.run_once(self.initial_rows())
        self.assertEqual(len(self.calls), 1)
        self.run_once(self.initial_rows())
        self.assertEqual(len(self.calls), 1)
        next_day = TODAY + datetime.timedelta(days=1)
        self.run_once([("2026-01-21", "150.5")], today=next_day)
        last_csv_date = self.initial_rows()[-1][0]
        expected_start = (datetime.date.fromisoformat(last_csv_date) + datetime.timedelta(days=1)).isoformat()
        self.assertEqual(self.calls[-1], (expected_start, next_day.isoformat()))

    def test_ac10g_no_filled_rows_for_ecb_holidays_or_weekends(self):
        """AC-10g：ECB の休業日（例：12月25日）・土日の行が応答に無ければ、CSV にも画面用データにも作らない（補わない）。"""
        rows = [row for row in self.initial_rows() if not row[0].endswith("-12-25")]
        self.run_once(rows)
        csv_dates = [row["date"] for row in data_files.read_source_csv(os.path.join(self.data_dir, "usdjpy_source.csv"))]
        self.assertEqual(len(csv_dates), len(rows))
        self.assertTrue(all(datetime.date.fromisoformat(date).weekday() < 5 for date in csv_dates))
        self.assertFalse(any(date.endswith("-12-25") for date in csv_dates))
        screen = read_js_data(os.path.join(self.data_dir, "usdjpy_recent.js")), read_js_data(os.path.join(self.data_dir, "usdjpy_older.js"))
        screen_dates = screen[0]["dates"] + screen[1]["dates"]
        self.assertEqual(len(screen_dates), len(rows))

    def test_reimport_replaces_old_source_and_ignores_same_day_record(self):
        """データ元を替えたときの取り直し（--reimport）：今の CSV を捨てて約10年分を取り直し、件数が減っても止まらない。"""
        self.run_once(self.initial_rows(2300))
        fewer = self.initial_rows(2100)
        update_data.run_update(self.data_dir, self.state_file, TODAY, self.make_fetch(fake_api_text(fewer)), reimport=True)
        csv_rows = data_files.read_source_csv(os.path.join(self.data_dir, "usdjpy_source.csv"))
        self.assertEqual(len(csv_rows), len(fewer))
        self.assertEqual(self.calls[-1][0], "2016-01-20")

    def test_first_fetch_starts_ten_years_ago(self):
        """初回は約10年前から取る。"""
        self.assertEqual(update_data.decide_start_date([], TODAY), datetime.date(2016, 1, 20))


class SourceSeparationTest(unittest.TestCase):
    """AC-10d・AC-10e：実行時刻と、提供元に問い合わせる処理の置き場所。"""

    def read(self, relative_path):
        with open(os.path.join(PRODUCT_DIR, relative_path), encoding="utf-8") as file:
            return file.read()

    def test_ac10d_schedule_is_utc_0100(self):
        """AC-10d：update_data.yml の実行時刻が 0 1 * * *（UTC。日本時間10:00）。"""
        self.assertRegex(self.read(".github/workflows/update_data.yml"), r"cron:\s*['\"]0 1 \* \* \*['\"]")

    def test_ac10e_only_fetch_file_talks_to_provider(self):
        """AC-10e：通信と提供元の URL は fetch_frankfurter.py だけにあり、update_data.py は共通の形だけを受け取る。"""
        for name in ["update_data.py", "data_files.py"]:
            text = self.read("tools/" + name)
            self.assertNotIn("urllib", text)
            self.assertNotIn("frankfurter.dev/v2", text)
        self.assertIn("urllib.request", self.read("tools/fetch_frankfurter.py"))
        rows = fetch_frankfurter.parse_response(fake_api_text([("2026-01-05", "156.7")]))
        self.assertEqual(rows, [{"date": "2026-01-05", "value": "156.7"}])

    def test_url_has_period_and_pair(self):
        """URL に期間と通貨の組が入る。"""
        url = fetch_frankfurter.build_url("2026-01-01", "2026-01-31")
        self.assertTrue(re.search(r"from=2026-01-01&to=2026-01-31&base=USD&quotes=JPY$", url))

    def test_ac10f_asks_only_ecb_provider_not_blended_rates(self):
        """AC-10f：問い合わせ先が ECB 提供分（/v2/providers/ECB/rates）だけで、集約レート（/v2/rates）の URL を使わない。"""
        asked = []
        fetch_frankfurter.fetch_rates("2026-01-01", "2026-01-31", download=lambda url: asked.append(url) or "[]")
        self.assertEqual(len(asked), 1)
        self.assertTrue(asked[0].startswith("https://api.frankfurter.dev/v2/providers/ECB/rates?"))
        text = self.read("tools/fetch_frankfurter.py")
        self.assertNotIn("frankfurter.dev/v2/rates", text.split("\"\"\"", 2)[2])


class SizeCheckTest(unittest.TestCase):
    """AC-21・AC-22：読む量の上限（tools/check_size.py）。"""

    def test_ac22_sizes_within_limits(self):
        passed, lines = check_size.check_sizes()
        self.assertTrue(passed, "\n".join(lines))
        self.assertLessEqual(len(check_size.list_initial_files()), check_size.INITIAL_MAX_FILES)
        self.assertIn("data/usdjpy_older.js", check_size.list_later_files())
        self.assertNotIn("data/usdjpy_older.js", check_size.list_initial_files())


if __name__ == "__main__":
    unittest.main()
