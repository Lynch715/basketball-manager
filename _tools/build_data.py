#!/usr/bin/env python3
"""《篮球经理》数据构建：读 data/ 下两份原始数据 + 别名表 + 中文名表，输出 real_data.js 和校验报告。
用法：python3 build_data.py  （在 _tools/ 目录下运行，原始数据在 ../data/）
"""
import csv, json, re, unicodedata, hashlib, statistics as st, os, collections
import numpy as np
from scipy.optimize import nnls

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, '..', 'data')
CSV2K = os.path.join(DATA, 'nba2k27_players.csv')
BBGM = os.path.join(DATA, 'bbgm_2025-26_roster.json')
NAME_CN = os.path.join(HERE, 'name_cn.json')
OUT_JS = os.path.join(HERE, 'real_data.js')
OUT_REPORT = os.path.join(HERE, '校验报告.md')

SEASON = 2026            # 2026-27 赛季，合同 exp=2027 表示打完 2026-27 到期
AGE_REF = (2026, 10, 1)
CAP, TAX, APRON1, APRON2, MINPAY = 16496, 20043, 20902, 22169, 14847   # 万美元
MIN_SAL, MAX_SAL = 140, round(CAP * 0.35)                             # 最低薪约 140 万（估）

# ---------- 21 项属性：由 2K 哪几项合成 ----------
ATTR = [
 ('finish','上篮终结',{'layup':.45,'close_shot':.35,'draw_foul':.2}),
 ('dunk','扣篮',{'driving_dunk':.6,'standing_dunk':.4}),
 ('mid','中投',{'mid_range_shot':.8,'post_fade':.2}),
 ('three','三分',{'three_point_shot':1}),
 ('ft','罚球',{'free_throw':1}),
 ('handle','控球',{'ball_handle':.6,'speed_with_ball':.25,'hands':.15}),
 ('pass','传球',{'pass_accuracy':.4,'pass_vision':.3,'pass_iq':.3}),
 ('post','背身',{'post_hook':.35,'post_fade':.3,'post_control':.35}),
 ('perD','外线防守',{'perimeter_defense':1}),
 ('intD','内线防守',{'interior_defense':1}),
 ('stl','抢断',{'steal':.7,'pass_perception':.3}),
 ('blk','盖帽',{'block':1}),
 ('oreb','前场篮板',{'offensive_rebound':1}),
 ('dreb','后场篮板',{'defensive_rebound':1}),
 ('spd','速度',{'speed':.6,'agility':.4}),
 ('jmp','弹跳',{'vertical':1}),
 ('str','力量',{'strength':1}),
 ('sta','体能',{'stamina':1}),
 ('oiq','进攻意识',{'shot_iq':.5,'offensive_consistency':.5}),
 ('diq','防守意识',{'help_defense_iq':.5,'defensive_consistency':.5}),
 ('hustle','拼劲',{'hustle':1}),
]
KEYS = [a[0] for a in ATTR]
RAW2K = sorted({k for a in ATTR for k in a[2]} | {'overall_durability'})
POS = ['PG','SG','SF','PF','C']
POT_ROOM = {'A+':15,'A':11,'A-':8,'B+':5,'B':3,'B-':2,'':3}

ALIAS = {  # 2K 写法 -> BBGM 写法
 'Nicolas Claxton':'Nic Claxton','Mohamed Bamba':'Mo Bamba','Alexandre Sarr':'Alex Sarr',
 'Carlton Carrington':'Bub Carrington','Cameron Thomas':'Cam Thomas','Robert Dillingham':'Rob Dillingham',
 'Yang Hansen':'Hansen Yang',
}

TEAMS = [  # 缩写, 中文城市, 中文队名, 联盟, 赛区
 ('ATL','亚特兰大','老鹰','东','东南'),('BOS','波士顿','凯尔特人','东','大西洋'),('BKN','布鲁克林','篮网','东','大西洋'),
 ('CHA','夏洛特','黄蜂','东','东南'),('CHI','芝加哥','公牛','东','中部'),('CLE','克利夫兰','骑士','东','中部'),
 ('DAL','达拉斯','独行侠','西','西南'),('DEN','丹佛','掘金','西','西北'),('DET','底特律','活塞','东','中部'),
 ('GSW','金州','勇士','西','太平洋'),('HOU','休斯顿','火箭','西','西南'),('IND','印第安纳','步行者','东','中部'),
 ('LAC','洛杉矶','快船','西','太平洋'),('LAL','洛杉矶','湖人','西','太平洋'),('MEM','孟菲斯','灰熊','西','西南'),
 ('MIA','迈阿密','热火','东','东南'),('MIL','密尔沃基','雄鹿','东','中部'),('MIN','明尼苏达','森林狼','西','西北'),
 ('NOP','新奥尔良','鹈鹕','西','西南'),('NYK','纽约','尼克斯','东','大西洋'),('OKC','俄克拉荷马城','雷霆','西','西北'),
 ('ORL','奥兰多','魔术','东','东南'),('PHI','费城','76人','东','大西洋'),('PHX','菲尼克斯','太阳','西','太平洋'),
 ('POR','波特兰','开拓者','西','西北'),('SAC','萨克拉门托','国王','西','太平洋'),('SAS','圣安东尼奥','马刺','西','西南'),
 ('TOR','多伦多','猛龙','东','大西洋'),('UTA','犹他','爵士','西','西北'),('WAS','华盛顿','奇才','东','东南'),
]

