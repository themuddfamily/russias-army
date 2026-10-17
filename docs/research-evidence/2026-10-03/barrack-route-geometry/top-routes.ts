import {readFileSync,writeFileSync} from 'node:fs';
import {createOriginalSceneGeometry} from '../../../../shared/originalSceneGeometry';
import {ORIGINAL_MAP_SCALE as S} from '../../../../shared/originalMapProfile';
import {createOriginalPlayerBody,stepOriginalPhysicsWorld,applyOriginalPlayerControls,ORIGINAL_PLAYER_RADIUS as R,ORIGINAL_PLAYER_EYE_OFFSET} from '../../../../shared/originalPlayerPhysics';
import {ORIGINAL_COLLISION_CONTACT_DISTANCE as T} from '../../../../shared/originalExplosives';
const base='docs/research-evidence/2026-10-03/barrack-route-geometry/',data=JSON.parse(readFileSync('public/assets/original-scenes/barrack/scene.json','utf8')),inventory=JSON.parse(readFileSync(base+'inventory.json','utf8')),g=createOriginalSceneGeometry(data,{scale:S}),part=inventory.records.find((r:any)=>r.resource==='plinths'&&r.part===0);
const environment={contactDistance:T,memoizePureSweep:true,sweep:(a:any,b:any,r:number)=>g.sweepSphere(a,b,r,T),contactsSphere:(p:any,r:number)=>g.contactsSphere(p,r,T)};
const results=[];
for(const pair of [[1,28],[10,38],[12,34],[17,35],[18,43],[41,62],[47,49],[51,53],[55,57]]){
 const unique=new Map<string,any>();for(const f of pair)for(const p of part.slopes.find((s:any)=>s.face===f).points)unique.set(JSON.stringify(p),p);const ps=[...unique.values()],low=Math.min(...ps.map(p=>p.y)),high=Math.max(...ps.map(p=>p.y));
 const average=(a:any[])=>Object.fromEntries(['x','y','z'].map(k=>[k,a.reduce((n,p)=>n+p[k],0)/a.length])) as {x:number;y:number;z:number};
 // The lower endpoint of faces10/38 is slightly nonlevel; identify its two lowest vertices.
 const sorted=ps.slice().sort((a,b)=>a.y-b.y),from=average(sorted.slice(0,2)),to=average(sorted.slice(-2)),length=Math.hypot(to.x-from.x,to.z-from.z),dx=(to.x-from.x)/length,dz=(to.z-from.z)/length;
 const start={x:from.x+dx*R,y:from.y,z:from.z+dz*R},finish={x:to.x+dx*R,z:to.z+dz*R};
 const support=g.playerSupportHeightAt(start.x,start.z,20,R,2*R);
 if(support===undefined){results.push({pair,from,to,start,finish,status:'missing_initial_support'});continue;}
 const body=createOriginalPlayerBody('route',{x:start.x,y:support+R+ORIGINAL_PLAYER_EYE_OFFSET,z:start.z});body.supported=true;const initialContacts=g.contactsSphere(body.position,R,T);const trace=[];let reached=false,intersections=0;
 for(let callback=0;callback<180;callback++){
  stepOriginalPhysicsWorld([body],[],environment);applyOriginalPlayerControls(body,{yaw:Math.atan2(-dx,-dz),pitch:0,forward:true});
  const feet={...body.position,y:body.position.y-R},intersects=g.playerIntersects(feet,R,2*R);if(intersects)intersections++;
  trace.push({callback,position:{...body.position},velocity:{...body.velocity},supported:body.supported,intersects});
  const advance=(body.position.x-from.x)*dx+(body.position.z-from.z)*dz;
  if(advance>=length+R){reached=true;break;}
 }
 const upperContacts=g.contactsSphere(body.position,R,T),descent=[];let returned=false;
 if(reached){for(let callback=0;callback<30;callback++){stepOriginalPhysicsWorld([body],[],environment);applyOriginalPlayerControls(body,{yaw:0,pitch:0});}
 for(let callback=0;callback<180;callback++){stepOriginalPhysicsWorld([body],[],environment);applyOriginalPlayerControls(body,{yaw:Math.atan2(dx,dz),pitch:0,forward:true});const feet={...body.position,y:body.position.y-R},intersects=g.playerIntersects(feet,R,2*R);if(intersects)intersections++;descent.push({callback,position:{...body.position},velocity:{...body.velocity},intersects});if((body.position.x-from.x)*dx+(body.position.z-from.z)*dz<=-R){returned=true;break;}}
 }
 results.push({pair,from,to,start,finish,initialContacts,upperContacts,descent,descentStatus:reached?(returned?'returned_lower_extension':'did_not_return'):'not_attempted_after_ascent_failure',run:length,rise:high-low,width:Math.hypot(sorted[0].x-sorted[1].x,sorted[0].z-sorted[1].z),radius:R,contactDistance:T,initialSupport:support,status:reached?'reached_upper_extension':'did_not_reach',intersections,trace});
 console.log(JSON.stringify({pair,status:reached?'reached_upper_extension':'did_not_reach',callbacks:trace.length,intersections,start,end:body.position}));
}
writeFileSync(base+'top-routes.json',JSON.stringify({initialSupportPolicy:'topmost sphere support at20 world-unit ceiling; may start on a roof rather than intended ramp: review initialContacts and initialSupport',scope:'shared source-derived player physics against fixed recovered scene; no dynamic doors/barrels, no native execution, no footage synchronization',results},null,2));
