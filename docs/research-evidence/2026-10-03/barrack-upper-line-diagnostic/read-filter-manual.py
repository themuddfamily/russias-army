import sys
sys.path.insert(0, '/tmp/ra-pdf-reader')
from pypdf import PdfReader
reader = PdfReader('docs/research-evidence/2026-10-02/texture-default-conflict/scripting-reference.pdf')
found = []
for index in range(845, 950):
    text = reader.pages[index].extract_text()
    if text.startswith('nearFiltering') or text.startswith('quality ') or text.startswith('quality\n') or '\nnearFiltering\nUsage' in text:
        found.append(index + 1)
        print('PDF PAGE', index + 1)
        print(text[:8000])
print('matching pages', found)
