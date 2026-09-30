// ================= 休赛期 =================
// 规范：《第三阶段规范.md》
const rnd01=Math.random;
function gauss(m,s){ let u=0,v=0; while(!u) u=Math.random(); while(!v) v=Math.random(); return m+s*Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v); }
function pickOne(a){ return a[Math.floor(Math.random()*a.length)]; }

// ---------- 市场价 ----------
function marketSalary(ovr, age, year){
  const f=LEAGUE_CFG.salFit, C=CFG(year);
  let s=Math.exp(f[0]*ovr*ovr+f[1]*ovr+f[2])*0.95*capMul(year);
  if(age>=34) s*=.6; else if(age>=32) s*=.78; else if(age<=22) s*=.85;
  return Math.round(clamp(s, C.minSal, C.maxSal));
}
function contractYears(age){ return age<=24? 3+(rnd01()<.5?1:0) : age<=29? 2+Math.floor(rnd01()*3) : age<=32? 2+(rnd01()<.5?1:0) : 1+(rnd01()<.4?1:0); }

// ---------- 1. 赛季总结：存档数据、成长衰退、退役 ----------
const PHYS=['spd','jmp','str','sta'], SKILL=['three','ft','mid','pass','oiq','diq','handle','post'];
const AGE_DELTA=a=> a<=20?4 : a===21?3.5 : a===22?3 : a===23?2.2 : a===24?1.5 : a===25?1 : a===26?.5 : a===27?0 : a===28?-.3 : a===29?-.7 : a===30?-1.2 : a===31?-1.8 : a===32?-2.5 : a===33?-3.2 : a===34?-4 : -5;
function progressPlayer(p, age, ti){
  // 全年成长的六成在这里结算，另外四成在赛季里每两周结算（第五阶段）
  let d=growthBase(p,age); d*=.6*trainMul(ti==null?-1:ti,d);
  d+=gauss(0,1.5);
  if(d>0 && p.ovr+d>p.pot) d=Math.max(0,p.pot-p.ovr);
  const target=clamp(Math.round(p.ovr+d),30,99), old=p.ovr;
  // 分摊到属性
  const old30=age>=30;
  KEYS.forEach(k=>{ let w=1; if(PHYS.includes(k)) w= d<0&&old30?1.6 : d>0?.6:1; if(SKILL.includes(k)) w= d<0&&old30?.6 : d>0?1.25:1;
    p.a[k]=clamp(Math.round(p.a[k]+d*w*1.1+gauss(0,1)),20,99); });
  // 微调到目标总评
  fitOvr(p, target);
  p.ovr=calcOvr(p);
  // 潜力
  if(age<25) p.pot=Math.round(clamp(p.pot+gauss(-.3,1.5),p.ovr,99));
  else p.pot=Math.max(p.ovr, Math.round(p.pot-(p.pot-p.ovr)*.5));
  p.dur=clamp(Math.round(p.dur - (age>=31?rnd01()*3:0) + gauss(0,1.5)),30,99);
  return p.ovr-old;
}
function fitOvr(p, target){ // 把属性整体推到目标总评
  for(let it=0; it<400; it++){ const cur=calcOvr(p); if(cur===target) break; const dir=cur<target?1:-1;
    let moved=false; KEYS.forEach(k=>{ if(rnd01()<.6){ const v=clamp(p.a[k]+dir,20,99); if(v!==p.a[k]){ p.a[k]=v; moved=true; } } }); if(!moved) break; }
  p.ovr=calcOvr(p);
}
function retireProb(p, age){
  let r = age>=40?1 : age>=39?.8 : age>=38?.7 : age>=37?.5 : age>=36?.35 : age>=35?.2 : age>=34?.1 : 0;
  if(age>=30 && p.ovr<65) r+=.3;
  if(!p.contract && p.ovr<66 && age>=30) r+=.5;
  return Math.min(1,r);
}
function archiveStats(){
  const S=G.season;
  const add=(store,po)=>Object.entries(store).forEach(([id,q])=>{ const p=PBYID[id]; if(!p||!q.g) return;
    p.hist=p.hist||[]; p.hist.push([S.year, q.team, po?1:0, q.g, +(q.min/q.g).toFixed(1), +(q.pts/q.g).toFixed(1), +((q.oreb+q.dreb)/q.g).toFixed(1), +(q.ast/q.g).toFixed(1), +(q.stl/q.g).toFixed(1), +(q.blk/q.g).toFixed(1), q.fga?+(q.fgm/q.fga*100).toFixed(1):0, q.tpa?+(q.tpm/q.tpa*100).toFixed(1):0]); });
  add(S.ps,false); add(S.pps,true);
}
function offSummary(){
  const S=G.season, nextYear=S.year+1, rep={mine:[], retired:[], risers:[], fallers:[]};
  archiveStats();
  const all=[]; TEAMS.forEach(t=>t.players.forEach(p=>all.push([p,t.i]))); FREE.forEach(p=>all.push([p,-1]));
  all.forEach(([p,ti])=>{
    const age=ageOf(p,nextYear); const old=p.ovr; const d=progressPlayer(p,age,ti); p.age=age; delete p.gx;
    const r={id:p.id, cn:p.cn, team:ti, old, now:p.ovr, age};
    if(ti===G.team) rep.mine.push(r);
    rep.risers.push(r);
    if(rnd01()<retireProb(p,age)){ rep.retired.push(r); p._retire=true; }
  });
  rep.risers.sort((a,b)=>(b.now-b.old)-(a.now-a.old)); rep.fallers=rep.risers.slice(-8).reverse(); rep.risers=rep.risers.slice(0,8);
  // 退役：从队里拿掉，剩余合同不计死钱
  TEAMS.forEach(t=>{ t.players=t.players.filter(p=>!p._retire); });
  for(let i=FREE.length-1;i>=0;i--) if(FREE[i]._retire) FREE.splice(i,1);
  rep.retired.sort((a,b)=>b.old-a.old);
  // 伤病清零（休赛期养好了）
  TEAMS.forEach(t=>t.players.forEach(p=>{ p.injury=0; p.energy=1; }));
  reindex();
  return rep;
}

