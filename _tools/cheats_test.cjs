const assert=require('node:assert/strict');
const fs=require('node:fs');
const {root,appContext,clone}=require('./balance_20261020/support.cjs');
const files=['app_save.js','app_cheats.js'];
function context(storage){
  const c=appContext(storage);
  c.run('const LEGEND_DRAFT_PACKS='+fs.readFileSync(root+'/legend_draft_packs.json','utf8'));
  for(const f of files) c.run(fs.readFileSync(root+'/'+f,'utf8'));
  c.run('globalThis.alert=()=>{};');
  return c;
}
const legacy=()=>new Map(Object.entries(JSON.parse(fs.readFileSync(root+'/fix_20261004/legacy-save.json','utf8'))));
async function main(){
  const c=context(legacy()), run=c.run;
  const old=[...c.storage];
  run('load()');
  assert.equal(run('cheatsEnabled()'),false);
  assert.deepEqual([...c.storage],old);
  assert.equal(run('G.season.games.length'),1230);
  run('setCheatPreference({enabled:true}); setCheatPreference({reveal:true});');
  assert.equal(run('G.cheats.backup'),undefined);
  assert.equal(run('scoutRevealed()'),true);
  const injured=run('myTeam().players[0].id');
  const other=run('TEAMS[1].players[0].id');
  run(`G.season.inj[${injured}]={days:32,name:'测试伤病'}; G.season.cond[${injured}]=26;
       G.season.inj[${other}]={days:11,name:'测试伤病'}; G.season.cond[${other}]=31; applyPlayerState();`);
  const withInjury=clone(run('currentSaveKeys()'));
  await run(`runCheatEdit(()=>{ delete G.season.inj[${injured}]; G.season.cond[${injured}]=100; applyPlayerState(); })`);
  const id=run('G.cheats.backup');
  assert.ok(id.startsWith('cheat-'));
  const backupKey='bbm_slot_'+id;
  const copy=c.storage.get(backupKey);
  assert.deepEqual(JSON.parse(copy).keys,withInjury);
  assert.equal(run(`PBYID[${injured}].energy`),1);
  assert.equal(run(`PBYID[${other}].injury`),11);
  await run('runCheatEdit(()=>{ G.season.board.conf=100; G.cheats.budgets={0:{2026:55555}}; })');
  assert.equal(c.storage.get(backupKey),copy);
  run('setCheatPreference({enabled:false});');
  assert.equal(run('scoutRevealed()'),false);
  assert.equal(run('ownerLimit(0,2026)'),55555);
  assert.equal(run('ownerLimit(1,2026)'),run('baseOwnerLimit(1,2026)'));
  assert.equal(run('ownerLimit(0,2027)'),run('baseOwnerLimit(0,2027)'));
  const reload=context(c.storage);
  reload.run('load()');
  assert.equal(reload.run('G.season.board.conf'),100);
  assert.equal(reload.run('G.cheats.backup'),id);
  await reload.run('slotGet(G.cheats.backup).then(s=>restore(readCheatBackup(s)))');
  for(const [k,v] of Object.entries(withInjury)) assert.equal(c.storage.get(k),v);
  console.log('PASS 旧档原字节、按档开关、三部分首次备份、后续修改保留首次备份、完整恢复、财政按队和按季生效');

  const q=context(legacy());
  q.run(`load(); setCheatPreference({enabled:true});
    const rawWrite=localStorage.setItem;
    localStorage.setItem=(key,value)=>{ if(key.startsWith('bbm_slot_cheat-')) throw new Error('quota'); rawWrite(key,value); };
  `);
  const qBefore=[...q.storage];
  await assert.rejects(q.run('runCheatEdit(()=>{ G.season.board.conf=100; })'),/quota/);
  assert.equal(q.run('G.season.board.conf'),JSON.parse(qBefore.find(([k])=>k==='bbm_season_v1')[1]).board.conf);
  assert.deepEqual([...q.storage],qBefore);
  console.log('PASS 备份写入失败时拦截修改');

  const corrupt=context(legacy());
  corrupt.run(`load(); setCheatPreference({enabled:true});
    const put=slotPut;
    slotPut=(key,snapshot)=>put(key,{...snapshot,keys:{...snapshot.keys,
      [SEASON_KEY]:JSON.stringify({...G.season,day:G.season.day+1})}});
  `);
  const corruptBefore=[...corrupt.storage];
  await assert.rejects(corrupt.run('runCheatEdit(()=>{ G.season.board.conf=100; })'),/无法验证作弊前备份/);
  assert.deepEqual([...corrupt.storage],corruptBefore);
  console.log('PASS 备份可读但内容错误时拦截修改');

  const busy=context(legacy());
  busy.run('load(); setCheatPreference({enabled:true});');
  const busyBefore=[...busy.storage];
  await assert.rejects(busy.run(`runCheatEdit(()=>{ G.season.board.conf=100; },
    ()=>{ throw new Error('交易筹码已变化'); })`),/交易筹码已变化/);
  assert.deepEqual([...busy.storage],busyBefore);
  console.log('PASS 最终校验失败时保留原进度，不留未执行操作的备份');

  const w=context(legacy());
  w.run(`load(); setCheatPreference({enabled:true});
    const rawWrite=localStorage.setItem;
    localStorage.setItem=(key,value)=>{ if(key===WORLD_KEY) throw new Error('quota'); rawWrite(key,value); };
  `);
  const wBefore=[...w.storage];
  await assert.rejects(w.run('runCheatEdit(()=>{ myTeam().players[0].pot=99; })'),/quota/);
  assert.deepEqual([...w.storage].sort(),wBefore.sort());
  console.log('PASS 备份成功后自动存档空间不足，原存档回滚');

  const t=context();
  t.run(`newSeason(2026); save(); setCheatPreference({enabled:true});
    TR.partner=1;
    const mine=myTeam().players.find(p=>p.en==='Jalen Johnson');
    const incoming=TEAMS[1].players.find(p=>p.en==='Jayson Tatum');
    mine.contract[0]=140;
    TR.mineP.add(mine.id); TR.theirP.add(incoming.id);
  `);
  const deal=t.run('evalTrade()');
  assert.ok(deal.ratio<1&&deal.issues.length&&!deal.blocking.length);
  assert.throws(()=>t.run('doTrade()'),/换进来|对方不接受/);
  assert.throws(()=>t.run('doTrade({force:true,salary:true})'),/作弊台/);
  t.run('incoming.frz=todayNum()+7');
  assert.ok(t.run('evalTrade().blocking').some(issue=>issue.includes('刚签约')));
  t.run('delete incoming.frz; G.season.day=dayOf(new Date(2027,1,6));');
  assert.equal(t.run('tradeOpen().ok'),false);
  assert.equal(t.run(`(()=>{
    const contracts=TEAMS[0].players.map(p=>p.contract);
    const otherContract=incoming.contract;
    TEAMS[0].players.slice(0,3).forEach(p=>{ p.contract=[70,2028,'tw']; });
    incoming.contract=[70,2028,'tw'];
    const issue=checkTrade(0,[],1,[incoming],2026,undefined,true).some(s=>s.includes('超过 3 份双向合同'));
    TEAMS[0].players.forEach((p,i)=>{ p.contract=contracts[i]; });
    incoming.contract=otherContract;
    return issue;
  })()`),true);
  t.run('G.season.day=0;');
  await t.run('runCheatEdit(()=>doTrade({force:true,salary:true}))');
  assert.equal(t.run('teamOfId(incoming.id)'),0);
  assert.equal(t.run('teamOfId(mine.id)'),1);
  assert.equal(t.run('G.season.inbox.at(-1).t.includes("完成交易")'),true);
  t.run(`W.off={year:2027,step:1,lottery:{year:2027,order:[{orig:1,round:1,owner:1}]}};
    TR.theirK.add('2027-1-1');`);
  await t.run('runCheatEdit(()=>doTrade({force:true,salary:false}))');
  assert.equal(t.run('W.picks[2027][1][1]'),0);
  assert.equal(t.run('W.off.lottery.order[0].owner'),0);
  console.log('PASS 普通交易规则、薪资放行、冷冻期、截止日、实际转队、抽签后的签位归属');

  await customRookieCases();
  await legendDraftCases();
}

