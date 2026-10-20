const assert=require('assert/strict'),fs=require('fs'),path=require('path');
const {appContext,clone}=require('./support.cjs');
const evidence=[];
for(const seed of [7,41]){
  const c=appContext(undefined,seed);c.run(`newSeason(2026);G.season.seed=${seed};save();`);
  let days=0;while(c.run("G.season.phase!=='done'")&&days++<400)c.run('playDay();');
  const r=clone(c.run(`({seed:G.season.seed,phase:G.season.phase,day:G.season.day,games:G.season.games.filter(g=>g[3]!=null).length,invalidScores:G.season.games.filter(g=>g[3]!=null&&(!Number.isFinite(g[3])||!Number.isFinite(g[4])||g[3]===g[4])).length,champion:G.season.champion,fmvp:G.season.fmvp,condRange:[Math.min(...Object.values(G.season.cond)),Math.max(...Object.values(G.season.cond))],psFinite:Object.values(G.season.ps).every(p=>Object.values(p).every(v=>typeof v!=='number'||Number.isFinite(v)))})`));
  assert.equal(r.phase,'done');assert.equal(r.games,1230);assert.equal(r.invalidScores,0);assert(r.fmvp!=null);assert(r.champion!=null);assert(r.psFinite);assert(r.condRange[0]>=20&&r.condRange[1]<=100);
  c.run('save();saveSeason();');const saved=[...c.storage];c.run('load();');assert.deepEqual([...c.storage],saved);assert.equal(c.run('G.season.phase'),'done');
  evidence.push(r);console.log(JSON.stringify(r));
}
fs.writeFileSync(path.join(__dirname,'season-results.json'),JSON.stringify(evidence,null,2)+'\n');
