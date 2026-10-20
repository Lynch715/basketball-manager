const assert=require('assert/strict'),fs=require('fs'),path=require('path');
const {root,teamsFor,instrumentedEngine,appContext,clone}=require('./support.cjs');
const E=instrumentedEngine(),{teams}=teamsFor(E),evidence=[];
function test(name,fn){const detail=fn();evidence.push({name,detail});console.log('PASS',name);}
function match(){const M=E.createMatch(teams[0],teams[1],{seed:17,record:true});M.teams.forEach(E.refresh);return M;}
function draws(M,values){let i=0;M.rng=()=>{assert(i<values.length,'意外消耗随机数 '+i);return values[i++];};return ()=>i;}
const rebEvents=M=>M.events.filter(e=>['oreb','dreb'].includes(e.type));
for(const side of [0,1])for(const outcomes of [[false,true],[true,false],[false,false],[true,true],[false,false,true],[true,true,false],[true],[false]]){
  test(`第 ${side+1} 方 ${outcomes.map(x=>x?'中':'失').join('')} 按最后一罚结算`,()=>{
    const M=match(),O=M.teams[side],D=M.teams[1-side],last=outcomes.at(-1);
    draws(M,[...outcomes.map(x=>x?0:.999),...(!last?[.999,.5]:[])]);
    E.finishFT(M,O,D,O.on[0],outcomes.length,10,'rim');
    assert.equal(M.score[side],outcomes.filter(Boolean).length);
    assert.equal(O.on[0].fta,outcomes.length);assert.equal(O.on[0].ftm,outcomes.filter(Boolean).length);
    assert.equal(rebEvents(M).length,last?0:1);assert.equal(M.last,last?'made':'dreb');assert(!M.keep);
    return {score:M.score,last:M.last};
  });
}
test('最后一罚不中允许进攻篮板续攻',()=>{const M=match(),O=M.teams[0],D=M.teams[1];draws(M,[0,.999,0,.5,.999]);E.finishFT(M,O,D,O.on[0],2,10,'rim');assert.equal(M.last,'oreb');assert(M.keep);assert.equal(rebEvents(M).length,1);});
test('投篮犯规两罚先失后中不产生篮板',()=>{const M=match();draws(M,[.999,.5,.5,.999,0,.999,.999,.999,0]);E.takeShot(M,...M.teams,0,0,'rim',10);assert.equal(M.events.find(e=>e.type==='ft').made,1);assert.equal(rebEvents(M).length,0);assert.equal(M.last,'made');assert.equal(M.teams[0].on[0].fga,0);});
test('投篮犯规两罚先中后失正常防守篮板',()=>{const M=match();draws(M,[.999,.5,.5,.999,0,.999,.999,0,.999,.999,.5]);E.takeShot(M,...M.teams,0,0,'rim',10);assert.equal(rebEvents(M).length,1);assert.equal(M.last,'dreb');});
for(const made of [true,false])test(`加罚${made?'命中':'不中'}的球权`,()=>{const M=match();draws(M,[.999,.5,.5,.999,.999,0,0,made?0:.999,...(!made?[.999,.5]:[])]);E.takeShot(M,...M.teams,0,0,'rim',10);assert.equal(M.events.find(e=>e.type==='ft').n,1);assert.equal(M.score[0],made?3:2);assert.equal(M.last,made?'made':'dreb');assert.equal(M.teams[0].on[0].fga,1);});
for(const last of [true,false])test(`故意犯规最后一罚${last?'中':'失'}`,()=>{const M=match();M.poss=0;M.q=4;M.clock=20;M.score=[2,0];M.last='nsfoul';draws(M,[.5,.5,.5,.999,last?0:.999,...(!last?[.999,.5]:[])]);E.possession(M);assert(M.events.some(e=>e.type==='ifoul'));assert.equal(M.last,last?'made':'dreb');});
for(const last of [true,false])test(`犯满罚球最后一罚${last?'中':'失'}`,()=>{const M=match();M.poss=0;M.last='nsfoul';M.teamFouls[1]=4;draws(M,[.5,.999,0,.5,.5,.999,last?0:.999,...(!last?[.999,.5]:[])]);E.possession(M);assert.equal(M.events.find(e=>e.type==='ft').n,2);assert.equal(M.last,last?'made':'dreb');});
test('低体能完整传入赛前状态与比赛，不再被抬到80%',()=>{
  const c=appContext();const rows=c.run(`newSeason(2026);[20,50,80,100].map(cond=>{const p=TEAMS[0].players[0];G.season.cond[p.id]=cond;applyPlayerState();const M=E.createMatch(sideFor(0),sideFor(1),{seed:19});return {cond,state:p.energy,match:M.teams[0].byId[p.id].energy};})`);
  assert.deepEqual(clone(rows),[20,50,80,100].map(cond=>({cond,state:cond/100,match:cond/100})));return clone(rows);
});
test('旧存档缺少体能记录时按满体能加载，原始JSON不被改写',()=>{
  const storage=new Map(Object.entries(JSON.parse(fs.readFileSync(path.join(root,'fix_20261004/legacy-save.json'),'utf8')))),before=JSON.stringify([...storage]);
  const c=appContext(storage);c.run('load();');const r=c.run(`const p=TEAMS[0].players[0];delete G.season.cond[p.id];applyPlayerState();({energy:p.energy,year:G.season.year,starters:G.rot.starters.length})`);
  assert.equal(r.energy,1);assert.equal(r.year,2026);assert.equal(r.starters,5);assert.equal(JSON.stringify([...storage]),before);return clone(r);
});
test('比分补偿减半且不会随大比分无限增长',()=>{
  function chance(lead,draw){const M=match();M.score=[Math.max(0,lead),Math.max(0,-lead)];M.teams[0].eff[0].drawFoul=0;draws(M,[.999,.5,.5,.999,.999,draw,.999,.999,.5]);E.takeShot(M,...M.teams,0,0,'rim',10);return M.teams[0].on[0].fgm;}
  function cutoff(lead){let lo=0,hi=.9;for(let j=0;j<14;j++){const mid=(lo+hi)/2;if(chance(lead,mid))lo=mid;else hi=mid;}return (lo+hi)/2;}
  const even=cutoff(0),ahead=cutoff(13),behind=cutoff(-13),cap=cutoff(100),cap2=cutoff(200);
  assert(Math.abs(even-ahead-.015)<.0001);assert(Math.abs(behind-even-.015)<.0001);assert(Math.abs(even-cap-.03)<.0001);assert(Math.abs(cap-cap2)<.0001);return {even,ahead,behind,cap};
});
fs.writeFileSync(path.join(__dirname,'regression-results.json'),JSON.stringify({passed:evidence.length,evidence},null,2)+'\n');
console.log(evidence.length+' 项胜负逻辑回归通过');
