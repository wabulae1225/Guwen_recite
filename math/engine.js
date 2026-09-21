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
   三、十个大类的登记表

   subs 为空的就是还没建的，页面会标出来并禁止选中。
   下一轮往这里填即可，页面代码一行都不用动。
   ============================================================ */

window.MATH = {
  cats: [
    { id:"number",     name:"数字计算",      subs: NUMBER },
    { id:"trig",       name:"三角计算",      subs: TRIG },
    { id:"vector",     name:"向量计算",      subs: [] },
    { id:"geometry",   name:"立体与平面几何", subs: [] },
    { id:"analytic",   name:"解析几何",      subs: [] },
    { id:"equation",   name:"方程与不等式",  subs: [] },
    { id:"complex",    name:"复数计算",      subs: [] },
    { id:"derivative", name:"导数计算",      subs: [] },
    { id:"probability",name:"概率统计",      subs: [] },
    { id:"sequence",   name:"数列",          subs: [] }
  ]
};

})();
