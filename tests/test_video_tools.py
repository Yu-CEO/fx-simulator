"""test_video_tools.py：縦動画づくり（tools/video/・tools/check_no_video.py）と、画面用データの件数の自動テスト

受け入れ基準 AC-40a（271件以上）・AC-41（動画の確認）・AC-42（作らない日）・AC-44（動画を git に入れない）・AC-45（自動投稿・認証情報が無い）に対応。
仮のデータだけを使い、ブラウザも ffmpeg も動かさない（動画そのものの書き出しは手元・Actions で確かめる）。
実行方法：fx-simulator フォルダで `python -m unittest discover -s tests -p "test_*.py"`
"""

import datetime
import os
import re
import sys
import unittest

PRODUCT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(PRODUCT_DIR, "tools"))
sys.path.insert(0, os.path.join(PRODUCT_DIR, "tools", "video"))

import check_no_video  # noqa: E402
import check_video  # noqa: E402
import data_files  # noqa: E402
import make_video  # noqa: E402
import render_frames  # noqa: E402
import video_gate  # noqa: E402
import video_settings  # noqa: E402


def read_text(relative_path):
    """fx-simulator フォルダから見た場所のファイルを文字として読む。"""
    with open(os.path.join(PRODUCT_DIR, relative_path), encoding="utf-8") as file:
        return file.read()


def make_rows(count):
    """元の CSV の行（平日だけ）を count 件作る。"""
    rows = []
    day = datetime.date(2015, 1, 5)
    while len(rows) < count:
        if day.weekday() < 5:
            rows.append({"date": day.isoformat(), "value": "150.123"})
        day += datetime.timedelta(days=1)
    return rows


class RecentCountTest(unittest.TestCase):
    def test_ac40a_recent_has_at_least_271_values(self):
        """AC-40a：元のデータが十分あるとき、画面用の最近の分は必ず271件以上（件数で切る）。"""
        self.assertGreaterEqual(data_files.RECENT_COUNT, 271)
        self.assertEqual(data_files.RECENT_MIN_COUNT, 271)
        recent, older, _, _ = data_files.build_screen_data(make_rows(2600))
        self.assertGreaterEqual(len(recent), 271)
        self.assertEqual(len(recent), data_files.RECENT_COUNT)
        self.assertEqual(len(recent) + len(older), data_files.SCREEN_MAX_COUNT)

    def test_screen_data_is_capped_to_about_ten_years_dropping_oldest(self):
        """画面用データは件数の上限（約10年分）を超えたら古い日から切り落とし、上限以内なら全部残す。"""
        rows = make_rows(2600)
        recent, older, _, _ = data_files.build_screen_data(rows)
        kept = older + recent
        self.assertEqual(kept[-1][0], rows[-1]["date"].replace("-", ""))
        self.assertEqual(len(kept), data_files.SCREEN_MAX_COUNT)
        self.assertEqual(kept[0][0], rows[-data_files.SCREEN_MAX_COUNT]["date"].replace("-", ""))
        small_recent, small_older, _, _ = data_files.build_screen_data(make_rows(2000))
        self.assertEqual(len(small_recent) + len(small_older), 2000)

    def test_ac40a_real_data_file_has_at_least_271_values(self):
        """AC-40a：本番の usdjpy_recent.js も271件以上で、今日の図の基準（storyBase）の最終日が一致する。"""
        text = read_text(os.path.join("data", "usdjpy_recent.js"))
        values = re.search(r'"values":\[([^\]]*)\]', text).group(1).split(",")
        self.assertGreaterEqual(len(values), 271)
        self.assertEqual(re.search(r'storyBase = \{"lastDate":"([^"]+)"', text).group(1), video_gate.read_last_date(text))


