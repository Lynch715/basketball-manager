// ================= 按存档启用的作弊台 =================
let cheatBusy=false;
const CHEAT_BUDGET_MAX=1000000;

function cheatActionAvailable(){
  return G.team!=null && !!G.season && !LIVE && !BUSY && !cheatBusy;
}
function setCheatPreference(patch){
  if(!cheatActionAvailable()) throw new Error('请在比赛或模拟结束后再操作');
  const cheats={...G.cheats,...patch};
  replaceSaveKeys({...currentSaveKeys(),[SAVE_KEY]:JSON.stringify({...gameSaveData(),cheats})});
  G.cheats=cheats;
}
function readCheatBackup(snap){ return validSaveSnapshot(snap)?snap:null; }
async function runCheatEdit(edit,validate){
  if(!cheatsEnabled() || !cheatActionAvailable()) throw new Error('请开启作弊台，并在比赛或模拟结束后再操作');
  const before=snapshot(currentSaveKeys());
  const saved=SAVE_KEYS.map(k=>localStorage.getItem(k));
  const view=G.view;
  let newSlot=null, editing=false;
  cheatBusy=true;
  try{
    let id=G.cheats.backup;
    if(!id || !readCheatBackup(await slotGet(id))){
      id='cheat-'+(globalThis.crypto?.randomUUID?.() || Date.now()+'-'+Math.random().toString(36).slice(2));
      newSlot=id;
      await slotPut(id,before);
      const backup=readCheatBackup(await slotGet(id));
      if(!backup || SAVE_KEYS.some(key=>backup.keys[key]!==before.keys[key])){
        throw new Error('无法验证作弊前备份');
      }
    }
    const current=currentSaveKeys();
    if(G.view!==view || LIVE || BUSY ||
       SAVE_KEYS.some((key,i)=>current[key]!==before.keys[key] || localStorage.getItem(key)!==saved[i])){
      throw new Error('进度已经变化，请重新操作');
    }
    validate?.();
    editing=true;
    edit();
    G.cheats.backup=id;
    replaceSaveKeys(currentSaveKeys());
  }catch(error){
    if(newSlot) await slotDel(newSlot);
    if(editing){
      // 重新读入提交前的自动存档，避免留下只改了一半的内存状态。
      alert('修改未能保存，正在重新读取原进度。');
      location.reload();
    }
    throw error;
  }finally{ cheatBusy=false; }
}
async function performCheatEdit(button,edit,success,validate){
  if(button.disabled) return;
  button.disabled=true;
  try{
    await runCheatEdit(edit,validate);
    closeModal();
    render();
    toast(success);
  }catch(error){
    toast(error.name==='QuotaExceededError'?'浏览器存储空间不足，本次修改未应用':error.message || '无法保存修改或备份');
  }
  finally{ button.disabled=false; }
}
function bindCheatPreference(button,patch){
  button.onclick=()=>{
    try{ setCheatPreference(patch); render(); }
    catch(error){ toast(error.message || '无法保存作弊台设置'); }
  };
}
function cheatNumber(input){
  return input.checkValidity() ? input.valueAsNumber : NaN;
}
function cheatNumberField(label,key,value,min,max){
  return `<label>${label}<input type="number" name="${key}" min="${min}" max="${max}" value="${value}" inputmode="numeric" required></label>`;
}
function cheatAttributeFields(attributes,min){
  return ATTR_GROUPS.map(([label,keys])=>`<h2>${label}</h2><div class="cheat-fields">${keys.map(k=>
    cheatNumberField(ATTR_CN[k],k,attributes[k],Math.min(attributes[k],min),99)).join('')}</div>`).join('');
}

function customRookiesPanel(available){
  const year=customDraftYear(), pending=W.off && year>W.off.year;
  const list=customRookiesFor(year);
  return `<section class="card">
    <h3>自定义新秀 <span class="r">${year} 年选秀</span></h3>
    <p class="hint">${pending?'本届选秀已开始。新建球员将在下赛季进入球探名单。':'加入本届新秀名单，所有球队都可按正常顺序挑选。'}</p>
    ${list.length?`<div class="cheat-actions">${list.map(p=>`<div class="cheat-rookie-item">
      <span><b>${esc(p.cn)}</b> <span class="hint">${p.age} 岁 · ${POS_CN[p.pos]} · 总评 ${p.ovr} · 潜力 ${p.pot}</span></span>
      <button class="sm" data-custom-rookie="${p.id}" ${available?'':'disabled'}>编辑新秀</button>
    </div>`).join('')}</div>`:''}
    <div class="ctrl"><button id="create-custom-rookie" ${available?'':'disabled'}>创建新秀</button></div>
  </section>`;
}