async function customRookieCases(){
  const app=context(legacy()), run=app.run;
  const legacyKeys=[...app.storage];
  run('load();');
  assert.deepEqual([...app.storage],legacyKeys);
  const numProspects=run('W.draftClass.length');
  run(`setCheatPreference({enabled:true});
    function testRookie(year,name,age,potential){
      return customRookieProfile(year,{name,age,pos:'C',secondary:'PF',
        attributes:Object.fromEntries(KEYS.map(k=>[k,k==='pass'?98:90])),potential});
    }`);
  assert.throws(()=>run("testRookie(2027,'  ',19,99)"),/姓名/);
  assert.throws(()=>run("testRookie(2027,'江临',17,99)"),/年龄/);
  const before=clone(run('currentSaveKeys()'));
  await run("runCheatEdit(()=>saveCustomRookie(2027,testRookie(2027,'江临',19,99)))");
  const id=run('customRookiesFor(2027)[0].id');
  const slot=run('G.cheats.backup');
  assert.deepEqual(JSON.parse(app.storage.get('bbm_slot_'+slot)).keys,before);
  assert.equal(run('W.draftClass.length'),numProspects+1);
  assert.equal(run(`teamOfId(${id})`),-1);

  const reload=context(app.storage);
  reload.run('load();');
  assert.deepEqual(clone(reload.run(`(()=>{
    const p=PBYID[${id}];
    return [p.cn,p.age,p.pos,p.pos2[0],p.pot,p.a.pass,p.contract];
  })()`)),['江临',19,'C','PF',99,98,null]);
  const sameId=await reload.run(`runCheatEdit(()=>{
    const p=PBYID[${id}];
    const profile=customRookieProfile(2027,{name:'江临远',age:20,pos:p.pos,secondary:'PF',attributes:p.a,potential:25});
    const edited=saveCustomRookie(2027,profile,p.id);
    if(edited.ovr!==edited.pot) throw Error('潜力不能低于总评');
  }).then(()=>customRookiesFor(2027)[0].id)`);
  assert.equal(sameId,id);
  assert.equal(reload.run('G.cheats.backup'),slot);
  assert.equal(reload.run('W.draftClass.length'),numProspects+1);
  console.log('PASS 旧档创建与重载、年龄、能力、同一 ID 继续编辑和首次作弊备份');

  reload.run(`
    const first={no:1,round:1,orig:G.team,owner:G.team};
    const second={no:2,round:1,orig:1,owner:1};
    W.off={step:2,year:2027,draft:{year:2027,idx:0,order:[first,second],log:[]}};
    draftPlayer(first,PBYID[${id}]); W.off.draft.idx++;
    save();
  `);
  const oldDraftStorage=new Map(app.storage);
  const oldWorld=JSON.parse(oldDraftStorage.get('bbm_world_v1'));
  delete oldWorld.W.draftClass.find(p=>p.id===id).drafted;
  oldDraftStorage.set('bbm_world_v1',JSON.stringify(oldWorld));
  const drafting=context(oldDraftStorage);
  drafting.run('load();');
  assert.deepEqual(clone(drafting.run(`(()=>{
    const p=PBYID[${id}];
    return [p.age,p.drafted,p.draft.no,p.draft.team,p.contract[2],W.off.draft.idx];
  })()`)),[20,true,1,0,'rk',1]);
  assert.ok(!drafting.run(`W.draftClass.filter(p=>!p.drafted).some(p=>p.id===${id})`));
  assert.deepEqual(clone(drafting.run(`(()=>{
    const d=W.off.draft, current=d.order[d.idx];
    const stalePick=draftPlayer(d.order[0],W.draftClass.find(p=>!p.drafted));
    const duplicate=draftPlayer(current,PBYID[${id}]);
    return [stalePick,duplicate,d.idx,d.log.length];
  })()`)),[false,false,1,1]);
  assert.equal(drafting.run('customDraftYear()'),2028);
  console.log('PASS 首轮正常签约，旧档补回已选标记，拦截过期签位和重复选择');

  await drafting.run(`runCheatEdit(()=>{
    const profile=customRookieProfile(2028,{name:'许知行',age:21,pos:'PG',secondary:'',
      attributes:Object.fromEntries(KEYS.map(k=>[k,99])),potential:99});
    saveCustomRookie(2028,profile);
  })`);
  const queuedId=drafting.run('customRookiesFor(2028)[0].id');
  assert.ok(!drafting.run(`W.draftClass.some(p=>p.id===${queuedId})`));
  const next=context(oldDraftStorage);
  next.run('load();');
  assert.equal(next.run('customRookiesFor(2028)[0].id'),queuedId);
  next.run('draftAdvance(false); startNewSeason();');
  assert.equal(next.run('W.dcYear'),2028);
  assert.equal(next.run('W.customDraftQueue'),undefined);
  assert.equal(next.run(`W.draftClass.filter(p=>p.id===${queuedId}).length`),1);
  assert.equal(next.run(`PBYID[${queuedId}].age`),21);
  assert.equal(next.run('aiDraftPick(1).id'),queuedId);
  assert.equal(next.run(`teamOfId(${id})`),0);
  console.log('PASS 当届开选后排到下一届、队列存读档、生成时合并、AI 正常参选');
}

