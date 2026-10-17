from pathlib import Path
import hashlib,json
out=Path(__file__).resolve().parent
root=out.parents[3]
paths=[root/'docs/research-evidence/2026-10-02/texture-default-conflict/scripting-reference.pdf',root/'docs/research-evidence/2026-09-30/director-script-extraction/woodland/casts/parents/ParentScript 5 - goody.ls',root/'docs/research-evidence/2026-09-30/director-script-extraction/woodland/casts/parents/MovieScript 1 - generics.ls',root/'docs/research-evidence/2026-10-01/native-gameplay-sprite-constraint.json',root/'docs/research-evidence/2026-10-03/hud-recording-transform/result.json',root/'public/assets/original-normal-ui/provenance.json']
paths+=sorted(p for p in out.iterdir() if p.is_file() and p.name not in ('hashes.json','hash.log'))
records=[]
for path in paths:
    with path.open('rb') as handle:
        digest=hashlib.file_digest(handle,'sha256').hexdigest()
    records.append({'path':str(path.relative_to(root)),'bytes':path.stat().st_size,'sha256':digest})
(out/'hashes.json').write_text(json.dumps(records,indent=2)+'\n')
print('Bound',len(records),'files with streamed SHA256')
