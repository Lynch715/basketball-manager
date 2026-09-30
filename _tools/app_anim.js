// ================= 比赛跑动动画 =================
// 规范：《第二阶段规范.md》§3。引擎先算出一个回合的结果，这里把结果「演」出来，不影响结果。
// 坐标：全场 94×50 英尺。主队（side 0）一直向右攻，篮筐在 x=88.75；客队向左攻，篮筐在 x=5.25。

const RIM=[88.75, 5.25];
// 落位点：dx = 离篮筐的纵深，lat = 横向（正数在进攻方的右手边）
const SPOTS={
  bal:   {PG:[25,0],  SG:[17,-17], SF:[17,17],  PF:[15,8],  C:[4,-7]},
  motion:{PG:[24,4],  SG:[11,-19], SF:[19,15],  PF:[17,-6], C:[8,7]},
  spread:{PG:[26,0],  SG:[18,-17], SF:[18,17],  PF:[2,-22], C:[2,22]},
  pnr:   {PG:[27,-3], SG:[17,-18], SF:[2,22],   PF:[2,-22], C:[24,2]},
  iso:   {PG:[23,12], SG:[3,22],   SF:[19,-16], PF:[13,21], C:[4,14]},
  post:  {PG:[25,2],  SG:[18,17],  SF:[3,-22],  PF:[17,-14],C:[5,-8]},
};
const ZONE23={PG:[19,-7], SG:[19,7], SF:[7,-13], PF:[7,13], C:[4,0]};
const FTSPOT=[15,0], FT_LANE=[[7,-8],[7,8],[11,-8],[11,8],[26,-10],[26,10],[29,0]];

function toXY(side, dx, lat){ return side===0? [RIM[0]-dx, 25+lat] : [RIM[1]+dx, 25-lat]; }
function fromEvXY(side, e){ return toXY(side, e.y, e.x); }        // 引擎事件的 (x 横向, y 纵深)
function jit(v){ return v+(Math.random()-.5)*2.2; }

