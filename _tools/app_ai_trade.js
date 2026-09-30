// ================= AI 交易：AI 之间、AI 找玩家 =================
// 规范：《第四阶段规范.md》§3 §4
function teamsByMode(){ const c=[], r=[]; TEAMS.forEach(t=>{ if(t.i===G.team) return; (teamMode(t.i)==='contend'?c:r).push(t.i); }); return {c,r}; }
function tradeableAssets(ti, yr, exclude){
  const t=TEAMS[ti], top=t.players.slice().sort((a,b)=>b.ovr-a.ovr), protect=new Set(top.slice(0,exclude||0).map(p=>p.id));
  return {players:t.players.filter(p=>!protect.has(p.id) && p.contract && p.contract[1]>yr && p.contract[2]!=='tw' && !(p.injury>200)), picks:picksOwnedBy(ti)};
}
// 从 giver 的资产里枚举「最多 3 人 + 2 个签」的组合：接收方得到的价值 ≥ minRecv，送出方付出的价值 ≤ maxGive，规则合规，溢价最小
function searchPackage(giver, receiver, recvOut, recvOutK, recvVal, giveVal, minRecv, maxGive, yr, protectN, filterP){
  const A=tradeableAssets(giver,yr,protectN);
  const P=A.players.filter(filterP||(()=>true)).map(p=>({p, r:recvVal(p), g:giveVal(p)})).filter(x=>x.r>3).sort((x,y)=>y.r-x.r).slice(0,12);
  const K=A.picks.map(k=>({k, r:recvVal(k), g:giveVal(k)})).sort((x,y)=>y.r-x.r).slice(0,4);
  let best=null, bestScore=1e18;
  const pc=[[]]; for(let i=0;i<P.length;i++){ pc.push([i]); for(let j=i+1;j<P.length;j++){ pc.push([i,j]); for(let k=j+1;k<P.length;k++) pc.push([i,j,k]); } }
  const kc=[[]]; for(let i=0;i<K.length;i++){ kc.push([i]); for(let j=i+1;j<K.length;j++) kc.push([i,j]); }
  for(const pi of pc) for(const ki of kc){
    if(!pi.length && !ki.length) continue;
    let r=0,g=0; pi.forEach(i=>{ r+=P[i].r; g+=P[i].g; }); ki.forEach(i=>{ r+=K[i].r; g+=K[i].g; });
    if(r<minRecv || g>maxGive) continue;
    const sc=r-minRecv + (pi.length+ki.length)*3;          // 溢价越小、件数越少越好
    if(sc>=bestScore) continue;
    const outP=pi.map(i=>P[i].p);
    if(checkTrade(giver,outP,receiver,recvOut,yr).length) continue;
    best={outP, outK:ki.map(i=>K[i].k), r, g}; bestScore=sc;
  }
  return best;
}
// 买家 bi 用年轻人和选秀权，向卖家 si 换一个老将
function genAITrade(bi, si, yr){
  const B=TEAMS[bi], S=TEAMS[si];
  const bTop=B.players.slice().sort((a,b)=>b.ovr-a.ovr); const fifth=bTop[4]?bTop[4].ovr:70;
  const targets=S.players.filter(p=>p.contract && p.contract[1]>yr && p.contract[2]!=='tw' && (ageOf(p,yr)>=26||p.treq) && p.ovr>fifth && !(p.injury>30)).sort((a,b)=>(b.treq?1:0)-(a.treq?1:0)||b.ovr-a.ovr);
  for(const target of targets.slice(0,3)){
    const sLose=playerValue(target,'rebuild',yr), bGain=playerValue(target,'contend',yr);
    const pk=searchPackage(bi, si, [target], [], x=>x.id!=null?playerValue(x,'rebuild',yr):pickValue(x,'rebuild'), x=>x.id!=null?playerValue(x,'contend',yr):pickValue(x,'contend'),
      sLose*1.05+20, bGain, yr, 3);
    if(pk) return {bi, si, outP:pk.outP, outK:pk.outK, target};
  }
  return null;
}
function tryAITrade(){
  const yr=ctxYear(), {c,r}=teamsByMode(); if(!c.length||!r.length) return false;
  const unhappy=TEAMS.filter(t=>t.i!==G.team && t.players.some(p=>p.treq)).map(t=>t.i);
  for(let k=0;k<8;k++){
    let bi=pickOne(c), si=pickOne(r);
    if(unhappy.length && rnd01()<.4){ si=pickOne(unhappy); bi=pickOne(c.filter(x=>x!==si).concat(r.filter(x=>x!==si && TEAMS[x].top8>TEAMS[si].top8))); if(bi==null) continue; }
    const T=genAITrade(bi,si,yr);
    if(T){ execTrade(T.bi,T.outP,T.outK,T.si,[T.target],[]); W.aiTrades=(W.aiTrades||0)+1; return true; }
  }
  return false;
}

