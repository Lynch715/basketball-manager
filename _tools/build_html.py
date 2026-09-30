#!/usr/bin/env python3
"""把 real_data.js 和 engine.js 塞进 shell.html，输出 ../篮球经理.html"""
import os
H=os.path.dirname(os.path.abspath(__file__))
s=open(os.path.join(H,'shell.html'),encoding='utf-8').read()
s=s.replace('/*DATA*/',open(os.path.join(H,'real_data.js'),encoding='utf-8').read())
s=s.replace('/*ENGINE*/',open(os.path.join(H,'engine.js'),encoding='utf-8').read())
app=''.join(open(os.path.join(H,f),encoding='utf-8').read()+'\n' for f in ['app_main.js','app_season.js','app_season_ui.js','app_offseason.js','app_offseason_ui.js','app_trade.js','app_ai_trade.js','app_life.js','app_events.js','app_anim.js','app_pwa.js','app_boot.js'] if os.path.exists(os.path.join(H,f)))
s=s.replace('/*APP*/',app)
out=os.path.join(H,'..','篮球经理.html'); open(out,'w',encoding='utf-8').write(s)
open(os.path.join(H,'..','index.html'),'w',encoding='utf-8').write(s)
print(out, len(s)//1024, 'KB')