// ---------- 场景：一串「瞬间」，渲染时在相邻两个瞬间之间插值 ----------
function captureBefore(M){
  return { poss:M.poss, clock:M.clock, q:M.q,
    on:M.teams.map(T=>T.on.map(m=>({id:m.id, slot:m.slot}))),
    sys:M.teams.map(T=>T.tac.system), def:M.teams.map(T=>T.tac.defense), last:M.last,
    mu:M.teams.map(T=>Object.assign({},T.tac.matchups||{})) };
}
function buildScene(L, B, evs, after){
  const O=B.poss, D=1-O, moments=[];
  const pos=Object.assign({}, L.pos);
  const onO=B.on[O], onD=B.on[D];
  // 新上场的球员从技术台（场边）走进来
  [...onO,...onD].forEach(x=>{ if(!pos[x.id]) pos[x.id]=[47+(Math.random()-.5)*8, 52]; });
  let ball=L.ball? L.ball.slice() : [47,25,0], holder=L.holder;
  const slotOf={}; onO.forEach(x=>slotOf[x.id]=x.slot); onD.forEach(x=>slotOf[x.id]=x.slot);
  const spots=SPOTS[B.sys[O]]||SPOTS.bal;
  const formation=()=>{ const p={}; onO.forEach(x=>{ const s=spots[x.slot]||[20,0]; const xy=toXY(O,s[0],s[1]); p[x.id]=[jit(xy[0]),jit(xy[1])]; }); return p; };
  // 防守：人盯人站在对位人和篮筐之间；联防站区域；紧逼在推进阶段就上抢
  const guard=(offPos, stage)=>{
    const p={}, rim=[RIM[O],25];
    if(B.def[D]==='zone' && stage!=='press'){ onD.forEach(x=>{ const s=ZONE23[x.slot]||[10,0]; const xy=toXY(O,s[0],s[1]); p[x.id]=[jit(xy[0]),jit(xy[1])]; }); return p; }
    const bh = holder && offPos[holder] ? offPos[holder] : null;
    onD.forEach((x,k)=>{
      let tgt=onO.find(o=>B.mu[D][x.id]===o.id) || onO.find(o=>o.slot===x.slot) || onO[k];
      const op=offPos[tgt.id]||[47,25];
      if(stage==='press'){ p[x.id]=[op[0]+(rim[0]-op[0])*.08, op[1]+(rim[1]-op[1])*.08]; return; }
      const onBall = tgt.id===holder;
      const d=Math.hypot(rim[0]-op[0],rim[1]-op[1])||1, gap=Math.min(d*.5, onBall?3.5:6);
      let px=op[0]+(rim[0]-op[0])/d*gap, py=op[1]+(rim[1]-op[1])/d*gap;
      if(!onBall && bh){ px+=(bh[0]-px)*.18; py+=(bh[1]-py)*.18; }        // 无球防守向球收缩
      p[x.id]=[px+(Math.random()-.5)*.6, py+(Math.random()-.5)*.6];
    });
    return p;
  };
  const push=(w, offPos, defPos, ballPos, h, extra)=>{ Object.assign(pos, offPos, defPos, extra||{}); moments.push({w, pos:Object.assign({},pos), ball:ballPos.concat([h||0]), holder}); };
  const at=id=>pos[id];
  const handler=(onO.find(x=>x.slot==='PG')||onO[0]).id;
  let off=formation(), started=false;
  const setup=(fast)=>{
    if(started) return; started=true;
    if(fast){ // 快攻：进攻方直接冲向篮下
      const o={}; onO.forEach(x=>{ const cur=pos[x.id]; const xy=toXY(O, 18+Math.random()*20, (Math.random()-.5)*30); o[x.id]=[ (cur[0]+xy[0])/2, (cur[1]+xy[1])/2 ]; });
      holder=handler; push(.8,o,guard(o,'press'),at(handler)||[47,25]); return; }
    // 推进：持球人过半场，其他人往落位点跑
    const mid={}; onO.forEach(x=>{ const cur=pos[x.id], t=off[x.id]; mid[x.id]=[ cur[0]+(t[0]-cur[0])*.55, cur[1]+(t[1]-cur[1])*.55 ]; });
    holder=handler; const hp=mid[handler];
    push(1.0, mid, guard(mid, B.def[D]==='press'?'press':'half'), hp);
    holder=handler; push(.9, off, guard(off,'half'), off[handler]);
  };
  const ftLayout=(shooter)=>{
    const o={}, d={}; const s=toXY(O,FTSPOT[0],FTSPOT[1]); o[shooter]=[s[0],s[1]];
    const others=[...onO.filter(x=>x.id!==shooter).map(x=>x.id), ...onD.map(x=>x.id)]; let k=0;
    const dl=onD.map(x=>x.id);
    others.forEach(id=>{ const sp=FT_LANE[k%FT_LANE.length]; const xy=toXY(O,sp[0],sp[1]); (dl.includes(id)?d:o)[id]=[xy[0],xy[1]]; k++; });
    return [o,d];
  };
  let firstShot=true;
  for(let i=0;i<evs.length;i++){
    const e=evs[i];
    if(e.type==='made'||e.type==='miss'||e.type==='blk'||e.type==='sfoul'){
      const fast = e.shot==='fast';
      const putback = e.shot==='putback';
      if(!putback) setup(fast);
      const sh=e.pid, spot=e.x!=null? fromEvXY(O,e): at(sh);
      // 传球：持球人 → 助攻人 → 出手人
      if(!putback){
        if(e.ast && e.ast!==holder){ holder=e.ast; push(.45, off, guard(off,'half'), at(e.ast)||off[e.ast]||[47,25], 3); }
        if(holder!==sh){ holder=sh; push(.45, off, guard(off,'half'), off[sh]||at(sh), 3); }
      }
      // 出手人移动到出手点，防守人贴上去
      const o2=Object.assign({}, putback? {} : off); o2[sh]=spot.slice();
      const d2=putback? {} : guard(o2,'half');
      const dfd = e.by && e.type==='blk' ? e.by : (e.type==='sfoul'?e.by:null);
      if(dfd){ d2[dfd]=[spot[0]+(RIM[O]-spot[0])*.12, spot[1]+(25-spot[1])*.12]; }
      holder=sh; push(putback?.3:.55, o2, d2, spot, 1);
      // 出手
      holder=null;
      if(e.type==='blk'){ const mid=[spot[0]+(RIM[O]-spot[0])*.25, spot[1]+(25-spot[1])*.25]; push(.3,{},{},mid,6); const away=[mid[0]+(Math.random()-.5)*12, mid[1]+(Math.random()-.5)*12]; push(.3,{},{},away,0); ball=away; }
      else if(e.type==='sfoul'){ push(.3,{},{},[spot[0]+(RIM[O]-spot[0])*.4, spot[1]+(25-spot[1])*.4],7); }
      else {
        const dist=Math.hypot(RIM[O]-spot[0],25-spot[1]);
        push(fast||putback?.3:.25+dist/90, {}, {}, [RIM[O],25], 12);          // 球飞到篮筐
        if(e.type==='made'){ push(.3,{},{},[RIM[O]+(O===0?-.5:.5),25],0); }
        else { const bounce=[RIM[O]+(O===0?-1:1)*(3+Math.random()*6), 25+(Math.random()-.5)*14]; push(.2,{},{},bounce,6); ball=bounce; }
      }
      firstShot=false; continue;
    }
    if(e.type==='oreb'||e.type==='dreb'){
      const target = moments.length? moments[moments.length-1].ball.slice(0,2) : [RIM[O]+(O===0?-4:4),25];
      const r={}; r[e.pid]=target; holder=e.pid; push(.35,{},{},target,0,r); continue;
    }
    if(e.type==='stl'||e.type==='tov'){
      setup(false);
      if(e.type==='stl'){ const s=at(e.by)||[47,25]; const p=at(e.pid)||[47,25]; const mid=[(s[0]+p[0])/2,(s[1]+p[1])/2]; const r={}; r[e.by]=mid; holder=e.by; push(.45,{},{},mid,0,r); }
      else { const out=[at(holder||handler)[0], Math.random()<.5?-1:51]; holder=null; push(.45,{},{},out,0); }
      continue;
    }
    if(e.type==='ft'){
      const [o,d]=ftLayout(e.pid); holder=e.pid; const s=o[e.pid];
      push(.6,o,d,s,1);
      for(let k=0;k<e.n;k++){ holder=null; push(.35,{},{},[RIM[O],25],10); push(.2,{},{},k<e.made?[RIM[O]+(O===0?-.5:.5),25]:[RIM[O]+(O===0?-3:3),25+(Math.random()-.5)*6],0); if(k<e.n-1){ holder=e.pid; push(.25,{},{},s,1); } }
      continue;
    }
    if(e.type==='pf'||e.type==='ifoul'){ setup(false); const who=e.type==='ifoul'?e.on:holder||handler; const d={}; const tp=at(who)||[47,25]; d[e.pid]=[tp[0]+1,tp[1]+1]; push(.4,{},d,tp,0); continue; }
  }
  if(!moments.length){ setup(false); }
  // 结尾保留 0.2 让画面停一下
  moments.push(Object.assign({}, moments[moments.length-1], {w:.25}));
  const total=moments.reduce((s,m)=>s+m.w,0); let acc=0;
  moments.forEach(m=>{ acc+=m.w; m.t=acc/total; });
  // 事件在最后一次出手落地时揭晓
  let revealAt=.88;
  return {moments, start:{pos:Object.assign({},L.pos), ball:(L.ball||[47,25,0]).slice(), holder:L.holder}, revealAt, clock0:B.clock, clock1:after.clock, q:B.q, sides:[B.on[0].map(x=>x.id),B.on[1].map(x=>x.id)]};
}

