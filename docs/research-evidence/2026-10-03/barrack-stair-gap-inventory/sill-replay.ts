import {readFileSync,writeFileSync} from 'node:fs';
import {createOriginalSceneGeometry} from '../../../../shared/originalSceneGeometry';
import {ORIGINAL_MAP_SCALE as S} from '../../../../shared/originalMapProfile';
import {createOriginalPlayerBody,stepOriginalPhysicsWorld,applyOriginalPlayerControls,ORIGINAL_PLAYER_RADIUS as R,ORIGINAL_PLAYER_EYE_OFFSET as E} from '../../../../shared/originalPlayerPhysics';
import {ORIGINAL_COLLISION_CONTACT_DISTANCE as T} from '../../../../shared/originalExplosives';
const base='docs/research-evidence/2026-10-03/barrack-stair-gap-inventory/',data=JSON.parse(readFileSync('public/assets/original-scenes/barrack/scene.json','utf8')),g=createOriginalSceneGeometry(data,{scale:S});
let queries=0;const budget=4500;
const environment={contactDistance:T,memoizePureSweep:true,sweep:(a:any,b:any,r:number)=>{if(++queries>budget)throw Error('Source query budget exceeded');return g.sweepSphere(a,b,r,T);},contactsSphere:(p:any,r:number)=>{if(++queries>budget)throw Error('Source query budget exceeded');return g.contactsSphere(p,r,T);}};
const supportChecks=[];
for(const x of [3.4,3.8,4.1,4.5,4.9,5.3])for(const z of [7.5]){queries++;const h=g.playerSupportHeightAt(x,z,4,R,2*R);supportChecks.push({x,z,support:h,contacts:h===undefined?[]:environment.contactsSphere({x,y:h+R,z},R)});}
const results=[];
for(const jump of [false,true]){
 const start={x:3.4,z:7.5},finishX: number=5.4;queries++;const h=g.playerSupportHeightAt(start.x,start.z,4,R,2*R);
 if(h===undefined){results.push({jump,status:'missing_support'});continue;}
 const body=createOriginalPlayerBody('stair',{...start,y:h+R+E});body.supported=true;const initialContacts=environment.contactsSphere(body.position,R),trace=[];let reached=false,jumps=0,intersections=0;
 for(let callback=0;callback<110;callback++){
  stepOriginalPhysicsWorld([body],[],environment);
  const control=applyOriginalPlayerControls(body,{yaw:-Math.PI/2,pitch:0,forward:true,jump:jump&&body.position.x>3.5&&body.position.x<4.5});if(control.jumped)jumps++;
  queries++;const intersects=g.playerIntersects({...body.position,y:body.position.y-R},R,2*R);if(intersects)intersections++;
  trace.push({callback,position:{...body.position},velocity:{...body.velocity},control,intersects});
  if(body.position.x>finishX){reached=true;break;}
 }
 results.push({start,finishX,initialSupport:h,initialContacts,jump,status:reached?'crossed':'blocked',jumps,intersections,trace});
}
writeFileSync(base+'sill-replay.json',JSON.stringify({scope:'Fixed recovered scene shared source-callback replay for upward-facing bigredfellaopen single-sill candidate groups82/97. Initialization once; original impulses, skin, contacts and callback order unchanged; no dynamic doors/barrels or historical/native equivalence.',supportChecks,results,queries,budget},null,2));
console.log(JSON.stringify({supportChecks:supportChecks.map(v=>({...v,contacts:v.contacts.map((c:any)=>({normal:c.normal,model:c.model,witnessB:c.witnessB}))})),results:results.map(r=>({...r,trace:undefined,callbacks:r.trace?.length,end:r.trace?.at(-1)})),queries},null,2));
