from pathlib import Path
import sys,re
sys.path.insert(0,'/tmp/ra-pdf-reader')
from pypdf import PdfReader
root=Path(__file__).resolve().parents[4]
out=Path(__file__).resolve().parent
reader=PdfReader(root/'docs/research-evidence/2026-10-02/texture-default-conflict/scripting-reference.pdf')
selected={235,236}
for physical in range(1118,1127):
    lines=reader.pages[physical-1].extract_text().splitlines()
    for i,line in enumerate(lines):
        if re.search(r'\b(rect|overlay|scale)\b',line,re.I):
            context='\n'.join(lines[max(0,i-1):i+4])
            print('INDEX PHYSICAL PAGE',physical,'\n'+context)
            for page in re.findall(r'\b(\d{3,4})\b',line):
                n=int(page)
                if 200<=n<=1095:
                    selected.update(range(max(1,n-1),min(1095,n+1)+1))
assert len(selected)<=45,selected
for physical in sorted(selected):
    text=reader.pages[physical-1].extract_text()
    (out/f'page-{physical:04d}.txt').write_text(text)
    print('PROPERTY PHYSICAL PAGE',physical,'\n'+text)
