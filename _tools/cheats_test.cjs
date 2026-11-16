const assert=require('node:assert/strict');
const fs=require('node:fs');
const {root,appContext,clone}=require('./balance_20261020/support.cjs');
const files=['app_save.js','app_cheats.js'];
function context(storage){
  const c=appContext(storage);
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
}
main().catch(error=>{ console.error(error); process.exitCode=1; });
