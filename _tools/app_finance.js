// ================= 财政：收入、奢侈税、老板上限 =================
// 规范：《第六阶段规范.md》§2
const TAX_BASE=[1.5,1.75,2.5,3.25], TAX_REP=[2.5,2.75,3.5,4.25];
function taxBand(year){ return Math.round(500*capMul(year)); }
function taxOf(pay, year, rep){
  let over=pay-CFG(year).tax; if(over<=0) return 0;
  const band=taxBand(year), R=rep?TAX_REP:TAX_BASE; let t=0, i=0;
  while(over>0){ const r= i<4? R[i] : R[3]+.5*(i-3); const x=Math.min(band,over); t+=x*r; over-=x; i++; }
  return Math.round(t);
}
function isRepeater(ti, year){ const h=((W.taxHist||{})[ti])||[]; return h.filter(y=>y>=year-4 && y<year).length>=3; }
function teamTax(ti, year){ year=year||W.year; return taxOf(payroll(TEAMS[ti],year), year, isRepeater(ti,year)); }
function mktF(ti){ return clamp(Math.sqrt(TEAMS[ti].pop)/Math.sqrt(19),0,1); }
// 老板能接受的总支出（工资 + 奢侈税）
function ownerLimit(ti, year){ year=year||W.year; return Math.round(CFG(year).tax + (1500+6000*mktF(ti))*capMul(year)); }
function spendOf(ti, year){ year=year||W.year; const pay=payroll(TEAMS[ti],year); return pay+taxOf(pay,year,isRepeater(ti,year)); }
function spendAfter(ti, addPay, year){ const pay=payroll(TEAMS[ti],year)+addPay; return pay+taxOf(pay,year,isRepeater(ti,year)); }
// 不超过上限，或者不比现在花得更多（已经超了的球队可以减支，但不能再加）
function ownerOk(ti, addPay, year, slack){ const after=spendAfter(ti,addPay,year); return after <= ownerLimit(ti,year)*(slack||1) || (addPay<=0); }

function leagueShare(year){ return Math.round(CFG(year).cap*.85); }
function localRev(ti, wp, year){ return Math.round(CFG(year).cap*(.35+.045*TEAMS[ti].pop)*(.75+.5*wp)); }
function homeGateRev(ti, year){ return Math.round(CFG(year).cap*.012*(1+TEAMS[ti].pop/10)); }
function opCost(year){ return Math.round(CFG(year).cap*.25); }
function homePlayoffGames(S, ti){ let n=0; (S.playin||[]).forEach(x=>{ if(x.h===ti && x.w!=null) n++; }); if(S.po) S.po.series.forEach(sr=>sr.games.forEach(g=>{ if(g.h===ti) n++; })); return n; }

// 本季财政（进行中是预计值，赛季结束后是结算值）
function finOf(ti){
  const S=G.season, year=S.year, R=standings()[ti], wp=R.g? R.w/R.g : .5;
  if(S.fin && S.fin[ti] && S.fin[ti].final) return S.fin[ti];
  const pay=S.fin&&S.fin[ti]? S.fin[ti].pay : payroll(TEAMS[ti],year), rep=isRepeater(ti,year);
  const tax=S.fin&&S.fin[ti]? S.fin[ti].tax : taxOf(pay,year,rep);
  const hg=homePlayoffGames(S,ti), share=S.fin&&S.fin[ti]? S.fin[ti].share||0 : 0;
  const rev={league:leagueShare(year), local:localRev(ti,wp,year), playoff:hg*homeGateRev(ti,year), share};
  const revT=rev.league+rev.local+rev.playoff+rev.share, cost=opCost(year);
  return {pay, tax, rep, rev, revT, cost, profit:revT-pay-tax-cost, spend:pay+tax, limit:ownerLimit(ti,year), hg, settled:!!(S.fin&&S.fin[ti])};
}
// 常规赛最后一天：按工资结算奢侈税，税款平分给没交税的球队
function settleTax(){
  const S=G.season, year=S.year; S.fin={}; W.taxHist=W.taxHist||{}; let pool=0; const payers=[];
  TEAMS.forEach(t=>{ const pay=payroll(t,year), rep=isRepeater(t.i,year), tax=taxOf(pay,year,rep); S.fin[t.i]={pay,tax,rep,share:0};
    if(tax>0){ pool+=tax; payers.push(t.i); (W.taxHist[t.i]=W.taxHist[t.i]||[]).push(year); } });
  const non=TEAMS.filter(t=>!payers.includes(t.i)); non.forEach(t=>S.fin[t.i].share=Math.round(pool/Math.max(1,non.length)));
  if(payers.length) addNews('奢侈税',`${year}-${String((year+1)%100).padStart(2,'0')} 赛季 ${payers.length} 队交了奢侈税，共 ${money(pool)}：${payers.map(i=>TEAMS[i].nick+' '+money(S.fin[i].tax)).join('，')}`);
  const me=S.fin[G.team]; S.inbox.push({d:S.day, t:'奢侈税结算', b: me.tax? `按常规赛最后一天的工资 ${money(me.pay)}，你交了 ${money(me.tax)} 奢侈税${me.rep?'（重复纳税，税率更高）':''}。` : `你没交奢侈税，分到其他球队交的奢侈税 ${money(me.share)}。`});
}
// 赛季结束：结算盈亏，超出老板上限扣信任度
function financeSeasonEnd(){
  const S=G.season; if(!S.fin) settleTax();
  TEAMS.forEach(t=>{ const f=finOf(t.i); S.fin[t.i]=Object.assign(f,{final:true}); });
  const f=S.fin[G.team]; let pen=0;
  const first=!(G.career||[]).some(c=>c.team===G.team && c.year===S.year-1);   // 接手第一季，老板不追究前任留下的合同
  if(f.spend>f.limit && !first) pen=Math.min(15, Math.max(1, Math.round((f.spend-f.limit)/f.limit*100)));
  return {pen, f, first};
}
function finMonthlyNote(){ const f=finOf(G.team); if(f.spend>f.limit) return `财政上，预计工资加奢侈税 ${money(f.spend)}，超出老板能接受的 ${money(f.limit)}。`; return ''; }