async function legendDraftCases(){
  const storage=legacy(), old=[...storage];
  const app=context(storage), run=app.run;
  assert.ok(run(`LEGEND_DRAFT_PACKS.every(pack=>pack.players.every(row=>{
    const [pos]=legendPositions(row), a=legendAttributes(row,pos);
    return !Object.hasOwn(row,'ratings') && ARCH[row.style] &&
      Object.keys(row.traits??{}).every(key=>KEYS.includes(key)) &&
      Math.abs(calcOvr({pos,a})-row.overall)<=1 && row.potential>=calcOvr({pos,a}) && row.potential<=99 &&
      KEYS.every(key=>Number.isInteger(a[key]) && a[key]>=20 && a[key]<=99);
  }))`));
  assert.equal(run('legendBadge({})'),'');
  run('load();');
  assert.deepEqual([...storage],old);
  assert.equal(run('W.legendDraftPacks'),undefined);
  run('setCheatPreference({enabled:true});');
  const original=clone(run('W.draftClass.map(p=>p.id)'));
  const picks=clone(run('W.picks'));
  const before=clone(run('currentSaveKeys()'));
  await run('runCheatEdit(()=>addLegendDraftPack(1984,2027));');
  const slot=run('G.cheats.backup'), backup=storage.get('bbm_slot_'+slot);
  assert.deepEqual(JSON.parse(backup).keys,before);
  assert.deepEqual(clone(run('W.picks')),picks);
  assert.deepEqual(clone(run(`W.draftClass.filter(p=>!p.legendDraft).map(p=>p.id)`)),original);
  assert.equal(run('W.draftClass.length'),original.length+42);
  assert.equal(run('new Set(W.draftClass.map(p=>p.id)).size'),original.length+42);
  assert.ok(run(`W.draftClass.filter(p=>p.legendDraft).every(p=>p.pot>=p.ovr && p.pot<=99 &&
    POS.includes(p.pos) && p.pos2.every(pos=>POS.includes(pos) && p.pos!==pos) &&
    KEYS.every(key=>Number.isInteger(p.a[key]) && p.a[key]>=20 && p.a[key]<=99))`));
  assert.throws(()=>run('checkLegendDraftPack(1996,2027)'),/已加入一个/);
  assert.throws(()=>run('checkLegendDraftPack(1984,2027)'),/已经加入过/);

  const draft=context(storage);
  draft.run(`load();
    const jordan=W.draftClass.find(p=>p.en==='Michael Jordan');
    const first={no:9,round:1,orig:G.team,owner:G.team};
    const second={no:10,round:1,orig:1,owner:1};
    W.off={step:2,year:2027,draft:{year:2027,idx:0,order:[first,second],log:[]}};
    if(!draftPlayer(first,jordan)) throw new Error('原签位未能选中传奇');
    W.off.draft.idx++;
    save();
  `);
  const resumed=context(storage);
  resumed.run("load(); const jordan=myTeam().players.find(p=>p.en==='Michael Jordan');");
  assert.deepEqual(clone(resumed.run(`[
    jordan.age,jordan.drafted,jordan.legendDraft.year,jordan.legendDraft.pick,jordan.draft.no,
    jordan.draft.team,jordan.contract[2],W.off.draft.idx
  ]`)),[21,true,1984,3,9,0,'rk',1]);
  assert.match(resumed.run('legendBadge(jordan)'),/legend-badge.*传奇/);
  assert.equal(resumed.run('jordan.pot'),99);
  assert.equal(resumed.run('draftPlayer(W.off.draft.order[1],jordan)'),false);
  assert.equal(resumed.run('customDraftYear()'),2028);
  assert.throws(()=>resumed.run('checkLegendDraftPack(1996,2027)'),/届次已变动/);
  await resumed.run('runCheatEdit(()=>addLegendDraftPack(1996,2028));');
  assert.equal(storage.get('bbm_slot_'+slot),backup);
  assert.equal(resumed.run('W.customDraftQueue[2028].length'),39);
  assert.equal(resumed.run('W.draftClass.some(p=>p.legendDraft?.year===1996)'),false);

  const next=context(storage);
  next.run('load(); draftAdvance(false); startNewSeason();');
  assert.equal(next.run('W.dcYear'),2028);
  assert.equal(next.run('W.customDraftQueue'),undefined);
  assert.equal(next.run('W.draftClass.length'),109);
  assert.equal(next.run('W.draftClass.filter(p=>p.legendDraft?.year===1996).length'),39);
  assert.equal(next.run("W.draftClass.find(p=>p.en==='Kobe Bryant').age"),18);
  assert.equal(next.run('aiDraftPick(1).legendDraft.year'),1996);
  assert.throws(()=>next.run('checkLegendDraftPack(1984,2028)'),/已经加入过/);
  assert.throws(()=>next.run('checkLegendDraftPack(2003,2028)'),/已加入一个/);
  await next.run('slotGet(G.cheats.backup).then(s=>restore(readCheatBackup(s)));');
  for(const [key,value] of Object.entries(before)) assert.equal(storage.get(key),value);
  console.log('PASS 传奇包兼容旧档，保留原候选和签位，历史顺位、实际选秀和新秀合同重载，跨年排队与恢复首次备份');

  const gold=context(storage);
  gold.run('load();');
  assert.deepEqual(clone(gold.run('currentSaveKeys()')),before);
  await gold.run('runCheatEdit(()=>addLegendDraftPack(2003,2027));');
  assert.deepEqual(clone(gold.run('W.picks')),picks);
  assert.deepEqual(JSON.parse(storage.get('bbm_slot_'+gold.run('G.cheats.backup'))).keys,before);
  assert.equal(gold.run('W.draftClass.length'),original.length+58);
  assert.ok(gold.run(`W.draftClass.filter(p=>p.legendDraft?.year===2003).every((p,i)=>
    p.legendDraft.pick===i+1 && p.legendDraft.round===(i<29?1:2))`));
  assert.deepEqual(clone(gold.run(`W.draftClass.filter(p=>p.legendDraft?.year===2003 && [1,3,4,5,57].includes(p.legendDraft.pick))
    .map(p=>[p.cn,p.age,p.legendDraft.pick])`)),[
    ['勒布朗·詹姆斯',18,1],['卡梅隆·安东尼',19,3],['克里斯·波什',19,4],['德维恩·韦德',21,5],['薛玉洋',20,57]
  ]);
  gold.run(`(()=>{
    const ownPick={no:9,round:1,orig:G.team,owner:G.team};
    const wade=W.draftClass.find(p=>p.legendDraft?.year===2003 && p.legendDraft.pick===5);
    W.off={step:2,year:2027,draft:{year:2027,idx:0,order:[ownPick],log:[]}};
    if(!draftPlayer(ownPick,wade)) throw new Error('原签位未能选中韦德');
    W.off.draft.idx++;
    save();
  })();`);
  const selected=context(storage);
  selected.run("load(); const wade=myTeam().players.find(p=>p.en==='Dwyane Wade');");
  assert.deepEqual(clone(selected.run('[wade.draft.no,wade.legendDraft.pick,wade.contract[2],wade.drafted]')),[9,5,'rk',true]);
  assert.match(selected.run('legendBadge(wade)'),/legend-badge.*传奇/);
  assert.throws(()=>selected.run('checkLegendDraftPack(2003,2028)'),/已经加入过/);
  console.log('PASS 2003 届完整两轮、独立历史身份、原签位正常签约和标识重载');
}
main().catch(error=>{ console.error(error); process.exitCode=1; });
