"use strict";
const E = BBEngine;
const KEYS = ATTR_DEF.map(x=>x[0]), ATTR_CN = Object.fromEntries(ATTR_DEF);
const ATTR_GROUPS = [['进攻',['finish','dunk','mid','three','ft','handle','pass','post']],['防守',['perD','intD','stl','blk','oreb','dreb']],['身体',['spd','jmp','str','sta']],['意识',['oiq','diq','hustle']]];
const POS = E.POS, POS_CN = {PG:'控卫',SG:'分卫',SF:'小前',PF:'大前',C:'中锋'};
const SYS_DESC = {bal:'不偏重任何打法', pnr:'持球人和大个子挡拆，顺下或者分球', iso:'球交给最强的人一对一', post:'内线要位单打，外线等分球', motion:'无球跑动、空切、手递手', spread:'五人拉开，突破分球投三分'};
const esc = s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const clamp=(x,a,b)=>x<a?a:x>b?b:x;
const sn = p=>p.cn.includes('·')?p.cn.split('·').pop():p.cn;

// ---------- 数据 ----------
// W：联盟层面的状态（年份、选秀权、死钱、选秀、休赛期进度），和球员一起存进「联盟存档」
let PID=1;
let W={year:2026, picks:{}, dead:{}, off:null, centers:null, draftClass:[], mle:{}};
const TEAMS = TEAM_DATA.map((t,i)=>{
  const [abbr,enCity,enName,city,nick,conf,div,pop,colors]=t;
  const players = REAL_ROSTERS[abbr].map(r=>makePlayer(r));
  return {i, abbr, city, nick, cn:city+nick, conf, div, pop, colors, players};
});
const FREE = REAL_ROSTERS.FA.map(r=>makePlayer(r));
function birthYM(p){ const [by,bm]=p.born.split('-').map(Number); return [by,bm]; }
function ageOf(p, year){ const [by,bm]=birthYM(p); return (year||W.year)-by-(bm>10?1:0); }
function makePlayer(r){
  const [en,cn,pos,pos2,born,ht,ws,wt,nat,pot,dur,prof,a,c,jersey]=r;
  const A={}; KEYS.forEach((k,i)=>A[k]=a[i]);
  const p={id:PID++, en, cn, pos, pos2, born, jersey:jersey||'', ht, ws, wt, nat, pot, dur, prof, a:A, contract:c, hist:[]};
  p.age=ageOf(p,2026); p.ovr=calcOvr(p); p.pot=Math.max(p.pot,p.ovr); return p;
}
function calcOvr(p){ return E.ovrOf(p,OVR_W,OVR_STRETCH,KEYS); }
E.setCenters(TEAMS); W.centers=E.C;
let PBYID={};
function reindex(){ PBYID={}; TEAMS.forEach(t=>{ t.players.forEach(p=>PBYID[p.id]=p); t.top8=t.players.slice().sort((a,b)=>b.ovr-a.ovr).slice(0,8).reduce((s,p)=>s+p.ovr,0)/Math.max(1,Math.min(8,t.players.length)); t._rot=null; t._rkey=null; });
  FREE.forEach(p=>PBYID[p.id]=p); (W.draftClass||[]).forEach(p=>PBYID[p.id]=p); }
reindex();
TEAMS.forEach(t=>{ t.aiRot=E.autoRotation(t); t.aiTac=E.autoTactics(t,t.aiRot); });
// 薪资帽每季 +5%
function capMul(year){ return Math.pow(1.05, (year||W.year)-2026); }
function CFG(year){ const k=capMul(year), c=LEAGUE_CFG; return {cap:Math.round(c.cap*k), tax:Math.round(c.tax*k), apron1:Math.round(c.apron1*k), apron2:Math.round(c.apron2*k), minPayroll:Math.round(c.minPayroll*k), minSal:Math.round(c.minSal*k), maxSal:Math.round(c.maxSal*k), mleNT:Math.round(1500*k), mleTP:Math.round(606*k)}; }
function teamOfId(pid){ const p=PBYID[pid]; if(!p) return -3; const t=TEAMS.findIndex(t=>t.players.includes(p)); return t; }
// 某一季的工资总额：只算在那一季还有效的合同（exp ≥ year+1），双向合同不算，加上死钱
function payroll(t, year){ year=year||W.year; let s=0;
  t.players.forEach(p=>{ const c=p.contract; if(c && c[2]!=='tw' && c[1]>=year+1) s+=c[0]; });
  (W.dead[t.i]||[]).forEach(d=>{ if(d.exp>=year+1) s+=d.amt; }); return s; }

// ---------- 联盟存档 ----------
const WORLD_KEY='bbm_world_v1';
const PFIELDS=['id','en','cn','pos','pos2','born','jersey','ht','ws','wt','nat','pot','dur','prof','a','contract','ovr','hist','draft','fa','twoWay','rkOpt','rk1','rfa','sheet','mor','treq','tf','gx','sz'];
function saveWorld(){ try{
  const pl=[]; const put=(p,team)=>{ const o={}; PFIELDS.forEach(k=>{ if(p[k]!==undefined) o[k]=p[k]; }); o.team=team; pl.push(o); };
  TEAMS.forEach(t=>t.players.forEach(p=>put(p,t.i))); FREE.forEach(p=>put(p,-1));
  const w=Object.assign({},W,{draftClass:(W.draftClass||[]).map(p=>{ const o={}; PFIELDS.forEach(k=>{ if(p[k]!==undefined) o[k]=p[k]; }); o.scout=p.scout; o.drafted=p.drafted; return o; })});
  localStorage.setItem(WORLD_KEY, JSON.stringify({W:w, players:pl, PID}));
}catch(e){ console.error('saveWorld',e); } }
function loadWorld(){ try{
  const s=JSON.parse(localStorage.getItem(WORLD_KEY)||'null'); if(!s || !s.players) return false;
  W=s.W; PID=s.PID; if(W.centers) E.setC(W.centers);
  TEAMS.forEach(t=>t.players=[]); FREE.length=0;
  s.players.forEach(o=>{ const p=Object.assign({},o); delete p.team; p.age=ageOf(p); if(o.team>=0) TEAMS[o.team].players.push(p); else FREE.push(p); });
  W.draftClass=(W.draftClass||[]).map(o=>{ const p=Object.assign({},o); p.age=ageOf(p); return p; });
  const live={}; TEAMS.forEach(t=>t.players.forEach(p=>live[p.id]=p)); FREE.forEach(p=>live[p.id]=p);
  W.draftClass=W.draftClass.map(p=>live[p.id]||p);
  reindex(); return true;
}catch(e){ console.error('loadWorld',e); return false; } }

