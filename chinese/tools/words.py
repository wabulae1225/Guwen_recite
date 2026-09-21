#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
词语表：看拼音写词语 / 看词写拼音，附释义和例句。

词从哪来，是这件事最要紧的地方。课本里没有现成的字表词表，所以三个来源合起来，
按可靠性排序，前面的覆盖后面的：

  1. 课本注音的词条——课本自己注的音，最权威。《苏武传》的「阏氏」读 yān zhī，
     两本第三方词典都注成 è shì，只有课本是对的。（抽出 191 条，去重过滤后
     进表 188 条。v0.21 前这里写作「387 条」，与实际对不上，已核实改正。）
  2. 课本里出现过的成语——成语表给边界和读音，课本语料保证这套教材里真的用到。
  3. 课本里出现过的难写词——词表 ∩ 课本语料 ∩ 含生僻字，且两个独立来源的注音
     对得上才收（对不上的宁可丢掉）。

挑哪些词：一律「优先生僻字」——含《通用规范汉字表》一级字表（3500 常用字）
之外的字，或者课本给注过音的。剩下那些谁都会写会读的词，出出来没意义。

**释义**按四级回落，每条都记着是打哪儿来的，页面上照实标出来：

  课本注释 > 成语释义 > 新华词语 > 自拟

前三级是现成资料（见 tools/data/来源.md），第四级是两本词典都查不着的，
人工写进 tools/释义-自拟.tsv，页面上明确标成「自拟」——查不到本身就说明
这词考察概率低，别让人误当权威。

**例句**优先课本原文：词就在这五本书里出现过，抓一句含它的原句最贴，出处记篇名。
课本正文里找不着的（多是成语的古典用例），退而用成语释义里的书证。

**拼音一律按字分开写**（qióng lú），看词写拼音时字和字才对得起来。

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
HAND = os.path.join(HERE, "tools", "释义-自拟.tsv")   # 两本词典都查不着的，人工写

CJKW = re.compile(r"^[\u4e00-\u9fff]{2,4}$")
# 栏目标题：第X单元 / 一二三打头的小节标题
SECTION = re.compile(r"^(第[一二三四五六七八九十]+单元|[一二三四五六七八九十][^、，。]{4,})$")
TONED = re.compile(r"[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]")


def corpus_text():
    """课本全文，现代文也算——积累常用词本来就不该只盯着古诗文。"""
    out = []
    for f in glob.glob(os.path.join(B.RAW, "*.json")):
        d = json.load(open(f, encoding="utf-8"))
        for p in d["pages"]:
            for grp in ("body", "notes", "hints", "captions"):
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


def clean_def(text):
    """把词典释义收拾成一句人话。

    两本词典都是从纸书 OCR 整理来的，毛病是固定的那几样（见 tools/data/来源.md）：
    义项前带「1.」「2.」序号、句子里的顿号写成半角 ﹑、开引号被吃掉只剩下 ”。
    开引号补不回来——不知道该补在哪儿，硬补就是编——所以落单的 ” 直接删掉。
    义项最多留两条：第三条往后多是生僻古义，对着课本反而添乱。"""
    t = text.replace("﹐", "，").replace("﹑", "、")
    t = t.replace("﹔", "；").replace("﹔", "；").replace("\n", " ")
    t = re.sub(r"[〈〔\[][^〉〕\]]{0,6}[〉〕\]]", "", t)      # 〈动〉〈名〉这类词性标记
    # 「亦作某某；正经释义」——前半截是异体写法，不是释义，砍掉。
    # 但整条就只有这一句的（「咔嚓：同‘喀嚓’。」）不能砍，砍完什么都不剩
    cut = re.sub(r"^(亦作|也作|同)[^；。，]{1,8}[；。]\s*", "", t)
    if cut.strip():
        t = cut
    # 原书的例句分隔符和代词符号（｜～◇ㄧ），后面跟的是例句不是释义；
    # 『∨ 是 OCR 把标点认坏了。一律在这儿收口，只留前半截
    m = re.search(r"[｜～◇ㄧ『∨]", t)
    if m:
        t = t[:m.start()]
    parts = re.split(r"\s*\d+[\.．]\s*", t)
    parts = [x.strip().rstrip("。") for x in parts if x.strip()]
    t = "；".join(parts[:2]) if parts else ""
    t = t.replace('"', "")                                 # OCR 留下的直引号
    if t.count("“") < t.count("”"):
        # 开引号被吃掉了（「即骆驼”其奇畜则橐驼」）。补不回来——不知道该补在
        # 哪儿，硬补就是编——所以就在那个 ” 处截断，前半截才是释义本身
        t = t.split("”")[0]
    if t.count("“") > t.count("”"):
        t = t.replace("“", "")
    t = re.sub(r"\s+", "", t).strip("；。，、 ")
    # 太长的砍到前两句。词典爱把植物学特征、别名一路写下去（「青蒿：菊科二年生
    # 草本植物。叶互生，细裂如丝……」），默写时看这个纯属添乱
    if len(t) > 34:
        keep = ""
        for x in B.cut_stops(t + "。"):
            if keep and len(keep) + len(x) > 40:
                break
            keep += x
        t = (keep or t[:40]).strip("；。，、 ")
    return t


