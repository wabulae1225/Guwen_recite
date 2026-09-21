/* ============================================================
   数学速算引擎 engine.js

   和语文那边最大的不同：这里没有题库。题目是现场生成的，
   每个「细类」就是一个 gen() 函数，调一次出一道题。

   gen() 返回 { q, a, note }
     q    题面（可含简单 HTML）
     a    答案（可含简单 HTML）
     note 可选，答案下面的一行提示/解析，没有就不给

   页面（index.html）只认这个结构，不关心题目怎么造出来的。
   加一个细类 = 在对应大类的 subs 里加一条，别的地方不用动。

   本轮实现了「数字计算」「三角计算」两个大类，
   其余八类先占位（subs 为空，页面会标成「待建」）。
   ============================================================ */

(function(){
"use strict";

/* ---------- 小工具 ---------- */

/* 随机整数，闭区间 [a,b] */
function ri(a, b){ return a + Math.floor(Math.random() * (b - a + 1)); }

/* 从数组里随机挑一个 */
function pick(arr){ return arr[Math.floor(Math.random() * arr.length)]; }

/* 随机正负号 */
function sign(){ return Math.random() < 0.5 ? -1 : 1; }

function gcd(a, b){
  a = Math.abs(a); b = Math.abs(b);
  while(b){ const t = b; b = a % b; a = t; }
  return a;
}

/* 约分后的分数，写成 "3/4"；分母为 1 时只写分子 */
function frac(n, d){
  if(d < 0){ n = -n; d = -d; }
  const g = gcd(n, d) || 1;
  n /= g; d /= g;
  return d === 1 ? String(n) : n + "/" + d;
}

/* 把 √k 化到最简：√72 → {out:6, in:2}，即 6√2 */
function simpRoot(k){
  let out = 1, inn = k;
  for(let i = Math.floor(Math.sqrt(inn)); i >= 2; i--){
    if(inn % (i*i) === 0){ out *= i; inn /= i*i; i = Math.floor(Math.sqrt(inn)) + 1; }
  }
  return { out: out, in: inn };
}

/* 把 {out,in} 写成 "6√2"、"√2"、"6"（in 为 1 时没有根号） */
function rootStr(r){
  if(r.in === 1) return String(r.out);
  return (r.out === 1 ? "" : r.out) + "√" + r.in;
}

/* 带分母的根式：(out√in)/den，自动约分、自动省略 */
function rootFrac(out, inn, den){
  const g = gcd(out, den) || 1;
  out /= g; den /= g;
  if(inn === 1) return frac(out, den);
  const top = (out === 1 ? "" : out) + "√" + inn;
  return den === 1 ? top : top + "/" + den;
}

/* 负数加括号，用在乘法题面里 */
function par(n){ return n < 0 ? "(" + n + ")" : String(n); }


/* ============================================================
   公式排版零件 F.*

   **不引任何库**（KaTeX、MathJax 都没用），纯 HTML + CSS 拼出来，
   配套样式在 index.html 的 `.fr / .sq / .vc / .ab / .nm` 几条里。

   这一层存在的意义是把「内容」和「怎么画」隔开：
   题库里写的是 F.frac(1, 2)，不是 "1/2" 也不是 "\\frac{1}{2}"。
   **将来要换成 KaTeX，只改下面这几个函数，六十多个细类一个字不用动。**
   ============================================================ */

const F = {
  /* 分数：上下叠放、中间一道横线 */
  frac: (a, b) => '<span class="fr"><span>' + a + '</span><span>' + b + '</span></span>',

  /* 根号：√ 后面的部分加一道上划线。n 给了就是 n 次根 */
  sqrt: (x, n) => (n ? '<sup style="font-size:.6em">' + n + '</sup>' : '')
                + '<span class="sq">√<b>' + x + '</b></span>',

  pow: (a, b) => a + '<sup>' + b + '</sup>',
  sub: (a, b) => a + '<sub>' + b + '</sub>',

  /* 向量：字母上面一个箭头 */
  vec: x => '<span class="vc">' + x + '</span>',

  /* 绝对值 |x| 和模长 ‖x‖，用边框画竖线，比直接打 | 整齐 */
  abs:  x => '<span class="ab"><i>' + x + '</i></span>',
  norm: x => '<span class="nm"><i>' + x + '</i></span>',

  /* 常用组合，省得到处拼 */
  sq:   a => a + '<sup>2</sup>',
  cube: a => a + '<sup>3</sup>',
  /* 二次根式分数，如 √3/2 */
  rootFrac: (inn, den, out) =>
    F.frac((out && out !== 1 ? out : "") + '√' + inn, den)
};


/* ============================================================
   一、数字计算
   ============================================================ */

const NUMBER = [

{ id:"add1000", name:"1000 以内加减法", gen:function(){
    const kind = pick(["add","sub","add3"]);
    if(kind === "add"){
      const a = ri(120, 899), b = ri(120, 999 - a > 100 ? 999 - a : 120);
      return { q: a + " + " + b + " = ?", a: String(a + b) };
    }
    if(kind === "sub"){
      const a = ri(300, 999), b = ri(100, a - 50);
      return { q: a + " − " + b + " = ?", a: String(a - b) };
    }
    const a = ri(100, 400), b = ri(100, 400), c = ri(50, 300);
    return { q: a + " + " + b + " − " + c + " = ?", a: String(a + b - c) };
  }},

{ id:"mixed", name:"加减乘除混合", gen:function(){
    const kind = pick(["md","dm","par"]);
    if(kind === "md"){
      const a = ri(3, 19), b = ri(3, 12), c = ri(10, 99);
      return { q: a + " × " + b + " + " + c + " = ?", a: String(a*b + c),
               note: "先算乘除，后算加减。" };
    }
    if(kind === "dm"){
      const b = ri(3, 15), q0 = ri(3, 20), a = b * q0, c = ri(5, 60);
      return { q: a + " ÷ " + b + " − " + c + " = ?", a: String(q0 - c) };
    }
    const a = ri(5, 30), b = ri(5, 30), c = ri(2, 9);
    return { q: "(" + a + " + " + b + ") × " + c + " = ?", a: String((a+b)*c),
             note: "括号里先算，或者拆成 " + a + "×" + c + " + " + b + "×" + c + "。" };
  }},

{ id:"sq30", name:"平方数 1–30", gen:function(){
    const n = ri(2, 30);
    return { q: n + "² = ?", a: String(n*n) };
  }},

{ id:"mul2d", name:"两位数 × 两位数", gen:function(){
    const a = ri(12, 98), b = ri(12, 98);
    return { q: a + " × " + b + " = ?", a: String(a*b) };
  }},

{ id:"sumprod", name:"多项累加 a×b+c×d", gen:function(){
    const three = Math.random() < 0.45;
    const a = ri(2, 15), b = ri(2, 15), c = ri(2, 15), d = ri(2, 15);
    if(!three) return { q: a+" × "+b+" + "+c+" × "+d+" = ?", a: String(a*b + c*d) };
    const e = ri(2, 12), f = ri(2, 12);
    return { q: a+" × "+b+" + "+c+" × "+d+" + "+e+" × "+f+" = ?",
             a: String(a*b + c*d + e*f),
             note: "向量数量积、期望、行列式里都是这个形状。" };
  }},

{ id:"cube20", name:"立方数 1–20", gen:function(){
    const n = ri(2, 20);
    return { q: n + "³ = ?", a: String(n*n*n) };
  }},

{ id:"powers", name:"2 的幂 / 3 的幂", gen:function(){
    const base = pick([2, 2, 2, 3, 3, 5]);
    const top = base === 2 ? 16 : (base === 3 ? 9 : 6);
    const n = ri(2, top);
    return { q: base + "<sup>" + n + "</sup> = ?", a: String(Math.pow(base, n)) };
  }},

{ id:"fracdec", name:"分数 ↔ 小数互化", gen:function(){
    const table = [
      ["1/2","0.5"], ["1/3","0.333…"], ["2/3","0.666…"], ["1/4","0.25"], ["3/4","0.75"],
      ["1/5","0.2"], ["2/5","0.4"], ["3/5","0.6"], ["4/5","0.8"],
      ["1/6","0.1666…"], ["5/6","0.8333…"],
      ["1/7","0.142857…"], ["2/7","0.285714…"], ["3/7","0.428571…"],
      ["1/8","0.125"], ["3/8","0.375"], ["5/8","0.625"], ["7/8","0.875"],
      ["1/9","0.111…"], ["1/11","0.0909…"], ["1/12","0.08333…"],
      ["1/16","0.0625"], ["3/16","0.1875"], ["1/20","0.05"], ["1/25","0.04"], ["1/32","0.03125"]
    ];
    const row = pick(table);
    if(Math.random() < 0.5)
      return { q: row[0] + " = ?（写成小数）", a: row[1] };
    return { q: row[1] + " = ?（写成最简分数）", a: row[0] };
  }},

{ id:"factor", name:"质因数分解", gen:function(){
    const n = ri(60, 480);
    let m = n, parts = [];
    for(let p = 2; p * p <= m; p++){
      let c = 0;
      while(m % p === 0){ m /= p; c++; }
      if(c) parts.push(c === 1 ? String(p) : p + "<sup>" + c + "</sup>");
    }
    if(m > 1) parts.push(String(m));
    return { q: n + " 分解质因数 = ?", a: parts.join(" × ") };
  }},

{ id:"gcdlcm", name:"最大公约数 / 最小公倍数", gen:function(){
    const a = ri(12, 96), b = ri(12, 96);
    const g = gcd(a, b);
    if(Math.random() < 0.5)
      return { q: "(" + a + ", " + b + ") 的最大公约数 = ?", a: String(g) };
    return { q: "[" + a + ", " + b + "] 的最小公倍数 = ?", a: String(a / g * b),
             note: "a·b ÷ 最大公约数。这里 " + a + "×" + b + " ÷ " + g + "。" };
  }},

{ id:"fact", name:"阶乘 1–10", gen:function(){
    const n = ri(3, 10);
    let v = 1; for(let i = 2; i <= n; i++) v *= i;
    return { q: n + "! = ?", a: String(v) };
  }},

{ id:"rationalize", name:"分母有理化", gen:function(){
    const kind = pick(["mono","bino"]);
    if(kind === "mono"){
      const c = ri(2, 12), k = pick([2,3,5,6,7,10,11,13]);
      /* c/√k = c√k/k，注意约分 */
      const g = gcd(c, k) || 1;
      return { q: c + "/√" + k + " = ?",
               a: rootFrac(c, k, k),
               note: "上下同乘 √" + k + "。" + (g > 1 ? "别忘了约分。" : "") };
    }
    const k = pick([2,3,5,6,7]), b = ri(1, 4);
    /* c/(√k + b) = c(√k − b)/(k − b²) */
    const den = k - b*b;
    if(den === 0) return { q: "2/(√3 + 1) = ?", a: "√3 − 1", note: "上下同乘 √3 − 1。" };
    const c = Math.abs(den);
    const s = den > 0 ? "" : "−";
    return { q: c + "/(√" + k + " + " + b + ") = ?",
             a: s + "(√" + k + " − " + b + ")",
             note: "上下同乘共轭式 √" + k + " − " + b + "，分母变成 " + k + " − " + b + "² = " + den + "。" };
  }},

{ id:"simproot", name:"根式化简", gen:function(){
    const bases = [2,3,5,6,7,10,11,13,15];
    const b = pick(bases), m = ri(2, 7);
    const k = b * m * m;
    const r = simpRoot(k);
    return { q: "√" + k + " = ?（化到最简）", a: rootStr(r),
             note: "把 " + k + " 里的平方因子提出来。" };
  }},

{ id:"trick11", name:"速算 · 乘 11", gen:function(){
    const a = ri(13, 98);
    return { q: a + " × 11 = ?", a: String(a * 11),
             note: "两头拉开、中间填和：" + Math.floor(a/10) + " (" +
                   (Math.floor(a/10) + a%10) + ") " + (a%10) + "，中间超过 9 就进位。" };
  }},

{ id:"trick25", name:"速算 · 乘 25 / 乘 5", gen:function(){
    if(Math.random() < 0.6){
      const n = ri(12, 96);
      return { q: n + " × 25 = ?", a: String(n * 25),
               note: "×25 就是 ×100 ÷ 4：" + n + "00 ÷ 4。" };
    }
    const n = ri(24, 480);
    return { q: n + " × 5 = ?", a: String(n * 5),
             note: "×5 就是 ×10 ÷ 2：" + n + "0 ÷ 2。" };
  }},

{ id:"trickcomp", name:"速算 · 十位同、个位补十", gen:function(){
    const t = ri(1, 9), u = ri(1, 9);
    const a = t*10 + u, b = t*10 + (10 - u);
    return { q: a + " × " + b + " = ?", a: String(a * b),
             note: "十位相同、个位相加得 10：前两位 " + t + "×" + (t+1) + " = " + (t*(t+1)) +
                   "，后两位 " + u + "×" + (10-u) + " = " + String(u*(10-u)).padStart(2,"0") + "。" };
  }},

{ id:"diffsq", name:"速算 · 平方差凑整", gen:function(){
    const base = pick([20,30,40,50,60,70,80,90,100]);
    const d = ri(1, Math.min(9, base/10 + 2));
    return { q: (base - d) + " × " + (base + d) + " = ?",
             a: String(base*base - d*d),
             note: base + "² − " + d + "² = " + (base*base) + " − " + (d*d) + "。" };
  }}

];


/* ============================================================
   二、三角计算

   这一类里「算」和「背」混着：特殊角求值是算，公式默写是背。
   引擎不区分——都是出题、看答案、自评。
   ============================================================ */

/* 特殊角表：弧度写法 → [sin, cos, tan]，tan 为 null 表示不存在 */
const ANGLES = [
  ["0",       "0",      "1",      "0"],
  ["π/6",     "1/2",    "√3/2",   "√3/3"],
  ["π/4",     "√2/2",   "√2/2",   "1"],
  ["π/3",     "√3/2",   "1/2",    "√3"],
  ["π/2",     "1",      "0",      "不存在"],
  ["2π/3",    "√3/2",   "−1/2",   "−√3"],
  ["3π/4",    "√2/2",   "−√2/2",  "−1"],
  ["5π/6",    "1/2",    "−√3/2",  "−√3/3"],
  ["π",       "0",      "−1",     "0"],
  ["7π/6",    "−1/2",   "−√3/2",  "√3/3"],
  ["5π/4",    "−√2/2",  "−√2/2",  "1"],
  ["4π/3",    "−√3/2",  "−1/2",   "√3"],
  ["3π/2",    "−1",     "0",      "不存在"],
  ["5π/3",    "−√3/2",  "1/2",    "−√3"],
  ["7π/4",    "−√2/2",  "√2/2",   "−1"],
  ["11π/6",   "−1/2",   "√3/2",   "−√3/3"]
];

/* 公式默写的通用零件：给一组 [题面, 答案, 提示?]，随机抽一条 */
function formulaGen(list){
  return function(){
    const f = pick(list);
    return { q: f[0], a: f[1], note: f[2] };
  };
}

const TRIG = [

{ id:"special", name:"特殊角三角函数值", gen:function(){
    const row = pick(ANGLES);
    const fn = pick([1, 2, 3]);
    const label = ["", "sin", "cos", "tan"][fn];
    return { q: label + "(" + row[0] + ") = ?", a: row[fn] };
  }},

{ id:"induce", name:"诱导公式", gen: formulaGen([
    ["sin(−α) = ?", "−sinα", "奇变偶不变，符号看象限。"],
    ["cos(−α) = ?", "cosα"],
    ["tan(−α) = ?", "−tanα"],
    ["sin(π − α) = ?", "sinα"],
    ["cos(π − α) = ?", "−cosα"],
    ["tan(π − α) = ?", "−tanα"],
    ["sin(π + α) = ?", "−sinα"],
    ["cos(π + α) = ?", "−cosα"],
    ["tan(π + α) = ?", "tanα"],
    ["sin(2π − α) = ?", "−sinα"],
    ["cos(2π − α) = ?", "cosα"],
    ["sin(π/2 − α) = ?", "cosα", "π/2 是奇数个，函数名要变。"],
    ["cos(π/2 − α) = ?", "sinα"],
    ["tan(π/2 − α) = ?", "cotα（即 1/tanα）"],
    ["sin(π/2 + α) = ?", "cosα"],
    ["cos(π/2 + α) = ?", "−sinα"],
    ["sin(3π/2 − α) = ?", "−cosα"],
    ["cos(3π/2 − α) = ?", "−sinα"],
    ["sin(3π/2 + α) = ?", "−cosα"],
    ["cos(3π/2 + α) = ?", "sinα"]
  ])},

{ id:"sumdiff", name:"和差角公式", gen: formulaGen([
    ["sin(α + β) = ?", "sinα·cosβ + cosα·sinβ"],
    ["sin(α − β) = ?", "sinα·cosβ − cosα·sinβ"],
    ["cos(α + β) = ?", "cosα·cosβ − sinα·sinβ", "余弦的符号和前面是反的。"],
    ["cos(α − β) = ?", "cosα·cosβ + sinα·sinβ"],
    ["tan(α + β) = ?", "(tanα + tanβ) / (1 − tanα·tanβ)"],
    ["tan(α − β) = ?", "(tanα − tanβ) / (1 + tanα·tanβ)"]
  ])},

{ id:"double", name:"二倍角公式", gen: formulaGen([
    ["sin2α = ?", "2sinα·cosα"],
    ["cos2α = ?（三种写法都写出来）",
     "cos²α − sin²α ＝ 2cos²α − 1 ＝ 1 − 2sin²α",
     "三个形式都要能随手写出来，选哪个看题目给了什么。"],
    ["tan2α = ?", "2tanα / (1 − tan²α)"],
    ["1 + cos2α = ?", "2cos²α", "升幂公式，降幂公式反着用。"],
    ["1 − cos2α = ?", "2sin²α"]
  ])},

{ id:"triple", name:"三倍角公式", gen: formulaGen([
    ["sin3α = ?", "3sinα − 4sin³α", "口诀：三生本人，四生本人立方（减）。"],
    ["cos3α = ?", "4cos³α − 3cosα", "口诀：四生本人立方，三生本人（减）。"],
    ["tan3α = ?", "(3tanα − tan³α) / (1 − 3tan²α)"]
  ])},

{ id:"power", name:"降幂 / 升幂公式", gen: formulaGen([
    ["sin²α = ?（降幂）", "(1 − cos2α) / 2"],
    ["cos²α = ?（降幂）", "(1 + cos2α) / 2"],
    ["tan²α = ?（降幂）", "(1 − cos2α) / (1 + cos2α)"],
    ["sinα·cosα = ?", "½·sin2α"],
    ["sin⁴α + cos⁴α = ?", "1 − ½·sin²2α", "二级结论：由 (sin²+cos²)² 展开得来。"]
  ])},

{ id:"prod2sum", name:"积化和差", gen: formulaGen([
    ["sinα·cosβ = ?", "½[ sin(α+β) + sin(α−β) ]"],
    ["cosα·sinβ = ?", "½[ sin(α+β) − sin(α−β) ]"],
    ["cosα·cosβ = ?", "½[ cos(α+β) + cos(α−β) ]"],
    ["sinα·sinβ = ?", "−½[ cos(α+β) − cos(α−β) ]", "注意最前面那个负号。"]
  ])},

{ id:"sum2prod", name:"和差化积", gen: formulaGen([
    ["sinα + sinβ = ?", "2·sin((α+β)/2)·cos((α−β)/2)"],
    ["sinα − sinβ = ?", "2·cos((α+β)/2)·sin((α−β)/2)"],
    ["cosα + cosβ = ?", "2·cos((α+β)/2)·cos((α−β)/2)"],
    ["cosα − cosβ = ?", "−2·sin((α+β)/2)·sin((α−β)/2)", "注意负号。"]
  ])},

{ id:"universal", name:"万能公式", gen: formulaGen([
    ["设 t = tan(α/2)，sinα = ?", "2t / (1 + t²)"],
    ["设 t = tan(α/2)，cosα = ?", "(1 − t²) / (1 + t²)"],
    ["设 t = tan(α/2)，tanα = ?", "2t / (1 − t²)"]
  ])},

{ id:"aux", name:"辅助角公式", gen:function(){
    const cases = [
      ["sinx + √3·cosx", "2·sin(x + π/3)"],
      ["√3·sinx + cosx", "2·sin(x + π/6)"],
      ["sinx + cosx", "√2·sin(x + π/4)"],
      ["sinx − cosx", "√2·sin(x − π/4)"],
      ["√3·sinx − cosx", "2·sin(x − π/6)"],
      ["cosx − √3·sinx", "2·cos(x + π/3)"],
      ["3·sinx + 4·cosx", "5·sin(x + φ)，其中 tanφ = 4/3"]
    ];
    const c = pick(cases);
    if(Math.random() < 0.3)
      return { q: "a·sinα + b·cosα 化成一个三角函数，一般形式 = ?",
               a: "√(a² + b²) · sin(α + φ)，其中 tanφ = b/a",
               note: "振幅是 √(a²+b²)，这是求最值的关键。" };
    return { q: c[0] + " = ?（化成一个三角函数）", a: c[1],
             note: "振幅 √(a²+b²)，最大值就是它。" };
  }},

{ id:"laws", name:"正弦定理 / 余弦定理", gen: formulaGen([
    ["正弦定理（带外接圆半径 R）", "a/sinA ＝ b/sinB ＝ c/sinC ＝ 2R"],
    ["余弦定理，求 a²", "a² = b² + c² − 2bc·cosA"],
    ["余弦定理变形，求 cosA", "cosA = (b² + c² − a²) / (2bc)"],
    ["三角形面积（两边一夹角）", "S = ½·bc·sinA"],
    ["三角形面积（海伦公式）", "S = √[ p(p−a)(p−b)(p−c) ]，p = (a+b+c)/2"],
    ["三角形内角和的推论：tanA + tanB + tanC = ?", "tanA·tanB·tanC",
     "二级结论，A+B+C=π 时成立。"]
  ])},

{ id:"arc", name:"反三角函数值", gen:function(){
    const table = [
      ["arcsin(1/2)", "π/6"], ["arcsin(√2/2)", "π/4"], ["arcsin(√3/2)", "π/3"],
      ["arcsin(1)", "π/2"], ["arcsin(0)", "0"], ["arcsin(−1/2)", "−π/6"],
      ["arccos(1/2)", "π/3"], ["arccos(√2/2)", "π/4"], ["arccos(√3/2)", "π/6"],
      ["arccos(0)", "π/2"], ["arccos(1)", "0"], ["arccos(−1/2)", "2π/3"],
      ["arctan(1)", "π/4"], ["arctan(√3)", "π/3"], ["arctan(√3/3)", "π/6"],
      ["arctan(0)", "0"], ["arctan(−1)", "−π/4"]
    ];
    const row = pick(table);
    return { q: row[0] + " = ?", a: row[1],
             note: "arcsin、arctan 的值域是 [−π/2, π/2]；arccos 是 [0, π]。" };
  }}

];



/* ============================================================
   三、向量计算
   ============================================================ */

const VECTOR = [

{ id:"vadd", name:"坐标加减与数乘", gen:function(){
    const x1=ri(-7,7), y1=ri(-7,7), x2=ri(-7,7), y2=ri(-7,7), k=ri(2,4);
    const minus = Math.random() < 0.5;
    return { q: "a = ("+x1+", "+y1+")，b = ("+x2+", "+y2+")<br>"
              + k+"a " + (minus?"−":"+") + " b = ?",
             a: "(" + (minus? k*x1-x2 : k*x1+x2) + ", "
                    + (minus? k*y1-y2 : k*y1+y2) + ")" };
  }},

{ id:"vdot", name:"数量积（坐标式）", gen:function(){
    const x1=ri(-8,8), y1=ri(-8,8), x2=ri(-8,8), y2=ri(-8,8);
    return { q: "a = ("+x1+", "+y1+")，b = ("+x2+", "+y2+")<br>a · b = ?",
             a: String(x1*x2 + y1*y2),
             note: "a · b = x₁x₂ + y₁y₂" };
  }},

{ id:"vnorm", name:"模长", gen:function(){
    const x=ri(-9,9), y=ri(-9,9);
    const r=simpRoot(x*x+y*y);
    return { q: "a = ("+x+", "+y+")，" + F.norm("a") + " = ?",
             a: rootStr(r),
             note: F.norm("a") + " = " + F.sqrt("x² + y²") + "，这里是 " + F.sqrt(x*x+y*y) + "。" };
  }},

{ id:"vjudge", name:"平行 / 垂直判定", gen:function(){
    const x1=ri(1,6), y1=ri(1,6), k=ri(2,4);
    if(Math.random() < 0.5){
      return { q: "a = ("+x1+", "+y1+")，b = ("+(k*x1)+", "+(k*y1)+")<br>a 与 b 是什么关系？",
               a: "平行（b = " + k + "a）",
               note: "a ∥ b ⟺ x₁y₂ − x₂y₁ = 0" };
    }
    return { q: "a = ("+x1+", "+y1+")，b = ("+(-k*y1)+", "+(k*x1)+")<br>a 与 b 是什么关系？",
             a: "垂直（a · b = 0）",
             note: "a ⊥ b ⟺ x₁x₂ + y₁y₂ = 0" };
  }},

{ id:"vangle", name:"夹角余弦", gen:function(){
    const rows = [
      ["(1, 1)",  "(1, 0)",  F.rootFrac(2,2), "45°"],
      ["(1, √3)", "(1, 0)",  F.frac(1,2),     "60°"],
      ["(√3, 1)", "(1, 0)",  F.rootFrac(3,2), "30°"],
      ["(1, 1)",  "(−1, 1)", "0",             "90°"],
      ["(1, 0)",  "(−1, 1)", "−" + F.rootFrac(2,2), "135°"],
      ["(2, 0)",  "(−1, −√3)", "−" + F.frac(1,2),   "120°"]
    ];
    const r = pick(rows);
    return { q: "a = "+r[0]+"，b = "+r[1]+"<br>cos⟨a, b⟩ = ?",
             a: r[2] + "　（夹角 " + r[3] + "）",
             note: "cos⟨a, b⟩ = " + F.frac("a · b", F.norm("a") + "·" + F.norm("b")) };
  }},

{ id:"vproj", name:"投影", gen: formulaGen([
    ["a 在 b 方向上的投影（数量投影）= ?",
     F.frac("a · b", F.norm("b")),
     "也等于 " + F.norm("a") + "·cos⟨a, b⟩。"],
    ["a 在 b 方向上的投影向量 = ?",
     F.frac("a · b", F.norm("b") + "²") + " · b"],
    [F.norm("a") + "² 用数量积怎么写？", "a · a"]
  ])},

{ id:"vline", name:"三点共线 / 基本定理", gen: formulaGen([
    ["A、B、C 三点共线的向量条件", F.vec("AB") + " = λ" + F.vec("AC") + "（λ ∈ ℝ）"],
    ["O 为平面内任一点，A、B、P 共线 ⟺ " + F.vec("OP") + " = x" + F.vec("OA") + " + y" + F.vec("OB") + "，其中",
     "x + y = 1", "这是三点共线的「系数和为 1」判据，很好用。"],
    ["平面向量基本定理", "不共线的 e₁、e₂ 可作基底，平面内任一向量唯一表示成 a = λ₁e₁ + λ₂e₂"],
    ["中点公式：M 是 AB 中点，则 " + F.vec("OM") + " = ?",
     F.frac(1,2) + "(" + F.vec("OA") + " + " + F.vec("OB") + ")"]
  ])}

];


/* ============================================================
   四、立体与平面几何（综合几何，不含圆锥曲线）
   ============================================================ */

const GEOMETRY = [

{ id:"ball", name:"球的表面积与体积", gen:function(){
    const R = ri(2, 9);
    if(Math.random() < 0.5)
      return { q: "半径 R = "+R+" 的球，表面积 S = ?", a: (4*R*R) + "π",
               note: "S = 4πR²" };
    return { q: "半径 R = "+R+" 的球，体积 V = ?",
             a: F.frac(4*R*R*R, 3) + "π",
             note: "V = " + F.frac(4,3) + "πR³" };
  }},

{ id:"cylcone", name:"柱体与锥体的体积", gen:function(){
    const r = ri(2, 7), h = ri(2, 9);
    if(Math.random() < 0.5)
      return { q: "底面半径 "+r+"、高 "+h+" 的圆柱，体积 V = ?",
               a: (r*r*h) + "π", note: "V = πr²h" };
    return { q: "底面半径 "+r+"、高 "+h+" 的圆锥，体积 V = ?",
             a: F.frac(r*r*h, 3) + "π", note: "V = " + F.frac(1,3) + "πr²h" };
  }},

{ id:"coneside", name:"圆锥的母线与侧面积", gen:function(){
    const pairs = [[3,4,5],[6,8,10],[5,12,13],[8,15,17],[9,12,15]];
    const p = pick(pairs);
    if(Math.random() < 0.5)
      return { q: "圆锥底面半径 "+p[0]+"、高 "+p[1]+"，母线 l = ?",
               a: String(p[2]), note: "l = " + F.sqrt("r² + h²") };
    return { q: "圆锥底面半径 "+p[0]+"、母线 "+p[2]+"，侧面积 S = ?",
             a: (p[0]*p[2]) + "π", note: "S侧 = πrl" };
  }},

{ id:"frustum", name:"台体体积", gen: formulaGen([
    ["台体体积公式", F.frac(1,3) + "h(S₁ + S₂ + " + F.sqrt("S₁S₂") + ")",
     "上底、下底、加上两者的几何平均。"],
    ["圆台侧面积", "π(r₁ + r₂)l"],
    ["棱台可以看成什么截出来的？", "大棱锥截去一个小棱锥"]
  ])},

{ id:"triarea", name:"三角形面积", gen:function(){
    const rows = [
      ["两边及夹角 a、b、C", F.frac(1,2) + "ab·sinC"],
      ["底和高", F.frac(1,2) + "·底·高"],
      ["海伦公式（p 为半周长）", F.sqrt("p(p−a)(p−b)(p−c)") + "，p = " + F.frac("a+b+c", 2)],
      ["内切圆半径 r 与周长", F.frac(1,2) + "r(a + b + c)"],
      ["外接圆半径 R", F.frac("abc", "4R")]
    ];
    const r = pick(rows);
    return { q: "三角形面积，已知" + r[0] + "，S = ?", a: r[1] };
  }},

{ id:"circumin", name:"外接圆 / 内切圆半径", gen: formulaGen([
    ["外接圆半径 R（正弦定理）", F.frac("a", "2sinA") + "，即 " + F.frac("a","sinA") + " = 2R"],
    ["内切圆半径 r（S 为面积）", F.frac("2S", "a + b + c")],
    ["直角三角形（直角边 a、b，斜边 c）的内切圆半径", F.frac("a + b − c", 2), "二级结论，直接背。"],
    ["直角三角形的外接圆半径", F.frac("c", 2), "斜边的一半，圆心在斜边中点。"]
  ])},

{ id:"sector", name:"扇形弧长与面积", gen:function(){
    const r = ri(2, 9);
    const angs = [["π/6", 6], ["π/4", 4], ["π/3", 3], ["π/2", 2], ["2π/3", 1.5]];
    const a = pick(angs);
    const lNum = frac(2*r, Math.round(2*a[1]));
    if(Math.random() < 0.5)
      return { q: "半径 "+r+"、圆心角 "+a[0]+" 的扇形，弧长 l = ?",
               a: lNum + "π", note: "l = αr（α 用弧度）" };
    return { q: "半径 "+r+"、圆心角 "+a[0]+" 的扇形，面积 S = ?",
             a: frac(r*r, Math.round(2*a[1])) + "π",
             note: "S = " + F.frac(1,2) + "αr² = " + F.frac(1,2) + "lr" };
  }},

{ id:"diag", name:"长方体对角线与外接球", gen:function(){
    const a=ri(1,6), b=ri(1,6), c=ri(1,6);
    const r=simpRoot(a*a+b*b+c*c);
    if(Math.random() < 0.5)
      return { q: "长方体棱长 "+a+"、"+b+"、"+c+"，体对角线长 = ?",
               a: rootStr(r), note: "d = " + F.sqrt("a² + b² + c²") };
    return { q: "长方体棱长 "+a+"、"+b+"、"+c+"，外接球半径 R = ?",
             a: F.frac(rootStr(r), 2),
             note: "体对角线就是外接球直径，R = " + F.frac(1,2) + F.sqrt("a² + b² + c²") + "。二级结论。" };
  }},

{ id:"tetra", name:"正四面体的二级结论", gen: formulaGen([
    ["棱长为 a 的正四面体，高 h = ?", F.rootFrac(6, 3) + "a"],
    ["棱长为 a 的正四面体，体积 V = ?", F.rootFrac(2, 12) + F.cube("a")],
    ["棱长为 a 的正四面体，外接球半径 R = ?", F.rootFrac(6, 4) + "a"],
    ["棱长为 a 的正四面体，内切球半径 r = ?", F.rootFrac(6, 12) + "a"],
    ["棱长为 a 的正方体，外接球半径 R = ?", F.rootFrac(3, 2) + "a", "体对角线的一半。"],
    ["棱长为 a 的正方体，内切球半径 r = ?", F.frac("a", 2)]
  ])}

];

/* ============================================================
   五、解析几何（圆锥曲线在这儿，不在综合几何里）
   ============================================================ */

const ANALYTIC = [

{ id:"dist2p", name:"两点间距离", gen:function(){
    const x1=ri(-8,8), y1=ri(-8,8), x2=ri(-8,8), y2=ri(-8,8);
    const d2=(x2-x1)*(x2-x1)+(y2-y1)*(y2-y1);
    if(d2 === 0) return { q:"A(1, 2)、B(4, 6)，" + F.abs("AB") + " = ?", a:"5" };
    return { q: "A("+x1+", "+y1+")、B("+x2+", "+y2+")，" + F.abs("AB") + " = ?",
             a: rootStr(simpRoot(d2)),
             note: F.abs("AB") + " = " + F.sqrt("(x₂−x₁)² + (y₂−y₁)²") };
  }},

{ id:"distpl", name:"点到直线距离", gen:function(){
    const sets = [[3,4,-5],[3,-4,10],[4,3,-12],[5,12,-13],[6,8,20],[8,-15,17]];
    const s = pick(sets), x0=ri(-6,6), y0=ri(-6,6);
    const den = Math.round(Math.sqrt(s[0]*s[0]+s[1]*s[1]));
    const num = Math.abs(s[0]*x0 + s[1]*y0 + s[2]);
    return { q: "点 P("+x0+", "+y0+") 到直线 "
              + s[0]+"x " + (s[1]<0?"− "+(-s[1]):"+ "+s[1]) + "y "
              + (s[2]<0?"− "+(-s[2]):"+ "+s[2]) + " = 0 的距离 d = ?",
             a: frac(num, den),
             note: "d = " + F.frac(F.abs("Ax₀ + By₀ + C"), F.sqrt("A² + B²")) };
  }},

{ id:"slope", name:"斜率与倾斜角", gen:function(){
    if(Math.random() < 0.55){
      const x1=ri(-7,7), y1=ri(-7,7); let x2=ri(-7,7); if(x2===x1) x2=x1+2;
      const y2=ri(-7,7);
      return { q: "过 A("+x1+", "+y1+")、B("+x2+", "+y2+") 的直线，斜率 k = ?",
               a: frac(y2-y1, x2-x1),
               note: "k = " + F.frac("y₂ − y₁", "x₂ − x₁") };
    }
    const rows = [["0°","0"],["30°",F.rootFrac(3,3)],["45°","1"],["60°","√3"],
                  ["90°","不存在"],["120°","−√3"],["135°","−1"],["150°","−"+F.rootFrac(3,3)]];
    const r = pick(rows);
    return { q: "倾斜角 " + r[0] + " 的直线，斜率 k = ?", a: r[1], note: "k = tanα" };
  }},

{ id:"circle", name:"圆的方程 → 圆心半径", gen:function(){
    const h=ri(-5,5), k=ri(-5,5), r=ri(2,7);
    const D=-2*h, E=-2*k, Fc=h*h+k*k-r*r;
    const t = s => (s<0 ? " − "+(-s) : " + "+s);
    return { q: "x² + y²" + t(D) + "x" + t(E) + "y" + t(Fc) + " = 0<br>圆心和半径 = ?",
             a: "圆心 ("+h+", "+k+")，半径 "+r,
             note: "配方，或直接用圆心 (−" + F.frac("D",2) + ", −" + F.frac("E",2) + ")、"
                 + "半径 " + F.frac(1,2) + F.sqrt("D² + E² − 4F") + "。" };
  }},

{ id:"ellipse", name:"椭圆：离心率、焦点、通径", gen:function(){
    const tri = [[5,4,3],[5,3,4],[13,12,5],[13,5,12],[10,8,6],[25,24,7]];
    const t = pick(tri), a=t[0], b=t[1], c=t[2];
    const which = pick(["c","e","l","f"]);
    const head = F.frac("x²", a*a) + " + " + F.frac("y²", b*b) + " = 1"
               + '<span style="white-space:nowrap">　（a = '+a+'，b = '+b+'）</span><br>';
    if(which==="c") return { q: head+"半焦距 c = ?", a: String(c), note: "a² = b² + c²（椭圆里 a 最大）" };
    if(which==="e") return { q: head+"离心率 e = ?", a: frac(c,a), note: "e = " + F.frac("c","a") + "，0 < e < 1" };
    if(which==="f") return { q: head+"焦点坐标 = ?", a: "(±"+c+", 0)", note: "焦点在 x 轴上（x² 的分母大）" };
    return { q: head+"通径长 = ?", a: frac(2*b*b, a),
             note: "通径 = " + F.frac("2b²","a") + "，过焦点且垂直于长轴的弦" };
  }},

{ id:"hyperbola", name:"双曲线：渐近线、离心率、通径", gen:function(){
    const tri = [[3,4,5],[4,3,5],[5,12,13],[12,5,13],[6,8,10],[8,15,17]];
    const t = pick(tri), a=t[0], b=t[1], c=t[2];
    const which = pick(["c","e","asym","l"]);
    const head = F.frac("x²", a*a) + " − " + F.frac("y²", b*b) + " = 1"
               + '<span style="white-space:nowrap">　（a = '+a+'，b = '+b+'）</span><br>';
    if(which==="c") return { q: head+"半焦距 c = ?", a: String(c), note: "c² = a² + b²（双曲线里 c 最大）" };
    if(which==="e") return { q: head+"离心率 e = ?", a: frac(c,a), note: "e = " + F.frac("c","a") + "，e > 1" };
    if(which==="asym") return { q: head+"渐近线方程 = ?", a: "y = ±" + frac(b,a) + "x",
                                note: "y = ±" + F.frac("b","a") + "x，把 1 换成 0 解出来" };
    return { q: head+"通径长 = ?", a: frac(2*b*b, a), note: "通径 = " + F.frac("2b²","a") + "，和椭圆同一个式子" };
  }},

{ id:"parabola", name:"抛物线：焦点、准线、通径", gen:function(){
    const p2 = pick([4,8,12,16,20,6,10]);   /* 2p */
    const which = pick(["f","d","l","p"]);
    const head = "y² = " + p2 + "x<br>";
    if(which==="p") return { q: head+"p = ?", a: frac(p2,2), note: "对照 y² = 2px" };
    if(which==="f") return { q: head+"焦点坐标 = ?", a: "(" + frac(p2,4) + ", 0)",
                             note: "焦点 (" + F.frac("p",2) + ", 0)" };
    if(which==="d") return { q: head+"准线方程 = ?", a: "x = −" + frac(p2,4),
                             note: "准线 x = −" + F.frac("p",2) };
    return { q: head+"通径长 = ?", a: String(p2), note: "通径 = 2p，就是 x 前面那个系数" };
  }},

{ id:"chord", name:"中点弦与焦点弦（二级结论）", gen: formulaGen([
    ["椭圆 " + F.frac("x²","a²") + " + " + F.frac("y²","b²") + " = 1 中，弦 AB 的中点为 M，则 k<sub>AB</sub> · k<sub>OM</sub> = ?",
     "−" + F.frac("b²","a²"), "点差法的结论。见到「中点弦」先想它，能省一大堆计算。"],
    ["双曲线 " + F.frac("x²","a²") + " − " + F.frac("y²","b²") + " = 1 中，k<sub>AB</sub> · k<sub>OM</sub> = ?",
     F.frac("b²","a²"), "和椭圆只差一个负号。"],
    ["抛物线 y² = 2px 的焦点弦 AB，" + F.abs("AB") + " = ?",
     "x₁ + x₂ + p", "用准线定义：到焦点的距离等于到准线的距离。"],
    ["抛物线 y² = 2px 的焦点弦，x₁x₂ = ?", F.frac("p²", 4)],
    ["抛物线 y² = 2px 的焦点弦，y₁y₂ = ?", "−p²"],
    ["倾斜角为 θ 的焦点弦长（抛物线）", F.frac("2p", "sin²θ"), "θ = 90° 时取最小值 2p，即通径。"]
  ])},

{ id:"twolines", name:"两直线的位置关系", gen: formulaGen([
    ["l₁: y = k₁x + b₁ 与 l₂: y = k₂x + b₂ 平行 ⟺", "k₁ = k₂ 且 b₁ ≠ b₂"],
    ["l₁ ⊥ l₂ ⟺（都有斜率时）", "k₁ · k₂ = −1"],
    ["A₁x + B₁y + C₁ = 0 与 A₂x + B₂y + C₂ = 0 平行 ⟺", "A₁B₂ − A₂B₁ = 0"],
    ["A₁x + B₁y + C₁ = 0 与 A₂x + B₂y + C₂ = 0 垂直 ⟺", "A₁A₂ + B₁B₂ = 0"],
    ["两平行线 Ax + By + C₁ = 0 与 Ax + By + C₂ = 0 的距离",
     F.frac(F.abs("C₁ − C₂"), F.sqrt("A² + B²"))]
  ])}

];


/* ============================================================
   六、方程与不等式（含指数对数运算）
   ============================================================ */

const EQUATION = [

{ id:"quadroot", name:"二次方程快速求根", gen:function(){
    const p=ri(-9,9), q=ri(-9,9);
    const b=-(p+q), c=p*q;
    const t = v => (v<0 ? " − "+(-v) : " + "+v);
    return { q: "x²" + t(b) + "x" + t(c) + " = 0，x = ?",
             a: (p===q ? "x₁ = x₂ = "+p : "x₁ = "+Math.min(p,q)+"，x₂ = "+Math.max(p,q)),
             note: "十字相乘：找两个数，和为 " + (-b) + "、积为 " + c + "。" };
  }},

{ id:"vieta", name:"韦达定理", gen:function(){
    const a=ri(1,4), b=ri(-9,9), c=ri(-9,9);
    if(Math.random() < 0.5)
      return { q: a+"x²" + (b<0?" − "+(-b):" + "+b) + "x" + (c<0?" − "+(-c):" + "+c)
                + " = 0 的两根之和 x₁ + x₂ = ?",
               a: frac(-b, a), note: "x₁ + x₂ = −" + F.frac("b","a") };
    return { q: a+"x²" + (b<0?" − "+(-b):" + "+b) + "x" + (c<0?" − "+(-c):" + "+c)
              + " = 0 的两根之积 x₁x₂ = ?",
             a: frac(c, a), note: "x₁x₂ = " + F.frac("c","a") };
  }},

{ id:"disc", name:"判别式", gen:function(){
    const a=ri(1,3), b=ri(-8,8), c=ri(-8,8);
    const d=b*b-4*a*c;
    return { q: a+"x²" + (b<0?" − "+(-b):" + "+b) + "x" + (c<0?" − "+(-c):" + "+c)
              + " = 0，Δ = ? 有几个实根？",
             a: "Δ = " + d + "　→　" + (d>0 ? "两个不等实根" : d===0 ? "两个相等实根" : "无实根"),
             note: "Δ = b² − 4ac" };
  }},

{ id:"factorize", name:"常见因式分解", gen: formulaGen([
    ["a² − b² = ?", "(a + b)(a − b)"],
    ["a² ± 2ab + b² = ?", "(a ± b)²"],
    ["a³ + b³ = ?", "(a + b)(a² − ab + b²)", "立方和：和 × (平方和减积)"],
    ["a³ − b³ = ?", "(a − b)(a² + ab + b²)"],
    ["(a + b)³ = ?", "a³ + 3a²b + 3ab² + b³"],
    ["a² + b² + c² + 2ab + 2bc + 2ca = ?", "(a + b + c)²"],
    ["a³ + b³ + c³ − 3abc = ?", "(a + b + c)(a² + b² + c² − ab − bc − ca)", "二级结论，偶尔考。"]
  ])},

{ id:"ineq2", name:"一元二次不等式解集", gen:function(){
    let p=ri(-8,8), q=ri(-8,8);
    if(p===q) q=p+3;
    const lo=Math.min(p,q), hi=Math.max(p,q);
    const b=-(p+q), c=p*q;
    const t = v => (v<0 ? " − "+(-v) : " + "+v);
    const gt = Math.random() < 0.5;
    return { q: "x²" + t(b) + "x" + t(c) + (gt ? " > 0" : " < 0") + "，解集 = ?",
             a: gt ? "x < "+lo+" 或 x > "+hi : lo+" < x < "+hi,
             note: "两根是 "+lo+" 和 "+hi+"。开口向上：大于零取两边，小于零取中间。" };
  }},

{ id:"amgm", name:"均值不等式", gen: formulaGen([
    ["a > 0，b > 0，则 a + b ≥ ?", "2" + F.sqrt("ab"), "当且仅当 a = b 时取等号。"],
    ["a > 0，b > 0，则 ab ≤ ?", "(" + F.frac("a + b", 2) + ")²"],
    ["x > 0，x + " + F.frac(1,"x") + " 的最小值 = ?", "2", "x = 1 时取到。"],
    ["a、b、c > 0，a + b + c ≥ ?", "3" + F.sqrt("abc", 3), "三元均值不等式。"],
    ["用均值不等式求最值的三个条件", "一正、二定、三相等", "少一个都不能用。"],
    [F.frac("a² + b²", 2) + " 与 (" + F.frac("a + b", 2) + ")² 的大小", "前者 ≥ 后者"]
  ])},

{ id:"exprule", name:"指数运算律", gen: formulaGen([
    ["a<sup>m</sup> · a<sup>n</sup> = ?", "a<sup>m+n</sup>"],
    ["a<sup>m</sup> ÷ a<sup>n</sup> = ?", "a<sup>m−n</sup>"],
    ["(a<sup>m</sup>)<sup>n</sup> = ?", "a<sup>mn</sup>"],
    ["a<sup>−n</sup> = ?", F.frac(1, "a<sup>n</sup>")],
    ["a<sup>m/n</sup> = ?", F.sqrt("a<sup>m</sup>", "n")],
    ["a<sup>0</sup> = ?（a ≠ 0）", "1"]
  ])},

{ id:"logrule", name:"对数运算律与换底", gen: formulaGen([
    ["log<sub>a</sub>(MN) = ?", "log<sub>a</sub>M + log<sub>a</sub>N"],
    ["log<sub>a</sub>" + F.frac("M","N") + " = ?", "log<sub>a</sub>M − log<sub>a</sub>N"],
    ["log<sub>a</sub>M<sup>n</sup> = ?", "n·log<sub>a</sub>M"],
    ["换底公式 log<sub>a</sub>b = ?", F.frac("log<sub>c</sub>b", "log<sub>c</sub>a")],
    ["log<sub>a</sub>b · log<sub>b</sub>a = ?", "1", "换底的直接推论。"],
    ["a<sup>log<sub>a</sub>N</sup> = ?", "N"],
    ["log<sub>a<sup>n</sup></sub>b<sup>m</sup> = ?", F.frac("m","n") + "·log<sub>a</sub>b"]
  ])},

{ id:"logval", name:"对数求值", gen:function(){
    const base = pick([2,3,5,10]);
    const n = ri(2, base===2 ? 8 : 4);
    if(Math.random() < 0.6)
      return { q: "log<sub>"+base+"</sub>" + Math.pow(base,n) + " = ?", a: String(n) };
    return { q: "log<sub>"+base+"</sub>" + F.frac(1, Math.pow(base,n)) + " = ?", a: String(-n),
             note: "倒数取对数，符号反过来。" };
  }}

];

/* ============================================================
   七、复数计算
   ============================================================ */

const COMPLEX = [

{ id:"cmul", name:"复数乘法", gen:function(){
    const a=ri(-6,6), b=ri(-6,6), c=ri(-6,6), d=ri(-6,6);
    const re=a*c-b*d, im=a*d+b*c;
    const w = (r,i) => r + (i<0 ? " − "+(-i) : " + "+i) + "i";
    return { q: "(" + w(a,b) + ")(" + w(c,d) + ") = ?",
             a: w(re, im),
             note: "按多项式展开，i² = −1。" };
  }},

{ id:"cdiv", name:"复数除法（分母实数化）", gen:function(){
    const c=pick([1,2,3]), d=pick([1,2,3]) * sign();
    const a=ri(-6,6), b=ri(-6,6);
    const den=c*c+d*d;
    const re=a*c+b*d, im=b*c-a*d;
    const w = (r,i) => r + (i<0 ? " − "+(-i) : " + "+i) + "i";
    return { q: F.frac(w(a,b), w(c,d)) + " = ?",
             a: (den===1 ? w(re,im) : frac(re,den) + (im<0 ? " − " : " + ") + frac(Math.abs(im),den) + "i"),
             note: "上下同乘分母的共轭 " + w(c,-d) + "，分母变成 c² + d² = " + den + "。" };
  }},

{ id:"cabs", name:"复数的模", gen:function(){
    const a=ri(-9,9), b=ri(-9,9);
    if(a===0 && b===0) return { q: F.abs("3 + 4i") + " = ?", a: "5" };
    return { q: F.abs(a + (b<0 ? " − "+(-b) : " + "+b) + "i") + " = ?",
             a: rootStr(simpRoot(a*a+b*b)),
             note: F.abs("a + bi") + " = " + F.sqrt("a² + b²") };
  }},

{ id:"cconj", name:"共轭复数", gen:function(){
    const a=ri(-8,8), b=ri(-8,8);
    const w = (r,i) => r + (i<0 ? " − "+(-i) : " + "+i) + "i";
    if(Math.random() < 0.5)
      return { q: "z = " + w(a,b) + "，" + F.pow("z̄","") + " = ?", a: w(a,-b),
               note: "实部不变，虚部变号。" };
    return { q: "z = " + w(a,b) + "，z · z̄ = ?", a: String(a*a+b*b),
             note: "z · z̄ = " + F.abs("z") + "² = a² + b²，是个实数。" };
  }},

{ id:"ipow", name:"i 的幂次循环", gen:function(){
    const n = ri(2, 60);
    const vals = ["1", "i", "−1", "−i"];
    return { q: "i<sup>" + n + "</sup> = ?", a: vals[n % 4],
             note: "四个一循环：i¹=i，i²=−1，i³=−i，i⁴=1。" + n + " ÷ 4 余 " + (n%4) + "。" };
  }},

{ id:"cgeo", name:"复数的几何意义", gen: formulaGen([
    ["复数 z = a + bi 在复平面上对应什么？", "点 (a, b)，或从原点出发的向量"],
    [F.abs("z") + " 的几何意义", "点 z 到原点的距离"],
    [F.abs("z₁ − z₂") + " 的几何意义", "两点 z₁、z₂ 之间的距离"],
    [F.abs("z − z₀") + " = r 表示什么图形？", "以 z₀ 为圆心、r 为半径的圆"],
    ["z 是纯虚数 ⟺", "实部 = 0 且虚部 ≠ 0", "「且虚部≠0」这半句最容易漏。"],
    ["z 是实数 ⟺", "虚部 = 0，即 z = z̄"]
  ])}

];


/* ============================================================
   八、导数计算
   ============================================================ */

const DERIVATIVE = [

{ id:"dtable", name:"基本函数导数表", gen: formulaGen([
    ["(C)′ = ?（C 为常数）", "0"],
    ["(x<sup>n</sup>)′ = ?", "n·x<sup>n−1</sup>"],
    ["(sin x)′ = ?", "cos x"],
    ["(cos x)′ = ?", "−sin x", "余弦求导带负号，最容易错的一条。"],
    ["(tan x)′ = ?", F.frac(1, "cos²x")],
    ["(e<sup>x</sup>)′ = ?", "e<sup>x</sup>", "唯一导数等于自身的函数。"],
    ["(a<sup>x</sup>)′ = ?", "a<sup>x</sup>·ln a"],
    ["(ln x)′ = ?", F.frac(1,"x")],
    ["(log<sub>a</sub>x)′ = ?", F.frac(1, "x·ln a")],
    ["(" + F.sqrt("x") + ")′ = ?", F.frac(1, "2" + F.sqrt("x"))],
    ["(" + F.frac(1,"x") + ")′ = ?", "−" + F.frac(1,"x²")]
  ])},

{ id:"drule", name:"求导法则", gen: formulaGen([
    ["(u ± v)′ = ?", "u′ ± v′"],
    ["(uv)′ = ?", "u′v + uv′", "「前导后不导 + 前不导后导」"],
    ["(" + F.frac("u","v") + ")′ = ?", F.frac("u′v − uv′", "v²"), "分子是减号，顺序不能反。"],
    ["(Cu)′ = ?", "C·u′"],
    ["复合函数 y = f(g(x))，y′ = ?", "f′(g(x)) · g′(x)", "链式法则：外导 × 内导。"],
    ["(e<sup>kx</sup>)′ = ?", "k·e<sup>kx</sup>"],
    ["(sin kx)′ = ?", "k·cos kx"]
  ])},

{ id:"dpoly", name:"多项式求导", gen:function(){
    const a=ri(1,5), b=ri(-6,6), c=ri(-8,8), d=ri(-9,9);
    const t = (v, s) => (v===0 ? "" : (v<0 ? " − "+(-v) : " + "+v) + s);
    const q = a+"x³" + t(b,"x²") + t(c,"x") + t(d,"");
    const t2 = (v, s) => (v===0 ? "" : (v<0 ? " − "+(-v) : " + "+v) + s);
    return { q: "f(x) = " + q + "<br>f′(x) = ?",
             a: (3*a)+"x²" + t2(2*b,"x") + t2(c,""),
             note: "逐项用 (xⁿ)′ = n·xⁿ⁻¹，常数项导数为 0。" };
  }},

{ id:"dtangent", name:"某点处的切线斜率", gen:function(){
    const a=ri(1,4), b=ri(-5,5), c=ri(-6,6), x0=ri(-3,3);
    const k = 3*a*x0*x0 + 2*b*x0 + c;
    const t = (v, s) => (v===0 ? "" : (v<0 ? " − "+(-v) : " + "+v) + s);
    return { q: "f(x) = " + a+"x³" + t(b,"x²") + t(c,"x")
              + "<br>曲线在 x = " + x0 + " 处的切线斜率 k = ?",
             a: String(k),
             note: "k = f′(" + x0 + ")，先求 f′(x) = " + (3*a) + "x²" + t(2*b,"x") + t(c,"") + " 再代入。" };
  }},

{ id:"dmono", name:"单调性与极值", gen: formulaGen([
    ["f′(x) > 0 说明什么？", "f(x) 在该区间单调递增"],
    ["f′(x) < 0 说明什么？", "f(x) 在该区间单调递减"],
    ["x₀ 是极值点的必要条件", "f′(x₀) = 0", "只是必要不充分——y = x³ 在 0 处导数为 0 却不是极值点。"],
    ["极大值点的判定", "f′(x) 在 x₀ 左正右负"],
    ["极小值点的判定", "f′(x) 在 x₀ 左负右正"],
    ["求闭区间 [a, b] 上最值的步骤", "求出所有极值，再和端点值 f(a)、f(b) 比大小"]
  ])}

];


/* ============================================================
   九、概率统计
   ============================================================ */

function permu(n, m){ let v=1; for(let i=0;i<m;i++) v*=(n-i); return v; }
function combi(n, m){ return permu(n,m) / permu(m,m); }

const PROBABILITY = [

{ id:"perm", name:"排列数 A", gen:function(){
    const n=ri(4,9), m=ri(2,Math.min(4,n));
    return { q: "A<sub>" + n + "</sub><sup>" + m + "</sup> = ?",
             a: String(permu(n,m)),
             note: "从 " + n + " 开始，连乘 " + m + " 个递减的数。" };
  }},

{ id:"comb", name:"组合数 C", gen:function(){
    const n=ri(4,10), m=ri(2,Math.min(4,n));
    return { q: "C<sub>" + n + "</sub><sup>" + m + "</sup> = ?",
             a: String(combi(n,m)),
             note: "C = " + F.frac("A<sub>n</sub><sup>m</sup>", "m!") + " = "
                 + F.frac(permu(n,m), permu(m,m)) };
  }},

{ id:"combrule", name:"组合数性质与二项式定理", gen: formulaGen([
    ["C<sub>n</sub><sup>m</sup> = C<sub>n</sub><sup>?</sup>", "C<sub>n</sub><sup>n−m</sup>", "对称性，算 C₁₀⁸ 就去算 C₁₀²。"],
    ["C<sub>n</sub><sup>m</sup> + C<sub>n</sub><sup>m−1</sup> = ?", "C<sub>n+1</sub><sup>m</sup>", "杨辉三角每一行的生成规律。"],
    ["(a + b)<sup>n</sup> 展开式的通项 T<sub>k+1</sub> = ?",
     "C<sub>n</sub><sup>k</sup>·a<sup>n−k</sup>·b<sup>k</sup>", "注意是第 k+1 项。"],
    ["C<sub>n</sub><sup>0</sup> + C<sub>n</sub><sup>1</sup> + … + C<sub>n</sub><sup>n</sup> = ?",
     "2<sup>n</sup>", "令 a = b = 1 代进二项式定理。"],
    ["展开式中奇数项系数和 = 偶数项系数和 = ?", "2<sup>n−1</sup>"],
    ["A<sub>n</sub><sup>m</sup> 与 C<sub>n</sub><sup>m</sup> 的关系", "A<sub>n</sub><sup>m</sup> = C<sub>n</sub><sup>m</sup> · m!", "组合是「选」，排列是「选了再排」。"]
  ])},

{ id:"dice", name:"古典概型：两骰子点数和", gen:function(){
    const s = ri(2, 12);
    const cnt = 6 - Math.abs(s - 7);
    return { q: "掷两枚骰子，点数和为 " + s + " 的概率 = ?",
             a: frac(cnt, 36),
             note: "共 36 种等可能结果，和为 " + s + " 的有 " + cnt + " 种。" };
  }},

{ id:"binom", name:"二项分布的期望与方差", gen:function(){
    const n = pick([10,20,25,50,100]);
    const ps = [["0.2",0.2],["0.4",0.4],["0.5",0.5],["0.6",0.6],["0.8",0.8]];
    const p = pick(ps);
    const E = n*p[1], D = n*p[1]*(1-p[1]);
    if(Math.random() < 0.5)
      return { q: "X ~ B(" + n + ", " + p[0] + ")，E(X) = ?",
               a: String(Math.round(E*100)/100), note: "E(X) = np" };
    return { q: "X ~ B(" + n + ", " + p[0] + ")，D(X) = ?",
             a: String(Math.round(D*100)/100), note: "D(X) = np(1 − p)" };
  }},

{ id:"stat", name:"期望方差的性质与正态分布", gen: formulaGen([
    ["E(aX + b) = ?", "a·E(X) + b"],
    ["D(aX + b) = ?", "a²·D(X)", "常数 b 不影响波动，a 要平方。"],
    ["两点分布 X ~ B(1, p) 的 E(X)、D(X)", "E(X) = p，D(X) = p(1 − p)"],
    ["正态分布 N(μ, σ²) 中，P(μ−σ < X < μ+σ) ≈ ?", "68.3%"],
    ["P(μ−2σ < X < μ+2σ) ≈ ?", "95.4%"],
    ["P(μ−3σ < X < μ+3σ) ≈ ?", "99.7%", "「3σ 原则」，超出就当成小概率事件。"],
    ["正态曲线关于哪条直线对称？", "x = μ", "σ 越小曲线越瘦高。"]
  ])}

];


/* ============================================================
   十、数列
   ============================================================ */

const SEQUENCE = [

{ id:"apterm", name:"等差数列通项", gen:function(){
    const a1=ri(-9,9), d=ri(-7,7) || 3, n=ri(5,30);
    return { q: "等差数列 a₁ = "+a1+"，d = "+d+"，a<sub>"+n+"</sub> = ?",
             a: String(a1 + (n-1)*d),
             note: "aₙ = a₁ + (n − 1)d" };
  }},

{ id:"apsum", name:"等差数列求和", gen:function(){
    const a1=ri(-6,9), d=ri(1,6), n=ri(5,25);
    const S = n*a1 + n*(n-1)/2*d;
    return { q: "等差数列 a₁ = "+a1+"，d = "+d+"，S<sub>"+n+"</sub> = ?",
             a: String(S),
             note: "Sₙ = " + F.frac("n(a₁ + aₙ)", 2) + " = na₁ + " + F.frac("n(n−1)", 2) + "d" };
  }},

{ id:"gpterm", name:"等比数列通项", gen:function(){
    const a1=pick([1,2,3,-1,-2]), q=pick([2,3,-2]), n=ri(3,9);
    return { q: "等比数列 a₁ = "+a1+"，q = "+q+"，a<sub>"+n+"</sub> = ?",
             a: String(a1 * Math.pow(q, n-1)),
             note: "aₙ = a₁·q<sup>n−1</sup>（注意指数是 n−1）" };
  }},

{ id:"gpsum", name:"等比数列求和", gen:function(){
    const a1=pick([1,2,3]), q=pick([2,3]), n=ri(3,9);
    const S = a1 * (Math.pow(q,n) - 1) / (q - 1);
    return { q: "等比数列 a₁ = "+a1+"，q = "+q+"，S<sub>"+n+"</sub> = ?",
             a: String(S),
             note: "Sₙ = " + F.frac("a₁(1 − qⁿ)", "1 − q") + "（q ≠ 1）" };
  }},

{ id:"sumn", name:"常用求和公式", gen:function(){
    const n = ri(5, 30);
    const which = pick(["lin","sq","cube","odd"]);
    if(which==="lin") return { q: "1 + 2 + 3 + … + " + n + " = ?",
      a: String(n*(n+1)/2), note: F.frac("n(n+1)", 2) };
    if(which==="sq") return { q: "1² + 2² + … + " + n + "² = ?",
      a: String(n*(n+1)*(2*n+1)/6), note: F.frac("n(n+1)(2n+1)", 6) };
    if(which==="cube") return { q: "1³ + 2³ + … + " + n + "³ = ?",
      a: String(Math.pow(n*(n+1)/2, 2)), note: "[" + F.frac("n(n+1)", 2) + "]²，正好是前面那个和的平方。" };
    return { q: "1 + 3 + 5 + … + " + (2*n-1) + "（前 " + n + " 个奇数）= ?",
      a: String(n*n), note: "前 n 个奇数之和 = n²" };
  }},

{ id:"seqtrick", name:"中项、裂项与常用手法", gen: formulaGen([
    ["等差中项：a、A、b 成等差 ⟺ A = ?", F.frac("a + b", 2)],
    ["等比中项：a、G、b 成等比 ⟺ G² = ?", "ab", "G = ±" + F.sqrt("ab") + "，两个符号都要，别漏。"],
    ["裂项：" + F.frac(1, "n(n+1)") + " = ?", F.frac(1,"n") + " − " + F.frac(1,"n+1")],
    ["裂项：" + F.frac(1, "n(n+k)") + " = ?", F.frac(1,"k") + "(" + F.frac(1,"n") + " − " + F.frac(1,"n+k") + ")"],
    ["裂项：" + F.frac(1, F.sqrt("n+1") + " + " + F.sqrt("n")) + " = ?",
     F.sqrt("n+1") + " − " + F.sqrt("n"), "分母有理化就出来了。"],
    ["已知 Sₙ 求 aₙ 的方法", "aₙ = Sₙ − Sₙ₋₁（n ≥ 2），а₁ = S₁ 单独算", "n = 1 必须单独验，最常丢分的地方。"],
    ["错位相减法用在什么数列上？", "等差 × 等比 的乘积数列"]
  ])}

];


/* ============================================================
   十一、十个大类的登记表

   subs 为空的就是还没建的，页面会标出来并禁止选中。
   加一个细类 = 在对应大类的 subs 里加一条，页面代码一行都不用动。
   ============================================================ */

window.MATH = {
  cats: [
    { id:"number",     name:"数字计算",       subs: NUMBER },
    { id:"trig",       name:"三角计算",       subs: TRIG },
    { id:"vector",     name:"向量计算",       subs: VECTOR },
    { id:"geometry",   name:"立体与平面几何", subs: GEOMETRY },
    { id:"analytic",   name:"解析几何",       subs: ANALYTIC },
    { id:"equation",   name:"方程与不等式",   subs: EQUATION },
    { id:"complex",    name:"复数计算",       subs: COMPLEX },
    { id:"derivative", name:"导数计算",       subs: DERIVATIVE },
    { id:"probability",name:"概率统计",       subs: PROBABILITY },
    { id:"sequence",   name:"数列",           subs: SEQUENCE }
  ]
};

})();
