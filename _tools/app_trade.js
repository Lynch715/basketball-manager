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
function rosterChangesPaused(){ return BUSY || !!(LIVE && !LIVE.finished); }
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
function activeContract(p, yr){ return !!(p && p.contract && p.contract[1]>yr); }
function tradeSal(ps, yr){ return ps.reduce((s,p)=>s+(p.contract&&p.contract[1]>yr&&p.contract[2]!=='tw'?p.contract[0]:0),0); }
// A 送出 outA（球员）outAk（选秀权），B 送出 outB、outBk。返回违反规则的说明
function checkTrade(ai, outA, bi, outB, yr, labels, skipSalary=false){
  const iss=[]; labels=labels||[TEAMS[ai].nick, TEAMS[bi].nick];
  [[ai,outA,outB,labels[0]],[bi,outB,outA,labels[1]]].forEach(([ti,out,inn,lb])=>{
    const t=TEAMS[ti], pay=payroll(t,yr)-tradeSal(out,yr)+tradeSal(inn,yr), sIn=tradeSal(inn,yr), sOut=tradeSal(out,yr);
    const r=matchRule(pay, sOut, out.length, yr);
    if(!skipSalary){
      if(r.max!=null && sIn>r.max) iss.push(`${lb}：${matchTxt(r)}，现在是 ${money(sIn)}`);
      if(r.noAgg && out.filter(p=>p.contract&&p.contract[2]!=='tw').length>=2 && sIn>Math.max(0,...out.map(p=>p.contract?p.contract[0]:0))) iss.push(`${lb}交易后超过第二土豪线，不能合并两人以上的工资换人`);
    }
    out.forEach(p=>{ if(!t.players.includes(p) || !activeContract(p,yr)) iss.push(`${lb}的交易球员已离队或合同已到期`); if(frozen(p)) iss.push(`${p.cn} 刚签约，要到 ${numDateTxt(p.frz)} 才能交易`); });
    const std=ps=>ps.filter(p=>activeContract(p,yr)&&p.contract[2]!=='tw').length;
    const twoWay=ps=>ps.filter(p=>activeContract(p,yr)&&p.contract[2]==='tw').length;
    const delta=std(inn)-std(out), n=rosterCount(t,yr)+delta, lo=W.off?8:13, hi=W.off?17:15;
    // 选秀权及人数不变的交易不应被已有的阵容人数问题拦截。
    if(delta!==0){
      if(n>hi) iss.push(`${lb}交易后有 ${n} 人，超过 ${hi} 人上限`); if(n<lo) iss.push(`${lb}交易后只剩 ${n} 人，少于 ${lo} 人`);
    }
    const addedTwoWay=twoWay(inn)-twoWay(out);
    if(addedTwoWay>0 && twoWay(t.players)+addedTwoWay>3) iss.push(`${lb}交易后将超过 3 份双向合同`);
  });
  return iss;
}
function checkTradeAssets(ai, ps, ks, yr){
  const iss=[];
  if(new Set(ps).size!==ps.length || new Set(ks.map(pkKey)).size!==ks.length) iss.push('不能重复交易同一资产');
  ps.forEach(p=>{ if(!TEAMS[ai].players.includes(p) || !activeContract(p,yr)) iss.push('交易球员已离队或合同已到期'); });
  ks.forEach(k=>{ if(k.year<=yr-(W.off?1:0) || pickUsed(k) || !W.picks[k.year] || W.picks[k.year][k.round]?.[k.orig]!==ai) iss.push('选秀权已使用、已到期或不属于这支球队'); });
  return iss;
}
function pkgValue(ti, players, picks, yr, mode){ mode=mode||teamMode(ti); return players.reduce((s,p)=>s+playerValue(p,mode,yr),0)+picks.reduce((s,k)=>s+pickValue(k,mode),0); }
function execTrade(ai, outA, outAk, bi, outB, outBk, protA, skipSalary=false){
  const A=TEAMS[ai], B=TEAMS[bi], yr=ctxYear();
  const issues=[...checkTrade(ai,outA,bi,outB,yr,undefined,skipSalary), ...checkTradeAssets(ai,outA,outAk,yr), ...checkTradeAssets(bi,outB,outBk,yr)];
  if(issues.length) throw new Error(issues[0]);
  outA.forEach(p=>{ A.players=A.players.filter(x=>x!==p); B.players.push(p); });
  outB.forEach(p=>{ B.players=B.players.filter(x=>x!==p); A.players.push(p); });
  [...outA,...outB].forEach(p=>{ setMor(p,mor(p)-8); delete p.treq; }); chemHit(ai,outB.length); chemHit(bi,outA.length);
  outAk.forEach(pk=>{ W.picks[pk.year][pk.round][pk.orig]=bi; const n=protA&&protA[pkKey(pk)]; if(n && pk.orig===ai && pk.round===1){ W.prot=W.prot||{}; W.prot[pkKey(pk)]=n; } });
  outBk.forEach(pk=>{ W.picks[pk.year][pk.round][pk.orig]=ai; });
  if(W.off){
    const draft=W.off.draft, lottery=W.off.lottery;
    const order=draft ? draft.order.slice(draft.idx) : lottery?.order;
    const picks=W.picks[(draft||lottery)?.year];
    if(picks && order) order.forEach(o=>{ o.owner=picks[o.round][o.orig]; });
  }
  const desc=(ps,ks)=>[...ps.map(p=>p.cn), ...ks.map(pickLabel)].join('、')||'无';
  const txt=`${A.nick} 得到 ${desc(outB,outBk)}；${B.nick} 得到 ${desc(outA,outAk)}`;
  addNews('交易', txt);
  if(ai===G.team || bi===G.team){ G.tac.stars=G.tac.stars.filter(id=>myTeam().players.some(p=>p.id===id)); }
  reindex(); if(G.team!=null) fixRot();
  return txt;
}
function addNews(kind, txt){ W.news=W.news||[]; W.news.push({d:G.season?G.season.day:0, y:W.off?W.off.year:W.year, off:!!W.off, kind, txt}); if(W.news.length>60) W.news.splice(0,W.news.length-60); }

