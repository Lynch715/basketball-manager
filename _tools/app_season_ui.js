// ================= 赛季界面 =================
Object.assign(ICON,{
  home:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 7.5 8 2.5l6 5"/><path d="M3.5 6.5V14h9V6.5"/><path d="M6.5 14v-4h3v4"/></svg>',
  sched:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="1.5" y="3" width="13" height="11.5" rx="1.5"/><path d="M1.5 6.5h13M5 1.5v3M11 1.5v3"/></svg>',
  stand:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 3h12M2 6.5h12M2 10h12M2 13.5h12"/></svg>',
  stats:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 14V9M6 14V4M10 14V7M14 14V2"/></svg>',
  po:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4.5 2h7v3.5a3.5 3.5 0 0 1-7 0z"/><path d="M4.5 3.5H2v1a2.5 2.5 0 0 0 2.6 2.5M11.5 3.5H14v1a2.5 2.5 0 0 1-2.6 2.5"/><path d="M8 9v3M5 14h6"/></svg>',
  career:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="6" r="4"/><path d="M5.5 9.5 4.5 15 8 13l3.5 2-1-5.5"/></svg>',
});
function injTag(p){ return p.injury>0? ` <span class="pill" style="background:#3a1517;color:#ff8a8a">伤 ${p.injury>=300?'赛季':p.injury+'天'}</span>`:''; }
function nextUserGame(){
  const S=G.season; if(!S) return null;
  if(S.phase==='reg'){ const n=S.games.findIndex(g=>g[3]==null && (g[1]===G.team||g[2]===G.team)); const g=n>=0?S.games[n]:null;
    const ck=S.cup&&S.cup.ko&&S.cup.ko.find(x=>x.w==null&&x.h!=null&&(x.h===G.team||x.a===G.team));
    if(ck && (!g || ck.day<=g[0])) return {key:'cup'+ck.id, day:ck.day, home:ck.h===G.team, opp:ck.h===G.team?ck.a:ck.h, label:{qf:'NBA 杯 1/4 决赛',sf:'NBA 杯半决赛',f:'NBA 杯决赛'}[ck.rd]};
    if(!g) return null;
    return {n, key:'r'+n, day:g[0], home:g[1]===G.team, opp:g[1]===G.team?g[2]:g[1], label:g[6]==='cup'?'常规赛 · NBA 杯小组赛':'常规赛'}; }
  const t=userGameToday(); if(t) return {key:t.key, day:S.day, home:t.h===G.team, opp:t.h===G.team?t.a:t.h, label:t.label};
  return null;
}
let BUSY=false;
function afterDay(){ if(G.season.fired){ G.view='home'; } render(); }
async function advance(mode){
  if(BUSY||LIVE) return; const S=G.season; BUSY=true;
  const startDay=S.day, prog=document.getElementById('advprog');
  try{
    for(let guard=0; guard<500; guard++){
      if(S.phase==='done' || S.fired) break;
      if(userGameToday() && (mode==='day' || mode==='next' || !G.autoMine)) break;   // 轮到自己的比赛就停下
      playDay(null);
      if(prog) prog.textContent='模拟到 '+dateTxt(S.day);
      if(mode==='day') break;
      if(mode==='next' && userGameToday()) break;
      if(mode==='week' && S.day-startDay>=7) break;
      if(mode==='regular' && S.phase!=='reg') break;
      if(guard%2===0) await new Promise(r=>setTimeout(r,0));
    }
  } finally { BUSY=false; }
  afterDay();
}