def note_defs():
    """课本注释：词条 → （释义, 篇名）。释义的第一级，最权威。

    中间稿的注释一行一条，写作  n\t〔词条〕释义。词条里可能带注音
    （〔阏氏（yānzhī）〕），去掉音就是词。课本长注释常是「主释义。子目甲，……」，
    只取第一句——子目是讲词里某个字的，安到整个词头上不合适。"""
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
            m = re.match(r"^[〔﹝\[]([^〕﹞\]]*)[〕﹞\]](.*)$", line.split("\t", 1)[1])
            if not m:
                continue
            word, gloss = B.depinyin(m.group(1)), m.group(2).strip()
            if not gloss:
                continue
            # 长注释里套着的小注（「……。衿，衣服的交领。」）也各算一条，
            # 跟 build.py 拆 notes 板块的做法一致，不然「衿」这种只在小注里
            # 讲过的词就白白落下了
            for sub, exp in B.SUBNOTE.findall(gloss):
                if CJKW.match(sub):
                    out.setdefault(sub, (clean_def(exp), title))
            if not CJKW.match(word):
                continue
            first = B.cut_stops(gloss)
            gloss = (first[0] if first else gloss).strip()
            out.setdefault(word, (clean_def(gloss), title))
    return out


def pieces_text():
    """66 篇古诗文的正文，按篇给出。版面上的断行要接回去，不然切不出整句。"""
    out = []
    for f in sorted(glob.glob(os.path.join(B.SRC, "*.md"))):
        text = open(f, encoding="utf-8").read()
        title = text.split("\n")[0].lstrip("# ").split("|")[0].strip()
        body = text.split("## 正文")
        if len(body) < 2:
            continue
        body = body[1].split("## 注释")[0]
        for para in re.split(r"\n\s*\n", body):
            para = B.MARK.sub("", para)
            joined = "".join(l.strip() for l in para.splitlines() if l.strip())
            if joined:
                out.append((joined, title))
    return out


def pages_text():
    """全书正文，按课文给出——现代文也要，「青蒿素」「诠释」这类词只在那儿出现。

    页面记录本身不带课文标题，只有起篇的那页带。所以顺着页码往下走，
    遇到新标题就换，没换就还算前一篇的。"""
    out = []
    for f in sorted(glob.glob(os.path.join(B.RAW, "*.json"))):
        d = json.load(open(f, encoding="utf-8"))
        title = d["book"]
        for p in sorted(d["pages"], key=lambda x: x["page"]):
            if p["titles"]:
                t = B.MARK.sub("", p["titles"][0]).strip()
                # 「第八单元」「二运用有效的推理形式」这类是栏目标题不是篇名，
                # 拿它当例句出处、再套上书名号就不成话了，记册名了事
                title = d["book"] if SECTION.match(t) else t
            lines = sorted(p["body"], key=lambda l: (l["col"], l["y0"]))
            joined = "".join(B.MARK.sub("", l["text"]).strip() for l in lines)
            if joined:
                out.append((joined, title))
    return out


