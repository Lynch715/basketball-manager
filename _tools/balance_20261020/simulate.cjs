// node _tools/balance_20261020/simulate.cjs [修改前 engine.js 路径]
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const {teamsFor,clone}=require('./support.cjs');
function league(E){
  const {teams}=teamsFor(E),wins=teams.map(()=>0);let games=0,home=0,ot=0,margin=0,blow30=0,unfinished=0;
  const stats=Object.fromEntries(['pts','fgm','fga','tpm','tpa','ftm','fta','oreb','dreb','ast','tov','stl','blk','pf','min'].map(k=>[k,0]));
  for(let rep=0;rep<4;rep++)for(let h=0;h<30;h++)for(let a=0;a<30;a++)if(h!==a){
    const M=E.run(E.createMatch(teams[h],teams[a],{seed:17+rep*100000+h*1000+a*7}));
    games++;home+=M.score[0]>M.score[1];wins[M.score[0]>M.score[1]?h:a]++;ot+=!!M.ot;unfinished+=!M.done;
    margin+=Math.abs(M.score[0]-M.score[1]);blow30+=Math.abs(M.score[0]-M.score[1])>=30;
    for(const T of M.teams){assert(Math.abs(T.men.reduce((s,m)=>s+m.pts,0)-M.score[T.side])<1e-6);for(const m of T.men){for(const k in stats)stats[k]+=k==='min'?m.secs/60:m[k];}}
  }
  assert.equal(unfinished,0);
  const mean=k=>stats[k]/(games*2),poss=mean('fga')+.44*mean('fta')-mean('oreb')+mean('tov');
  return {games,home:home/games,ot:ot/games,margin:margin/games,blow30:blow30/games,pts:mean('pts'),poss,efficiency:mean('pts')/poss*100,fg:stats.fgm/stats.fga,three:stats.tpm/stats.tpa,twos:(stats.fgm-stats.tpm)/(stats.fga-stats.tpa),ft:stats.ftm/stats.fta,orebRate:stats.oreb/(stats.oreb+stats.dreb),...Object.fromEntries(['fga','tpa','fta','ast','tov','stl','blk','pf','min'].map(k=>[k,mean(k)])),standings:teams.map((t,i)=>({team:t.abbr,equiv82:82*wins[i]/232})).sort((a,b)=>b.equiv82-a.equiv82)};
}
const out={};
if(process.argv[2]){out.before=league(require(path.resolve(process.argv[2])));console.log('before',JSON.stringify(out.before));}
const E=require('../engine.js');out.after=league(E);console.log('after',JSON.stringify(out.after));
const {teams,keys,D}=teamsFor(E),base=clone(teams.find(t=>t.abbr==='CHI'));base.injMul=1e-20;base.tactics={...base.tactics,system:'bal',stars:[]};
function duel(changed,n=1200){let wins=0,margin=0;for(let j=0;j<n;j++){const home=j%2===0,M=E.run(E.createMatch(home?changed:base,home?base:changed,{seed:12345+j*13,neutral:true}));assert(M.done);const d=(M.score[0]-M.score[1])*(home?1:-1);wins+=d>0;margin+=d;}return {games:n,win:wins/n,margin:margin/n};}
out.strength=[0,5,10].map(boost=>{const t=clone(base);for(const p of t.players){for(const k of keys)p.a[k]=Math.min(99,p.a[k]+boost);p.ovr=E.ovrOf(p,D.OVR_W,D.OVR_STRETCH,keys);}return {boost,...duel(t)};});
console.log('strength',JSON.stringify(out.strength));
out.fatigue=[20,50,80,100].map(cond=>{const t=clone(base);t.players.forEach(p=>p.energy=cond/100);return {cond,...duel(t)};});
console.log('fatigue',JSON.stringify(out.fatigue));
assert(out.strength[1].win>out.strength[0].win+.1);assert(out.strength[2].win>out.strength[1].win+.05);
assert(out.fatigue[0].win<out.fatigue[3].win-.05);assert(out.fatigue[1].win<out.fatigue[3].win-.02);
out.ranges={pts:[111,120],poss:[98,106],efficiency:[110,117],fga:[86,92],fg:[.455,.485],tpa:[34,40],three:[.35,.37],twos:[.535,.565],fta:[21,26],ft:[.76,.80],orebRate:[.24,.28],ast:[24,29],tov:[12.5,15],stl:[7.5,9.5],blk:[4.2,5.5],pf:[18,22],min:[240,242.5],home:[.54,.58],ot:[.05,.07]};
out.outsideRanges=Object.entries(out.ranges).filter(([k,[lo,hi]])=>out.after[k]<lo||out.after[k]>hi).map(([k])=>k);
fs.writeFileSync(path.join(__dirname,'simulation-results.json'),JSON.stringify(out,null,2)+'\n');
console.log('outsideRanges',JSON.stringify(out.outsideRanges));
