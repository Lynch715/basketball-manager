// ================= 赛季系统 =================
// 规范：《第二阶段规范.md》§1–2
let SEASON_START = new Date(2026, 9, 20);        // 每年 10 月 20 日开幕
const REG_DAYS = 174;                             // 到次年 4 月 11 日左右
let ASB = [dayOf(new Date(2027,1,13)), dayOf(new Date(2027,1,18))];   // 全明星假期
let CUP_DAYS=[];                                  // NBA 杯淘汰赛：1/4 决赛两天、半决赛、决赛
function setSeasonYear(y){ SEASON_START=new Date(y,9,20); ASB=[dayOf(new Date(y+1,1,13)), dayOf(new Date(y+1,1,18))]; CUP_DAYS=[9,10,13,16].map(d=>dayOf(new Date(y,11,d))); }
function dayOf(dt){ return Math.round((dt - SEASON_START)/86400000); }
function dateOf(d){ const x=new Date(SEASON_START); x.setDate(x.getDate()+d); return x; }
const WEEK='日一二三四五六';
function dateTxt(d, withWeek){ const x=dateOf(d); return `${x.getMonth()+1}月${x.getDate()}日${withWeek?' 周'+WEEK[x.getDay()]:''}`; }

function srand(seed){ let a=seed>>>0; return ()=>{ a|=0; a=a+0x6D2B79F5|0; let t=Math.imul(a^a>>>15,1|a); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; }

// ---------- 赛程 ----------
function genSchedule(seed, cupPairs){
  const rng=srand(seed), pairs=[];            // [home, away]
  const cupWin=[dayOf(new Date(SEASON_START.getFullYear(),10,1)), CUP_DAYS[0]-6], cupIdx=new Set();
  const conf=t=>TEAMS[t].conf, div=t=>TEAMS[t].div;
  const add=(a,b,n,homeA)=>{ for(let k=0;k<n;k++){ if(k===0 && cupPairs && cupPairs.has(Math.min(a,b)+'-'+Math.max(a,b))) cupIdx.add(pairs.length); pairs.push(k<homeA?[a,b]:[b,a]); } };
  for(let a=0;a<30;a++) for(let b=a+1;b<30;b++){
    if(conf(a)!==conf(b)) add(a,b,2,1);
    else if(div(a)===div(b)) add(a,b,4,2);
  }
  // 同分区不同赛区：5×5 循环，(j−i) mod 5 ∈ {0,1,2} 打 4 场，否则 3 场
  ['东','西'].forEach(cf=>{
    const divs=[...new Set(TEAMS.filter(t=>t.conf===cf).map(t=>t.div))];
    for(let x=0;x<3;x++) for(let y=x+1;y<3;y++){
      const A=TEAMS.filter(t=>t.div===divs[x]).map(t=>t.i), B=TEAMS.filter(t=>t.div===divs[y]).map(t=>t.i);
      A.forEach((a,i)=>B.forEach((b,j)=>{ const four=((j-i+5)%5)<3; add(a,b,four?4:3, four?2:((i+j)%2?2:1)); }));
    }
  });
  // 排日期：逐日贪心，优先排剩余场次多、剩余天数少的队
  const left=pairs.map((p,i)=>i); const games=[]; const last=new Array(30).fill(-9), last2=new Array(30).fill(-9), rem=new Array(30).fill(0);
  pairs.forEach(([h,a])=>{rem[h]++;rem[a]++;});
  for(let i=left.length-1;i>0;i--){ const j=Math.floor(rng()*(i+1)); [left[i],left[j]]=[left[j],left[i]]; }
  let d=0;
  while(left.length && d<REG_DAYS+30){
    if((d>=ASB[0] && d<=ASB[1]) || CUP_DAYS.includes(d)){ d++; continue; }
    const daysLeft=Math.max(1, REG_DAYS - d - (d<ASB[0]?6:0) - CUP_DAYS.filter(x=>x>=d).length);
    const busy=new Set(); const need=t=>rem[t]/daysLeft;
    const inWin=d>=cupWin[0]&&d<=cupWin[1];
    const cand=left.filter(i=>!cupIdx.has(i)||d>=cupWin[0]).map(i=>{ const [h,a]=pairs[i]; return {i,h,a,s:need(h)+need(a)+rng()*.05+(inWin&&cupIdx.has(i)?2:0)}; }).sort((x,y)=>y.s-x.s);
    const target = Math.min(15, Math.round(left.length/Math.max(1,daysLeft-0.5)*(0.9+rng()*.35)));
    let n=0;
    for(const c of cand){
      if(n>=target) break;
      if(busy.has(c.h)||busy.has(c.a)) continue;
      const tired=t=>last[t]===d-1 && last2[t]===d-2;       // 不排三连
      if(tired(c.h)||tired(c.a)) continue;
      const b2b=(last[c.h]===d-1)+(last[c.a]===d-1);
      if(b2b && c.s<2*2*82/168*1.05 && rng()<.85) continue;  // 背靠背尽量少
      busy.add(c.h); busy.add(c.a); n++;
      games.push(cupIdx.has(c.i)?[d,c.h,c.a,null,null,0,'cup']:[d,c.h,c.a,null,null,0]);
      [c.h,c.a].forEach(t=>{ last2[t]=last[t]; last[t]=d; rem[t]--; });
      left.splice(left.indexOf(c.i),1);
    }
    d++;
  }
  games.sort((x,y)=>x[0]-y[0]);
  return games;
}

// ---------- 新赛季 ----------
function newSeason(year){
  setSeasonYear(year); W.year=year; reindex(); TEAMS.forEach(t=>t.players.forEach(p=>p.age=ageOf(p))); FREE.forEach(p=>p.age=ageOf(p));
  const seed=(Date.now()%1e9)|0;
  const cupGroups=drawCupGroups(seed);
  const S={ year, seed, day:0, phase:'reg', games:genSchedule(seed, cupPairSet(cupGroups)), boxes:{}, ps:{}, pps:{}, cond:{}, inj:{},
    inbox:[], playin:null, po:null, awards:null, champion:null, lastMonth:SEASON_START.getMonth(), userFinal:null, ovr0:{} };
  TEAMS.forEach(t=>t.players.forEach(p=>S.ovr0[p.id]=p.ovr));
  S.cup={groups:cupGroups, ko:null, champ:null}; ensureDraftClass(year+1); ensurePicks(year+1); ensurePicks(year+2);
  // 老板目标
  const rank=TEAMS.slice().sort((a,b)=>b.top8-a.top8).findIndex(t=>t.i===G.team)+1;
  const tier = rank<=3?0 : rank<=8?1 : rank<=16?2 : rank<=22?3 : 4;
  S.board={ rank, tier, conf: G.board? clamp(G.board.conf,30,80) : 60 };
  S.inbox.push({d:0, t:'老板的赛季目标', b:`季前实力排名第 ${rank}。老板的要求：${GOALS[tier].txt}。信任度现在是 ${S.board.conf}。`});
  G.season=S; resetPlayers(); saveSeason();
}
const GOALS=[
  {name:'争冠', txt:'打进总决赛', exp:.68},
  {name:'冲击分区决赛', txt:'季后赛至少赢一轮', exp:.58},
  {name:'进季后赛', txt:'常规赛分区前六，或者从附加赛打进季后赛', exp:.52},
  {name:'冲附加赛', txt:'常规赛分区前十，进附加赛', exp:.44},
  {name:'重建', txt:'常规赛 25 胜以上，并且至少一名 23 岁以下球员场均出场 20 分钟以上', exp:.32},
];
function resetPlayers(){ TEAMS.forEach(t=>t.players.forEach(p=>{ p.injury=0; p.energy=1; })); }

// ---------- 存档 ----------
const SEASON_KEY='bbm_season_v1';
function saveSeason(){ try{ localStorage.setItem(SEASON_KEY, JSON.stringify(G.season)); }catch(e){} }
function loadSeason(){ try{ const s=JSON.parse(localStorage.getItem(SEASON_KEY)||'null'); if(s && s.games && s.games.length>1000){ G.season=s; setSeasonYear(s.year); } }catch(e){} }
function applyPlayerState(){ const S=G.season; if(!S) return;
  TEAMS.forEach(t=>t.players.forEach(p=>{ p.injury = S.inj[p.id]? S.inj[p.id].days : 0; const c=S.cond[p.id]; p.energy = clamp((c==null?100:c)/100,.8,1); })); applyLife(); }

// ---------- 伤病 ----------
const INJ_TABLE=[ [.55,1,3,['脚踝扭伤','手指挫伤','背部痉挛','膝盖挫伤','臀部挫伤']], [.25,7,14,['腘绳肌拉伤','小腿拉伤','脚踝扭伤','腹股沟拉伤']],
  [.14,21,42,['膝盖扭伤','肩部拉伤','足底筋膜炎','手腕骨裂']], [.05,60,120,['半月板撕裂','脚部骨折']], [.01,400,400,['跟腱断裂','前十字韧带撕裂']] ];
function rollInjury(p, rng){
  let r=rng()*(0.85+0.3*(1-p.dur/100)*2), acc=0;         // 耐久越低，越往重的方向偏
  r = Math.min(r, .9999);
  for(const [pr,a,b,names] of INJ_TABLE){ acc+=pr; if(r<acc || pr===.01){ const days=Math.round(a+(b-a)*rng()); return {days, name:names[Math.floor(rng()*names.length)]}; } }
}

// ---------- 轮换（考虑伤病） ----------
function effectiveRotation(t, rot){
  const avail=p=>!(p.injury>0);
  const R=JSON.parse(JSON.stringify(rot));
  const byId=id=>PBYID[id];
  R.starters=R.starters.map((id,i)=>{
    if(avail(byId(id))) return id;
    const cand=[...R.order, ...t.players.map(p=>p.id)].filter((x,k,a)=>a.indexOf(x)===k && !R.starters.includes(x) && avail(byId(x)));
    let best=null,bs=-1e9; cand.forEach(x=>{ const p=byId(x); const s=p.ovr-(1-E.posFit(p,POS[i]))*22; if(s>bs){bs=s;best=x;} });
    if(best!=null){ R.minutes[best]=Math.max(R.minutes[best]||0, R.minutes[id]||0); R.minutes[id]=0; R.order=R.order.filter(x=>x!==best); R.order.push(id); }
    return best!=null?best:id;
  });
  t.players.forEach(p=>{ if(!avail(p)) R.minutes[p.id]=0; });
  // 合计补回 240：按原有分钟比例分给健康球员，单人最多 42
  let tot=Object.values(R.minutes).reduce((a,b)=>a+b,0);
  const pool=t.players.filter(p=>avail(p) && (R.minutes[p.id]||0)>0);
  let guard=0;
  while(tot!==240 && pool.length && guard++<500){
    const d=tot<240?1:-1; const p=pool[guard%pool.length];
    const m=R.minutes[p.id]; if(d>0 && m>=42) continue; if(d<0 && m<=0) continue;
    R.minutes[p.id]=m+d; tot+=d;
  }
  return R;
}
function aiSide(t){ const key=t.players.filter(p=>p.injury>0).map(p=>p.id).join(',');
  if(t._rkey!==key || !t._rot){ t._rkey=key; t._rot=E.autoRotation(t); t._tac=E.autoTactics(t,t._rot); } return {players:t.players, rotation:t._rot, tactics:Object.assign({},t._tac,{matchups:{}})}; }
function userSide(){ const t=myTeam(); return {players:t.players, rotation:effectiveRotation(t,G.rot), tactics:Object.assign(JSON.parse(JSON.stringify(G.tac)),{matchups:{}})}; }
function sideFor(ti){ return Object.assign(ti===G.team? userSide() : aiSide(TEAMS[ti]), lifeSide(ti)); }

// ---------- 一场比赛的结果落地 ----------
const PS_KEYS=['min','pts','fgm','fga','tpm','tpa','ftm','fta','oreb','dreb','ast','stl','blk','tov','pf','pm'];
function recordGame(M, hIdx, aIdx, gameRef, playoff){
  const S=G.season, rng=srand((S.seed^(gameRef.n*7919))>>>0);
  const store = playoff==='cup'? {} : playoff? S.pps : S.ps;
  M.teams.forEach((T,side)=>{
    T.men.forEach(m=>{
      const p=m.p; if(m.secs<=0 && !m.inj) return;
      const q=store[p.id]||(store[p.id]={g:0,gs:0,min:0,pts:0,fgm:0,fga:0,tpm:0,tpa:0,ftm:0,fta:0,oreb:0,dreb:0,ast:0,stl:0,blk:0,tov:0,pf:0,pm:0,team:side===0?hIdx:aIdx});
      q.team = side===0?hIdx:aIdx;
      if(m.secs>0){ q.g++; if(m.starter) q.gs++; q.min+=m.secs/60; PS_KEYS.slice(1).forEach(k=>q[k]+=m[k]); }
      S.cond[p.id] = clamp((S.cond[p.id]==null?100:S.cond[p.id]) - m.secs/60*1.2, 20, 100);
      if(m.inj){ const r=rollInjury(p,rng); if(r.days<400) r.days=Math.max(1,Math.round(r.days*injDaysMul(q.team))); S.inj[p.id]=r; p.injury=r.days;
        if(q.team===G.team) S.inbox.push({d:S.day, t:`${p.cn} 受伤`, b:`${r.name}，预计缺阵 ${r.days>=300?'整个赛季':r.days+' 天'}。`}); }
    });
  });
  const bs=E.boxScore(M);
  if(hIdx===G.team || aIdx===G.team) S.boxes[gameRef.key]={h:hIdx,a:aIdx,score:M.score.slice(),q:M.qScore,ot:M.ot,box:bs.map(t=>({pts:t.pts,st:t.st,system:t.system,fit:t.fit,players:t.players.map(p=>{ const o={id:p.id}; PS_KEYS.forEach(k=>o[k]=k==='min'?Math.round(p.min*10)/10:p[k]); o.starter=p.starter; o.inj=p.inj; o.gs=p.gs; return o; })}))};
}
function simGame(hIdx, aIdx, gameRef, playoff){
  const S=G.season;
  const M=E.createMatch(sideFor(hIdx), sideFor(aIdx), {seed:(S.seed*31+gameRef.n*977)>>>0});
  E.run(M); recordGame(M,hIdx,aIdx,gameRef,playoff); return M;
}

// ---------- 推进一天 ----------
function todays(){ const S=G.season; return S.games.map((g,n)=>({g,n})).filter(x=>x.g[0]===S.day && x.g[3]==null); }
function userGameToday(){ const S=G.season;
  if(S.phase==='reg'){ const r=todays().find(x=>x.g[1]===G.team||x.g[2]===G.team); if(r && r.g[6]==='cup') r.label='常规赛 · NBA 杯小组赛'; return r || cupGamesToday().find(x=>x.h===G.team||x.a===G.team) || null; }
  const pg=poGamesToday(); return pg.find(x=>x.h===G.team||x.a===G.team)||null; }

// 模拟当天除玩家以外的比赛；玩家比赛按 mode：'skip' 直接出结果，M 由直播传入
function playDay(userM){
  const S=G.season; applyPlayerState();
  if(S.phase==='reg'){
    todays().forEach(({g,n})=>{
      let M;
      if((g[1]===G.team||g[2]===G.team) && userM) { M=userM; recordGame(M,g[1],g[2],{n,key:'r'+n},false); }
      else M=simGame(g[1],g[2],{n,key:'r'+n},false);
      g[3]=M.score[0]; g[4]=M.score[1]; g[5]=M.ot;
    });
    cupGamesToday().forEach(x=>{
      let M;
      if((x.h===G.team||x.a===G.team) && userM){ M=userM; recordGame(M,x.h,x.a,{n:x.n,key:x.key},'cup'); }
      else M=simGame(x.h,x.a,{n:x.n,key:x.key},'cup');
      x.done(M.score[0],M.score[1],M.ot);
    });
  } else if(S.phase==='playin' || S.phase==='po'){
    poGamesToday().forEach(x=>{
      let M;
      if((x.h===G.team||x.a===G.team) && userM){ M=userM; recordGame(M,x.h,x.a,{n:x.n,key:x.key},true); }
      else M=simGame(x.h,x.a,{n:x.n,key:x.key},true);
      x.done(M.score[0],M.score[1],M.ot);
    });
  }
  endDay();
}
function endDay(){
  const S=G.season;
  // 伤病倒计时、体能恢复
  Object.keys(S.inj).forEach(id=>{ S.inj[id].days--; if(S.inj[id].days<=0){ const p=PBYID[id]; delete S.inj[id];
    if(p && teamOfPlayer(p)===G.team) S.inbox.push({d:S.day, t:`${p.cn} 伤愈`, b:'可以重新上场了。'}); } });
  { const tmap=teamMapOfPlayers(); Object.keys(S.cond).forEach(id=>{ S.cond[id]=Math.min(100,S.cond[id]+dailyRecover(tmap[id]==null?-1:tmap[id])); }); }
  // AI 交易：截止日前每天 3% 概率；AI 给玩家的报价 4%
  if(S.phase==='reg'){ const dl=dayOf(new Date(S.year+1,1,5));
    if(S.day<=dl){ if(rnd01()<.05) tryAITrade(); maybeUserOffer(.04); }
    if(S.day===dl) addNews('截止日',`${S.year+1} 年交易截止日已过，这个赛季不能再交易了。`); }
  S.day++;
  // 每周士气和化学反应，每两周成长；全明星周末；NBA 杯
  if(S.phase!=='done' && S.day%7===0) weeklyLife();
  if(S.phase==='reg' && S.day%14===0) growthTick();
  if(S.phase==='reg' && S.day>=ASB[0] && S.day<=ASB[1] && !S.allStar) runAllStar();
  cupDaily(S);
  // 月度：老板信任度
  const mo=dateOf(S.day).getMonth();
  if(S.phase==='reg' && mo!==S.lastMonth){ S.lastMonth=mo; monthlyBoard(); }
  // 阶段切换
  if(S.phase==='reg' && S.games.every(g=>g[3]!=null)) endRegular();
  else if(S.phase==='playin' && S.playin.every(x=>x.w!=null) && S.playin.length===6) startPlayoffs();
  else if(S.phase==='playin') advancePlayin();
  else if(S.phase==='po') advancePlayoffs();
  applyPlayerState(); saveSeason();
}
function teamOfPlayer(p){ return TEAMS.findIndex(t=>t.players.includes(p)); }

// ---------- 战绩 ----------
function standings(){
  const S=G.season, R=TEAMS.map(t=>({i:t.i,w:0,l:0,hw:0,hl:0,aw:0,al:0,cw:0,cl:0,pf:0,pa:0,last:[],h2h:{}}));
  S.games.forEach(g=>{ if(g[3]==null) return; const [d,h,a,hs,as]=g; const hW=hs>as;
    const H=R[h],A=R[a]; H.pf+=hs;H.pa+=as;A.pf+=as;A.pa+=hs;
    if(hW){H.w++;H.hw++;A.l++;A.al++;} else {A.w++;A.aw++;H.l++;H.hl++;}
    if(TEAMS[h].conf===TEAMS[a].conf){ if(hW){H.cw++;A.cl++;} else {A.cw++;H.cl++;} }
    H.last.push(hW?'W':'L'); A.last.push(hW?'L':'W');
    H.h2h[a]=(H.h2h[a]||0)+(hW?1:-1); A.h2h[h]=(A.h2h[h]||0)+(hW?-1:1); });
  R.forEach(r=>{ r.g=r.w+r.l; r.pct=r.g?r.w/r.g:0; let s=0; for(let k=r.last.length-1;k>=0;k--){ if(r.last[k]===r.last[r.last.length-1]) s++; else break; }
    r.streak=r.last.length?(r.last[r.last.length-1]==='W'?'连胜 ':'连败 ')+s:'-'; r.l10=r.last.slice(-10); });
  return R;
}
function confRank(R, cf){
  const arr=R.filter(r=>TEAMS[r.i].conf===cf);
  arr.sort((x,y)=> y.pct-x.pct || (y.h2h[x.i]||0)-(x.h2h[y.i]||0) || (y.cw-y.cl)-(x.cw-x.cl) || (y.pf-y.pa)-(x.pf-x.pa));
  const top=arr[0]; arr.forEach(r=>r.gb=((top.w-r.w)+(r.l-top.l))/2);
  return arr;
}

// ---------- 老板 ----------
function monthlyBoard(){
  const S=G.season, r=standings()[G.team]; if(r.g<8) return;
  const diff=r.pct-GOALS[S.board.tier].exp;
  const delta=Math.round(clamp(diff*40,-8,8));
  S.board.conf=clamp(S.board.conf+delta,0,100);
  S.inbox.push({d:S.day, t:'老板的月度评价', b:`目前 ${r.w} 胜 ${r.l} 负。${delta>2?'老板对球队的表现很满意。':delta<-2?'老板对战绩不太满意，希望尽快改善。':'老板觉得还行，继续保持。'}信任度 ${S.board.conf}（${delta>=0?'+':''}${delta}）。${finMonthlyNote()}`});
  checkFired();
}
function checkFired(){ const S=G.season; if(S.board.conf<15 && !S.fired){ S.fired=true; S.inbox.push({d:S.day,t:'你被解雇了',b:'老板对球队失去了信心，决定换帅。你可以接手另一支球队重新开始。'}); } }

// ---------- 常规赛结束：奖项、附加赛 ----------
function endRegular(){
  const S=G.season; settleTax(); const R=standings();
  S.final=R.map(r=>({i:r.i,w:r.w,l:r.l}));
  S.seeds={东:confRank(R,'东').map(r=>r.i), 西:confRank(R,'西').map(r=>r.i)};
  S.awards=calcAwards(R);
  S.inbox.push({d:S.day,t:'常规赛结束',b:`常规赛 MVP：${PBYID[S.awards.mvp].cn}。最佳防守球员：${PBYID[S.awards.dpoy].cn}。最佳新秀：${S.awards.roy?PBYID[S.awards.roy].cn:'无'}。最佳第六人：${S.awards.smoy?PBYID[S.awards.smoy].cn:'无'}。`});
  S.phase='playin'; S.playin=[]; S.day+=2; S.poDay=S.day;
  ['东','西'].forEach(cf=>{ const s=S.seeds[cf];
    S.playin.push({cf, tag:'7v8', h:s[6], a:s[7], day:S.day, w:null});
    S.playin.push({cf, tag:'9v10', h:s[8], a:s[9], day:S.day, w:null}); });
}
function advancePlayin(){
  const S=G.season;
  ['东','西'].forEach(cf=>{
    const g78=S.playin.find(x=>x.cf===cf&&x.tag==='7v8'), g910=S.playin.find(x=>x.cf===cf&&x.tag==='9v10');
    if(g78.w!=null && g910.w!=null && !S.playin.find(x=>x.cf===cf&&x.tag==='last')){
      const l78=g78.w===g78.h?g78.a:g78.h;
      S.playin.push({cf, tag:'last', h:l78, a:g910.w, day:S.day+1, w:null});
    }
  });
}
function calcAwards(R){
  const S=G.season, pct=i=>R[i].pct;
  let best={}; const upd=(k,id,v)=>{ if(!best[k]||v>best[k].v) best[k]={id,v}; };
  Object.entries(S.ps).forEach(([id,q])=>{
    if(q.g<55) return; const p=PBYID[id]; const g=q.g, t=q.team;
    const per=k=>q[k]/g;
    const base=per('pts')+1.1*(per('oreb')+per('dreb'))+1.4*per('ast')+2*per('stl')+2*per('blk')-per('tov')-.4*(per('fga')-per('fgm'));
    upd('mvp',id,base*(0.55+pct(t)));
    upd('dpoy',id,(2.2*per('stl')+2.6*per('blk')+.35*per('dreb'))*(0.7+pct(t)*.6)+p.a.perD/40+p.a.intD/40);
    if(p.age<=21 && p.contract && p.contract[2]==='rk') upd('roy',id,base);
    if(q.gs<q.g*.25) upd('smoy',id,base);
  });
  return {mvp:best.mvp&&best.mvp.id, dpoy:best.dpoy&&best.dpoy.id, roy:best.roy&&best.roy.id, smoy:best.smoy&&best.smoy.id};
}

// ---------- 季后赛 ----------
function startPlayoffs(){
  const S=G.season;
  const seeds={};
  ['东','西'].forEach(cf=>{ const s=S.seeds[cf].slice(0,6);
    const g78=S.playin.find(x=>x.cf===cf&&x.tag==='7v8'), last=S.playin.find(x=>x.cf===cf&&x.tag==='last');
    s.push(g78.w, last.w); seeds[cf]=s; });
  S.poSeeds=seeds;
  const mk=(cf,a,b,round,slot)=>({cf,round,slot,h:a,a:b,hw:0,aw:0,games:[],w:null});
  S.po={round:1, series:[]};
  ['东','西'].forEach(cf=>{ const s=seeds[cf]; [[0,7],[3,4],[2,5],[1,6]].forEach(([x,y],k)=>S.po.series.push(mk(cf,s[x],s[y],1,k))); });
  S.phase='po'; S.poDay=S.day+1;
  const inPo = Object.values(seeds).some(s=>s.includes(G.team));
  S.inbox.push({d:S.day,t:'季后赛对阵出炉',b: inPo? `你的球队以${(seeds[TEAMS[G.team].conf].indexOf(G.team)+1)}号种子进入季后赛。` : '你的球队没能进入季后赛。可以继续模拟，看看谁拿总冠军。'});
}
function seriesSeedRank(sr){ // 主场优势：战绩更好的一方
  const S=G.season, f=i=>S.final.find(x=>x.i===i); const A=f(sr.h), B=f(sr.a);
  return (A.w-A.l)>=(B.w-B.l);
}
function poGamesToday(){
  const S=G.season, out=[];
  if(S.phase==='playin'){
    S.playin.forEach((x,k)=>{ if(x.w==null && x.day===S.day) out.push({h:x.h,a:x.a,n:5000+k,key:'pi'+k,label:`附加赛 ${x.cf}部 ${x.tag==='7v8'?'7 号 vs 8 号':x.tag==='9v10'?'9 号 vs 10 号':'争夺 8 号种子'}`,done:(hs,as)=>{ x.w=hs>as?x.h:x.a; x.score=[hs,as]; }}); });
    return out;
  }
  if(S.phase!=='po' || S.day<S.poDay) return out;
  S.po.series.filter(sr=>sr.round===S.po.round && sr.w==null).forEach((sr,k)=>{
    const gn=sr.games.length; const higher=seriesSeedRank(sr)?sr.h:sr.a, lower=higher===sr.h?sr.a:sr.h;
    const homeHigher=[0,1,4,6].includes(gn);
    const h=homeHigher?higher:lower, a=homeHigher?lower:higher;
    out.push({h,a,n:6000+S.po.round*100+sr.slot*10+(sr.cf==='西'?50:0)+gn, key:`po${S.po.round}${sr.cf}${sr.slot}g${gn}`,
      label:`${['','首轮','分区半决赛','分区决赛','总决赛'][sr.round]} 第 ${gn+1} 场`, series:sr,
      done:(hs,as)=>{ const w=hs>as?h:a; if(w===sr.h) sr.hw++; else sr.aw++; sr.games.push({h,a,hs,as}); if(sr.hw===4||sr.aw===4) sr.w=sr.hw===4?sr.h:sr.a; }});
  });
  return out;
}
function advancePlayoffs(){
  const S=G.season, cur=S.po.series.filter(sr=>sr.round===S.po.round);
  if(cur.some(sr=>sr.w==null)) return;
  if(S.po.round===4){ const fin=cur[0]; S.champion=fin.w; S.phase='done'; finishSeason(); return; }
  const nr=S.po.round+1; S.po.round=nr; S.poDay=S.day+1;
  if(nr<=3){ ['东','西'].forEach(cf=>{ const prev=S.po.series.filter(sr=>sr.round===nr-1&&sr.cf===cf).sort((a,b)=>a.slot-b.slot);
      for(let k=0;k<prev.length;k+=2) S.po.series.push({cf,round:nr,slot:k/2,h:prev[k].w,a:prev[k+1].w,hw:0,aw:0,games:[],w:null}); }); }
  else { const e=S.po.series.find(sr=>sr.round===3&&sr.cf==='东'), w=S.po.series.find(sr=>sr.round===3&&sr.cf==='西');
    S.po.series.push({cf:'总',round:4,slot:0,h:e.w,a:w.w,hw:0,aw:0,games:[],w:null}); }
  const mine=S.po.series.find(sr=>sr.round===nr&&(sr.h===G.team||sr.a===G.team));
  if(mine) S.inbox.push({d:S.day,t:`晋级${['','','分区半决赛','分区决赛','总决赛'][nr]}`,b:`下一轮对手：${TEAMS[mine.h===G.team?mine.a:mine.h].cn}。`});
}
function userPoResult(){ // 玩家在季后赛走到哪
  const S=G.season; if(!S.po) return S.playin&&S.playin.some(x=>x.h===G.team||x.a===G.team)?'附加赛出局':'未进季后赛';
  if(S.champion===G.team) return '总冠军';
  const mine=S.po.series.filter(sr=>sr.h===G.team||sr.a===G.team);
  if(!mine.length) return S.playin&&S.playin.some(x=>x.h===G.team||x.a===G.team)?'附加赛出局':'未进季后赛';
  const r=Math.max(...mine.map(sr=>sr.round));
  const lost=mine.find(sr=>sr.round===r && sr.w!=null && sr.w!==G.team);
  return lost? ['','首轮出局','分区半决赛出局','分区决赛出局','总决赛失利'][r] : ['','首轮','分区半决赛','分区决赛','总决赛'][r]+'进行中';
}
function finishSeason(){
  const S=G.season, r=S.final.find(x=>x.i===G.team), res=userPoResult();
  const roundWon = res==='总冠军'?5 : res==='总决赛失利'?4 : res==='分区决赛出局'?3 : res==='分区半决赛出局'?2 : res==='首轮出局'?1 : 0;
  const inPO = roundWon>=1 || S.po.series.some(sr=>sr.h===G.team||sr.a===G.team);
  const seed = S.seeds[TEAMS[G.team].conf].indexOf(G.team)+1;
  let met;
  switch(S.board.tier){
    case 0: met = roundWon>=4; break;
    case 1: met = roundWon>=2; break;
    case 2: met = inPO; break;
    case 3: met = seed<=10; break;
    default: { const young=Object.entries(S.ps).some(([id,q])=>q.team===G.team && PBYID[id].age<=23 && q.g>=40 && q.min/q.g>=20); met = r.w>=25 && young; }
  }
  const exceed = met && (roundWon>=({0:5,1:3,2:2,3:1,4:1})[S.board.tier]);
  // 差一点完成：只差一轮（或者差一档）
  const close = !met && ({0:roundWon===3, 1:roundWon===1, 2:seed<=10, 3:seed<=12, 4:r.w>=20})[S.board.tier];
  const delta = exceed?25 : met?15 : close?-8 : -18;
  S.board.conf=clamp(S.board.conf+delta,0,100);
  const fe=financeSeasonEnd(), ff=fe.f;
  if(!fe.pen && fe.first && ff.spend>ff.limit) S.inbox.push({d:S.day, t:'老板提醒开支', b:`工资加奢侈税一共 ${money(ff.spend)}，超出老板能接受的 ${money(ff.limit)}。这些合同是前任签的，今年不追究；从下个赛季起，超出的部分会扣信任度。`});
  if(fe.pen){ S.board.conf=clamp(S.board.conf-fe.pen,0,100); S.inbox.push({d:S.day, t:'老板对开支不满', b:`工资加奢侈税一共 ${money(ff.spend)}，超出老板能接受的 ${money(ff.limit)}。信任度 −${fe.pen}。`}); }
  S.userFinal={w:r.w,l:r.l,res,met,exceed,delta,seed,finPen:fe.pen};
  S.inbox.push({d:S.day,t: S.champion===G.team?'总冠军！':'赛季结束', b:`${TEAMS[S.champion].cn} 拿下总冠军。你的球队：${r.w} 胜 ${r.l} 负，${res}。老板目标「${GOALS[S.board.tier].txt}」${met?(exceed?'超额完成':'完成'):close?'差一点完成':'没有完成'}，信任度 ${delta>0?'+':''}${delta}，现在 ${S.board.conf}。`});
  G.career=G.career||[];
  G.career.push({year:S.year, team:G.team, w:r.w, l:r.l, res, champ:S.champion===G.team, cup:!!(S.cup&&S.cup.champ===G.team), goal:GOALS[S.board.tier].name, met, fmvp:null, mvp:S.awards&&S.awards.mvp, fin:{revT:ff.revT, pay:ff.pay, tax:ff.tax, profit:ff.profit}});
  G.board={conf:S.board.conf};
  checkFired(); save();
}
