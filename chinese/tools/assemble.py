#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
第二步：把 pdfdump 的逐页产物按篇合起来，输出可校对的中间稿。

要处理的麻烦：
  · 一篇课文常跨好几页，角标每页从头编号，得先按页配对再整篇重排。
  · 一页上可能并排着两篇（《芣苢》和《插秧歌》），按篇名的位置切开。
  · 背诵要求写在课文末尾的「学习提示」里，写法有七八种。

    python3 tools/assemble.py 必修上
    python3 tools/assemble.py            # 五册全做

输入 tools/pieces.tsv（哪些是古诗文，人工圈定），
输出 extract/篇/<册>-p<页>-<篇名>.md
"""

import json
import os
import re
import sys

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(HERE, "extract", "raw")
OUT = os.path.join(HERE, "extract", "篇")
PIECES = os.path.join(HERE, "tools", "pieces.tsv")

BOOKS = ["必修上", "必修下", "选必上", "选必中", "选必下"]
MARK = re.compile(r"⟦(\d+)⟧")


def load_pieces():
    out = []
    with open(PIECES, encoding="utf-8") as f:
        for line in f:
            line = line.split("#")[0].rstrip()
            if not line.strip():
                continue
            cols = [c.strip() for c in line.split("\t") if c.strip()]
            if len(cols) < 5:
                continue
            out.append({"book": cols[0], "page": int(cols[1]), "title": cols[2],
                        "author": cols[3], "genre": cols[4]})
    return out


def marks(text):
    return [int(n) for n in MARK.findall(text)]


def bare(text):
    return MARK.sub("", text)


CIRCLED = "①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳"


def split_notes(lines):
    """注释行流 → 一条条注释。每条从角标起头，后面跟着它的续行。
    个别篇目头一条注释印的是普通的「①」，按圈号本身的数值配对。"""
    out = []
    for line in lines:
        text = line["text"].lstrip()
        m = MARK.match(text)
        if text[:1] in CIRCLED:
            out.append({"n": None, "circ": CIRCLED.index(text[:1]) + 1,
                        "text": text[1:].strip()})
        elif m:
            out.append({"n": int(m.group(1)), "text": text[m.end():].strip()})
        elif out:
            out[-1]["text"] += text
        else:
            out.append({"n": None, "text": text})
    return out


def anchors_of(page):
    """本页的篇名锚点：位置 + 它自己的那个角标号。"""
    out = []
    for line in page["titles_pos"]:
        nums = marks(line["text"])
        out.append({"y0": line["y0"], "text": bare(line["text"]).strip(),
                    "mark": nums[0] if nums else None})
    return sorted(out, key=lambda a: a["y0"])


RECITE = re.compile(r"背诵")
SEG = re.compile(r"第\s*(\d+)\s*段")


def samename(a, b):
    """《〈论语〉十二章》和清单里的「《论语》十二章」得认成同一篇；
    「背诵《离骚》第3段」里的《离骚》要认上「离骚（节选）」。"""
    strip = lambda s: re.sub(r"[《》〈〉（）()□\s]|节选", "", s)
    a, b = strip(a), strip(b)
    return bool(a) and bool(b) and (a == b or a.startswith(b) or b.startswith(a))


def parse_recite(hints):
    """学习提示里的背诵要求。五册里出现过的写法：
         背诵课文。            背诵《短歌行》。
         背诵《梦游天姥吟留别》和《登高》。      背诵《阿房宫赋》《六国论》全篇。
         背诵课文《劝学》全篇和《师说》的第1段。  背诵《离骚》（节选）第3段。
         背诵课文第3段。
    只认学习提示框里的句子——《祝福》正文里也有「都能背诵」，那不算。"""
    text = "".join(hints)
    if not RECITE.search(text):
        return None, ""
    said = "".join(s for s in re.split(r"(?<=。)", text) if RECITE.search(s)).strip()

    # 把「背诵」开头那一句单独拿出来，免得把后面「拓展阅读《季氏将伐颛臾》」也算进来
    m = re.search(r"背诵[^。]*。", said)
    clause = m.group(0) if m else said

    out = {}
    for m in re.finditer(r"《([^》]+)》(?:（节选）)?\s*(全篇)?(?:的)?\s*(第\s*\d+\s*段)?", clause):
        name, _, seg = m.groups()
        s = SEG.search(seg or "")
        out[name] = ("第%s段" % s.group(1)) if s else "全篇"
    if not out:
        s = SEG.search(clause)
        out["课文"] = ("第%s段" % s.group(1)) if s else "全篇"
    return out, clause


def split_gap(lines):
    """行里那个 ¶ 是版面留的白（词的上下阕之间），就地断成两行两段。"""
    out = []
    for l in lines:
        if "¶" not in l["text"]:
            out.append(l)
            continue
        parts = l["text"].split("¶")
        for i, part in enumerate(parts):
            if not part.strip():
                continue
            out.append(dict(l, text=part, gapBefore=i > 0))
    return out


def justified(lines):
    """这一篇是不是像散文一样两端对齐排的。

    《离骚（节选）》《琵琶行》《孔雀东南飞》这些连排的长篇虽然归在「诗」里，
    版面跟散文一模一样：连排、两端对齐、段首缩进两格。分段就全在缩进上，
    按行距根本看不出来——《离骚》不这么判会并成一整段，课本要求的
    「背诵第3段」就没有着落。

    认它要看右边，不能看左边：《沁园春》整块左对齐、右边参差，左边一样齐，
    右边只有 8% 的行顶到头；《离骚》有 77%。行长整齐的律诗两边都齐，
    但那样每行缩进都是 0，走哪条路结果一样，不会判错。"""
    xs = [l for l in lines]
    if len(xs) < 4:
        return False
    hit = tot = 0
    for pno in {l["page"] for l in xs}:
        w = [l["x1"] for l in xs if l["page"] == pno]
        edge = max(w)
        hit += sum(1 for v in w if edge - v < 8)
        tot += len(w)
    return hit >= tot * 0.5


def lead_of(lines):
    """这一篇的行距：取全篇的中位数。

    不能一段一段地算——《声声慢》下阕才四行，其中两行因为带角标量出来只有
    15 点，中位数被压到 15，正常的 21 点行距反倒成了「留白」，
    「梧桐更／兼细雨」就在词中间劈开了。"""
    gaps = [b["y0"] - a["y0"] for a, b in zip(lines, lines[1:])
            if b["page"] == a["page"] and b["y0"] > a["y0"]]
    return sorted(gaps)[len(gaps) // 2] if gaps else 21.0


def regap(paras, lead):
    """齐头排的诗，除了缩进，课本也可能只留一道白就分段（《琵琶行》的小序
    跟正文之间）。缩进那一路走完，再按行距补一刀。"""
    out = []
    for para in paras:
        cur = []
        for i, l in enumerate(para):
            if cur and (l.get("gapBefore") or (l["page"] == para[i - 1]["page"]
                        and l["y0"] - para[i - 1]["y0"] > lead * 1.5)):
                out.append(cur)
                cur = []
            cur.append(l)
        if cur:
            out.append(cur)
    return out


def paragraphs(lines, genre):
    """还原分段。齐头排的靠首行缩进，居中排的诗靠行距跳变
    （词的上下阕之间书上会空一行）。"""
    if not lines:
        return []
    lines = split_gap(lines)
    paras, cur = [], []

    if genre == "文" or justified(lines):
        # 版心随单双页左右挪，一篇里各页的左边界并不一样，所以基准线要
        # 一页一算。段首是正正好好缩进两格；缩得更多的是在绕开插图，
        # 那还是同一段里的行。
        # 哪些横坐标是「段首缩进」。不取一条基准线，取一组：一页上可能有
        # 两种版心——《论语》十二章那页右边嵌着插图，前十二行缩在里面排，
        # 最后两行才用整行的宽度，两套左边沿差着八十多点。只认一条线的话，
        # 「子曰：“譬如为山」这一段就接到上一段尾巴上，十二章成了十一章。
        # 判据是成对出现：某个起笔正好比另一个起笔靠右两格，它就是段首。
        starts = {}
        for l in lines:
            starts.setdefault(l["page"], []).append(l["x0"])
        for pno, xs in starts.items():
            lv = sorted({round(v, 1) for v in xs})
            # 缩进量不总是整两格：行首是个引号的话，课本排得窄一点，
            # 《侍坐》的「“赤！尔何如？”」只缩十八点。放宽到十四至二十八点。
            heads = [v for v in lv if any(14 < v - w < 28 for w in lv)]
            if not heads:      # 整页都是续行或者都是段首，退回老办法
                common = [v for v in set(xs)
                          if sum(1 for w in xs if abs(w - v) < 1.5) >= 2]
                heads = [(min(common) if common else min(xs)) + 24]
            starts[pno] = heads
        edge = {}
        for l in lines:
            edge.setdefault(l["page"], []).append(l["x1"])
        for pno, xs in edge.items():
            edge[pno] = max(xs)
        for l in lines:
            if l.get("gapBefore") and cur:
                paras.append(cur)
                cur = []
            # 段首缩进两格，可上一行必须是段末（排不满的短行）。
            # 排得满满当当的一行后面不会接段首——那多半是这一行的头一个字
            # 是画上去的（《庖丁解牛》的「軱」），让整行看着像缩进了。
            head = any(abs(l["x0"] - v) < 4 for v in starts[l["page"]])
            ended = cur and cur[-1]["x1"] < edge[cur[-1]["page"]] - 14
            if cur and head and ended:
                paras.append(cur)
                cur = []
            cur.append(l)
        if genre != "文":
            paras, cur = regap(paras + ([cur] if cur else []),
                               lead_of(lines)), []
    else:
        lead = lead_of(lines)
        for i, l in enumerate(lines):
            if cur and (l.get("gapBefore") or (l["page"] == lines[i - 1]["page"]
                        and l["y0"] - lines[i - 1]["y0"] > lead * 1.5)):
                paras.append(cur)
                cur = []
            cur.append(l)
    if cur:
        paras.append(cur)
    return paras


def ragged(paras):
    """行首、行尾掉字是查不出来的——空洞检测只看得见两个字中间的缝。
    可是整齐排下来的正文，每行起止都在同一条线上，缺一个字就会缩进
    或者短一截。这里把对不齐的行挑出来，交给人工看一眼。
    （《燕歌行》正文的「摐」、《离骚》的「纕」都是这么露出来的。）"""
    rows = [l for para in paras for l in para]
    if len(rows) < 4:
        return []
    def mode(vals):
        best, n = None, 0
        for v in vals:
            c = sum(1 for w in vals if abs(w - v) < 1.2)
            if c > n:
                best, n = v, c
        return best, n
    left, nl = mode([l["x0"] for l in rows])
    right, nr = mode([l["x1"] for l in rows])
    out = []
    for para in paras:
        for i, l in enumerate(para):
            w = 12.0
            if nl >= 3 and 0.6 * w < l["x0"] - left < 1.6 * w:
                out.append((l, "行首像是少了一个字"))
            if nr >= 3 and i < len(para) - 1 and 0.6 * w < right - l["x1"] < 1.6 * w:
                out.append((l, "行尾像是少了一个字"))
    return out


def run(book):
    data = json.load(open(os.path.join(RAW, book + ".json"), encoding="utf-8"))
    pages = {p["page"]: p for p in data["pages"]}
    picked = [p for p in load_pieces() if p["book"] == book]
    if not picked:
        return 0

    # 全书的锚点，按先后排好——每篇的地盘就是从自己的锚点到下一个锚点。
    # 除了篇名，栏目名（「单元学习任务」「古诗词诵读」）也是边界：
    # 课文后面常常直接接着练习和写作指导，中间并没有新的篇名，
    # 不拦一道，整页练习题就会当成正文收进来。
    flat = []
    for pno in sorted(pages):
        marked = [dict(a, page=pno, kind="title") for a in anchors_of(pages[pno])]
        for line in pages[pno].get("banners_pos", []):
            name = bare(line["text"]).strip()
            if name and not name.isdigit():
                marked.append({"y0": line["y0"], "text": name, "mark": None,
                               "page": pno, "kind": "break"})
        flat += sorted(marked, key=lambda a: a["y0"])

    # 学习提示框常常一框管着好几篇，而且印在这一组课文的末尾。
    # 所以要反过来找：提示里点了名的，按名字认领；只说「背诵课文」的，
    # 归紧挨在它前面的那一篇。
    blocks = []
    for pno in sorted(pages):
        if pages[pno]["hints"]:
            want, clause = parse_recite(pages[pno]["hints"])
            blocks.append({"page": pno, "hints": pages[pno]["hints"],
                           "want": want, "clause": clause})

    def recite_for(piece, first, last):
        # 只认本篇跟前的提示框。《哈姆莱特》的导读里也有一句「最好能背诵」，
        # 不设范围的话，它会顺着「课文」二字认领到三十页开外的《鸿门宴》头上。
        for blk in blocks:
            if not blk["want"] or not (first <= blk["page"] <= last + 8):
                continue
            for name, how in blk["want"].items():
                if name == "课文":
                    owner = [p for p in picked if p["page"] <= blk["page"]]
                    if owner and owner[-1] is piece:
                        return how, blk["clause"]
                elif samename(name, piece["title"]):
                    return how, blk["clause"]
        return None, ""

    def hints_for(first, last):
        near = [b for b in blocks if b["page"] >= first]
        return (near[0]["hints"] if near and near[0]["page"] <= last + 4 else [])

    os.makedirs(OUT, exist_ok=True)
    made = 0
    for piece in picked:
        here = [i for i, a in enumerate(flat)
                if a["page"] == piece["page"] and a["kind"] == "title"
                and (a["text"] in piece["title"] or piece["title"] in a["text"]
                     or piece["title"].startswith(a["text"]))]
        if not here:
            here = [i for i, a in enumerate(flat)
                    if a["page"] == piece["page"] and a["kind"] == "title"]
        if not here:
            print("  !! %s p%d 找不到篇名锚点" % (piece["title"], piece["page"]))
            continue
        i = here[0]
        start, stop = flat[i], (flat[i + 1] if i + 1 < len(flat) else None)
        last = (stop["page"] if stop else max(pages))

        body, notes, holes, caps, ownmap = [], [], [], [], []
        for pno in range(start["page"], last + 1):
            page = pages[pno]
            nbody = page["marks_in_body"]

            def mine(y0):
                if pno == start["page"] and y0 < start["y0"]:
                    return False
                if stop and pno == stop["page"] and y0 >= stop["y0"]:
                    return False
                return True

            keep = [l for l in page["body"] if mine(l["y0"])]
            body += [dict(l, page=pno) for l in keep]

            # 正文一侧的角标按位置认领——篇名、「并序」、正文上挂的都算，
            # 「选自……」那一条就是挂在篇名上的。一页上并排两篇时，
            # 按篇名的高度切开，谁也不会拿到隔壁的注释。
            # 角标是上标，比它所在那行的顶还高一点，量一个宽限免得篇名
            # 自己那个角标被划到上一篇去。
            own = {m["n"] for m in page["marks"]
                   if m["group"] != "note" and m["n"] <= nbody
                   and mine(m["y0"] + 8)}
            ownmap.append((pno, sorted(own)))

            # 注释和正文角标按出现次序一一对应：本页第 k 条注释配第 k 个角标。
            # 不能拿角标编号去减——《孔雀东南飞》头一条注释印的是普通的「①」，
            # 不在角标之列，用编号一减，整篇注释就全错开一位。
            for k, n in enumerate(split_notes(page["notes"]), 1):
                if k in own:
                    notes.append(dict(n, page=pno, ref=k))

            caps += page["captions"]
            holes += [dict(h, page=pno) for h in page["holes"] if mine(h["y"])]

        hints = hints_for(start["page"], last)
        recite, clause = recite_for(piece, start["page"], last)
        paras = paragraphs(body, piece["genre"])

        # 整篇重新编号，人工校对时正文和注释一眼对得上。
        # 编号取自每页属于本篇的那段角标区间，篇名上挂的角标（「选自……」
        # 那一条）也在里头，所以注释不会凭空多出一条来。
        seq, renum = {}, []
        for pno, ks in ownmap:
            for k in ks:
                seq[(pno, k)] = len(seq) + 1
        for n in notes:
            renum.append((seq.get((n["page"], n["ref"])), n))

        def fix(line):
            return MARK.sub(lambda m: "⟦%s⟧" % seq.get((line["page"], int(m.group(1))), "?"),
                            line["text"])

        out = ["# %s | %s | %s" % (piece["title"], piece["author"], piece["genre"]), ""]
        out.append("页码 p%d–p%d" % (start["page"], last))
        if recite is None:
            out.append("背诵 否（学习提示里没有点到这一篇）")
        else:
            out.append("背诵 " + recite)
            out.append("提示原话 " + clause)
        out += ["", "## 正文"]
        for para in paras:
            out.append("")
            out += [fix(l) for l in para]
        out += ["", "## 注释"]
        for k, n in sorted(renum, key=lambda kv: (kv[0] is None, kv[0])):
            out.append("%s\t%s" % (k, n["text"]))
        out += ["", "## 学习提示"] + hints
        if caps:
            out += ["", "## 插图说明（不入库）"] + caps
        if holes:
            out += ["", "## 缺字待补（PDF 文本层里没有这个字，书上多半是贴的造字）"]
            out += ["p%d [%s] …%s □ %s…" % (h["page"], h["group"], h["after"], h["before"])
                    for h in holes]
        odd = ragged(paras)
        if odd:
            out += ["", "## 对不齐的行（多半是掉了字，人工看一眼）"]
            out += ["p%d  %s　%s" % (l["page"], why, l["text"][:40]) for l, why in odd]
        out += ["", "## 体检",
                "正文角标 %d 个，注释 %d 条%s" % (
                    len(seq), len(notes),
                    "" if len(seq) == len(notes) else "　← 对不上，要查")]

        name = "%s-p%03d-%s.md" % (book, piece["page"], piece["title"].replace("/", "／"))
        with open(os.path.join(OUT, name), "w", encoding="utf-8") as f:
            f.write("\n".join(out) + "\n")
        made += 1
    return made


def main():
    for b in (sys.argv[1:] or BOOKS):
        print("%s  %d 篇" % (b, run(b)))


if __name__ == "__main__":
    main()