// ---------- 渲染 ----------
const ease=t=>t<.5?2*t*t:1-Math.pow(-2*t+2,2)/2;
function frameAt(sc, t){
  const ms=sc.moments; let prev={t:0,pos:sc.start.pos,ball:sc.start.ball,holder:sc.start.holder}, next=ms[0];
  for(let i=0;i<ms.length;i++){ if(t<=ms[i].t){ next=ms[i]; prev=i?ms[i-1]:prev; break; } prev=ms[i]; next=ms[i]; }
  const span=Math.max(1e-6,next.t-prev.t), u=ease(clamp((t-prev.t)/span,0,1));
  const pos={}; const ids=new Set([...Object.keys(next.pos||{}), ...Object.keys(prev.pos||{})]);
  ids.forEach(id=>{ const a=(prev.pos||{})[id]||(next.pos||{})[id], b=(next.pos||{})[id]||a; pos[id]=[a[0]+(b[0]-a[0])*u, a[1]+(b[1]-a[1])*u]; });
  const a=prev.ball||[47,25,0], b=next.ball||a;
  let bx=a[0]+(b[0]-a[0])*u, by=a[1]+(b[1]-a[1])*u, bh=(a[2]||0)+((b[2]||0)-(a[2]||0))*u;
  if((b[2]||0)>=10) bh = Math.sin(u*Math.PI)*6 + (b[2]||0)*u;       // 投篮弧线
  const holder = u>.85? next.holder : prev.holder;
  if(holder && pos[holder]){ bx=pos[holder][0]+.9; by=pos[holder][1]-.6; bh=1; }
  return {pos, ball:[bx,by,bh], holder};
}