// ---------- AI 找玩家 ----------
function genUserOffer(){
  const yr=ctxYear(), U=myTeam(), uMode=teamMode(G.team);
  const ai=pickOne(TEAMS.filter(t=>t.i!==G.team)).i, mode=teamMode(ai);
  // AI 想要什么
  let target=null;
  if(mode==='contend'){ const five=TEAMS[ai].players.slice().sort((a,b)=>b.ovr-a.ovr)[4];
    const c=U.players.filter(p=>p.contract && p.contract[1]>yr && p.contract[2]!=='tw' && ageOf(p,yr)>=25 && p.ovr>(five?five.ovr:70) && !(p.injury>20));
    if(c.length) target={p:pickOne(c.sort((a,b)=>b.ovr-a.ovr).slice(0,4))}; }
  else { const c=U.players.filter(p=>p.contract && p.contract[2]!=='tw' && ageOf(p,yr)<=23 && p.pot>=80);
    const ks=picksOwnedBy(G.team).filter(k=>k.round===1);
    if(c.length && (rnd01()<.6 || !ks.length)) target={p:pickOne(c)}; else if(ks.length) target={k:pickOne(ks)}; }
  if(!target) return null;
  const tUser = target.p? playerValue(target.p,uMode,yr) : pickValue(target.k,uMode);
  const tAI   = target.p? playerValue(target.p,mode,yr)  : pickValue(target.k,mode);
  const inP=target.p?[target.p]:[], inK=target.k?[target.k]:[];
  const pk=searchPackage(ai, G.team, inP, inK, x=>x.id!=null?playerValue(x,uMode,yr):pickValue(x,uMode), x=>x.id!=null?playerValue(x,mode,yr):pickValue(x,mode),
    tUser*.9, tAI*.97, yr, mode==='contend'?3:1);
  if(!pk) return null;
  const outP=pk.outP, outK=pk.outK;
  const S=G.season;
  return {id:Date.now()+'-'+Math.floor(rnd01()*1e6), from:ai, give:{p:outP.map(p=>p.id), k:outK.map(pkKey)}, get:{p:inP.map(p=>p.id), k:inK.map(pkKey)},
    exp: W.off? {off:true, step:W.off.step+1} : {off:false, day:(S?S.day:0)+3}};
}
function maybeUserOffer(prob){
  W.offers=(W.offers||[]).filter(o=>!offerExpired(o));
  if(W.offers.length>=2 || rnd01()>=prob) return;
  let o=null; for(let k=0;k<4 && !o;k++) o=genUserOffer(); if(o){ W.offers.push(o); if(G.season) G.season.inbox.push({d:G.season.day, t:`${TEAMS[o.from].cn}发来交易报价`, b:'在首页的「交易报价」里查看。'}); }
}
function offerExpired(o){ if(o.exp.off) return !W.off || W.off.step>o.exp.step; return W.off || !G.season || G.season.day>o.exp.day || G.season.phase!=='reg'; }
function offerItems(o){ return {give:o.give.p.map(id=>PBYID[id]).filter(Boolean), giveK:o.give.k.map(pkFromKey), get:o.get.p.map(id=>PBYID[id]).filter(Boolean), getK:o.get.k.map(pkFromKey)}; }
function acceptOffer(id){
  const o=(W.offers||[]).find(x=>x.id===id); if(!o) return;
  const it=offerItems(o), yr=ctxYear();
  const valid = it.give.every(p=>TEAMS[o.from].players.includes(p)) && it.get.every(p=>myTeam().players.includes(p))
    && it.giveK.every(k=>W.picks[k.year]&&W.picks[k.year][k.round][k.orig]===o.from) && it.getK.every(k=>W.picks[k.year]&&W.picks[k.year][k.round][k.orig]===G.team);
  const iss=valid? checkTrade(G.team,it.get,o.from,it.give,yr,['你方','对方']) : ['阵容已经变了，这份报价作废'];
  W.offers=W.offers.filter(x=>x!==o);
  if(iss.length){ toast(iss[0]); save(); return; }
  const txt=execTrade(G.team,it.get,it.getK,o.from,it.give,it.giveK);
  if(G.season) G.season.inbox.push({d:G.season.day, t:`接受了${TEAMS[o.from].cn}的报价`, b:txt});
  toast('交易完成'); save();
}
function rejectOffer(id){ W.offers=(W.offers||[]).filter(x=>x.id!==id); save(); }
function offersHTML(){
  W.offers=(W.offers||[]).filter(o=>!offerExpired(o));
  if(!W.offers.length) return '';
  const yr=ctxYear();
  return `<div class="card" style="border-color:var(--acc)"><h3>交易报价</h3>${W.offers.map(o=>{ const it=offerItems(o), t=TEAMS[o.from];
    const line=(ps,ks)=>[...ps.map(p=>`${esc(p.cn)} ${ovrTag(p.ovr)} <span class="hint">${ageOf(p,yr)} 岁 · ${p.contract?money(p.contract[0]):''}</span>`), ...ks.map(k=>esc(pickLabel(k)))].join('<br>')||'无';
    const dPay=tradeSal(it.give,yr)-tradeSal(it.get,yr);
    return `<div style="padding:8px 0;border-bottom:1px solid #1f2733"><div style="margin-bottom:6px">${logo(t,18)} <b>${esc(t.cn)}</b> <span class="hint">${teamMode(t.i)==='contend'?'争冠中':'重建中'} · ${o.exp.off?'这一步结束前有效':'3 天内有效'}</span></div>
      <div class="row"><div class="col"><div class="hint">你送出</div>${line(it.get,it.getK)}</div><div class="col"><div class="hint">你得到</div>${line(it.give,it.giveK)}</div></div>
      <div class="hint" style="margin-top:4px">你的工资 ${dPay>=0?'+':''}${money(dPay)}</div>
      <div style="margin-top:6px"><button class="sm pri" data-acc="${o.id}">接受</button> <button class="sm" data-rej="${o.id}">拒绝</button></div></div>`; }).join('')}</div>`;
}
function bindOffers(v){
  v.querySelectorAll('[data-acc]').forEach(b=>b.onclick=()=>{ acceptOffer(b.dataset.acc); render(); });
  v.querySelectorAll('[data-rej]').forEach(b=>b.onclick=()=>{ rejectOffer(b.dataset.rej); render(); });
}
function newsHTML(n){
  const N=(W.news||[]).slice(-(n||8)).reverse(); if(!N.length) return '';
  return `<div class="card"><h3>联盟动态</h3>${N.map(x=>`<div style="padding:5px 0;border-bottom:1px solid #1f2733"><span class="pill" style="background:${x.kind==='交易'?'#1d3a5c':x.kind==='匹配'?'#3a2a10':'#1f3a2a'}">${esc(x.kind)}</span> <span class="hint">${x.off?x.y+' 休赛期':dateTxt(Math.min(x.d,REG_DAYS+80))}</span><div style="margin-top:2px">${esc(x.txt)}</div></div>`).join('')}</div>`;
}
