import sys
sys.path.insert(0, '/tmp/ra-pdf-reader')
from pypdf import PdfReader
reader = PdfReader('docs/research-evidence/2026-10-02/texture-default-conflict/scripting-reference.pdf')
print('PDF pages:', len(reader.pages))
for index in list(range(0, 32)) + list(range(max(0, len(reader.pages)-45), len(reader.pages))):
    text = reader.pages[index].extract_text()
    lines = text.splitlines()
    for i, line in enumerate(lines):
        if any(term.lower() in line.lower() for term in ['fieldOfView', 'pixel aspect', 'projection angle']):
            print('PDF page', index+1, '\n' + '\n'.join(lines[max(0,i-3):i+4]))
