import sys
sys.path.insert(0, '/tmp/ra-pdf-reader')
from pypdf import PdfReader
reader = PdfReader('docs/research-evidence/2026-10-02/texture-default-conflict/scripting-reference.pdf')
print('pages', len(reader.pages))
for index in range(1029, min(1055, len(reader.pages))):
    text = reader.pages[index].extract_text()
    if 'textureTransform' in text:
        print('PDF PAGE', index + 1)
        print(text[:10000])