// ---------- 2. 新秀 ----------
const NAME_FIRST=['杰伦','马库斯','泰勒','贾马尔','德安德烈','凯文','布兰登','克里斯','乔丹','泰瑞斯','达里厄斯','卡梅伦','以赛亚','扎克','卢卡斯','诺亚','伊桑','马利克','科迪','特雷','雅各布','安东尼','达米安','肖恩','内森','卡勒布','罗伯特','约书亚','杰登','凯尔','泰勒斯','埃文','蒙特','德里克','肯尼','阿隆','贾斯汀','詹姆斯','迈尔斯','安德烈','泽维尔','昆汀','拉马尔','奥斯汀','杰克逊','卡森','科尔','特伦特','斯科特','瑞恩','阿迪','埃利','朱利安','多米尼克','布莱斯','卡马里','凯莱布','亚历克斯','托马斯','雷吉'];
const NAME_LAST=['约翰逊','威廉姆斯','布朗','琼斯','戴维斯','米勒','威尔逊','摩尔','泰勒','安德森','托马斯','杰克逊','怀特','哈里斯','马丁','汤普森','加西亚','罗宾逊','克拉克','刘易斯','李','沃克','霍尔','艾伦','杨','金','赖特','斯科特','格林','贝克','亚当斯','尼尔森','希尔','坎贝尔','米切尔','罗伯茨','卡特','菲利普斯','埃文斯','特纳','帕克','柯林斯','爱德华兹','斯图尔特','莫里斯','墨菲','库克','罗杰斯','摩根','库珀','里德','贝利','贝尔','凯利','霍华德','沃德','考克斯','理查森','伍德','沃森','布鲁克斯','班尼特','格雷','詹姆斯','雷耶斯','海耶斯','迈尔斯','福特','汉密尔顿','格雷厄姆','沙利文','华莱士','韦斯特','科尔','哈珀','布莱克','拉塞尔','弗里曼','亨利','杜兰德','奥卡福','迪亚洛','恩迪亚耶','马尔科维奇','约基维奇','彼得罗维奇','加索尔','费尔南德斯','马丁内斯'];
const CN_SURNAME=['王','李','张','刘','陈','杨','赵','黄','周','吴','徐','孙','胡','朱','高','林','何','郭','马','罗'];
const CN_GIVEN=['子轩','浩然','宇航','俊杰','天佑','明哲','嘉豪','博文','一鸣','思远','晨阳','梓涵','瀚文','志强','振宇'];
const NATS=[['美国',75],['加拿大',5],['法国',4],['塞尔维亚',2],['澳大利亚',3],['西班牙',2],['立陶宛',1.5],['喀麦隆',1.5],['尼日利亚',2],['德国',1.5],['中国',1.5],['土耳其',1]];
function pickNat(){ let r=rnd01()*NATS.reduce((s,x)=>s+x[1],0); for(const [n,w] of NATS){ r-=w; if(r<=0) return n; } return '美国'; }
function genProspect(rank, year){
  // rank 0 = 最好；按顺位设定总评和潜力的期望值
  const t=rank/69;
  const ovr=Math.round(clamp(76-18*Math.pow(t,.85)+gauss(0,1.8),50,79));
  const pot=Math.round(clamp(93-24*Math.pow(t,.8)+gauss(0,3),ovr+2,99));
  const r=rnd01(); const age = r<.4?19 : r<.65?20 : r<.85?21 : 22;
  // 模板：同位置的现役轮换球员
  const pos=pickOne(POS);
  const pool=[]; TEAMS.forEach(tm=>tm.players.slice().sort((a,b)=>b.ovr-a.ovr).slice(0,9).forEach(p=>{ if(p.pos===pos) pool.push(p); }));
  const tpl=pickOne(pool.length?pool:TEAMS[0].players);
  const nat=pickNat();
  const cn = nat==='中国'? pickOne(CN_SURNAME)+pickOne(CN_GIVEN) : pickOne(NAME_FIRST)+'·'+pickOne(NAME_LAST);
  const by=year-age, bm=1+Math.floor(rnd01()*12);
  const p={id:PID++, en:cn, cn, pos, pos2: tpl.pos2? tpl.pos2.slice():[], born:`${by}-${String(bm).padStart(2,'0')}`, jersey:String(Math.floor(rnd01()*50)),
    ht:Math.round(tpl.ht+gauss(0,2.5)), ws:Math.round(tpl.ws+gauss(0,3)), wt:Math.round(tpl.wt+gauss(0,4)), nat, pot, dur:Math.round(clamp(gauss(80,8),50,98)), prof:Math.round(clamp(gauss(60,15),20,99)),
    a:Object.assign({},tpl.a), contract:null, hist:[]};
  // 身体属性年轻人略低、技术略粗糙，再整体缩放到目标总评
  KEYS.forEach(k=>{ p.a[k]=clamp(Math.round(p.a[k]+gauss(0,4)),20,99); });
  // 先按比例粗缩放，再逐点微调
  { const cur=calcOvr(p); const k0=(ovr-40)/Math.max(1,cur-40); KEYS.forEach(k=>{ p.a[k]=clamp(Math.round(40+(p.a[k]-40)*k0),20,99); }); }
  fitOvr(p, ovr);
  p.ovr=calcOvr(p); p.pot=Math.max(p.pot,p.ovr+2); p.age=ageOf(p,year);
  // 球探误差：标准正态，显示区间的宽度看球探等级（refreshScout）
  p.sz=[gauss(0,1),gauss(0,1)];
  return p;
}
function genDraftClass(year){
  const arr=[]; for(let i=0;i<70;i++) arr.push(genProspect(i,year));
  arr.forEach(p=>PBYID[p.id]=p);
  return arr;
}

