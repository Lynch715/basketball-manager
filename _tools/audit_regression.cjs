// 近期功能与本体审计：用实际游戏模块验证修复过的边界行为。
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {root,appContext,clone}=require('./balance_20261020/support.cjs');

function context(storage){
  const app=appContext(storage);
  app.run(fs.readFileSync(path.join(root,'app_save.js'),'utf8'));
  return app;
}
function check(label,script,expected){
  const result=clone(context().run(script));
  assert.deepEqual(result,expected,label);
  console.log('PASS '+label);
}

check('损坏和跨赛季的存档校验失败，不覆盖现有进度',`
  newSeason(2026); save();
  const good=snapshot(), previous=currentSaveKeys();
  const partial={v:1,keys:{[WORLD_KEY]:good.keys[WORLD_KEY]}};
  const wrongYear={...good,keys:{...good.keys,[SEASON_KEY]:JSON.stringify({...G.season,year:2027})}};
  let rejected=0;
  for(const bad of [partial,wrongYear]){
    try{restore(bad);}catch(error){rejected++;}
  }
  ({valid:validSaveSnapshot(good),rejected,unchanged:SAVE_KEYS.every(k=>localStorage.getItem(k)===previous[k])})
`,{valid:true,rejected:2,unchanged:true});

check('休赛期清空本队阵容后仍可存档和读档',`
  newSeason(2026);
  W.off={step:5,year:2027};
  myTeam().players=[];
  reindex();
  const s=snapshot(), valid=validSaveSnapshot(s);
  restore(s); load();
  ({valid,players:myTeam().players.length,off:W.off.step})
`,{valid:true,players:0,off:5});

check('自动存档写入失败时三个键全部保留，仍能导出内存进度',`
  newSeason(2026); save();
  const previous=currentSaveKeys(), write=localStorage.setItem;
  let writes=0;
  localStorage.setItem=(k,v)=>{
    if(k===WORLD_KEY) throw new Error('QuotaExceeded');
    writes++;
    write(k,v);
  };
  G.season.board.conf=99;
  G.autoMine=true;
  W.news=[{txt:'扩大的联盟数据'.repeat(200)}];
  ({saved:save(), unchanged:SAVE_KEYS.every(k=>localStorage.getItem(k)===previous[k]),
    rollback:writes>=2, exportedConf:JSON.parse(snapshot().keys[SEASON_KEY]).board.conf})
`,{saved:false,unchanged:true,rollback:true,exportedConf:99});

check('赛前战术随档保存，直播和快速比赛结果一致且只作用于指定比赛',`
  newSeason(2026);
  const next=nextUserGame(), op=TEAMS[next.opp].players[0].id, own=G.rot.starters[0];
  G.prep={key:prepKey(next.key),mu:{[own]:op},dbl:op}; save();
  delete G.prep; load();
  const side=userSide(next.key);
  const live=createSeasonMatch(0,next.opp,next,true), quick=createSeasonMatch(0,next.opp,next);
  E.run(live); E.run(quick);
  ({matches:side.tactics.matchups[own]===op,double:side.tactics.double===op,
    nextCleared:userSide('r9999').tactics.double===null,
    score:live.score.join()===quick.score.join(), boxes:JSON.stringify(E.boxScore(live))===JSON.stringify(E.boxScore(quick))})
`,{matches:true,double:true,nextCleared:true,score:true,boxes:true});

check('常规赛无候选奖项和全明星缺员时不会卡住日程',`
  newSeason(2026);
  runAllStar(); const contested=G.season.allStar.game.forfeit==null;
  endRegular();
  ({contested,phase:G.season.phase,mvp:G.season.awards.mvp??null,inbox:G.season.inbox.at(-1).b.includes('无符合条件')})
`,{contested:false,phase:'playin',mvp:null,inbox:true});