// ---------- 存档 ----------
const SAVE_KEY='bbm_v1';
let G = {team:null, rot:null, tac:null, view:'home', season:null, career:[], board:null, autoMine:false};
function save(){ try{ localStorage.setItem(SAVE_KEY, JSON.stringify({team:G.team, rot:G.rot, tac:G.tac, career:G.career, board:G.board, autoMine:G.autoMine})); }catch(e){} saveWorld(); }
function load(){ try{ const s=JSON.parse(localStorage.getItem(SAVE_KEY)||'null'); if(s && s.team!=null && TEAMS[s.team]){ loadWorld(); Object.assign(G,s); fixRot(); loadSeason(); if(!G.season) newSeason(W.year); applyPlayerState(); } }catch(e){ console.error(e); } }
function myTeam(){ return TEAMS[G.team]; }
function fixRot(){ // 存档里的球员 id 对不上时重置
  const t=myTeam(), ids=new Set(t.players.map(p=>p.id));
  if(G.rot && G.rot.starters && G.rot.starters.some(id=>!ids.has(id))) G.rot=null;
  if(G.rot){ G.rot.order=(G.rot.order||[]).filter(id=>ids.has(id)); t.players.forEach(p=>{ if(!G.rot.starters.includes(p.id) && !G.rot.order.includes(p.id)) G.rot.order.push(p.id); }); Object.keys(G.rot.minutes||{}).forEach(id=>{ if(!ids.has(+id)) delete G.rot.minutes[id]; }); t.players.forEach(p=>{ if(G.rot.minutes[p.id]==null) G.rot.minutes[p.id]=0; }); }
  if(!G.rot || !G.rot.starters.every(id=>ids.has(id)) || !G.rot.order.every(id=>ids.has(id))) G.rot=E.autoRotation(t);
  if(!G.tac) G.tac=E.autoTactics(t,G.rot);
  G.tac.stars=(G.tac.stars||[]).filter(id=>ids.has(id)); G.tac.matchups={};
  if(G.tac.defense==='zone') G.tac.defense='zone23'; if(!G.tac.pnrD) G.tac.pnrD='std'; G.tac.double=null;
  ['closers','small'].forEach(k=>{ if(G.rot[k] && !G.rot[k].every(id=>ids.has(id))) G.rot[k]=null; }); if(!G.rot.tend) G.rot.tend={};
}

// ---------- 小部件 ----------
function logo(t,sz){ const c=t.i%6, r=Math.floor(t.i/6); return `<span class="logo" style="width:${sz}px;height:${sz}px;background-position:${c*20}% ${r*25}%" title="${esc(t.cn)}"></span>`; }
function ovrCol(v){ return v>=90?'#ff8a1f':v>=84?'#ffc043':v>=78?'#7fd36b':v>=72?'#5fb3e0':'#8b98a8'; }
function ovrTag(v){ return `<span class="ovr" style="background:${ovrCol(v)}">${v}</span>`; }
function attrCol(v){ return v>=85?'#00c276':v>=72?'#9bd35a':v>=58?'#f0a020':'#e5484d'; }
function bar(v,max,col){ return `<div class="bar"><i style="width:${clamp(v/max*100,0,100)}%;background:${col}"></i></div>`; }
function money(w){ return w>=10000? (w/10000).toFixed(2)+' 亿' : w+' 万'; }
function contractTxt(c){ if(!c) return '无合同'; const t={std:'',rk:'新秀',tw:'双向'}[c[2]]; return `${money(c[0])} · 至 ${c[1]}${t?' · '+t:''}`; }
const ICON={
  roster:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="6" cy="5" r="2.5"/><path d="M1.5 14c.5-3 2.3-4.5 4.5-4.5s4 1.5 4.5 4.5"/><circle cx="11.5" cy="5.5" r="2"/><path d="M11 9.5c2 0 3.2 1.3 3.6 3.8"/></svg>',
  rot:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 5h9M8 2l3 3-3 3"/><path d="M14 11H5M8 8l-3 3 3 3"/></svg>',
  tac:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="1.5" y="2" width="13" height="12" rx="1.5"/><circle cx="5" cy="6" r="1.2"/><path d="M9 5l2 2M11 5l-2 2M5 11c2-3 4 0 6-2"/></svg>',
  match:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="8" r="6.3"/><path d="M1.7 8h12.6M8 1.7v12.6M3.3 3.6c2.2 1.8 2.2 7 0 8.8M12.7 3.6c-2.2 1.8-2.2 7 0 8.8"/></svg>',
  swap:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 8a5 5 0 0 1 9-3M13 8a5 5 0 0 1-9 3"/><path d="M12 2v3h-3M4 14v-3h3"/></svg>',
};

// ---------- 框架 ----------
function render(){
  const tb=document.getElementById('tb-logo'), tn=document.getElementById('tb-name'), ts=document.getElementById('tb-stats');
  const side=document.getElementById('side'), v=document.getElementById('view');
  if(G.team==null){ tb.innerHTML=''; tn.innerHTML=`篮球经理<small>${W.year}-${String((W.year+1)%100).padStart(2,'0')} 赛季 · 选择你执教的球队</small>`; ts.innerHTML=''; side.style.display='none'; vPick(v); return; }
  const t=myTeam(), S=G.season; side.style.display='';
  tb.innerHTML=logo(t,34); tn.innerHTML=`${esc(t.cn)}<small>${t.conf}部 · ${t.div}赛区</small>`;
  const r=standings()[G.team];
  ts.innerHTML=`<div class="tb-stat"><b>${dateTxt(Math.min(S.day,REG_DAYS+80),true)}</b><span>${phaseTxt()}</span></div><div class="tb-stat"><b>${r.w}-${r.l}</b><span>战绩</span></div><div class="tb-stat"><b style="color:${S.board.conf>=50?'var(--good)':S.board.conf>=25?'var(--warn)':'var(--bad)'}">${S.board.conf}</b><span>老板信任</span></div>`;
  const navs=[['home','首页'],['roster','阵容'],['rot','轮换'],['tac','战术'],['train','训练'],['trade','交易'],['fa','自由球员'],['scout','球探'],['sched','赛程'],['stand','战绩榜'],['stats','数据'],['events','赛事'],['po','季后赛'],['career','生涯']];
  if(W.off){ navs.unshift(['off','休赛期']); if(G.view==='home') G.view='off'; }
  if(LIVE) navs.splice(1,0,['match','直播']);
  side.innerHTML=navs.map(([k,n])=>`<div class="nav ${G.view===k?'on':''}" data-v="${k}">${ICON[k]||ICON.match}<span>${n}</span></div>`).join('');
  side.querySelectorAll('.nav').forEach(el=>el.onclick=()=>{ const k=el.dataset.v;
    if(LIVE && !LIVE.M.done && k!=='match') pauseLive();
    G.view=k; render(); });
  if(G.view==='match' && !LIVE) G.view='home';
  if(G.view==='off' && !W.off) G.view='home';
  ({home:vHome, roster:vRoster, rot:vRot, tac:vTac, match:vLive, sched:vSched, stand:vStand, stats:vStats, po:vPO, career:vCareer, off:vOff, trade:vTrade, fa:vFA, train:vTrain, scout:vScout, events:vEvents})[G.view](v);
}
function phaseTxt(){ const S=G.season; if(W.off) return '休赛期'; return {reg:'常规赛',playin:'附加赛',po:'季后赛',done:'赛季结束'}[S.phase]; }
function confirmLeave(){ try{ return window.confirm('这场比赛还没打完，离开就算放弃。确定吗？'); }catch(e){ return true; } }

