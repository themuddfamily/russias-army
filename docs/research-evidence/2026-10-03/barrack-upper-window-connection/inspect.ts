import {readFileSync,writeFileSync} from 'node:fs';
import {createOriginalDoorWorld} from '../../../../shared/originalDoorWorld';
import {ORIGINAL_MAP_SCALE as S} from '../../../../shared/originalMapProfile';
import {ORIGINAL_PLAYER_RADIUS as R} from '../../../../shared/originalPlayerPhysics';
const base='docs/research-evidence/2026-10-03/barrack-upper-window-connection/';
const scene=JSON.parse(readFileSync('public/assets/original-scenes/barrack/scene.json','utf8')),tracks=JSON.parse(readFileSync('public/assets/original-scenes/barrack/doors.json','utf8')),world=createOriginalDoorWorld(scene,S,tracks);
let queries=0;const checks:any[]=[];
for(const [x,z] of [...[71.88,70,68,66,64.24,63,62].map(z=>[34.3,z]),...[35,37,39,41,43,45,47,48.6,49.2,49.6,50,50.7].map(x=>[x,64.24])]){
 queries++;const height=world.playerSupportHeightAt(x,z,11,R,2*R);queries++;const intersects=height===undefined?null:world.playerIntersects({x,y:height,z},R,2*R);checks.push({x,z,height,intersects});
}
const triangles=(world.fixedGeometry as any).triangles.map((t:any,index:number)=>({index,...t})).filter((t:any)=>[t.a,t.b,t.c].every((p:any)=>p.x>=33&&p.x<=51&&p.z>=62&&p.z<=74));
writeFileSync(base+'inspection.json',JSON.stringify({queries,checks,triangles},null,2));console.log(JSON.stringify({queries,checks}));
