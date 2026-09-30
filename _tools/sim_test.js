// 整季校准：node sim_test.js [赛季数] [种子]
const fs=require('fs'), path=require('path'), vm=require('vm');
const E=require('./engine.js');
const src=fs.readFileSync(path.join(__dirname,'real_data.js'),'utf8');
const ctx={}; vm.createContext(ctx); vm.runInContext(src+';this.D={LEAGUE_CFG,ATTR_DEF,OVR_W,OVR_STRETCH,TEAM_DATA,REAL_ROSTERS};',ctx);
const D=ctx.D, KEYS=D.ATTR_DEF.map(x=>x[0]);
const SEASONS=+(process.argv[2]||3), SEED=+(process.argv[3]||7);

let pid=1;
const teams=D.TEAM_DATA.map(t=>{
  const players=D.REAL_ROSTERS[t[0]].map(r=>{
    const [en,cn,pos,pos2,born,ht,ws,wt,nat,pot,dur,prof,a,c]=r;
    const A={}; KEYS.forEach((k,i)=>A[k]=a[i]);
    const p={id:pid++, en, cn, pos, pos2, ht, ws, a:A, dur, prof, contract:c};
    p.ovr=E.ovrOf(p,D.OVR_W,D.OVR_STRETCH,KEYS); return p;
  }).filter(p=>!p.contract || p.contract[2]!=='tw' || true);
  return {abbr:t[0], cn:t[3]+t[4], players};
});
E.setCenters(teams);
teams.forEach(t=>{ t.rotation=E.autoRotation(t); t.tactics=E.autoTactics(t,t.rotation); });

// 赛程：两两主客各一场（870）+ 每队 12 个额外主场（360）= 1230
const sched=[];
for(let i=0;i<30;i++) for(let j=0;j<30;j++) if(i!==j) sched.push([i,j]);
for(let k=1;k<=12;k++) for(let i=0;i<30;i++) sched.push([i,(i+k*2)%30===i?(i+1)%30:(i+k*2)%30]);

const L={g:0,pts:0,fga:0,fgm:0,tpa:0,tpm:0,fta:0,ftm:0,oreb:0,dreb:0,ast:0,tov:0,stl:0,blk:0,pf:0,poss:0,min:0};
const pl={}; const rec=teams.map(()=>({w:0,l:0})); let homeW=0, ots=0, games=0;
const rng=E.mulberry32(SEED);
const t0=Date.now();
for(let s=0;s<SEASONS;s++){
  for(const [h,a] of sched){
    const M=E.createMatch(teams[h],teams[a],{rng});
    E.run(M); games++;
    if(M.score[0]>M.score[1]){ homeW++; rec[h].w++; rec[a].l++; } else { rec[a].w++; rec[h].l++; }
    if(M.ot) ots++;
    M.teams.forEach(T=>{
      L.g++; L.pts+=M.score[T.side];
      let tov=0,fta=0,oreb=0,fga=0;
      T.men.forEach(m=>{
        ['fga','fgm','tpa','tpm','fta','ftm','oreb','dreb','ast','tov','stl','blk','pf'].forEach(k=>L[k]+=m[k]);
        L.min+=m.secs/60; tov+=m.tov; fta+=m.fta; oreb+=m.oreb; fga+=m.fga;
        const q=pl[m.id]||(pl[m.id]={p:m.p,team:teams[[h,a][T.side]].abbr,g:0,min:0,pts:0,reb:0,ast:0,blk:0,stl:0,fga:0,tpa:0,tpm:0,inj:0});
        if(m.secs>0){ q.g++; q.min+=m.secs/60; q.pts+=m.pts; q.reb+=m.oreb+m.dreb; q.ast+=m.ast; q.blk+=m.blk; q.stl+=m.stl; q.fga+=m.fga; q.tpa+=m.tpa; q.tpm+=m.tpm; }
        if(m.inj) q.inj++;
      });
      L.poss+=fga+.44*fta-oreb+tov;
    });
  }
}
const ms=(Date.now()-t0)/games;
const g=L.g, f=(x,d=1)=>x.toFixed(d), pc=x=>(x*100).toFixed(1)+'%';
const row=(name,val,lo,hi,real)=>`| ${name} | ${real} | ${val} | ${(+val.replace('%',''))>=lo&&(+val.replace('%',''))<=hi?'✓':'✗'} |`;
const out=[];
out.push(`# 引擎校准报告\n\n${SEASONS} 个赛季，${games} 场，单场平均 ${ms.toFixed(2)} 毫秒。\n`);
out.push('| 项 | 真实 | 模拟 | 达标 |\n|---|---|---|---|');
out.push(row('回合',f(L.poss/g),98,106,'101.8'));
out.push(row('得分',f(L.pts/g),111,120,'115.6'));
out.push(row('进攻效率',f(L.pts/L.poss*100),110,117,'113.5'));
out.push(row('出手',f(L.fga/g),86,92,'89.1'));
out.push(row('命中率',pc(L.fgm/L.fga),45.5,48.5,'47.1%'));
out.push(row('三分出手',f(L.tpa/g),34,40,'37.0'));
out.push(row('三分命中率',pc(L.tpm/L.tpa),35,37,'36.0%'));
out.push(row('两分命中率',pc((L.fgm-L.tpm)/(L.fga-L.tpa)),53.5,56.5,'55.0%'));
out.push(row('罚球',f(L.fta/g),21,26,'23.5'));
out.push(row('罚球命中率',pc(L.ftm/L.fta),76,80,'78.3%'));
out.push(row('前场篮板率',pc(L.oreb/(L.oreb+L.dreb)),24,28,'26.0%'));
out.push(row('助攻',f(L.ast/g),24,29,'26.7'));
out.push(row('助攻/命中',pc(L.ast/L.fgm),60,68,'63.7%'));
out.push(row('失误',f(L.tov/g),12.5,15,'13.8'));
out.push(row('失误率',pc(L.tov/L.poss),12.5,14.5,'13.5%'));
out.push(row('抢断',f(L.stl/g),7.5,9.5,'8.4'));
out.push(row('盖帽',f(L.blk/g),4.2,5.5,'4.8'));
out.push(row('犯规',f(L.pf/g),18,22,'19.9'));
out.push(row('上场时间合计',f(L.min/g),240,242.5,'241.3'));
out.push(row('主场胜率',pc(homeW/games),54,58,'—'));
out.push(row('加时占比',pc(ots/games),5,7,'—'));
const P=Object.values(pl).filter(q=>q.g>=58*SEASONS);
const lead=(k,label,real)=>{ const t=P.slice().sort((a,b)=>b[k]/b.g-a[k]/a.g); const v=i=>t[i]?f(t[i][k]/t[i].g):'-';
  out.push(`| ${label} | ${real} | ${t.slice(0,3).map(q=>q.p.cn+' '+f(q[k]/q.g)).join('、')} | ${v(9)} | ${v(29)} | ${v(99)} |`); };
