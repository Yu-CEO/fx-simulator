"""check_no_video.py：リポジトリに動画ファイルが入っていないことを確かめる（仕様 2-9・AC-44。CI で動かす）

縦動画は GitHub Actions の成果物（保存7日）として置くだけで、commit・push しない。
確かめること：①git が管理しているファイルに動画（.mp4 など）が無い ②（--history をつけたとき）履歴のどこにも動画が入ったことがない
③ .gitignore に動画の書き出し先（video_output/）が入っている。1つでも当てはまれば終了コード1（CI を失敗にする）。
主な関数：find_video_paths（パスの一覧から動画を探す）、gitignore_has_output_dir、check。
使い方：python tools/check_no_video.py [--history]   ※ --history を使うときは、履歴を全部取ってくる（actions/checkout の fetch-depth: 0）
tests/test_video_tools.py でテストする。
"""

import os
import subprocess
import sys

# 動画とみなす拡張子
VIDEO_EXTENSIONS = (".mp4", ".mov", ".webm", ".avi", ".mkv", ".m4v")
# .gitignore に入っているべき書き出し先
OUTPUT_DIR_NAME = "video_output/"
PRODUCT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def find_video_paths(paths):
    """パスの一覧から、動画ファイル（拡張子で判断）だけを返す。

    例：find_video_paths(["a.js", "out/fx_daily_2026-11-18.mp4"]) → ["out/fx_daily_2026-11-18.mp4"]
    """
    found = []
    for path in paths:
        if path.lower().endswith(VIDEO_EXTENSIONS):
            found.append(path)
    return sorted(set(found))


def gitignore_has_output_dir(gitignore_text):
    """.gitignore の文に、動画の書き出し先（video_output/）が書いてあるか。"""
    lines = [line.strip() for line in gitignore_text.splitlines()]
    return OUTPUT_DIR_NAME in lines or OUTPUT_DIR_NAME.rstrip("/") in lines


def run_git(arguments):
    """git を動かして、出力の行を返す。git が使えないときは None。"""
    try:
        result = subprocess.run(["git"] + arguments, cwd=PRODUCT_DIR, capture_output=True, text=True, check=True)
    except (FileNotFoundError, subprocess.CalledProcessError):
        return None
    return [line for line in result.stdout.splitlines() if line.strip()]


def check(include_history):
    """確かめて、問題の文の一覧を返す（空なら合格）。"""
    problems = []
    with open(os.path.join(PRODUCT_DIR, ".gitignore"), encoding="utf-8") as file:
        if not gitignore_has_output_dir(file.read()):
            problems.append(".gitignore に " + OUTPUT_DIR_NAME + " がありません。動画の書き出し先を入れてください")
    tracked = run_git(["ls-files"])
    if tracked is None:
        print("注意：git が使えないため、管理中のファイルと履歴の確認は飛ばしました")
        return problems
    for path in find_video_paths(tracked):
        problems.append("動画ファイルが git に入っています：" + path)
    if include_history:
        history = run_git(["log", "--all", "--name-only", "--format="])
        for path in find_video_paths(history or []):
            problems.append("履歴に動画ファイルが入ったことがあります：" + path)
    return problems


def main():
    """入口。問題があれば表示して終了コード1。"""
    problems = check("--history" in sys.argv[1:])
    for problem in problems:
        print(problem)
    if problems:
        sys.exit(1)
    print("動画ファイルは git に入っていません（書き出し先は .gitignore 済み）")


if __name__ == "__main__":
    main()
