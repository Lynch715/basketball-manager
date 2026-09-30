// ================= 士气、化学反应、教练组、训练、球探 =================
// 规范：《第五阶段规范.md》§1–3
const EXP_MIN=[34,32,30,28,26,22,18,16,12,8];
const FOCUS={bal:['均衡',null], shoot:['投篮',['three','mid','ft','finish']], def:['防守',['perD','intD','stl','blk','diq']], phys:['身体',['spd','jmp','str','sta']], iq:['球商',['oiq','diq','pass','handle']]};
const INTEN={low:['轻',.7,.85,35], mid:['正常',1,1,30], high:['高',1.3,1.2,25]};   // 名称、成长、伤病、每天体能恢复
const STAFF=[['med','队医'],['trn','训练师'],['sct','球探']];
const SCOUT_HW=[[5,10],[4,8],[3,6],[2,4],[1,2]];

function randStaff(){ let m,t,s; do{ m=2+Math.floor(rnd01()*3); t=2+Math.floor(rnd01()*3); s=10-m-t; }while(s<2||s>4); return {med:m,trn:t,sct:s}; }
function tmeta(ti){ W.tm=W.tm||{}; let m=W.tm[ti]; if(!m) m=W.tm[ti]={chem:50, staff:randStaff(), focus:'bal', inten:'mid'}; return m; }
function mor(p){ return p.mor==null?60:p.mor; }
function setMor(p,v){ p.mor=Math.round(clamp(v,0,100)*10)/10; }
function chemHit(ti, n){ if(ti==null||ti<0) return; const m=tmeta(ti); m.chem=clamp(m.chem-4*n,0,100); }
function staffEditable(){ const S=G.season; return !!W.off || (S && S.phase==='reg' && S.day===0); }

// 比赛前：士气系数、化学反应、伤病系数
function applyLife(){ TEAMS.forEach(t=>t.players.forEach(p=>{ p.formMul=1+(mor(p)-60)*.0008; })); }
function lifeSide(ti){ const m=tmeta(ti); return {chemAdj:(m.chem-50)/5000, injMul:(1.15-.05*m.staff.med)*INTEN[m.inten][2]}; }
function injDaysMul(ti){ return ti>=0? 1.3-.1*tmeta(ti).staff.med : 1; }
function dailyRecover(ti){ if(ti<0) return 30; const m=tmeta(ti); return INTEN[m.inten][3]+2*(m.staff.med-3); }
function teamMapOfPlayers(){ const map={}; TEAMS.forEach(t=>t.players.forEach(p=>map[p.id]=t.i)); return map; }