def norm(s):
    s = unicodedata.normalize('NFKD', s).encode('ascii','ignore').decode().lower()
    s = re.sub(r'\b(jr|sr|ii|iii|iv)\b', '', s)
    return re.sub(r'[^a-z]', '', s)

def h01(*parts):  # 确定性伪随机 0-1，重跑结果不变
    return int(hashlib.md5('|'.join(map(str,parts)).encode()).hexdigest()[:8],16)/0xffffffff

MONTHS = {m:i+1 for i,m in enumerate(['January','February','March','April','May','June','July','August','September','October','November','December'])}

# ---------- 读数据 ----------
rows = list(csv.DictReader(open(CSV2K, encoding='utf-8-sig')))
bb = json.load(open(BBGM))
bname = lambda p: p.get('name') or (p.get('firstName','')+' '+p.get('lastName',''))
BB = {}
for p in bb['players']:
    BB.setdefault(norm(bname(p)), p)
bteams = {t['abbrev']: t for t in bb['teams'][:30]}
slug2abbr = {re.sub(r'[^a-z0-9]+','-',(t['region']+' '+t['name']).lower()).strip('-'): a for a,t in bteams.items()}
name_cn = json.load(open(NAME_CN, encoding='utf-8'))

# 缺失的 2K 细项：用同主位置、总评±3 的中位数补
def pos1(r): return r['pos'].split(' / ')[0].strip()
patched = []
for r in rows:
    miss = [k for k in RAW2K if r.get(k,'') == '']
    if miss:
        peers = [q for q in rows if pos1(q)==pos1(r) and abs(int(q['ovr'])-int(r['ovr']))<=3 and q is not r]
        for k in miss:
            vals = [float(q[k]) for q in peers if q.get(k,'')!='']
            r[k] = str(round(st.median(vals)))
        patched.append((r['name'], miss))

def attrs_of(r):
    return [round(sum(float(r[k])*w for k,w in spec.items())) for _,_,spec in ATTR]

# ---------- 按位置拟合总评权重（非负最小二乘） ----------
X = {p:[] for p in POS}; Y = {p:[] for p in POS}
for r in rows:
    X[pos1(r)].append(attrs_of(r)); Y[pos1(r)].append(float(r['ovr']))
OVRW = {}
for p in POS:
    A = np.array(X[p], float); y = np.array(Y[p])
    mu = A.mean(0); w,_ = nnls(A-mu, y-y.mean())
    w = np.round(w, 3); b = round(float(y.mean() - (w*mu).sum()), 2)
    OVRW[p] = {'w': dict(zip(KEYS, w.tolist())), 'b': b}

def ovr_lin(a, p):
    m = OVRW[p]; return m['b'] + sum(m['w'][k]*v for k,v in zip(KEYS,a))
# 第二步：线性拟合会把两头往中间收，用三次多项式把预测值拉回 2K 的分布
_px = np.array([ovr_lin(attrs_of(r), pos1(r)) for r in rows]); _py = np.array([float(r['ovr']) for r in rows])
_keep = np.abs(_px-_py) < 12       # 去掉威少这类 2K 标 42 的异常值
STRETCH = np.polyfit(_px[_keep], _py[_keep], 3).round(6).tolist()
def ovr_calc(a, p):
    return max(25, min(99, round(float(np.polyval(STRETCH, ovr_lin(a, p))))))

