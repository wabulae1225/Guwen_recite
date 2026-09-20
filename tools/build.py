#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
第三步：把校对过的中间稿变成 data.js 的三个板块。

corpus　　正文，难字用大括号圈起来，篇头第四项标背诵范围
hardChars　难字表，课本注了音的字把音一起带上
notes　　　注释，一行一条：来源 | 字词 | 释义 | 例句 | 出处

注释靠 ⟦n⟧ 定位——它标出了这条注释挂在正文的哪个字上，例句就从那里取。
课本的长注释里常常套着小注（「衿，衣服的交领」），这些也各拆成一条。

    python3 tools/build.py            # 生成 extract/data-片段.txt
    python3 tools/build.py 必修上      # 只做一册
"""

import collections
import glob
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(HERE, "extract", "篇")
RAW = os.path.join(HERE, "extract", "raw")
OUT = os.path.join(HERE, "extract")

BOOKS = ["必修上", "必修下", "选必上", "选必中", "选必下"]
MARK = re.compile(r"⟦(\d+)⟧")
CJK = re.compile(r"[一-鿿]")
# 课本给的注音，形如「衿（jīn）」「搔首踟蹰（chíchú）」。
# 四声的符号要齐全——漏了第一声，「jīn」就认不出来；ɡ 是国际音标的 g，课本混用。
VOWEL = "aeiouüāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ"
PINYIN = re.compile(r"([一-鿿]+)（([a-zü" + VOWEL + r"ńňǹɡ\s]+)）")
# 音节末尾的 r 只能是儿化，后面跟着元音的那个 r 是下一个音节的声母：
# 「葳蕤（wēiruí）」不加这条会切成 wēir / uí，两个字的注音都错。
SYLLABLE = re.compile(r"(?:[zcs]h|[bpmfdtnlgkhjqxrwyzcsɡ])?[" + VOWEL +
                      r"]+(?:n[gɡ]?|r(?![" + VOWEL + r"]))?")


def sound(py):
    """课本的注音里混着国际音标的 ɡ（U+0261），统一成普通的 g。"""
    return py.replace("ɡ", "g")
COMMON1 = os.path.join(HERE, "tools", "data", "常用字-一级3500.txt")


def common_chars():
    """《通用规范汉字表》一级字表——现代汉语最常用的 3500 字。

    难写字就按它判：古诗文正文里凡是不在这张表内的，算难写。比数字频准得多。
    「樽」「衿」「掇」「觥」在课本里出现七八次，按字频不算低，可都是二级
    （次常用）字，确实容易写错；反过来「俭」「偿」「剖」「堤」在课本里也只
    出现几次，却都是一级常用字，不该当难写字考。"""
    if not os.path.exists(COMMON1):
        return set()
    text = "".join(l for l in open(COMMON1, encoding="utf-8") if not l.startswith("#"))
    return set(CJK.findall(text))


# 注释正文里的小注：句号之后，「某词，怎么讲。」
SUBNOTE = re.compile(r"。([^，。；：？！“”‘’（）〔〕《》]{1,4})，([^。]+。)")

STOP = "。！？"


DATA_JS = """/* ==================================================================
   古诗文默写 · 数据文件  data.js
   ------------------------------------------------------------------
   这个文件由 tools/build.py 从教科书 PDF 生成，别手改。
   要改内容，改 extract/篇/ 下的中间稿或者 tools/ 里的几张表，
   再跑一遍：  python3 tools/pdfdump.py && python3 tools/assemble.py && python3 tools/build.py
   六个板块的格式说明写在各自上方。
   ================================================================== */

