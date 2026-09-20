# 页面结构：程序是怎么编写的

> **这份文档记「现状」**——页面现在怎么组织的、关键函数干什么。改了直接改这份。
> 想知道某个功能是哪一轮加的、为什么，去 `LOG.md` 查。

`index.html` 是一个**单文件、零依赖、纯前端**的应用：一个 HTML + 内联 CSS + 内联 JS，
不用任何框架、不打包、不联网。双击就能跑，断网也行。数据从同目录的 `data.js`、
`user.js` 两个 `<script>` 读进来（手机上读不到同目录文件时，用 `merge.py` 内联成单文件）。

设计上和数据完全解耦：**页面只认 `data.js` 的文本格式，不知道 PDF 的存在**。
出题、挖空、记错题、导入导出都在这一边；一切和课本版面有关的判断在 `tools/` 那一边。
格式约定见 `data_structure.md`。

---

## 一、启动流程

```
读 window.DATA / window.USER
      ↓
parseCorpus(DATA.corpus)  →  LIB：解析好的篇目数组
parseRows(...)            →  NOTES / WORDS / COMP / GLOSS
      ↓
buildChips()   渲染篇目浮层
buildQueue()   按当前模式和筛选，生成这一轮的题目队列 queue
render()       画当前这一题
```

全局状态就几个变量：

| 变量 | 是什么 |
|---|---|
| `type` | 当前模式：`sentence`/`char`/`note`/`comp`/`word`/`read` |
| `chosen` | 选中的篇目下标集合 |
| `queue` / `pos` | 题目队列和当前位置 |
| `shown` | 当前题是否已翻答案 |
| `marks` / `wrongCount` / `weak` | 用户数据（见下） |
| `readBare` | 看原文时是否只看白文 |

---

## 二、六种模式

页面顶部六个按钮（`data-t` 属性），切换 `type`：

| 模式 | `type` | 干什么 |
|---|---|---|
| 句子默写 | `sentence` | 挖掉句子里的小句，画横线。看答案时连整段原文一起显示，本句标红 |
| 难字默写 | `char` | 只挖被标为难字的单个字。范围自动限定在含难字的句子 |
| 注释 | `note` | 给例句，其中一个词带角标，问这个词作什么讲 |
| 理解性默写 | `comp` | 给提示语填句子（板块待补） |
| 词语 | `word` | 看拼音写词语（只挖难字）/ 看词写拼音，都带例句情景和释义 |
| 看原文 | `read` | 仿课本版式整篇排下来，可开关注释 |

前五种是「一题一题过」的模式，走 `queue` + `render` 那套；`read` 是整页渲染，
`render()` 里单独分支（`renderReading()`）。

---

## 三、解析层（把文本变成对象）

- **`parseCorpus(raw)`**　把 `corpus` 文本切成篇目数组 `LIB`。每篇：`title/author/type`
  （`verse`/`prose`）、`recite`（是否要背）、`reciteSegs`（只背第几段）、`paras`（段落）、
  `questions`（题目）、`book`（册）。`// 册 X` 行切换册。
- **`segment(line)`**　把一行按逗号分号切成「小句」单元 `{body, punct}`，
  句末引号回补到上一句。这是挖空的最小单位。
- **`buildQuestions(type, lines)`**　把一段切成题：`verse` 一行一题；`prose` 按句号切、
  不足 `MIN_CHARS`（10）个 CJK 字的并进下一题。没有汉字的行（比如「……」）不成题。
- **`parseRows(raw, n)`**　通用的竖线分隔行解析，`notes/words/comp/gloss` 都用它。
- **`addHardList` / `stripMarks`**　难字：`stripMarks` 把正文里 `{}` 圈的字脱去括号并
  记进 `hardSet`；`addHardList` 解析难字表里的 `衿(jīn)` 格式，音存进 `PINYIN`。

---

## 四、出题与渲染

- **`buildQueue()`**　按 `type`、选中的篇目、筛选条件（不筛/只含难字/只练标记/只练错过）
  生成 `queue`。顺序可打乱，题量可抽 10/20/30/50。
- **`pickBlanks(n, density)`**　决定一题挖哪几处：每题一处 / 挖一半 / 尽量多挖，单题最多 6 处。
- **`render()`**　总分发。一题一题的模式画一张卡片，`read` 模式画整页。
- 各模式的渲染：`renderSentence`（句子，含可点的标红空位）、`renderChar`（难字）、
  `renderExample`（注释例句）、`renderReading`（看原文整页）、`glossFor`（答错弹的译文）。
- 词语模式另有三个零件：`hardIn`（这个词里哪几个字算难写——就挖那几个，一个难字
  都没有的整词都挖）、`renderWordBlank`（按这个范围画方框）、`renderWordEx`（例句，
  三种模式见下）。

### 词语模式的三处防漏

例句是给情景用的，但它本身就含着答案，三个地方都漏过：

| 漏在哪 | 怎么堵 |
|---|---|
| 「写」题的例句里明摆着那个词 | 按和答案同样的范围遮字（`renderWordEx` 的 `hide` 档） |
| 「读」题的例句走 `renderHard`，难字表带着拼音，一渲染就把要问的读音给了 | 未翻答案时光秃秃地显示（`bare` 档） |
| **出处里也有答案**——「青蒿」的例句出自《青蒿素：人类征服疾病的一小步》 | 遮字时连出处一起收起来，翻答案再给 |

出处的写法在 `fmtFrom`：篇名加书名号，册名写「课本 必修上」，自拟的写「自拟例句」，
成语书证本来就带书名号、原样照抄。

---

## 五、批改与错题

- **`reveal()`**　翻答案（空格键）。
- **`grade(ok)`**　记「我记得 / 我不记得」（1 / 2 键）。答错记进 `wrongCount`。
- **挑出记不住的那几处**　答案里标红的空位可点，点成「不会」记进 `weak`；一处不点
  = 整句都不会（不留 `weak` 记录）。以后「只练错过的」时**只挖挑过的那几处**。
- **`complement()`**　互补默写：把这一轮挖过的地方变成提示、原来的提示挖成空。
- **`retryWrong()`**　只练错过的。

---

## 六、用户数据

三份数据，结构见 `data_structure.md` 第四节。要点：

- **按句子内容存 key**（`itemKey` / `keyOf`），不按题号——往 `data.js` 中间插内容不会错位。
- 平时存浏览器 `localStorage`（`store` 对象，读写都包了 try/catch，隐私模式也不崩）；
  `user.js` 是存档点，靠「我的数据 → 下载 user.js」导出、替换。网页无权写本地文件。

---

## 七、界面上的两块浮层

- **篇目浮层**（`buildChips`）　按册分五组、一行一复选框，行末标背诵要求。能搜、能整册全选、
  能「只要背诵的」。用 `.overlay[hidden]{display:none}` 控制显隐——注意 `.overlay{display:flex}`
  会盖掉 HTML 的 `hidden` 属性，必须单写这条覆盖。
- **我的数据**（`fillMyList` / `fillBox`）　列出标记题和错题，可逐条移出、可「只练这些」，
  可下载/导入 `user.js`、可清空。

---

## 八、样式约定

CSS 全内联，配色用 CSS 变量（宣纸底、朱砂红一类），一套值。移动端和桌面端同一套布局，
手机 390px 宽下测过。字体走系统衬线/无衬线，不外链、不联网。