class GateTest(unittest.TestCase):
    def test_ac42_make_only_when_last_date_changed(self):
        """AC-42：取得が成功して最終日が変わった日だけ作る。"""
        should_make, _ = video_gate.decide_video("2026-11-17", "2026-11-18")
        self.assertTrue(should_make)
        should_make, _ = video_gate.decide_video(None, "2026-11-18")
        self.assertTrue(should_make)

    def test_ac42_not_made_when_fetch_failed(self):
        """AC-42：取得に失敗した日は作らない（理由の文が出る）。"""
        should_make, reason = video_gate.decide_video("2026-11-17", "2026-11-18", fetch_succeeded=False)
        self.assertFalse(should_make)
        self.assertIn("失敗", reason)

    def test_ac42_not_made_when_last_date_same(self):
        """AC-42：最終日が前回と同じ日（土日・祝日）は作らない。"""
        should_make, reason = video_gate.decide_video("2026-11-18", "2026-11-18")
        self.assertFalse(should_make)
        self.assertIn("同じ", reason)

    def test_ac42_not_made_when_date_unreadable(self):
        """AC-42：最終日を読めないときは作らない。"""
        self.assertFalse(video_gate.decide_video("2026-11-17", None)[0])

    def test_read_last_date(self):
        """画面用データの文から最終日を読める。"""
        self.assertEqual(video_gate.read_last_date('var FX_DATA_RECENT = {"lastDate":"2026-11-17","dates":[1]}'), "2026-11-17")
        self.assertIsNone(video_gate.read_last_date("何もない文"))

    def test_ac42_story_not_ready_days_are_skipped_in_render_page(self):
        """AC-42：1か月前の帯が作れない日は作らない。描画ページが ok:false を返したら画像を作らない作りになっている。"""
        main_js = read_text(os.path.join("tools", "video", "video_main.js"))
        self.assertIn("ok: model.ok", main_js)
        render_source = read_text(os.path.join("tools", "video", "render_frames.py"))
        self.assertIn('if not info["ok"]:', render_source)
        make_source = read_text(os.path.join("tools", "video", "make_video.py"))
        self.assertIn("今日の動画は作りません", make_source)
        self.assertIn("return None", make_source)


class SkipOrFailTest(unittest.TestCase):
    def run_with_info(self, info):
        """描画ページが info を返したものとして make_video を動かす（ブラウザは動かさない）。作ったかどうか（None なら作らなかった）を返す。"""
        original = render_frames.render_frames
        render_frames.render_frames = lambda frames_dir, chromium_path=None: info
        try:
            return make_video.make_video()
        finally:
            render_frames.render_frames = original

    def test_ac42_data_short_is_skipped_with_success(self):
        """AC-42：1か月前の帯が作れない日（data_short）だけは、動画を作らず成功で終わる。"""
        self.assertIsNone(self.run_with_info({"ok": False, "reason": "data_short", "lastDate": "2026-11-18"}))

    def test_other_reasons_fail_with_next_action(self):
        """状態づくりの忘れ・ファイルの読み込み失敗などは不具合なので、次にすることを書いた RuntimeError（失敗）になる。"""
        for reason in ("no_state", "no_base", "method_load_failed", "unknown_reason"):
            with self.assertRaises(RuntimeError) as caught:
                self.run_with_info({"ok": False, "reason": reason, "lastDate": "2026-11-18"})
            self.assertIn("動画を作れません", str(caught.exception), reason)
        with self.assertRaises(RuntimeError) as caught:
            self.run_with_info({"ok": False, "reason": "no_state", "lastDate": "2026-11-18"})
        self.assertIn("add_band_state.js", str(caught.exception))

    def test_missing_tools_give_japanese_messages(self):
        """Playwright が入っていない環境でも、日本語で次にすることを書いた RuntimeError になる。"""
        original = render_frames.sync_playwright
        render_frames.sync_playwright = None
        try:
            with self.assertRaises(RuntimeError) as caught:
                render_frames.render_frames(os.path.join(PRODUCT_DIR, "video_output", "frames_unused"))
        finally:
            render_frames.sync_playwright = original
        self.assertIn("pip install", str(caught.exception))


class CheckVideoTest(unittest.TestCase):
    GOOD = {"width": 1080, "height": 1920, "duration": 18.0, "has_audio": False}

    def test_ac41_good_video_passes(self):
        """AC-41：1080×1920・18秒・無音・正しいファイル名なら問題なし。"""
        self.assertEqual(check_video.check_video_facts(self.GOOD, "fx_daily_2026-11-18.mp4", "2026-11-18"), [])

    def test_ac41_file_name_uses_last_date(self):
        """AC-41：ファイル名は fx_daily_YYYY-MM-DD.mp4（日付＝データの最終日）。"""
        self.assertEqual(check_video.video_file_name("2026-11-18"), "fx_daily_2026-11-18.mp4")
        problems = check_video.check_video_facts(self.GOOD, "fx_daily_2026-11-17.mp4", "2026-11-18")
        self.assertEqual(len(problems), 1)

    def test_ac41_wrong_size_duration_audio_fail(self):
        """AC-41：大きさ・長さ・音が基準に合わなければ失敗（問題が出る）。"""
        wrong_size = dict(self.GOOD, width=720, height=1280)
        self.assertTrue(check_video.check_video_facts(wrong_size, "fx_daily_2026-11-18.mp4", "2026-11-18"))
        for seconds in (10, 25):
            wrong_length = dict(self.GOOD, duration=seconds)
            self.assertTrue(check_video.check_video_facts(wrong_length, "fx_daily_2026-11-18.mp4", "2026-11-18"), str(seconds))
        for seconds in (15, 20):
            self.assertEqual(check_video.check_video_facts(dict(self.GOOD, duration=seconds), "fx_daily_2026-11-18.mp4", "2026-11-18"), [])
        with_audio = dict(self.GOOD, has_audio=True)
        self.assertTrue(check_video.check_video_facts(with_audio, "fx_daily_2026-11-18.mp4", "2026-11-18"))

    def test_frame_count_includes_last_frame(self):
        """18秒・30コマ/秒なら、最後の絵も入れて541コマ。"""
        self.assertEqual(render_frames.frame_count(18, 30), 541)

    def test_settings_match_spec(self):
        """AC-41：確認の基準は 1080×1920・15〜20秒。"""
        self.assertEqual((video_settings.EXPECTED_WIDTH, video_settings.EXPECTED_HEIGHT), (1080, 1920))
        self.assertEqual((video_settings.MIN_SECONDS, video_settings.MAX_SECONDS), (15, 20))