// ---------- 每周：士气、化学反应 ----------
// 士气向「目标值」靠拢：60 + 上场时间 + 最近战绩 + 球星在烂队；交易、全明星、NBA 杯是一次性加减
function weeklyLife(){
  const S=G.season, R=standings(); S.snap=S.snap||{}; S.snapT=S.snapT||{}; S.low=S.low||{}; S.complain=S.complain||{};
  TEAMS.forEach(t=>{
    const m=tmeta(t.i), r=R[t.i], tg=r.g-(S.snapT[t.i]||0); S.snapT[t.i]=r.g;
    const l10=r.l10.length? r.l10.filter(x=>x==='W').length/r.l10.length : .5;
    const healthy=t.players.filter(p=>!(p.injury>0)).sort((a,b)=>b.ovr-a.ovr);
    t.players.forEach(p=>{
      const q=S.ps[p.id], sn=S.snap[p.id]||0, mins=(q?q.min:0)-sn; S.snap[p.id]=q?q.min:0;
      if(tg<=0) return;
      let target=60+(l10-.5)*30;
      const rank=healthy.indexOf(p);
      if(rank>=0){ const exp=EXP_MIN[rank]||0, mpg=mins/tg;
        if(exp>=8){ if(mpg>=exp*.85) target+=12; else if(mpg<exp*.6) target-=20; else target-=6; } }
      if(p.ovr>=85 && l10<.4) target-=12;
      setMor(p, mor(p)+(target-mor(p))*.25+gauss(0,1.5));
      // 不满和要求交易
      if(mor(p)<32 && t.i===G.team && (S.complain[p.id]==null || S.day-S.complain[p.id]>=30)){ S.complain[p.id]=S.day;
        S.inbox.push({d:S.day, t:`${p.cn} 有情绪`, b: rank>=0 && (EXP_MIN[rank]||0)>=8 ? `他觉得自己该打更多时间。士气 ${Math.round(mor(p))}。` : `球队最近输得太多，他不太开心。士气 ${Math.round(mor(p))}。`}); }
      if(mor(p)<25){ S.low[p.id]=(S.low[p.id]||0)+1;
        if(S.low[p.id]>=2 && !p.treq && p.ovr>=72){ p.treq=true; addNews('要求交易',`${p.cn}（${t.nick}）公开要求交易`);
          if(t.i===G.team) S.inbox.push({d:S.day, t:`${p.cn} 要求交易`, b:'他已经公开表态想走。士气不回升的话，续约时他不会留下。'}); } }
      else { S.low[p.id]=0; if(p.treq && mor(p)>40) delete p.treq; }
    });
    // 化学反应
    const top=t.players.slice().sort((a,b)=>b.ovr-a.ovr).slice(0,10), avg=top.reduce((s,p)=>s+mor(p),0)/Math.max(1,top.length);
    m.chem=clamp(m.chem + .5 + (avg-60)*.05 + (l10-.5)*2 - (m.chem-50)*.03, 0, 100);
  });
}

// ---------- 赛季中成长：每 14 天一次，一年 12 次，占全年的 40% ----------
function growthBase(p, age){
  let d=AGE_DELTA(age);
  if(d>0){ const gap=Math.max(0,p.pot-p.ovr); d*= gap>0? Math.min(1.6, 0.7+gap/25) : (age<26?.3:1); d*=.75+p.prof/200; d*=devMul(p,age); }
  else d*=1.25-p.prof/200;
  return d;
}
function trainMul(ti, d){ if(ti<0) return 1; const lv=tmeta(ti).staff.trn; return d>0? .7+.1*lv : 1.3-.1*lv; }
function bumpOvr(p, dir, keys, age){
  const target=clamp(p.ovr+dir,30,99); let n=0;
  while(calcOvr(p)!==target && n++<8){ const ks= dir>0? (keys && rnd01()<.8? keys : KEYS) : (age>=30? PHYS : KEYS); const k=pickOne(ks); p.a[k]=clamp(p.a[k]+dir,20,99); }
  p.ovr=calcOvr(p);
}
function growthTick(){
  const S=G.season, yr=S.year+1, R=standings(); let changed=false;
  TEAMS.forEach(t=>{ const m=tmeta(t.i), I=INTEN[m.inten], tg=Math.max(1,R[t.i].g);
    t.players.forEach(p=>{
      const age=ageOf(p,yr), base=growthBase(p,age), q=S.ps[p.id];
      const mm= base>0 && age<=24? minMul(q?q.min/tg:0, p.contract&&p.contract[2]==='tw') : 1;
      const step=base*.4/12*trainMul(t.i,base)*(base>0?I[1]:1)*mm;
      p.gx=(p.gx||0)+step;
      const keys=FOCUS[p.tf||m.focus][1];
      if(p.gx>=1){ p.gx-=1; if(p.ovr<p.pot){ const o=p.ovr; bumpOvr(p,1,keys,age); changed=changed||p.ovr!==o; } }
      else if(p.gx<=-1){ p.gx+=1; const o=p.ovr; bumpOvr(p,-1,null,age); changed=changed||p.ovr!==o; }
    });
  });
  if(changed) reindex();
}

