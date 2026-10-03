// ================= 交易、自由球员、裁人 =================
// 规范：《第三阶段规范.md》§4 §7
function ctxYear(){ return W.off? W.off.year : W.year; }
function tradeOpen(){
  if(W.off) return {ok:true};
  const S=G.season; if(!S) return {ok:false, why:'还没开始赛季'};
  if(S.phase!=='reg') return {ok:false, why:'季后赛期间不能交易，休赛期再来'};
  const dl=dayOf(new Date(S.year+1,1,5));
  if(S.day>dl) return {ok:false, why:`已经过了交易截止日（${S.year+1} 年 2 月 5 日）`};
  return {ok:true, deadline:dl};
}
function pickValue(pk, mode, prot){
  const slot=projSlot(pk);
  const eff = pk.round===1? 80-(slot-1)*.45 : 63-(slot-1)*.08;
  let v=Math.pow(Math.max(0,eff-58),2.2);
  if(mode==='rebuild') v*=1.3;
  if(pk.year>ctxYear()+ (W.off?0:1)) v*=.85;
  return v*protFactor(pk, prot==null? protOf(pk) : prot);
}
let TR={partner:null, mineP:new Set(), theirP:new Set(), mineK:new Set(), theirK:new Set(), prot:{}};
function pkKey(pk){ return `${pk.year}-${pk.round}-${pk.orig}`; }
function pkFromKey(k){ const [y,r,o]=k.split('-').map(Number); return {year:y,round:r,orig:o}; }
// ---------- 通用交易：任意两队 ----------
function tradeSal(ps, yr){ return ps.reduce((s,p)=>s+(p.contract&&p.contract[1]>yr&&p.contract[2]!=='tw'?p.contract[0]:0),0); }
// A 送出 outA（球员）outAk（选秀权），B 送出 outB、outBk。返回违反规则的说明
function checkTrade(ai, outA, bi, outB, yr, labels){
  const C=CFG(yr), iss=[]; labels=labels||[TEAMS[ai].nick, TEAMS[bi].nick];
  [[ai,outA,outB,labels[0]],[bi,outB,outA,labels[1]]].forEach(([ti,out,inn,lb])=>{
    const t=TEAMS[ti], pay=payroll(t,yr)-tradeSal(out,yr)+tradeSal(inn,yr), sIn=tradeSal(inn,yr), sOut=tradeSal(out,yr);
    const r=matchRule(pay, sOut, out.length, yr);
    if(r.max!=null && sIn>r.max) iss.push(`${lb}：${matchTxt(r)}，现在是 ${money(sIn)}`);
    if(r.noAgg && out.filter(p=>p.contract&&p.contract[2]!=='tw').length>=2 && sIn>Math.max(0,...out.map(p=>p.contract?p.contract[0]:0))) iss.push(`${lb}交易后超过第二土豪线，不能合并两人以上的工资换人`);
    out.forEach(p=>{ if(frozen(p)) iss.push(`${p.cn} 刚签约，要到 ${numDateTxt(p.frz)} 才能交易`); });
    const std=ps=>ps.filter(p=>p.contract&&p.contract[2]!=='tw').length;
    const delta=std(inn)-std(out), n=rosterCount(t,yr)+delta, lo=W.off?8:13, hi=W.off?17:15;
    // 选秀权及人数不变的交易不应被已有的阵容人数问题拦截。
    if(delta!==0){
      if(n>hi) iss.push(`${lb}交易后有 ${n} 人，超过 ${hi} 人上限`); if(n<lo) iss.push(`${lb}交易后只剩 ${n} 人，少于 ${lo} 人`);
    }
  });
  return iss;
}
function pkgValue(ti, players, picks, yr, mode){ mode=mode||teamMode(ti); return players.reduce((s,p)=>s+playerValue(p,mode,yr),0)+picks.reduce((s,k)=>s+pickValue(k,mode),0); }
function execTrade(ai, outA, outAk, bi, outB, outBk, protA){
  const A=TEAMS[ai], B=TEAMS[bi];
  outA.forEach(p=>{ A.players=A.players.filter(x=>x!==p); B.players.push(p); });
  outB.forEach(p=>{ B.players=B.players.filter(x=>x!==p); A.players.push(p); });
  [...outA,...outB].forEach(p=>{ setMor(p,mor(p)-8); delete p.treq; }); chemHit(ai,outB.length); chemHit(bi,outA.length);
  outAk.forEach(pk=>{ W.picks[pk.year][pk.round][pk.orig]=bi; const n=protA&&protA[pkKey(pk)]; if(n && pk.orig===ai && pk.round===1){ W.prot=W.prot||{}; W.prot[pkKey(pk)]=n; } });
  outBk.forEach(pk=>{ W.picks[pk.year][pk.round][pk.orig]=ai; });
  if(W.off && W.off.draft && !W.off.draft.done) W.off.draft.order.forEach(o=>{ if(W.picks[W.off.draft.year]) o.owner=W.picks[W.off.draft.year][o.round][o.orig]; });
  const desc=(ps,ks)=>[...ps.map(p=>p.cn), ...ks.map(pickLabel)].join('、')||'无';
  const txt=`${A.nick} 得到 ${desc(outB,outBk)}；${B.nick} 得到 ${desc(outA,outAk)}`;
  addNews('交易', txt);
  if(ai===G.team || bi===G.team){ G.tac.stars=G.tac.stars.filter(id=>myTeam().players.some(p=>p.id===id)); }
  reindex(); if(G.team!=null) fixRot();
  return txt;
}
function addNews(kind, txt){ W.news=W.news||[]; W.news.push({d:G.season?G.season.day:0, y:W.off?W.off.year:W.year, off:!!W.off, kind, txt}); if(W.news.length>60) W.news.splice(0,W.news.length-60); }