MINEX, MAXEX = 8, 46          # 例句长度：短了给不出情景，长了喧宾夺主


PAIRS = [("（", "）"), ("《", "》"), ("〔", "〕")]


def whole(sent):
    """句子完整才配当例句：括号、书名号要配平。

    《窦娥冤》的舞台提示「（刽子做取席站科」只有半个括号，截下来当例句看着
    莫名其妙。三道自检里「例句是完整句子」那道，讲的就是这件事。

    **引号不查配平**——文言的对话本来就跨句，「沛公奉卮酒为寿……曰：“吾入关」
    这一句只有半个引号却是完完整整的课本原文。v0.17 那条「引号里不断句」记的
    就是这个坑：按引号配平筛，《鸿门宴》整段都活不下来。只把甩在句尾的那个
    开引号抹掉即可。"""
    return all(sent.count(a) == sent.count(b) for a, b in PAIRS)


def tidy(sent):
    """例句收尾：甩在末尾没人接的开引号去掉。"""
    return sent.rstrip("“‘").strip()


def sentence_bank():
    """例句库。古诗文正文排头档，其余课文（现代文、单元导语）排次档——
    「琵琶」在《琵琶行》里有「忽闻水上琵琶声」，就别拿单元导语里那句
    「白居易《琵琶行》对音乐的传神描写」充数。"""
    bank = []
    for rank, src in ((0, pieces_text()), (1, pages_text())):
        for text, title in src:
            for sent in B.cut_stops(text):
                sent = sent.strip()
                if len(sent) >= MINEX and whole(sent):
                    bank.append((rank, tidy(sent), title))
    return bank


def window(sent, word):
    """长句里切一段含这个词的上下文出来。

    按逗号分号切成小句，从含词的那一小句起，向两边接邻句，直到够长为止。
    《谏逐客书》「孝公用商鞅之法」那一整句上百字，切出窗口才像个例句。"""
    if len(sent) <= MAXEX:
        return sent
    parts = [x for x in re.split(r"(?<=[，、；：])", sent) if x]
    at = next((i for i, x in enumerate(parts) if word in x), -1)
    if at < 0:
        return ""
    lo = hi = at

    def span():
        # 长短按去掉首尾标点之后算。「孝公用商鞅之法，」带着逗号是 8 字、
        # 去了逗号只剩 7 字，按带标点的长度判就会把这句好例句误杀
        return "".join(parts[lo:hi + 1]).strip("，、；：")

    while len(span()) < MINEX and (lo > 0 or hi < len(parts) - 1):
        left = len(parts[lo - 1]) if lo > 0 else 10 ** 6
        right = len(parts[hi + 1]) if hi < len(parts) - 1 else 10 ** 6
        if left <= right:
            lo -= 1
        else:
            hi += 1
    out = span()
    return out if MINEX <= len(out) <= MAXEX else ""


def pick_example(word, bank):
    """挑一句含这个词的课本原句。偏爱短句——例句是拿来给情景的，不是考阅读。"""
    hit = []
    for rank, s, t in bank:
        if word not in s:
            continue
        w = tidy(window(s, word))
        if w and word in w and whole(w):
            hit.append((rank, w, t))
    if not hit:
        return "", "", 9
    rank, s, t = min(hit, key=lambda x: (x[0], len(x[1]), x[2]))
    return s.replace(word, "{%s}" % word, 1), t, rank


def idiom_cite(derivation):
    """成语的书证当例句用：「先秦·管仲《管子·七法》有一体之治……」
    切成 出处《管子·七法》和例句「有一体之治……」两半。"""
    d = (derivation or "").strip()
    if not d or d == "无":
        return "", ""
    m = re.match(r"^(.*?《[^》]*》)(.*)$", d)
    if not m:
        return "", ""
    src = re.search(r"《[^》]*》", m.group(1)).group(0)
    quote = m.group(2).strip("：:，,。 ").rstrip("”").strip()
    if not (8 <= len(quote) <= 46):
        return "", ""
    return quote, src


