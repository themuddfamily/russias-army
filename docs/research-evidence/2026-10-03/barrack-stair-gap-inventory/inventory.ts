import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {originalNodeWorldMatrices,sourcePointToWorld,isOriginalFixedModel,createOriginalSceneGeometry} from '../../../../shared/originalSceneGeometry';
import {ORIGINAL_MAP_SCALE as S} from '../../../../shared/originalMapProfile';
import {ORIGINAL_PLAYER_RADIUS as R} from '../../../../shared/originalPlayerPhysics';
import {ORIGINAL_COLLISION_CONTACT_DISTANCE as T} from '../../../../shared/originalExplosives';
const base='docs/research-evidence/2026-10-03/barrack-stair-gap-inventory/',scenePath='public/assets/original-scenes/barrack/scene.json';
const data=JSON.parse(readFileSync(scenePath,'utf8')),matrices=originalNodeWorldMatrices(data),g=createOriginalSceneGeometry(data,{scale:S});
type P={x:number;y:number;z:number};
type F={id:string;node:string;resource:string;part:number;face:number;points:P[];normal:P;area:number;horizontal:boolean};
const faces:F[]=[],resources:any[]=[];
for(const node of data.nodes){if(!isOriginalFixedModel(node.name))continue;const m=matrices.get(node.name.toLowerCase())!;
 for(const mesh of data.meshes.filter((v:any)=>v.resource===node.resource)){
  const points:P[]=mesh.positions.map((p:number[])=>sourcePointToWorld([m[0]*p[0]+m[4]*p[1]+m[8]*p[2]+m[12],m[1]*p[0]+m[5]*p[1]+m[9]*p[2]+m[13],m[2]*p[0]+m[6]*p[1]+m[10]*p[2]+m[14]],S));
  resources.push({node:node.name,resource:mesh.resource,part:mesh.part,faces:mesh.faces.length});
  for(let i=0;i<mesh.faces.length;i++){const ps=mesh.faces[i].map((j:number)=>points[j]),[a,b,c]=ps,u={x:b.x-a.x,y:b.y-a.y,z:b.z-a.z},v={x:c.x-a.x,y:c.y-a.y,z:c.z-a.z},n={x:u.y*v.z-u.z*v.y,y:u.z*v.x-u.x*v.z,z:u.x*v.y-u.y*v.x},l=Math.hypot(n.x,n.y,n.z);if(!l)continue;
   faces.push({id:`${node.name}/${mesh.part}/${i}`,node:node.name,resource:mesh.resource,part:mesh.part,face:i,points:ps,normal:{x:n.x/l,y:n.y/l,z:n.z/l},area:l/2,horizontal:Math.max(...ps.map((p:P)=>p.y))-Math.min(...ps.map((p:P)=>p.y))<1e-7});
  }
 }
}
// Join only faces which share a whole transformed edge and are horizontal on
// the same plane. Bounding boxes are diagnostic summaries, not filled support.
const horizontal=faces.filter(f=>f.horizontal&&f.area>1e-7),parent=horizontal.map((_,i)=>i);
const find=(i:number):number=>parent[i]===i?i:parent[i]=find(parent[i]);
const pointKey=(p:P)=>[p.x,p.y,p.z].map(v=>v.toFixed(7)).join(','),edgeKey=(a:P,b:P)=>[pointKey(a),pointKey(b)].sort().join('|');
const edges=new Map<string,number[]>();horizontal.forEach((f,i)=>{for(let j=0;j<3;j++){const key=edgeKey(f.points[j],f.points[(j+1)%3]),prior=edges.get(key)??[];for(const k of prior)parent[find(i)]=find(k);prior.push(i);edges.set(key,prior);}});
const grouped=new Map<number,F[]>();horizontal.forEach((f,i)=>{const k=find(i);grouped.set(k,[...(grouped.get(k)??[]),f]);});
const groups=[...grouped.values()].map((fs,id)=>{const points=fs.flatMap(f=>f.points);return{id,faces:fs.map(f=>f.id),models:[...new Set(fs.map(f=>f.node))],height:points[0].y,area:fs.reduce((a,f)=>a+f.area,0),bounds:{min:{x:Math.min(...points.map(p=>p.x)),z:Math.min(...points.map(p=>p.z))},max:{x:Math.max(...points.map(p=>p.x)),z:Math.max(...points.map(p=>p.z))}},vertices:points};});
// A stair candidate requires near-touching parallel projected boundaries,
// horizontal treads at different levels, with a finite-width common edge.
// Conservative axis-aligned test only: rotated/disconnected cases remain open.
const stairPairs:any[]=[];let analyticalPairs=0;
for(let i=0;i<groups.length;i++)for(let j=i+1;j<groups.length;j++){analyticalPairs++;const a=groups[i],b=groups[j],rise=Math.abs(a.height-b.height);if(rise<.05||rise>.6)continue;
 for(const axis of ['x','z'] as const){const cross=axis==='x'?'z':'x',overlap=Math.min(a.bounds.max[cross],b.bounds.max[cross])-Math.max(a.bounds.min[cross],b.bounds.min[cross]),separation=Math.min(Math.abs(a.bounds.max[axis]-b.bounds.min[axis]),Math.abs(b.bounds.max[axis]-a.bounds.min[axis]));if(separation<1e-5&&overlap>2*R)stairPairs.push({a:a.id,b:b.id,rise,axis,overlap,separation,scope:'bounding box necessary condition only; not established stair'});}
}
let queries=0;const sweep=(a:P,b:P)=>{if(++queries>256)throw Error('Explicit query budget exceeded');return g.sweepSphere(a,b,R,T);};
// Previously noted ramp-strip separation at common y=6.560089. Examine
// the exact finite sphere path, retaining both points and obstruction witness.
const stripA=faces.filter(f=>f.node==='plinths'&&f.part===0&&[1,28].includes(f.face)),stripB=faces.filter(f=>f.node==='plinths'&&f.part===0&&[55,57].includes(f.face));
const a=stripA.flatMap(f=>f.points).filter(p=>p.y>6.5),b=stripB.flatMap(f=>f.points).filter(p=>p.y<6.6);
const commonX=[Math.max(Math.min(...a.map(p=>p.x)),Math.min(...b.map(p=>p.x))),Math.min(Math.max(...a.map(p=>p.x)),Math.max(...b.map(p=>p.x)))];
const za=Math.min(...a.map(p=>p.z)),zb=Math.max(...b.map(p=>p.z)),height=a[0].y;
const stripChecks=[];
for(const fraction of [.1,.3,.5,.7,.9]){const x=commonX[0]+fraction*(commonX[1]-commonX[0]);for(const lift of [0,.25,.5,1,2]){const from={x,y:height+R+lift,z:za+R+.05},to={x,y:height+R+lift,z:zb-R-.05},hit=sweep(from,to);const matching=hit?.witnessB?faces.filter(f=>{const w=hit.witnessB!;return Math.abs((w.x-f.points[0].x)*f.normal.x+(w.y-f.points[0].y)*f.normal.y+(w.z-f.points[0].z)*f.normal.z)<1e-6&&['x','y','z'].every(k=>w[k as keyof P]>=Math.min(...f.points.map(p=>p[k as keyof P]))-1e-6&&w[k as keyof P]<=Math.max(...f.points.map(p=>p[k as keyof P]))+1e-6);}).map(f=>f.id):[];stripChecks.push({fraction,lift,from,to,hit,matchingWitnessFaceBounds:matching});}}
const output={scope:'All recovered fixed Barrack scene faces; horizontal shared-edge components; restricted axis-aligned stair necessary-condition search; one named ramp-strip finite sphere sweep counterexample. No historical/native runtime equivalence or completeness of arbitrary jump trajectories.',scale:S,radius:R,contactDistance:T,sceneNodes:data.nodes.length,sceneMeshes:data.meshes.length,resources,transformedFaceCount:faces.length,horizontalFaceCount:horizontal.length,groups,analyticalPairs,stairPairs,strip:{commonX,za,zb,separation:za-zb,height,checks:stripChecks},explicitQueries:queries,faces};
writeFileSync(base+'inventory.json',JSON.stringify(output,null,2));
const paths=[scenePath,'shared/originalSceneGeometry.ts','shared/originalMapProfile.ts','shared/originalPlayerPhysics.ts','shared/originalExplosives.ts',base+'inventory.ts',base+'inventory.json'];
writeFileSync(base+'hashes.json',JSON.stringify(Object.fromEntries(paths.map(p=>[p,createHash('sha256').update(readFileSync(p)).digest('hex')])),null,2));
console.log(JSON.stringify({transformedFaces:faces.length,horizontalFaces:horizontal.length,groups:groups.length,analyticalPairs,stairPairs,queries,strip:{commonX,separation:za-zb,blocked:stripChecks.filter(c=>c.hit).length,checks:stripChecks.length},horizontalGroups:groups.map(({vertices,...g})=>g)},null,2));