function legendFeatured(pack){
  return pack.featured.map(id=>pack.players.find(p=>p.id===id)).map(p=>p.cn||p.en);
}

function legendDraftPanel(available){
  const year=customDraftYear(), added=W.legendDraftPacks??{};
  const occupied=Object.values(added).includes(year);
  return `<section class="card">
    <h3>传奇新秀包 <span class="r">${esc(year)} 年选秀</span></h3>
    <p class="hint">${occupied?'这届选秀已加入传奇新秀包。':'选一届加入候选名单。各队按现有签位和顺序选人。'}</p>
    <div class="cheat-actions">${LEGEND_DRAFT_PACKS.map(pack=>`<div class="cheat-rookie-item">
      <div><b>${pack.year} 届 · ${pack.players.length} 人</b>
        <div class="hint legend-featured">${legendFeatured(pack).map((name,index,names)=>
          `<span>${esc(name)}${index<names.length-1?'、':''}</span>`).join('')}</div></div>
      ${added[pack.year]?`<span class="hint">已加入 ${esc(added[pack.year])} 年选秀</span>`:
        `<button class="sm" data-legend-pack="${pack.year}" ${available&&!occupied?'':'disabled'}>选择 ${pack.year} 届</button>`}
    </div>`).join('')}</div>
  </section>`;
}

