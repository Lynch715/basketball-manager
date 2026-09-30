// ================= 劳资协议：薪资匹配分档、冷冻期、受保护选秀权 =================
// 规范：《第六阶段规范.md》§1
function dayNumOf(dt){ return Math.floor(dt.getTime()/864e5); }
function todayNum(){ if(W.off) return dayNumOf(new Date(W.off.year,6,10)); const S=G.season; return S? dayNumOf(dateOf(S.day)) : dayNumOf(new Date(W.year,9,1)); }
function numDateTxt(n){ const d=new Date(n*864e5+12*3600e3); return `${d.getMonth()+1}月${d.getDate()}日`; }
function seasonYearNow(){ return W.off? W.off.year : W.year; }
function freezeOnSign(p){ const y=seasonYearNow(), dec=dayNumOf(new Date(y,11,15)); p.frz = W.off? dec : Math.max(dec, todayNum()+90); }
function frozen(p){ return !!(p && p.frz && p.frz>todayNum()); }
function frzTag(p){ return frozen(p)? ` <span class="pill" style="background:#1d3a5c">冻结至 ${numDateTxt(p.frz)}</span>` : ''; }

// 薪资匹配：返回 {tier, max}（max=null 表示不限）
function matchRule(payAfter, outSal, outN, yr){
  const C=CFG(yr), k=capMul(yr);
  if(payAfter<=C.cap) return {tier:'帽下', max:null};
  if(payAfter<=C.apron1){ const m= outSal<=750*k? outSal*2+25*k : outSal<=2900*k? outSal+750*k : outSal*1.25+25*k; return {tier:'帽上', max:Math.round(m)}; }
  if(payAfter<=C.apron2) return {tier:'第一土豪线以上', max:outSal};
  return {tier:'第二土豪线以上', max:outSal, noAgg:true};
}
function matchTxt(r){ return r.tier==='帽下'? '交易后在工资帽以下，换进来的薪资不限'
  : r.tier==='帽上'? `交易后超过工资帽，换进来的薪资最多 ${money(r.max)}`
  : r.tier==='第一土豪线以上'? `交易后超过第一土豪线，换进来的薪资不能超过换出去的（${money(r.max)}）`
  : `交易后超过第二土豪线，换进来的不能超过换出去的（${money(r.max)}），也不能合并两人以上的工资换一个人`; }

// ---------- 受保护选秀权 ----------
const PROT_OPTS=[0,5,10,14];
function protOf(pk){ return (W.prot||{})[pkKey(pk)]||0; }
function protTxt(n){ return n? `前 ${n} 保护` : ''; }
function projSlot(pk){ // 预计顺位（首轮 1–30）
  if(W.off && W.off.lottery && pk.year===W.off.lottery.year){ const o=W.off.lottery.order.find(x=>x.round===pk.round && x.orig===pk.orig); if(o) return pk.round===1?o.no:o.no-30; }
  const rank=TEAMS.slice().sort((a,b)=>b.top8-a.top8).findIndex(t=>t.i===pk.orig); return 30-rank;
}
function protFactor(pk, n){ if(!n || pk.round!==1) return 1; return projSlot(pk)<=n? .5 : 1-.15*n/14; }
// 抽签后处理：保护范围内的签回到原球队，得签一方拿下一年的首轮（或两个次轮）
function resolveProtections(year, r1){
  W.prot=W.prot||{};
  r1.forEach((orig,k)=>{ const key=`${year}-1-${orig}`, n=W.prot[key]; if(!n) return; delete W.prot[key];
    const owner=W.picks[year][1][orig]; if(owner===orig) return;
    if(k+1>n){ addNews('选秀权',`${TEAMS[orig].nick}送出的${year}年首轮签（前 ${n} 保护）抽到第 ${k+1} 顺位，转给${TEAMS[owner].nick}`); return; }
    W.picks[year][1][orig]=orig; const ny=year+1; ensurePicks(ny);
    let got;
    if(W.picks[ny][1][orig]===orig){ W.picks[ny][1][orig]=owner; got=`${ny} 年首轮签`; }
    else { W.picks[ny][2][orig]===orig && (W.picks[ny][2][orig]=owner); ensurePicks(ny+1); W.picks[ny+1][2][orig]===orig && (W.picks[ny+1][2][orig]=owner); got='两个次轮签'; }
    const txt=`${TEAMS[orig].nick}的${year}年首轮签抽到第 ${k+1} 顺位，在前 ${n} 保护范围内，签留在原队；${TEAMS[owner].nick}改拿${TEAMS[orig].nick}的${got}`;
    addNews('选秀权',txt); if(owner===G.team||orig===G.team) (G.season?G.season.inbox:[]).push({d:G.season?G.season.day:0, t:'选秀权保护生效', b:txt});
  });
}

// ---------- 选秀夜：上位报价 ----------
function pickUsed(k){ const O=W.off; if(!O || !O.draft || k.year!==O.draft.year) return false; const i=O.draft.order.findIndex(o=>o.round===k.round && o.orig===k.orig); return i>=0 && i<O.draft.idx; }
function maybeDraftOffer(pk){
  const O=W.off, D=O.draft; O.dOffered=O.dOffered||{};
  if(pk.round!==1 || O.dOffered[pk.no]) return; O.dOffered[pk.no]=true;
  if(rnd01()>=.35) return;
  const mineK={year:D.year, round:1, orig:pk.orig}, vMine=pickValue(mineK,'rebuild',0);
  const later=D.order.slice(D.idx+1).filter(o=>o.round===1 && o.owner!==G.team);
  for(const o of later.sort(()=>rnd01()-.5).slice(0,6)){
    const theirK={year:D.year, round:1, orig:o.orig}, gap=vMine-pickValue(theirK,'rebuild',0); if(gap<=0) continue;
    const fut=picksOwnedBy(o.owner).filter(k=>k.year>D.year && !protOf(k)).map(k=>({k,v:pickValue(k,'rebuild')}));
    let best=null;
    for(let i=0;i<fut.length;i++){ const v1=fut[i].v; if(v1>=gap*.95 && v1<=gap*1.8 && (!best||v1<best.v)) best={ks:[fut[i].k],v:v1};
      for(let j=i+1;j<fut.length;j++){ const v2=v1+fut[j].v; if(v2>=gap*.95 && v2<=gap*1.8 && (!best||v2<best.v)) best={ks:[fut[i].k,fut[j].k],v:v2}; } }
    if(!best) continue;
    W.offers=(W.offers||[]).filter(x=>!x.draft);
    W.offers.push({id:'d'+Date.now(), draft:true, from:o.owner, give:{p:[], k:[theirK,...best.ks].map(pkKey)}, get:{p:[], k:[pkKey(mineK)]}, exp:{off:true, step:O.step}});
    return;
  }
}
