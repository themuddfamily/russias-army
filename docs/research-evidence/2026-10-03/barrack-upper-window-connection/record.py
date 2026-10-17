import hashlib,json
from pathlib import Path
b=Path('docs/research-evidence/2026-10-03/barrack-upper-window-connection')
files=sorted(p for p in b.iterdir() if p.is_file() and p.name not in ('hashes.json','record.log'))
hashes={str(p):hashlib.file_digest(p.open('rb'),'sha256').hexdigest() for p in files}
(b/'hashes.json').write_text(json.dumps(hashes,indent=2)+'\n')
print(f'Bound {len(hashes)} artifacts')
