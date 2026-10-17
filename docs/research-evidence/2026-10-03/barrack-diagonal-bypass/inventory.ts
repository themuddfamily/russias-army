import {readFileSync,writeFileSync} from 'node:fs';
import {createOriginalDoorWorld} from '../../../../shared/originalDoorWorld';
import {ORIGINAL_MAP_SCALE as S} from '../../../../shared/originalMapProfile';
const base='docs/research-evidence/2026-10-03/barrack-diagonal-bypass/';
const scene=JSON.parse(readFileSync('public/assets/original-scenes/barrack/scene.json','utf8')),tracks=JSON.parse(readFileSync('public/assets/original-scenes/barrack/doors.json','utf8')),world=createOriginalDoorWorld(scene,S,tracks);
// Read only the exact transformed finite triangle inventory; no geometry mutation.
const triangles=(world.fixedGeometry as any).triangles;
const witness={x:77.43099033123659,y:7.086210317023842,z:69.8350685589498};
const normal={x:-.5935891537553778,y:0,z:-.8047682377827635};
const rows=triangles.map((t:any,index:number)=>({index,...t})).filter((t:any)=>Math.abs(t.normal.x*normal.x+t.normal.z*normal.z)>.999999&&Math.abs((witness.x-t.a.x)*t.normal.x+(witness.y-t.a.y)*t.normal.y+(witness.z-t.a.z)*t.normal.z)<1e-6);
const vertices=rows.flatMap((t:any)=>[t.a,t.b,t.c]);
const bounds=Object.fromEntries(['x','y','z'].map(k=>[k,{min:Math.min(...vertices.map((p:any)=>p[k])),max:Math.max(...vertices.map((p:any)=>p[k]))}]));
const adjacent=triangles.map((t:any,index:number)=>({index,...t})).filter((t:any)=>t.model==='plinths'&&[t.a,t.b,t.c].some((p:any)=>p.x>=70&&p.x<=80&&p.z>=68&&p.z<=78));
writeFileSync(base+'inventory.json',JSON.stringify({witness,normal,rows,bounds,adjacent},null,2));console.log(JSON.stringify({rows:rows.length,models:[...new Set(rows.map((t:any)=>t.model))],bounds,adjacent:adjacent.map((t:any)=>({index:t.index,normal:t.normal,vertices:[t.a,t.b,t.c]}))}));