// ---------- 选秀权 ----------
function ensurePicks(year){ W.picks[year]=W.picks[year]||{1:{},2:{}}; [1,2].forEach(r=>{ for(let i=0;i<30;i++) if(W.picks[year][r][i]==null) W.picks[year][r][i]=i; }); }
function picksOwnedBy(ti){ const out=[]; Object.keys(W.picks).forEach(y=>[1,2].forEach(r=>Object.entries(W.picks[y][r]).forEach(([orig,own])=>{ if(own===ti) out.push({year:+y,round:r,orig:+orig}); }))); return out.sort((a,b)=>a.year-b.year||a.round-b.round); }
function pickLabel(pk){ return `${pk.year} 年${pk.round===1?'首轮':'次轮'}（${TEAMS[pk.orig].nick}）`; }

// ---------- 3. 抽签 ----------
const LOTTO=[140,140,140,125,105,90,75,60,45,30,20,15,10,5];
function runLottery(){
  const S=G.season, year=S.year+1; ensurePicks(year);
  const inPO=new Set(); S.po.series.filter(s=>s.round===1).forEach(s=>{ inPO.add(s.h); inPO.add(s.a); });
  const rec=i=>{ const f=S.final.find(x=>x.i===i); return f.w-f.l; };
  const non=TEAMS.map(t=>t.i).filter(i=>!inPO.has(i)).sort((a,b)=>rec(a)-rec(b)||rnd01()-.5);
  const po=TEAMS.map(t=>t.i).filter(i=>inPO.has(i)).sort((a,b)=>rec(a)-rec(b)||rnd01()-.5);
  const pool=non.map((i,k)=>({i,w:LOTTO[k]})), top=[];
  for(let k=0;k<4;k++){ let r=rnd01()*pool.reduce((s,x)=>s+x.w,0); const j=pool.findIndex(x=>(r-=x.w)<=0); top.push(pool[j].i); pool.splice(j,1); }
  const r1=[...top, ...pool.map(x=>x.i), ...po];
  const r2=[...non, ...po];
  const order=[]; r1.forEach((orig,k)=>order.push({no:k+1,round:1,orig,owner:W.picks[year][1][orig]}));
  r2.forEach((orig,k)=>order.push({no:31+k,round:2,orig,owner:W.picks[year][2][orig]}));
  return {year, order, lotto:non.map((i,k)=>({i,seedPos:k+1,got:r1.indexOf(i)+1}))};
}