function selectedTradePlayers(ids){ return [...ids].map(id=>PBYID[id]).filter(Boolean); }
function tradeGain(players, picks, mode, yr){
  return players.reduce((s,p)=>s+playerValue(p,mode,yr),0)
    +picks.reduce((s,k)=>s+pickValue(k,mode,TR.prot[pkKey(k)]||protOf(k)),0);
}
function tradeRatio(gain, partner, players, picks, mode, yr){
  const best=partner.players.reduce((top,p)=>!top||p.ovr>top.ovr?p:top,null);
  const need=pkgValue(partner.i,players,picks,yr,mode)*(players.includes(best)?1.3:1.05)+20;
  return need>0?gain/need:(gain>0?9:0);
}
function findTradeTargets(pos){
  if(rosterChangesPaused() || !tradeOpen().ok) return [];
  const yr=ctxYear(), me=myTeam();
  const outP=selectedTradePlayers(TR.mineP), outK=[...TR.mineK].map(pkFromKey);
  if((!outP.length && !outK.length) || outP.length!==TR.mineP.size || outP.some(frozen) ||
     checkTradeAssets(me.i,outP,outK,yr).length) return [];
  const matches=[];
  for(const team of TEAMS){
    if(team===me) continue;
    const mode=teamMode(team.i), gain=tradeGain(outP,outK,mode,yr);
    for(const p of team.players){
      if(!activeContract(p,yr) || frozen(p) || (pos && p.pos!==pos && !p.pos2?.includes(pos))) continue;
      if(tradeRatio(gain,team,[p],[],mode,yr)>=1 && !checkTrade(me.i,outP,team.i,[p],yr).length){
        matches.push({team,p});
      }
    }
  }
  return matches;
}
function evalTrade(){
  const yr=ctxYear(), me=myTeam(), pt=TEAMS[TR.partner], mode=teamMode(pt.i);
  const outP=selectedTradePlayers(TR.mineP), inP=selectedTradePlayers(TR.theirP);
  const outK=[...TR.mineK].map(pkFromKey), inK=[...TR.theirK].map(pkFromKey);
  const ratio=tradeRatio(tradeGain(outP,outK,mode,yr),pt,inP,inK,mode,yr);
  const assetIssues=[...checkTradeAssets(me.i,outP,outK,yr), ...checkTradeAssets(pt.i,inP,inK,yr)];
  if(outP.length!==TR.mineP.size || inP.length!==TR.theirP.size) assetIssues.push('交易球员已离队，请重新选择');
  if(!outP.length && !outK.length && !inP.length && !inK.length) assetIssues.push('还没选任何人');
  const labels=['你方','对方'];
  const issues=[...checkTrade(me.i,outP,pt.i,inP,yr,labels), ...assetIssues];
  const blocking=[...checkTrade(me.i,outP,pt.i,inP,yr,labels,true), ...assetIssues];
  const match=matchRule(payroll(me,yr)-tradeSal(outP,yr)+tradeSal(inP,yr), tradeSal(outP,yr), outP.length, yr);
  const std=ps=>ps.filter(p=>activeContract(p,yr) && p.contract[2]!=='tw').length;
  const delta=std(inP)-std(outP);
  return {ratio, issues, blocking, match, myPay:payroll(me,yr)-tradeSal(outP,yr)+tradeSal(inP,yr),
    ptPay:payroll(pt,yr)-tradeSal(inP,yr)+tradeSal(outP,yr), salOut:tradeSal(outP,yr), salIn:tradeSal(inP,yr),
    myCount:rosterCount(me,yr)+delta, ptCount:rosterCount(pt,yr)-delta, mode, outP, inP, outK, inK};
}
function doTrade(approval){
  if(rosterChangesPaused()) throw new Error('请在比赛或模拟结束后再交易');
  const special=approval?.force===true;
  if(special && (!cheatsEnabled() || !cheatBusy)) throw new Error('请从作弊台提交交易特批');
  const ev=evalTrade(), op=tradeOpen(), skipSalary=special && approval.salary===true;
  const issues=skipSalary?ev.blocking:ev.issues;
  if(!op.ok || issues.length || (!special && ev.ratio<1)) throw new Error(op.why || issues[0] || '对方不接受这份交易');
  const me=myTeam(), pt=TEAMS[TR.partner];
  const txt=execTrade(me.i,ev.outP,ev.outK,pt.i,ev.inP,ev.inK,TR.prot,skipSalary);
  if(G.season) G.season.inbox.push({d:G.season.day, t:`和${pt.cn}完成交易`, b:txt});
  TR.mineP.clear(); TR.theirP.clear(); TR.mineK.clear(); TR.theirK.clear(); TR.prot={};
  TRADE_FINDER.open=false;
  if(special) applyLife();
  else save();
  return txt;
}