function vCheats(v){
  const enabled=cheatsEnabled(), available=cheatActionAvailable();
  const S=G.season, team=myTeam(), year=ctxYear(), limit=ownerLimit(team.i,year);
  const base=baseOwnerLimit(team.i,year), budgetOpen=W.off || S.phase!=='done';
  const injured=team.players.filter(p=>p.injury>0).length;
  const tired=team.players.filter(p=>p.energy<1).length;
  const average=team.players.length ? Math.round(team.players.reduce((sum,p)=>sum+mor(p),0)/team.players.length) : 0;
  const chem=Math.round(W.tm?.[team.i]?.chem ?? 50);
  const trustNeeded=S.fired || S.board.conf<100 || (S.phase==='done' && G.board?.conf<100);
  const disabled=available?'':' disabled';
  v.innerHTML=`
    <h1>作弊台</h1>
    <div class="sub">${esc(team.cn)} · 仅对当前存档开启</div>
    <div class="card">
      <h3>当前存档${enabled?'已开启':'已关闭'}</h3>
      <p class="hint">${available?'首次修改前会自动备份。关闭后，已完成的修改仍会保留。':'请在比赛或模拟结束后再操作。'}</p>
      <div class="ctrl"><button id="cheat-toggle" class="${enabled?'':'pri'}"${disabled}>${enabled?'关闭作弊台':'开启作弊台'}</button><button id="cheat-back">返回存档</button></div>
    </div>
    ${enabled?`
      <div class="row cheat-grid">
        <section class="col card">
          <h3>交易特批</h3>
          <p class="hint">在交易页选好筹码后，可让对方接受这笔交易，并单独放宽薪资匹配。</p>
          <div class="ctrl"><button data-cheat-view="trade">前往交易</button></div>
        </section>
        <section class="col card">
          <h3>球员编辑</h3>
          <div class="ctrl">
            <label>本队球员 <select id="cheat-player">${team.players.slice().sort((a,b)=>b.ovr-a.ovr).map(p=>`<option value="${p.id}">${esc(p.cn)} · ${p.ovr}</option>`).join('')}</select></label>
            <button id="cheat-edit" ${team.players.length?disabled:'disabled'}>编辑球员</button>
          </div>
        </section>
        <section class="col card">
          <h3>球队救急</h3>
          <p class="hint">伤停 ${injured} 人 · 体能未满 ${tired} 人</p>
          <div class="ctrl"><button id="cheat-heal"${injured||tired?disabled:' disabled'}>清除伤病并恢复体能</button></div>
          <div class="cheat-actions">
            <div><span>平均士气 <b>${average}</b></span><button id="cheat-morale" class="sm"${team.players.some(p=>mor(p)<100||p.treq)?disabled:' disabled'}>全队士气升至 100</button></div>
            <div><span>化学反应 <b>${chem}</b></span><button id="cheat-chem" class="sm"${(W.tm?.[team.i]?.chem??50)<100?disabled:' disabled'}>化学反应升至 100</button></div>
            <div><span>老板信任 <b>${S.board.conf}</b></span><button id="cheat-trust" class="sm"${trustNeeded?disabled:' disabled'}>${S.fired?'恢复职位并提高信任':'老板信任升至 100'}</button></div>
          </div>
          ${budgetOpen?`<form id="cheat-budget" class="ctrl">
            <label>${year}–${String((year+1)%100).padStart(2,'0')} 赛季老板上限 <input name="limit" type="number" inputmode="numeric" min="${base}" max="${CHEAT_BUDGET_MAX}" value="${limit}" required> 万</label>
            <button type="submit"${disabled}>调整上限</button>
          </form><p class="hint">默认 ${money(base)}。工资帽、奢侈税和交易薪资规则照常计算。</p>`:'<p class="hint">本季财政已结算。进入休赛期可调整下季上限。</p>'}
        </section>
        <section class="col card">
          <h3>新秀透视</h3>
          <p class="hint">在球探页和选秀名单显示真实总评、潜力和发展类型。</p>
          <div class="ctrl"><button id="cheat-reveal"${disabled}>${scoutRevealed()?'关闭新秀透视':'开启新秀透视'}</button><button data-cheat-view="scout">前往球探</button></div>
        </section>
      </div>${customRookiesPanel(available)}${legendDraftPanel(available)}`:''}
    <section class="card"><h3>修改前备份</h3><div id="cheat-backup" class="hint">${G.cheats?.backup?'读取备份…':'首次修改后可在这里恢复。'}</div></section>`;
  const q=s=>v.querySelector(s);
  const go=view=>{ G.view=view; render(); };
  q('#cheat-back').onclick=()=>go('save');
  bindCheatPreference(q('#cheat-toggle'),{enabled:!enabled});
  v.querySelectorAll('[data-cheat-view]').forEach(b=>b.onclick=()=>go(b.dataset.cheatView));

  if(enabled){
    bindCheatPreference(q('#cheat-reveal'),{reveal:!scoutRevealed()});
    q('#cheat-edit').onclick=()=>showCheatPlayer(+q('#cheat-player').value);
    q('#create-custom-rookie').onclick=()=>showCustomRookie();
    v.querySelectorAll('[data-custom-rookie]').forEach(b=>{
      b.onclick=()=>showCustomRookie(+b.dataset.customRookie);
    });
    v.querySelectorAll('[data-legend-pack]').forEach(b=>{
      b.onclick=()=>showLegendDraftPack(+b.dataset.legendPack);
    });
    q('#cheat-heal').onclick=e=>performCheatEdit(e.currentTarget,()=>{
      for(const p of team.players){
        delete S.inj[p.id];
        if(S.cond[p.id]!=null) S.cond[p.id]=100;
      }
      applyPlayerState();
      if(G.rot?.starters.length<5) fixRot();
    },'全队伤病已清除，体能已恢复');
    q('#cheat-morale').onclick=e=>performCheatEdit(e.currentTarget,()=>{
      const renewals=W.off?.asks ? new Set(expiringOf(team.i)) : null;
      for(const p of team.players){
        setMor(p,100);
        delete p.treq;
        if(S.low) delete S.low[p.id];
        if(renewals?.has(p)) W.off.asks[p.id]=makeAsk(p,team.i);
      }
      applyLife();
    },'全队士气已升至 100');
    q('#cheat-chem').onclick=e=>performCheatEdit(e.currentTarget,()=>{ tmeta(team.i).chem=100; },'化学反应已升至 100');
    q('#cheat-trust').onclick=e=>performCheatEdit(e.currentTarget,()=>{
      S.board.conf=100;
      if(S.phase==='done') G.board={...G.board,conf:100};
      if(S.fired){
        S.fired=false;
        S.inbox.push({d:S.day,t:'老板恢复了你的职位',b:'你可以继续管理球队。老板信任度已升至 100。'});
      }
    },'老板信任已升至 100');
    const budget=q('#cheat-budget');
    if(budget) budget.onsubmit=e=>{
      e.preventDefault();
      const amount=cheatNumber(budget.elements.limit);
      if(!Number.isSafeInteger(amount) || amount<base || amount>CHEAT_BUDGET_MAX) return toast('请输入有效的老板上限');
      if(amount===limit) return toast('老板上限没有变化');
      performCheatEdit(budget.querySelector('button'),()=>{
        const budgets=G.cheats.budgets??={};
        const byYear=budgets[team.i]??={};
        if(amount===base) delete byYear[year];
        else byYear[year]=amount;
      },'老板上限已调整');
    };
  }
  const target=q('#cheat-backup');
  if(G.cheats?.backup) showCheatBackup(target,G.cheats.backup);
}