// ---------- 4. 选秀 ----------
function rookieScale(no){ const C=CFG(W.off.year); if(no>30) return C.minSal; return Math.round((250+(1300-250)*Math.pow((30-no)/29,1.6))*capMul(W.off.year)); }
function aiDraftPick(ti){
  const cls=W.draftClass.filter(p=>!p.drafted);
  const t=TEAMS[ti]; const posCnt=p=>t.players.filter(x=>x.pos===p.pos).length;
  let best=null,bs=-1e9;
  cls.forEach(p=>{ const s=perceivedBy(p,ti)-posCnt(p)*.4+gauss(0,1.2); if(s>bs){bs=s;best=p;} });
  return best;
}
function draftPlayer(pk, p){
  const D=W.off.draft, yr=W.off.year;
  p.drafted=true; p.draft={year:D.year,round:pk.round,no:pk.no,team:pk.owner};
  const t=TEAMS[pk.owner];
  if(pk.round===1){ p.contract=[rookieScale(pk.no), yr+2, 'rk']; p.rkOpt=2; p.rk1=true; }
  else { p.contract=[CFG(yr).minSal, yr+2, 'rk']; p.rkOpt=0; p.rk1=false; }
  t.players.push(p); PBYID[p.id]=p; chemHit(pk.owner,.25); D.log.push({no:pk.no, round:pk.round, team:pk.owner, pid:p.id});
}
function draftAdvance(untilUser){ // 一直选到轮到玩家（或者选完）
  const D=W.off.draft;
  while(D.idx<D.order.length){
    const pk=D.order[D.idx];
    if(pk.owner===G.team && untilUser) return;
    const p=aiDraftPick(pk.owner); if(!p) break;
    draftPlayer(pk,p); D.idx++;
  }
  if(D.idx>=D.order.length) finishDraft();
}
function finishDraft(){
  const D=W.off.draft; if(D.done) return; D.done=true;
  // 没被选中的进自由市场
  W.draftClass.filter(p=>!p.drafted).forEach(p=>{ p.contract=null; FREE.push(p); });
  W.draftClass=[]; reindex();
}

// ---------- 5. 续约 ----------
function moodOf(p, ti){
  const S=G.season, q=S.ps[p.id], f=S.final.find(x=>x.i===ti);
  const mpg=q&&q.g? q.min/q.g : 0, wp=f? f.w/82 : .5;
  return clamp((1.25 - .2*clamp(mpg/30,0,1) - .15*wp)*(1+(60-mor(p))*.004), .9, 1.35);
}
function expiringOf(ti){ const yr=W.off.year; return TEAMS[ti].players.filter(p=>p.contract && p.contract[1]<=yr); }
// 到期类型：option 球队选项 / rfa 可发资格报价 / ufa 普通到期
function expType(p){ const c=p.contract; if(c && c[2]==='rk' && p.rkOpt>0) return 'option';
  if(c && c[2]==='rk' && p.rk1!==false && ageOf(p,W.off.year)<=25) return 'rfa'; return 'ufa'; }