const TRADE_COLS=[
  ['age','年龄',(p,yr)=>ageOf(p,yr),String],
  ['ovr','总评',p=>p.ovr,ovrTag],
  ['pot','潜力',p=>p.pot,String],
  ['sal','年薪',p=>p.contract?.[0],money],
  ['exp','到期',p=>p.contract?.[1],(year,p)=>year+({rk:' 新秀',tw:' 双向'}[p.contract[2]]||'')],
];
const TRADE_SORT={m:{field:'ovr',dir:-1},t:{field:'ovr',dir:-1},finder:{field:'ovr',dir:-1}};
const TRADE_FINDER={pos:'',open:false};
const TRADE_RESULT_LIMIT=12;
function tradeNumberHeaders(side){
  const {field,dir}=TRADE_SORT[side];
  return TRADE_COLS.map(([key,label])=>{
    const sorted=key===field;
    return `<th scope="col" class="n"${sorted?` aria-sort="${dir<0?'descending':'ascending'}"`:''}><button type="button" class="table-sort" data-trade-sort="${side}-${key}">${label}${sorted?` <span aria-hidden="true">${dir<0?'↓':'↑'}</span>`:''}</button></th>`;
  }).join('');
}
function tradeNumberCells(p,yr){
  return TRADE_COLS.map(([,,read,format])=>{
    const value=read(p,yr);
    return `<td class="n">${value==null?'—':format(value,p)}</td>`;
  }).join('');
}
function sortTradeRows(rows,side,yr,player=p=>p){
  const {field,dir}=TRADE_SORT[side], read=TRADE_COLS.find(([key])=>key===field)[2];
  return rows.slice().sort((a,b)=>{
    const x=read(player(a),yr), y=read(player(b),yr);
    if(x==null || y==null) return Number(x==null)-Number(y==null);
    return (x-y)*dir;
  });
}
function tradeFinderHTML(matches,yr){
  const hasAssets=TR.mineP.size>0||TR.mineK.size>0;
  const rows=sortTradeRows(matches,'finder',yr,r=>r.p).slice(0,TRADE_RESULT_LIMIT);
  return `<div class="card" id="trade-finder"><h3>交易搜索器</h3>
    <p class="hint">勾选你愿意送出的球员或选秀权，搜索能从联盟换回的一名球员。</p>
    <div class="ctrl trade-finder-actions"><label for="finder-pos">目标位置</label>
      <select id="finder-pos"><option value="">不限位置</option>${POS.map(pos=>`<option value="${pos}" ${pos===TRADE_FINDER.pos?'selected':''}>${POS_CN[pos]}</option>`).join('')}</select>
      <button type="button" id="finder-run" ${hasAssets?'':'disabled'}>搜索目标</button>
      ${hasAssets?`<span class="hint">已选 ${TR.mineP.size} 名球员、${TR.mineK.size} 个选秀权</span>`:''}
    </div>
    ${TRADE_FINDER.open && hasAssets?(!matches.length?`<p class="hint" role="status">当前筹码没有匹配目标。可以调整送出的筹码或目标位置。</p>`:
      `<p class="hint" role="status">找到 ${matches.length} 名球员${matches.length>rows.length?`，显示前 ${rows.length} 名`:''}</p>
      <div class="tw trade-finder-results"><table aria-label="匹配到的球员"><thead><tr><th scope="col">球员</th><th scope="col">方案</th><th scope="col">球队</th><th scope="col">位置</th>${tradeNumberHeaders('finder')}</tr></thead><tbody>
        ${rows.map(({team,p})=>`<tr><td class="cl" data-id="${p.id}">${esc(p.cn)}${legendBadge(p)}</td><td><button type="button" class="sm" data-trade-target="${p.id}" aria-label="查看${esc(p.cn)}的交易方案">查看方案</button></td><td>${esc(team.nick)}</td><td>${playerPositions(p)}</td>${tradeNumberCells(p,yr)}</tr>`).join('')}
      </tbody></table></div>`):''}
    </div>`;
}
function vTrade(v){
  if(rosterChangesPaused()){ v.innerHTML='<h1>交易</h1><div class="card">比赛或模拟结束后可以交易。</div>'; return; }
  const op=tradeOpen();
  if(!op.ok){ v.innerHTML=`<h1>交易</h1><div class="card"><p>${esc(op.why)}</p></div>`; return; }
  if(TR.partner==null || TR.partner===G.team) TR.partner=(G.team+1)%30;
  const yr=ctxYear(), me=myTeam(), pt=TEAMS[TR.partner];
  const ev=evalTrade(), empty=!TR.mineP.size&&!TR.theirP.size&&!TR.mineK.size&&!TR.theirK.size;
  const matches=TRADE_FINDER.open?findTradeTargets(TRADE_FINDER.pos):[];
  const verdict = ev.ratio>=1? ['会接受','var(--good)'] : ev.ratio>=.85? ['差一点','var(--warn)'] : ['差很远','var(--bad)'];
  const side=(t,setP,setK,key)=>`<div class="card tw"><h3>${logo(t,20)} ${esc(t.cn)} <span class="r">${t===pt?(ev.mode==='rebuild'?'重建中，看重年轻人和选秀权':'争冠中，看重即战力'):''} 工资 ${money(payroll(t,yr))}</span></h3><table aria-label="${t===me?'我方':'对方'}球员"><thead><tr><th scope="col"></th><th scope="col">球员</th>${tradeNumberHeaders(key)}</tr></thead><tbody>
    ${sortTradeRows(t.players,key,yr).map(p=>`<tr><td><input type="checkbox" data-${key}p="${p.id}" aria-label="选择${esc(p.cn)}" ${setP.has(p.id)?'checked':''} ${frozen(p)||!activeContract(p,yr)?'disabled':''}></td><td class="cl" data-id="${p.id}">${esc(p.cn)}${legendBadge(p)}${injTag(p)}${frzTag(p)}</td>${tradeNumberCells(p,yr)}</tr>`).join('')}
    </tbody></table><div style="margin-top:8px">${picksOwnedBy(t.i).map(pk=>`<label class="pill" style="background:var(--bg3);margin:2px;padding:3px 8px;cursor:pointer"><input type="checkbox" data-${key}k="${pkKey(pk)}" ${setK.has(pkKey(pk))?'checked':''}> ${esc(pickLabel(pk))}${key==='m'&&setK.has(pkKey(pk))&&pk.round===1&&pk.orig===G.team&&!protOf(pk)&&!(W.off&&W.off.lottery&&pk.year===W.off.lottery.year)?` <select data-prot="${pkKey(pk)}" onclick="event.stopPropagation()">${PROT_OPTS.map(n=>`<option value="${n}" ${(TR.prot[pkKey(pk)]||0)===n?'selected':''}>${n?'前 '+n+' 保护':'不保护'}</option>`).join('')}</select>`:''}</label>`).join('')||'<span class="hint">没有选秀权</span>'}</div></div>`;
  v.innerHTML=`<h1>交易</h1><div class="sub">${W.off?'休赛期可以随时交易':'交易截止日：'+(G.season.year+1)+' 年 2 月 5 日'} · 勾选球员和选秀权，点数值表头排序</div>
   <div class="card"><div class="row" style="align-items:center"><span>交易对象</span><select id="tp">${TEAMS.filter(t=>t.i!==G.team).map(t=>`<option value="${t.i}" ${t.i===TR.partner?'selected':''}>${esc(t.cn)}</option>`).join('')}</select>
     ${empty?'':`<span style="margin-left:auto">对方的态度：<b style="color:${verdict[1]}">${verdict[0]}</b></span>`}</div>
     ${empty?`<p class="hint" style="margin-top:8px">在下面勾选你送出的和想要的球员、选秀权，这里会显示对方的态度和薪资规则。</p>`:`<div class="fitbar" style="margin-top:8px">${bar(Math.min(ev.ratio,1.3),1.3,verdict[1].includes('good')?'var(--bar-good)':verdict[1].includes('warn')?'var(--bar-warn)':'var(--bar-bad)')}</div>
     <p class="hint" style="margin-top:6px">送出薪资 ${money(ev.salOut)} · 换来薪资 ${money(ev.salIn)} · 交易后你的工资 ${money(ev.myPay)}（工资帽 ${money(CFG(yr).cap)}，第一土豪线 ${money(CFG(yr).apron1)}，第二土豪线 ${money(CFG(yr).apron2)}）</p>
     <p class="hint">${esc(matchTxt(ev.match))}</p>
     ${ev.issues.map(s=>`<div class="bad">${esc(s)}</div>`).join('')}`}
     <div class="ctrl"><button class="pri" id="tgo" ${ev.issues.length||ev.ratio<1?'disabled':''}>提出交易</button>
     ${cheatsEnabled()?`<button id="cheat-trade" ${empty||ev.blocking.length||!cheatActionAvailable()?'disabled':''}>特批本笔交易</button>`:''}
     <button id="tclr">清空</button></div></div>
   ${tradeFinderHTML(matches,yr)}
   <div class="row"><div class="col" style="min-width:320px">${side(me,TR.mineP,TR.mineK,'m')}</div><div class="col" style="min-width:320px">${side(pt,TR.theirP,TR.theirK,'t')}</div></div>`;
  const q=s=>v.querySelector(s);
  q('#tp').onchange=e=>{ TR.partner=+e.target.value; TR.theirP.clear(); TR.theirK.clear(); vTrade(v); };
  q('#tclr').onclick=()=>{
    TR.mineP.clear(); TR.theirP.clear(); TR.mineK.clear(); TR.theirK.clear(); TR.prot={};
    TRADE_FINDER.open=false;
    vTrade(v);
  };
  q('#tgo').onclick=()=>{ try{ doTrade(); toast('交易完成'); }catch(e){ toast(e.message); } render(); };
  q('#finder-pos').onchange=e=>{
    TRADE_FINDER.pos=e.target.value;
    if(TRADE_FINDER.open){ vTrade(v); q('#finder-pos').focus({preventScroll:true}); }
  };
  q('#finder-run').onclick=()=>{
    TRADE_FINDER.open=true;
    vTrade(v);
    q('#finder-run').focus({preventScroll:true});
  };
  v.querySelectorAll('[data-trade-target]').forEach(button=>button.onclick=()=>{
    const {team,p}=matches.find(x=>x.p.id===+button.dataset.tradeTarget);
    TR.partner=team.i; TR.theirP=new Set([p.id]); TR.theirK.clear();
    TRADE_FINDER.open=false;
    vTrade(v);
    v.scrollTop=0;
    q('#tgo').focus({preventScroll:true});
  });
  v.querySelectorAll('[data-trade-sort]').forEach(button=>button.onclick=()=>{
    const key=button.dataset.tradeSort, [side,field]=key.split('-');
    const previous=TRADE_SORT[side], wrap=button.closest('.tw'), offset=wrap.scrollLeft;
    const keyboard=button.matches(':focus-visible');
    TRADE_SORT[side]={field,dir:previous.field===field?-previous.dir:-1};
    vTrade(v);
    const next=q(`[data-trade-sort="${key}"]`);
    next.closest('.tw').scrollLeft=offset;
    if(keyboard) next.focus({preventScroll:true});
  });
  if(q('#cheat-trade')) q('#cheat-trade').onclick=showCheatTrade;
  const bind=(sel,set,num)=>v.querySelectorAll(sel).forEach(cb=>cb.onchange=()=>{ const k=num?+cb.getAttribute(sel.slice(1,-1)):cb.getAttribute(sel.slice(1,-1)); if(cb.checked) set.add(k); else set.delete(k); vTrade(v); });
  v.querySelectorAll('[data-prot]').forEach(sl=>sl.onchange=()=>{ const n=+sl.value; if(n) TR.prot[sl.dataset.prot]=n; else delete TR.prot[sl.dataset.prot]; vTrade(v); });
  bind('[data-mp]',TR.mineP,true); bind('[data-tp]',TR.theirP,true); bind('[data-mk]',TR.mineK,false); bind('[data-tk]',TR.theirK,false);
  v.querySelectorAll('td[data-id]').forEach(el=>el.onclick=()=>showPlayer(PBYID[el.dataset.id]));
}

