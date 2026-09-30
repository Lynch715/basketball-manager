#!/usr/bin/env python3
"""篮球经理图标：深色圆角底 + 橙色篮球 + 「篮」字。16/32 单独画（只画球）。"""
import io, os, struct, math
from PIL import Image, ImageDraw, ImageFont, ImageFilter
H=os.path.dirname(os.path.abspath(__file__)); OUT=os.path.join(H,'..')
FONT='/usr/share/fonts/opentype/noto/NotoSansCJK-Black.ttc'
if not os.path.exists(FONT): FONT='/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc'
BG1=(22,29,40); BG2=(10,13,19); OR1=(255,160,60); OR2=(214,98,14); SEAM=(92,38,4)

def ball(sz, cx, cy, r, seam_w):
    im=Image.new('RGBA',(sz,sz),(0,0,0,0))
    # 径向渐变球体
    g=Image.new('RGBA',(sz,sz),(0,0,0,0)); px=g.load()
    hx,hy=cx-r*.35, cy-r*.4
    for y in range(max(0,int(cy-r-1)), min(sz,int(cy+r+2))):
        for x in range(max(0,int(cx-r-1)), min(sz,int(cx+r+2))):
            d=math.hypot(x-cx,y-cy)
            if d<=r+1:
                t=min(1,math.hypot(x-hx,y-hy)/(r*1.55))
                c=tuple(int(OR1[i]*(1-t)+OR2[i]*t) for i in range(3))
                a=255 if d<=r else int(255*(r+1-d))
                px[x,y]=c+(a,)
    im=Image.alpha_composite(im,g)
    # 球缝：竖线、横线、两条弧
    m=Image.new('L',(sz,sz),0); dm=ImageDraw.Draw(m)
    w=max(1,int(seam_w))
    dm.line([(cx,cy-r),(cx,cy+r)],fill=255,width=w)
    dm.line([(cx-r,cy),(cx+r,cy)],fill=255,width=w)
    k=r*1.25
    dm.arc([cx-r-k*.95, cy-k, cx-r+k*.55, cy+k], -52, 52, fill=255, width=w)
    dm.arc([cx+r-k*.55, cy-k, cx+r+k*.95, cy+k], 128, 232, fill=255, width=w)
    clip=Image.new('L',(sz,sz),0); ImageDraw.Draw(clip).ellipse([cx-r,cy-r,cx+r,cy+r],fill=255)
    from PIL import ImageChops
    m=ImageChops.multiply(m,clip)
    seam=Image.new('RGBA',(sz,sz),SEAM+(0,)); seam.putalpha(m.point(lambda v:int(v*.85)))
    return Image.alpha_composite(im,seam)

def bg(sz, full=False):
    im=Image.new('RGBA',(sz,sz),(0,0,0,0))
    grad=Image.new('RGBA',(sz,sz)); gp=grad.load()
    for y in range(sz):
        t=y/(sz-1); c=tuple(int(BG1[i]*(1-t)+BG2[i]*t) for i in range(3))
        for x in range(sz): gp[x,y]=c+(255,)
    mask=Image.new('L',(sz,sz),0)
    if full: mask=Image.new('L',(sz,sz),255)
    else: ImageDraw.Draw(mask).rounded_rectangle([0,0,sz-1,sz-1], radius=int(sz*.225), fill=255)
    im.paste(grad,(0,0),mask); return im

def glyph(sz, ch, box):
    """把字渲染到正方形 box 内，按真实墨迹视觉居中"""
    S=box*2; f=ImageFont.truetype(FONT, S)
    t=Image.new('L',(S*2,S*2),0); ImageDraw.Draw(t).text((S//2,S//4),ch,font=f,fill=255)
    bb=t.getbbox(); t=t.crop(bb)
    k=box/max(t.size); t=t.resize((max(1,int(t.size[0]*k)),max(1,int(t.size[1]*k))),Image.LANCZOS)
    return t

def render(sz, full=False, inner=1.0):
    if sz<=32:
        im=Image.new('RGBA',(sz,sz),(0,0,0,0))
        d=ImageDraw.Draw(im); d.rounded_rectangle([0,0,sz-1,sz-1],radius=max(2,int(sz*.2)),fill=BG2+(255,))
        r=sz*.42; cx=cy=(sz-1)/2
        d.ellipse([cx-r,cy-r,cx+r,cy+r],fill=(255,138,31,255))
        w=1
        d.line([(cx,cy-r+1),(cx,cy+r-1)],fill=(70,28,0,255),width=w); d.line([(cx-r+1,cy),(cx+r-1,cy)],fill=(70,28,0,255),width=w)
        return im
    SS=4 if sz<512 else 2; Z=sz*SS
    im=bg(Z, full)
    r=Z*.36*inner; cx=Z/2; cy=Z/2
    # 阴影
    sh=Image.new('RGBA',(Z,Z),(0,0,0,0)); ImageDraw.Draw(sh).ellipse([cx-r,cy-r+Z*.025,cx+r,cy+r+Z*.025],fill=(0,0,0,150))
    im=Image.alpha_composite(im, sh.filter(ImageFilter.GaussianBlur(Z*.02)))
    im=Image.alpha_composite(im, ball(Z,cx,cy,r,Z*.012))
    # 字：暗色描边 + 奶白字
    g=glyph(Z,'篮',int(r*1.12))
    gx=int(cx-g.size[0]/2); gy=int(cy-g.size[1]/2 - r*.02)
    so=Image.new('RGBA',(Z,Z),(0,0,0,0)); col=Image.new('RGBA',g.size,(70,24,0,210)); so.paste(col,(gx,gy+int(Z*.012)),g)
    im=Image.alpha_composite(im, so.filter(ImageFilter.GaussianBlur(Z*.012)))
    fo=Image.new('RGBA',(Z,Z),(0,0,0,0)); col=Image.new('RGBA',g.size,(255,247,236,255)); fo.paste(col,(gx,gy),g)
    im=Image.alpha_composite(im, fo)
    return im.resize((sz,sz),Image.LANCZOS)

os.makedirs(os.path.join(OUT,'icon'),exist_ok=True)
for s in [1024,512,256,192,180,128,64,48,32,16]:
    render(s).save(os.path.join(OUT,'icon',f'icon-{s}.png'),'PNG',optimize=True)
render(512, full=True, inner=.8).save(os.path.join(OUT,'icon','maskable-512.png'),'PNG',optimize=True)
imgs=[render(s) for s in [16,32,48,64,128,256]]
imgs[-1].save(os.path.join(OUT,'favicon.ico'), append_images=imgs[:-1], sizes=[(s,s) for s in [16,32,48,64,128,256]])
ICNS=[("icp4",16),("icp5",32),("icp6",64),("ic07",128),("ic08",256),("ic09",512),("ic10",1024),("ic11",32),("ic12",64),("ic13",256),("ic14",512)]
chunks=b""
for t,s in ICNS:
    buf=io.BytesIO(); render(s).save(buf,"PNG",optimize=True); d=buf.getvalue(); chunks+=t.encode()+struct.pack(">I",len(d)+8)+d
open(os.path.join(OUT,'icon','篮球经理.icns'),'wb').write(b"icns"+struct.pack(">I",len(chunks)+8)+chunks)
print('ok')