def load_hand():
    """自拟释义：两本词典都查不着的，人工写在这张表里。

    四列：词、释义、例句（可空）、拼音订正（可空）。和 hardchars.tsv 一样是
    本人工账，脚本只读不写，重跑不会冲掉。

    拼音订正是给机器注错音、又确实该收的词留的口子：「岑参」诗人名里的
    「参」读 shēn，pypinyin 按常用音注成 cān，只能人工按住。"""
    out = {}
    if not os.path.exists(HAND):
        return out
    for line in open(HAND, encoding="utf-8"):
        if line.startswith("#") or "\t" not in line:
            continue
        c = [x.strip() for x in line.rstrip("\n").split("\t")]
        c += [""] * (4 - len(c))
        if c[0]:
            out[c[0]] = (c[1], c[2], c[3])
    return out


def mark_hard(word, common):
    """在词里用大括号圈出该挖的字：`{桅}杆`、`{琵琶}`。

    页面照括号遮字，写法和 corpus 里圈难字一模一样。为什么要在这儿圈——
    页面本来判「难写」看的是 hardChars，可那张表是从 66 篇古诗文正文抽的，
    词语表里大量词出自现代文（刽子、桅杆、唢呐、札记），一个字都不在表内，
    于是整词都挖，跟「只挖难的那个字」的说法对不上（v0.22 查出 400 条）。
    判据在这边现成：不在《通用规范汉字表》一级字表里的就是难写字。

    整词都是常用字的（靠变读收进来的，如「字里行间」）不圈，页面自会整词挖。"""
    if all(ch in common for ch in word):
        return word
    out, run = "", ""
    for ch in word:
        if ch not in common:
            run += ch
        else:
            if run:
                out += "{%s}" % run
                run = ""
            out += ch
    if run:
        out += "{%s}" % run
    return out