// ---------- 选队 ----------
function vPick(v){
  const east=TEAMS.filter(t=>t.conf==='东'), west=TEAMS.filter(t=>t.conf==='西');
  const card=t=>{ const best=t.players.slice().sort((a,b)=>b.ovr-a.ovr)[0];
    return `<div class="tcard" data-i="${t.i}">${logo(t,44)}<div><b>${esc(t.cn)}</b><span>前 8 人均值 ${t.top8.toFixed(1)} · ${esc(sn(best))} ${best.ovr}</span></div></div>`; };
  v.innerHTML=`<h1>选择球队</h1><div class="sub">2026-27 赛季季前，阵容来自 2K27，合同来自 BBGM 名单</div>
    <h2>东部</h2><div class="tgrid">${east.map(card).join('')}</div><h2>西部</h2><div class="tgrid">${west.map(card).join('')}</div><div style="margin-top:18px">${installCardHTML()}</div>`; bindInstallCard(v);
  v.querySelectorAll('.tcard').forEach(el=>el.onclick=()=>{ G.team=+el.dataset.i; G.rot=null; G.tac=null; fixRot();
    const S=G.season;
    if(S && S.phase==='done' && !W.off){ G.board={conf:55}; S.fired=false; startOffseason(); G.view='off'; }       // 赛季末换队：带新球队进休赛期
    else if(S && !W.off && S.phase!=='done'){ S.fired=false; const rank=TEAMS.slice().sort((a,b)=>b.top8-a.top8).findIndex(t=>t.i===G.team)+1; const tier=rank<=3?0:rank<=8?1:rank<=16?2:rank<=22?3:4;
      S.board={rank,tier,conf:55}; S.inbox.push({d:S.day,t:'新的工作',b:`你接手了${TEAMS[G.team].cn}。老板的要求：${GOALS[tier].txt}。`}); G.view='home'; }   // 赛季中途接手
    else if(W.off){ G.view='off'; }
    else { G.board=null; newSeason(W.year); G.view='home'; }
    save(); render(); });
}