window.DATA = {

/* ------------------------------------------------------------------
   一、正文  corpus
   ------------------------------------------------------------------
   篇头：   # 篇名 | 作者 | 诗 | 背
   第三项填「诗」或「文」。第四项是背诵范围：
       背     全篇要背
       背1    只背第 1 段（课本写「背诵《师说》的第1段」）
       不背   不要求背，只进「看原文」和「注释」，不出默写题
   不写第四项就当成要背，旧的三项写法照样能用。
   空行分段。看答案时会把整段原文一起显示出来。
   段内：   「诗」每行一题；「文」按句号问号叹号分题，不足十字的并进下一题。
   逗号分号切出挖空的最小单位，顿号不切。
   难写的字用大括号圈起来，例如  契阔谈{讌}  {觥}筹交错
------------------------------------------------------------------ */
corpus: `
%s`,

/* ------------------------------------------------------------------
   二、难字表  hardChars
   ------------------------------------------------------------------
   两类字都在这儿：课本注了音的（难读）写成  衿(jīn)  这样，
   括号里的音会在看答案时一并给出；字形生僻的（难写）单写一个字。
   和正文里圈过的字取并集。
------------------------------------------------------------------ */
hardChars: `
%s
`,

/* ------------------------------------------------------------------
   三、注释  notes
   ------------------------------------------------------------------
   一行一条，五段用竖线隔开：
       来源 | 字词 | 释义 | 例句 | 出处
   来源填三种之一：课本（视为准确）、补充（学校补充）、实词（实词手册）。
   例句里把被考的那个字用大括号圈起来，页面会给它加角标。
   课本的长注释里套着小注（「衿，衣服的交领」），这些也各拆了一条。
------------------------------------------------------------------ */
notes: `
%s
`,

/* ------------------------------------------------------------------
   四、词语  words
   ------------------------------------------------------------------
   一行一条，四段用竖线隔开：
       词 | 拼音 | 题型 | 来源
   题型：`写` 看拼音写词语（字生僻）、`读` 看词写拼音（有字变了读音）、
         `都考` 两种都出。
   来源：`课本`（课本自己注的音，最权威）、`成语`、`词典`。
   由 tools/words.py 生成，词都在课本里出现过。
------------------------------------------------------------------ */
words: `
%s
`,

/* ------------------------------------------------------------------
   五、理解性默写  comprehension
   ------------------------------------------------------------------
   一行一题，三段用竖线隔开：  篇名 | 提示语 | 答案
   篇名要和 corpus 里的一字不差。这一板块课本里没有现成的，待补。
------------------------------------------------------------------ */
comprehension: `
`,

/* ------------------------------------------------------------------
   六、译文与解析  gloss
   ------------------------------------------------------------------
   答错之后才会显示。一行一条，三段用竖线隔开：  出处 | 原句 | 译文与解析
   原句要和正文里切出的那一题一字不差。想分行用两个斜杠 // 隔开。
   这一板块课本里没有现成的，待补。
------------------------------------------------------------------ */
gloss: `
`

};
"""


def readpiece(path, paras_at=None):
    text = open(path, encoding="utf-8").read()
    head, rest = text.split("\n\n", 1)
    title, author, genre = [c.strip() for c in head.lstrip("# ").split("|")]

    recite = None
    for line in rest.splitlines():
        if line.startswith("背诵 ") and "否" not in line:
            recite = line[3:].strip()
        if line.startswith("## 正文"):
            break

    paras, notes = [], []
    section, cur = None, []
    for line in rest.splitlines():
        if line.startswith("## "):
            if cur:
                paras.append(cur)
                cur = []
            section = line[3:].strip()
            continue
        if section == "正文":
            if not line.strip():
                if cur:
                    paras.append(cur)
                    cur = []
            else:
                cur.append(line)
        elif section == "注释" and "\t" in line:
            n, body = line.split("\t", 1)
            if n.strip().isdigit():
                notes.append((int(n), body.strip()))
    if cur:
        paras.append(cur)
    paras = cut_blank(paras)
    if genre == "诗":
        paras = [relineate(p) for p in paras]
    paras = cut_paras(paras, (paras_at or {}).get(title))
    paras = join_ellipsis(paras)
    return {"title": title, "author": author, "genre": genre,
            "recite": recite, "paras": paras, "notes": notes}


WIDEGAP = re.compile("\u3000{2,}")


def cut_blank(paras):
    """课本给词的换头留白，有时就是两个全角空格。

    《虞美人》「故国不堪回首月明中。　　雕栏玉砌应犹在」、《江城子》
    「鬓如霜。　　夜来幽梦忽还乡」——排版上是换头，抽出来却跟正文连在一行里。
    这是第三种留白写法：前两种是版面上空出一大块（assemble 能看出来）、
    和跨页换头（看不出来，只能在 paras.tsv 里点名）。这一种字面上就带着，
    在这儿断开，空格本身不留。"""
    out = []
    for para in paras:
        cur = []
        for line in para:
            parts = WIDEGAP.split(line)
            for i, part in enumerate(parts):
                part = part.strip("\u3000")
                if i and cur:
                    out.append(cur)
                    cur = []
                if part:
                    cur.append(part)
        if cur:
            out.append(cur)
    return out


ELLIPSIS = re.compile(r"^[…\u2026.\u3002\s]+$")


def join_ellipsis(paras):
    """课本用一行「……」表示跳过的段落，那一行版面上也缩进两格，看着像一个段。

    可它不是段。《离骚（节选）》的学习提示写「背诵第3段」，指的是
    「长太息以掩涕兮」那一段；要是把「……」也数成一段，第3段就落到省略号
    头上，背诵范围整个错位。所以把它并回上一段的末尾——照样显示，不占段号。"""
    out = []
    for para in paras:
        if out and all(ELLIPSIS.match(MARK.sub("", l)) for l in para):
            out[-1] = out[-1] + para
        else:
            out.append(para)
    return out


PARATABLE = os.path.join(HERE, "tools", "paras.tsv")


def load_paras():
    """人工指定的分段点。跨页的分段版面上看不出来，只能点名，见表里的说明。"""
    out = {}
    if not os.path.exists(PARATABLE):
        return out
    for line in open(PARATABLE, encoding="utf-8"):
        line = line.split("#")[0].rstrip()
        cols = [c.strip() for c in line.split("\t") if c.strip()]
        if len(cols) >= 2:
            out.setdefault(cols[0], []).append(cols[1])
    return out


def cut_paras(paras, marks):
    """在点名的那几句之前断开。"""
    if not marks:
        return paras
    out = []
    for para in paras:
        cur = []
        for line in para:
            if cur and any(MARK.sub("", line).startswith(m) for m in marks):
                out.append(cur)
                cur = []
            cur.append(line)
        if cur:
            out.append(cur)
    return out


BRACED = re.compile(r"\{([^}]*)\}")
HARDTABLE = os.path.join(HERE, "tools", "hardchars.tsv")


def harvest(path):
    """把已经生成好的 data.js 里手圈的大括号扒下来。

    难字表不该让人去啃一张字表——在原文上圈字才是顺手的，跟在纸书上圈错字
    一个道理。所以 data.js 的 corpus 就是权威：你在哪儿加了括号、在哪儿删了，
    重跑之前先在这儿读出来，生成时原样带回去，不会被冲掉。"""
    if not os.path.exists(path):
        return None
    text = open(path, encoding="utf-8").read()
    m = re.search(r"corpus:\s*`(.*?)`,\n", text, re.S)
    if not m:
        return None
    out, cur = {}, None
    for line in m.group(1).split("\n"):
        line = line.strip()
        if line.startswith("#"):
            cur = line[1:].split("|")[0].strip()
            out.setdefault(cur, set())
        elif cur and line and not line.startswith("//"):
            for g in BRACED.findall(line):
                out[cur].update(ch for ch in g if CJK.match(ch))
    return out


def load_edits():
    """手圈记录的备份。data.js 在就以它为准，不在（比如刚 clone 下来）就用这张表。"""
    edits = {}
    if not os.path.exists(HARDTABLE):
        return edits
    with open(HARDTABLE, encoding="utf-8") as f:
        for line in f:
            line = line.split("#")[0].rstrip()
            cols = [c.strip() for c in line.split("\t") if c.strip()]
            if len(cols) >= 3 and cols[0] in ("加", "删"):
                edits.setdefault(cols[1], {"加": set(), "删": set()})[cols[0]].add(cols[2])
    return edits


def save_edits(edits):
    lines = [
        "# 手圈的难字（这张表由 tools/build.py 自动维护，一般不用手改）",
        "#",
        "# 难字不用在字表里一个个找——直接在 data.js 的 corpus 里给字加大括号就行，",
        "# 像在纸书上圈错字一样；想去掉就把括号删了。重跑 build.py 会先把你圈的读出来，",
        "# 记在这张表里，再原样带回生成结果，不会被冲掉。",
        "#",
        "# 所以 data.js 是权威，这张表是备份和账本：能一眼看出你加了哪些字、",
        "# 又把哪些自动判定的字去掉了。只有 data.js 不在时（比如刚 clone 下来），",
        "# 才反过来拿这张表来还原。",
        "#",
        "# 加/删 \t 篇名 \t 字",
        "",
    ]
    for title in sorted(edits):
        for kind in ("加", "删"):
            for ch in sorted(edits[title][kind]):
                lines.append("%s\t%s\t%s" % (kind, title, ch))
    with open(HARDTABLE, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")


def load_words():
    """词语表，由 tools/words.py 生成。没有就算了，页面会自己藏起那个模式。"""
    path = os.path.join(OUT, "词语.tsv")
    if not os.path.exists(path):
        return []
    rows = []
    for line in open(path, encoding="utf-8"):
        if line.startswith("#"):
            continue
        c = line.rstrip("\n").split("\t")
        if len(c) >= 4 and c[0]:
            rows.append(" | ".join([c[0], c[1], c[2], c[3]]))
    return rows


def bookfreq():
    """全书字频。常用字动辄成千上万次，生僻字个位数，用来认难写字。"""
    cnt = collections.Counter()
    for f in glob.glob(os.path.join(RAW, "*.json")):
        d = json.load(open(f, encoding="utf-8"))
        for p in d["pages"]:
            for grp in ("body", "notes"):
                for l in p[grp]:
                    cnt.update(CJK.findall(MARK.sub("", l["text"])))
    return cnt


def cut_stops(text):
    """按句末标点切句，句末的引号跟着上一句走。

    引号里不能不切。《孔雀东南飞》刘兰芝一开口就是二十多句，《赤壁赋》客人
    那段话几百字——真要等引号收口才算一句，整段话就成了一句，注释的例句
    也跟着变成整段。页面上的切法（index.html 的 buildQuestions）本来就是
    见句号就切、末尾的引号补回上一句，这边跟它对齐。"""
    out, buf = [], ""
    for ch in text:
        buf += ch
        if ch in STOP:
            out.append(buf)
            buf = ""
    if buf:
        out.append(buf)
    merged = []
    for s in out:
        if merged and s[:1] in "”’」』）)":
            merged[-1] += s[0]
            s = s[1:]
        if s:
            merged.append(s)
    return merged


def sentences(para, genre):
    """按 data.js 的分题粒度切句：诗一行一题；文按句号，太短的并进下一题。
    「求，尔何如？」这种四五个字的问句单独成题没意思，合过去才像一道题。"""
    if genre == "诗":
        return list(para)
    out = cut_stops("".join(para))

    # 句末的引号要跟着上一句走，不能自己吊在下一句头上
    merged = []
    for s in out:
        if merged and s[:1] in "”’":
            merged[-1] += s[0]
            s = s[1:]
        if s:
            merged.append(s)

    out, i = [], 0
    while i < len(merged):
        s = merged[i]
        while len(CJK.findall(s)) < 10 and i + 1 < len(merged):
            i += 1
            s += merged[i]
        out.append(s)
        i += 1
    if len(out) > 1 and len(CJK.findall(out[-1])) < 10:
        tail = out.pop()          # 先弹出再拼，不然索引会跟着变
        out[-1] += tail
    return out


def relineate(para):
    """词、歌行、骚体在课本里是连排的——一行排满就换行，物理行并不是句子。
    《念奴娇》头一行印到「故垒」就断了，照搬下来一行成一题，句子是残的。
    所以按句末标点重新断行，一行还它一句。律诗本来就一句一行，不动。"""
    lines = [MARK.sub("", l) for l in para]
    ends = sum(1 for l in lines if l and l[-1] in STOP)
    # 行末整齐地落在句号上，未必就是一句一行——《念奴娇·过洞庭》上阕排了
    # 两行，一行两句，碰巧都断在句号上。真正一句一行的是律诗绝句，一行
    # 最多十五六个字；排满一行才折的，二十几个字打不住。两条都看。
    longest = max(len(CJK.findall(l)) for l in lines) if lines else 0
    if len(lines) < 2 or (ends >= len(lines) * 0.75 and longest <= 18):
        return list(para)

    return cut_stops("".join(para))


def entry_of(body):
    """一条注释拆成：词条、释义。头一条「选自……」没有词条。"""
    m = re.match(r"^[〔﹝\[]([^〕﹞\]]*)[〕﹞\]](.*)$", body)
    if not m:
        return None, body
    return m.group(1).strip(), m.group(2).strip()


def depinyin(s):
    """去掉词条里的注音，剩下的才对得上正文。"""
    return re.sub(r"（[^）]*）", "", s)


def build(book, freq, edits, COMMON):
    paras_at = load_paras()
    pieces = []
    for path in sorted(glob.glob(os.path.join(SRC, book + "-*.md"))):
        pieces.append(readpiece(path, paras_at))

    corpus, notes, hard, misses = [], [], {}, []

    for pc in pieces:
        # 难字：课本注了音的（难读），加上全书里也没出现几次的（难写）
        sounds = {}
        for _, body in pc["notes"]:
            for word, py in PINYIN.findall(body):
                # 注音是给词注的，几个音节就管前面几个字，
                # 「搔首踟蹰（chíchú）」两个音节，「踟」「蹰」各拿一个。
                syl = SYLLABLE.findall(py.strip())
                n = min(len(syl), len(word))
                for ch, s in zip(word[-n:], syl[-n:]):
                    sounds.setdefault(ch, sound(s))

        plain = "".join(MARK.sub("", l) for para in pc["paras"] for l in para)
        # 不在 3500 常用字里的就算难字；课本给它注过音的，把音也带上。
        # 常用多音字（不 fǒu、说 yuè、读 dòu）在表内，不收——那是随语境变读，
        # 不是字难写，一收正文里每个「不」都要被圈。
        rare = {ch for ch in set(CJK.findall(plain)) if ch not in COMMON}
        # 手圈的说了算：加过的加上，删过的去掉
        mine = edits.get(pc["title"], {"加": set(), "删": set()})
        rare = (rare | mine["加"]) - mine["删"]
        for ch in rare:
            if ch in sounds:
                hard.setdefault(ch, sounds[ch])
            else:
                hard.setdefault(ch, "")

        # 正文：圈难字，篇头第四项记背诵范围
        seg = pc["recite"] or "不背"
        if seg and seg.startswith("第"):
            seg = "背" + seg.replace("第", "").replace("段", "")
        elif seg == "全篇":
            seg = "背"
        corpus.append("# %s | %s | %s | %s" % (pc["title"], pc["author"],
                                               pc["genre"], seg))
        # 《侍坐》里「“求！尔何如？”」「夫子哂之。」自成一段，短到不够一道题，
        # 段内又没得合并，只好并进下一段。门槛压得比分题的十字低：段落是课本
        # 分的，能不动就不动——《劝学》的「君子曰：学不可以已。」八个字也是一段，
        # 独立成题不算短，不该并走。诗的分节一概不动。
        paras = pc["paras"]
        if pc["genre"] == "文":
            paras, hold = [], []
            for para in pc["paras"]:
                hold = hold + para
                if len(CJK.findall(MARK.sub("", "".join(hold)))) >= 6:
                    paras.append(hold)
                    hold = []
            if hold:
                if paras:
                    paras[-1] += hold
                else:
                    paras.append(hold)
        for para in paras:
            corpus.append("")
            body = "".join(l for l in para) if pc["genre"] == "文" else None
            lines = [body] if body else list(para)
            for line in lines:
                bare = MARK.sub("", line)
                corpus.append("".join("{%s}" % c if c in rare else c for c in bare))
        corpus.append("")

        # 注释：⟦n⟧ 标出这条挂在正文哪个字上，例句就从那一句里取
        spots = {}
        for para in paras:
            flat = "".join(para)
            for m in MARK.finditer(flat):
                spots[int(m.group(1))] = (para, m.start(), MARK.sub("", flat[:m.start()]))

        for n, body in pc["notes"]:
            term, gloss = entry_of(body)
            if not term or n not in spots:
                continue
            para, _, before = spots[n]
            key = depinyin(term)
            # 长句词条课本写成「以地事秦……火不灭」，掐头去尾中间省略。
            # 角标挂在末尾那几个字上，所以从后往前认，再回头找起点。
            if "……" in key:
                head, tail = key.split("……")[0], key.split("……")[-1]
                at = before.rfind(head)
                if at >= 0 and before.endswith(tail):
                    key = before[at:]
            # 词条对不上正文，多半是正文掉了字——课本注了什么，正文就得有什么。
            # 这是抓漏字最灵的一道关口：《劝学》的「輮以为轮」就是这么露出来的。
            if not before.endswith(key):
                misses.append((pc["title"], n, key, before[-14:]))
                continue
            sents = sentences([MARK.sub("", l) for l in para], pc["genre"])
            at = len(before) - len(key)
            # 词条有时跨句（〔呦呦鹿鸣，食野之苹。我有嘉宾，鼓瑟吹笙〕），
            # 例句要把它整个裹进来，不能切一半。
            pos, lo, hi = 0, None, None
            for i, s in enumerate(sents):
                if pos <= at < pos + len(s) and lo is None:
                    lo, off = i, at - pos
                if pos < at + len(key) <= pos + len(s):
                    hi = i
                pos += len(s)
            if lo is None or hi is None:
                continue
            whole = "".join(sents[lo:hi + 1])
            ex = whole[:off] + "{" + key + "}" + whole[off + len(key):]
            notes.append(("课本", key, gloss, ex.strip(), pc["title"]))

            # 长注释里套着的小注也各拆一条，这样单个字也能考到
            for sub, exp in SUBNOTE.findall(gloss):
                if sub not in ex.replace("{", "").replace("}", ""):
                    continue
                plain_ex = ex.replace("{", "").replace("}", "")
                i = plain_ex.find(sub)
                notes.append(("课本", sub, exp.strip(),
                              plain_ex[:i] + "{" + sub + "}" + plain_ex[i + len(sub):],
                              pc["title"]))
    return corpus, hard, notes, misses


def main():
    freq = bookfreq()
    COMMON = common_chars()
    args = sys.argv[1:]
    # --regen：不管上一版 data.js 圈了什么，完全按自动规则重判一遍。
    # 改了难字判定规则时要用——否则 harvest 会把上一版的结果当成手圈留下来，
    # 新规则等于白改。会清空手圈账本，所以只在确实想重来时用。
    regen = "--regen" in args
    books = [a for a in args if not a.startswith("-")] or BOOKS

    # 先把上一版 data.js 里手圈的括号扒下来，免得重跑一冲就没了。
    # data.js 是权威；它不在（刚 clone 下来）才退回去读备份表。
    edits = {} if regen else load_edits()
    dst_js = os.path.join(HERE, "data.js")
    seen = None if regen else harvest(dst_js)
    if regen:
        save_edits({})
    if seen is not None:
        auto = {}
        for b in BOOKS:
            for path in sorted(glob.glob(os.path.join(SRC, b + "-*.md"))):
                pc = readpiece(path, load_paras())
                sounds = {}
                for _, body in pc["notes"]:
                    for word, py in PINYIN.findall(body):
                        syl = SYLLABLE.findall(py.strip())
                        k = min(len(syl), len(word))
                        for ch, sy in zip(word[-k:], syl[-k:]):
                            sounds.setdefault(ch, sound(sy))
                plain = "".join(MARK.sub("", l) for para in pc["paras"] for l in para)
                auto[pc["title"]] = {ch for ch in set(CJK.findall(plain))
                                     if ch not in COMMON}
        edits = {}
        for title, circled in seen.items():
            a = auto.get(title)
            if a is None:
                continue
            add, drop = circled - a, a - circled
            if add or drop:
                edits[title] = {"加": add, "删": drop}
        save_edits(edits)

    allc, allh, alln, allm = [], {}, [], []
    for b in books:
        c, h, n, m = build(b, freq, edits, COMMON)
        allm += m
        allc += ["// 册 %s" % b] + c
        for k, v in h.items():
            allh.setdefault(k, v) or (v and allh.__setitem__(k, v))
        alln += n

    words = [("%s(%s)" % (k, v)) if v else k for k, v in sorted(allh.items())]
    lines, cur = [], ""                 # 折行只在词与词之间断，别把 衿(jīn) 劈两半
    for w in words:
        if cur and len(cur) + len(w) + 1 > 76:
            lines.append(cur)
            cur = ""
        cur = (cur + " " + w).strip()
    if cur:
        lines.append(cur)
    dst = os.path.join(OUT, "data-片段.txt")
    with open(dst, "w", encoding="utf-8") as f:
        f.write("=== corpus ===\n" + "\n".join(allc))
        f.write("\n\n=== hardChars ===\n" + "\n".join(lines))
        f.write("\n\n=== notes ===\n")
        for row in alln:
            f.write(" | ".join(row) + "\n")

    with open(os.path.join(HERE, "data.js"), "w", encoding="utf-8") as f:
        f.write(DATA_JS % ("\n".join(allc), "\n".join(lines),
                           "\n".join(" | ".join(r) for r in alln),
                           "\n".join(load_words())))
    print("篇 %d，难字 %d，注释 %d 条 → %s"
          % (sum(1 for l in allc if l.startswith("# ")), len(allh), len(alln),
             os.path.relpath(dst, HERE)))
    report = os.path.join(OUT, "对不上的词条.txt")
    if not allm and os.path.exists(report):
        os.remove(report)          # 清掉上一轮的，免得看着旧账当新账
    if allm:
        with open(report, "w", encoding="utf-8") as f:
            for title, n, key, ctx in allm:
                f.write("%s\t注释%d\t〔%s〕\t正文作：…%s\n" % (title, n, key, ctx))
        print("有 %d 条注释的词条在正文里找不着 → %s"
              % (len(allm), os.path.relpath(report, HERE)))


if __name__ == "__main__":
    main()