// ---------- 球探 ----------
function scoutLevel(ti){ return tmeta(ti).staff.sct; }
function focusLimit(){ return 2+2*scoutLevel(G.team); }
function refreshScout(){
  const L=scoutLevel(G.team), F=new Set(W.scoutFocus||[]);
  (W.draftClass||[]).forEach(p=>{ if(!p.sz) p.sz=[gauss(0,1),gauss(0,1)];
    const [ho,hp]=SCOUT_HW[(F.has(p.id)?5:L)-1], k=F.has(p.id)?.3:.6;
    const co=Math.round(p.ovr+p.sz[0]*ho*k), cp=Math.round(p.pot+p.sz[1]*hp*k);
    p.scout={o:[co-ho,co+ho], p:[cp-hp,cp+hp]}; });
}
function perceivedBy(p, ti){
  if(ti===G.team){ if(!p.scout) refreshScout(); return (p.scout.o[0]+p.scout.o[1])/4+(p.scout.p[0]+p.scout.p[1])/4; }
  const r=srand(p.id*1009+ti*31), z=()=>(r()+r()+r()-1.5)*2, [ho,hp]=SCOUT_HW[scoutLevel(ti)-1];
  return (p.ovr+z()*ho*.6)*.5+(p.pot+z()*hp*.6)*.5;
}
function ensureDraftClass(year){
  if(W.dcYear===year && (W.draftClass||[]).length) return;
  W.draftClass=genDraftClass(year); W.dcYear=year; W.scoutFocus=[]; refreshScout();
}

