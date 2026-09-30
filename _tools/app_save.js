// ================= 存档、读档、新开一局、联系方式 =================
// 当前进度自动存在 localStorage（bbm_v1 / bbm_world_v1 / bbm_season_v1）；
// 手动存档位放 IndexedDB（一个存档接近 1 MB，localStorage 放不下几个），IndexedDB 不可用时退回 localStorage。
const SAVE_KEYS=[SAVE_KEY, WORLD_KEY, SEASON_KEY];
const SLOT_N=3;
const IDB={db:null};
function idbOpen(){ return new Promise((res,rej)=>{ if(IDB.db) return res(IDB.db); if(!window.indexedDB) return rej(new Error('no idb'));
  const r=indexedDB.open('bbm_saves',1); r.onupgradeneeded=()=>r.result.createObjectStore('slots'); r.onsuccess=()=>{ IDB.db=r.result; res(IDB.db); }; r.onerror=()=>rej(r.error); }); }
async function slotPut(k,v){ try{ const db=await idbOpen(); await new Promise((res,rej)=>{ const tx=db.transaction('slots','readwrite'); tx.objectStore('slots').put(v,k); tx.oncomplete=res; tx.onerror=()=>rej(tx.error); }); }
  catch(e){ localStorage.setItem('bbm_slot_'+k, JSON.stringify(v)); } }
async function slotGet(k){ try{ const db=await idbOpen(); return await new Promise((res,rej)=>{ const q=db.transaction('slots').objectStore('slots').get(k); q.onsuccess=()=>res(q.result||null); q.onerror=()=>rej(q.error); }); }
  catch(e){ try{ return JSON.parse(localStorage.getItem('bbm_slot_'+k)||'null'); }catch(_){ return null; } } }
async function slotDel(k){ try{ const db=await idbOpen(); await new Promise(res=>{ const tx=db.transaction('slots','readwrite'); tx.objectStore('slots').delete(k); tx.oncomplete=res; tx.onerror=res; }); }catch(e){} try{ localStorage.removeItem('bbm_slot_'+k); }catch(e){} }

function snapshot(){
  save(); saveSeason();
  const keys={}; SAVE_KEYS.forEach(k=>{ const v=localStorage.getItem(k); if(v!=null) keys[k]=v; });
  const S=G.season, t=G.team!=null?TEAMS[G.team]:null, r=S&&t? standings()[G.team] : null;
  return {v:1, time:Date.now(), meta:{team:t?t.cn:'', ti:G.team, year:W.off?W.off.year:(S?S.year:W.year), date:W.off?'休赛期 · '+OFF_STEPS[W.off.step]:(S?dateTxt(Math.min(S.day,REG_DAYS+80))+' · '+phaseTxt():''), rec:r?`${r.w}-${r.l}`:''}, keys};
}
function restore(snap){
  if(!snap || !snap.keys || !snap.keys[WORLD_KEY]) throw new Error('bad');
  SAVE_KEYS.forEach(k=>localStorage.removeItem(k));
  Object.entries(snap.keys).forEach(([k,v])=>{ if(SAVE_KEYS.includes(k)) localStorage.setItem(k,v); });
  location.reload();
}
function metaTxt(s){ if(!s) return '<span class="hint">空</span>'; const m=s.meta||{}, d=new Date(s.time);
  return `<b>${esc(m.team||'未选队')}</b> <span class="hint">${m.year?m.year+'-'+String((m.year+1)%100).padStart(2,'0')+' 赛季 · ':''}${esc(m.date||'')}${m.rec?' · '+m.rec:''}</span><div class="hint">存于 ${d.getMonth()+1}月${d.getDate()}日 ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}</div>`; }