function evalTrade(){
  const yr=ctxYear(), me=myTeam(), pt=TEAMS[TR.partner], mode=teamMode(pt.i);
  const outP=[...TR.mineP].map(id=>PBYID[id]), inP=[...TR.theirP].map(id=>PBYID[id]);
  const outK=[...TR.mineK].map(pkFromKey), inK=[...TR.theirK].map(pkFromKey);
  const gain=outP.reduce((s,p)=>s+playerValue(p,mode,yr),0)+outK.reduce((s,k)=>s+pickValue(k,mode,TR.prot[pkKey(k)]||protOf(k)),0), lose=pkgValue(pt.i,inP,inK,yr,mode);
  const best=pt.players.slice().sort((a,b)=>b.ovr-a.ovr)[0];
  const need = lose*(best && TR.theirP.has(best.id)? 1.3 : 1.05) + 20;
  const ratio = need>0? gain/need : (gain>0?9:0);
  const issues=checkTrade(me.i,outP,pt.i,inP,yr,['你方','对方']);
  if(!outP.length && !outK.length && !inP.length && !inK.length) issues.push('还没选任何人');
  const match=matchRule(payroll(me,yr)-tradeSal(outP,yr)+tradeSal(inP,yr), tradeSal(outP,yr), outP.length, yr);
  return {ratio, issues, match, myPay:payroll(me,yr)-tradeSal(outP,yr)+tradeSal(inP,yr), ptPay:payroll(pt,yr)-tradeSal(inP,yr)+tradeSal(outP,yr), salOut:tradeSal(outP,yr), salIn:tradeSal(inP,yr), mode};
}
function doTrade(){
  const me=myTeam(), pt=TEAMS[TR.partner];
  const txt=execTrade(me.i,[...TR.mineP].map(id=>PBYID[id]),[...TR.mineK].map(pkFromKey), pt.i,[...TR.theirP].map(id=>PBYID[id]),[...TR.theirK].map(pkFromKey), TR.prot);
  if(G.season) G.season.inbox.push({d:G.season.day, t:`和${pt.cn}完成交易`, b:txt});
  TR.mineP.clear(); TR.theirP.clear(); TR.mineK.clear(); TR.theirK.clear(); TR.prot={};
  save(); return txt;
}
function vTrade(v){
  const op=tradeOpen();
  if(!op.ok){ v.innerHTML=`<h1>交易</h1><div class="card"><p>${esc(op.why)}</p></div>`; return; }
  if(TR.partner==null || TR.partner===G.team) TR.partner=(G.team+1)%30;
  const yr=ctxYear(), me=myTeam(), pt=TEAMS[TR.partner];
  const ev=evalTrade(), empty=!TR.mineP.size&&!TR.theirP.size&&!TR.mineK.size&&!TR.theirK.size;
  const verdict = ev.ratio>=1? ['会接受','var(--good)'] : ev.ratio>=.85? ['差一点','var(--warn)'] : ['差很远','var(--bad)'];
  const side=(t,setP,setK,key)=>`<div class="card tw"><h3>${logo(t,20)} ${esc(t.cn)} <span class="r">${t===pt?(ev.mode==='rebuild'?'重建中，看重年轻人和选秀权':'争冠中，看重即战力'):''} 工资 ${money(payroll(t,yr))}</span></h3><table><thead><tr><th></th><th>球员</th><th class="n">年龄</th><th class="n">总评</th><th class="n">潜力</th><th class="n">年薪</th><th class="n">到期</th></tr></thead><tbody>
    ${t.players.slice().sort((a,b)=>b.ovr-a.ovr).map(p=>`<tr><td><input type="checkbox" data-${key}p="${p.id}" ${setP.has(p.id)?'checked':''} ${frozen(p)?'disabled':''}></td><td class="cl" data-id="${p.id}">${esc(p.cn)}${injTag(p)}${frzTag(p)}</td><td class="n">${ageOf(p,yr)}</td><td class="n">${ovrTag(p.ovr)}</td><td class="n">${p.pot}</td><td class="n">${p.contract?money(p.contract[0]):'-'}</td><td class="n">${p.contract?p.contract[1]+(p.contract[2]==='rk'?' 新秀':p.contract[2]==='tw'?' 双向':''):''}</td></tr>`).join('')}
    </tbody></table><div style="margin-top:8px">${picksOwnedBy(t.i).map(pk=>`<label class="pill" style="background:#1c2430;margin:2px;padding:3px 8px;cursor:pointer"><input type="checkbox" data-${key}k="${pkKey(pk)}" ${setK.has(pkKey(pk))?'checked':''}> ${esc(pickLabel(pk))}${key==='m'&&setK.has(pkKey(pk))&&pk.round===1&&pk.orig===G.team&&!protOf(pk)&&!(W.off&&W.off.lottery&&pk.year===W.off.lottery.year)?` <select data-prot="${pkKey(pk)}" onclick="event.stopPropagation()">${PROT_OPTS.map(n=>`<option value="${n}" ${(TR.prot[pkKey(pk)]||0)===n?'selected':''}>${n?'前 '+n+' 保护':'不保护'}</option>`).join('')}</select>`:''}</label>`).join('')||'<span class="hint">没有选秀权</span>'}</div></div>`;
  v.innerHTML=`<h1>交易</h1><div class="sub">${W.off?'休赛期可以随时交易':'交易截止日：'+(G.season.year+1)+' 年 2 月 5 日'} · 勾选双方要交换的球员和选秀权</div>
   <div class="card"><div class="row" style="align-items:center"><span>交易对象</span><select id="tp">${TEAMS.filter(t=>t.i!==G.team).map(t=>`<option value="${t.i}" ${t.i===TR.partner?'selected':''}>${esc(t.cn)}</option>`).join('')}</select>
     ${empty?'':`<span style="margin-left:auto">对方的态度：<b style="color:${verdict[1]}">${verdict[0]}</b></span>`}</div>
     ${empty?`<p class="hint" style="margin-top:8px">在下面勾选你送出的和想要的球员、选秀权，这里会显示对方的态度和薪资规则。</p>`:`<div class="fitbar" style="margin-top:8px">${bar(Math.min(ev.ratio,1.3),1.3,verdict[1].includes('good')?'#00c276':verdict[1].includes('warn')?'#f0a020':'#e5484d')}</div>
     <p class="hint" style="margin-top:6px">送出薪资 ${money(ev.salOut)} · 换来薪资 ${money(ev.salIn)} · 交易后你的工资 ${money(ev.myPay)}（工资帽 ${money(CFG(yr).cap)}，第一土豪线 ${money(CFG(yr).apron1)}，第二土豪线 ${money(CFG(yr).apron2)}）</p>
     <p class="hint">${esc(matchTxt(ev.match))}</p>
     ${ev.issues.map(s=>`<div class="bad">${esc(s)}</div>`).join('')}`}
     <div style="margin-top:8px"><button class="pri" id="tgo" ${ev.issues.length||ev.ratio<1?'disabled':''}>提出交易</button> <button id="tclr">清空</button></div></div>
   <div class="row"><div class="col" style="min-width:320px">${side(me,TR.mineP,TR.mineK,'m')}</div><div class="col" style="min-width:320px">${side(pt,TR.theirP,TR.theirK,'t')}</div></div>`;
  const q=s=>v.querySelector(s);
  q('#tp').onchange=e=>{ TR.partner=+e.target.value; TR.theirP.clear(); TR.theirK.clear(); vTrade(v); };
  q('#tclr').onclick=()=>{ TR.mineP.clear(); TR.theirP.clear(); TR.mineK.clear(); TR.theirK.clear(); vTrade(v); };
  q('#tgo').onclick=()=>{ const txt=doTrade(); toast('交易完成'); render(); };
  const bind=(sel,set,num)=>v.querySelectorAll(sel).forEach(cb=>cb.onchange=()=>{ const k=num?+cb.getAttribute(sel.slice(1,-1)):cb.getAttribute(sel.slice(1,-1)); if(cb.checked) set.add(k); else set.delete(k); vTrade(v); });
  v.querySelectorAll('[data-prot]').forEach(sl=>sl.onchange=()=>{ const n=+sl.value; if(n) TR.prot[sl.dataset.prot]=n; else delete TR.prot[sl.dataset.prot]; vTrade(v); });
  bind('[data-mp]',TR.mineP,true); bind('[data-tp]',TR.theirP,true); bind('[data-mk]',TR.mineK,false); bind('[data-tk]',TR.theirK,false);
  v.querySelectorAll('td[data-id]').forEach(el=>el.onclick=()=>showPlayer(PBYID[el.dataset.id]));
}

