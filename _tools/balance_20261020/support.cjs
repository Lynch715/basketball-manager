const fs=require('fs'), path=require('path'), vm=require('vm');
const root=path.resolve(__dirname,'..');
function teamsFor(E){
  const c={}; vm.createContext(c);
  vm.runInContext(fs.readFileSync(path.join(root,'real_data.js'),'utf8')+';this.data={ATTR_DEF,OVR_W,OVR_STRETCH,TEAM_DATA,REAL_ROSTERS};',c);
  const D=c.data, keys=D.ATTR_DEF.map(x=>x[0]); let id=1;
  const teams=D.TEAM_DATA.map(t=>({abbr:t[0],players:D.REAL_ROSTERS[t[0]].map(r=>{
    const p={id:id++,cn:r[1],pos:r[2],pos2:r[3],ht:r[5],ws:r[6],dur:r[10],a:Object.fromEntries(keys.map((k,i)=>[k,r[12][i]]))};
    p.ovr=E.ovrOf(p,D.OVR_W,D.OVR_STRETCH,keys); return p;
  })}));
  E.setCenters(teams);
  teams.forEach(t=>{t.rotation=E.autoRotation(t);t.tactics=E.autoTactics(t,t.rotation);});
  return {teams,keys,D};
}
function instrumentedEngine(){
  const c={module:{exports:{}}}; vm.createContext(c);
  // 测试内访问分支入口，不改变浏览器或生产模块导出的接口。
  const src=fs.readFileSync(path.join(root,'engine.js'),'utf8').replace('const API={P,','const API={refresh,finishFT,takeShot,possession,P,');
  vm.runInContext(src,c); return c.module.exports;
}
function appContext(storage=new Map(),seed=42){
  const E=require('../engine.js'),math=Object.create(Math);math.random=E.mulberry32(seed);
  class AuditDate extends Date {static now(){return 1792454400000+seed*1009;}}
  const c={console,Date:AuditDate,Math:math,BBEngine:E,localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},document:{addEventListener(){}},window:{addEventListener(){}},navigator:{},location:{reload(){}},setTimeout:()=>0,clearTimeout(){},setInterval:()=>0,clearInterval(){}};
  vm.createContext(c);
  for(const f of ['real_data.js','app_main.js','app_season.js','app_season_ui.js','app_offseason.js','app_offseason_ui.js','app_trade.js','app_cba.js','app_ai_trade.js','app_finance.js','app_life.js','app_events.js']) vm.runInContext(fs.readFileSync(path.join(root,f),'utf8'),c,{filename:f});
  vm.runInContext('toast=()=>{};G.team=0;fixRot();',c);
  return {storage,run:s=>vm.runInContext(s,c)};
}
module.exports={root,teamsFor,instrumentedEngine,appContext,clone:x=>JSON.parse(JSON.stringify(x))};
