// ================= 全明星周末、NBA 杯 =================
// 规范：《第五阶段规范.md》§4–5

// ---------- NBA 杯 ----------
function drawCupGroups(seed){
  const rng=srand(seed^0x5bd1), groups={};
  ['东','西'].forEach(cf=>{ const ts=TEAMS.filter(t=>t.conf===cf).map(t=>t.i);
    for(let i=ts.length-1;i>0;i--){ const j=Math.floor(rng()*(i+1)); [ts[i],ts[j]]=[ts[j],ts[i]]; }
    groups[cf]=[ts.slice(0,5), ts.slice(5,10), ts.slice(10,15)]; });
  return groups;
}
function cupPairSet(groups){ const s=new Set(); Object.values(groups).forEach(gs=>gs.forEach(g=>{ for(let x=0;x<5;x++) for(let y=x+1;y<5;y++) s.add(Math.min(g[x],g[y])+'-'+Math.max(g[x],g[y])); })); return s; }
function cupGroupTable(S, g){
  const R=g.map(i=>({i,w:0,l:0,pd:0}));
  S.games.forEach(q=>{ if(q[6]!=='cup'||q[3]==null) return; const h=R.find(r=>r.i===q[1]), a=R.find(r=>r.i===q[2]); if(!h||!a) return;
    const d=q[3]-q[4]; h.pd+=d; a.pd-=d; if(d>0){h.w++;a.l++;} else {a.w++;h.l++;} });
  return R.sort((x,y)=>y.w-x.w||y.pd-x.pd);
}
function buildCupKO(S){
  const C=S.cup; C.ko=[];
  ['东','西'].forEach((cf,ci)=>{
    const tabs=C.groups[cf].map(g=>cupGroupTable(S,g));
    const winners=tabs.map(t=>t[0]).sort((x,y)=>y.w-x.w||y.pd-x.pd);
    const wild=tabs.map(t=>t[1]).sort((x,y)=>y.w-x.w||y.pd-x.pd)[0];
    const seeds=[...winners, wild].map(r=>r.i); C[cf+'Seeds']=seeds;
    const day=CUP_DAYS[ci];
    C.ko.push({id:cf+'q1', rd:'qf', cf, day, h:seeds[0], a:seeds[3], w:null});
    C.ko.push({id:cf+'q2', rd:'qf', cf, day, h:seeds[1], a:seeds[2], w:null});
    C.ko.push({id:cf+'s', rd:'sf', cf, day:CUP_DAYS[2], h:null, a:null, w:null});
  });
  C.ko.push({id:'f', rd:'f', cf:'总', day:CUP_DAYS[3], h:null, a:null, w:null});
  const mineIn=C.ko.some(x=>x.h===G.team||x.a===G.team);
  addNews('NBA杯',`NBA 杯淘汰赛八强：${C.ko.filter(x=>x.rd==='qf').map(x=>TEAMS[x.h].nick+' 对 '+TEAMS[x.a].nick).join('，')}`);
  S.inbox.push({d:S.day, t:'NBA 杯小组赛结束', b: mineIn? '你的球队打进了淘汰赛八强。' : '你的球队没能从小组出线。'});
}
function cupPropagate(S){
  const K=S.cup.ko, by=id=>K.find(x=>x.id===id);
  ['东','西'].forEach(cf=>{ const s=by(cf+'s'), a=by(cf+'q1'), b=by(cf+'q2');
    if(s.h==null && a.w!=null && b.w!=null){ s.h=a.w; s.a=b.w; } });
  const f=by('f'), e=by('东s'), w=by('西s');
  if(f.h==null && e.w!=null && w.w!=null){ f.h=e.w; f.a=w.w; }
  if(f.w!=null && S.cup.champ==null){ const ch=f.w; S.cup.champ=ch;
    addNews('NBA杯',`${TEAMS[ch].cn} 拿下 NBA 杯冠军，决赛 ${f.score[0]}-${f.score[1]} 击败${TEAMS[ch===f.h?f.a:f.h].nick}`);
    TEAMS[ch].players.forEach(p=>setMor(p,mor(p)+4)); const m=tmeta(ch); m.chem=clamp(m.chem+3,0,100);
    S.inbox.push({d:S.day, t: ch===G.team?'拿下 NBA 杯！':'NBA 杯决赛结束', b:`${TEAMS[ch].cn} 夺得 NBA 杯。`}); }
}
function cupGamesToday(){
  const S=G.season; if(!S || S.phase!=='reg' || !S.cup || !S.cup.ko) return [];
  const lab={qf:'NBA 杯 1/4 决赛', sf:'NBA 杯半决赛', f:'NBA 杯决赛'};
  return S.cup.ko.map((x,k)=>({x,k})).filter(({x})=>x.day===S.day && x.w==null && x.h!=null && x.a!=null).map(({x,k})=>({h:x.h, a:x.a, n:7000+k, key:'cup'+x.id, label:lab[x.rd],
    done:(hs,as)=>{ x.w=hs>as?x.h:x.a; x.score=[hs,as]; cupPropagate(S); }}));
}
function cupDaily(S){ // 在 endDay 里调用
  if(!S.cup || S.phase!=='reg') return;
  if(!S.cup.ko && S.day>=CUP_DAYS[0]-2){
    S.games.forEach(q=>{ if(q[6]==='cup' && q[3]==null) delete q[6]; });   // 没来得及打的小组赛不算
    buildCupKO(S);
  }
}