// ---------- 界面：训练 ----------
Object.assign(ICON,{
  train:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M1.5 8h13"/><rect x="3" y="4.5" width="2" height="7" rx=".5"/><rect x="11" y="4.5" width="2" height="7" rx=".5"/><path d="M1.5 6.5v3M14.5 6.5v3"/></svg>',
  scout:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="7" cy="7" r="4.5"/><path d="m10.5 10.5 4 4"/><path d="M5 7h4M7 5v4"/></svg>',
  events:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="m8 1.8 1.8 3.8 4.1.5-3 2.8.8 4.1L8 11l-3.7 2 .8-4.1-3-2.8 4.1-.5z"/></svg>',
});
function morCol(v){ return v>=70?'#00c276':v>=50?'#9bd35a':v>=30?'#f0a020':'#e5484d'; }
function morTag(p){ const v=Math.round(mor(p)); return `<span style="color:${morCol(v)}">${v}</span>${p.treq?' <span class="pill" style="background:#5c1a1d">要求交易</span>':''}`; }
function vTrain(v){
  const t=myTeam(), m=tmeta(G.team), S=G.season, ed=staffEditable(), used=m.staff.med+m.staff.trn+m.staff.sct;
  const eff={med:`伤病概率 ×${(1.15-.05*m.staff.med).toFixed(2)}，伤停天数 ×${(1.3-.1*m.staff.med).toFixed(1)}，每天多恢复 ${2*(m.staff.med-3)} 点体能`,
    trn:`成长速度 ×${(.7+.1*m.staff.trn).toFixed(1)}，衰退速度 ×${(1.3-.1*m.staff.trn).toFixed(1)}`,
    sct:`新秀总评看得准到 ±${SCOUT_HW[m.staff.sct-1][0]}，潜力 ±${SCOUT_HW[m.staff.sct-1][1]}；可以重点考察 ${2+2*m.staff.sct} 人`};
  const ps=t.players.slice().sort((a,b)=>b.ovr-a.ovr), ovr0=(S&&S.ovr0)||{};
  v.innerHTML=`<h1>训练</h1><div class="sub">教练组、训练安排、更衣室</div>
   <div class="row"><div class="col" style="min-width:300px">
    <div class="card"><h3>教练组 <span class="r">预算 ${used} / 10 点</span></h3>
      ${STAFF.map(([k,n])=>`<div style="padding:7px 0;border-bottom:1px solid #1f2733"><div style="display:flex;align-items:center;gap:8px"><b style="width:52px">${n}</b>
        ${ed?`<button class="sm" data-st="${k}" data-d="-1" ${m.staff[k]<=1?'disabled':''}>−</button>`:''}<span style="letter-spacing:2px">${'<b style="color:var(--acc)">■</b>'.repeat(m.staff[k])}${'<span class="hint">■</span>'.repeat(5-m.staff[k])}</span>${ed?`<button class="sm" data-st="${k}" data-d="1" ${m.staff[k]>=5||used>=10?'disabled':''}>+</button>`:''}</div>
        <div class="hint" style="margin-top:3px">${eff[k]}</div></div>`).join('')}
      <p class="hint" style="margin-top:8px">${ed?'每个部门 1–5 点，合计不超过 10 点。':'教练组只能在休赛期或者开季前调整。'}</p></div>
    <div class="card"><h3>训练安排</h3>
      <div style="margin-bottom:8px">全队重点 <select id="tfocus">${Object.entries(FOCUS).map(([k,[n]])=>`<option value="${k}" ${m.focus===k?'selected':''}>${n}</option>`).join('')}</select>
        强度 <select id="tint">${Object.entries(INTEN).map(([k,[n]])=>`<option value="${k}" ${m.inten===k?'selected':''}>${n}</option>`).join('')}</select></div>
      <div class="hint">强度${INTEN[m.inten][0]}：赛季中成长 ×${INTEN[m.inten][1]}，伤病 ×${INTEN[m.inten][2]}，每天恢复 ${INTEN[m.inten][3]} 点体能。成长每两周结算一次，全年成长的四成在赛季里，六成在休赛期。训练重点决定赛季里长的是哪些属性。</div></div>
    <div class="card"><h3>更衣室 <span class="r">化学反应</span></h3><div class="fitbar">${bar(m.chem,100,m.chem>=60?'#00c276':m.chem>=40?'#f0a020':'#e5484d')}<b>${Math.round(m.chem)}</b></div>
      <div class="hint" style="margin-top:6px">阵容稳定、大家士气高、赢球，化学反应会慢慢涨；每来一个新人会掉一截。比赛里命中率 ${m.chem>=50?'+':''}${((m.chem-50)/50).toFixed(1)}%。</div></div>
   </div>
   <div class="col card tw" style="min-width:340px;flex:1.5"><h3>球员</h3><table><thead><tr><th>球员</th><th class="n">总评</th><th class="n">潜力</th><th class="n">本季</th><th class="n">士气</th><th>个人重点</th></tr></thead><tbody>
    ${ps.map(p=>{ const d=ovr0[p.id]!=null? p.ovr-ovr0[p.id] : 0; return `<tr><td class="cl" data-id="${p.id}"><b>${esc(p.cn)}</b> <span class="hint">${p.pos} · ${p.age}</span>${injTag(p)}</td><td class="n">${ovrTag(p.ovr)}</td><td class="n">${p.pot}</td><td class="n">${deltaTag(d)}</td><td class="n">${morTag(p)}</td>
      <td><select data-tf="${p.id}"><option value="">跟全队</option>${Object.entries(FOCUS).map(([k,[n]])=>`<option value="${k}" ${p.tf===k?'selected':''}>${n}</option>`).join('')}</select></td></tr>`; }).join('')}</tbody></table>
    <p class="hint" style="margin-top:8px">士气影响比赛发挥（最多 ±3%）和续约要价。上场时间达到他的预期、球队赢球，士气就往上走；士气太低会公开要求交易，续约时也不肯留。</p></div></div>`;
  v.querySelectorAll('[data-st]').forEach(b=>b.onclick=()=>{ const k=b.dataset.st, d=+b.dataset.d; const nv=m.staff[k]+d; if(nv<1||nv>5||(d>0&&used>=10)) return; m.staff[k]=nv; if(k==='sct') refreshScout(); save(); vTrain(v); });
  v.querySelector('#tfocus').onchange=e=>{ m.focus=e.target.value; save(); vTrain(v); };
  v.querySelector('#tint').onchange=e=>{ m.inten=e.target.value; save(); vTrain(v); };
  v.querySelectorAll('[data-tf]').forEach(s=>s.onchange=()=>{ const p=PBYID[s.dataset.tf]; if(s.value) p.tf=s.value; else delete p.tf; save(); });
  v.querySelectorAll('td[data-id]').forEach(el=>el.onclick=()=>showPlayer(PBYID[el.dataset.id]));
}