# ---------- 逐个球员 ----------
players = []
for r in rows:
    en = r['name']; key = norm(ALIAS.get(en, en)); bp = BB.get(key)
    team = 'FA' if r['team']=='free-agency' else slug2abbr[r['team']]
    bd = r['birthdate']; m = re.match(r'(\w+) (\d+), (\d{4})', bd)
    mon, day, yr = (MONTHS[m.group(1)], int(m.group(2)), int(m.group(3))) if m else (7, 1, 2000)
    if bp and bp.get('born',{}).get('year'): yr = bp['born']['year']   # 2kratings 有少数年份错，以 BBGM 为准
    age = AGE_REF[0]-yr - ((mon,day) > AGE_REF[1:])
    ps = [x.strip() for x in r['pos'].split('/') if x.strip()]
    ps = [x if x in POS else {'S':'SF'}.get(x,x) for x in ps]
    a = attrs_of(r)
    ovr = ovr_calc(a, ps[0])
    room = POT_ROOM.get(r['potential'], 3)
    agef = 1.0 if age<=21 else 0.7 if age<=23 else 0.4 if age<=25 else 0.15 if age<=27 else 0
    pot = min(99, max(ovr, round(ovr + room*agef + (h01(en,'pot')-0.5)*2*agef)))
    cn, nat = name_cn.get(en, [en, r['nationality']])
    players.append(dict(en=en, cn=cn, team=team, pos=ps[0], pos2=[x for x in ps[1:] if x!=ps[0]],
        born=f'{yr}-{mon:02d}', age=age, ht=int(r['height_cm'] or 0), ws=int(r['wingspan_cm'] or 0),
        wt=round(int(r['weight_lbs'] or 0)*0.4536), nat=nat, ovr2k=int(r['ovr']), ovr=ovr, pot=pot, grade=r['potential'],
        jersey=(r['jersey'] or '').strip(), dur=int(r['overall_durability']), prof=int(r['intangibles']) if r['intangibles'].isdigit() else 50, a=a, bb=bp,
        rookie2026=((bp is None or bp.get('tid')==-2) and age<=23)))

# ---------- 合同 ----------
# 1) BBGM 合同 2027 及以后到期：直接用。  2) 其余：按总评、年龄回归出的金额生成。  3) 2026 新秀：新秀合同。
valid = [p for p in players if p['bb'] and p['bb']['contract'].get('exp',0)>=2027 and not p['bb']['contract'].get('rookie')]
lx = np.array([p['ovr'] for p in valid]); ly = np.log(np.array([p['bb']['contract']['amount']/10 for p in valid]))
sal_fit = np.polyfit(lx, ly, 2)
def gen_salary(p):
    s = float(np.exp(np.polyval(sal_fit, p['ovr'])))
    if p['age']>=33: s *= 0.75
    elif p['age']<=23: s *= 0.85
    s *= 0.85 + h01(p['en'],'sal')*0.3
    return int(max(MIN_SAL, min(MAX_SAL, round(s))))
def gen_years(p):
    u = h01(p['en'],'yrs')
    if p['age']>=33: return 1 + (u>0.6)
    if p['age']>=29: return 1 + int(u*3)
    return 1 + int(u*4)

ctype_count = collections.Counter()
for p in players:
    p['c'] = None
    if p['team']=='FA': continue
    c = p['bb']['contract'] if p['bb'] else None
    if c and c.get('exp',0)>=2027:
        p['c'] = [round(c['amount']/10), c['exp'], 'rk' if c.get('rookie') else 'std']; ctype_count['BBGM 真实合同']+=1
    elif p['rookie2026']:
        # 按队内顺位估新秀薪资：总评越高顺位越前
        # 首轮新秀按总评估顺位薪资（约 250–1300 万），次轮/落选按底薪
        amt = int(min(1300, max(250, round(250 + (p['ovr']-72)*105)))) if p['ovr']>=73 else MIN_SAL
        p['c'] = [amt, SEASON+(4 if p['ovr']>=73 else 2), 'rk']; ctype_count['2026 新秀/落选秀合同']+=1
    else:
        p['c'] = [gen_salary(p), SEASON+gen_years(p), 'std']; ctype_count['生成合同']+=1

# 阵容上限：15 个正式合同 + 3 个双向合同，多余的放进自由球员
released = []
for ab,*_ in TEAMS:
    sq = sorted([p for p in players if p['team']==ab], key=lambda p:-p['ovr'])
    real = [p for p in sq if p['bb'] and p['bb']['contract'].get('exp',0)>=2027]
    others = [p for p in sq if p not in real]
    n_std = max(0, 15-len(real))
    for p in others[n_std:n_std+3]:
        p['c'] = [60, SEASON+1, 'tw']; ctype_count['双向合同']+=1
    for p in others[n_std+3:]:
        ctype_count['生成合同' if p['c'][2]=='std' else '2026 新秀/落选秀合同'] -= 1
        p['team'] = 'FA'; p['c'] = None; released.append((ab, p['cn'], p['ovr']))
