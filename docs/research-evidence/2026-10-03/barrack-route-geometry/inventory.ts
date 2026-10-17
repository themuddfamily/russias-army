import {readFileSync,writeFileSync} from 'node:fs';
import {originalNodeWorldMatrices,sourcePointToWorld} from '../../../../shared/originalSceneGeometry';
import {ORIGINAL_MAP_SCALE as scale} from '../../../../shared/originalMapProfile';
const data=JSON.parse(readFileSync('public/assets/original-scenes/barrack/scene.json','utf8')), matrices=originalNodeWorldMatrices(data);
const records=[];
for(const node of data.nodes){if(/scotspine|barrel|door/.test(node.name.toLowerCase()))continue;const matrix=matrices.get(node.name.toLowerCase())!;
 for(const mesh of data.meshes.filter((m:any)=>m.resource===node.resource)){
 const points=mesh.positions.map((p:number[])=>sourcePointToWorld([matrix[0]*p[0]+matrix[4]*p[1]+matrix[8]*p[2]+matrix[12],matrix[1]*p[0]+matrix[5]*p[1]+matrix[9]*p[2]+matrix[13],matrix[2]*p[0]+matrix[6]*p[1]+matrix[10]*p[2]+matrix[14]],scale));
 const slopes=[];for(let face=0;face<mesh.faces.length;face++){const [a,b,c]=mesh.faces[face].map((i:number)=>points[i]),u={x:b.x-a.x,y:b.y-a.y,z:b.z-a.z},v={x:c.x-a.x,y:c.y-a.y,z:c.z-a.z},n={x:u.y*v.z-u.z*v.y,y:u.z*v.x-u.x*v.z,z:u.x*v.y-u.y*v.x},length=Math.hypot(n.x,n.y,n.z);if(length===0)continue;const up=Math.abs(n.y/length);if(up>.5&&up<.999999)slopes.push({face,up,points:[a,b,c]});}
 records.push({node:node.name,resource:mesh.resource,part:mesh.part,faces:mesh.faces.length,bounds:{min:Object.fromEntries(['x','y','z'].map(k=>[k,Math.min(...points.map((p:any)=>p[k]))])),max:Object.fromEntries(['x','y','z'].map(k=>[k,Math.max(...points.map((p:any)=>p[k]))]))},slopes});
 }}
writeFileSync('docs/research-evidence/2026-10-03/barrack-route-geometry/inventory.json',JSON.stringify({scale,records},null,2));
console.log(JSON.stringify(records.map(r=>({...r,slopes:r.slopes.map(s=>s.face)})),null,2));
