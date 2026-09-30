/* 《篮球经理》比赛引擎 —— 纯函数，不碰 DOM，浏览器和 Node 都能跑。
   规范见《引擎规范.md》v0.2。参数集中在 P 里，校准只改 P。 */
(function(root){
"use strict";

// ================= 可调参数 =================
const P = {
  possSec: 14.1,            // 平均回合时长（秒）
  tovBase: 0.124, stlShare: 0.61,
  nsFoulBase: 0.085,        // 非投篮犯规 / 回合
  usageExp: 3.0,
  t3: 1.2, rimW: 1.0, postW: 1.0, midW: 0.55,
  base: {rim:.595, post:.435, mid:.385, three:.33, putback:.56, fast:.68, heave:.04},
  kOff: {rim:.40, post:.35, mid:.35, three:.35, putback:.30, fast:.20, heave:0},
  kDef: {rim:.25, post:.25, mid:.18, three:.12, putback:.15, fast:0, heave:0},
  blk: {rim:.105, post:.08, mid:.037, three:.012, putback:.085, fast:.05, heave:.005},
  sFoul: {rim:.23, post:.19, mid:.06, three:.021, putback:.18, fast:.24, heave:.003},
  andOne: {rim:.25, post:.18, mid:.10, three:.05, putback:.22, fast:.3, heave:0},
  ast: {rim:.62, post:.35, mid:.50, three:.84, putback:0, fast:.5, heave:0},
  astBonus: .03, homeMake: .013, synK: .025, fitK: .025,
  orebBase: .30, putbackProb: .30,
  fastBase: .10,
  drain: .0038, recover: .012, qBreak: .10, toRecover: .03,
  subEnergy: .55, injury: .00012,
  durK: 1.13,
  gamePaceSD: .05,         // 每场双方共用的节奏波动
  rubber: .003, rubberFrom: 3, rubberCap: .06,     // 比分效应：领先超过 3 分后，每多 1 分，领先方命中率 −0.3%，最多 −6%
};
// 联盟基准（各合成能力在轮换球员里的均值）。setCenters 按实际数据算，这里是兜底值
let C = {rim:.7,post:.6,mid:.7,three:.68,handle:.65,passing:.62,drawFoul:.7,perDef:.66,intDef:.62,block:.5,blockMax:.7,steal:.6,spd:.65,oreb:.5,dreb:.6,hand3:.72};
function setCenters(teams){
  const ps=[]; teams.forEach(t=>t.players.slice().sort((a,b)=>b.ovr-a.ovr).slice(0,9).forEach(p=>ps.push(composite(p))));
  const m=k=>ps.reduce((s,c)=>s+c[k],0)/ps.length; const out={};
  ['rim','post','mid','three','handle','passing','drawFoul','perDef','intDef','block','steal','spd','oreb','dreb'].forEach(k=>out[k]=m(k));
  out.blockMax=teams.reduce((s,t)=>s+Math.max(...t.players.slice().sort((a,b)=>b.ovr-a.ovr).slice(0,5).map(p=>composite(p).block)),0)/teams.length;
  out.hand3=teams.reduce((s,t)=>{const v=t.players.slice().sort((a,b)=>b.ovr-a.ovr).slice(0,5).map(p=>{const c=composite(p);return (c.handle+c.passing)/2;}).sort((a,b)=>b-a).slice(0,3);return s+v.reduce((a,b)=>a+b,0)/3;},0)/teams.length;
  C=out;
  out.sys={};
  const tops=teams.map(t=>t.players.slice().sort((a,b)=>b.ovr-a.ovr).slice(0,5).map(p=>Object.assign(composite(p),{oiqRaw:p.a.oiq/100})));
  ['pnr','iso','post','motion','spread'].forEach(k=>{ const v=tops.map(cs=>sysRaw(k,cs)); const m=v.reduce((a,b)=>a+b,0)/v.length;
    out.sys[k]={m, sd:Math.sqrt(v.reduce((a,b)=>a+(b-m)**2,0)/v.length)||.05}; });
  return out;
}

const POS = ['PG','SG','SF','PF','C'];
const POS_I = {PG:0,SG:1,SF:2,PF:3,C:4};
const SYSTEMS = {
  bal:   {name:'均衡', w:{}, exp:6,   ast:1,    tov:1},
  pnr:   {name:'挡拆', w:{rim:1.25, mid:1.15}, exp:6, ast:1.08, tov:1.02},
  iso:   {name:'孤立', w:{mid:1.3, rim:1.1, three:.9}, exp:8, ast:.8, tov:.92},
  post:  {name:'背身', w:{post:2.2, three:1.05}, exp:6.5, ast:.9, tov:1.03},
  motion:{name:'传切', w:{rim:1.2, three:1.05}, exp:4.5, ast:1.15, tov:1.06},
  spread:{name:'五外', w:{three:1.35, rim:1.1, post:.4, mid:.7}, exp:5.5, ast:1.05, tov:1},
};
const PACE = {slow:1.12, mid:1, fast:.88};

// ================= 工具 =================
const clamp=(x,a,b)=>x<a?a:x>b?b:x;
function pickW(rng, arr, wf){ let s=0; const w=arr.map(x=>{const v=Math.max(0,wf(x)); s+=v; return v;});
  if(s<=0) return arr[Math.floor(rng()*arr.length)]; let r=rng()*s; for(let i=0;i<arr.length;i++){ r-=w[i]; if(r<=0) return arr[i]; } return arr[arr.length-1]; }
function mulberry32(a){ return function(){ a|=0; a=a+0x6D2B79F5|0; let t=Math.imul(a^a>>>15,1|a); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; }

function posFit(p, slot){
  if(p.pos===slot) return 1;
  if((p.pos2||[]).includes(slot)) return .9;
  const d=Math.abs(POS_I[p.pos]-POS_I[slot]);
  return d===1? .75 : .5;
}
const fitMul = f => .85 + .15*f;

// 总评：位置线性权重 + 三次拉伸（数据来自 real_data.js 的 OVR_W / OVR_STRETCH）
function ovrOf(p, OVR_W, OVR_STRETCH, KEYS){
  const [b,w]=OVR_W[p.pos]; let x=b; KEYS.forEach((k,i)=>x+=w[i]*p.a[k]);
  const f=v=>OVR_STRETCH.reduce((y,c)=>y*v+c,0);
  // 三次拉伸只在真实球员的区间里拟合过，低于 66 以后曲线会往回翘，改成直线外推
  const y = x>=66? f(x) : f(66)+(x-66)*0.8;
  return clamp(Math.round(y),25,99);
}

// ================= 合成能力 =================
function composite(p){
  const a=k=>p.a[k]/100;
  const H=clamp((p.ht-185)/40,0,1), W=clamp((p.ws-p.ht+5)/20,0,1);
  const reb=(k)=>.55*a(k)+.15*H+.10*a('jmp')+.10*a('str')+.10*a('hustle');
  const c={
    rim: .45*a('finish')+.20*a('dunk')+.10*a('jmp')+.10*a('str')+.15*H,
    post:.50*a('post')+.20*a('str')+.15*H+.15*a('oiq'),
    mid: .75*a('mid')+.25*a('oiq'),
    three:.80*a('three')+.20*a('oiq'),
    ft: a('ft'),
    handle:.70*a('handle')+.30*a('spd'),
    passing:.70*a('pass')+.30*a('oiq'),
    drawFoul:.55*a('finish')+.20*a('str')+.15*a('oiq')+.10*a('spd'),
    perDef:.55*a('perD')+.20*a('spd')+.15*a('diq')+.10*W,
    intDef:.50*a('intD')+.15*a('str')+.15*H+.20*a('diq'),
    block:.55*a('blk')+.15*a('jmp')+.15*H+.15*W,
    steal:.70*a('stl')+.30*a('diq'),
    oreb:reb('oreb'), dreb:reb('dreb'),
    spd:a('spd'), sta:a('sta'), H,
  };
  c.usage=.25*c.rim+.15*c.mid+.25*c.three+.10*c.post+.15*c.handle+.10*a('oiq');
  return c;
}

// ================= AI 默认设置 =================
function perms(a){ if(a.length<=1) return [a]; const out=[]; a.forEach((x,i)=>perms(a.slice(0,i).concat(a.slice(i+1))).forEach(r=>out.push([x].concat(r)))); return out; }
const PERM5 = perms([0,1,2,3,4]);
function combos(arr,k,start=0,cur=[],out=[]){ if(cur.length===k){out.push(cur.slice());return out;} for(let i=start;i<arr.length;i++){cur.push(arr[i]);combos(arr,k,i+1,cur,out);cur.pop();} return out; }

function autoRotation(team){
  const avail=team.players.filter(p=>!(p.injury>0));
  const byOvr=avail.slice().sort((x,y)=>y.ovr-x.ovr);
  const pool=byOvr.slice(0,8);
  let best=null, bestS=-1e9;
  for(const set of combos(pool,5)){
    for(const pm of PERM5){
      let s=0; for(let i=0;i<5;i++){ const pl=set[pm[i]]; s+=pl.ovr-(1-posFit(pl,POS[i]))*22; }
      if(s>bestS){bestS=s; best=pm.map(j=>set[j]);}
    }
  }
  const starters=best.map(p=>p.id);
  const bench=byOvr.filter(p=>!starters.includes(p.id));
  const minutes={}; const sMin=[36,34,32,30,28];
  best.slice().sort((x,y)=>y.ovr-x.ovr).forEach((p,i)=>minutes[p.id]=sMin[i]);
  const bMin=[26,22,18,10,4];
  bench.forEach((p,i)=>minutes[p.id]=bMin[i]||0);
  // 合计补到 240
  let tot=Object.values(minutes).reduce((a,b)=>a+b,0), ids=[...starters, ...bench.map(p=>p.id)], i=0;
  while(tot!==240 && i<200){ const id=ids[i%7]; const d=tot<240?1:-1; if(minutes[id]+d>=0 && minutes[id]+d<=40){minutes[id]+=d; tot+=d;} i++; }
  team.players.forEach(p=>{ if(minutes[p.id]==null) minutes[p.id]=0; });
  return {starters, order:bench.map(p=>p.id), minutes};
}

// 体系契合度：先算原始分，再和联盟各队首发五人的分布比较（setCenters 里统计均值和标准差）
function sysRaw(sys, comps){
  const n3=comps.filter(c=>c.three>=C.three+.04).length;
  const avg=k=>comps.reduce((s,c)=>s+c[k],0)/comps.length;
  switch(sys){
    case 'pnr': return Math.max(...comps.map(c=>(c.handle+c.passing)/2)) + Math.max(...comps.map(c=>(c.rim+c.H)/2));
    case 'iso': { const u=comps.map(c=>c.usage).sort((x,y)=>y-x); return u[0]+.5*(u[0]-u[1]); }
    case 'post': return Math.max(...comps.map(c=>c.post)) + .03*Math.min(n3,3);
    case 'motion': return comps.reduce((s,c)=>s+(c.passing+c.oiqRaw)/2,0)/comps.length;
    case 'spread': return avg('three') + .02*n3;
    default: return 0;
  }
}
function systemFit(sys, comps){
  if(sys==='bal' || !C.sys || !C.sys[sys]) return .5;
  const r=sysRaw(sys,comps), st=C.sys[sys];
  return clamp(.5+(r-st.m)/(2.5*st.sd),0,1);
}

function autoTactics(team, rot){
  const st=rot.starters.map(id=>team.players.find(p=>p.id===id));
  const comps=st.map(p=>Object.assign(composite(p),{oiqRaw:p.a.oiq/100}));
  let bestSys='bal', bestF=.25;   // 所有体系都不比联盟平均高 0.25 个标准差，就打均衡
  for(const s of ['pnr','iso','post','motion','spread']){ const st=C.sys&&C.sys[s]; const z=st?(sysRaw(s,comps)-st.m)/st.sd:0; if(z>bestF){bestF=z; bestSys=s;} }
  const stars=st.slice().sort((x,y)=>y.ovr-x.ovr).slice(0,1).map(p=>p.id);
  return {pace:'mid', system:bestSys, focus:'bal', stars, defense:'man', reb:'bal', matchups:{}, pnrD:'std', double:null, smallOn:false};
}

// ================= 比赛 =================
function createMatch(home, away, opts){
  opts=opts||{};
  const rng = opts.rng || mulberry32((opts.seed>>>0) || (Math.random()*4294967296)>>>0);
  const M={ rng, record:!!opts.record, neutral:!!opts.neutral,
    q:1, clock:720, done:false, ot:0, score:[0,0], qScore:[[],[]],
    poss: rng()<.5?0:1, first:null, teams:[], events:[],
    timeouts:[7,7], teamFouls:[0,0], last:null, run:[0,0], lastScorer:-1,
    lead:{max:[0,0], changes:0, prevSign:0}, tip:null };
  { let z=0; for(let k=0;k<6;k++) z+=rng(); M.pace=1+(z-3)*Math.sqrt(2)*P.gamePaceSD; }
  M.first=M.poss;
  [home,away].forEach((tm,side)=>{
    const rot=tm.rotation||autoRotation(tm);
    const tac=Object.assign({pace:'mid',system:'bal',focus:'bal',stars:[],defense:'man',reb:'bal',matchups:{},pnrD:'std',double:null,smallOn:false}, tm.tactics||autoTactics(tm,rot));
    if(tac.defense==='zone') tac.defense='zone23';
    const men=tm.players.map(p=>({ id:p.id, p, c:composite(p), oiq:p.a.oiq/100, energy:clamp(p.energy!=null?p.energy:1,.5,1), mul:p.formMul||1,
      target:(rot.minutes[p.id]||0)*60, secs:0, slot:null, out:!!(p.injury>0), inj:false,
      pts:0,fgm:0,fga:0,tpm:0,tpa:0,ftm:0,fta:0,oreb:0,dreb:0,ast:0,stl:0,blk:0,tov:0,pf:0,pm:0,
      starter:rot.starters.includes(p.id) }));
    const byId={}; men.forEach(m=>byId[m.id]=m);
    const on=rot.starters.map((id,i)=>{ const m=byId[id]; m.slot=POS[i]; return m; });
    M.teams.push({ tm, side, men, byId, on, rot, tac, order:rot.order,
      home: side===0 && !M.neutral, chemAdj:clamp(tm.chemAdj||0,-.01,.01), injMul:tm.injMul||1, allStar:!!tm.allStar, dirty:true, eff:null, syn:{off:.5,def:.5,reb:.5}, fit:.5,
      st:{pts:0, fast:0, paint:0, second:0, offTov:0, bench:0} });
  });
  return M;
}

function refresh(T){
  // 场上五人的有效合成能力：体能 × 位置适配
  T.eff = T.on.map(m=>{ const f=(0.80+0.20*m.energy)*fitMul(posFit(m.p,m.slot))*m.mul; const c={}; for(const k in m.c) c[k]=(k==='H'?m.c[k]:m.c[k]*f); c.oiqRaw=m.oiq; return c; });
  if(T.dirty){
    const E=T.eff, sig=(x,k,x0)=>1/(1+Math.exp(-k*(x-x0)));
    const n3=E.filter(c=>c.three>=.72).length;
    const off=( 3*sig(n3,3,2) + (Math.max(...E.map(c=>c.handle))>=.75?1:0) + (Math.max(...E.map(c=>c.passing))>=.75?1:0) + (Math.max(...E.map(c=>c.rim))>=.75?1:0) )/6;
    const perim=E.filter(c=>c.perDef>=.72).length;
    const def=( 2*(Math.max(...E.map(c=>c.intDef))>=.75?1:0) + sig(perim,2,1.5)*2 + clamp((E.reduce((s,c)=>s+c.perDef+c.intDef,0)/10-.5)/.2,0,1) )/5;
    const reb=sig(E.filter(c=>Math.max(c.oreb,c.dreb)>=.7).length,2,1.5);
    T.syn={off,def,reb};
    T.fit=systemFit(T.tac.system, E);
    T.dirty=false;
  }
}

function defenderOf(D, offMan, O){
  // 显式重点盯防优先，否则按位置
  const mu=D.tac.matchups||{};
  for(const did in mu){ if(mu[did]===offMan.id){ const d=D.on.find(m=>m.id==did); if(d) return D.on.indexOf(d); } }
  let bi=0, bd=9;
  D.on.forEach((m,i)=>{ const d=Math.abs(POS_I[m.slot]-POS_I[offMan.slot]); if(d<bd){bd=d; bi=i;} });
  return bi;
}

function ev(M, o){ if(M.record){ o.q=M.q; o.clock=Math.round(M.clock*10)/10; o.score=M.score.slice(); M.events.push(o);} }

function addPts(M, side, man, pts){
  M.score[side]+=pts; const T=M.teams[side], D=M.teams[1-side];
  man.pts+=pts; T.st.pts+=pts; if(!man.starter) T.st.bench+=pts;
  T.on.forEach(m=>m.pm+=pts); D.on.forEach(m=>m.pm-=pts);
  if(M.lastScorer===side) M.run[side]+=pts; else { M.run[side]=pts; M.run[1-side]=0; M.lastScorer=side; }
  const diff=M.score[0]-M.score[1], sg=Math.sign(diff);
  if(sg!==0 && M.lead.prevSign!==0 && sg!==M.lead.prevSign) M.lead.changes++;
  if(sg!==0) M.lead.prevSign=sg;
  if(diff>M.lead.max[0]) M.lead.max[0]=diff; if(-diff>M.lead.max[1]) M.lead.max[1]=-diff;
}

function shotXY(rng, type){
  // 半场坐标（英尺）：篮筐在 (0,0)，x 左右 -25..25，y 向中场 0..47
  let r, ang=(rng()*2-1)*Math.PI*.5;
  if(type==='three'){ r=23.9+rng()*4; if(Math.abs(ang)>1.2){ return {x:Math.sign(ang)*(22+rng()*1.5), y:rng()*8}; } }
  else if(type==='mid') r=10+rng()*12;
  else if(type==='post') r=4+rng()*8;
  else r=rng()*4;
  return {x:+clamp(Math.sin(ang)*r,-23.5,23.5).toFixed(1), y:+(Math.max(0,Math.cos(ang)*r)).toFixed(1)};
}

function doFT(M, side, man, n){
  let made=0;
  for(let i=0;i<n;i++){ man.fta++; if(M.rng()<.35+.55*man.c.ft){ man.ftm++; made++; addPts(M,side,man,1);} }
  ev(M,{t:side,type:'ft',pid:man.id,n,made});
  return made;
}

function foulOn(M, D, dIdx, side){
  const dm=D.on[dIdx]; dm.pf++; M.teamFouls[1-side]++;
  if(dm.pf>=6){ dm.out=true; dm.fouledOut=true; ev(M,{t:1-side,type:'foulout',pid:dm.id}); }
  return dm;
}

// 单个回合。返回用掉的秒数
function possession(M){
  const rng=M.rng, side=M.poss, O=M.teams[side], D=M.teams[1-side];
  refresh(O); refresh(D);
  const sys=SYSTEMS[O.tac.system]||SYSTEMS.bal;
  const late = M.q>=4 && M.clock<=60;
  const diffO = M.score[side]-M.score[1-side];
  let dur;
  const paceF = PACE[O.tac.pace]||1;
  const shortStart = M.last==='oreb' || M.last==='nsfoul';
  dur = (shortStart ? 4+rng()*6 : clamp(24*betaLike(rng)*paceF, 4, 24))*P.durK*M.pace;

  // 故意犯规：防守方落后 1–6 分
  if(late && diffO>=1 && diffO<=6 && M.clock>1.5 && M.clock<=(diffO<=3?24:60)){
    const worst=O.on.reduce((a,b)=>a.c.ft<b.c.ft?a:b); const dIdx=Math.floor(rng()*5);
    foulOn(M,D,dIdx,side); ev(M,{t:1-side,type:'ifoul',pid:D.on[dIdx].id,on:worst.id});
    doFT(M,side,worst,2); M.last='made'; return 1+rng()*2.5;
  }
  // 末节领先方拖时间（24 秒内领先，对方来不及了）
  if(M.q>=4 && M.clock<=24 && diffO>0){ M.last='runout'; return M.clock; }
  // 末节最后 2 分钟：落后方抢时间，领先方用满进攻时间
  if(M.q>=4 && M.clock<=120 && !shortStart){
    if(diffO<0 && (-diffO>=4 || (M.clock<=45 && M.clock>24))) dur=Math.min(dur, 4+rng()*5);
    else if(diffO>0) dur=Math.max(dur, 18+rng()*5.5);
  }
  // 每节最后一攻：一定出手，出手时间留 1–4 秒
  if(M.clock<=24 || dur>=M.clock){
    const hurry = M.q>=4 && diffO<=-4;
    if(M.clock<=2.5) dur=M.clock;                                   // 只剩一两秒：直接出手，打完这节
    else if(hurry) dur=Math.min(dur, M.clock-.5);
    else dur=Math.max(.5, M.clock-rng()*2.2);                        // 最后一攻，出手后最多剩 2 秒
  }
  const Eo=O.eff, Ed=D.eff;
  const avg=(E,k)=>E.reduce((s,c)=>s+c[k],0)/E.length;

  // 快攻
  if((M.last==='stl'||M.last==='dreb') && M.lastPoss===side){
    let pf=P.fastBase*(O.tac.pace==='fast'?1.5:O.tac.pace==='slow'?.7:1)*(D.tac.reb==='crash'?1.4:D.tac.reb==='back'?.7:1)
      *(M.last==='stl'?2:1)*Math.pow(avg(Eo,'spd')/C.spd,2)*(D.tac.defense==='press'?1.2:1);
    if(rng()<pf){ const i=O.on.indexOf(pickW(rng,O.on,m=>Math.pow(m.c.spd*m.c.rim,2)*m.energy));
      return shoot(M,O,D,i,'fast',3+rng()*4); }
  }

  // 包夹：挡拆防守选「包夹」，或者指定了重点包夹对象
  M.dblId=null;
  { const dbl=D.tac.double && O.on.find(m=>m.id===D.tac.double);
    if(dbl && rng()<.5) M.dblId=dbl.id;
    else if(D.tac.pnrD==='blitz' && rng()<(O.tac.system==='pnr'?.45:.2)){ const h=O.on.reduce((a,b)=>a.c.handle+a.c.usage>b.c.handle+b.c.usage?a:b); M.dblId=h.id; } }
  // 失误
  const handlers=(Eo.map(c=>(c.handle+c.passing)/2).sort((a,b)=>b-a).slice(0,3).reduce((a,b)=>a+b,0))/3;
  let pTov=P.tovBase*Math.pow(avg(Ed,'steal')/C.steal,.6)*Math.pow(C.hand3/Math.max(.3,handlers),.8)*sys.tov
    *(D.tac.defense==='press'?1.15:1)*(O.tac.pace==='fast'?1.05:1)*(D.tac.defense==='zone131'?1.08:1)
    *(M.dblId?1.2:1)*(D.tac.pnrD==='hedge'&&O.tac.system==='pnr'?1.08:1);
  if(rng()<pTov){
    const i=O.on.indexOf(pickW(rng,O.on,m=>(1.15-m.c.handle)*Math.pow(m.c.usage,3)*(O.tac.stars.includes(m.id)?1.25:1)*(m.id===M.dblId?1.5:1)));
    const tm=O.on[i]; tm.tov++;
    if(rng()<P.stlShare){ const s=pickW(rng,D.on,m=>Math.pow(m.c.steal,2)); s.stl++; M.last='stl'; ev(M,{t:side,type:'stl',pid:tm.id,by:s.id}); }
    else { M.last='tov'; ev(M,{t:side,type:'tov',pid:tm.id}); }
    return M.clock<=2.5? dur : dur*.7;
  }

  // 非投篮犯规
  if(rng()<P.nsFoulBase*(D.tac.defense==='press'?1.45:1)*(D.home?0.97:1)){
    const dIdx=Math.floor(rng()*5); const dm=foulOn(M,D,dIdx,side);
    ev(M,{t:1-side,type:'pf',pid:dm.id});
    if(M.teamFouls[1-side]>=5){ const tgt=pickW(rng,O.on,m=>m.c.usage); doFT(M,side,tgt,2); M.last='ft'; return dur*.5; }
    M.last='nsfoul'; M.keep=true; return dur*.4;
  }

  // 选出手人
  const exp=sys.exp*(P.usageExp/6);
  const tend=(O.rot&&O.rot.tend)||{};
  const i=O.on.indexOf(pickW(rng,O.on,m=>Math.pow(m.c.usage,exp)*(O.tac.stars.includes(m.id)?1.15:1)*(.6+.4*m.energy)*(tend[m.id]||1)*(m.id===M.dblId?.5:1)));
  return shoot(M,O,D,i,null,dur);
}

function betaLike(rng){ // Beta(3,2) 近似：取 5 个均匀数里第 3 小
  const a=[rng(),rng(),rng(),rng()]; a.sort(); return a[2]*.8+.2*rng(); }

function shoot(M,O,D,i,forced,dur){
  const rng=M.rng, side=O.side, sh=O.on[i], c=O.eff[i], sys=SYSTEMS[O.tac.system]||SYSTEMS.bal;
  const Ed=D.eff, dIdx=defenderOf(D,sh,O), dc=Ed[dIdx];
  let type=forced;
  if(!type && M.clock<=2.5 && M.last!=='oreb') type='heave';
  const diffO=M.score[side]-M.score[1-side];
  if(!type){
    if(M.q>=4 && M.clock<=40 && diffO<=-3 && diffO>=-10 && rng()<(diffO===-3?.92:.7)) type='three';
    else {
      const fo=O.tac.focus==='three'?[1.3,.75]:O.tac.focus==='inside'?[.75,1.3]:[1,1];
      const zone=D.tac.defense==='zone23';
      const guardSh = sh.slot==='PG'||sh.slot==='SG';
      const drop = D.tac.pnrD==='drop' && (O.tac.system==='pnr'||guardSh);
      const swH = D.tac.pnrD==='switch' && (sh.slot==='PF'||sh.slot==='C');
      const w={
        three: Math.pow(c.three,2.2)*P.t3*fo[0]*(sys.w.three||1)*(zone?1.15:1)*(drop?1.2:1),
        rim:   Math.pow(c.rim,1.6)*(.6+.4*c.handle)*P.rimW*fo[1]*(sys.w.rim||1)*(drop?.85:1),
        post:  Math.pow(c.post,2)*c.H*.5*P.postW*fo[1]*(sys.w.post||1)*(swH?1.15:1),
        mid:   Math.pow(c.mid,1.8)*P.midW*(sys.w.mid||1)*(drop?1.2:1),
      };
      type=pickW(rng,Object.keys(w),k=>w[k]);
    }
  }
  return takeShot(M,O,D,i,dIdx,type,dur);
}

function takeShot(M,O,D,i,dIdx,type,dur){
  const rng=M.rng, side=O.side, sh=O.on[i], c=O.eff[i], Ed=D.eff, dc=Ed[dIdx];
  const three=type==='three'||type==='heave', pts=three?3:2;
  const maxK=k=>Math.max(...Ed.map(e=>e[k]));
  const avgK=k=>Ed.reduce((s,e)=>s+e[k],0)/Ed.length;
  const off={rim:c.rim,post:c.post,mid:c.mid,three:c.three,putback:c.rim,fast:c.rim,heave:0}[type];
  const def={rim:.5*dc.intDef+.5*maxK('intDef'), post:dc.intDef, mid:dc.perDef, three:.6*dc.perDef+.4*avgK('perDef'), putback:maxK('intDef'), fast:.5, heave:.5}[type];
  // 助攻先抽
  const sys=SYSTEMS[O.tac.system]||SYSTEMS.bal;
  const passAvg=O.eff.reduce((s,e)=>s+e.passing,0)/5;
  const assisted = type!=='putback' && rng() < P.ast[type]*Math.pow(passAvg/C.passing,.7)*sys.ast*(M.dblId && sh.id!==M.dblId?1.15:1);
  const oc={rim:C.rim,post:C.post,mid:C.mid,three:C.three,putback:C.rim,fast:C.rim,heave:0}[type], dcn={rim:C.intDef,post:C.intDef,mid:C.perDef,three:C.perDef,putback:C.intDef,fast:.5,heave:.5}[type];
  let p=P.base[type]+P.kOff[type]*(off-oc)-P.kDef[type]*(def-dcn)
    + (assisted?P.astBonus:0) + P.synK*(O.syn.off-D.syn.def) + P.fitK*(O.fit-.5) + (O.home?P.homeMake:0) + O.chemAdj + (O.allStar?.03:0);
  const df=D.tac.defense;
  if(df==='zone23' && (type==='rim'||type==='post')) p-=.03;
  if(df==='zone23' && three) p+=.01;
  if(df==='zone32' && three) p-=.01;
  if(df==='zone32' && (type==='rim'||type==='post')) p+=.015;
  if(df==='zone131' && three) p+=.015;
  if(df==='zone131' && type==='rim') p+=.015;
  if(D.tac.pnrD==='hedge' && O.tac.system==='pnr' && (sh.slot==='PF'||sh.slot==='C') && type==='rim') p+=.015;
  if(D.tac.pnrD==='switch' && type==='post'){ const dm=D.on[dIdx]; p+=clamp((sh.p.ht-dm.p.ht)/10*.02,-.03,.04); }
  if(M.dblId){ if(sh.id===M.dblId) p-=.02; else if(three) p+=.035; else if(type==='rim') p+=.025; }
  if(D.tac.defense==='press' && (type==='rim'||type==='fast')) p+=.02;
  if(M.toPenalty===side){ p-=.01; }
  { const lead=M.score[side]-M.score[1-side], ex=Math.abs(lead)-P.rubberFrom; if(ex>0) p-=Math.sign(lead)*Math.min(P.rubberCap,ex*P.rubber); }
  p = type==='heave' ? P.base.heave : clamp(p,.05,.95);
  const xy=type==='heave'?{x:+((rng()*2-1)*10).toFixed(1),y:+(30+rng()*15).toFixed(1)}:shotXY(rng,type==='putback'||type==='fast'?'rim':type);
  sh.fga++; if(three) sh.tpa++;
  // 盖帽
  const bMax=maxK('block');
  if(rng()<P.blk[type]*Math.pow(bMax/C.blockMax,1.5)){
    const b=pickW(rng,D.on.map((m,j)=>j),j=>Math.pow(Ed[j].block,4.5)); D.on[b].blk++;
    ev(M,{t:side,type:'blk',pid:sh.id,by:D.on[b].id,shot:type,...xy});
    return rebound(M,O,D,dur,type);
  }
  // 投篮犯规
  const fouled = rng() < P.sFoul[type]*Math.pow(c.drawFoul/C.drawFoul,2)*(D.home?0.97:1);
  const made = rng() < p;
  let fIdx=dIdx; if(fouled && rng()<.3) fIdx=Math.floor(rng()*5);
  if(fouled && !made){
    sh.fga--; if(three) sh.tpa--;   // 被犯规未进不算出手
    const dm=foulOn(M,D,fIdx,side); ev(M,{t:side,type:'sfoul',pid:sh.id,by:dm.id,shot:type,...xy});
    const mk=doFT(M,side,sh,pts);
    if(mk===pts){ M.last='made'; return dur; }
    // 最后一罚不中也可能抢到篮板，简化：按正常篮板
    return rebound(M,O,D,dur*.6,type,true);
  }
  if(made){
    sh.fgm++; if(three) sh.tpm++;
    addPts(M,side,sh,pts);
    if(type==='fast') O.st.fast+=pts; if(type==='rim'||type==='post'||type==='putback'||type==='fast') O.st.paint+=pts;
    if(M.second===side) O.st.second+=pts; if(M.afterTov===side) O.st.offTov+=pts;
    let asst=null;
    if(assisted){ const cand=O.on.filter(m=>m!==sh); asst=pickW(rng,cand,m=>Math.pow(m.c.passing,7)*Math.pow(m.c.usage,2)); asst.ast++; }
    let and1=false;
    if(rng()<P.andOne[type]*Math.pow(c.drawFoul/C.drawFoul,2)){ and1=true; const dm=foulOn(M,D,fIdx,side); ev(M,{t:side,type:'made',pid:sh.id,shot:type,pts,ast:asst&&asst.id,and1:dm.id,...xy}); doFT(M,side,sh,1); }
    else ev(M,{t:side,type:'made',pid:sh.id,shot:type,pts,ast:asst&&asst.id,...xy});
    M.last='made'; return dur;
  }
  ev(M,{t:side,type:'miss',pid:sh.id,shot:type,...xy});
  return rebound(M,O,D,dur,type);
}

function rebound(M,O,D,dur,type,afterFT){
  const rng=M.rng, side=O.side;
  const oSum=O.eff.reduce((s,e)=>s+e.oreb,0), dSum=D.eff.reduce((s,e)=>s+e.dreb,0);
  let p=P.orebBase*Math.pow(oSum/Math.max(.1,dSum)*1.0,1.2)*(O.tac.reb==='crash'?1.12:O.tac.reb==='back'?.88:1)
    *(D.tac.defense==='zone23'?1.03:D.tac.defense==='zone32'?1.05:1)*(0.9+0.2*O.syn.reb)/(0.9+0.2*D.syn.reb);
  if(afterFT) p*=.55;
  p=clamp(p,.05,.6);
  const big=m=>(m.slot==='C'||m.slot==='PF')?1.15:1;
  if(rng()<p){
    const j=O.on.indexOf(pickW(rng,O.on,m=>Math.pow(O.eff[O.on.indexOf(m)].oreb,1.25)*big(m))); const r=O.on[j]; r.oreb++;
    ev(M,{t:side,type:'oreb',pid:r.id});
    if(rng()<P.putbackProb && M.clock-dur>2){ M.second=side; const dIdx=defenderOf(D,r,O); const extra=takeShot(M,O,D,j,dIdx,'putback',1+rng()*2); M.second=null; return dur+extra; }
    M.last='oreb'; M.keep=true; M.second=side; return dur;
  }
  const r=pickW(rng,D.on,m=>Math.pow(D.eff[D.on.indexOf(m)].dreb,1.25)*big(m)); r.dreb++;
  ev(M,{t:1-side,type:'dreb',pid:r.id});
  M.last='dreb'; return dur;
}

// ---------- 换人 ----------
function doSubs(M, side){
  const T=M.teams[side], rng=M.rng;
  const elapsed=((Math.min(M.q,4)-1)*720+(720-M.clock))+(M.q>4?(M.q-4)*300:0);
  const g=clamp(elapsed/2880,0,1);
  const diff=M.score[side]-M.score[1-side];
  const garbage = M.q>=4 && M.clock<300 && Math.abs(diff)>=20;
  const clutch = M.q>=4 && M.clock<300 && Math.abs(diff)<=8;
  const foulLim = M.q===1?2 : M.q===2?3 : M.q===3?4 : 5;
  const bench=()=>T.men.filter(m=>!T.on.includes(m) && !m.out);
  let changed=false;
  const swapIn=(ids)=>{ // 把一组人整组换上，按数组顺序对应 PG..C
    ids.forEach((id,k)=>{ const b=T.byId[id]; if(!b||b.out||T.on.includes(b)) return;
      const slot=POS[k]; let j=T.on.findIndex(m=>m.slot===slot && !ids.includes(m.id)); if(j<0) j=T.on.findIndex(m=>!ids.includes(m.id)); if(j<0) return;
      const m=T.on[j]; b.slot=m.slot; m.slot=null; T.on[j]=b; changed=true; ev(M,{t:side,type:'sub',pin:b.id,pout:m.id}); }); };
  const R=T.rot||{};
  // 关门阵容：第 4 节最后 5 分钟、分差 10 分以内
  if(R.closers && R.closers.length===5 && M.q>=4 && M.clock<300 && Math.abs(diff)<=10 && !T.on.some(m=>m.out)){
    const ok=R.closers.filter(id=>{ const m=T.byId[id]; return m && !m.out && m.pf<6; });
    if(ok.length>=4){ swapIn(R.closers.filter(id=>ok.includes(id))); if(changed){ T.dirty=true; } return; }
  }
  // 小球阵容：第 2、4 节中段各试一次，五人都在板凳上而且体能够
  if(T.tac.smallOn && R.small && R.small.length===5 && (M.q===2||M.q===4) && M.clock<540 && M.clock>200 && !(M.smallUsed||(M.smallUsed={}))[side+'-'+M.q]){
    const ms=R.small.map(id=>T.byId[id]);
    if(ms.every(m=>m && !m.out && m.energy>.85 && m.pf<5) && ms.filter(m=>T.on.includes(m)).length<=2){
      M.smallUsed[side+'-'+M.q]=true; swapIn(R.small); if(changed){ T.dirty=true; ev(M,{t:side,type:'small'}); } return; }
  }
  for(let k=0;k<5;k++){
    const m=T.on[k];
    const behind = m.target*g - m.secs;           // 正数表示欠时间
    let need = m.out
      || (garbage && m.starter)
      || (!clutch && m.pf>=foulLim && M.q<=4)
      || (!clutch && m.energy<P.subEnergy)
      || (clutch && m.energy<.6)
      || (!clutch && !garbage && -behind>90)
      || (m.target===0 && !garbage && !m.out && bench().some(b=>b.target>0));
    if(!need) continue;
    const cands=bench().filter(b=> garbage ? true : (b.target>0 || m.out) );
    if(!cands.length) continue;
    const score=b=>{
      if(garbage) return -b.target + posFit(b.p,m.slot)*10 + b.energy;
      if(clutch) return b.p.ovr*(.8+.2*b.energy) + posFit(b.p,m.slot)*8 - (b.pf>=5?50:0);
      const bb=b.target*g - b.secs;
      return bb/60 + posFit(b.p,m.slot)*6 + b.energy*4 - (b.pf>=foulLim?20:0) - (b.energy<.85?8:0);
    };
    let best=cands[0], bs=-1e9; cands.forEach(b=>{const s=score(b); if(s>bs){bs=s;best=b;}});
    if(!m.out && !garbage && best.energy<.8 && m.energy>=best.energy) continue;
    best.slot=m.slot; m.slot=null; T.on[k]=best; changed=true;
    ev(M,{t:side,type:'sub',pin:best.id,pout:m.id});
  }
  // 欠时间的替补主动上场
  if(!garbage && !clutch){
    for(const b of bench()){
      const bb=b.target*g - b.secs; if(bb<90 || b.energy<.85) continue;
      let worst=-1, ws=-1e9;
      T.on.forEach((m,k)=>{ const sur=m.secs-m.target*g; const s=sur/60 + (1-m.energy)*10 + posFit(b.p,m.slot)*3; if(s>ws){ws=s;worst=k;} });
      if(worst>=0 && ws>2){ const m=T.on[worst]; b.slot=m.slot; m.slot=null; T.on[worst]=b; changed=true; ev(M,{t:side,type:'sub',pin:b.id,pout:m.id}); }
    }
  }
  if(changed) T.dirty=true;
}

// 玩家手动换人：outId 下、inId 上，接替同一个位置
function manualSub(M, side, outId, inId){
  const T=M.teams[side], k=T.on.findIndex(m=>m.id===outId), b=T.byId[inId];
  if(k<0 || !b || T.on.includes(b) || b.out) return false;
  const m=T.on[k]; b.slot=m.slot; m.slot=null; T.on[k]=b; T.dirty=true;
  ev(M,{t:side,type:'sub',pin:b.id,pout:m.id}); return true;
}

function timeout(M, side){
  if(M.timeouts[side]<=0) return false;
  M.timeouts[side]--; M.teams.forEach(T=>T.on.forEach(m=>m.energy=Math.min(1,m.energy+P.toRecover)));
  M.toPenalty=1-side; M.run=[0,0]; ev(M,{t:side,type:'timeout'});
  return true;
}

function endPeriod(M){
  M.qScore[0].push(M.score[0]-M.qScore[0].reduce((a,b)=>a+b,0));
  M.qScore[1].push(M.score[1]-M.qScore[1].reduce((a,b)=>a+b,0));
  ev(M,{type:'eoq'});
  if(M.q>=4 && M.score[0]!==M.score[1]){ M.done=true; return; }
  M.q++; M.clock = M.q>4?300:720; M.teamFouls=[0,0];
  if(M.q>4) M.ot++;
  M.teams.forEach(T=>T.men.forEach(m=>m.energy=Math.min(1,m.energy+(M.q===3?P.qBreak*1.8:P.qBreak))));
  // 每节开始：第 1、3 节球权按跳球，第 2、4 节给另一方
  M.poss = (M.q===2||M.q===3) ? 1-M.first : M.first; if(M.q>4) M.poss = M.rng()<.5?0:1;
  M.last='eoq';
  M.teams.forEach(T=>{ // 第 3 节首发回场
    if(M.q===3) { T.on.forEach(m=>m.slot=null); T.on=T.rot.starters.map((id,i)=>{const m=T.byId[id]; if(m.out) return null; m.slot=POS[i]; return m;});
      const bench=T.men.filter(m=>!T.on.includes(m)&&!m.out).sort((a,b)=>b.p.ovr-a.p.ovr);
      T.on=T.on.map((m,i)=>{ if(m) return m; const b=bench.shift(); b.slot=POS[i]; return b; }); T.dirty=true; }
    doSubs(M,T.side);
  });
}

function step(M){
  if(M.done) return;
  const side=M.poss, O=M.teams[side], D=M.teams[1-side];
  M.keep=false; M.toPenaltyWas=M.toPenalty;
  const prevLast=M.last; M.lastPoss = (prevLast==='stl'||prevLast==='dreb') ? side : -1;
  M.afterTov = (prevLast==='stl'||prevLast==='tov') ? side : null;
  if(prevLast!=='oreb') M.second=null;
  const n0=M.events.length;
  const dur=Math.min(possession(M), M.clock);
  if(M.record){ const cl=Math.round(Math.max(0,M.clock-dur)*10)/10; for(let k=n0;k<M.events.length;k++) M.events[k].clock=cl; }
  if(M.toPenalty===side) M.toPenalty=null;
  // 时间、体能、上场时间
  M.clock-=dur; const u=dur/P.possSec;
  M.teams.forEach(T=>{
    const paceF=(T.tac.pace==='fast'?1.15:T.tac.pace==='slow'?.92:1)*(T.tac.defense==='press'?1.3:T.tac.defense==='zone131'?1.05:1)*((T.tac.pnrD==='blitz'||T.tac.double)?1.12:T.tac.pnrD==='hedge'?1.04:1);
    T.men.forEach(m=>{
      if(T.on.includes(m)){ m.secs+=dur; m.energy=Math.max(.2,m.energy-P.drain*u*paceF*(1.35-m.c.sta)); }
      else m.energy=Math.min(1,m.energy+P.recover*u);
    });
    // 场内伤病
    T.on.forEach(m=>{ if(!m.out && M.rng()<P.injury*u*(1.6-m.p.dur/100)*T.injMul*(T.allStar?.2:1)){ m.out=true; m.inj=true; ev(M,{t:T.side,type:'injury',pid:m.id}); } });
  });
  // 球权
  if(!M.keep) M.poss=1-side;
  // 死球：换人和暂停
  const dead = !['stl','dreb'].includes(M.last);
  if(M.clock<=0.05){ endPeriod(M); return; }
  if(dead || M.teams.some(T=>T.on.some(m=>m.out))){
    [0,1].forEach(s=>{
      // AI 暂停：对方连续得分 ≥ 8
      if(M.run[1-s]>=8 && (s!==M.userSide || M.autoTimeout) && M.timeouts[s]>0 && M.rng()<.6) timeout(M,s);
      if(s!==M.userSide || M.autoSubs!==false) doSubs(M,s);
      else if(M.teams[s].on.some(m=>m.out)) doSubs(M,s);   // 玩家一方只在有人伤退/罚下时强制补人
    });
  }
}

function run(M){ let g=0; while(!M.done && g++<2000) step(M); return M; }

function gameScore(m){ return m.pts+.4*m.fgm-.7*m.fga-.4*(m.fta-m.ftm)+.7*m.oreb+.3*m.dreb+m.stl+.7*m.ast+.7*m.blk-.4*m.pf-m.tov; }

function boxScore(M){
  return M.teams.map(T=>({
    side:T.side, pts:M.score[T.side], q:M.qScore[T.side], st:T.st, fit:T.fit, system:T.tac.system,
    players:T.men.filter(m=>m.secs>0||m.inj).map(m=>({id:m.id, min:m.secs/60, pts:m.pts, fgm:m.fgm, fga:m.fga, tpm:m.tpm, tpa:m.tpa,
      ftm:m.ftm, fta:m.fta, oreb:m.oreb, dreb:m.dreb, ast:m.ast, stl:m.stl, blk:m.blk, tov:m.tov, pf:m.pf, pm:m.pm,
      starter:m.starter, inj:m.inj, gs:gameScore(m), energy:m.energy})),
  }));
}

const API={P, POS, setCenters, setC(o){ C=o; }, get C(){return C;}, SYSTEMS, composite, posFit, ovrOf, autoRotation, autoTactics, systemFit, createMatch, step, run, timeout, manualSub, doSubs, boxScore, gameScore, mulberry32};
if(typeof module!=='undefined' && module.exports) module.exports=API; else root.BBEngine=API;
})(typeof window!=='undefined'?window:globalThis);
