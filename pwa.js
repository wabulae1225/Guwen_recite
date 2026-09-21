/* ============================================================
   PWA 挂载脚本：注册 Service Worker，并在有新版时弹一条提示。

   页面里引一行就行：
     <script src="pwa.js" defer></script>        （根目录的页面）
     <script src="../pwa.js" defer></script>     （子目录的页面）

   双击本地文件（file://）打开时，浏览器不允许注册 Service Worker，
   这里会静默跳过，页面照常工作——所以离线单文件用法一点不受影响。
   要装到手机上，得用 https 的网址打开（部署见 README）。
   ============================================================ */

(function(){
"use strict";

if(!("serviceWorker" in navigator)) return;
if(location.protocol !== "https:" && location.hostname !== "localhost"
   && location.hostname !== "127.0.0.1") return;   /* file:// 直接跳过 */

/* pwa.js 自己在哪，sw.js 就在哪——子页面引用 ../pwa.js 时也能算对 */
const here = new URL(".", document.currentScript ? document.currentScript.src
                                                : location.href);
const swURL = new URL("sw.js", here).href;

function banner(text, btnText, onClick){
  const bar = document.createElement("div");
  bar.setAttribute("role", "status");
  bar.style.cssText =
    "position:fixed;left:0;right:0;bottom:0;z-index:9999;"
  + "background:#23241F;color:#F3F5F1;padding:11px 15px;"
  + "font:14px/1.5 'PingFang SC','Microsoft YaHei',system-ui,sans-serif;"
  + "display:flex;align-items:center;gap:12px";
  const span = document.createElement("span");
  span.textContent = text;
  span.style.flex = "1";
  const btn = document.createElement("button");
  btn.textContent = btnText;
  btn.style.cssText =
    "background:#9E2B25;color:#F3F5F1;border:none;border-radius:2px;"
  + "padding:7px 13px;cursor:pointer;font:inherit;flex:none";
  btn.onclick = onClick;
  const close = document.createElement("button");
  close.textContent = "×";
  close.setAttribute("aria-label", "关掉");
  close.style.cssText =
    "background:none;color:#9BA096;border:none;cursor:pointer;"
  + "font-size:19px;line-height:1;padding:0 2px;flex:none";
  close.onclick = () => bar.remove();
  bar.append(span, btn, close);
  document.body.appendChild(bar);
  return bar;
}

navigator.serviceWorker.register(swURL).then(reg => {

  /* 有新版本装好了、且当前页面正被旧版控制 → 提示更新 */
  function offerUpdate(worker){
    banner("有新版本了。", "更新", () => {
      worker.postMessage({ type: "SKIP_WAITING" });
    });
  }

  if(reg.waiting && navigator.serviceWorker.controller) offerUpdate(reg.waiting);

  reg.addEventListener("updatefound", () => {
    const nw = reg.installing;
    if(!nw) return;
    nw.addEventListener("statechange", () => {
      if(nw.state === "installed" && navigator.serviceWorker.controller) offerUpdate(nw);
    });
  });

  /* 新 worker 接管后刷新一次，界面才真的换成新版 */
  let reloading = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if(reloading) return;
    reloading = true;
    location.reload();
  });

  /* 回到前台时问一次有没有新版（浏览器自己也会问，这里更及时） */
  document.addEventListener("visibilitychange", () => {
    if(document.visibilityState === "visible") reg.update().catch(() => {});
  });

}).catch(err => console.warn("[pwa] Service Worker 没注册上：", err));

/* 安卓上可以主动弹「装到桌面」；不支持的浏览器（比如 iOS Safari）不会触发，
   那边是手动「共享 → 添加到主屏幕」。 */
let deferred = null;
window.addEventListener("beforeinstallprompt", e => {
  e.preventDefault();
  deferred = e;
  const bar = banner("可以把它装到手机桌面，像个 App 一样打开。", "装上", async () => {
    bar.remove();
    deferred.prompt();
    await deferred.userChoice;
    deferred = null;
  });
});

})();
