#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
第一步：把教科书 PDF 拆成结构化的中间产物（每页一条 JSON）。

这一步只做「忠实搬运」，不做任何语文上的判断：
版面按字体切开，正文、注释、学习提示、标题各归各位。

两处必须绕开的坑：
  · 注释角标是上标，PDF 里自成一行，直接按行读会把正文切碎、次序错乱，
    所以这里丢掉 PDF 的行结构，按「视觉行带」重新聚类。
  · 角标字形在正文和注释里对不上（正文印 w x y z，注释那边抽出来是 @3 @4），
    所以一律不认字面，只认出现次序，用 ⟦n⟧ 配对。

    python3 tools/pdfdump.py            # 全部五册，输出到 extract/raw/
    python3 tools/pdfdump.py 必修上 64  # 只看一页，打到屏幕上，调版式用
"""

import json
import os
import re
import sys

import pymupdf

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(HERE, "extract", "raw")

BOOKS = [
    ("必修上", "普通高中教科书·语文必修 上册.pdf"),
    ("必修下", "普通高中教科书·语文必修 下册.pdf"),
    ("选必上", "普通高中教科书·语文选择性必修 上册.pdf"),
    ("选必中", "普通高中教科书·语文选择性必修 中册.pdf"),
    ("选必下", "普通高中教科书·语文选择性必修 下册.pdf"),
]

# 版面里认字体，不认位置。
# 方正的字体成对出现：JW 是 GB1 基本集，K 是 GBK 扩展集，同一款字的两套字库，
# 生僻字会掉到 K 那一套里去。只认一半就会漏字、错分区块。
F_MARK = "RopeSequenceNumber"   # 注释角标 a b c…
F_PINYIN = "NEU-XT"             # 注音专用拉丁字体
F_SONG = ("FZSSJW", "FZSSK")    # 正文宋体
F_KAI = ("FZKTJW", "FZKTK", "KaiTi_GB2312")   # 学习提示、旁批用楷体
F_FANGSONG = ("FZFSJW", "FZFSK")              # 作者署名
F_TITLE = ("FZZHUNYSK",)        # 课文篇名
F_TITLE_BIG = ("FZZHUNYSJW",)   # 课序号、单元名、「古诗词诵读」这类栏目名
F_LABEL = ("FZLTZHJW", "FZLTZHK", "FZHTJW", "FZHTK", "FZLTHJW")  # 各种标签、小标题
F_PAGENO = ("FZZDXJW",)         # 页码

FOOTER_Y = 782.0                # 这条线以下是页眉页脚，一律丢掉

# 这些单字符 span 不跟着字体走，得按位置认领：间隔点、句读等等。
LONE = set("·•，。、；：！？　…—－-（）〔〕《》“”‘’")

# PDF 里的两个私有区造字，按字形认定。囷见《阿房宫赋》「盘盘焉，囷囷焉」，
# 趱见《林教头风雪山神庙》（现代文，用不上，一并记着免得漏）。
PUA = {"": "囷", "": "趱"}

CJK = "　-〿一-鿿＀-￯"


def norm(s):
    for k, v in PUA.items():
        s = s.replace(k, v)
    return s.replace(" ", " ").replace(" ", " ").replace("\xa0", " ")


def fontkind(font):
    for keys, kind in (
        ((F_MARK,), "mark"), ((F_PINYIN,), "pinyin"),
        (F_SONG, "song"), (F_KAI, "kai"), (F_FANGSONG, "fangsong"),
        (F_TITLE, "title"), (F_TITLE_BIG, "titlebig"),
        (F_LABEL, "label"), (F_PAGENO, "pageno"),
    ):
        if any(k in font for k in keys):
            return kind
    return "other"


def spans_of(page):
    out = []
    for block in page.get_text("dict")["blocks"]:
        if block["type"] != 0:
            continue
        for line in block["lines"]:
            for sp in line["spans"]:
                txt = norm(sp["text"])
                if not txt.strip():
                    continue
                x0, y0, x1, y1 = sp["bbox"]
                if y0 >= FOOTER_Y:
                    continue
                out.append({"text": txt, "size": round(sp["size"], 1),
                            "kind": fontkind(sp["font"]),
                            "x0": x0, "y0": y0, "x1": x1, "y1": y1})
    return out


def bodysize(spans):
    """这一页正文的字号：正文字体里出现得最多的那个大字号。"""
    tally = {}
    for sp in spans:
        if sp["kind"] in ("song", "kai") and sp["size"] >= 10.5:
            tally[sp["size"]] = tally.get(sp["size"], 0) + len(sp["text"])
    return max(tally.items(), key=lambda kv: kv[1])[0] if tally else None


def classify(sp, bsize):
    kind, size = sp["kind"], sp["size"]
    if kind == "pageno":
        return None
    if kind == "title" and size >= 14:
        return "title"
    if kind == "titlebig" and size >= 14:
        return "titlebig"
    if kind == "label":
        return "label"
    if kind == "fangsong" and size >= 11:
        return "author"
    if kind == "kai" and size >= 11:
        return "hint"
    if bsize and size >= bsize - 0.6 and kind in ("song", "kai", "other"):
        return "body"
    if size <= 10:
        return "note"
    return "other"


ROW_SPLIT = 20.0  # 一「行」里空出这么多，就不是一行了，是左右两栏各自的行
COL_GAP = 0.0     # 栏与栏之间可以挨得极近（必修下 p16 只隔 2 点），只好要求真重叠


def cost(sp, x0, x1, y1, size, raised):
    """某个游离 span 离某一行有多远。
    角标是上标，抬升幅度随字号走：贴 12 号正文抬 8 点，贴 18 号标题抬 18 点，
    所以纵向容差按字号放缩，不能写死。"""
    limit = size * 1.1 + 4 if raised else max(8.0, size * 0.6)
    dy = abs(sp["y1"] - y1)
    if dy > limit:
        return 1e9
    dx = 0.0 if x0 - 4 <= sp["x0"] <= x1 + 4 else \
        min(abs(sp["x0"] - x1), abs(x0 - sp["x1"]))
    c = dy / limit * 30 + dx
    # 角标只会在被标注那个字的右上方，绝不会吊在行的下面。
    if raised and sp["y1"] > y1 + 2:
        c += 40
    return c


def columns(spans):
    """按 x 区间的连通性把行片段归栏。诗行居中、长短不一也不会被误切。"""
    if not spans:
        return []
    rest = sorted(spans, key=lambda f: f[0]["x0"])
    span_r = lambda f: max(s["x1"] for s in f)
    groups, cur, right = [], [rest[0]], span_r(rest[0])
    for frag in rest[1:]:
        if frag[0]["x0"] <= right + COL_GAP:
            cur.append(frag)
            right = max(right, span_r(frag))
        else:
            groups.append(cur)
            cur, right = [frag], span_r(frag)
    groups.append(cur)
    return groups


def fragments(spans):
    """把一块区域拆成有序的行片段。

    不能先分栏再聚行：注释有时排得极满，左右两栏只隔两三个点，
    横向投影根本切不开。反过来做就稳了——先按基线聚行，一「行」里
    真出现了二十点以上的空当，那就是跨了栏，就地切开；切出来的片段
    再按横向重叠归栏，最后左栏读到底、再读右栏。"""
    frags = []
    for row in rows(spans):
        row = sorted(row, key=lambda s: s["x0"])
        cur = [row[0]]
        for sp in row[1:]:
            if sp["x0"] - max(s["x1"] for s in cur) > ROW_SPLIT:
                frags.append(cur)
                cur = [sp]
            else:
                cur.append(sp)
        frags.append(cur)

    return frags


def order(frags):
    """同一区块内部的阅读次序：左栏从头读到尾，再读右栏。"""
    out = []
    for ci, col in enumerate(columns(frags)):
        for frag in sorted(col, key=lambda f: (f[0]["y1"], f[0]["x0"])):
            out.append((ci, frag))
    return out


ROW_TOL = 4.0     # 同一行的字共用一条基线，差这么点是字号不同撑出来的


def rows(spans):
    """按基线把 span 聚成视觉行。角标不喂进来——它是上标，另行归位。"""
    if not spans:
        return []
    tol = ROW_TOL

    out = []
    for sp in sorted(spans, key=lambda s: s["y1"]):
        if out and sp["y1"] - out[-1][0] <= tol:
            out[-1][1].append(sp)
        else:
            out.append([sp["y1"], [sp]])
    return [r for _, r in out]


def squeeze(s):
    """压掉排版撑出来的空格，保留拉丁字母、数字之间必要的那些。"""
    s = re.sub(r"[ \t]+", " ", s).strip()
    s = re.sub(r"(?<=[" + CJK + r"]) (?=[" + CJK + r"])", "", s)
    s = re.sub(r"(?<=⟧) (?=[，。！？；：、）〕》”’])", "", s)
    s = re.sub(r"(?<=[" + CJK + r"]) (?=⟦)", "", s)
    s = re.sub(r"(?<=⟧) (?=[" + CJK + r"])", "", s)
    return s


GLYPHS = os.path.join(HERE, "tools", "glyphs.tsv")


def load_glyphs():
    """补字表：教科书里画上去的生僻字，文本层没有，按位置补回来。"""
    gaps, heads, tails = {}, {}, {}
    if not os.path.exists(GLYPHS):
        return gaps, heads, tails
    with open(GLYPHS, encoding="utf-8") as f:
        for line in f:
            line = line.split("#")[0].rstrip()
            cols = [c.strip() for c in line.split("\t") if c.strip()]
            if len(cols) < 5:
                continue
            kind, book, page, group, key, char = (cols + [""])[:6]
            if kind == "gap":
                gaps[(book, int(page), group, int(key))] = char
            elif kind == "head":
                heads.setdefault((book, int(page), group), []).append((key, char))
            elif kind == "tail":
                tails.setdefault((book, int(page), group), []).append((key, char))
    return gaps, heads, tails


CIRCLED = re.compile(r"^\s*[①-⑳⓪]")


def split_captions(lines):
    """插图说明和注释同为 9 号宋体，字体上分不开，只能靠版面：
    注释一定从角标起头，每栏里排在第一个角标之前的，是插图说明。
    个别篇目（《孔雀东南飞》）的头一条注释用的是普通的「①」，
    不是那套专用角标字体，也得认。"""
    notes, captions = [], []
    cols = sorted({l["col"] for l in lines})
    for col in cols:
        group = [l for l in lines if l["col"] == col]
        # 只有第一栏的前导行才是插图说明。后面几栏栏顶那几行，
        # 是上一栏末条注释排不下续过来的，得接回去。
        started = col != cols[0]
        for line in group:
            if "⟦" in line["text"] or CIRCLED.match(line["text"]):
                started = True
            (notes if started else captions).append(line)
    return notes, captions


def vote(frag, bsize):
    """一行字属于哪个区块，由行里的字共同决定，不是一个字一个字地判。
    行里夹着的数字、拉丁字母、间隔点都没有中文字体可认（「背诵课文第 1 段」
    里的 1 用的是 Times），让它们跟着同行的邻居走。"""
    tally = {}
    for sp in frag:
        if sp["kind"] in ("other", "pinyin") or sp["text"].strip() in LONE:
            continue
        g = classify(sp, bsize)
        if g:
            tally[g] = tally.get(g, 0) + len(sp["text"].strip())
    if not tally:
        return "body" if bsize else "other"
    return max(tally.items(), key=lambda kv: kv[1])[0]


def dumppage(page, pno, book="", glyphs=None):
    spans = spans_of(page)
    bsize = bodysize(spans)

    marks = [sp for sp in spans if sp["kind"] == "mark"]
    text = [sp for sp in spans if sp["kind"] != "mark"]

    # 先切行片段（跨栏的地方就地切开），再逐行定区块，最后各区块内部排序。
    # 反过来做不行：按单个字定区块，行里的数字会掉到别的区块去，
    # 在行中留下空当，又被当成跨栏切一刀。
    buckets = {}
    for frag in fragments(text):
        buckets.setdefault(vote(frag, bsize), []).append(frag)
    buckets.pop("pageno", None)

    gaps, heads, tails = glyphs or ({}, {}, {})
    holes = []
    marklog = []
    counter = [0]
    seen = {}

    def emit(frags, rows_out):
        for ci, frag in order(frags):
            rows_out.append({"col": ci, "spans": frag,
                             "x0": round(frag[0]["x0"], 1),
                             "y0": round(min(s["y0"] for s in frag), 1),
                             "y1": max(s["y1"] for s in frag),
                             "x1": max(s["x1"] for s in frag),
                             "size": max(s["size"] for s in frag)})

    groups = {}
    for g in ("title", "titlebig", "author", "body", "hint", "label",
              "other", "note"):
        rows_out = []
        emit(buckets.get(g, []), rows_out)
        for r in rows_out:
            r["group"] = g
        groups[g] = rows_out

    # 仿宋不只用来署名：《琵琶行》《孔雀东南飞》这些篇前面的小序也是仿宋排的。
    # 署名短，序成段——按行长度把序还给正文，不然整篇序都会当成作者名丢掉。
    for row in list(groups["author"]):
        n = sum(len(sp["text"].strip()) for sp in row["spans"])
        if n > 8:
            groups["author"].remove(row)
            row["group"] = "body"
            groups["body"].append(row)
    groups["body"].sort(key=lambda r: (r["col"], r["y1"], r["x0"]))

    # 角标自己不带版面线索，按最近邻认领到某一行里去。
    allrows = [r for rl in groups.values() for r in rl]
    for m in marks:
        best, bestcost = None, 1e9
        for row in allrows:
            c = cost(m, row["x0"], row["x1"], row["y1"], row["size"], True)
            if c < bestcost:
                best, bestcost = row, c
        if best is None:
            orphan = {"col": -1, "spans": [m], "group": "note",
                      "x0": round(m["x0"], 1), "y0": round(m["y0"], 1),
                      "y1": m["y1"], "x1": m["x1"], "size": m["size"]}
            groups["note"].append(orphan)
            allrows.append(orphan)
        else:
            best["spans"].append(m)
            best["spans"].sort(key=lambda s: s["x0"])

    def render(rows_):
        for row in rows_:
            buf, prev = [], None
            for sp in row["spans"]:
                # 教科书里个别生僻字（如《静女》注释的「薆」）不是字符，
                # 是画上去的，文本层里只剩一个空洞。宁可留个 □ 叫出来，
                # 也不能让它无声无息地少一个字。
                if (prev is not None
                        and row["group"] in ("body", "note", "hint")
                        and not prev["text"].endswith(" ")
                        and not sp["text"].startswith(" ")
                        and sp["x0"] - prev["x1"] > sp["size"] * 0.75):
                    g = row["group"]
                    i = seen[g] = seen.get(g, -1) + 1
                    fill = gaps.get((book, pno, g, i))
                    buf.append(fill or "□")
                    if not fill:
                        holes.append({"group": g, "y": round(sp["y0"], 1),
                                      "x": round(prev["x1"], 1),
                                      "after": prev["text"][-6:],
                                      "before": sp["text"][:6]})
                if sp["kind"] == "mark":
                    counter[0] += 1
                    buf.append("⟦%d⟧" % counter[0])
                    marklog.append({"n": counter[0], "group": row["group"],
                                    "y0": round(sp["y0"], 1),
                                    "x0": round(sp["x0"], 1)})
                else:
                    buf.append(sp["text"])
                prev = sp
            text = squeeze("".join(buf))
            for key, char in heads.get((book, pno, row["group"]), []):
                if text.startswith(key):
                    text = char + text
            for key, char in tails.get((book, pno, row["group"]), []):
                if text.endswith(key):
                    text = text + char
            row["text"] = text
            row["x1"] = round(row["x1"], 1)
            row["x0"] = round(row["x0"], 1)
            row.pop("spans", None)
            row.pop("y1", None)

    # 编号次序必须和书上的阅读次序一致：先走正文一侧（篇名、小序、正文……
    # 一页上并排两篇时，得按先后走完第一篇再走第二篇），再走页脚的注释。
    # 次序错了，注释就配不回正文。
    front = [r for g, rl in groups.items() if g != "note" for r in rl]
    front.sort(key=lambda r: (r["y0"], r["x0"]))
    render(front)
    render(groups["note"])

    nbody = sum(r["text"].count("⟦") for r in front)
    note, caption = split_captions(groups["note"])

    return {
        "page": pno,
        "bodysize": bsize,
        "titles": [x["text"] for x in groups["title"]],
        "titles_pos": groups["title"],
        "banners": [x["text"] for x in groups["titlebig"]],
        "banners_pos": groups["titlebig"],
        "authors": [x["text"] for x in groups["author"]],
        "labels": [x["text"] for x in groups["label"]],
        "body": groups["body"],
        "notes": note,
        "captions": [x["text"] for x in caption],
        "hints": [x["text"] for x in groups["hint"]],
        "other": [x["text"] for x in groups["other"]],
        "holes": holes,
        "marks": marklog,
        "marks_in_body": nbody,
        "marks_total": counter[0],
    }


def main():
    os.makedirs(OUT, exist_ok=True)
    if len(sys.argv) == 3:
        tag, pno = sys.argv[1], int(sys.argv[2])
        doc = pymupdf.open(os.path.join(HERE, dict(BOOKS)[tag]))
        print(json.dumps(dumppage(doc[pno], pno, tag, load_glyphs()),
                         ensure_ascii=False, indent=1))
        return
    glyphs = load_glyphs()
    for tag, path in BOOKS:
        doc = pymupdf.open(os.path.join(HERE, path))
        pages = [dumppage(doc[i], i, tag, glyphs) for i in range(doc.page_count)]
        dst = os.path.join(OUT, tag + ".json")
        with open(dst, "w", encoding="utf-8") as f:
            json.dump({"book": tag, "file": path, "pages": pages},
                      f, ensure_ascii=False, indent=1)
        print("%s  %d 页 → %s" % (tag, len(pages), os.path.relpath(dst, HERE)))


if __name__ == "__main__":
    main()
