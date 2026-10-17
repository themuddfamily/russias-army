import sys
sys.path.insert(0, '/tmp/ra-pdf-reader')
from pypdf import PdfReader
reader = PdfReader('docs/research-evidence/2026-10-02/texture-default-conflict/scripting-reference.pdf')
for index in range(755, 790):
    text = reader.pages[index].extract_text()
    if 'fieldOfView' in text or 'vertical projection' in text:
        print('PHYSICAL PDF PAGE', index+1)
        print(text)