function exportSave(){
  const s=snapshot(), m=s.meta, d=new Date(), p2=x=>String(x).padStart(2,'0'), name=`basketball-manager-${G.team!=null?TEAMS[G.team].abbr:'new'}-${m.year}-${p2(d.getMonth()+1)}${p2(d.getDate())}${p2(d.getHours())}${p2(d.getMinutes())}.json`;
  const blob=new Blob([JSON.stringify(s)],{type:'application/json'}), a=document.createElement('a');
  a.href=URL.createObjectURL(blob); a.download=name; document.body.appendChild(a); a.click(); setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); },1500);
  toast('存档文件已导出');
}
function importSave(file){
  const r=new FileReader(); r.onload=()=>{ try{ const s=JSON.parse(r.result); if(!confirmSafe('导入会替换当前进度，确定吗？')) return; restore(s); }catch(e){ toast('这个文件读不出来，不是篮球经理的存档'); } }; r.readAsText(file);
}
function confirmSafe(msg){ try{ return window.confirm(msg); }catch(e){ return true; } }
function newGame(){ if(!confirmSafe('新开一局会丢掉当前进度（手动存档位不受影响）。确定吗？')) return; SAVE_KEYS.forEach(k=>localStorage.removeItem(k)); location.reload(); }
function copyWx(){
  const id='lynchrrr';
  const fb=()=>{ try{ const el=document.getElementById('wx-id'), rg=document.createRange(); rg.selectNodeContents(el); const sel=getSelection(); sel.removeAllRanges(); sel.addRange(rg); toast('已选中微信号，长按复制'); }catch(e){ toast('微信号：'+id); } };
  if(navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(id).then(()=>toast('微信号已复制：'+id)).catch(fb); else fb();
}
function contactHTML(){
  return `<div class="card"><h3>反馈和建议</h3><p class="hint" style="margin-bottom:8px">遇到 bug、觉得哪里数值不对，或者想要什么新功能，加微信直接说：</p>
    <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap"><b id="wx-id" style="font-family:ui-monospace,Menlo,Consolas,monospace;font-size:20px;letter-spacing:1px;color:var(--acc);-webkit-user-select:all;user-select:all">lynchrrr</b><button class="sm" id="copywx">复制微信号</button></div>
    <p class="hint" style="margin-top:6px">作者 Lynch · GitHub @Lynch715</p></div>`;
}
async function slotsHTML(canSave){
  const S=[]; for(let i=1;i<=SLOT_N;i++) S.push(await slotGet('s'+i));
  return `<div class="card"><h3>存档位</h3>${S.map((s,k)=>`<div style="display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid #1f2733;flex-wrap:wrap">
      <b style="width:22px;color:var(--dim)">${k+1}</b><div style="flex:1;min-width:180px">${metaTxt(s)}</div>
      <div>${canSave?`<button class="sm pri" data-ss="${k+1}">存到这里</button> `:''}${s?`<button class="sm" data-sl="${k+1}">读取</button> <button class="sm" data-sd="${k+1}">删除</button>`:''}</div></div>`).join('')}
    <p class="hint" style="margin-top:8px">存档位只在这台设备的这个浏览器里。换手机、换电脑，或者清理浏览器数据之前，先导出存档文件。</p>
    <div style="margin-top:10px">${canSave?'<button id="exportsave">导出存档文件</button> ':''}<button id="importbtn">导入存档文件</button><input type="file" id="importfile" accept=".json,application/json" style="display:none"></div></div>`;
}
function bindSave(v, rerender){
  v.querySelectorAll('[data-ss]').forEach(b=>b.onclick=async()=>{ const k='s'+b.dataset.ss, old=await slotGet(k);
    if(old && !confirmSafe(`存档位 ${b.dataset.ss} 已经有存档，覆盖吗？`)) return; await slotPut(k, snapshot()); toast(`已存到存档位 ${b.dataset.ss}`); rerender(); });
  v.querySelectorAll('[data-sl]').forEach(b=>b.onclick=async()=>{ const s=await slotGet('s'+b.dataset.sl); if(!s) return;
    if(G.team!=null && !confirmSafe('读档会替换当前进度，没存的部分会丢。确定吗？')) return; try{ restore(s); }catch(e){ toast('这个存档读不出来'); } });
  v.querySelectorAll('[data-sd]').forEach(b=>b.onclick=async()=>{ if(!confirmSafe(`删除存档位 ${b.dataset.sd}？`)) return; await slotDel('s'+b.dataset.sd); rerender(); });
  const q=s=>v.querySelector(s);
  if(q('#exportsave')) q('#exportsave').onclick=exportSave;
  if(q('#importbtn')) q('#importbtn').onclick=()=>q('#importfile').click();
  if(q('#importfile')) q('#importfile').onchange=e=>{ const f=e.target.files[0]; if(f) importSave(f); e.target.value=''; };
  if(q('#copywx')) q('#copywx').onclick=copyWx;
  if(q('#newgame')) q('#newgame').onclick=newGame;
  bindInstallCard(v);
}
async function vSave(v){
  const s=G.season, t=myTeam();
  v.innerHTML=`<h1>存档</h1><div class="sub">每一步操作都会自动保存，关掉再打开会接着玩。想留几个进度来回切，用下面的存档位。</div><div id="savebody"><div class="hint">读取中…</div></div>`;
  const html=await slotsHTML(true);
  if(G.view!=='save') return;
  v.querySelector('#savebody').innerHTML=`${html}
    <div class="card"><h3>新开一局</h3><p class="hint" style="margin-bottom:8px">放弃当前进度，回到 2026-27 赛季季前重新选队。手动存档位里的存档不受影响。</p><button class="sm" id="newgame" style="border-color:var(--bad);color:var(--bad)">新开一局</button></div>
    ${installCardHTML()}${contactHTML()}<p class="hint" style="margin-top:10px;font-size:11px;opacity:.7">${screenDiag()}</p>`;
  bindSave(v, ()=>vSave(v));
}
// 选队页：读档、导入、联系方式
async function pickExtras(v){
  const box=v.querySelector('#pickextra'); if(!box) return;
  box.innerHTML=`${await slotsHTML(false)}${installCardHTML()}${contactHTML()}`;
  bindSave(box, ()=>pickExtras(v));
}
ICON.save='<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2.5 2.5h9l2 2v9h-11z"/><path d="M5 2.5v3.5h5V2.5M5 13.5v-4h6v4"/></svg>';

// ---------- 手机上关掉缩放 ----------
(function lockZoom(){
  ['gesturestart','gesturechange','gestureend'].forEach(t=>document.addEventListener(t,e=>e.preventDefault(),{passive:false}));
  document.addEventListener('touchmove',e=>{ if(e.touches && e.touches.length>1) e.preventDefault(); },{passive:false});
})();