function qoAmt(p){ return Math.max(Math.round(p.contract[0]*1.25), CFG(W.off.year).minSal*2); }
function exerciseOption(p){ p.contract=[Math.round(p.contract[0]*1.05), p.contract[1]+1, 'rk']; p.rkOpt--; }
function giveQO(p, ti, ask){ const qo=qoAmt(p); releaseToFA(p, ti, ask); p.rfa={team:ti, qo}; }
function signDirect(p, ti, amt, yrs, yr){ // 不受工资帽限制（伯德权、匹配报价单、资格报价）
  const i=FREE.indexOf(p); if(i>=0) FREE.splice(i,1);
  p.contract=[amt, yr+yrs, 'std']; delete p.fa; delete p.rfa; delete p.sheet; if(!TEAMS[ti].players.includes(p)){ TEAMS[ti].players.push(p); chemHit(ti,1); } PBYID[p.id]=p; TEAMS[ti]._rot=null; }
function makeAsk(p, ti){ const yr=W.off.year, age=ageOf(p,yr); return {amt:Math.round(marketSalary(p.ovr,age,yr)*moodOf(p,ti)), yrs:contractYears(age), mood:moodOf(p,ti), refuse:mor(p)<25||!!p.treq}; }
function playerValue(p, mode, year){ // 交易和续约通用的价值
  year=year||W.year; const age=ageOf(p,year);
  let eff=p.ovr; if(mode==='rebuild' && age<=24) eff=p.ovr+(p.pot-p.ovr)*.6; else if(age<=22) eff=p.ovr+(p.pot-p.ovr)*.25;
  let v=Math.pow(Math.max(0,eff-58),2.2);
  if(age>=31) v*=Math.max(.35, 1-(mode==='rebuild'?.1:.05)*(age-30));
  if(p.contract){ const yrs=Math.max(1,p.contract[1]-year); const surplus=(marketSalary(p.ovr,age,year)-p.contract[0])*yrs; v+=surplus*.06; }
  return v;
}
function teamMode(ti){ const rank=TEAMS.slice().sort((a,b)=>b.top8-a.top8).findIndex(t=>t.i===ti); return rank<12?'contend':'rebuild'; }
function aiResign(ti){
  const yr=W.off.year, C=CFG(yr), t=TEAMS[ti];
  expiringOf(ti).sort((a,b)=>b.ovr-a.ovr).forEach(p=>{
    const ask=makeAsk(p,ti); const worth=marketSalary(p.ovr,ageOf(p,yr),yr);
    const et=expType(p);
    if(et==='option'){ if(p.ovr>=66||p.pot>=78) exerciseOption(p); else releaseToFA(p,ti,ask); return; }
    if(et==='rfa'){ if(p.ovr>=68||p.pot>=80) giveQO(p,ti,ask); else releaseToFA(p,ti,ask); return; }
    const keep = !ask.refuse && t.players.filter(x=>x.contract && x.contract[1]>yr).length < 15 && payroll(t,yr)+ask.amt <= C.apron2 && (ask.amt<=worth*1.12) && p.ovr>=66 && rnd01()<.8;
    if(keep) p.contract=[ask.amt, yr+ask.yrs, 'std']; else releaseToFA(p, ti, ask);
  });
}
function releaseToFA(p, ti, ask){
  const t=TEAMS[ti]; t.players=t.players.filter(x=>x!==p); p.contract=null;
  const yr=W.off.year; const a=ask||{amt:marketSalary(p.ovr,ageOf(p,yr),yr), yrs:contractYears(ageOf(p,yr))};
  p.fa={ask:a.amt, yrs:a.yrs, from:ti}; FREE.push(p);
}

