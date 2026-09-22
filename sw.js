/* ============================================================
   Service Worker：让这个网页能装到手机上、断网也能用、有新版会自己更新。

   三件事：
   1. 装的时候把整个应用（页面 + 语料 + 引擎）缓存下来 → 断网照样开
   2. 平时从缓存里取，后台悄悄拉新的 → 秒开，且下次打开就是新版
   3. 有新版本时通知页面弹一条「点一下更新」→ 见 pwa.js

   **改完代码要把 VERSION 加一**，否则浏览器可能还在用旧缓存。
   ============================================================ */

const VERSION = "v4";   /* v0.33：全部公式都过 KaTeX */
const CACHE = "xkfx-" + VERSION;

/* 装机时就抓下来的东西。路径全用相对的——
   部署到 GitHub Pages 这类带子路径的地方（/仓库名/）才不会错位。 */
const PRECACHE = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./favicon.ico",
  "./pwa.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./chinese/index.html",
  "./chinese/data.js",
  "./chinese/user.js",
  "./math/index.html",
  "./math/engine.js",

  /* 公式排版：KaTeX 本体 + mhchem（化学式）+ 全部字体。
     字体一起预缓存是为了断网时也能排版——20 个 woff2 合计约 254 KB。 */
  "./vendor/katex/katex.min.css",
  "./vendor/katex/katex.min.js",
  "./vendor/katex/contrib/mhchem.min.js",
  "./vendor/katex/fonts/KaTeX_AMS-Regular.woff2",
  "./vendor/katex/fonts/KaTeX_Caligraphic-Bold.woff2",
  "./vendor/katex/fonts/KaTeX_Caligraphic-Regular.woff2",
  "./vendor/katex/fonts/KaTeX_Fraktur-Bold.woff2",
  "./vendor/katex/fonts/KaTeX_Fraktur-Regular.woff2",
  "./vendor/katex/fonts/KaTeX_Main-Bold.woff2",
  "./vendor/katex/fonts/KaTeX_Main-BoldItalic.woff2",
  "./vendor/katex/fonts/KaTeX_Main-Italic.woff2",
  "./vendor/katex/fonts/KaTeX_Main-Regular.woff2",
  "./vendor/katex/fonts/KaTeX_Math-BoldItalic.woff2",
  "./vendor/katex/fonts/KaTeX_Math-Italic.woff2",
  "./vendor/katex/fonts/KaTeX_SansSerif-Bold.woff2",
  "./vendor/katex/fonts/KaTeX_SansSerif-Italic.woff2",
  "./vendor/katex/fonts/KaTeX_SansSerif-Regular.woff2",
  "./vendor/katex/fonts/KaTeX_Script-Regular.woff2",
  "./vendor/katex/fonts/KaTeX_Size1-Regular.woff2",
  "./vendor/katex/fonts/KaTeX_Size2-Regular.woff2",
  "./vendor/katex/fonts/KaTeX_Size3-Regular.woff2",
  "./vendor/katex/fonts/KaTeX_Size4-Regular.woff2",
  "./vendor/katex/fonts/KaTeX_Typewriter-Regular.woff2"
];

self.addEventListener("install", e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    /* 逐个加，某一个 404 不至于让整个装机失败 */
    await Promise.all(PRECACHE.map(u =>
      c.add(new Request(u, { cache: "reload" })).catch(err =>
        console.warn("[sw] 没缓存上：" + u, err))));
  })());
  /* 这里不 skipWaiting：等页面上你点了「更新」再切，免得正做着题页面突然换版 */
});

self.addEventListener("activate", e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith("xkfx-") && k !== CACHE)
                          .map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

/* 页面点了「更新」会发这条消息过来 */
self.addEventListener("message", e => {
  if(e.data && e.data.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if(req.method !== "GET") return;

  const url = new URL(req.url);
  if(url.origin !== self.location.origin) return;   /* 外站的不管 */

  /* 导航请求（点开一个页面）：先走网络，拿到就顺手更新缓存；
     断网了再退回缓存。这样在线时总能看到最新的页面。 */
  if(req.mode === "navigate"){
    e.respondWith((async () => {
      try{
        const fresh = await fetch(req);
        const c = await caches.open(CACHE);
        c.put(req, fresh.clone());
        return fresh;
      }catch(err){
        const hit = await caches.match(req);
        return hit || await caches.match("./index.html") ||
               new Response("离线，且这一页没缓存过。", {
                 status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
      }
    })());
    return;
  }

  /* 其余静态资源：缓存优先（秒开），同时后台拉一份新的存起来，下次就是新的 */
  e.respondWith((async () => {
    const hit = await caches.match(req);
    const net = fetch(req).then(res => {
      if(res && res.ok){
        caches.open(CACHE).then(c => c.put(req, res.clone()));
      }
      return res;
    }).catch(() => null);
    return hit || (await net) ||
           new Response("", { status: 504 });
  })());
});