// ---------- 首页 ----------
function vHome(v){
  const S=G.season, t=myTeam(), R=standings(), r=R[G.team];
  const cf=confRank(R,t.conf), seed=cf.findIndex(x=>x.i===G.team)+1;
  const ug=userGameToday(), ng=nextUserGame();
  let gameCard='';
  if(S.fired){
    gameCard=`<div class="card"><h3 class="bad">你被解雇了</h3><p>老板对球队失去了信心。你可以接手另一支球队，从新赛季开始。</p><div style="margin-top:10px"><button class="pri" id="newteam">选择新球队</button></div></div>`;
  } else if(S.phase==='done'){
    const f=S.userFinal||{};
    gameCard=`<div class="card"><h3>赛季结束 · 总冠军 ${logo(TEAMS[S.champion],22)} ${esc(TEAMS[S.champion].cn)}</h3>
      <p>你的球队：${f.w} 胜 ${f.l} 负，<b>${esc(f.res||'')}</b>。老板目标「${esc(GOALS[S.board.tier].txt)}」<b class="${f.met?'good':'bad'}">${f.met?(f.exceed?'超额完成':'完成'):'没有完成'}</b>，信任度 ${f.delta>0?'+':''}${f.delta}。</p>
      <p class="hint" style="margin-top:6px">接下来是休赛期：球员成长和退役、选秀、续约、自由市场。</p>
      <div style="margin-top:10px"><button class="pri" id="tooff">进入休赛期</button> <button id="newteam">换一支球队</button></div></div>`;
  } else if(ug){
    const h=ug.g?ug.g[1]:ug.h, a=ug.g?ug.g[2]:ug.a, o=TEAMS[h===G.team?a:h], orr=R[o.i];
    gameCard=`<div class="card"><h3>今天有比赛 <span class="r">${esc(ug.label||'常规赛')}</span></h3>
      <div style="display:flex;align-items:center;gap:14px;justify-content:center;margin:6px 0 12px">${logo(TEAMS[h],52)}<b>${esc(TEAMS[h].cn)}</b><span class="hint">主</span><span style="font-size:18px;color:var(--dim)">VS</span><span class="hint">客</span><b>${esc(TEAMS[a].cn)}</b>${logo(TEAMS[a],52)}</div>
      <div class="hint" style="text-align:center;margin-bottom:10px">${esc(o.cn)} ${orr.w}-${orr.l} · 前 8 人均值 ${o.top8.toFixed(1)}${ug.series?` · 系列赛 ${ug.series.h===G.team?ug.series.hw:ug.series.aw} : ${ug.series.h===G.team?ug.series.aw:ug.series.hw}`:''}</div>
      <div style="text-align:center"><button class="pri" id="golive" style="padding:9px 26px">看直播</button> <button id="goquick">直接出结果</button> <button id="gotac">先调战术</button></div></div>`;
  } else {
    gameCard=`<div class="card"><h3>下一场 <span class="r">${ng?esc(ng.label):''}</span></h3>${ng?`<div style="display:flex;align-items:center;gap:10px">${logo(TEAMS[ng.opp],36)}<div><b>${ng.home?'主场':'客场'} 对 ${esc(TEAMS[ng.opp].cn)}</b><div class="hint">${dateTxt(ng.day,true)}</div></div></div>`:'<div class="hint">暂时没有你的比赛</div>'}</div>`;
  }
  const adv = (S.phase==='done'||S.fired)?'':`<div class="card"><h3>推进 <span class="r" id="advprog"></span></h3><div class="ctrl" style="margin-top:0">
      <button data-adv="day" ${ug?'disabled':''}>下一天</button><button data-adv="next" ${ug?'disabled':''}>到下一场</button><button data-adv="week">模拟一周</button>
      <button data-adv="${S.phase==='reg'?'regular':'end'}">${S.phase==='reg'?'到常规赛结束':'到赛季结束'}</button>
      <label class="hint" style="margin-left:6px"><input type="checkbox" id="automine" ${G.autoMine?'checked':''}> 连续模拟时我的比赛直接出结果</label></div></div>`;
  const injured=t.players.filter(p=>p.injury>0);
  const recent=S.games.filter(g=>g[3]!=null && (g[1]===G.team||g[2]===G.team)).slice(-5).reverse();
  v.innerHTML=`<h1>${esc(t.cn)}</h1><div class="sub">${S.year}-${String((S.year+1)%100).padStart(2,'0')} 赛季 · ${dateTxt(Math.min(S.day,REG_DAYS+80),true)} · ${phaseTxt()} · ${r.w} 胜 ${r.l} 负，${t.conf}部第 ${seed}</div>
   <div class="row"><div class="col" style="min-width:300px;flex:1.4">${gameCard}${adv}
     <div class="card"><h3>收件箱</h3>${S.inbox.slice(-8).reverse().map(m=>`<div style="padding:7px 0;border-bottom:1px solid #1f2733"><b>${esc(m.t)}</b> <span class="hint">${dateTxt(Math.min(m.d,REG_DAYS+80))}</span><div class="hint" style="color:var(--txt);opacity:.85">${esc(m.b)}</div></div>`).join('')}</div></div>
   <div class="col" style="min-width:260px">
     ${offersHTML()}
     <div class="card"><h3>老板目标：${esc(GOALS[S.board.tier].name)} <span class="r">季前实力第 ${S.board.rank}</span></h3><p style="margin-bottom:8px">${esc(GOALS[S.board.tier].txt)}</p>
       <div class="fitbar">${bar(S.board.conf,100,S.board.conf>=50?'#00c276':S.board.conf>=25?'#f0a020':'#e5484d')}<b>${S.board.conf}</b></div><div class="hint" style="margin-top:4px">信任度低于 15 会被解雇</div></div>
     ${(()=>{ const m=tmeta(G.team), low=t.players.filter(p=>mor(p)<40||p.treq).sort((a,b)=>mor(a)-mor(b)).slice(0,4);
       return `<div class="card cl" id="lockerroom"><h3>更衣室 <span class="r">化学反应</span></h3><div class="fitbar">${bar(m.chem,100,m.chem>=60?'#00c276':m.chem>=40?'#f0a020':'#e5484d')}<b>${Math.round(m.chem)}</b></div>
       ${low.length?`<div style="margin-top:6px">${low.map(p=>`<div>${esc(p.cn)} <span class="hint">士气</span> ${morTag(p)}</div>`).join('')}</div>`:'<div class="hint" style="margin-top:6px">没人闹情绪</div>'}</div>`; })()}
     <div class="card"><h3>最近战绩</h3>${recent.length?recent.map(g=>{ const home=g[1]===G.team, my=home?g[3]:g[4], op=home?g[4]:g[3], o=TEAMS[home?g[2]:g[1]];
        return `<div class="cl" data-box="r${S.games.indexOf(g)}" style="display:flex;gap:8px;align-items:center;padding:4px 0;cursor:pointer"><span class="pill" style="background:${my>op?'#0a5c3a':'#5c1a1d'}">${my>op?'胜':'负'}</span>${logo(o,18)} ${home?'':'@'}${esc(o.nick)} <b style="margin-left:auto">${my}-${op}</b></div>`; }).join(''):'<div class="hint">还没打比赛</div>'}</div>
     <div class="card"><h3>伤病</h3>${injured.length?injured.map(p=>`<div>${esc(p.cn)} <span class="hint">${esc((G.season.inj[p.id]||{}).name||'')}</span>${injTag(p)}</div>`).join(''):'<div class="hint">全员健康</div>'}</div>
     <div class="card tw"><h3>${t.conf}部排名</h3>${miniStand(cf)}</div>
     ${newsHTML(8)}
   </div></div>`;
  bindOffers(v);
  const q=id=>v.querySelector(id);
  if(q('#golive')) q('#golive').onclick=startLive;
  if(q('#goquick')) q('#goquick').onclick=quickUserGame;
  if(q('#gotac')) q('#gotac').onclick=()=>{ G.view='tac'; render(); };
  if(q('#lockerroom')) q('#lockerroom').onclick=()=>{ G.view='train'; render(); };
  if(q('#tooff')) q('#tooff').onclick=()=>{ startOffseason(); G.view='off'; render(); };
  if(q('#newteam')) q('#newteam').onclick=()=>{ G.team=null; G.rot=null; G.tac=null; save(); render(); };
  v.querySelectorAll('[data-adv]').forEach(b=>b.onclick=()=>advance(b.dataset.adv));
  if(q('#automine')) q('#automine').onchange=e=>{ G.autoMine=e.target.checked; save(); };
  v.querySelectorAll('[data-box]').forEach(el=>el.onclick=()=>showBox(el.dataset.box));
}
function miniStand(cf){
  return `<table><tbody>${cf.map((r,k)=>`<tr style="${r.i===G.team?'background:#2a1c10':''}${k===6||k===10?';border-top:2px solid #3a4658':''}"><td class="n">${k+1}</td><td>${logo(TEAMS[r.i],16)} ${esc(TEAMS[r.i].nick)}</td><td class="n">${r.w}-${r.l}</td><td class="n hint">${r.gb?r.gb.toFixed(1):'-'}</td></tr>`).join('')}</tbody></table>`;
}
function showBox(key){
  const B=G.season.boxes[key]; if(!B) return;
  const m=document.getElementById('modal');
  m.innerHTML=`<div class="modal"><div class="box" style="max-width:980px"><div style="display:flex;align-items:center;gap:12px;justify-content:center;margin-bottom:6px">${logo(TEAMS[B.h],36)}<b>${esc(TEAMS[B.h].cn)}</b><span style="font-size:24px;font-weight:800">${B.score[0]} : ${B.score[1]}</span><b>${esc(TEAMS[B.a].cn)}</b>${logo(TEAMS[B.a],36)}</div>
   <div class="hint" style="text-align:center">${B.q[0].map((x,i)=>`${i<4?'第'+(i+1)+'节':'加时'} ${x}-${B.q[1][i]}`).join(' · ')}</div>
   ${boxHTML(B.box, s=>TEAMS[s===0?B.h:B.a], true)}<div style="text-align:right"><button onclick="closeModal()">关闭</button></div></div></div>`;
  m.querySelector('.modal').onclick=e=>{ if(e.target.classList.contains('modal')) closeModal(); };
}

