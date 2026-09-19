#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
词语表：看拼音写词语 / 看词写拼音。

词从哪来，是这件事最要紧的地方。课本里没有现成的字表词表，所以三个来源合起来，
按可靠性排序，前面的覆盖后面的：

  1. 课本注音的词条（387 条）——课本自己注的音，最权威。《苏武传》的「阏氏」
     读 yān zhī，两本第三方词典都注成 è shì，只有课本是对的。
  2. 课本里出现过的成语——成语表给边界和读音，课本语料保证这套教材里真的用到。
  3. 课本里出现过的难写词——词表 ∩ 课本语料 ∩ 含生僻字，且两个独立来源的注音
     对得上才收（对不上的宁可丢掉）。

挑哪些词：一律「优先生僻字」——含《通用规范汉字表》一级字表（3500 常用字）
之外的字，或者课本给注过音的。剩下那些谁都会写会读的词，出出来没意义。

    python3 tools/words.py        # 生成 extract/词语.tsv
"""

import collections
import glob
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build as B

HERE = B.HERE
WORDLISTS = os.path.join(HERE, "tools", "data")
OUT = os.path.join(HERE, "extract", "词语.tsv")

CJKW = re.compile(r"^[\u4e00-\u9fff]{2,4}$")
TONED = re.compile(r"[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]")


def corpus_text():
    """课本全文，现代文也算——积累常用词本来就不该只盯着古诗文。"""
    out = []
    for f in glob.glob(os.path.join(B.RAW, "*.json")):
        d = json.load(open(f, encoding="utf-8"))
        for p in d["pages"]:
            for grp in ("body", "notes", "hints"):
                for l in p[grp]:
                    t = l["text"] if isinstance(l, dict) else l
                    out.append(B.MARK.sub("", t))
    return "".join(out)


def load_list(name):
    out = {}
    path = os.path.join(WORDLISTS, name)
    if not os.path.exists(path):
        return out
    for line in open(path, encoding="utf-8"):
        if line.startswith("#") or "\t" not in line:
            continue
        w, py = line.rstrip("\n").split("\t", 1)
        if CJKW.match(w):
            out.setdefault(w, py.strip())
    return out


def from_notes():
    """课本注音的词条。注音就写在词条里：〔兜鍪（móu）〕〔阏氏（yānzhī）〕"""
    out = {}
    for f in sorted(glob.glob(os.path.join(B.SRC, "*.md"))):
        text = open(f, encoding="utf-8").read()
        title = text.split("\n")[0].lstrip("# ").split("|")[0].strip()
        body = text.split("## 注释")
        if len(body) < 2:
            continue
        for line in body[1].split("## 学习提示")[0].splitlines():
            if "\t" not in line:
                continue
            m = re.match(r"^[〔﹝\[]([^〕﹞\]]*)[〕﹞\]]", line.split("\t", 1)[1])
            if not m:
                continue
            raw = m.group(1)
            plain = B.depinyin(raw)
            if not CJKW.match(plain) or not B.PINYIN.search(raw):
                continue
            # 词条里只有个别字注了音，其余的音得补齐
            marks = {}
            for word, py in B.PINYIN.findall(raw):
                syl = B.SYLLABLE.findall(py.strip())
                k = min(len(syl), len(word))
                for ch, s in zip(word[-k:], syl[-k:]):
                    marks[ch] = s
            out.setdefault(plain, (marks, title))
    return out


def norm(p):
    return re.sub(r"\s+", "", p.replace("ɡ", "g")).lower()


def main():
    try:
        from pypinyin import pinyin, Style
    except ImportError:
        sys.exit("需要 pypinyin：pip install pypinyin")

    full = corpus_text()
    common = B.common_chars()
    rows = {}

    def auto(w):
        return "".join(x[0] for x in pinyin(w, style=Style.TONE))

    def shifted(w):
        """词里有字变了读音——「字里行间」的「行」读 háng，这才是字音题的考点。
        「一个 yí gè」那种变调、「觉得 jué de」那种轻声不算。"""
        for ch, inword in zip(w, [x[0] for x in pinyin(w, style=Style.TONE)]):
            if ch in "一不":
                continue
            if not TONED.search(inword):        # 轻声，不算
                continue
            if norm(pinyin(ch, style=Style.TONE)[0][0]) != norm(inword):
                return True
        return False

    # 1. 课本注音的词条——最权威，先进来，后面谁也别想覆盖它
    for w, (marks, title) in from_notes().items():
        if w not in full:
            continue
        py = "".join(marks.get(ch) or x[0]
                     for ch, x in zip(w, pinyin(w, style=Style.TONE)))
        rows[w] = (py, "课本", title)

    # 2. 课本里出现过的成语
    idiom = load_list("成语表.tsv")
    for w, py in idiom.items():
        if len(w) != 4 or w in rows or w not in full:
            continue
        mine = auto(w)
        if norm(mine) != norm(py):        # 两个来源对不上，宁可不要
            continue
        if not any(ch not in common for ch in w) and not shifted(w):
            continue                       # 全是常用字又没有变读，考它没意义
        rows[w] = (mine, "成语", "")

    # 3. 课本里出现过的难写词
    words = load_list("词语表.tsv")
    for w, py in words.items():
        if w in rows or w not in full:
            continue
        if not any(ch not in common for ch in w):
            continue
        mine = auto(w)
        if norm(mine) != norm(py):
            continue
        rows[w] = (mine, "词典", "")

    def kind(w, src):
        hard = any(ch not in common for ch in w)   # 字生僻 → 不好写
        soft = src == "课本" or shifted(w)          # 课本特地注音的，都是会读错的
        if hard and soft:
            return "都考"
        return "读" if soft else "写"

    # 「刽子」是「刽子手」被切下来的半截，词表里两个都有。课本里既然总是
    # 连着出现，就只留长的那个。另外「的的」这种叠字，常用字叠一下不算词。
    longer = {w for w in rows for ext in rows
              if ext != w and w in ext and full.count(ext) >= full.count(w) * 0.8}
    for w in longer | {w for w in rows
                       if len(w) == 2 and w[0] == w[1] and w[0] in common}:
        rows.pop(w, None)

    order = sorted(rows, key=lambda w: (-full.count(w), w))
    with open(OUT, "w", encoding="utf-8") as f:
        f.write("# 词 \t 拼音 \t 题型 \t 来源 \t 出处 \t 课本里出现次数\n")
        for w in order:
            py, src, where = rows[w]
            f.write("%s\t%s\t%s\t%s\t%s\t%d\n"
                    % (w, py, kind(w, src), src, where, full.count(w)))
    tally = collections.Counter(v[1] for v in rows.values())
    print("词语 %d 条 → %s" % (len(rows), os.path.relpath(OUT, HERE)))
    print("  " + "　".join("%s %d" % kv for kv in tally.most_common()))


if __name__ == "__main__":
    main()