ctype_count['因阵容超员转为自由球员'] = len(released)

# 生成合同整体校准：让联盟平均薪资 ≈ 工资帽 × 1.15（接近真实联盟均值）
def payroll(ab): return sum(p['c'][0] for p in players if p['team']==ab and p['c'] and p['c'][2]!='tw')
def is_gen(p): return p['c'] and p['c'][2]=='std' and not (p['bb'] and p['bb']['contract'].get('exp',0)>=2027)
tot_all = sum(payroll(ab) for ab,*_ in TEAMS); gen_all = sum(p['c'][0] for p in players if is_gen(p))
k_global = max(0.2, (CAP*1.15*30 - (tot_all-gen_all)) / gen_all)
for p in players:
    if is_gen(p): p['c'][0] = int(max(MIN_SAL, min(MAX_SAL, round(p['c'][0]*k_global))))

# 队薪资校验：只缩放生成出来的合同，让总薪资落在 最低工资总额 ~ 第二土豪线 之间
payroll_adj = {}
for ab,*_ in TEAMS:
    sq = [p for p in players if p['team']==ab and p['c'] and p['c'][2]!='tw']
    tot = sum(p['c'][0] for p in sq)
    gen = [p for p in sq if is_gen(p)]
    target = None
    if tot < MINPAY: target = MINPAY
    elif tot > APRON2: target = APRON2
    if target and gen:
        fixed = tot - sum(p['c'][0] for p in gen); k = max(0.3, (target-fixed)/max(1,sum(p['c'][0] for p in gen)))
        for p in gen: p['c'][0] = int(max(MIN_SAL, min(MAX_SAL, round(p['c'][0]*k))))
        payroll_adj[ab] = (tot, sum(p['c'][0] for p in sq))

# ---------- 输出 real_data.js ----------
def js(o): return json.dumps(o, ensure_ascii=False, separators=(',',':'))
out = []
out.append('// 由 _tools/build_data.py 生成，勿手改。属性 1-100，由 2K27 细项合成；合同单位万美元/年。')
out.append(f'const LEAGUE_CFG={js(dict(season=SEASON,cap=CAP,tax=TAX,apron1=APRON1,apron2=APRON2,minPayroll=MINPAY,minSal=MIN_SAL,maxSal=MAX_SAL,salFit=[round(float(x),6) for x in sal_fit],salK=round(float(k_global),3)))};')
out.append(f'const ATTR_DEF={js([[k,cn] for k,cn,_ in ATTR])};')
out.append(f'const OVR_STRETCH={js(STRETCH)};')
out.append(f'const OVR_W={js({p:[OVRW[p]["b"],[OVRW[p]["w"][k] for k in KEYS]] for p in POS})};')
tm = []
for ab,city,nick,conf,div in TEAMS:
    t = bteams[ab]
    tm.append([ab, t['region'], t['name'], city, nick, conf, div, t['pop'], t['colors'][:3]])
out.append('// [缩写,英文城市,英文队名,中文城市,中文队名,联盟,赛区,市场规模(百万人),[队色]]')
out.append(f'const TEAM_DATA={js(tm)};')
out.append('// [英文名,中文名,主位置,[副位置],出生年月,身高cm,臂展cm,体重kg,国籍,潜力值,耐久,职业态度,[21项属性],[年薪万美元,到期年,类型std/rk/tw]|null]')
roster = collections.OrderedDict((ab,[]) for ab,*_ in TEAMS); roster['FA'] = []
for p in sorted(players, key=lambda p:-p['ovr']):
    roster[p['team']].append([p['en'],p['cn'],p['pos'],p['pos2'],p['born'],p['ht'],p['ws'],p['wt'],p['nat'],p['pot'],p['dur'],p['prof'],p['a'],p['c'],p['jersey']])
out.append('const REAL_ROSTERS={')
out.append(',\n'.join(f'{js(ab)}:[\n'+',\n'.join(js(x) for x in lst)+']' for ab,lst in roster.items()))
out.append('};')
open(OUT_JS,'w',encoding='utf-8').write('\n'.join(out)+'\n')