// ---------- 界面 ----------
ICON.fin='<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="1.5" y="3.5" width="13" height="9" rx="1.5"/><circle cx="8" cy="8" r="2"/><path d="M4 6v4M12 6v4"/></svg>';
function vFin(v){
  const S=G.season, t=myTeam(), year=W.off?W.off.year:S.year;
  const row=(n,x,cls)=>`<tr><td>${n}</td><td class="n ${cls||''}">${typeof x==='number'?money(x):x}</td></tr>`;
  let cur='';
  if(!W.off){ const f=finOf(G.team);
    cur=`<div class="card tw"><h3>${S.year}-${String((S.year+1)%100).padStart(2,'0')} 赛季 <span class="r">${f.final?'已结算':'按目前战绩预计'}</span></h3><table><tbody>
      ${row('联盟分成（全国转播、商品）',f.rev.league)}${row(`本地收入（门票、本地转播、赞助，${TEAMS[G.team].pop} 百万人口）`,f.rev.local)}${row(`季后赛主场 ${f.hg} 场`,f.rev.playoff)}${row('奢侈税分红',f.settled?f.rev.share:'常规赛结束时结算')}
      <tr><td><b>收入合计</b></td><td class="n"><b>${money(f.revT)}</b></td></tr>
      ${row('工资（含死钱）',-f.pay,'bad')}${row(`奢侈税${f.rep?'（重复纳税）':''}${f.settled?'':'，预计'}`,-f.tax,f.tax?'bad':'')}${row('运营成本',-f.cost,'bad')}
      <tr><td><b>盈亏</b></td><td class="n"><b class="${f.profit>=0?'good':'bad'}">${f.profit>=0?'+':''}${money(f.profit)}</b></td></tr></tbody></table></div>`; }
  const pay=payroll(t,year), rep=isRepeater(G.team,year), tax=taxOf(pay,year,rep), lim=ownerLimit(G.team,year), sp=pay+tax, C=CFG(year);
  const hist=(G.career||[]).filter(c=>c.fin);
  v.innerHTML=`<h1>财政</h1><div class="sub">NBA 没有转会费，花钱的地方是工资和奢侈税。老板看的是总支出和盈亏。</div>
   <div class="row"><div class="col" style="min-width:300px">${cur}
    <div class="card"><h3>老板的底线 <span class="r">${year}-${String((year+1)%100).padStart(2,'0')} 赛季工资</span></h3>
      <p>工资 <b>${money(pay)}</b> + 奢侈税 <b>${money(tax)}</b> = 总支出 <b class="${sp>lim?'bad':''}">${money(sp)}</b></p>
      <div class="fitbar" style="margin:8px 0">${bar(sp,lim*1.2,sp>lim?'#e5484d':sp>lim*.93?'#f0a020':'#00c276')}<b>${Math.round(sp/lim*100)}%</b></div>
      <p class="hint">老板能接受 ${money(lim)}，${sp>lim?`已经超出 <b class="bad">${money(sp-lim)}</b>。赛季结束时按超出比例扣信任度，每超 1% 扣 1 点，最多 15 点。接手的第一个赛季不追究，合同是前任签的。`:`还有 ${money(lim-sp)} 的余量。`}大城市的老板更舍得花钱。</p></div>
   </div>
   <div class="col" style="min-width:280px">
    <div class="card tw"><h3>奢侈税 <span class="r">税线 ${money(C.tax)}</span></h3><table><thead><tr><th>超出税线</th><th class="n">税率</th><th class="n">重复纳税</th></tr></thead><tbody>
      ${[0,1,2,3,4].map(i=>`<tr><td>${i<4?`${money(taxBand(year)*i)} – ${money(taxBand(year)*(i+1))}`:`${money(taxBand(year)*4)} 以上`}</td><td class="n">${i<4?TAX_BASE[i]:'3.75 起，每档 +0.5'}</td><td class="n">${i<4?TAX_REP[i]:'4.75 起'}</td></tr>`).join('')}</tbody></table>
      <p class="hint" style="margin-top:6px">常规赛最后一天按当时的工资结算。过去 4 季交过 3 季税算重复纳税，你现在${rep?'<b class="bad">是</b>':'不是'}。交来的税平分给没交税的球队。</p></div>
    ${hist.length?`<div class="card tw"><h3>往季</h3><table><thead><tr><th>赛季</th><th class="n">收入</th><th class="n">工资</th><th class="n">奢侈税</th><th class="n">盈亏</th></tr></thead><tbody>${hist.map(c=>`<tr><td>${c.year}</td><td class="n">${money(c.fin.revT)}</td><td class="n">${money(c.fin.pay)}</td><td class="n">${money(c.fin.tax)}</td><td class="n ${c.fin.profit>=0?'good':'bad'}">${c.fin.profit>=0?'+':''}${money(c.fin.profit)}</td></tr>`).join('')}</tbody></table></div>`:''}
   </div></div>`;
}