async function showCheatBackup(target,id){
  const backup=readCheatBackup(await slotGet(id));
  if(!target.isConnected) return;
  if(!backup){
    target.textContent='本设备没有这份备份。下次修改前会重新备份当前进度。';
    return;
  }
  target.innerHTML=`${metaTxt(backup)}<div class="ctrl"><button id="cheat-restore" ${cheatActionAvailable()?'':'disabled'}>恢复修改前的存档</button></div>`;
  target.querySelector('button').onclick=()=>{
    if(!cheatActionAvailable() || G.cheats.backup!==id) return;
    if(!confirmSafe('恢复备份会替换当前进度。确定恢复到首次修改前吗？')) return;
    try{ restore(backup); }
    catch(error){ toast('无法恢复备份，请检查浏览器存储空间'); }
  };
}

function showCheatPlayer(id){
  if(!cheatsEnabled() || !cheatActionAvailable()) return;
  const p=myTeam().players.find(p=>p.id===id);
  if(!p) return;
  const year=ctxYear(), C=CFG(year);
  const contract=activeContract(p,year)?p.contract:null;
  const minSal=contract?Math.min(contract[0],contract[2]==='tw'?Math.round(C.minSal*.5):C.minSal):0;
  const maxSal=contract?Math.max(contract[0],C.maxSal):0;
  const maxYears=contract?Math.max(4,contract[1]-year):0;
  const modal=document.getElementById('modal');
  modal.innerHTML=`<div class="modal"><div class="box" role="dialog" aria-modal="true" aria-labelledby="cheat-player-title">
    <h1 id="cheat-player-title">编辑 ${esc(p.cn)}</h1>
    <p class="hint">${POS_CN[p.pos]} · ${ageOf(p,year)} 岁</p>
    <form id="cheat-player-form">
      <div class="ctrl"><b id="cheat-ovr"></b>${cheatNumberField('潜力','pot',p.pot,25,99)}</div>
      ${cheatAttributeFields(p.a,25)}
      <h2>合同</h2>
      ${contract?`<div class="ctrl cheat-contract">${cheatNumberField('年薪（万）','salary',contract[0],minSal,maxSal)}${cheatNumberField('剩余年数','years',contract[1]-year,1,maxYears)}</div>`:'<p class="hint">当前没有生效合同。</p>'}
      <div class="ctrl"><button class="pri" type="submit">保存修改</button><button type="button" id="cheat-player-cancel">取消</button></div>
    </form></div></div>`;
  modal.querySelector('#cheat-player-cancel').onclick=()=>{ if(!cheatBusy) closeModal(); };
  const form=modal.querySelector('form');
  const readAttrs=()=>Object.fromEntries(KEYS.map(k=>[k,cheatNumber(form.elements[k])]));
  function refreshTotal(){
    const attrs=readAttrs(), pot=cheatNumber(form.elements.pot);
    if(Object.values(attrs).some(x=>!Number.isInteger(x))) return;
    const total=calcOvr({...p,a:attrs});
    form.querySelector('#cheat-ovr').textContent=`总评 ${p.ovr} → ${total}`+
      (pot<total?` · 潜力将升至 ${total}`:'');
  }
  form.oninput=refreshTotal;
  refreshTotal();
  form.onsubmit=e=>{
    e.preventDefault();
    const attrs=readAttrs();
    const attrsChanged=KEYS.some(k=>attrs[k]!==p.a[k]);
    const total=attrsChanged?calcOvr({...p,a:attrs}):p.ovr;
    const pot=Math.max(cheatNumber(form.elements.pot),total);
    const salary=contract?cheatNumber(form.elements.salary):null;
    const expires=contract?year+cheatNumber(form.elements.years):null;
    const contractChanged=contract && (salary!==contract[0] || expires!==contract[1]);
    if(!form.checkValidity() || !Number.isInteger(pot)) return;
    if(!attrsChanged && !contractChanged && pot===p.pot) return toast('球员资料没有变化');
    performCheatEdit(form.querySelector('[type=submit]'),()=>{
      if(attrsChanged){
        p.a=attrs;
        p.ovr=total;
        reindex();
      }
      p.pot=pot;
      if(contractChanged) p.contract=[salary,expires,contract[2]];
      if(W.off?.asks && expiringOf(G.team).includes(p)) W.off.asks[p.id]=makeAsk(p,G.team);
    },`${p.cn}的资料已更新`);
  };
}

