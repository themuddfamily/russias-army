import {readFileSync,writeFileSync} from 'node:fs';
import {createOriginalSceneGeometry} from '../../../../shared/originalSceneGeometry';
import {ORIGINAL_MAP_SCALE as S} from '../../../../shared/originalMapProfile';
import {createOriginalPlayerBody,stepOriginalPhysicsWorld,applyOriginalPlayerControls,ORIGINAL_PLAYER_RADIUS as R,ORIGINAL_PLAYER_EYE_OFFSET as E} from '../../../../shared/originalPlayerPhysics';
import {ORIGINAL_COLLISION_CONTACT_DISTANCE as T} from '../../../../shared/originalExplosives';
const base='docs/research-evidence/2026-10-03/barrack-support-route/',data=JSON.parse(readFileSync('public/assets/original-scenes/barrack/scene.json','utf8')),g=createOriginalSceneGeometry(data,{scale:S});
let queries=JSON.parse(readFileSync(base+'inspection.json','utf8')).queries;const budget=3000;
const count=()=>{if(++queries>budget)throw Error('Source query budget exceeded');};
const environment={contactDistance:T,memoizePureSweep:true,sweep:(a:any,b:any,r:number)=>{count();return g.sweepSphere(a,b,r,T);},contactsSphere:(p:any,r:number)=>{count();return g.contactsSphere(p,r,T);}};
const results=[];
for(const jumpEnabled of [false,true]){
 const start={x:50.7,z:64.24};count();const h=g.playerSupportHeightAt(start.x,start.z,11,R,2*R);if(h===undefined)throw Error('Missing support');
 const body=createOriginalPlayerBody('support-route',{...start,y:h+R+E});body.supported=true;const initialContacts=environment.contactsSphere(body.position,R);count();const initialIntersects=g.playerIntersects({...body.position,y:body.position.y-R},R,2*R);
 const trace=[];let jumped=false,jumps=0,crossed=false,crossingCallback:null|number=null,intersections=0;
 for(let callback=0;callback<95;callback++){
  stepOriginalPhysicsWorld([body],[],environment);
  const jump=jumpEnabled&&!jumped&&body.position.x<50.4;
  const control=applyOriginalPlayerControls(body,{yaw:Math.PI/2,pitch:0,forward:!crossed,jump});if(control.jumped){jumped=true;jumps++;}
  count();const intersects=g.playerIntersects({...body.position,y:body.position.y-R},R,2*R);if(intersects)intersections++;
  if(!crossed&&body.position.x<48.6){crossed=true;crossingCallback=callback;}
  trace.push({callback,position:{...body.position},velocity:{...body.velocity},supported:body.supported,control,intersects});
  if(crossed&&callback>=crossingCallback!+25)break;
 }
 count();const endSupport=g.playerSupportHeightAt(body.position.x,body.position.z,20,R,2*R);const finalContacts=environment.contactsSphere(body.position,R);
 results.push({jumpEnabled,start,initialSupport:h,initialContacts,initialIntersects,status:crossed?'crossed':'blocked',crossingCallback,jumps,intersections,endSupport,finalContacts,trace});
}
writeFileSync(base+'replay.json',JSON.stringify({scope:'Shared current player physics across an actual central window sill80/118. Fixed scene only, no door/barrel/player world or native equivalence. One initialization, source callback step then controls, unchanged impulses/skin/tolerances.',queries,budget,radius:R,eyeOffset:E,contactDistance:T,results},null,2));
console.log(JSON.stringify({queries,results:results.map(r=>({...r,trace:undefined,callbacks:r.trace.length,end:r.trace.at(-1)}))},null,2));