// ---------- 赛程 ----------
function vSched(v){
  const S=G.season;
  const mine=S.games.map((g,n)=>({g,n})).filter(x=>x.g[1]===G.team||x.g[2]===G.team);
  let w=0,l=0;
  const rows=mine.map(({g,n},k)=>{ const home=g[1]===G.team, o=TEAMS[home?g[2]:g[1]]; let res='';
    if(g[3]!=null){ const my=home?g[3]:g[4], op=home?g[4]:g[3]; if(my>op) w++; else l++; res=`<span class="pill" style="background:${my>op?'#0a5c3a':'#5c1a1d'}">${my>op?'胜':'负'}</span> ${my}-${op}${g[5]?' <span class="hint">加时</span>':''}`; }
    return `<tr class="${g[3]!=null?'cl':''}" data-box="r${n}"><td class="n">${k+1}</td><td>${dateTxt(g[0],true)}</td><td>${home?'主':'客'}</td><td>${logo(o,18)} ${esc(o.cn)}</td><td>${res}</td><td class="n hint">${g[3]!=null?w+'-'+l:''}</td></tr>`; });
  const po=Object.keys(S.boxes).filter(k=>!k.startsWith('r'));
  v.innerHTML=`<h1>赛程</h1><div class="sub">常规赛 82 场。背靠背 ${countB2B(mine)} 次。点已经打完的比赛看技术统计。</div>
   ${po.length?`<div class="card tw"><h3>季后赛和附加赛</h3><table><tbody>${po.map(k=>{ const B=S.boxes[k], home=B.h===G.team, o=TEAMS[home?B.a:B.h], my=home?B.score[0]:B.score[1], op=home?B.score[1]:B.score[0];
      return `<tr class="cl" data-box="${k}"><td>${home?'主':'客'}</td><td>${logo(o,18)} ${esc(o.cn)}</td><td><span class="pill" style="background:${my>op?'#0a5c3a':'#5c1a1d'}">${my>op?'胜':'负'}</span> ${my}-${op}</td></tr>`; }).join('')}</tbody></table></div>`:''}
   <div class="card tw"><table><thead><tr><th class="n">#</th><th>日期</th><th>主客</th><th>对手</th><th>结果</th><th class="n">战绩</th></tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
  v.querySelectorAll('tr.cl[data-box]').forEach(tr=>tr.onclick=()=>showBox(tr.dataset.box));
}
function countB2B(mine){ let c=0; for(let k=1;k<mine.length;k++) if(mine[k].g[0]-mine[k-1].g[0]===1) c++; return c; }

// ---------- 战绩榜 ----------
function vStand(v){
  const R=standings();
  const tbl=cf=>{ const arr=confRank(R,cf); return `<div class="card tw"><h3>${cf}部</h3><table><thead><tr><th class="n">#</th><th>球队</th><th class="n">胜</th><th class="n">负</th><th class="n">胜率</th><th class="n">胜场差</th><th class="n">主场</th><th class="n">客场</th><th class="n">分区内</th><th class="n">近10场</th><th>连续</th><th class="n">得分</th><th class="n">失分</th><th class="n">净胜</th></tr></thead><tbody>
    ${arr.map((r,k)=>`<tr style="${r.i===G.team?'background:#2a1c10':''}${k===6||k===10?';border-top:2px solid #3a4658':''}"><td class="n">${k+1}</td><td>${logo(TEAMS[r.i],18)} ${esc(TEAMS[r.i].cn)}</td><td class="n">${r.w}</td><td class="n">${r.l}</td><td class="n">${r.g?r.pct.toFixed(3).replace(/^0/,''):'-'}</td><td class="n">${r.gb?r.gb.toFixed(1):'-'}</td>
     <td class="n">${r.hw}-${r.hl}</td><td class="n">${r.aw}-${r.al}</td><td class="n">${r.cw}-${r.cl}</td><td class="n">${r.l10.filter(x=>x==='W').length}-${r.l10.filter(x=>x==='L').length}</td><td>${r.streak}</td>
     <td class="n">${r.g?(r.pf/r.g).toFixed(1):'-'}</td><td class="n">${r.g?(r.pa/r.g).toFixed(1):'-'}</td><td class="n ${r.pf>r.pa?'good':r.pf<r.pa?'bad':''}">${r.g?((r.pf-r.pa)/r.g>0?'+':'')+((r.pf-r.pa)/r.g).toFixed(1):'-'}</td></tr>`).join('')}</tbody></table>
    <div class="hint" style="margin-top:6px">前 6 名直接进季后赛，7–10 名打附加赛</div></div>`; };
  v.innerHTML=`<h1>战绩榜</h1><div class="sub">同战绩先比相互战绩，再比分区内战绩，再比净胜分</div>${tbl('东')}${tbl('西')}`;
}

// ---------- 数据榜 ----------
let STAT_TAB='reg';
function vStats(v){
  const S=G.season, src=STAT_TAB==='reg'?S.ps:S.pps;
  const RR=standings(); const minG = STAT_TAB==='reg'? Math.max(1,Math.floor(Math.max(...RR.map(r=>r.g))*0.7)) : 1;
  const list=Object.entries(src).map(([id,q])=>({p:PBYID[id],q})).filter(x=>x.p && x.q.g>=minG);
  const cat=(title,f,fmt,filter)=>{ const arr=list.filter(filter||(()=>true)).map(x=>({...x,v:f(x.q)})).sort((a,b)=>b.v-a.v).slice(0,15);
    return `<div class="card tw"><h3>${title}</h3><table><tbody>${arr.map((x,k)=>`<tr style="${x.q.team===G.team?'background:#2a1c10':''}"><td class="n">${k+1}</td><td class="cl" data-id="${x.p.id}">${esc(x.p.cn)}</td><td>${logo(TEAMS[x.q.team],16)}</td><td class="n"><b>${fmt(x.v)}</b></td></tr>`).join('')||'<tr><td class="hint">暂无</td></tr>'}</tbody></table></div>`; };
  const f1=x=>x.toFixed(1), pct=x=>(x*100).toFixed(1)+'%';
  v.innerHTML=`<h1>数据榜</h1><div class="sub">场均数据，出场至少 ${minG} 场</div>
   <div class="seg" style="margin-bottom:12px"><button data-st="reg" class="${STAT_TAB==='reg'?'on':''}">常规赛</button><button data-st="po" class="${STAT_TAB==='po'?'on':''}">季后赛</button></div>
   <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px">
   ${cat('得分',q=>q.pts/q.g,f1)}${cat('篮板',q=>(q.oreb+q.dreb)/q.g,f1)}${cat('助攻',q=>q.ast/q.g,f1)}${cat('抢断',q=>q.stl/q.g,f1)}${cat('盖帽',q=>q.blk/q.g,f1)}
   ${cat('三分命中',q=>q.tpm/q.g,f1)}${cat('投篮命中率',q=>q.fgm/Math.max(1,q.fga),pct,x=>x.q.fga/x.q.g>=8)}${cat('三分命中率',q=>q.tpm/Math.max(1,q.tpa),pct,x=>x.q.tpa/x.q.g>=3.5)}${cat('上场时间',q=>q.min/q.g,f1)}</div>`;
  v.querySelectorAll('[data-st]').forEach(b=>b.onclick=()=>{ STAT_TAB=b.dataset.st; vStats(v); });
  v.querySelectorAll('td[data-id]').forEach(td=>td.onclick=()=>showPlayer(PBYID[td.dataset.id]));
}

// ---------- 季后赛 ----------
function vPO(v){
  const S=G.season;
  if(S.phase==='reg'){ const R=standings();
    v.innerHTML=`<h1>季后赛</h1><div class="sub">常规赛结束后开打。按现在的排名：</div><div class="row">${['东','西'].map(cf=>`<div class="col card tw"><h3>${cf}部</h3>${miniStand(confRank(R,cf).slice(0,10))}</div>`).join('')}</div>`; return; }
  const tn=i=>i==null?'<span class="hint">待定</span>':`${logo(TEAMS[i],16)} ${esc(TEAMS[i].nick)}`;
  const sr=x=>`<div class="card" style="padding:9px;margin-bottom:8px;${(x.h===G.team||x.a===G.team)?'border-color:var(--acc)':''}"><div style="display:flex;justify-content:space-between"><span>${tn(x.h)}</span><b>${x.hw}</b></div><div style="display:flex;justify-content:space-between"><span>${tn(x.a)}</span><b>${x.aw}</b></div></div>`;
  let html=`<h1>季后赛</h1><div class="sub">${phaseTxt()}${S.champion!=null?' · 总冠军 '+TEAMS[S.champion].cn:''}</div>`;
  if(S.playin) html+=`<div class="card tw"><h3>附加赛</h3><table><tbody>${S.playin.map(x=>`<tr><td>${x.cf}部 ${x.tag==='7v8'?'7 vs 8':x.tag==='9v10'?'9 vs 10':'争 8 号'}</td><td>${tn(x.h)}</td><td class="n">${x.score?x.score[0]+'-'+x.score[1]:''}</td><td>${tn(x.a)}</td><td>${x.w!=null?'胜者 '+tn(x.w):''}</td></tr>`).join('')}</tbody></table></div>`;
  if(S.po){ const col=(cf,r)=>S.po.series.filter(x=>x.cf===cf&&x.round===r).sort((a,b)=>a.slot-b.slot).map(sr).join('');
    html+=`<div style="display:grid;grid-template-columns:repeat(7,minmax(120px,1fr));gap:8px;overflow-x:auto;align-items:center">
      <div>${col('东',1)}</div><div>${col('东',2)}</div><div>${col('东',3)}</div><div><div class="hint" style="text-align:center;margin-bottom:6px">总决赛</div>${S.po.series.filter(x=>x.round===4).map(sr).join('')}</div><div>${col('西',3)}</div><div>${col('西',2)}</div><div>${col('西',1)}</div></div>`; }
  if(S.awards) html+=`<div class="card"><h3>常规赛奖项</h3>${[['mvp','MVP'],['dpoy','最佳防守球员'],['roy','最佳新秀'],['smoy','最佳第六人']].map(([k,n])=>S.awards[k]?`<div>${n}：<b>${esc(PBYID[S.awards[k]].cn)}</b></div>`:'').join('')}</div>`;
  v.innerHTML=html;
}

// ---------- 生涯 ----------
function vCareer(v){
  const C=G.career||[], rings=C.filter(c=>c.champ).length, cups=C.filter(c=>c.cup).length;
  v.innerHTML=`<h1>生涯</h1><div class="sub">总冠军 ${rings} 个 · NBA 杯 ${cups} 个 · 执教 ${C.length} 个完整赛季</div>
   <div class="card tw"><table><thead><tr><th>赛季</th><th>球队</th><th class="n">战绩</th><th>季后赛</th><th>老板目标</th><th>完成</th></tr></thead><tbody>
   ${C.map(c=>`<tr><td>${c.year}-${String((c.year+1)%100).padStart(2,'0')}</td><td>${logo(TEAMS[c.team],16)} ${esc(TEAMS[c.team].cn)}</td><td class="n">${c.w}-${c.l}</td><td>${c.champ?'<b style="color:var(--acc)">总冠军</b>':esc(c.res)}${c.cup?' <span class="pill" style="background:#3a2a10">NBA 杯</span>':''}</td><td>${esc(c.goal)}</td><td class="${c.met?'good':'bad'}">${c.met?'是':'否'}</td></tr>`).join('')||'<tr><td class="hint">还没有打完的赛季</td></tr>'}</tbody></table></div>`;
}