def check_hand(hand):
    """自拟例句的三道自检，跟正文那三道一个意思：报出来，人回去判真假。

    1. 词要用大括号圈起来，页面照它遮字；
    2. **圈起来的那处之外，例句里不许再出现这个词里的任何一个字**——
       页面遮的是难字，可「一个难字都没有的词整词都遮」，到底遮哪几个字
       要看难字表，写例句时算不清。索性按最严的来：一个字都不许重复出现，
       这样无论遮几个字都漏不了答案；
    3. 长短和自动抓的例句一个尺度（8–46 字）。
    """
    bad = []
    for w, (gloss, ex, py) in hand.items():
        if not ex:
            continue
        if "{%s}" % w not in ex:
            bad.append((w, "没把词圈起来")); continue
        rest = ex.replace("{%s}" % w, "")
        dup = [c for c in dict.fromkeys(w) if c in rest]
        if dup:
            bad.append((w, "「%s」在例句别处又出现，会漏答案" % "".join(dup)))
        n = len(re.sub(r"[{}]", "", ex))
        if not (MINEX <= n <= MAXEX):
            bad.append((w, "%d 字，超出 %d–%d" % (n, MINEX, MAXEX)))
    return bad


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
        # 按字分开写。看词写拼音时，字和音一个一个对得上才好核对
        return " ".join(x[0] for x in pinyin(w, style=Style.TONE))

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
        py = " ".join(marks.get(ch) or x[0]
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

    # 释义四级回落：课本注释 > 成语释义 > 新华词语 > 自拟。
    # 例句优先课本原句（出处记篇名），课本正文里找不着的用成语书证。
    notes = note_defs()
    idioms = {d["word"]: d for d in
              json.load(open(os.path.join(WORDLISTS, "成语释义.json"),
                             encoding="utf-8"))}
    cidian = {d["ci"]: d["explanation"] for d in
              json.load(open(os.path.join(WORDLISTS, "新华词语.json"),
                             encoding="utf-8"))}
    hand = load_hand()
    bank = sentence_bank()

    def gloss_of(w):
        # 自拟表的释义列是**人工覆盖**：写了就压过三本词典，留空才走词典。
        # 词典里有一批条目是在打转（「马厩→见马厩」「橐驼→即骆驼」），查了
        # 等于没查，只能人工重写；既然人写了，就该以人写的为准——和难字
        # 「data.js 是权威、tsv 是账本」一个道理。
        if w in hand and hand[w][0]:
            return hand[w][0], "自拟"
        if w in notes:
            return notes[w][0], "课本"
        if w in idioms:
            return clean_def(idioms[w]["explanation"]), "成语"
        if w in cidian:
            return clean_def(cidian[w]), "新华"
        return "", ""

    def example_of(w):
        # 例句三档：课本古诗文原句 > 成语的古典书证 > 其余课文（现代文、
        # 单元导语）。成语「字里行间」在课本里只出现在一条练习题小标题下，
        # 与其拿那个充数，不如用《答新渝侯和诗书》的书证
        ex, where, rank = pick_example(w, bank)
        if ex and rank == 0:
            return ex, where
        if w in idioms:
            quote, src = idiom_cite(idioms[w].get("derivation"))
            if quote:
                return quote.replace(w, "{%s}" % w, 1), src
        if ex:
            return ex, where
        if w in hand and hand[w][1]:
            return hand[w][1], "自拟"

        return "", ""

    order = sorted(rows, key=lambda w: (-full.count(w), w))
    miss = []
    with open(OUT, "w", encoding="utf-8") as f:
        f.write("# 词 \t 拼音 \t 题型 \t 词源 \t 释义 \t 释义来源 "
                "\t 例句 \t 例句出处 \t 课本里出现次数\n")
        for w in order:
            py, src, where = rows[w]
            marked = mark_hard(w, common)
            if w in hand and hand[w][2]:
                py = hand[w][2]              # 人工按住机器注错的音
            gloss, gsrc = gloss_of(w)
            ex, exsrc = example_of(w)
            if not gloss:
                miss.append(w)
            # 课本注音里混着国际音标的 ɡ（U+0261），统一成普通的 g
            f.write("%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%d\n"
                    % (marked, py.replace("ɡ", "g"), kind(w, src), src,
                       gloss, gsrc, ex, exsrc or where, full.count(w)))
    over = [w for w in rows if w in hand and hand[w][0] and w in notes]
    if over:
        print("  注意：%d 条自拟释义压过了课本注释 → %s"
              % (len(over), "、".join(over[:8])))
    bad = check_hand(hand)
    if bad:
        print("  自拟例句有 %d 处要看：" % len(bad))
        for w, why in bad[:12]:
            print("    %s　%s" % (w, why))
        if len(bad) > 12:
            print("    ……还有 %d 处" % (len(bad) - 12))
    tally = collections.Counter(v[1] for v in rows.values())
    print("词语 %d 条 → %s" % (len(rows), os.path.relpath(OUT, HERE)))
    print("  词源　" + "　".join("%s %d" % kv for kv in tally.most_common()))
    gt = collections.Counter(gloss_of(w)[1] or "缺" for w in rows)
    print("  释义　" + "　".join("%s %d" % kv for kv in gt.most_common()))
    print("  例句　%d 条（课本古诗文原句 %d）"
          % (sum(1 for w in rows if example_of(w)[0]),
             sum(1 for w in rows if pick_example(w, bank)[2] == 0)))
    path = os.path.join(HERE, "extract", "缺释义.txt")
    if not miss and os.path.exists(path):
        os.remove(path)          # 清掉上一轮的，免得看着旧账当新账
    if miss:
        with open(path, "w", encoding="utf-8") as f:
            f.write("# 两本词典都查不着的词。人工写进 tools/释义-自拟.tsv：\n")
            f.write("# 词 \t 释义 \t 例句（可空）\n")
            for w in miss:
                f.write("%s\t\t\n" % w)
        print("  还缺 %d 条释义 → %s" % (len(miss), os.path.relpath(path, HERE)))


if __name__ == "__main__":
    main()