function showCustomRookie(id){
  if(!cheatsEnabled() || !cheatActionAvailable()) return;
  const year=customDraftYear(), p=customRookiesFor(year).find(candidate=>candidate.id===id);
  if(id!=null && !p) return;
  const title=p?'编辑自定义新秀':'创建自定义新秀';
  const attrs=p?.a??Object.fromEntries(KEYS.map(k=>[k,65]));
  const positions=selected=>POS.map(pos=>`<option value="${pos}" ${pos===selected?' selected':''}>${POS_CN[pos]} (${pos})</option>`).join('');
  const modal=document.getElementById('modal');
  modal.innerHTML=`<div class="modal"><div class="box" role="dialog" aria-modal="true" aria-labelledby="custom-rookie-title">
    <h1 id="custom-rookie-title">${title}</h1>
    <p class="hint">${year} 年选秀 · 年龄以参加选秀时为准</p>
    <form id="custom-rookie-form">
      <div class="cheat-profile">
        <label>姓名<input name="name" type="text" value="${esc(p?.cn??'')}" maxlength="${CUSTOM_ROOKIE_NAME_MAX}" autocomplete="off" required></label>
        ${cheatNumberField('选秀年龄','age',p?.age??19,...CUSTOM_ROOKIE_AGES)}
        <label>主位置<select name="pos">${positions(p?.pos??'SF')}</select></label>
        <label>副位置（可选）<select name="secondary"><option value="">无</option>${positions(p?.pos2[0])}</select></label>
      </div>
      <div class="ctrl">${cheatNumberField('潜力','pot',p?.pot??85,25,99)}<output id="custom-rookie-rating" aria-live="polite"></output></div>
      ${cheatAttributeFields(attrs,20)}
      <div class="ctrl"><button class="pri" type="submit">${p?'保存新秀资料':'加入选秀名单'}</button><button type="button" id="custom-rookie-cancel">取消</button></div>
    </form>
  </div></div>`;
  const form=modal.querySelector('form'), fields=form.elements;
  const readAttrs=()=>Object.fromEntries(KEYS.map(k=>[k,cheatNumber(fields[k])]));
  const rating=form.querySelector('#custom-rookie-rating');
  function refreshRating(){
    const a=readAttrs(), potential=cheatNumber(fields.pot);
    if(Object.values(a).some(v=>!Number.isInteger(v))){
      rating.textContent='';
      return;
    }
    const ovr=calcOvr({pos:fields.pos.value,a});
    rating.textContent=`总评 ${ovr}`+(potential<ovr?` · 潜力将升至 ${ovr}`:'');
  }
  function refreshPositions(){
    for(const option of fields.secondary.options){
      option.disabled=option.value===fields.pos.value;
      if(option.disabled && option.selected) fields.secondary.value='';
    }
  }
  form.oninput=refreshRating;
  fields.pos.onchange=()=>{ refreshPositions(); refreshRating(); };
  refreshPositions();
  refreshRating();
  form.querySelector('#custom-rookie-cancel').onclick=()=>{ if(!cheatBusy) closeModal(); };
  fields.namedItem('name').focus();
  form.onsubmit=e=>{
    e.preventDefault();
    let profile;
    try{
      profile=customRookieProfile(year,{name:fields.namedItem('name').value,age:cheatNumber(fields.age),
        pos:fields.pos.value,secondary:fields.secondary.value,attributes:readAttrs(),potential:cheatNumber(fields.pot)});
    }catch(error){ return toast(error.message); }
    if(p && profile.cn===p.cn && profile.born===p.born && profile.pos===p.pos &&
       profile.pos2[0]===p.pos2[0] && profile.pot===p.pot && KEYS.every(k=>profile.a[k]===p.a[k])){
      return toast('新秀资料没有变化');
    }
    const validate=()=>{
      if(year!==customDraftYear() || (p && !customRookiesFor(year).includes(p))){
        closeModal();
        throw new Error('选秀进度已变化，请重新打开编辑器');
      }
    };
    performCheatEdit(form.querySelector('[type=submit]'),()=>saveCustomRookie(year,profile,id),
      p?`${profile.cn}的新秀资料已保存`:`${profile.cn}已加入 ${year} 年选秀`,validate);
  };
}