class NoVideoInRepoTest(unittest.TestCase):
    def test_ac44_video_files_are_found(self):
        """AC-44：動画ファイルがあれば見つける（CI が失敗になる）。"""
        found = check_no_video.find_video_paths(["js/a.js", "out/fx_daily_2026-11-18.mp4", "x/CLIP.MOV", "README.md"])
        self.assertEqual(found, ["out/fx_daily_2026-11-18.mp4", "x/CLIP.MOV"])
        self.assertEqual(check_no_video.find_video_paths(["js/a.js", "data/usdjpy_recent.js"]), [])

    def test_ac44_gitignore_has_output_dir(self):
        """AC-44：.gitignore に書き出し先（video_output/）が入っている。"""
        self.assertTrue(check_no_video.gitignore_has_output_dir(read_text(".gitignore")))
        self.assertFalse(check_no_video.gitignore_has_output_dir("node_modules/\n"))
        self.assertEqual(os.path.basename(video_settings.OUTPUT_DIR) + "/", check_no_video.OUTPUT_DIR_NAME)

    def test_ac44_workflows_do_not_commit_videos(self):
        """AC-44：動画をつくる workflow は commit・push をせず、成果物（artifact）に保存する。保存期間は設定にある。"""
        source = read_text(os.path.join(".github", "workflows", "make_video.yml"))
        self.assertNotIn("git push", source)
        self.assertNotIn("git commit", source)
        self.assertNotIn("contents: write", source)
        self.assertIn("actions/upload-artifact@", source)
        self.assertRegex(source, r"VIDEO_RETENTION_DAYS:\s*7")
        self.assertIn("retention-days: ${{ env.VIDEO_RETENTION_DAYS }}", source)
        ci = read_text(os.path.join(".github", "workflows", "ci.yml"))
        self.assertIn("check_no_video.py --history", ci)
        self.assertNotIn("*.mp4", ci.replace("check_no_video", ""))

    def test_ac41_video_runs_only_after_successful_changed_fetch(self):
        """AC-41：動画の作成は、データ取得の成功・最終日の変化のあとにだけ動く（update_data.yml の video ジョブ）。"""
        source = read_text(os.path.join(".github", "workflows", "update_data.yml"))
        self.assertIn("needs: update", source)
        self.assertIn("needs.update.outputs.make_video == 'true'", source)
        self.assertIn("video_gate.py decide", source)


class NoAutoPostTest(unittest.TestCase):
    def test_ac45_no_tiktok_posting_or_credentials(self):
        """AC-45：TikTok へ自動で投稿する処理・認証情報が、コード・設定のどこにも無い。"""
        names = []
        for folder in ("js", "tools", "tools/video", ".github/workflows"):
            full = os.path.join(PRODUCT_DIR, folder)
            for name in os.listdir(full):
                if os.path.isfile(os.path.join(full, name)):
                    names.append(os.path.join(folder, name))
        names += ["index.html", "README.md"]
        pattern = re.compile(r"(open\.tiktokapis|tiktok.*(access_token|client_secret|client_key|api_key)|TIKTOK_[A-Z_]+|secrets\.TIKTOK)", re.IGNORECASE | re.DOTALL)
        for name in names:
            text = read_text(name)
            if name.endswith("test_video_tools.py"):
                continue
            self.assertIsNone(pattern.search(text), name)
        for workflow in ("ci.yml", "make_video.yml", "update_data.yml"):
            self.assertNotIn("secrets.", read_text(os.path.join(".github", "workflows", workflow)).replace("secrets.CONFIDENTIAL_WORDS", ""))


if __name__ == "__main__":
    unittest.main()
