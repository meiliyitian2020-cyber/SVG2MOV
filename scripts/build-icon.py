"""Render the original application icon to Windows multi-resolution ICO (Pillow)."""
from pathlib import Path
from PIL import Image, ImageDraw
root=Path(__file__).resolve().parents[1]/'app'/'assets'
s=4
im=Image.new('RGBA',(256*s,256*s));d=ImageDraw.Draw(im)
def box(rect,fill,r=0):
 rect=tuple(int(v*s) for v in rect)
 if r:d.rounded_rectangle(rect,radius=r*s,fill=fill)
 else:d.rectangle(rect,fill=fill)
box((8,8,248,248),'#148473',54)
box((47,45,194,211),'#ffffff',19)
for x,y,w,h in [(63,61,28,28),(119,61,28,28),(175,61,3,28),(91,89,28,28),(147,89,31,28),(63,117,28,28),(119,117,28,28),(91,145,28,28),(147,145,31,28),(63,173,28,22),(119,173,28,22)]:box((x,y,x+w,y+h),'#e1f1ed')
d.ellipse((115*s,112*s,213*s,210*s),fill='#0c5147')
d.polygon([(153*s,134*s),(194*s,161*s),(153*s,188*s)],fill='#ffffff')
im=im.resize((256,256),Image.Resampling.LANCZOS)
im.save(root/'icon.png')
im.save(root/'icon.ico',sizes=[(16,16),(24,24),(32,32),(48,48),(64,64),(128,128),(256,256)])