function drawCourt(){
  const c=document.getElementById('court'); if(!c||!LIVE) return; const g=c.getContext('2d'), W=c.width, H=c.height, k=W/94;
  const X=v=>v*k, Y=v=>v*k;
  g.clearRect(0,0,W,H); g.fillStyle='#3a2a1c'; g.fillRect(0,0,W,H);
  g.strokeStyle='rgba(255,240,220,.5)'; g.lineWidth=Math.max(1.5,k*.16);
  g.strokeRect(X(0),Y(0),X(94),Y(50));
  g.beginPath(); g.moveTo(X(47),0); g.lineTo(X(47),Y(50)); g.stroke();
  g.beginPath(); g.arc(X(47),Y(25),X(6),0,Math.PI*2); g.stroke();
  [[94,-1],[0,1]].forEach(([base,dir])=>{
    const bx=base+dir*5.25;
    g.fillStyle='rgba(255,138,31,.09)'; g.fillRect(X(Math.min(base,base+dir*19)),Y(17),X(19),Y(16)); g.strokeRect(X(Math.min(base,base+dir*19)),Y(17),X(19),Y(16));
    g.beginPath(); g.arc(X(base+dir*19),Y(25),X(6),0,Math.PI*2); g.stroke();
    g.beginPath(); g.moveTo(X(base),Y(3)); g.lineTo(X(base+dir*14),Y(3)); g.stroke();
    g.beginPath(); g.moveTo(X(base),Y(47)); g.lineTo(X(base+dir*14),Y(47)); g.stroke();
    const a=Math.asin(22/23.75); g.beginPath();
    for(let t=-a;t<=a+1e-6;t+=a/40){ const x=bx+dir*Math.cos(t)*23.75, y=25+Math.sin(t)*23.75; t===-a?g.moveTo(X(x),Y(y)):g.lineTo(X(x),Y(y)); } g.stroke();
    g.strokeStyle='#ff8a1f'; g.beginPath(); g.arc(X(bx),Y(25),X(.75),0,Math.PI*2); g.stroke();
    g.beginPath(); g.moveTo(X(base+dir*4),Y(22)); g.lineTo(X(base+dir*4),Y(28)); g.stroke(); g.strokeStyle='rgba(255,240,220,.5)';
  });
  const M=LIVE.M;
  // 本节出手点（淡）
  g.globalAlpha=.45;
  LIVE.dots.forEach(d=>{ if(d.q!==M.q && !M.done) return; const xy=fromEvXY(d.t,d); const col=colorOf(teamOf(d.t),d.t);
    g.beginPath(); g.arc(X(xy[0]),Y(xy[1]),X(.6),0,Math.PI*2); if(d.made){ g.fillStyle=col; g.fill(); } else { g.strokeStyle=col; g.lineWidth=Math.max(1,k*.12); g.stroke(); } });
  g.globalAlpha=1;
  // 球员和球
  const fr=LIVE.frame; if(!fr) return;
  const sides=LIVE.scene? LIVE.scene.sides : M.teams.map(T=>T.on.map(m=>m.id));
  sides.forEach((ids,s)=>{ const col=colorOf(teamOf(s),s);
    ids.forEach(id=>{ const p=fr.pos[id]; if(!p) return; const pl=PBYID[id];
      g.beginPath(); g.arc(X(p[0]),Y(p[1]),X(1.45),0,Math.PI*2); g.fillStyle=col; g.fill();
      g.lineWidth=Math.max(1.5,k*.14); g.strokeStyle= fr.holder==id? '#ffffff' : 'rgba(0,0,0,.55)'; g.stroke();
      if(fr.holder==id){ g.beginPath(); g.arc(X(p[0]),Y(p[1]),X(2.1),0,Math.PI*2); g.strokeStyle='rgba(255,255,255,.7)'; g.stroke(); }
      g.fillStyle=lumOf(col)>150?'#111':'#fff'; g.font=`bold ${Math.round(X(1.35))}px -apple-system,sans-serif`; g.textAlign='center'; g.textBaseline='middle';
      g.fillText(pl&&pl.jersey!=null&&pl.jersey!==''?pl.jersey:sn(pl||{cn:'?'}).slice(0,1), X(p[0]), Y(p[1])+1);
      if(LIVE.showNames){ g.font=`${Math.round(X(1.1))}px -apple-system,sans-serif`; g.fillStyle='rgba(255,255,255,.85)'; g.fillText(sn(pl), X(p[0]), Y(p[1]+2.5)); }
    }); });
  const b=fr.ball; const r=.62+b[2]*.05;
  g.beginPath(); g.arc(X(b[0]),Y(b[1]+.25),X(.55),0,Math.PI*2); g.fillStyle='rgba(0,0,0,.35)'; g.fill();
  g.beginPath(); g.arc(X(b[0]),Y(b[1]-b[2]*.12),X(r),0,Math.PI*2); g.fillStyle='#ff8a1f'; g.fill(); g.strokeStyle='#3a1a00'; g.lineWidth=Math.max(1,k*.08); g.stroke();
}
function lumOf(h){ const n=parseInt(h.slice(1),16); return .299*(n>>16&255)+.587*(n>>8&255)+.114*(n&255); }