// ---------- 6. 自由市场 ----------
function faAsk(p){ const yr=W.off?W.off.year:W.year; if(!p.fa) p.fa={ask:marketSalary(p.ovr,ageOf(p,yr),yr), yrs:contractYears(ageOf(p,yr))}; return p.fa; }
function rosterCount(t, yr){ return t.players.filter(p=>p.contract && p.contract[1]>yr && p.contract[2]!=='tw').length; }
// 这份报价合不合规：返回 {ok, kind, why}
function offerRule(ti, amt, yr){
  const t=TEAMS[ti], C=CFG(yr), pay=payroll(t,yr), usedMLE=(W.mle[yr]||{})[ti];
  if(rosterCount(t,yr)>=15) return {ok:false, why:'阵容已满 15 人'};
  if(amt<=C.minSal) return {ok:true, kind:'底薪'};
  if(pay+amt<=C.cap) return {ok:true, kind:'工资帽空间'};
  if(!usedMLE && pay<C.apron1 && amt<=C.mleNT) return {ok:true, kind:'非纳税中产'};
  if(!usedMLE && pay<C.apron2 && amt<=C.mleTP) return {ok:true, kind:'纳税中产'};
  return {ok:false, why:`超出薪资帽规则（工资帽剩 ${money(Math.max(0,C.cap-pay))}，中产${usedMLE?'已用':pay<C.apron1?' '+money(C.mleNT):pay<C.apron2?' '+money(C.mleTP):'不可用'}）`};
}
function signFA(p, ti, amt, yrs, yr){
  const r=offerRule(ti,amt,yr); if(!r.ok) return r;
  if(r.kind && r.kind.includes('中产')){ W.mle[yr]=W.mle[yr]||{}; W.mle[yr][ti]=true; }
  const i=FREE.indexOf(p); if(i>=0) FREE.splice(i,1);
  p.contract=[amt, yr+yrs, 'std']; delete p.fa; TEAMS[ti].players.push(p); PBYID[p.id]=p; chemHit(ti,1);
  const t=TEAMS[ti]; t._rot=null; t.top8=t.players.slice().sort((a,b)=>b.ovr-a.ovr).slice(0,8).reduce((s,q)=>s+q.ovr,0)/Math.max(1,Math.min(8,t.players.length));
  return {ok:true, kind:r.kind};
}
function teamWinPct(ti){ const S=G.season; const f=S&&S.final&&S.final.find(x=>x.i===ti); return f? f.w/82 : .5; }
function roleOn(p, ti){ const better=TEAMS[ti].players.filter(x=>x.ovr>p.ovr).length; return better<5?1: better<8?.5:0; }
function faRound(){
  resolveSheets();
  const O=W.off, yr=O.year, rnd=O.faRound; const floor=[1,.93,.86,.8,.74][Math.min(4,rnd-1)];
  const offers={};           // pid -> [{ti, amt, yrs}]
  const add=(pid,o)=>{ (offers[pid]=offers[pid]||[]).push(o); };
  // 玩家的报价
  Object.entries(O.userOffers||{}).forEach(([pid,o])=>{ if(PBYID[pid] && FREE.includes(PBYID[pid])) add(pid,{ti:G.team, amt:o.amt, yrs:o.yrs}); });
  // AI 报价
  const pool=FREE.slice().sort((a,b)=>b.ovr-a.ovr);
  TEAMS.forEach(t=>{ if(t.i===G.team) return;
    const C=CFG(yr); let n=0; let pay=payroll(t,yr); let cnt=rosterCount(t,yr);
    const tenth=t.players.slice().sort((a,b)=>b.ovr-a.ovr)[9]; const bar = tenth? tenth.ovr : 0;
    for(const p of pool){
      if(n>=3 || cnt+n>=15) break;
      if(p.ovr<=bar && cnt>=13) continue;
      const a=faAsk(p); const want=Math.round(a.ask*floor);
      let amt=null;
      if(pay+want<=C.cap) amt=want;
      else if(!(W.mle[yr]||{})[t.i] && pay<C.apron1 && want<=C.mleNT) amt=want;
      else if(!(W.mle[yr]||{})[t.i] && pay<C.apron2 && want<=C.mleTP) amt=want;
      else if(want<=C.minSal*1.25 && cnt<14) amt=C.minSal;
      if(amt==null || rnd01()<.2) continue;
      add(p.id,{ti:t.i, amt, yrs:a.yrs}); n++; pay+=amt;
    }
  });
  // 球员挑报价
  const signed=[];
  Object.entries(offers).forEach(([pid,list])=>{
    const p=PBYID[pid]; if(!p || !FREE.includes(p) || p.sheet) return;
    const a=faAsk(p); const minOk=Math.round(a.ask*floor*.97);
    const ok=list.filter(o=>o.amt>=minOk || o.amt>=CFG(yr).minSal && a.ask*floor<=CFG(yr).minSal*1.05);
    if(!ok.length) return;
    ok.sort((x,y)=>y.amt*(1+.15*teamWinPct(y.ti)+.1*roleOn(p,y.ti)) - x.amt*(1+.15*teamWinPct(x.ti)+.1*roleOn(p,x.ti)));
    for(const o of ok){
      if(p.rfa && o.ti===p.rfa.team){ signDirect(p,o.ti,o.amt,o.yrs,yr); signed.push({pid:p.id, ti:o.ti, amt:o.amt, yrs:o.yrs, user:o.ti===G.team}); break; }
      if(p.rfa && offerRule(o.ti,o.amt,yr).ok){ // 报价单：原球队有匹配权
        const orig=p.rfa.team;
        if(orig===G.team){ W.off.sheets=W.off.sheets||[]; W.off.sheets.push({pid:p.id, ti:o.ti, amt:o.amt, yrs:o.yrs}); p.sheet=true; break; }
        const match = o.amt<=marketSalary(p.ovr,ageOf(p,yr),yr)*1.2 && payroll(TEAMS[orig],yr)+o.amt<=CFG(yr).apron2 && rosterCount(TEAMS[orig],yr)<15;
        if(match){ signDirect(p,orig,o.amt,o.yrs,yr); signed.push({pid:p.id, ti:orig, amt:o.amt, yrs:o.yrs, matched:o.ti, user:false}); addNews('匹配',`${TEAMS[orig].nick}匹配了${TEAMS[o.ti].nick}给 ${p.cn} 的报价单（${money(o.amt)} × ${o.yrs} 年）`); break; }
      }
      const r=signFA(p,o.ti,o.amt,o.yrs,yr); if(r.ok){ signed.push({pid:p.id, ti:o.ti, amt:o.amt, yrs:o.yrs, user:o.ti===G.team}); if(p.ovr>=80) addNews('签约',`${p.cn}（${p.ovr}）加盟${TEAMS[o.ti].nick}，${money(o.amt)} × ${o.yrs} 年`); break; }
    }
  });
  // 用户报价中被拒的
  const rejected=Object.keys(O.userOffers||{}).filter(pid=>!signed.some(s=>s.pid==pid && s.ti===G.team));
  O.userOffers={};
  FREE.forEach(p=>{ if(p.fa) p.fa.ask=Math.max(CFG(yr).minSal, Math.round(p.fa.ask*.93)); });
  return {signed, rejected};
}

