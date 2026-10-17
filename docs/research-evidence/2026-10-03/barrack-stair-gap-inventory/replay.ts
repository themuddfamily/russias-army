import {readFileSync,writeFileSync} from 'node:fs';
import {createOriginalSceneGeometry} from '../../../../shared/originalSceneGeometry';
import {ORIGINAL_MAP_SCALE as S} from '../../../../shared/originalMapProfile';
import {createOriginalPlayerBody,stepOriginalPhysicsWorld,applyOriginalPlayerControls,ORIGINAL_PLAYER_RADIUS as R,ORIGINAL_PLAYER_EYE_OFFSET as E} from '../../../../shared/originalPlayerPhysics';
import {ORIGINAL_COLLISION_CONTACT_DISTANCE as T} from '../../../../shared/originalExplosives';
const base='docs/research-evidence/2026-10-03/barrack-stair-gap-inventory/',data=JSON.parse(readFileSync('public/assets/original-scenes/barrack/scene.json','utf8')),g=createOriginalSceneGeometry(data,{scale:S});
let queries=0;const budget=4500;
const environment={contactDistance:T,memoizePureSweep:true,sweep:(a:any,b:any,r:number)=>{if(++queries>budget)throw Error('Source query budget exceeded');return g.sweepSphere(a,b,r,T);},contactsSphere:(p:any,r:number)=>{if(++queries>budget)throw Error('Source query budget exceeded');return g.contactsSphere(p,r,T);}};
const supportChecks=[];
for(const x of [-10.2,-10.5,-10.8])for(const z of [4.8,4.3,4.0,3.72,3.48,3.0]){queries++;const h=g.playerSupportHeightAt(x,z,4,R,2*R);supportChecks.push({x,z,support:h,contacts:h===undefined?[]:environment.contactsSphere({x,y:h+R,z},R)});}
const results=[];
for(const jump of [false,true]){
 const start={x:-10.5,z:4.8},finishZ: number=2.8;queries++;const h=g.playerSupportHeightAt(start.x,start.z,4,R,2*R);
 if(h===undefined){results.push({jump,status:'missing_support'});continue;}
 const body=createOriginalPlayerBody('stair',{...start,y:h+R+E});body.supported=true;const initialContacts=environment.contactsSphere(body.position,R),trace=[];let reached=false,jumps=0,intersections=0;
 for(let callback=0;callback<110;callback++){
  stepOriginalPhysicsWorld([body],[],environment);
  const control=applyOriginalPlayerControls(body,{yaw:0,pitch:0,forward:true,jump:jump&&body.position.z<4.4&&body.position.z>3.0});if(control.jumped)jumps++;
  queries++;const intersects=g.playerIntersects({...body.position,y:body.position.y-R},R,2*R);if(intersects)intersections++;
  trace.push({callback,position:{...body.position},velocity:{...body.velocity},control,intersects});
  if(body.position.z<finishZ){reached=true;break;}
 }
 results.push({start,finishZ,initialSupport:h,initialContacts,jump,status:reached?'crossed':'blocked',jumps,intersections,trace});
}
writeFileSync(base+'replay.json',JSON.stringify({scope:'Fixed recovered scene shared source-callback replay for concrete low-level three-tread candidate. Initialization once; original impulses, skin, contacts and callback order unchanged; no dynamic doors/barrels or historical/native equivalence.',supportChecks,results,queries,budget},null,2));
console.log(JSON.stringify({supportChecks:supportChecks.map(v=>({...v,contacts:v.contacts.map((c:any)=>({normal:c.normal,model:c.model,witnessB:c.witnessB}))})),results:results.map(r=>({...r,trace:undefined,callbacks:r.trace?.length,end:r.trace?.at(-1)})),queries},null,2));