// ---------- 自由球员（赛季中、休赛期自由市场以外） ----------
function inSeasonAsk(p){ const yr=ctxYear(); return Math.max(CFG(yr).minSal, Math.round(marketSalary(p.ovr,ageOf(p,yr),yr)*(W.off?1:.6))); }
function vFA(v){
  if(rosterChangesPaused()){ v.innerHTML='<h1>自由球员</h1><div class="card">比赛或模拟结束后可以签约或调整阵容。</div>'; return; }
  const yr=ctxYear(), C=CFG(yr), t=myTeam(), pay=payroll(t,yr);
  if(W.off && W.off.step===4){ v.innerHTML=`<h1>自由球员</h1><div class="card"><p>自由市场正在进行，请在「休赛期」页报价。</p></div>`; return; }
  const fas=FREE.slice().sort((a,b)=>b.ovr-a.ovr).slice(0,80);
  const mineStd=t.players.filter(p=>p.contract&&p.contract[2]!=='tw');
  const minRoster = W.off? 0 : 13;
  v.innerHTML=`<h1>自由球员</h1><div class="sub">${W.off?'休赛期':'赛季中'}签约：${W.off?'按要价':'要价打六折'}，合同 1 年。工资 ${money(pay)} · 工资帽剩 ${money(Math.max(0,C.cap-pay))} · 中产 ${(W.mle[yr]||{})[G.team]?'已用':pay<C.apron1?money(C.mleNT):pay<C.apron2?money(C.mleTP):'不可用'} · 正式合同 ${rosterCount(t,yr)} / 15</div>
   <div class="card tw"><h3>市场上的球员</h3><table><thead><tr><th>球员</th><th>位置</th><th class="n">年龄</th><th class="n">总评</th><th class="n">潜力</th><th class="n">要价</th><th></th></tr></thead><tbody>
    ${fas.map(p=>{ const a=inSeasonAsk(p), r=p.sheet?{ok:false,why:'报价单处理中，请到休赛期处理'}:p.rfa?{ok:false,why:'受限球员，请到休赛期报价'}:offerRule(G.team,a,yr); return `<tr><td class="cl" data-id="${p.id}"><b>${esc(p.cn)}</b>${legendBadge(p)}</td><td>${POS_CN[p.pos]}</td><td class="n">${ageOf(p,yr)}</td><td class="n">${ovrTag(p.ovr)}</td><td class="n">${p.pot}</td><td class="n">${money(a)}</td>
      <td>${r.ok?`<button class="sm pri" data-sign="${p.id}">签下（${r.kind}）</button>`:`<span class="hint">${esc(r.why)}</span>`}</td></tr>`; }).join('')}</tbody></table></div>
   ${(()=>{ const tw=t.players.filter(p=>p.contract&&p.contract[2]==='tw'); return tw.length?`<div class="card tw"><h3>双向合同 <span class="r">${tw.length} / 3，不占 15 人名额，不算工资</span></h3><table><tbody>${tw.map(p=>`<tr><td>${esc(p.cn)}${legendBadge(p)} <span class="hint">${POS_CN[p.pos]} · ${ageOf(p,yr)} 岁</span></td><td class="n">${ovrTag(p.ovr)}</td><td class="n">潜力 ${p.pot}</td><td class="n">至 ${p.contract[1]}</td><td>${rosterCount(t,yr)<15?`<button class="sm" data-tw="${p.id}">转正式合同（底薪 × 2 年）</button>`:'<span class="hint">正式合同已满 15 人</span>'}</td></tr>`).join('')}</tbody></table></div>`:''; })()}
   <div class="card tw"><h3>裁人 <span class="r">剩余合同照付，算进工资（死钱）</span></h3><table><tbody>
    ${mineStd.sort((a,b)=>a.ovr-b.ovr).map(p=>`<tr><td>${esc(p.cn)}${legendBadge(p)}</td><td class="n">${ovrTag(p.ovr)}</td><td class="n">${p.contract?money(p.contract[0])+' 至 '+p.contract[1]:''}</td><td>${mineStd.length>minRoster?`<button class="sm" data-waive="${p.id}">裁掉</button>`:''}</td></tr>`).join('')}</tbody></table>
    ${(W.dead[G.team]||[]).filter(d=>d.exp>yr).length?`<p class="hint" style="margin-top:6px">死钱：${W.dead[G.team].filter(d=>d.exp>yr).map(d=>`${esc(d.cn)} ${money(d.amt)} 至 ${d.exp}`).join('；')}</p>`:''}</div>`;
  v.querySelectorAll('[data-sign]').forEach(b=>b.onclick=()=>{ const p=PBYID[b.dataset.sign]; const r=signFA(p,G.team,inSeasonAsk(p),1,yr); if(r.ok){ reindex(); fixRot(); save(); toast(`签下 ${p.cn}`); if(G.season) applyPlayerState(); } else toast(r.why); render(); });
  v.querySelectorAll('[data-tw]').forEach(b=>b.onclick=()=>{ const p=PBYID[b.dataset.tw]; p.contract=[CFG(yr).minSal, yr+2, 'std']; reindex(); fixRot(); save(); toast(`${p.cn} 转为正式合同`); render(); });
  v.querySelectorAll('[data-waive]').forEach(b=>b.onclick=()=>{ const p=PBYID[b.dataset.waive]; waive(p,G.team,yr); reindex(); fixRot(); save(); toast(`裁掉了 ${p.cn}`); render(); });
  v.querySelectorAll('td[data-id]').forEach(el=>el.onclick=()=>showPlayer(PBYID[el.dataset.id]));
}
