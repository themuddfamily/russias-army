import {readFileSync,writeFileSync} from 'node:fs';
import {createOriginalSceneGeometry} from '../../../../shared/originalSceneGeometry';
import {ORIGINAL_MAP_SCALE as S} from '../../../../shared/originalMapProfile';
import {ORIGINAL_PLAYER_RADIUS as R} from '../../../../shared/originalPlayerPhysics';
import {ORIGINAL_COLLISION_CONTACT_DISTANCE as T} from '../../../../shared/originalExplosives';
const base='docs/research-evidence/2026-10-03/barrack-support-route/',inventory=JSON.parse(readFileSync('docs/research-evidence/2026-10-03/barrack-stair-gap-inventory/inventory.json','utf8')),data=JSON.parse(readFileSync('public/assets/original-scenes/barrack/scene.json','utf8')),g=createOriginalSceneGeometry(data,{scale:S});
let queries=0;const checks=[];
for(const [pair,xs,zs,ceiling] of [[ '80/118',[50.5,50,49.6,49.2,48.6],[63.95,64.24,64.53],11],['94/134',[59.8,60.4,60.73,61.3,61.8],[62,64,66],15]] as const){
 for(const x of xs)for(const z of zs){queries++;const h=g.playerSupportHeightAt(x,z,ceiling,R,2*R);const center=h===undefined?undefined:{x,y:h+R,z};let contacts:any[]=[];if(center){queries++;contacts=g.contactsSphere(center,R,T);queries++;}
 checks.push({pair,x,z,support:h,center,intersects:center?g.playerIntersects({x,y:h!,z},R,2*R):null,contacts});
 }
}
const groups=inventory.groups.filter((v:any)=>[80,118,94,134].includes(v.id)),ids=new Set(groups.flatMap((v:any)=>v.faces)),faces=inventory.faces.filter((v:any)=>ids.has(v.id));
writeFileSync(base+'inspection.json',JSON.stringify({scope:'Actual transformed constituent support triangles and finite current sphere contacts; bounds never filled.',queries,groups,faces,checks},null,2));
console.log(JSON.stringify({queries,checks:checks.map(c=>({...c,contacts:c.contacts.map(v=>({model:v.model,normal:v.normal,gap:v.gap,witnessB:v.witnessB}))}))},null,2));
