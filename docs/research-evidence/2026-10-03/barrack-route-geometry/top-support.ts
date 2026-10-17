import {readFileSync,writeFileSync} from 'node:fs';
import {createOriginalSceneGeometry} from '../../../../shared/originalSceneGeometry';
import {ORIGINAL_MAP_SCALE as S} from '../../../../shared/originalMapProfile';
import {createOriginalPlayerBody,stepOriginalPhysicsWorld,applyOriginalPlayerControls,ORIGINAL_PLAYER_RADIUS as R} from '../../../../shared/originalPlayerPhysics';
import {ORIGINAL_COLLISION_CONTACT_DISTANCE as T} from '../../../../shared/originalExplosives';
const base='docs/research-evidence/2026-10-03/barrack-route-geometry/',r=JSON.parse(readFileSync(base+'replay.json','utf8')).results[0],last=r.trace.at(-1),g=createOriginalSceneGeometry(JSON.parse(readFileSync('public/assets/original-scenes/barrack/scene.json','utf8')),{scale:S});
const body={...createOriginalPlayerBody('route',last.position),position:{...last.position},velocity:{...last.velocity},supported:false},events:any[]=[],queries:any[]=[];
const environment={contactDistance:T,memoizePureSweep:true,sweep:(a:any,b:any,r:number)=>{const hit=g.sweepSphere(a,b,r,T);queries.push({from:{...a},to:{...b},hit});return hit;},contactsSphere:(p:any,r:number)=>g.contactsSphere(p,r,T),onResolvedContact:(event:any)=>events.push(event)};
for(let i=0;i<3;i++){stepOriginalPhysicsWorld([body],[],environment);applyOriginalPlayerControls(body,{yaw:-1.5686401891617936,pitch:0,forward:true});}
const topSupport=g.playerSupportHeightAt(r.start.x,r.start.z,20,R,2*R)!;
body.position={x:r.start.x,y:topSupport+R,z:r.start.z};body.velocity={x:0,y:0,z:0};body.supported=true;events.length=0;queries.length=0;const trace=[];let reached=false;
for(let i=0;i<180;i++){stepOriginalPhysicsWorld([body],[],environment);applyOriginalPlayerControls(body,{yaw:-1.5686401891617936,pitch:0,forward:true});trace.push({callback:i,position:{...body.position},velocity:{...body.velocity},intersects:g.playerIntersects({...body.position,y:body.position.y-R},R,2*R)});if(body.position.x>=r.finish.x){reached=true;break;}}
const triangles=(g as any).triangles;
const nearWitness=queries.filter(q=>q.hit?.witnessB).map(q=>{const w=q.hit.witnessB;return {witness:w,normal:q.hit.normal,fraction:q.hit.fraction,triangles:triangles.filter((t:any)=>['x','y','z'].every(k=>w[k]>=Math.min(t.a[k],t.b[k],t.c[k])-1e-7&&w[k]<=Math.max(t.a[k],t.b[k],t.c[k])+1e-7)).filter((t:any)=>Math.abs((w.x-t.a.x)*t.normal.x+(w.y-t.a.y)*t.normal.y+(w.z-t.a.z)*t.normal.z)<1e-7).map((t:any)=>({model:t.model,a:t.a,b:t.b,c:t.c,normal:t.normal}))};});
writeFileSync(base+'top-support.json',JSON.stringify({topSupport,reached,trace,body,events,queries,nearWitness},null,2));console.log(JSON.stringify({topSupport,reached,events:events.length,queries:queries.length,hitModels:[...new Set(nearWitness.flatMap(n=>n.triangles.map((t:any)=>t.model)))],final:body.position}));