// ---------- 自由球员（赛季中、休赛期自由市场以外） ----------
function inSeasonAsk(p){ const yr=ctxYear(); return Math.max(CFG(yr).minSal, Math.round(marketSalary(p.ovr,ageOf(p,yr),yr)*(W.off?1:.6))); }
function vFA(v){
  const yr=ctxYear(), C=CFG(yr), t=myTeam(), pay=payroll(t,yr);
  if(W.off && W.off.step===4){ v.innerHTML=`<h1>自由球员</h1><div class="card"><p>自由市场正在进行，请在「休赛期」页报价。</p></div>`; return; }
  const fas=FREE.slice().sort((a,b)=>b.ovr-a.ovr).slice(0,80);
  const mineStd=t.players.filter(p=>p.contract&&p.contract[2]!=='tw');
  const minRoster = W.off? 0 : 13;
  v.innerHTML=`<h1>自由球员</h1><div class="sub">${W.off?'休赛期':'赛季中'}签约：${W.off?'按要价':'要价打六折'}，合同 1 年。工资 ${money(pay)} · 工资帽剩 ${money(Math.max(0,C.cap-pay))} · 中产 ${(W.mle[yr]||{})[G.team]?'已用':pay<C.apron1?money(C.mleNT):pay<C.apron2?money(C.mleTP):'不可用'} · 正式合同 ${rosterCount(t,yr)} / 15</div>
   <div class="card tw"><h3>市场上的球员</h3><table><thead><tr><th>球员</th><th>位置</th><th class="n">年龄</th><th class="n">总评</th><th class="n">潜力</th><th class="n">要价</th><th></th></tr></thead><tbody>
    ${fas.map(p=>{ const a=inSeasonAsk(p), r=offerRule(G.team,a,yr); return `<tr><td class="cl" data-id="${p.id}"><b>${esc(p.cn)}</b></td><td>${p.pos}</td><td class="n">${ageOf(p,yr)}</td><td class="n">${ovrTag(p.ovr)}</td><td class="n">${p.pot}</td><td class="n">${money(a)}</td>
      <td>${r.ok?`<button class="sm pri" data-sign="${p.id}">签下（${r.kind}）</button>`:`<span class="hint">${esc(r.why)}</span>`}</td></tr>`; }).join('')}</tbody></table></div>
   ${(()=>{ const tw=t.players.filter(p=>p.contract&&p.contract[2]==='tw'); return tw.length?`<div class="card tw"><h3>双向合同 <span class="r">${tw.length} / 3，不占 15 人名额，不算工资</span></h3><table><tbody>${tw.map(p=>`<tr><td>${esc(p.cn)} <span class="hint">${p.pos} · ${ageOf(p,yr)} 岁</span></td><td class="n">${ovrTag(p.ovr)}</td><td class="n">潜力 ${p.pot}</td><td class="n">至 ${p.contract[1]}</td><td>${rosterCount(t,yr)<15?`<button class="sm" data-tw="${p.id}">转正式合同（底薪 × 2 年）</button>`:'<span class="hint">正式合同已满 15 人</span>'}</td></tr>`).join('')}</tbody></table></div>`:''; })()}
   <div class="card tw"><h3>裁人 <span class="r">剩余合同照付，算进工资（死钱）</span></h3><table><tbody>
    ${mineStd.sort((a,b)=>a.ovr-b.ovr).map(p=>`<tr><td>${esc(p.cn)}</td><td class="n">${ovrTag(p.ovr)}</td><td class="n">${p.contract?money(p.contract[0])+' 至 '+p.contract[1]:''}</td><td>${mineStd.length>minRoster?`<button class="sm" data-waive="${p.id}">裁掉</button>`:''}</td></tr>`).join('')}</tbody></table>
    ${(W.dead[G.team]||[]).filter(d=>d.exp>yr).length?`<p class="hint" style="margin-top:6px">死钱：${W.dead[G.team].filter(d=>d.exp>yr).map(d=>`${esc(d.cn)} ${money(d.amt)} 至 ${d.exp}`).join('；')}</p>`:''}</div>`;
  v.querySelectorAll('[data-sign]').forEach(b=>b.onclick=()=>{ const p=PBYID[b.dataset.sign]; const r=signFA(p,G.team,inSeasonAsk(p),1,yr); if(r.ok){ reindex(); fixRot(); save(); toast(`签下 ${p.cn}`); if(G.season) applyPlayerState(); } else toast(r.why); render(); });
  v.querySelectorAll('[data-tw]').forEach(b=>b.onclick=()=>{ const p=PBYID[b.dataset.tw]; p.contract=[CFG(yr).minSal, yr+2, 'std']; reindex(); fixRot(); save(); toast(`${p.cn} 转为正式合同`); render(); });
  v.querySelectorAll('[data-waive]').forEach(b=>b.onclick=()=>{ const p=PBYID[b.dataset.waive]; waive(p,G.team,yr); reindex(); fixRot(); save(); toast(`裁掉了 ${p.cn}`); render(); });
  v.querySelectorAll('td[data-id]').forEach(el=>el.onclick=()=>showPlayer(PBYID[el.dataset.id]));
}
