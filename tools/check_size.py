"""check_size.py：画面が読むファイルの大きさと数が、仕様 2-7 の上限以内かを調べる（CI で動かす）。

上限：最初の表示で読むもの 80KB 以下・10個以下／ページ全体（後から読む分を含む）200KB 以下（どれも圧縮前）。
最初の表示で読むもの：index.html と、その中の <link>・<script> のファイル、band_config.js で選んだ方法のファイル1つ。
後から読むもの：js/data_loader.js の LATER_FILES の一覧。
主な関数：list_initial_files・list_later_files・check_sizes。使い方：python tools/check_size.py（超えたら終了コード1）
"""

import os
import re
import sys

PRODUCT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
KILOBYTE = 1024
INITIAL_MAX_BYTES = 80 * KILOBYTE   # 最初の表示で読むものの合計の上限（80KB）
TOTAL_MAX_BYTES = 200 * KILOBYTE    # ページ全体の合計の上限（200KB）
INITIAL_MAX_FILES = 10              # 最初の表示で読むファイルの数の上限


def read_text(relative_path):
    """fx-simulator フォルダから見た場所のファイルを文字として読む。"""
    with open(os.path.join(PRODUCT_DIR, relative_path), encoding="utf-8") as file:
        return file.read()


def list_initial_files():
    """最初の表示で読むファイルの一覧を返す。例：["index.html", "css/style.css", ...]"""
    html = read_text("index.html")
    files = ["index.html"]
    files += re.findall(r'<link[^>]+href="([^"]+)"', html)
    files += re.findall(r'<script[^>]+src="([^"]+)"', html)
    config = read_text("js/band_config.js")
    method_name = re.search(r'methodName:\s*"([^"]+)"', config).group(1)
    method_file = re.search(r"\b" + re.escape(method_name) + r':\s*"([^"]+\.js)"', config).group(1)
    files.append(method_file)
    return files


def list_later_files():
    """最初の表示のあとに読むファイルの一覧を返す（data_loader.js の LATER_FILES）。"""
    loader = read_text("js/data_loader.js")
    block = re.search(r"const LATER_FILES = \[(.*?)\];", loader, re.S).group(1)
    return re.findall(r'"([^"]+)"', block)


def total_bytes(files):
    """ファイルの大きさの合計（バイト）を返す。"""
    return sum(os.path.getsize(os.path.join(PRODUCT_DIR, name)) for name in files)


def check_sizes():
    """上限を調べ、(合格か, 表示する文の一覧) を返す。"""
    initial = list_initial_files()
    later = list_later_files()
    initial_bytes = total_bytes(initial)
    all_bytes = initial_bytes + total_bytes(later)
    lines = [
        "最初の表示：" + str(len(initial)) + " 個・" + format(initial_bytes / KILOBYTE, ".1f") + "KB（上限 "
        + str(INITIAL_MAX_FILES) + " 個・" + str(INITIAL_MAX_BYTES // KILOBYTE) + "KB）",
        "ページ全体：" + format(all_bytes / KILOBYTE, ".1f") + "KB（上限 " + str(TOTAL_MAX_BYTES // KILOBYTE) + "KB）",
    ]
    passed = len(initial) <= INITIAL_MAX_FILES and initial_bytes <= INITIAL_MAX_BYTES and all_bytes <= TOTAL_MAX_BYTES
    if not passed:
        lines.append("上限を超えています。コメントを短くする・データの形を小さくするなどで減らしてください（仕様 2-7）")
    return passed, lines


def main():
    """入口。超えていたら終了コード1（CI を失敗にする）。"""
    passed, lines = check_sizes()
    for line in lines:
        print(line)
    if not passed:
        sys.exit(1)


if __name__ == "__main__":
    main()