out.push(`\n## 个人数据分布（场均，出场满 58 场的 ${P.length} 人）\n`);
out.push('| 项 | 真实 1/10/30/100 | 模拟前三 | 第10 | 第30 | 第100 |\n|---|---|---|---|---|---|');
lead('pts','得分','33.5/26.0/20.1/11.8'); lead('reb','篮板','12.9/9.0/7.0/4.4'); lead('ast','助攻','10.7/7.1/5.3/2.6');
lead('blk','盖帽','3.1/1.5/0.9/0.4'); lead('stl','抢断','2.0/1.5/1.2/0.9'); lead('min','上场时间','38.0/35.0/33.2/26.4');
out.push('\n## 战绩（每季平均）\n');
const st=teams.map((t,i)=>({t, w:rec[i].w/SEASONS, sys:t.tactics.system})).sort((a,b)=>b.w-a.w);
out.push(st.map(x=>`${x.t.cn} ${x.w.toFixed(1)}-${(82-x.w).toFixed(1)}（${E.SYSTEMS[x.sys].name}）`).join('；'));
const who=['Nikola Jokic','Luka Doncic','Shai Gilgeous-Alexander','Stephen Curry','Victor Wembanyama','Giannis Antetokounmpo','James Harden','Rudy Gobert'];
out.push('\n## 抽查（场均）\n\n| 球员 | 时间 | 得分 | 篮板 | 助攻 | 盖帽 | 三分 |\n|---|---|---|---|---|---|---|');
who.forEach(en=>{const q=Object.values(pl).find(x=>x.p.en===en); if(q) out.push(`| ${q.p.cn} | ${f(q.min/q.g)} | ${f(q.pts/q.g)} | ${f(q.reb/q.g)} | ${f(q.ast/q.g)} | ${f(q.blk/q.g)} | ${f(q.tpm/q.g)}/${f(q.tpa/q.g)} |`);});
const inj=Object.values(pl).reduce((s,q)=>s+q.inj,0)/SEASONS;
out.push(`\n场内受伤：每季 ${inj.toFixed(0)} 次。`);
const txt=out.join('\n'); fs.writeFileSync(path.join(__dirname,'校准报告.md'),txt+'\n'); console.log(txt);
