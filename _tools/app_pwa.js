// ================= 装到桌面、离线 =================
// 规范：《第五阶段规范.md》§6
const PWA_KEY='bbm_install';
const PWA={deferred:null, armed:false};
const UA=navigator.userAgent||'';
const IS_IOS=/iPhone|iPad|iPod/.test(UA) || (navigator.platform==='MacIntel' && navigator.maxTouchPoints>1);
const IS_SAFARI=/Safari/.test(UA) && !/Chrome|Chromium|CriOS|FxiOS|Edg|OPR/.test(UA);
function isStandalone(){ try{ return matchMedia('(display-mode: standalone)').matches || navigator.standalone===true; }catch(e){ return false; } }
function pwaGet(){ try{ return localStorage.getItem(PWA_KEY); }catch(e){ return null; } }
function pwaSet(v){ try{ localStorage.setItem(PWA_KEY,v); }catch(e){} }
function canInstall(){ return !isStandalone() && (!!PWA.deferred || IS_SAFARI); }
addEventListener('beforeinstallprompt', e=>{ e.preventDefault(); PWA.deferred=e; armInstall(); });
addEventListener('appinstalled', ()=>{ pwaSet('installed'); closeInstall(); });
if(IS_SAFARI) addEventListener('load', armInstall);
function armInstall(){
  if(PWA.armed || isStandalone()) return; const st=pwaGet(); if(st==='dismissed'||st==='installed') return;
  PWA.armed=true;
  const t=setInterval(()=>{ if(G.team!=null){ clearInterval(t); setTimeout(()=>{ if(!isStandalone() && !pwaGet() && !LIVE) showInstall(); }, 45000); } }, 2000);
}
function closeInstall(){ const el=document.getElementById('installbox'); if(el) el.remove(); }
function showInstall(manual){
  closeInstall(); if(isStandalone()){ if(manual) toast('已经装在桌面上了'); return; }
  const el=document.createElement('div'); el.id='installbox';
  el.style.cssText='position:fixed;left:50%;bottom:'+((()=>{ const sd=document.getElementById('side'); return (sd&&innerWidth<=760&&sd.offsetHeight)?sd.offsetHeight+12:24; })())+'px;transform:translateX(-50%);width:min(380px,calc(100vw - 24px));background:var(--bg3);border:1px solid var(--acc);border-radius:12px;padding:14px 16px;z-index:90;box-shadow:0 10px 30px rgba(0,0,0,.5)';
  let body;
  if(PWA.deferred) body=`<p style="margin-bottom:10px">把篮球经理装到桌面，像 App 一样打开，断网也能玩。</p><div style="text-align:right"><button id="ins-no">以后再说</button> <button class="pri" id="ins-yes">安装</button></div>`;
  else if(IS_SAFARI && IS_IOS) body=`<p style="margin-bottom:6px">装到主屏幕：</p><p class="hint" style="color:var(--txt)">点底部工具栏的<b>分享</b>按钮 → 往下找<b>「添加到主屏幕」</b> → 右上角点<b>添加</b>。</p><div style="text-align:right;margin-top:10px"><button id="ins-no">知道了</button></div>`;
  else if(IS_SAFARI) body=`<p style="margin-bottom:6px">装到程序坞：</p><p class="hint" style="color:var(--txt)">菜单栏<b>文件</b> → <b>「添加到程序坞」</b>。</p><div style="text-align:right;margin-top:10px"><button id="ins-no">知道了</button></div>`;
  else body=`<p class="hint" style="color:var(--txt)">这个浏览器不支持装到桌面。用 Chrome、Edge 或者 Safari 打开这个网址就可以。</p><div style="text-align:right;margin-top:10px"><button id="ins-no">知道了</button></div>`;
  el.innerHTML=`<div style="display:flex;gap:12px;align-items:flex-start"><img src="icon/icon-64.png" width="44" height="44" style="border-radius:10px;flex:0 0 44px" alt=""><div style="flex:1"><b style="display:block;margin-bottom:4px">装到桌面</b>${body}</div></div>`;
  document.body.appendChild(el);
  const no=el.querySelector('#ins-no'), yes=el.querySelector('#ins-yes');
  if(no) no.onclick=()=>{ if(!manual) pwaSet('dismissed'); closeInstall(); };
  if(yes) yes.onclick=async()=>{ const d=PWA.deferred; if(!d) return; d.prompt(); const r=await d.userChoice; PWA.deferred=null; pwaSet(r.outcome==='accepted'?'installed':'dismissed'); closeInstall(); };
}
function installCardHTML(){
  if(isStandalone()) return `<div class="card"><h3>装到桌面</h3><p class="hint">已经装在桌面上了，断网也能玩。</p></div>`;
  return `<div class="card"><h3>装到桌面</h3><p class="hint" style="margin-bottom:8px">装好以后像 App 一样打开，断网也能玩。存档在这台设备的浏览器里。</p><button id="installbtn">装到桌面</button></div>`;
}
function bindInstallCard(v){ const b=v.querySelector('#installbtn'); if(b) b.onclick=()=>showInstall(true); }

// service worker：只在 http(s) 下注册；有新版时提示刷新
if('serviceWorker' in navigator && location.protocol.startsWith('http')){
  addEventListener('load', ()=>{
    navigator.serviceWorker.register('sw.js').then(reg=>{
      const offer=w=>{ const el=document.createElement('div');
        el.style.cssText='position:fixed;left:50%;top:calc(58px + env(safe-area-inset-top,0px));transform:translateX(-50%);background:var(--bg3);border:1px solid var(--acc);border-radius:10px;padding:9px 14px;z-index:95;display:flex;gap:12px;align-items:center';
        el.innerHTML='<span>有新版本</span><button class="sm pri">刷新</button>'; el.querySelector('button').onclick=()=>w.postMessage('skipWaiting'); document.body.appendChild(el); };
      if(reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
      reg.addEventListener('updatefound', ()=>{ const w=reg.installing; if(!w) return;
        w.addEventListener('statechange', ()=>{ if(w.state==='installed' && navigator.serviceWorker.controller) offer(w); }); });
    }).catch(()=>{});
    let reloading=false;
    navigator.serviceWorker.addEventListener('controllerchange', ()=>{ if(reloading) return; reloading=true; location.reload(); });
  });
}