function showLegendDraftPack(sourceYear){
  if(!cheatsEnabled() || !cheatActionAvailable()) return;
  const year=customDraftYear();
  let pack;
  try{ pack=checkLegendDraftPack(sourceYear,year); }
  catch(error){ toast(error.message); return; }
  const modal=document.getElementById('modal');
  modal.innerHTML=`<div class="modal"><div class="box" role="dialog" aria-modal="true" aria-labelledby="legend-pack-title">
    <h1 id="legend-pack-title">加入 ${sourceYear} 届传奇新秀</h1>
    <p class="hint">${pack.players.length} 名球员将参加本存档的 ${year} 年选秀。</p>
    <p>${esc(legendFeatured(pack).join('、'))}等球员会和原来的新秀一起参选。其他球队也可以选中他们。</p>
    <div class="ctrl"><button id="legend-pack-add" class="pri">加入 ${year} 年选秀</button>
      <button id="legend-pack-cancel">取消</button></div>
  </div></div>`;
  modal.querySelector('#legend-pack-cancel').onclick=()=>{ if(!cheatBusy) closeModal(); };
  modal.querySelector('#legend-pack-add').onclick=e=>performCheatEdit(e.currentTarget,
    ()=>addLegendDraftPack(sourceYear,year),`${sourceYear} 届传奇新秀已加入 ${year} 年选秀`,
    ()=>checkLegendDraftPack(sourceYear,year));
}

function showCheatTrade(){
  if(!cheatsEnabled() || !cheatActionAvailable() || !tradeOpen().ok) return;
  const ev=evalTrade();
  if(ev.blocking.length) return toast(ev.blocking[0]);
  const partner=TEAMS[TR.partner];
  const proposalKey=()=>JSON.stringify([TR.partner,[...TR.mineP],[...TR.theirP],[...TR.mineK],[...TR.theirK],TR.prot]);
  const approved=proposalKey();
  const modal=document.getElementById('modal');
  const packageText=(players,picks)=>[...players.map(p=>p.cn),...picks.map(pickLabel)].join('、')||'无';
  modal.innerHTML=`<div class="modal"><div class="box" role="dialog" aria-modal="true" aria-labelledby="cheat-trade-title">
    <h1 id="cheat-trade-title">特批本笔交易</h1>
    <p>${ev.ratio<1?'对方原本拒绝。确认后，对方将接受这份报价。':'对方愿意接受这份报价。'}</p>
    <div class="tw"><table><thead><tr><th>球队</th><th>得到</th><th class="n">正式合同</th><th class="n">交易后工资</th></tr></thead><tbody>
      <tr><td>${esc(myTeam().nick)}</td><td class="wrap">${esc(packageText(ev.inP,ev.inK))}</td><td class="n">${ev.myCount} 人</td><td class="n">${money(ev.myPay)}</td></tr>
      <tr><td>${esc(partner.nick)}</td><td class="wrap">${esc(packageText(ev.outP,ev.outK))}</td><td class="n">${ev.ptCount} 人</td><td class="n">${money(ev.ptPay)}</td></tr>
    </tbody></table></div>
    ${ev.issues.length?`<ul class="bad">${ev.issues.map(reason=>`<li>${esc(reason)}</li>`).join('')}</ul>
    <label class="cheat-check"><input id="cheat-salary" type="checkbox"> 本次跳过双方的薪资匹配限制</label>`:'<p class="hint">双方薪资符合交易规则。</p>'}
    <div class="ctrl"><button id="cheat-trade-confirm" class="pri" ${ev.issues.length?'disabled':''}>确认成交</button><button id="cheat-trade-cancel">取消</button></div>
  </div></div>`;
  const button=modal.querySelector('#cheat-trade-confirm');
  const salary=modal.querySelector('#cheat-salary');
  if(salary) salary.onchange=()=>{ if(!cheatBusy) button.disabled=!salary.checked; };
  modal.querySelector('#cheat-trade-cancel').onclick=()=>{ if(!cheatBusy) closeModal(); };
  button.onclick=()=>{
    const skipSalary=salary?.checked===true;
    performCheatEdit(button,()=>doTrade({force:true,salary:skipSalary}),'特批交易已完成',()=>{
      if(proposalKey()!==approved){
        closeModal();
        throw new Error('交易筹码已变化，请重新确认报价');
      }
    });
  };
}