// ---------- 界面：球探 ----------
function vScout(v){
  const cls=(W.draftClass||[]).filter(p=>!p.drafted);
  if(!cls.length){ v.innerHTML=`<h1>球探</h1><div class="card"><p>下一届新秀名单在新赛季开幕时出炉。</p></div>`; return; }
  refreshScout();
  const F=new Set(W.scoutFocus||[]), lim=focusLimit(), L=scoutLevel(G.team), yr=W.dcYear;
  const list=cls.slice().sort((a,b)=>perceivedBy(b,G.team)-perceivedBy(a,G.team));
  const mine=picksOwnedBy(G.team).filter(k=>k.year===yr);
  v.innerHTML=`<h1>球探</h1><div class="sub">${yr} 年选秀 · 球探等级 ${L} · 重点考察 ${F.size} / ${lim} 人</div>
   <div class="card"><h3>球探的判断：${esc(classTxt())}</h3><p>名单按你的球探看到的价值排，这就是你这边的模拟选秀顺位。总评和潜力是区间，球探等级越高越窄。重点考察过的人区间收窄到 ±1 / ±2，还能看到他的敬业程度和伤病风险。考察名额用掉就收不回来。</p>
    <p class="hint" style="margin-top:4px">你持有的 ${yr} 年签：${mine.length?mine.map(k=>esc(pickLabel(k))).join('、'):'无'}。别的球队有自己的球探，看法和你不一样。</p></div>
   <div class="card tw"><table><thead><tr><th class="n">顺位</th><th>新秀</th><th>位置</th><th>原型</th><th class="n">年龄</th><th class="n">身高</th><th class="n">总评</th><th class="n">潜力</th><th>上季数据</th><th>考察</th><th></th></tr></thead><tbody>
    ${list.map((p,i)=>`<tr style="${F.has(p.id)?'background:#2a1c10':''}"><td class="n">${i+1}</td><td class="cl" data-id="${p.id}"><b>${esc(p.cn)}</b> <span class="hint">${esc(p.nat)}</span></td><td>${p.pos}</td><td>${esc(p.arch||'')}</td><td class="n">${p.age}</td><td class="n">${p.ht}</td><td class="n">${rangeTxt(p.scout.o)}</td><td class="n">${rangeTxt(p.scout.p)}</td><td class="hint">${esc(preTxt(p))}</td><td class="hint">${F.has(p.id)?`敬业${profCn(p.prof)} · 伤病风险${durCn(p.dur)}`:''}</td>
      <td>${F.has(p.id)?'<span class="hint">已考察</span>':F.size<lim?`<button class="sm" data-sf="${p.id}">重点考察</button>`:''}</td></tr>`).join('')}</tbody></table></div>`;
  v.querySelectorAll('[data-sf]').forEach(b=>b.onclick=()=>{ W.scoutFocus=W.scoutFocus||[]; if(W.scoutFocus.length>=lim) return; W.scoutFocus.push(+b.dataset.sf); refreshScout(); save(); vScout(v); });
  v.querySelectorAll('td[data-id]').forEach(el=>el.onclick=()=>showPlayer(PBYID[el.dataset.id]));
}