check('三队循环互赢按分区战绩排序，排名独立于遍历顺序',`
  const make=(i,win,lose,cw)=>({i,pct:.5,w:41,l:41,cw,cl:52-cw,pf:9000,pa:9000,
    headGames:{[win]:1,[lose]:1},h2h:{[win]:1,[lose]:-1}});
  const a=make(0,1,2,25), b=make(1,2,0,26), c=make(2,0,1,27);
  [[a,b,c],[b,c,a],[c,b,a]].map(rs=>confRank(rs,'东').map(r=>r.i))
`,[[2,1,0],[2,1,0],[2,1,0]]);

check('自由市场只按显示要价降一次，续约要价不低于底薪',`
  newSeason(2026);
  W.off={year:2027,faRound:3,sheets:[],userOffers:{}};
  G.season.final=TEAMS.map(t=>({i:t.i,w:82,l:0}));
  const p=FREE[0]; p.ovr=25; p.fa={ask:200,yrs:1};
  FREE.splice(1);
  myTeam().players=[];
  TEAMS.slice(1).forEach(t=>t.players.forEach(p=>{ p.contract=[200,2030,'std']; }));
  W.off.userOffers[p.id]={amt:180,yrs:1};
  const r=faRound();
  const q=TEAMS[1].players[0]; q.ovr=25; setMor(q,95);
  ({signed:r.signed.length,rejected:r.rejected.length,ask:p.fa.ask,atLeastMin:makeAsk(q,1).amt>=CFG(2027).minSal})
`,{signed:0,rejected:1,ask:186,atLeastMin:true});

check('休赛期伤病和体能恢复后，刷新不再复活旧伤',`
  newSeason(2026);
  const id=myTeam().players[0].id;
  G.season.inj[id]={days:400,name:'旧伤'}; G.season.cond[id]=24;
  startOffseason(); load();
  ({injury:PBYID[id]?.injury,energy:PBYID[id]?.energy,
    injuryRecord:!!G.season.inj[id],conditionRecord:!!G.season.cond[id]})
`,{injury:0,energy:1,injuryRecord:false,conditionRecord:false});

check('奢侈税分红总额等于税池，分红差最多一万',`
  newSeason(2026); settleTax();
  const fees=Object.values(G.season.fin), shares=fees.filter(x=>!x.tax).map(x=>x.share);
  const pool=fees.reduce((a,f)=>a+f.tax,0);
  ({distributed:shares.reduce((sum,x)=>sum+x,0)===pool, positive:pool>0, fair:Math.max(...shares)-Math.min(...shares)<=1})
`,{distributed:true,positive:true,fair:true});

const old=new Map(Object.entries(JSON.parse(fs.readFileSync(path.join(root,'fix_20261004','legacy-save.json'),'utf8'))));
const legacy=context(old), original=[...old];
legacy.run('load();');
assert.deepEqual([...old],original);
assert.equal(legacy.run('validSaveSnapshot({v:1,keys:Object.fromEntries(SAVE_KEYS.map(k=>[k,localStorage.getItem(k)]))})'),true);
console.log('PASS 三键老存档保持原字节并可正常导入');

async function cacheScope(){
  const events={}, deleted=[], claimed=[];
  vm.runInNewContext(fs.readFileSync(path.join(root,'../sw.js'),'utf8'),{
    self:{addEventListener:(name,fn)=>{ events[name]=fn; },clients:{claim:()=>claimed.push(true)}},
    caches:{keys:async()=>['bbm-v11-audit','bbm-v12-legend-drafts','bbm-v13-2003-draft','bbm-v14-theme','bbm-v15-2003-draft','bbm-v16-list-layout','other-game-v3'],
      delete:async key=>deleted.push(key)}
  });
  let complete;
  events.activate({waitUntil:p=>{ complete=p; }});
  await complete;
  assert.deepEqual(deleted,['bbm-v11-audit','bbm-v12-legend-drafts','bbm-v13-2003-draft','bbm-v14-theme','bbm-v15-2003-draft']);
  assert.equal(claimed.length,1);
  console.log('PASS 篮球经理更新只清理自己的旧缓存');
}
cacheScope().catch(error=>{ console.error(error); process.exitCode=1; });