# ---------- 校验报告 ----------
L = []
L.append('# 数据校验报告\n')
L.append(f'- 球员 {len(players)} 人：阵容 {sum(1 for p in players if p["team"]!="FA")}，自由球员 {sum(1 for p in players if p["team"]=="FA")}')
L.append(f'- 合同来源：' + '，'.join(f'{k} {v}' for k,v in ctype_count.items()))
L.append(f'- 补过缺失细项的球员：' + ('；'.join(f'{n}（{len(m)} 项）' for n,m in patched) or '无'))
L.append(f'- 生成合同整体系数 {k_global:.2f}（把联盟平均薪资校到工资帽的 1.15 倍）')
L.append(f'- 因超员转自由球员 {len(released)} 人：' + '、'.join(f'{a} {n}({o})' for a,n,o in released[:40]))
L.append(f'- real_data.js 大小：{os.path.getsize(OUT_JS)/1024:.0f} KB\n')
err = [p['ovr']-p['ovr2k'] for p in players]
L.append('## 总评公式和 2K 总评的差距\n')
L.append(f'全体平均绝对差 {np.mean(np.abs(err)):.2f}，最大 {max(err,key=abs):+d}。按位置：')
for ps in POS:
    e = [p['ovr']-p['ovr2k'] for p in players if p['pos']==ps]
    L.append(f'- {ps}：{len(e)} 人，平均绝对差 {np.mean(np.abs(e)):.2f}')
L.append('\n差距最大的 10 人：\n')
L.append('| 球员 | 位置 | 2K | 我们 |\n|---|---|---|---|')
for p in sorted(players, key=lambda p:-abs(p['ovr']-p['ovr2k']))[:10]:
    L.append(f'| {p["cn"]} | {p["pos"]} | {p["ovr2k"]} | {p["ovr"]} |')
L.append('\n## 各位置总评权重（拟合结果，前 6 项）\n')
for ps in POS:
    w = sorted(OVRW[ps]['w'].items(), key=lambda kv:-kv[1])[:6]
    cnk = {k:c for k,c,_ in ATTR}
    L.append(f'- {ps}：' + '、'.join(f'{cnk[k]} {v:.2f}' for k,v in w if v>0))
L.append('\n## 球队\n')
L.append('| 球队 | 人数 | 前8总评均值 | 最佳球员 | 总薪资(万) | 相对工资帽 |\n|---|---|---|---|---|---|')
trows = []
for ab,city,nick,conf,div in TEAMS:
    sq = sorted([p for p in players if p['team']==ab], key=lambda p:-p['ovr'])
    top8 = np.mean([p['ovr'] for p in sq[:8]])
    pay = sum(p['c'][0] for p in sq if p['c'] and p['c'][2]!='tw')
    trows.append((top8, f'| {city}{nick} | {len(sq)} | {top8:.1f} | {sq[0]["cn"]} {sq[0]["ovr"]} | {pay} | {pay/CAP:.2f} |'))
for _,s in sorted(trows, reverse=True): L.append(s)
if payroll_adj:
    L.append('\n以下球队的生成合同被整体缩放过（原总薪资 → 缩放后）：' + '；'.join(f'{a} {x}→{y}' for a,(x,y) in payroll_adj.items()))
L.append('\n## 薪资最高的 15 人\n')
L.append('| 球员 | 球队 | 总评 | 年薪(万) | 到期 | 来源 |\n|---|---|---|---|---|---|')
for p in sorted([p for p in players if p['c']], key=lambda p:-p['c'][0])[:15]:
    src = 'BBGM' if (p['bb'] and p['bb']['contract'].get('exp',0)>=2027) else '生成'
    L.append(f'| {p["cn"]} | {p["team"]} | {p["ovr"]} | {p["c"][0]} | {p["c"][1]} | {src} |')
L.append('\n## 年轻高潜力（22 岁及以下，按潜力排）\n')
L.append('| 球员 | 年龄 | 总评 | 潜力 | 2K 潜力档 |\n|---|---|---|---|---|')
for p in sorted([p for p in players if p['age']<=22], key=lambda p:-p['pot'])[:15]:
    L.append(f'| {p["cn"]} | {p["age"]} | {p["ovr"]} | {p["pot"]} | {p["grade"]} |')
L.append('\n## 抽查：三位球员的 21 项\n')
for en in ['Nikola Jokic','Stephen Curry','Victor Wembanyama']:
    p = next(q for q in players if q['en']==en)
    L.append(f'**{p["cn"]}**（{p["pos"]}，{p["age"]} 岁，{p["ht"]}cm/臂展{p["ws"]}cm，总评 {p["ovr"]}，潜力 {p["pot"]}）  ')
    L.append('、'.join(f'{c} {v}' for (k,c,_),v in zip(ATTR,p['a'])) + '\n')
open(OUT_REPORT,'w',encoding='utf-8').write('\n'.join(L)+'\n')
print('\n'.join(L[:8])); print('ok', OUT_JS)
