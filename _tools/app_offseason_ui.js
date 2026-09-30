// ================= 休赛期界面 =================
Object.assign(ICON,{
  off:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="8" r="3"/><path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4"/></svg>',
  trade:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 5h10l-3-3M14 11H4l3 3"/></svg>',
  fa:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="6.5" cy="5" r="2.5"/><path d="M2 14c.4-3 2.2-4.5 4.5-4.5 1.3 0 2.4.4 3.2 1.2"/><path d="M12.5 9v5M10 11.5h5"/></svg>',
});
function deltaTag(d){ return d>0?`<b class="good">+${d}</b>`: d<0?`<b class="bad">${d}</b>`:'<span class="hint">0</span>'; }
function rangeTxt(r){ return `${clamp(r[0],30,99)}–${clamp(r[1],30,99)}`; }

function vOff(v){
  const O=W.off; if(!O){ G.view='home'; return render(); }
  const steps=OFF_STEPS.map((n,i)=>`<span class="pill" style="background:${i===O.step?'var(--acc)':i<O.step?'#243142':'#1a212b'};color:${i===O.step?'#1a0f00':i<O.step?'var(--txt)':'var(--dim)'};margin-right:4px;padding:3px 9px">${i+1}. ${n}</span>`).join('');
  const C=CFG(O.year), t=myTeam(), pay=payroll(t,O.year);
  let body='', next='下一步';
  if(O.step===0){ const R=O.report;
    body=`<div class="row"><div class="col card tw" style="min-width:300px"><h3>我的球员：成长和衰退</h3><table><thead><tr><th>球员</th><th class="n">年龄</th><th class="n">去年</th><th class="n">今年</th><th class="n">变化</th></tr></thead><tbody>
      ${R.mine.sort((a,b)=>(b.now-b.old)-(a.now-a.old)).map(r=>`<tr class="cl" data-id="${r.id}"><td>${esc(r.cn)}${R.retired.some(x=>x.id===r.id)?' <span class="pill" style="background:#333">退役</span>':''}</td><td class="n">${r.age}</td><td class="n">${r.old}</td><td class="n">${ovrTag(r.now)}</td><td class="n">${deltaTag(r.now-r.old)}</td></tr>`).join('')}</tbody></table></div>
      <div class="col" style="min-width:260px"><div class="card tw"><h3>联盟进步最大</h3><table><tbody>${R.risers.map(r=>`<tr><td>${esc(r.cn)}</td><td>${r.team>=0?logo(TEAMS[r.team],16):'<span class="hint">自由</span>'}</td><td class="n">${r.old} → ${r.now}</td><td class="n">${deltaTag(r.now-r.old)}</td></tr>`).join('')}</tbody></table></div>
      <div class="card tw"><h3>下滑最多</h3><table><tbody>${R.fallers.map(r=>`<tr><td>${esc(r.cn)}</td><td>${r.team>=0?logo(TEAMS[r.team],16):'<span class="hint">自由</span>'}</td><td class="n">${r.old} → ${r.now}</td><td class="n">${deltaTag(r.now-r.old)}</td></tr>`).join('')}</tbody></table></div>
      <div class="card"><h3>退役 <span class="r">${R.retired.length} 人</span></h3>${R.retired.slice(0,12).map(r=>`<div>${esc(r.cn)} <span class="hint">${r.age} 岁 · 总评 ${r.old}</span></div>`).join('')}${R.retired.length>12?`<div class="hint">…还有 ${R.retired.length-12} 人</div>`:''}</div></div></div>`;
    next='进行选秀抽签';
  }
  else if(O.step===1){ const L=O.lottery, mine=L.order.filter(x=>x.owner===G.team);
    body=`<div class="row"><div class="col card tw" style="min-width:300px"><h3>乐透抽签结果</h3><table><thead><tr><th>球队</th><th class="n">抽签前</th><th class="n">实际顺位</th></tr></thead><tbody>
      ${L.lotto.map(x=>`<tr style="${x.i===G.team?'background:#2a1c10':''}"><td>${logo(TEAMS[x.i],16)} ${esc(TEAMS[x.i].cn)}</td><td class="n">${x.seedPos}</td><td class="n">${x.got<x.seedPos?`<b class="good">${x.got}</b>`:x.got>x.seedPos?`<span class="bad">${x.got}</span>`:x.got}</td></tr>`).join('')}</tbody></table></div>
      <div class="col card" style="min-width:260px"><h3>我的签位</h3>${mine.length?mine.map(x=>`<div>第 ${x.no} 顺位（${x.round===1?'首轮':'次轮'}${x.orig!==G.team?'，来自'+TEAMS[x.orig].nick:''}）</div>`).join(''):'<div class="hint">今年没有签位</div>'}
      <p class="hint" style="margin-top:10px">选秀大会上，轮到你的签位时会停下来让你挑人。</p></div></div>`;
    next='开始选秀大会';
  }
  else if(O.step===2){ const D=O.draft, cur=D.order[D.idx], myTurn=cur && cur.owner===G.team && !D.done;
    refreshScout(); const avail=W.draftClass.filter(p=>!p.drafted).sort((a,b)=>perceivedBy(b,G.team)-perceivedBy(a,G.team));
    body=`<div class="card"><h3>${D.done?'选秀结束':myTurn?`轮到你了：第 ${cur.no} 顺位`:`第 ${cur.no} 顺位：${esc(TEAMS[cur.owner].cn)}`}</h3>
      ${myTurn?'<p class="hint">在下面的名单里挑一个人。总评和潜力是球探给的区间，不一定准。</p>':''}
      <div class="ctrl" style="margin-top:4px">${myTurn?'<button id="autopick">让系统替我选</button>':''}${!D.done&&!myTurn?'<button id="tomypick">选到我的下一个签位</button>':''}</div></div>
     <div class="row"><div class="col card tw" style="min-width:320px;flex:1.6"><h3>新秀 <span class="r">${avail.length} 人可选</span></h3><table><thead><tr><th>新秀</th><th>位置</th><th class="n">年龄</th><th class="n">身高</th><th class="n">总评</th><th class="n">潜力</th><th class="n">三分</th><th class="n">终结</th><th class="n">外防</th><th class="n">内防</th><th>国籍</th><th></th></tr></thead><tbody>
      ${avail.map(p=>`<tr><td class="cl" data-id="${p.id}"><b>${esc(p.cn)}</b></td><td>${p.pos}</td><td class="n">${p.age}</td><td class="n">${p.ht}</td><td class="n">${rangeTxt(p.scout.o)}</td><td class="n">${rangeTxt(p.scout.p)}</td>
        ${['three','finish','perD','intD'].map(k=>{ const r=srand(p.id*7+3); KEYS.slice(0,KEYS.indexOf(k)).forEach(()=>r()); const hw=SCOUT_HW[((W.scoutFocus||[]).includes(p.id)?5:scoutLevel(G.team))-1][0]; const x=clamp(Math.round(p.a[k]+(r()*2-1)*hw*1.5),20,99); return `<td class="n" style="color:${attrCol(x)}">${x}</td>`; }).join('')}<td class="hint">${esc(p.nat)}</td><td>${myTurn?`<button class="sm pri" data-pick="${p.id}">选他</button>`:''}</td></tr>`).join('')}</tbody></table></div>
      <div class="col card tw" style="min-width:240px"><h3>已选</h3><table><tbody>${D.log.slice().reverse().map(x=>{ const p=PBYID[x.pid]; return `<tr style="${x.team===G.team?'background:#2a1c10':''}"><td class="n">${x.no}</td><td>${logo(TEAMS[x.team],16)}</td><td class="cl" data-id="${x.pid}">${esc(p?p.cn:'')}</td><td class="hint">${p?p.pos:''}</td></tr>`; }).join('')||'<tr><td class="hint">还没开始</td></tr>'}</tbody></table></div></div>`;
    next = D.done? '进入续约' : '跳过剩下的选秀（系统替我选）';
  }
  else if(O.step===3){ const ex=expiringOf(G.team);
    body=`<div class="card"><h3>下季工资 <span class="r">${O.year}-${String((O.year+1)%100).padStart(2,'0')} 赛季</span></h3>
      <p>已签下季合同的工资总额 <b>${money(pay)}</b> · 工资帽 ${money(C.cap)} · 奢侈税线 ${money(C.tax)} · 第二土豪线 ${money(C.apron2)}</p><p class="hint">续约自己的球员不受工资帽限制。没处理的球员，点「下一步」后会进入自由市场。</p></div>
     <div class="card tw"><h3>合同到期的球员 <span class="r">${ex.length} 人</span></h3>${ex.length?`<table><thead><tr><th>球员</th><th class="n">年龄</th><th class="n">总评</th><th class="n">潜力</th><th class="n">上季场均</th><th class="n">要价</th><th>心情</th><th class="n">士气</th><th></th></tr></thead><tbody>
      ${ex.map(p=>{ const a=O.asks[p.id]||(O.asks[p.id]=makeAsk(p,G.team)); const h=(p.hist||[]).filter(x=>!x[2]).slice(-1)[0];
        return `<tr><td class="cl" data-id="${p.id}"><b>${esc(p.cn)}</b> <span class="hint">${p.pos}</span></td><td class="n">${ageOf(p,O.year)}</td><td class="n">${ovrTag(p.ovr)}</td><td class="n">${p.pot}</td><td class="n">${h?`${h[5]} 分 ${h[4]} 分钟`:'-'}</td>
          <td class="n"><b>${money(a.amt)}</b> × ${a.yrs} 年</td><td class="hint">${a.refuse?'<span class="bad">不愿续约</span>':a.mood<1?'满意':a.mood<1.12?'一般':'不太满意'}</td><td class="n">${morTag(p)}</td>
          <td>${expType(p)==='option'?`<span class="pill" style="background:#1d3a5c">球队选项</span> 下季 ${money(Math.round(p.contract[0]*1.05))} <button class="sm pri" data-opt="${p.id}">执行</button> <button class="sm" data-rsx="${p.id}">放弃</button>`
            : `${expType(p)==='rfa'?`<span class="pill" style="background:#3a2a10">可发资格报价</span> `:''}${a.refuse&&expType(p)!=='rfa'?'<span class="hint">他想离开，不接受续约</span>':`<button class="sm pri" data-rs="${p.id}">接受要价</button> <button class="sm" data-rsd="${p.id}">压价 10%</button>`}${expType(p)==='rfa'?` <button class="sm" data-qo="${p.id}">发资格报价 ${money(qoAmt(p))}</button>`:''} <button class="sm" data-rsx="${p.id}">放弃</button>`}</td></tr>`; }).join('')}</tbody></table>
      <p class="hint" style="margin-top:8px">士气低于 25 或者公开要求过交易的球员不肯续约，受限制的除外（发资格报价，他没法直接走）。球队选项：执行就按原合同再留一年（年薪涨 5%）。资格报价：他进自由市场，别队给的报价你有权匹配；没人要的话按资格报价回来签 1 年。没处理的：选项按总评 66 / 潜力 78 以上执行，可发资格报价的一律发，其余放走。</p>`:'<div class="hint">没有合同到期的球员</div>'}</div>`;
    next='进入自由市场';
  }
  else if(O.step===4){
    const last=O.faLog[O.faLog.length-1];
    const fas=FREE.slice().sort((a,b)=>b.ovr-a.ovr).slice(0,120);
    const off=O.userOffers||{};
    const commit=Object.values(off).reduce((s,o)=>s+o.amt,0);
    body=`<div class="card"><h3>自由市场 第 ${O.faRound} / 5 轮</h3>
      <p>下季工资总额 <b>${money(pay)}</b>${commit?`，本轮报价合计 ${money(commit)}`:''} · 工资帽 ${money(C.cap)}，剩 <b>${money(Math.max(0,C.cap-pay))}</b> · 中产特例 ${(W.mle[O.year]||{})[G.team]?'已用':pay<C.apron1?money(C.mleNT):pay<C.apron2?money(C.mleTP)+'（纳税）':'不可用'} · 底薪 ${money(C.minSal)} · 正式合同 ${rosterCount(t,O.year)} / 15 人</p>
      <p class="hint">标「受限」的是受限制自由球员，你签下他之前，原球队有权匹配。给想要的人填好年薪和年限，点「报价」。所有球队的报价在本轮结束时一起揭晓，球员挑出价最高、球队最强、角色最重要的那家。没签的人要价每轮降 7%。</p></div>
     ${(O.sheets||[]).length?`<div class="card" style="border-color:var(--acc)"><h3>报价单：你的受限制自由球员被别队看上了</h3>${O.sheets.map(sh=>{ const p=PBYID[sh.pid]; return `<div style="padding:6px 0">${esc(p.cn)} ${ovrTag(p.ovr)} 接受了 ${logo(TEAMS[sh.ti],16)} ${esc(TEAMS[sh.ti].cn)} 的报价：<b>${money(sh.amt)} × ${sh.yrs} 年</b>
        <button class="sm pri" data-sheet="${sh.pid}" data-m="1">匹配，留下他</button> <button class="sm" data-sheet="${sh.pid}" data-m="0">不匹配，放他走</button></div>`; }).join('')}<p class="hint">匹配不受工资帽限制。不表态直接进下一轮，算不匹配。</p></div>`:''}
     ${last?`<div class="card tw"><h3>上一轮结果</h3>${last.signed.filter(s=>s.user).map(s=>`<div class="good">签下 ${esc(PBYID[s.pid].cn)}：${money(s.amt)} × ${s.yrs} 年</div>`).join('')}${last.signed.filter(s=>s.matched===G.team).map(s=>`<div class="bad">${esc(TEAMS[s.ti].nick)}匹配了你给 ${esc(PBYID[s.pid].cn)} 的报价单</div>`).join('')}${last.rejected.map(id=>`<div class="bad">${esc(PBYID[id]?PBYID[id].cn:'')} 没接受你的报价</div>`).join('')}
       <table style="margin-top:6px"><tbody>${last.signed.filter(s=>!s.user).sort((a,b)=>PBYID[b.pid].ovr-PBYID[a.pid].ovr).slice(0,10).map(s=>`<tr><td>${esc(PBYID[s.pid].cn)} ${ovrTag(PBYID[s.pid].ovr)}</td><td>→ ${logo(TEAMS[s.ti],16)} ${esc(TEAMS[s.ti].nick)}</td><td class="n">${money(s.amt)} × ${s.yrs}</td></tr>`).join('')}</tbody></table></div>`:''}
     <div class="card tw"><h3>自由球员 <span class="r">前 120 人</span></h3><table><thead><tr><th>球员</th><th>位置</th><th class="n">年龄</th><th class="n">总评</th><th class="n">潜力</th><th class="n">要价</th><th>我的报价</th></tr></thead><tbody>
      ${fas.filter(p=>!p.sheet).map(p=>{ const a=faAsk(p), o=off[p.id]; return `<tr style="${o?'background:#2a1c10':''}"><td class="cl" data-id="${p.id}"><b>${esc(p.cn)}</b>${p.rfa?` <span class="pill" style="background:#3a2a10">受限 · ${esc(TEAMS[p.rfa.team].nick)}</span>`:''}</td><td>${p.pos}</td><td class="n">${ageOf(p,O.year)}</td><td class="n">${ovrTag(p.ovr)}</td><td class="n">${p.pot}</td><td class="n">${money(a.ask)} × ${a.yrs}</td>
        <td>${o?`${money(o.amt)} × ${o.yrs} 年 <button class="sm" data-unoffer="${p.id}">撤回</button>`:`<input type="number" value="${a.ask}" min="${C.minSal}" step="10" data-amt="${p.id}" style="width:74px"> 万 <select data-yrs="${p.id}">${[1,2,3,4].map(y=>`<option ${y===a.yrs?'selected':''}>${y}</option>`).join('')}</select> 年 <button class="sm" data-offer="${p.id}">报价</button>`}</td></tr>`; }).join('')}</tbody></table></div>`;
    next = O.faRound<5? `结束第 ${O.faRound} 轮` : '结束自由市场';
  }
  else if(O.step===5){
    const std=t.players.filter(p=>p.contract&&p.contract[2]!=='tw');
    body=`<div class="card"><h3>训练营</h3><p>AI 球队已经把阵容补到 14 人以上，超过 15 人的裁掉了。${(O.campLog||[]).length?'你的球队：'+O.campLog.map(esc).join('，')+'。':''}</p>
      <p>你的阵容：正式合同 <b>${std.length}</b> 人，下季工资 <b>${money(pay)}</b>${pay>C.tax?' <span class="warn">（超过奢侈税线）</span>':''}。</p>
      <p class="hint">开始新赛季前，还可以去交易页、自由球员页调整阵容。轮换会按新阵容自动重排，开赛后再去轮换页微调。</p></div>`;
    next=`开始 ${O.year}-${String((O.year+1)%100).padStart(2,'0')} 赛季`;
  }
  v.innerHTML=`<h1>休赛期</h1><div class="sub">${steps}</div>${offersHTML()}${body}<div style="text-align:right;margin-top:6px"><button class="pri" id="offnext" style="padding:9px 24px">${next}</button></div>${newsHTML(10)}`;
  bindOffers(v);
  const q=s=>v.querySelector(s);
  q('#offnext').onclick=()=>{ offNext(); render(); };
  v.querySelectorAll('[data-id]').forEach(el=>el.onclick=()=>showPlayer(PBYID[el.dataset.id]));
  if(q('#autopick')) q('#autopick').onclick=()=>{ const D=O.draft, pk=D.order[D.idx]; draftPlayer(pk, aiDraftPick(G.team)); D.idx++; draftAdvance(true); save(); render(); };
  if(q('#tomypick')) q('#tomypick').onclick=()=>{ draftAdvance(true); save(); render(); };
  v.querySelectorAll('[data-pick]').forEach(b=>b.onclick=()=>{ const D=O.draft, pk=D.order[D.idx]; draftPlayer(pk, PBYID[b.dataset.pick]); D.idx++; draftAdvance(true); save(); render(); });
  v.querySelectorAll('[data-rs]').forEach(b=>b.onclick=()=>{ const p=PBYID[b.dataset.rs], a=O.asks[p.id]; p.contract=[a.amt, O.year+a.yrs, 'std']; save(); render(); });
  v.querySelectorAll('[data-rsd]').forEach(b=>b.onclick=()=>{ const p=PBYID[b.dataset.rsd], a=O.asks[p.id]; const pAccept = a.mood<1? .8 : a.mood<1.12? .5 : .25;
    if(rnd01()<pAccept){ p.contract=[Math.round(a.amt*.9), O.year+a.yrs, 'std']; toast(`${p.cn} 同意了：${money(Math.round(a.amt*.9))} × ${a.yrs} 年`); }
    else { releaseToFA(p,G.team,a); toast(`${p.cn} 拒绝压价，进入自由市场`); }
    save(); render(); });
  v.querySelectorAll('[data-opt]').forEach(b=>b.onclick=()=>{ exerciseOption(PBYID[b.dataset.opt]); save(); render(); });
  v.querySelectorAll('[data-qo]').forEach(b=>b.onclick=()=>{ const p=PBYID[b.dataset.qo]; giveQO(p,G.team,O.asks[p.id]); toast(`向 ${p.cn} 发出资格报价`); save(); render(); });
  v.querySelectorAll('[data-sheet]').forEach(b=>b.onclick=()=>{ const sh=(O.sheets||[]).find(x=>x.pid==b.dataset.sheet); if(sh) decideSheet(sh, b.dataset.m==='1'); save(); render(); });
  v.querySelectorAll('[data-rsx]').forEach(b=>b.onclick=()=>{ const p=PBYID[b.dataset.rsx]; releaseToFA(p,G.team,O.asks[p.id]); save(); render(); });
  v.querySelectorAll('[data-offer]').forEach(b=>b.onclick=()=>{ const id=b.dataset.offer; const amt=Math.round(+v.querySelector(`[data-amt="${id}"]`).value||0), yrs=+v.querySelector(`[data-yrs="${id}"]`).value;
    const commit=Object.values(O.userOffers||{}).reduce((s,o)=>s+o.amt,0);
    const r=offerRule(G.team, amt, O.year); if(!r.ok){ toast(r.why); return; }
    O.userOffers=O.userOffers||{}; O.userOffers[id]={amt,yrs}; save(); render(); if(commit+amt+payroll(myTeam(),O.year)>CFG(O.year).cap && amt>CFG(O.year).minSal) toast('提醒：几份报价如果同时被接受，可能超出空间，超出的那份会作废'); });
  v.querySelectorAll('[data-unoffer]').forEach(b=>b.onclick=()=>{ delete O.userOffers[b.dataset.unoffer]; save(); render(); });
}
function toast(msg){ let el=document.getElementById('toast'); if(!el){ el=document.createElement('div'); el.id='toast'; el.style.cssText='position:fixed;left:50%;bottom:28px;transform:translateX(-50%);background:#243142;border:1px solid var(--line);color:var(--txt);padding:9px 16px;border-radius:8px;z-index:80;font-size:13px;max-width:90vw'; document.body.appendChild(el); }
  el.textContent=msg; el.style.display='block'; clearTimeout(el._t); el._t=setTimeout(()=>el.style.display='none',2600); }