// ---------- 全明星 ----------
function runAllStar(){
  const S=G.season, R=standings(), pool=[];
  Object.entries(S.ps).forEach(([id,q])=>{ const p=PBYID[id]; if(!p||q.g<20||p.injury>0) return; const ti=teamOfPlayer(p); if(ti<0) return;
    const g=q.g; pool.push({p, ti, q, cf:TEAMS[ti].conf, sc:q.pts/g+1.1*(q.oreb+q.dreb)/g+1.4*q.ast/g+2*(q.stl+q.blk)/g+.25*p.ovr+5*(R[ti].g?R[ti].w/R[ti].g:.5)}); });
  pool.sort((a,b)=>b.sc-a.sc);
  const AS={};
  ['东','西'].forEach(cf=>{ const c=pool.filter(x=>x.cf===cf), g=c.filter(x=>x.p.pos==='PG'||x.p.pos==='SG'), f=c.filter(x=>!(x.p.pos==='PG'||x.p.pos==='SG'));
    const st=[...g.slice(0,2), ...f.slice(0,3)], rest=c.filter(x=>!st.includes(x)).slice(0,7);
    AS[cf]={starters:st.map(x=>x.p.id), reserves:rest.map(x=>x.p.id)}; });
  // 正赛
  const mk=cf=>{ const ps=[...AS[cf].starters, ...AS[cf].reserves].map(id=>PBYID[id]); const tm={players:ps};
    const rot=E.autoRotation(tm); ps.forEach(p=>rot.minutes[p.id]=20); const tac=Object.assign(E.autoTactics(tm,rot),{pace:'fast',matchups:{}});
    return {players:ps, rotation:rot, tactics:tac, allStar:true}; };
  const M=E.createMatch(mk('东'), mk('西'), {seed:(S.seed*13+77)>>>0, neutral:true}); E.run(M);
  const bs=E.boxScore(M), win=M.score[0]>M.score[1]?0:1;
  const best=bs[win].players.slice().sort((a,b)=>b.gs-a.gs)[0];
  const top=bs.flatMap(t=>t.players).sort((a,b)=>b.pts-a.pts).slice(0,6).map(x=>({id:x.id, pts:x.pts, reb:x.oreb+x.dreb, ast:x.ast}));
  AS.game={score:M.score.slice(), mvp:best.id, top};
  // 三分大赛
  const shooters=pool.filter(x=>x.q.tpa/x.q.g>=4).sort((a,b)=>(b.p.a.three*.7+b.q.tpm/b.q.tpa*30)-(a.p.a.three*.7+a.q.tpm/a.q.tpa*30)).slice(0,8).map(x=>x.p);
  const shoot=p=>{ const pr=clamp(.25+(p.a.three-60)*.011,.25,.62); let s=0; for(let r=0;r<5;r++) for(let b=0;b<5;b++) if(rnd01()<pr) s+=b===4?2:1; return s; };
  const r1=shooters.map(p=>[p.id,shoot(p)]).sort((a,b)=>b[1]-a[1]||rnd01()-.5);
  const fin=r1.slice(0,3).map(([id])=>[id,shoot(PBYID[id])]).sort((a,b)=>b[1]-a[1]||rnd01()-.5);
  AS.three={r1, fin, w:fin.length?fin[0][0]:null};
  // 扣篮大赛
  const dunkers=pool.filter(x=>ageOf(x.p)<=28).sort((a,b)=>(b.p.a.dunk+b.p.a.jmp)-(a.p.a.dunk+a.p.a.jmp)).slice(0,10);
  const dk=[]; dunkers.forEach(x=>{ if(dk.length<4 && rnd01()<.7) dk.push(x.p); }); dunkers.forEach(x=>{ if(dk.length<4 && !dk.includes(x.p)) dk.push(x.p); });
  const dunk=p=>Math.round(clamp(38+(p.a.dunk+p.a.jmp-150)*.12+gauss(0,4),30,50));
  const d1=dk.map(p=>[p.id,dunk(p)+dunk(p)]).sort((a,b)=>b[1]-a[1]||rnd01()-.5);
  const d2=d1.slice(0,2).map(([id])=>[id,dunk(PBYID[id])+dunk(PBYID[id])]).sort((a,b)=>b[1]-a[1]||rnd01()-.5);
  AS.dunk={r1:d1, fin:d2, w:d2.length?d2[0][0]:null};
  S.allStar=AS;
  // 士气、新闻、收件箱
  const all=[...AS['东'].starters,...AS['东'].reserves,...AS['西'].starters,...AS['西'].reserves];
  all.forEach(id=>setMor(PBYID[id],mor(PBYID[id])+5));
  [AS.three.w, AS.dunk.w, AS.game.mvp].forEach(id=>{ if(id) setMor(PBYID[id],mor(PBYID[id])+3); });
  addNews('全明星',`全明星赛 东部 ${M.score[0]}-${M.score[1]} 西部，MVP ${PBYID[best.id].cn}。三分大赛冠军 ${AS.three.w?PBYID[AS.three.w].cn:'-'}，扣篮大赛冠军 ${AS.dunk.w?PBYID[AS.dunk.w].cn:'-'}`);
  const mine=all.filter(id=>teamOfPlayer(PBYID[id])===G.team).map(id=>PBYID[id].cn);
  S.inbox.push({d:S.day, t:'全明星周末', b:`${mine.length?'你的球队入选：'+mine.join('、')+'。':'你的球队今年没人入选。'}全明星赛 MVP 是 ${PBYID[best.id].cn}。详情在「赛事」页。`});
}

