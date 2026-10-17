import hashlib, json
from pathlib import Path
root = Path(__file__).resolve().parents[4]
folder = Path(__file__).resolve().parent
inputs = [
 'docs/research-evidence/2026-10-02/texture-default-conflict/scripting-reference.pdf',
 'docs/research-evidence/2026-09-30/director-script-extraction/woodland/casts/parents/ParentScript 5 - goody.ls',
 'docs/research-evidence/2026-10-01/ORIGINAL_NATIVE_GAMEPLAY_SPRITE.md',
 'docs/research-evidence/2026-10-01/native-gameplay-sprite-constraint.json',
 'docs/research-evidence/2026-10-03/woodland-interior-projection-constraints/result.json',
 'docs/research-evidence/2026-10-03/woodland-interior-endpoints/frame-05.png',
]
inputs += [str(p.relative_to(root)) for p in sorted(folder.rglob('*')) if p.is_file() and p.name not in ['hashes.json', 'hash.log']]
result = {}
for name in inputs:
 with (root/name).open('rb') as f:
  result[name] = hashlib.file_digest(f, 'sha256').hexdigest()
(folder/'hashes.json').write_text(json.dumps(result, indent=2)+'\n')
print('Bound',len(result),'files with streaming SHA256')
