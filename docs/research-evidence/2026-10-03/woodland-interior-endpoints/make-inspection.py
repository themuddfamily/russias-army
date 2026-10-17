from PIL import Image
from pathlib import Path
p=Path(__file__).resolve().parent
a=Image.open(p/'frame-05.png').crop((870,130,1030,270)).resize((640,560),Image.Resampling.NEAREST)
b=Image.open(p/'frame-06.png').crop((795,65,955,205)).resize((640,560),Image.Resampling.NEAREST)
out=Image.new('RGB',(1280,560));out.paste(a,(0,0));out.paste(b,(640,0));out.save(p/'top-endpoint-inspection.png')
c=Image.open(p/'frame-05.png').crop((1080,90,1200,260)).resize((480,680),Image.Resampling.NEAREST)
c.save(p/'right-top-inspection.png')
