#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
合并脚本 merge.py

把 index.html、data.js、user.js 三个文件并成一个单文件，
用于手机上读不到同目录文件的情况。

用法（在三个文件所在的目录里跑）：
    python3 merge.py
输出：
    dist/古诗文默写_单文件.html

每次改完 data.js 重跑一次即可。user.js 不存在也能跑。
"""

import os, re, sys, io

HERE = os.path.dirname(os.path.abspath(__file__))

def read(name, required=True):
    path = os.path.join(HERE, name)
    if not os.path.exists(path):
        if required:
            sys.exit("找不到 %s，请把 merge.py 放在和它同一个目录里。" % name)
        return None
    with io.open(path, encoding="utf-8") as f:
        return f.read()

def main():
    html = read("index.html")
    data = read("data.js")
    user = read("user.js", required=False) or "window.USER = { marks: [], wrong: {} };"

    inline = (
        '<script>\n/* ==== data.js（由 merge.py 内联）==== */\n' + data +
        '\n/* ==== user.js（由 merge.py 内联）==== */\n' + user + '\n</script>'
    )

    pattern = re.compile(
        r'<script src="data\.js"></script>\s*<script src="user\.js"></script>')
    if not pattern.search(html):
        sys.exit("index.html 里没找到引入 data.js 和 user.js 的那两行，"
                 "可能文件被改过，请检查。")
    out = pattern.sub(lambda m: inline, html, count=1)

    name = "古诗文默写_单文件.html"
    dist = os.path.join(HERE, "dist")          # 生成物单独放，别和源码混在一起
    if not os.path.isdir(dist): os.makedirs(dist)
    with io.open(os.path.join(dist, name), "w", encoding="utf-8") as f:
        f.write(out)
    print("已生成 dist/%s（%.1f KB）" % (name, len(out.encode("utf-8")) / 1024.0))
    print("把它单独拷到手机上就能用。注意：单文件版导出的 user.js 需要再跑一次合并才会生效。")

if __name__ == "__main__":
    main()