// ---------- 7. 训练营：补人、裁人 ----------
function resolveSheets(){ const O=W.off; (O.sheets||[]).forEach(sh=>decideSheet(sh,false)); O.sheets=[]; }
function decideSheet(sh, match){
  const p=PBYID[sh.pid], yr=W.off.year; if(!p || !p.sheet) return;
  if(match){ signDirect(p,G.team,sh.amt,sh.yrs,yr); toast&&toast(`匹配成功，${p.cn}留队`); }
  else { delete p.sheet; delete p.rfa; const r=signFA(p,sh.ti,sh.amt,sh.yrs,yr); if(r.ok) addNews('签约',`${p.cn} 离开${TEAMS[G.team].nick}，加盟${TEAMS[sh.ti].nick}（${money(sh.amt)} × ${sh.yrs} 年）`); }
  W.off.sheets=(W.off.sheets||[]).filter(x=>x!==sh);
}
// 自由市场结束：还没人要的受限制自由球员按资格报价回原队
function settleRFA(){ const yr=W.off.year; FREE.slice().forEach(p=>{ if(p.rfa){ const t=p.rfa.team; if(rosterCount(TEAMS[t],yr)<15){ signDirect(p,t,p.rfa.qo,1,yr); if(t===G.team) (W.off.campLog=W.off.campLog||[]).push(`${p.cn} 接受资格报价留队`); } else { delete p.rfa; } } }); }
function campFill(){
  const yr=W.off.year, C=CFG(yr), log=[];
  TEAMS.forEach(t=>{
    // 超过 15 个正式合同：裁掉最差的（剩余合同算死钱）
    let std=t.players.filter(p=>p.contract && p.contract[2]!=='tw');
    while(std.length>15){ const w=std.sort((a,b)=>a.ovr-b.ovr)[0]; waive(w,t.i,yr); std=t.players.filter(p=>p.contract && p.contract[2]!=='tw'); if(t.i===G.team) log.push(`裁掉 ${w.cn}`); }
    // 少于 14 人：用底薪补
    while(t.players.filter(p=>p.contract && p.contract[2]!=='tw').length<14){
      const cand=FREE.slice().sort((a,b)=>b.ovr-a.ovr)[0]; if(!cand) break;
      const i=FREE.indexOf(cand); FREE.splice(i,1); cand.contract=[C.minSal, yr+1, 'std']; delete cand.fa; t.players.push(cand); chemHit(t.i,.5);
      if(t.i===G.team) log.push(`底薪签下 ${cand.cn}`);
    }
    // 双向合同过期的清掉
    t.players.filter(p=>p.contract && p.contract[2]==='tw' && p.contract[1]<=yr).forEach(p=>{ t.players=t.players.filter(x=>x!==p); p.contract=null; FREE.push(p); });
  });
  // 自由球员池只留 150 人，其余的（最差的）去海外打球
  if(FREE.length>150){ FREE.sort((a,b)=>b.ovr-a.ovr); FREE.splice(150); }
  reindex(); return log;
}
function waive(p, ti, yr){
  const t=TEAMS[ti]; const c=p.contract;
  if(c && c[1]>yr){ (W.dead[ti]=W.dead[ti]||[]).push({amt:c[0], exp:c[1], cn:p.cn}); }
  t.players=t.players.filter(x=>x!==p); p.contract=null; p.fa=null; FREE.push(p); t._rot=null;
}