// ---------- 界面：赛事 ----------
function vEvents(v){
  const S=G.season, tn=i=>i==null?'<span class="hint">待定</span>':`${logo(TEAMS[i],16)} ${esc(TEAMS[i].nick)}`, pn=id=>{ const p=PBYID[id]; return p?`<span class="cl" data-id="${id}">${esc(p.cn)}</span>`:'?'; };
  const html0=`<h1>赛事</h1><div class="sub">NBA 杯 · 全明星周末</div>`; let cupHtml='';
  if(S.cup){ let html=''; const C=S.cup;
    html+=`<div class="card"><h3>NBA 杯 ${C.champ!=null?`<span class="r">冠军 ${tn(C.champ)}</span>`:''}</h3><p class="hint">小组赛是 11 月里指定的常规赛，同时算常规赛战绩。每个分区 3 个小组第一加 1 个成绩最好的小组第二进八强。淘汰赛是额外比赛，不计入常规赛战绩和数据。</p></div>`;
    if(C.ko){ const K=C.ko, row=x=>`<tr style="${(x.h===G.team||x.a===G.team)?'background:#2a1c10':''}"><td class="hint">${dateTxt(x.day)}</td><td>${tn(x.h)}</td><td class="n">${x.score?x.score[0]+'-'+x.score[1]:''}</td><td>${tn(x.a)}</td><td>${x.w!=null?'胜 '+tn(x.w):''}</td></tr>`;
      html+=`<div class="card tw"><h3>淘汰赛</h3><table><tbody>${[['1/4 决赛','qf'],['半决赛','sf'],['决赛','f']].map(([n,rd])=>`<tr><td colspan="5"><b>${n}</b></td></tr>${K.filter(x=>x.rd===rd).map(row).join('')}`).join('')}</tbody></table></div>`; }
    html+=`<div class="row">${['东','西'].map(cf=>`<div class="col card tw" style="min-width:280px"><h3>${cf}部小组</h3>${C.groups[cf].map((g,k)=>`<div class="hint" style="margin-top:6px">${cf}部 ${'ABC'[k]} 组</div><table><tbody>${cupGroupTable(S,g).map(r=>`<tr style="${r.i===G.team?'background:#2a1c10':''}"><td>${tn(r.i)}</td><td class="n">${r.w}-${r.l}</td><td class="n">${r.pd>0?'+':''}${r.pd}</td></tr>`).join('')}</tbody></table>`).join('')}</div>`).join('')}</div>`;
    cupHtml=html; }
  let asHtml=''; { let html='';
  const AS=S.allStar;
  if(!AS) html+=`<div class="card"><h3>全明星周末</h3><p class="hint">${dateTxt(ASB[0])} 举行。出场 20 场以上的球员按数据、总评和球队战绩评选，东西部各 12 人。</p></div>`;
  else {
    html+=`<div class="card"><h3>全明星赛 <span class="r">东部 ${AS.game.score[0]} - ${AS.game.score[1]} 西部</span></h3><p>MVP：<b>${pn(AS.game.mvp)}</b></p>
      <div class="hint" style="margin-top:4px">${AS.game.top.map(x=>`${pn(x.id)} ${x.pts} 分 ${x.reb} 板 ${x.ast} 助`).join(' · ')}</div></div>
     <div class="row">${['东','西'].map(cf=>`<div class="col card" style="min-width:240px"><h3>${cf}部全明星</h3><div class="hint">首发</div>${AS[cf].starters.map(id=>`<div>${pn(id)} <span class="hint">${PBYID[id]?PBYID[id].pos:''} · ${tn(teamOfPlayer(PBYID[id]))}</span></div>`).join('')}<div class="hint" style="margin-top:6px">替补</div>${AS[cf].reserves.map(id=>`<div>${pn(id)} <span class="hint">${PBYID[id]?PBYID[id].pos:''} · ${tn(teamOfPlayer(PBYID[id]))}</span></div>`).join('')}</div>`).join('')}
      <div class="col card" style="min-width:240px"><h3>三分大赛 <span class="r">冠军 ${AS.three.w?pn(AS.three.w):'-'}</span></h3><div class="hint">决赛</div>${AS.three.fin.map(([id,s])=>`<div>${pn(id)} <b>${s}</b></div>`).join('')}<div class="hint" style="margin-top:6px">首轮</div>${AS.three.r1.map(([id,s])=>`<div>${pn(id)} ${s}</div>`).join('')}
        <h3 style="margin-top:12px">扣篮大赛 <span class="r">冠军 ${AS.dunk.w?pn(AS.dunk.w):'-'}</span></h3><div class="hint">决赛</div>${AS.dunk.fin.map(([id,s])=>`<div>${pn(id)} <b>${s}</b></div>`).join('')}<div class="hint" style="margin-top:6px">首轮</div>${AS.dunk.r1.map(([id,s])=>`<div>${pn(id)} ${s}</div>`).join('')}</div></div>`;
  }
  asHtml=html; }
  v.innerHTML=html0 + (S.allStar? asHtml+cupHtml : cupHtml+asHtml);
  v.querySelectorAll('[data-id]').forEach(el=>el.onclick=()=>showPlayer(PBYID[el.dataset.id]));
}