// ---------- 播放循环（替换 app_main 里的版本） ----------
function sceneDur(){ return 2300/LIVE.speed; }
function tick(now){
  const L=LIVE; if(!L || !L.playing) return;
  const M=L.M;
  if(L.speed>=8){ // 8x：不播动画
    const dt=now-L.last; L.last=now; L.acc+=dt; let n=0;
    while(L.acc>=120 && !M.done && n<3){ L.acc-=120; E.step(M); n++; }
    L.revealTo=null; L.scene=null; L.frame=idleFrame(); if(n) updLive();
    if(M.done){ finishLive(); return; } L.raf=requestAnimationFrame(tick); return;
  }
  if(!L.scene || now-L.sceneStart>=L.sceneLen){
    if(L.scene){ const end=frameAt(L.scene,1); L.pos=end.pos; L.ball=end.ball; L.holder=end.holder; L.revealTo=null; updLive(); }
    if(M.done){ finishLive(); return; }
    const B=captureBefore(M), n0=M.events.length;
    E.step(M);
    const evs=M.events.slice(n0).filter(e=>e.type!=='sub'&&e.type!=='timeout'&&e.type!=='eoq'&&e.type!=='injury'&&e.type!=='foulout');
    L.scene=buildScene(L,B,evs,{clock:M.clock});
    const weight=Math.min(1.6, Math.max(.45, L.scene.moments.reduce((s,m)=>s+m.w,0)/3.2));
    L.sceneLen=sceneDur()*weight; L.sceneStart=now; L.revealTo=n0; L.sceneEvStart=n0;
  }
  const t=clamp((now-L.sceneStart)/L.sceneLen,0,1);
  L.frame=frameAt(L.scene,t);
  if(t>=L.scene.revealAt && L.revealTo!==null){ L.revealTo=null; updLive(); }
  // 比赛时钟随动画走
  const clk=document.getElementById('clk'); if(clk && !M.done){ const c=L.scene.clock0+(Math.max(0,L.scene.clock1)-L.scene.clock0)*t; clk.innerHTML=`<b>${clockTxt(L.scene.q, c<0?0:c)}</b>`; }
  drawCourt();
  L.raf=requestAnimationFrame(tick);
}
function idleFrame(){ const M=LIVE.M, pos={}; M.teams.forEach((T,s)=>T.on.forEach(m=>{ const sp=(SPOTS[T.tac.system]||SPOTS.bal)[m.slot]||[20,0]; const side=M.poss; const xy= s===side? toXY(side,sp[0],sp[1]) : toXY(side,sp[0]*.7,sp[1]*.8); pos[m.id]=xy; }));
  const h=M.teams[M.poss].on[0]; return {pos, ball:[pos[h.id][0]+.9,pos[h.id][1]-.6,1], holder:h.id}; }
function simToEnd(){ if(!LIVE) return; stopLive(); E.run(LIVE.M); LIVE.revealTo=null; LIVE.scene=null; LIVE.frame=idleFrame(); updLive(); finishLive(); }

function tipFrame(M){ // 开场跳球：两名中锋在中圈，其余人围在中圈外
  const pos={}; M.teams.forEach((T,s)=>T.on.forEach((m,k)=>{ const dir=s===0?-1:1;
    if(m.slot==='C'){ pos[m.id]=[47+dir*1.3,25]; return; }
    const ang=[-.9,-.35,.35,.9][k%4]; pos[m.id]=[47+dir*(8+Math.cos(ang)*3), 25+Math.sin(ang)*14]; }));
  return {pos, ball:[47,25,3], holder:null};
}