// ---------- 流程控制 ----------
const OFF_STEPS=['赛季总结','选秀抽签','选秀大会','续约','自由市场','训练营'];
function startOffseason(){
  const S=G.season;
  W.off={step:0, year:S.year+1, report:null, lottery:null, draft:null, faRound:0, faLog:[], userOffers:{}, asks:{}};
  W.off.report=offSummary();
  ensurePicks(S.year+1); ensurePicks(S.year+2);
  ensureDraftClass(S.year+1);
  save();
}
function offNext(){
  const O=W.off;
  if(O.step===0){ O.lottery=runLottery(); O.step=1; }
  else if(O.step===1){ O.draft={year:O.lottery.year, order:O.lottery.order, idx:0, log:[], done:false}; O.step=2; draftAdvance(true); }
  else if(O.step===2){ if(!O.draft.done){ draftAdvance(false); } O.step=3; O.asks={}; expiringOf(G.team).forEach(p=>O.asks[p.id]=makeAsk(p,G.team));
    const n=2+Math.floor(rnd01()*3); for(let k=0;k<n;k++) tryAITrade(); }
  else if(O.step===3){ // 玩家没处理的：选项按 AI 标准处理，受限的发资格报价，其余放走；AI 自己续约
    expiringOf(G.team).forEach(p=>{ const et=expType(p);
      if(et==='option'){ if(p.ovr>=66||p.pot>=78) exerciseOption(p); else releaseToFA(p,G.team,O.asks[p.id]); }
      else if(et==='rfa') giveQO(p,G.team,O.asks[p.id]); else releaseToFA(p,G.team,O.asks[p.id]); });
    TEAMS.forEach(t=>{ if(t.i!==G.team) aiResign(t.i); });
    FREE.forEach(p=>faAsk(p)); O.step=4; O.faRound=1; }
  else if(O.step===4){ const r=faRound(); O.faLog.push(r); O.faRound++; if(O.faRound>5){ resolveSheets(); settleRFA(); O.step=5; const extra=O.campLog||[]; O.campLog=extra.concat(campFill()); } }
  else if(O.step===5){ startNewSeason(); return; }
  if(W.off && W.off.step<5) maybeUserOffer(.5);
  save();
}
function startNewSeason(){
  const O=W.off, y=O.year;
  // 旧的选秀权年份清掉，补上后年的
  Object.keys(W.picks).forEach(k=>{ if(+k<y+1) delete W.picks[k]; }); ensurePicks(y+1); ensurePicks(y+2);
  W.dead && Object.keys(W.dead).forEach(k=>W.dead[k]=W.dead[k].filter(d=>d.exp>y));
  W.off=null; FREE.forEach(p=>{ p.fa=null; delete p.rfa; delete p.sheet; });
  TEAMS.forEach(t=>{ t.aiRot=null; t._rot=null; t.players.forEach(p=>{ setMor(p,60+(mor(p)-60)*.5); }); });
  newSeason(y); G.rot=null; fixRot(); G.view='home'; save();
}