// ---------- 阵容 ----------
let SORT={k:'ovr',d:-1};
function vRoster(v){
  const t=myTeam();
  const cols=[['cn','球员'],['pos','位置'],['age','年龄'],['ovr','总评'],['pot','潜力'],['cond','状态'],['mor','士气'],['gp','出场'],['ppg','得分'],['rpg','篮板'],['apg','助攻'],['three','三分'],['finish','终结'],['pass','传球'],['perD','外防'],['intD','内防'],['sal','年薪'],['exp','到期']];
  const S=G.season, st=p=>S.ps[p.id];
  const val=(p,k)=>k==='sal'?(p.contract?p.contract[0]:0):k==='exp'?(p.contract?p.contract[1]:0):k==='cond'?(S.cond[p.id]==null?100:S.cond[p.id]):k==='mor'?mor(p):k==='gp'?(st(p)?st(p).g:0):k==='ppg'?(st(p)&&st(p).g?st(p).pts/st(p).g:0):k==='rpg'?(st(p)&&st(p).g?(st(p).oreb+st(p).dreb)/st(p).g:0):k==='apg'?(st(p)&&st(p).g?st(p).ast/st(p).g:0):k in p.a?p.a[k]:p[k];
  const ps=t.players.slice().sort((a,b)=>{const x=val(a,SORT.k),y=val(b,SORT.k); return (x>y?1:x<y?-1:0)*SORT.d;});
  const pay=payroll(t);
  v.innerHTML=`<h1>阵容</h1><div class="sub">${t.players.length} 人 · 工资总额 ${money(pay)}（工资帽 ${money(CFG().cap)}，奢侈税线 ${money(CFG().tax)}，第二土豪线 ${money(CFG().apron2)}）· 点表头排序，点球员看详情</div>
   <div class="card tw"><table><thead><tr>${cols.map(([k,n])=>`<th class="${k==='cn'||k==='pos'?'':'n'}" data-k="${k}" style="cursor:pointer">${n}${SORT.k===k?(SORT.d<0?' ↓':' ↑'):''}</th>`).join('')}</tr></thead><tbody>
   ${ps.map(p=>`<tr class="cl" data-id="${p.id}"><td><b>${esc(p.cn)}</b>${injTag(p)}</td><td>${p.pos}${p.pos2.length?'/'+p.pos2.join('/'):''}</td><td class="n">${p.age}</td>
     <td class="n">${ovrTag(p.ovr)}</td><td class="n">${p.pot}</td><td class="n">${Math.round(val(p,'cond'))}</td><td class="n">${morTag(p)}</td><td class="n">${val(p,'gp')}</td><td class="n">${val(p,'ppg').toFixed(1)}</td><td class="n">${val(p,'rpg').toFixed(1)}</td><td class="n">${val(p,'apg').toFixed(1)}</td>
     ${['three','finish','pass','perD','intD'].map(k=>`<td class="n" style="color:${attrCol(p.a[k])}">${p.a[k]}</td>`).join('')}
     <td class="n">${p.contract?money(p.contract[0]):'-'}</td><td class="n">${p.contract?p.contract[1]+(p.contract[2]==='tw'?' 双向':p.contract[2]==='rk'?' 新秀':''):'-'}</td></tr>`).join('')}
   </tbody></table></div>`;
  v.querySelectorAll('th[data-k]').forEach(th=>th.onclick=()=>{ const k=th.dataset.k; SORT = SORT.k===k?{k,d:-SORT.d}:{k,d:(k==='cn'||k==='pos'?1:-1)}; vRoster(v); });
  // 表头的「球员」「位置」保持左对齐
  v.querySelectorAll('tr.cl').forEach(tr=>tr.onclick=()=>showPlayer(PBYID[tr.dataset.id]));
}
function showPlayer(p){
  const m=document.getElementById('modal');
  const pros=(W.draftClass||[]).includes(p) && !p.drafted;
  if(pros){ refreshScout(); const hw=SCOUT_HW[((W.scoutFocus||[]).includes(p.id)?5:scoutLevel(G.team))-1][0], r=srand(p.id*7+3);
    p={...p, a:Object.fromEntries(KEYS.map(k=>[k,clamp(Math.round(p.a[k]+(r()*2-1)*hw*1.5),20,99)]))}; }
  m.innerHTML=`<div class="modal"><div class="box">
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px">${pros?'':ovrTag(p.ovr)}<div><h1 style="margin:0">${esc(p.cn)}</h1>
    <div class="hint">${p.en!==p.cn?esc(p.en)+' · ':''}${POS_CN[p.pos]}${p.pos2.length?'（可打 '+p.pos2.map(x=>POS_CN[x]).join('、')+'）':''} · ${ageOf(p,(W.off?W.off.year:W.year))} 岁 · ${esc(p.nat)}</div></div>
    <div style="margin-left:auto;text-align:right">${pros?`<div>总评 <b>${rangeTxt(p.scout.o)}</b> · 潜力 <b>${rangeTxt(p.scout.p)}</b></div><div class="hint">球探报告，属性也有误差</div>`:`<div>潜力 <b>${p.pot}</b></div><div class="hint">${contractTxt(p.contract)}</div>${G.team!=null&&teamOfId(p.id)>=0?`<div class="hint">士气 ${morTag(p)}</div>`:''}`}</div></div>
    <div class="row" style="margin-bottom:10px;font-size:12px"><span>身高 <b>${p.ht}</b> cm</span><span>臂展 <b>${p.ws}</b> cm</span><span>体重 <b>${p.wt}</b> kg</span><span>出生 ${p.born}</span></div>
    ${ATTR_GROUPS.map(([g,ks])=>`<h2>${g}</h2><div class="attrs">${ks.map(k=>`<div class="attr"><span>${ATTR_CN[k]}</span><b style="color:${attrCol(p.a[k])}">${p.a[k]}</b></div>`).join('')}</div>`).join('')}
    ${(p.hist&&p.hist.length)?`<h2>生涯数据</h2><div class="tw"><table><thead><tr><th>赛季</th><th>球队</th><th class="n">出场</th><th class="n">时间</th><th class="n">得分</th><th class="n">篮板</th><th class="n">助攻</th><th class="n">抢断</th><th class="n">盖帽</th><th class="n">命中率</th><th class="n">三分%</th></tr></thead><tbody>${p.hist.map(h=>`<tr><td>${h[0]}-${String((h[0]+1)%100).padStart(2,'0')}${h[2]?' 季后赛':''}</td><td>${h[1]>=0&&TEAMS[h[1]]?logo(TEAMS[h[1]],14)+' '+esc(TEAMS[h[1]].nick):''}</td>${h.slice(3).map(x=>`<td class="n">${x}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`:''}${p.draft?`<p class="hint" style="margin-top:8px">${p.draft.year} 年第 ${p.draft.no} 顺位，被${TEAMS[p.draft.team]?TEAMS[p.draft.team].cn:''}选中</p>`:''}
    <div style="text-align:right;margin-top:14px"><button onclick="closeModal()">关闭</button></div></div></div>`;
  m.querySelector('.modal').onclick=e=>{ if(e.target.classList.contains('modal')) closeModal(); };
}
function closeModal(){ document.getElementById('modal').innerHTML=''; }

// ---------- 轮换 ----------
function vRot(v){
  const t=myTeam(), R=G.rot, P=id=>PBYID[id];
  const total=Object.values(R.minutes).reduce((a,b)=>a+(+b||0),0);
  const bench=R.order.filter(id=>!R.starters.includes(id));
  const optList=(cur,slot)=>t.players.slice().sort((a,b)=>b.ovr-a.ovr).map(p=>{ const f=E.posFit(p,slot);
      return `<option value="${p.id}" ${p.id===cur?'selected':''}>${esc(p.cn)}  ${p.pos} ${p.ovr}${f<1?'（适配 '+Math.round(f*100)+'%）':''}${p.injury>0?' 【伤】':''}</option>`; }).join('');
  const minInput=id=>`<input type="number" min="0" max="48" value="${R.minutes[id]||0}" data-min="${id}">`;
  R.tend=R.tend||{};
  const tendSel=id=>`<select data-tend="${id}">${[['1.35','多投'],['1','正常'],['0.65','少投']].map(([v,n])=>`<option value="${v}" ${String(R.tend[id]||1)===v?'selected':''}>${n}</option>`).join('')}</select>`;
  const lineupCard=(key,title,desc)=>{ const Lu=R[key];
    return `<div class="card tw"><h3>${title} <span class="r">${desc}</span></h3>
      ${Lu?`<table><tbody>${POS.map((ps,i)=>{ const p=P(Lu[i]), f=E.posFit(p,ps); return `<tr><td><b>${ps}</b> <span class="hint">${POS_CN[ps]}</span></td><td><select data-lu="${key}" data-i="${i}">${optList(Lu[i],ps)}</select></td><td class="n">${ovrTag(p.ovr)}</td><td class="n ${f<1?(f<.8?'bad':'warn'):''}">${Math.round(f*100)}%</td></tr>`; }).join('')}</tbody></table>`:''}
      <div style="margin-top:8px">${Lu?`<button class="sm" data-luclear="${key}">取消这套阵容</button>`:`<button class="sm" data-luset="${key}">设置这套阵容（先用首发填上）</button>`}</div></div>`; };
  v.innerHTML=`<h1>轮换</h1><div class="sub">首发五人、替补顺序、每人目标上场时间。比赛里系统按这张表换人，体能太低、犯规太多时会提前换下。有人受伤时，系统会临时找人顶替首发，并把他的时间分给其他人。</div>
   <div class="card"><h3>上场时间合计 <span class="r" style="color:var(${total===240?'--good':'--bad'})"><b>${total}</b> / 240 分钟${total===240?'':'，开赛前需要调整到 240'}</span></h3>
     <button class="sm" id="rot-reset">按建议值重置</button></div>
   <div class="card tw"><h3>首发</h3><table><thead><tr><th>位置</th><th>球员</th><th class="n">总评</th><th class="n">适配</th><th class="n">目标分钟</th><th>出手</th></tr></thead><tbody>
   ${R.starters.map((id,i)=>{ const p=P(id), f=E.posFit(p,POS[i]); return `<tr><td><b>${POS[i]}</b> <span class="hint">${POS_CN[POS[i]]}</span></td>
     <td><select data-st="${i}">${optList(id,POS[i])}</select></td><td class="n">${ovrTag(p.ovr)}</td>
     <td class="n ${f<1?(f<.8?'bad':'warn'):''}">${Math.round(f*100)}%</td><td class="n">${minInput(id)}</td><td>${tendSel(id)}</td></tr>`; }).join('')}
   </tbody></table></div>
   <div class="card tw"><h3>替补（按上场顺序）</h3><table><thead><tr><th>#</th><th>球员</th><th>位置</th><th class="n">总评</th><th class="n">目标分钟</th><th>出手</th><th></th></tr></thead><tbody>
   ${bench.map((id,i)=>{ const p=P(id); return `<tr><td>${i+6}</td><td class="cl" data-id="${id}"><b>${esc(p.cn)}</b>${injTag(p)}</td><td>${p.pos}${p.pos2.length?'/'+p.pos2.join('/'):''}</td>
     <td class="n">${ovrTag(p.ovr)}</td><td class="n">${minInput(id)}</td><td>${tendSel(id)}</td>
     <td><button class="sm" data-up="${i}" ${i===0?'disabled':''}>上移</button> <button class="sm" data-dn="${i}" ${i===bench.length-1?'disabled':''}>下移</button></td></tr>`; }).join('')}
   </tbody></table></div>
   ${lineupCard('closers','关门阵容','第 4 节最后 5 分钟、分差 10 分以内时整组换上')}${lineupCard('small','小球阵容','在战术页打开以后，第 2、4 节中段整组换上一次')}`;
  v.querySelector('#rot-reset').onclick=()=>{ G.rot=E.autoRotation(t); save(); vRot(v); };
  v.querySelectorAll('select[data-st]').forEach(s=>s.onchange=()=>{ const i=+s.dataset.st, nid=+s.value, old=R.starters[i];
    const j=R.starters.indexOf(nid); if(j>=0) R.starters[j]=old;         // 已在首发：两人换位
    R.starters[i]=nid; R.order=[...R.order.filter(x=>x!==nid && !R.starters.includes(x)), ...(j<0?[old]:[])].filter(x=>!R.starters.includes(x));
    t.players.forEach(p=>{ if(!R.starters.includes(p.id) && !R.order.includes(p.id)) R.order.push(p.id); });
    save(); vRot(v); });
  v.querySelectorAll('input[data-min]').forEach(inp=>inp.onchange=()=>{ R.minutes[inp.dataset.min]=clamp(Math.round(+inp.value||0),0,48); save(); vRot(v); });
  const mv=(i,d)=>{ const b=R.order.filter(id=>!R.starters.includes(id)); [b[i],b[i+d]]=[b[i+d],b[i]]; R.order=b; save(); vRot(v); };
  v.querySelectorAll('button[data-up]').forEach(b=>b.onclick=()=>mv(+b.dataset.up,-1));
  v.querySelectorAll('button[data-dn]').forEach(b=>b.onclick=()=>mv(+b.dataset.dn,1));
  v.querySelectorAll('td[data-id]').forEach(td=>td.onclick=()=>showPlayer(PBYID[td.dataset.id]));
  v.querySelectorAll('select[data-tend]').forEach(s=>s.onchange=()=>{ const x=+s.value; if(x===1) delete R.tend[s.dataset.tend]; else R.tend[s.dataset.tend]=x; save(); });
  v.querySelectorAll('[data-luset]').forEach(b=>b.onclick=()=>{ R[b.dataset.luset]=R.starters.slice(); save(); vRot(v); });
  v.querySelectorAll('[data-luclear]').forEach(b=>b.onclick=()=>{ R[b.dataset.luclear]=null; if(b.dataset.luclear==='small') G.tac.smallOn=false; save(); vRot(v); });
  v.querySelectorAll('select[data-lu]').forEach(s=>s.onchange=()=>{ const Lu=R[s.dataset.lu], i=+s.dataset.i, nid=+s.value, j=Lu.indexOf(nid); if(j>=0) Lu[j]=Lu[i]; Lu[i]=nid; save(); vRot(v); });
}

// ---------- 战术 ----------
function compsOf(ids){ return ids.map(id=>{ const p=PBYID[id]; return Object.assign(E.composite(p),{oiqRaw:p.a.oiq/100}); }); }
const DEF_DESC={man:'每人盯一个，按位置对位或者按重点盯防', zone23:'护内线：对方篮下命中下降，但三分出手变多，后场篮板略差', zone32:'护外线：对方三分命中下降，但篮下更容易，前场篮板也更容易被抢', zone131:'逼抢传球路线：对方失误增加，但底角三分和篮下有漏洞，体能消耗略大', press:'全场上抢：对方失误增加，但自己犯规多、体能消耗大，被打穿就是轻松上篮'};
const PNR_DESC={std:'不做特殊处理', drop:'大个子退守篮下：对方持球人更多投中投和三分，突破变少', hedge:'大个子上提：对方挡拆失误增加，但顺下的人更容易得手，大个子更累', switch:'直接换人：对方会找错位，身高差越大，背身越占便宜', blitz:'两人夹击持球人：对方失误增加、核心出手减少，但空位三分和篮下 4 打 3 会变多，自己更累'};
function tacticsHTML(tac, starters, smallRow){
  const comps=compsOf(starters);
  const seg=(key,opts)=>`<div class="seg">${opts.map(([k,n])=>`<button class="${(key==='smallOn'?(tac.smallOn?'on':'off'):tac[key])===k?'on':''}" data-tk="${key}" data-tv="${k}">${n}</button>`).join('')}</div>`;
  return `<div class="card"><h3>进攻体系 <span class="r">契合度按当前首发五人计算</span></h3><div class="sysgrid">
    ${Object.entries(E.SYSTEMS).map(([k,s])=>{ const f=E.systemFit(k,comps); return `<div class="syscard ${tac.system===k?'on':''}" data-sys="${k}"><b>${s.name}</b>
      <div class="fitbar" style="margin-top:4px">${bar(f,1,f>=.6?'#00c276':f>=.4?'#f0a020':'#e5484d')}<span class="hint">${k==='bal'?'—':Math.round(f*100)+'%'}</span></div><p>${SYS_DESC[k]}</p></div>`; }).join('')}
    </div></div>
    <div class="card"><div style="display:grid;grid-template-columns:auto 1fr;gap:10px 14px;align-items:center">
      <span>节奏</span>${seg('pace',[['slow','慢'],['mid','中'],['fast','快']])}
      <span>进攻重心</span>${seg('focus',[['three','三分'],['bal','均衡'],['inside','内线']])}
      <span>防守方式</span>${seg('defense',[['man','人盯人'],['zone23','2-3 联防'],['zone32','3-2 联防'],['zone131','1-3-1 联防'],['press','全场紧逼']])}
      <span></span><span class="hint">${DEF_DESC[tac.defense]||''}</span>
      <span>挡拆防守</span>${seg('pnrD',[['std','标准'],['drop','沉退'],['hedge','上提'],['switch','换防'],['blitz','包夹']])}
      <span></span><span class="hint">${PNR_DESC[tac.pnrD||'std']}</span>
      <span>篮板策略</span>${seg('reb',[['crash','冲抢前场'],['bal','均衡'],['back','退防']])}
      ${smallRow?`<span>小球阵容</span>${seg('smallOn',[['off','不用'],['on','第 2、4 节中段换上']])}`:''}
    </div></div>`;
}
function bindTactics(root, tac, onChange){
  root.querySelectorAll('[data-tk]').forEach(b=>b.onclick=()=>{ const k=b.dataset.tk; tac[k]= k==='smallOn'? b.dataset.tv==='on' : b.dataset.tv; onChange(); });
  root.querySelectorAll('[data-sys]').forEach(b=>b.onclick=()=>{ tac.system=b.dataset.sys; onChange(); });
}
function vTac(v){
  const t=myTeam(), tac=G.tac;
  const rotIds=[...G.rot.starters, ...G.rot.order].filter(id=>(G.rot.minutes[id]||0)>0);
  v.innerHTML=`<h1>战术</h1><div class="sub">比赛中暂停时也可以随时改</div>${tacticsHTML(tac,G.rot.starters,!!G.rot.small)}
    <div class="card"><h3>核心球员 <span class="r">最多 2 人，出手机会增加</span></h3><div class="row">
    ${rotIds.map(id=>{ const p=PBYID[id]; return `<button class="sm ${tac.stars.includes(id)?'on':''}" data-star="${id}">${esc(p.cn)} ${p.ovr}</button>`; }).join('')}</div></div>`;
  const ug=nextUserGame();
  if(ug){ const o=TEAMS[ug.opp]; v.insertAdjacentHTML('beforeend',`<div class="card tw"><h3>重点盯防：下一场对手 ${logo(o,18)} ${esc(o.cn)} <span class="r">只对下一场有效，不设就按位置对位</span></h3><table><tbody>
    ${G.rot.starters.map((id,i)=>{ const p=PBYID[id]; return `<tr><td>${POS_CN[POS[i]]} <b>${esc(p.cn)}</b></td><td><select data-mu="${id}"><option value="">按位置</option>${o.players.slice().sort((a,b)=>b.ovr-a.ovr).slice(0,10).map(q=>`<option value="${q.id}" ${PREP.mu[id]==q.id?'selected':''}>${esc(q.cn)} ${q.pos} ${q.ovr}</option>`).join('')}</select></td></tr>`; }).join('')}</tbody></table></div>`);
    v.insertAdjacentHTML('beforeend',`<div class="card"><h3>重点包夹 <span class="r">只对下一场有效。对方这名球员持球时有一半机会被夹击</span></h3><select id="dbl"><option value="">不包夹</option>${o.players.slice().sort((a,b)=>b.ovr-a.ovr).slice(0,8).map(q=>`<option value="${q.id}" ${PREP.dbl==q.id&&PREP.muFor===ug.key?'selected':''}>${esc(q.cn)} ${q.pos} ${q.ovr}</option>`).join('')}</select></div>`);
    if(PREP.muFor!==ug.key){ PREP.mu={}; PREP.dbl=null; PREP.muFor=ug.key; }
    v.querySelector('#dbl').onchange=e=>{ PREP.dbl=e.target.value?+e.target.value:null; };
    v.querySelectorAll('[data-mu]').forEach(s=>s.onchange=()=>{ if(s.value) PREP.mu[s.dataset.mu]=+s.value; else delete PREP.mu[s.dataset.mu]; }); }
  bindTactics(v, tac, ()=>{ save(); vTac(v); });
  v.querySelectorAll('[data-star]').forEach(b=>b.onclick=()=>{ const id=+b.dataset.star; const i=tac.stars.indexOf(id);
    if(i>=0) tac.stars.splice(i,1); else { tac.stars.push(id); if(tac.stars.length>2) tac.stars.shift(); } save(); vTac(v); });
}

// ---------- 比赛 ----------
let LIVE=null, PREP={mu:{}, muFor:null};
function startLive(){
  const S=G.season, ug=userGameToday(); if(!ug || LIVE) return;
  const h=ug.g?ug.g[1]:ug.h, a=ug.g?ug.g[2]:ug.a;
  applyPlayerState();
  const hs=sideFor(h), as=sideFor(a);
  const mine = h===G.team? hs : as; mine.tactics.matchups = PREP.muFor===ugKey(ug)? Object.assign({},PREP.mu) : {}; mine.tactics.double = PREP.muFor===ugKey(ug)? PREP.dbl : null;
  const M=E.createMatch(hs, as, {record:true});
  M.userSide = h===G.team?0:1;
  LIVE={M, H:TEAMS[h], A:TEAMS[a], shown:0, playing:false, speed:1, acc:0, last:0, raf:0, tab:'pbp', dots:[], finished:false, label:ug.label||'常规赛', showNames:true};
  LIVE.frame=tipFrame(M); LIVE.pos=Object.assign({},LIVE.frame.pos); LIVE.ball=LIVE.frame.ball.slice(); LIVE.holder=null;
  G.view='match'; render(); setTimeout(()=>playLive(true),300);
}
function ugKey(ug){ return ug.g? 'r'+ug.n : ug.key; }
function quickUserGame(){ if(LIVE) return; playDay(null); afterDay(); }
function stopLive(){ if(LIVE){ cancelAnimationFrame(LIVE.raf); LIVE.playing=false; } }
function pauseLive(){ if(LIVE){ if(LIVE.playing && LIVE.scene) LIVE.pausedAt=performance.now()-LIVE.sceneStart; LIVE.playing=false; cancelAnimationFrame(LIVE.raf); updCtrl(); } }
function playLive(on){
  if(!LIVE || LIVE.M.done) return;
  LIVE.playing=on; updCtrl();
  if(on){ const now=performance.now(); LIVE.last=now; LIVE.acc=0; if(LIVE.scene && LIVE.pausedAt!=null){ LIVE.sceneStart=now-LIVE.pausedAt; } LIVE.pausedAt=null; LIVE.raf=requestAnimationFrame(tick); } else { if(LIVE.scene) LIVE.pausedAt=performance.now()-LIVE.sceneStart; cancelAnimationFrame(LIVE.raf); }
}
function finishLive(){
  const L=LIVE; if(L.finished) return; L.finished=true; L.playing=false;
  playDay(L.M);                       // 结果落地，并把当天其他比赛跑完
  L.tab='box'; render();
}

function nameOf(id){ const p=PBYID[id]; return p?sn(p):'?'; }
function teamOf(side){ return side===0?LIVE.H:LIVE.A; }
function clockTxt(q,c){ const m=Math.floor(c/60), s=Math.floor(c%60); return `${q<=4?'第'+q+'节':'加时'+(q-4)} ${m}:${String(s).padStart(2,'0')}`; }
const pick=a=>a[Math.floor(Math.random()*a.length)];
function pbpText(e){
  const n=nameOf(e.pid);
  switch(e.type){
    case 'made': { let s;
      if(e.shot==='three') s=pick([`${n} 三分出手，进了。`,`${n} 弧顶三分，命中。`,`${n} 底角三分，稳稳进了。`,`${n} 接球就投，三分命中。`]);
      else if(e.shot==='mid') s=pick([`${n} 中距离急停跳投，进。`,`${n} 罚球线附近干拔，命中。`,`${n} 侧翼跳投，进了。`]);
      else if(e.shot==='post') s=pick([`${n} 低位背身，转身勾手打进。`,`${n} 背打单吃，翻身跳投命中。`,`${n} 内线要位，一个假动作后打进。`]);
      else if(e.shot==='putback') s=pick([`${n} 补篮得手。`,`${n} 在人堆里把球补了进去。`]);
      else if(e.shot==='fast') s=pick([`${n} 快攻上篮。`,`${n} 一条龙推到底，轻松得分。`,`${n} 反击，没人追得上。`]);
      else if(e.shot==='heave') s=`${n} 超远距离硬扔……进了！`;
      else { const p=PBYID[e.pid]; s = p && p.a.dunk>=80 && Math.random()<.5 ? pick([`${n} 突破到篮下，扣了。`,`${n} 空中接力暴扣。`]) : pick([`${n} 突破上篮得手。`,`${n} 杀进内线，打进。`,`${n} 篮下拿下两分。`]); }
      if(e.ast) s+=`（${nameOf(e.ast)} 助攻）`;
      if(e.and1) s+=` ${nameOf(e.and1)} 犯规，加罚一次。`;
      return s; }
    case 'miss': return e.shot==='three'?pick([`${n} 三分不中。`,`${n} 三分出手，弹框而出。`,`${n} 外线投射偏了。`])
      : e.shot==='mid'?pick([`${n} 中投没进。`,`${n} 跳投偏出。`]) : e.shot==='post'?pick([`${n} 背身出手，没进。`,`${n} 勾手打铁。`])
      : e.shot==='heave'?`${n} 压哨远投，没进。` : pick([`${n} 上篮没进。`,`${n} 篮下出手滑框。`]);
    case 'blk': return pick([`${nameOf(e.by)} 把 ${n} 的出手盖了。`,`${n} 出手被 ${nameOf(e.by)} 封盖。`,`${nameOf(e.by)} 一记大帽，${n} 没打成。`]);
    case 'sfoul': return `${n} 出手时被 ${nameOf(e.by)} 犯规。`;
    case 'ft': return `${n} 罚球 ${e.n} 中 ${e.made}。`;
    case 'oreb': return pick([`${n} 抢到前场篮板。`,`${n} 冲进去拿下进攻篮板。`]);
    case 'dreb': return `${n} 后场篮板。`;
    case 'stl': return pick([`${nameOf(e.by)} 抢断 ${n}。`,`${n} 的球被 ${nameOf(e.by)} 掏走了。`,`${nameOf(e.by)} 读到传球路线，断了。`]);
    case 'tov': return pick([`${n} 失误。`,`${n} 传球出界。`,`${n} 走步。`,`${n} 进攻犯规。`]);
    case 'pf': return `${n} 犯规。`;
    case 'ifoul': return `${n} 故意犯规，把 ${nameOf(e.on)} 送上罚球线。`;
    case 'sub': return `换人：${nameOf(e.pin)} 替下 ${nameOf(e.pout)}。`;
    case 'timeout': return `${teamOf(e.t).cn} 叫了暂停。`;
    case 'small': return `${teamOf(e.t).nick} 换上小球阵容。`;
    case 'injury': return `${n} 受伤倒地，被扶下场。`;
    case 'foulout': return `${n} 六次犯规，被罚出场。`;
    default: return '';
  }
}

function vLive(v){
  const L=LIVE, M=L.M, H=L.H, A=L.A;
  v.innerHTML=`
   <div id="scoreboard"><div class="tn a"><span class="full">${esc(H.cn)}</span><span class="short">${esc(H.nick)}</span></div>${logo(H,40)}<div class="sc" id="sc">0 : 0</div>${logo(A,40)}<div class="tn"><span class="full">${esc(A.cn)}</span><span class="short">${esc(A.nick)}</span></div></div>
   <div id="sbinfo"><span class="hint">${esc(L.label)}</span><span id="clk"></span><span>犯规 <b id="tf">0 / 0</b></span><span>暂停 <b id="tos">7 / 7</b></span></div>
   <div class="row" style="margin-top:10px">
    <div class="col" style="min-width:300px;flex:1.3">
      <div id="courtwrap"><canvas id="court" width="940" height="500"></canvas></div>
      <div class="ctrl" id="ctrl"></div>
      <div id="qtable" class="card tw" style="margin-top:10px;padding:8px"></div>
    </div>
    <div class="col" style="min-width:280px">
      <div class="seg" style="margin-bottom:8px"><button data-tab="pbp" class="${L.tab==='pbp'?'on':''}">文字直播</button><button data-tab="box" class="${L.tab==='box'?'on':''}">技术统计</button><button data-tab="en" class="${L.tab==='en'?'on':''}">体能</button></div>
      <div class="card" style="padding:0" id="tabbody"></div>
    </div>
   </div>`;
  v.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{ L.tab=b.dataset.tab; v.querySelectorAll('[data-tab]').forEach(x=>x.classList.toggle('on',x===b)); renderTab(true); });
  L.shown=0; L.dots=[]; L.pbpHTML=[];
  sizeCourt(); updLive(true); updCtrl();
}
function updCtrl(){
  const c=document.getElementById('ctrl'); if(!c||!LIVE) return; const L=LIVE, M=L.M, us=M.userSide;
  if(L.finished){ const w=M.score[us]>M.score[1-us];
    c.innerHTML=`<b class="${w?'good':'bad'}" style="font-size:15px">${w?'赢了':'输了'} ${M.score[us]} : ${M.score[1-us]}${M.ot?'（'+M.ot+' 个加时）':''}</b>
      <button class="pri" id="back">返回首页</button>`;
    c.querySelector('#back').onclick=()=>{ LIVE=null; G.view='home'; render(); };
    return; }
  c.innerHTML=`<button class="pri" id="pp" style="min-width:80px">${L.playing?'暂停':'继续'}</button>
    <div class="seg">${[1,2,4,8].map(s=>`<button class="${L.speed===s?'on':''}" data-sp="${s}">${s}x</button>`).join('')}</div>
    <button id="end">直接出结果</button>
    <button id="to" ${M.timeouts[us]<=0?'disabled':''}>叫暂停（${M.timeouts[us]}）</button>
    <button id="subs">换人</button><button id="tacb">战术</button><button id="names" class="${L.showNames?'on':''}">名字</button>`;
  c.querySelector('#pp').onclick=()=>playLive(!L.playing);
  c.querySelector('#names').onclick=()=>{ L.showNames=!L.showNames; updCtrl(); drawCourt(); };
  c.querySelectorAll('[data-sp]').forEach(b=>b.onclick=()=>{ L.speed=+b.dataset.sp; updCtrl(); });
  c.querySelector('#end').onclick=simToEnd;
  c.querySelector('#to').onclick=()=>{ if(E.timeout(M,us)){ updLive(); pauseLive(); } };
  c.querySelector('#subs').onclick=()=>{ pauseLive(); subsModal(); };
  c.querySelector('#tacb').onclick=()=>{ pauseLive(); tacModal(); };
}
function updLive(full){
  const L=LIVE, M=L.M; if(!document.getElementById('sc')) return;
  document.getElementById('sc').textContent=`${M.score[0]} : ${M.score[1]}`;
  document.getElementById('clk').innerHTML=M.done?'<b>全场结束</b>':`<b>${clockTxt(M.q,M.clock)}</b>`;
  document.getElementById('tf').textContent=`${M.teamFouls[0]} / ${M.teamFouls[1]}`;
  document.getElementById('tos').textContent=`${M.timeouts[0]} / ${M.timeouts[1]}`;
  // 新事件
  const evs=M.events, upto = L.revealTo!=null? Math.min(L.revealTo, evs.length) : evs.length;
  for(let i=L.shown;i<upto;i++){
    const e=evs[i];
    if(e.type==='eoq'){ L.pbpHTML.unshift(`<div class="q">${e.q<=4?'第'+e.q+'节':'加时'+(e.q-4)}结束 ${esc(L.H.nick)} ${e.score[0]} : ${e.score[1]} ${esc(L.A.nick)}</div>`); continue; }
    if((e.type==='made'||e.type==='miss'||e.type==='blk') && e.x!=null) L.dots.push({t:e.t,x:e.x,y:e.y,made:e.type==='made',q:e.q});
    const txt=pbpText(e); if(!txt) continue;
    const scoring=e.type==='made'||(e.type==='ft'&&e.made>0);
    L.pbpHTML.unshift(`<div class="${scoring?'sc':''}"><span class="t">${e.q<=4?e.q+'节':'OT'} ${Math.floor(e.clock/60)}:${String(Math.floor(e.clock%60)).padStart(2,'0')}</span><span>${logo(teamOf(e.type==='stl'?1-e.t:e.t),16)} ${esc(txt)}${scoring?` <b style="color:var(--dim)">${e.score[0]}-${e.score[1]}</b>`:''}</span></div>`);
  }
  if(L.pbpHTML.length>400) L.pbpHTML.length=400;
  L.shown=upto;
  const ls=[...evs.slice(0,upto)].reverse().find(e=>e.score); L.dispScore = (upto>=evs.length||M.done)? M.score.slice() : (ls? ls.score : [0,0]);
  document.getElementById('sc').textContent=`${L.dispScore[0]} : ${L.dispScore[1]}`;
  drawCourt(); renderTab(full); renderQ(); updCtrl();
}
function renderQ(){
  const el=document.getElementById('qtable'); if(!el) return; const M=LIVE.M;
  const n=Math.max(4,M.q), cur=(s,i)=>{ const done=M.qScore[s][i]; if(done!=null) return done; if(i===M.q-1 && !M.done) return M.score[s]-M.qScore[s].reduce((a,b)=>a+b,0); return '-'; };
  el.innerHTML=`<table><thead><tr><th></th>${Array.from({length:n},(_,i)=>`<th class="n">${i<4?i+1:'OT'+(i-3)}</th>`).join('')}<th class="n">总分</th></tr></thead><tbody>
   ${[0,1].map(s=>`<tr><td>${logo(teamOf(s),16)} ${esc(teamOf(s).nick)}</td>${Array.from({length:n},(_,i)=>`<td class="n">${cur(s,i)}</td>`).join('')}<td class="n"><b>${M.score[s]}</b></td></tr>`).join('')}</tbody></table>`;
}
function renderTab(full){
  const b=document.getElementById('tabbody'); if(!b) return; const L=LIVE, M=L.M;
  if(L.tab==='pbp'){ b.innerHTML=`<div id="pbp">${L.pbpHTML.join('')||'<div class="hint">等待跳球</div>'}</div>`; return; }
  const bs=E.boxScore(M);
  if(L.tab==='en'){
    b.innerHTML=[0,1].map(s=>{ const T=M.teams[s]; return `<div style="padding:10px"><b>${logo(teamOf(s),16)} ${esc(teamOf(s).nick)}</b><table style="margin-top:6px"><tbody>
      ${T.men.filter(m=>!m.out||m.secs>0).sort((a,b)=>(T.on.includes(b)-T.on.includes(a))||b.secs-a.secs).map(m=>`<tr><td>${T.on.includes(m)?'<b style="color:var(--acc)">场上</b>':'<span class="hint">板凳</span>'}</td><td>${esc(sn(m.p))}</td>
        <td style="width:40%">${bar(m.energy,1,m.energy>.8?'#00c276':m.energy>.6?'#f0a020':'#e5484d')}</td><td class="n">${Math.round(m.secs/60)} / ${Math.round(m.target/60)}′</td><td class="n">${m.pf} 犯</td></tr>`).join('')}</tbody></table></div>`; }).join('');
    return; }
  b.innerHTML=boxHTML(bs, s=>teamOf(s), L.finished);
}
function boxHTML(bs, tOf, showMvp){
  let mvp=null; bs.forEach((t,side)=>t.players.forEach(p=>{ if(!mvp||p.gs>mvp.gs) mvp=Object.assign({t:side},p); }));
  return (showMvp&&mvp?`<div style="padding:10px 10px 0"><span class="hint">本场最佳</span> <b>${esc(PBYID[mvp.id].cn)}</b> ${mvp.pts} 分 ${mvp.oreb+mvp.dreb} 篮板 ${mvp.ast} 助攻</div>`:'')+
   bs.map((t,side)=>`<div class="tw" style="padding:10px"><b>${logo(tOf(side),16)} ${esc(tOf(side).nick)}</b> <span class="hint">${E.SYSTEMS[t.system].name}，契合度 ${Math.round(t.fit*100)}% · 快攻 ${t.st.fast} · 内线 ${t.st.paint} · 二次进攻 ${t.st.second} · 替补 ${t.st.bench}</span>
    <table style="margin-top:6px"><thead><tr><th>球员</th><th class="n">时间</th><th class="n">得分</th><th class="n">投篮</th><th class="n">三分</th><th class="n">罚球</th><th class="n">篮板</th><th class="n">助攻</th><th class="n">抢断</th><th class="n">盖帽</th><th class="n">失误</th><th class="n">犯规</th><th class="n">+/-</th></tr></thead><tbody>
    ${t.players.sort((a,b)=>b.starter-a.starter||b.min-a.min).map(p=>`<tr><td>${p.starter?'<b>':''}${esc(sn(PBYID[p.id]))}${p.starter?'</b>':''}${p.inj?' <span class="bad">伤</span>':''}</td>
      <td class="n">${Math.round(p.min)}</td><td class="n"><b>${p.pts}</b></td><td class="n">${p.fgm}-${p.fga}</td><td class="n">${p.tpm}-${p.tpa}</td><td class="n">${p.ftm}-${p.fta}</td>
      <td class="n">${p.oreb+p.dreb}</td><td class="n">${p.ast}</td><td class="n">${p.stl}</td><td class="n">${p.blk}</td><td class="n">${p.tov}</td><td class="n">${p.pf}</td><td class="n">${p.pm>0?'+':''}${p.pm}</td></tr>`).join('')}
    <tr><td class="hint">合计</td><td></td><td class="n"><b>${t.pts}</b></td>${(()=>{const s=k=>t.players.reduce((a,p)=>a+p[k],0); const fg=s('fgm')+'-'+s('fga'), pct=s('fga')?Math.round(s('fgm')/s('fga')*100):0;
      return `<td class="n">${fg} <span class="hint">${pct}%</span></td><td class="n">${s('tpm')}-${s('tpa')}</td><td class="n">${s('ftm')}-${s('fta')}</td><td class="n">${s('oreb')+s('dreb')}</td><td class="n">${s('ast')}</td><td class="n">${s('stl')}</td><td class="n">${s('blk')}</td><td class="n">${s('tov')}</td><td class="n">${s('pf')}</td><td></td>`;})()}</tr>
    </tbody></table></div>`).join('');
}

// ---------- 球场 ----------
function sizeCourt(){ const c=document.getElementById('court'); if(!c) return; const w=c.clientWidth||600; c.width=Math.round(w*2); c.height=Math.round(w*2*50/94); }
window.addEventListener('resize',()=>{ if(LIVE && document.getElementById('court')){ sizeCourt(); drawCourt(); } });
function colorOf(t, side){
  const hex=h=>{ const n=parseInt(h.slice(1),16); return [n>>16&255,n>>8&255,n&255]; };
  const lum=h=>{ const [r,g,b]=hex(h); return .299*r+.587*g+.114*b; };
  let c=t.colors.find(x=>lum(x)>60 && lum(x)<235) || t.colors[0];
  if(side===1){ const o=teamOf(0); const oc=o.colors.find(x=>lum(x)>60 && lum(x)<235)||o.colors[0];
    if(oc.toLowerCase()===c.toLowerCase()) c = t.colors.find(x=>x.toLowerCase()!==c.toLowerCase() && lum(x)>60) || '#ffffff'; }
  return lum(c)<60? '#dddddd' : c;
}

// ---------- 比赛中的弹窗 ----------
function subsModal(){
  const M=LIVE.M, us=M.userSide, T=M.teams[us]; let out=null;
  const draw=()=>{
    const m=document.getElementById('modal');
    const row=(x,sel)=>`<tr class="selrow ${sel?'sel':''}" data-id="${x.id}"><td>${x.slot?'<b>'+x.slot+'</b>':''}</td><td><b>${esc(x.p.cn)}</b> <span class="hint">${x.p.pos} ${x.p.ovr}</span></td>
      <td style="width:28%">${bar(x.energy,1,x.energy>.8?'#00c276':x.energy>.6?'#f0a020':'#e5484d')}</td><td class="n">${Math.round(x.secs/60)}′/${Math.round(x.target/60)}′</td><td class="n">${x.pts} 分</td><td class="n ${x.pf>=4?'bad':''}">${x.pf} 犯</td></tr>`;
    const bench=T.men.filter(x=>!T.on.includes(x)&&!x.out);
    m.innerHTML=`<div class="modal"><div class="box"><h1>换人</h1><div class="sub">${out?'再点一个替补换上':'先点要换下的场上球员'}</div>
      <div class="card tw"><h3>场上</h3><table><tbody>${T.on.map(x=>row(x,out===x.id)).join('')}</tbody></table></div>
      <div class="card tw"><h3>板凳</h3><table><tbody>${bench.map(x=>row(x,false)).join('')}</tbody></table></div>
      <div class="row" style="justify-content:space-between;align-items:center"><label class="hint"><input type="checkbox" id="autosub" ${M.autoSubs!==false?'checked':''}> 按轮换表自动换人</label><button class="pri" onclick="closeModal();updLive()">完成</button></div></div></div>`;
    m.querySelectorAll('.selrow').forEach(tr=>tr.onclick=()=>{ const id=+tr.dataset.id; const onCourt=T.on.some(x=>x.id===id);
      if(onCourt){ out=id; draw(); } else if(out){ E.manualSub(M,us,out,id); out=null; draw(); } });
    m.querySelector('#autosub').onchange=e=>{ M.autoSubs=e.target.checked; };
  };
  draw();
}
function tacModal(){
  const M=LIVE.M, us=M.userSide, T=M.teams[us], tac=T.tac;
  const draw=()=>{
    const m=document.getElementById('modal');
    const OT=M.teams[1-us];
    m.innerHTML=`<div class="modal"><div class="box"><h1>战术</h1><div class="sub">改动立刻生效，契合度按场上五人计算</div>${tacticsHTML(tac, T.on.map(x=>x.id), !!(T.rot&&T.rot.small))}
      <div class="card"><h3>重点包夹</h3><select id="dbl2"><option value="">不包夹</option>${OT.men.slice().sort((a,b)=>b.p.ovr-a.p.ovr).slice(0,8).map(x=>`<option value="${x.id}" ${tac.double===x.id?'selected':''}>${esc(x.p.cn)} ${x.p.pos} ${x.p.ovr}</option>`).join('')}</select></div>
      <div style="text-align:right"><button class="pri" id="tdone">完成</button></div></div></div>`;
    bindTactics(m, tac, ()=>{ T.dirty=true; draw(); });
    m.querySelector('#dbl2').onchange=e=>{ tac.double=e.target.value?+e.target.value:null; };
    m.querySelector('#tdone').onclick=()=>{ closeModal(); updLive(); };
  };
  draw();
}


