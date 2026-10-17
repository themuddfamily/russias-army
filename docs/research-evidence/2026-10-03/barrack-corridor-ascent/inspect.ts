import {readFileSync,writeFileSync} from 'node:fs';
import {createOriginalDoorWorld} from '../../../../shared/originalDoorWorld';
import {ORIGINAL_MAP_SCALE as S} from '../../../../shared/originalMapProfile';
const base='docs/research-evidence/2026-10-03/barrack-corridor-ascent/';
const scene=JSON.parse(readFileSync('public/assets/original-scenes/barrack/scene.json','utf8')),tracks=JSON.parse(readFileSync('public/assets/original-scenes/barrack/doors.json','utf8')),world=createOriginalDoorWorld(scene,S,tracks);
const triangles=(world.fixedGeometry as any).triangles;
const replay=JSON.parse(readFileSync(base+'replay.json','utf8'));
const witnesses=[replay.contactEvents.find((x:any)=>x.callback===278&&x.normal.x>.9).surfaceWitnesses.b,replay.contactEvents.at(-1).surfaceWitnesses.b];
function contains(t:any,p:any){const v=[t.a,t.b,t.c],plane=Math.abs(['x','y','z'].reduce((sum,k)=>sum+(p[k]-t.a[k])*t.normal[k],0));if(plane>1e-6)return false;return v.every((a:any,i:number)=>{const b=v[(i+1)%3],u={x:b.x-a.x,y:b.y-a.y,z:b.z-a.z},q={x:p.x-a.x,y:p.y-a.y,z:p.z-a.z};const c={x:u.y*q.z-u.z*q.y,y:u.z*q.x-u.x*q.z,z:u.x*q.y-u.y*q.x};return c.x*t.normal.x+c.y*t.normal.y+c.z*t.normal.z>=-1e-6;});}
const witnessTriangles=witnesses.map(p=>({witness:p,triangles:triangles.map((t:any,index:number)=>({index,...t})).filter((t:any)=>contains(t,p))}));
const prior=JSON.parse(readFileSync('docs/research-evidence/2026-10-03/barrack-route-geometry/inventory.json','utf8'));
const ramp=prior.records.find((r:any)=>r.node==='plinths'&&r.part===0).slopes.filter((s:any)=>[55,57].includes(s.face));
writeFileSync(base+'source-witnesses.json',JSON.stringify({scope:'Direct unchanged finite source triangle inspection; no player geometry queries',ramp,witnessTriangles},null,2));console.log(JSON.stringify({ramp,witnessTriangles}));
