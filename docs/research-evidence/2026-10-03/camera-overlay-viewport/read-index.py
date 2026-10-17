from pathlib import Path
import sys
sys.path.insert(0,'/tmp/ra-pdf-reader')
from pypdf import PdfReader
root=Path(__file__).resolve().parents[4]
reader=PdfReader(root/'docs/research-evidence/2026-10-02/texture-default-conflict/scripting-reference.pdf')
assert len(reader.pages)==1130
for index in range(1095,1130):
    text=reader.pages[index].extract_text()
    lines=text.splitlines()
    selected=[]
    for i,line in enumerate(lines):
        if any(term.lower() in line.lower() for term in ['addOverlay','rect (3D)','rect of camera','overlay (','scale of overlay','overlay.scale','camera viewport']):
            selected.append('\n'.join(lines[max(0,i-3):i+5]))
    if selected:
        print('PHYSICAL PDF PAGE',index+1)
        print('\n'.join(selected))
