import {readFileSync,writeFileSync} from 'node:fs';
import {originalNodeWorldMatrices,sourcePointToWorld} from '../../../../shared/originalSceneGeometry';
import {createOriginalDoorWorld} from '../../../../shared/originalDoorWorld';
import {ORIGINAL_MAP_SCALE as S} from '../../../../shared/originalMapProfile';
import {ORIGINAL_PLAYER_RADIUS as R} from '../../../../shared/originalPlayerPhysics';
import {ORIGINAL_COLLISION_CONTACT_DISTANCE as T} from '../../../../shared/originalExplosives';
const base='docs/research-evidence/2026-10-03/barrack-door-passages/',data=JSON.parse(readFileSync('public/assets/original-scenes/barrack/scene.json','utf8')),tracks=JSON.parse(readFileSync('public/assets/original-scenes/barrack/doors.json','utf8')),world=createOriginalDoorWorld(data,S,tracks),prior=JSON.parse(readFileSync(base+'replay.json','utf8')),results=[];
for(const r of prior.records.filter((r:any)=>['door open 08','door open 09'].includes(r.name))){const a=r.approaches.find((a:any)=>a.status.startsWith('did')),p=a.trace.at(-1).position,hinge=r.origin,tangent={x:-r.normal.z,y:0,z:r.normal.x},delta=(hinge.x-p.x)*tangent.x+(hinge.z-p.z)*tangent.z,closer={...p,x:p.x+Math.sign(delta)*tangent.x*.2,z:p.z+Math.sign(delta)*tangent.z*.2};
 const contacts=world.contactsSphere(p,R,T),sweepTowardHinge=world.sweepSphere(p,closer,R,T),floorRay=world.raycast({...p,y:p.y-.01},{x:0,y:-1,z:0},2),wallRay=world.fixedGeometry.raycast(p,{x:Math.sign(delta)*tangent.x,y:0,z:Math.sign(delta)*tangent.z},2),doorRay=world.raycast(p,{x:-r.normal.x*a.side,y:0,z:-r.normal.z*a.side},2);
 const eye={...p,y:p.y+60*S},dy=eye.y-hinge.y,normalDistance=Math.abs((eye.x-hinge.x)*r.normal.x+(eye.z-hinge.z)*r.normal.z),hingeDistance=Math.hypot(eye.x-hinge.x,dy,eye.z-hinge.z),tangentAllowance=Math.sqrt(Math.max(0,(100*S)**2-dy**2-normalDistance**2));
 results.push({name:r.name,side:a.side,position:p,eye,hinge,normal:r.normal,tangent,contacts,sweepTowardHinge,floorRay,wallRay,doorRay,dy,normalDistance,hingeDistance,tangentAllowance});}
const matrices=originalNodeWorldMatrices(data);
for(const r of results as any[]){const targets=[{kind:'floor',model:r.floorRay.id,point:r.floorRay.point},{kind:'jamb',model:r.wallRay.id,point:r.sweepTowardHinge.witnessB},{kind:'closedPanel',model:r.name,point:r.doorRay.point}];r.sourceTriangles=[];
 for(const target of targets){const node=data.nodes.find((n:any)=>n.name===target.model),mat=matrices.get(node.name.toLowerCase())!;
 for(const mesh of data.meshes.filter((m:any)=>m.resource===node.resource)){const ps=mesh.positions.map((p:number[])=>sourcePointToWorld([0,1,2].map(i=>mat[12+i]+mat[i]*p[0]+mat[4+i]*p[1]+mat[8+i]*p[2]),S));
 for(let face=0;face<mesh.faces.length;face++){const [a,b,c]=mesh.faces[face].map((i:number)=>ps[i]),u={x:b.x-a.x,y:b.y-a.y,z:b.z-a.z},v={x:c.x-a.x,y:c.y-a.y,z:c.z-a.z},w={x:target.point.x-a.x,y:target.point.y-a.y,z:target.point.z-a.z},dot=(p:any,q:any)=>p.x*q.x+p.y*q.y+p.z*q.z,uu=dot(u,u),vv=dot(v,v),uv=dot(u,v),uw=dot(u,w),vw=dot(v,w),den=uu*vv-uv*uv;if(Math.abs(den)<1e-18)continue;const beta=(vv*uw-uv*vw)/den,gamma=(uu*vw-uv*uw)/den,projected={x:a.x+beta*u.x+gamma*v.x,y:a.y+beta*u.y+gamma*v.y,z:a.z+beta*u.z+gamma*v.z},error=Math.hypot(projected.x-target.point.x,projected.y-target.point.y,projected.z-target.point.z);if(error<1e-6&&beta>=-1e-6&&gamma>=-1e-6&&beta+gamma<=1+1e-6)r.sourceTriangles.push({kind:target.kind,model:target.model,part:mesh.part,face,indices:mesh.faces[face],vertices:[a,b,c],error,barycentric:[1-beta-gamma,beta,gamma]});}
 }}
}
writeFileSync(base+'feasibility.json',JSON.stringify({radius:R,contactDistance:T,triggerDistance:100*S,results},null,2));
