import {readFileSync,writeFileSync} from 'node:fs';
import {createOriginalSceneGeometry} from '../../../../shared/originalSceneGeometry';
import {ORIGINAL_MAP_SCALE as S} from '../../../../shared/originalMapProfile';
import {createOriginalPlayerBody,stepOriginalPhysicsWorld,applyOriginalPlayerControls,ORIGINAL_PLAYER_RADIUS as R,ORIGINAL_PLAYER_EYE_OFFSET as E} from '../../../../shared/originalPlayerPhysics';
import {ORIGINAL_COLLISION_CONTACT_DISTANCE as T} from '../../../../shared/originalExplosives';
const base='docs/research-evidence/2026-10-03/barrack-support-route/',data=JSON.parse(readFileSync('public/assets/original-scenes/barrack/scene.json','utf8')),g=createOriginalSceneGeometry(data,{scale:S});
const prior=JSON.parse(readFileSync(base+'replay.json','utf8'));let queries=0;const budget=3000-prior.queries;
const count=()=>{if(++queries>budget)throw Error('Source query budget exceeded');};
const environment={contactDistance:T,memoizePureSweep:true,sweep:(a:any,b:any,r:number)=>{count();return g.sweepSphere(a,b,r,T);},contactsSphere:(p:any,r:number)=>{count();return g.contactsSphere(p,r,T);}};
const results=[];
for(const jumpEnabled of [false,true]){
 const start={x:50.7,z:64.24};count();const h=g.playerSupportHeightAt(start.x,start.z,11,R,2*R);if(h===undefined)throw Error('Missing support');
 const body=createOriginalPlayerBody('support-route',{...start,y:h+R+E});body.supported=true;const initialContacts:any[]=[];const initialIntersects=null;
 const trace=[];let jumped=false,jumps=0,crossed=false,crossingCallback:null|number=null,intersections=0;
 for(let callback=0;callback<95;callback++){
  stepOriginalPhysicsWorld([body],[],environment);
  const jump=jumpEnabled&&!jumped&&body.position.x<50.4;
  const control=applyOriginalPlayerControls(body,{yaw:Math.PI/2,pitch:0,forward:!crossed,jump});if(control.jumped){jumped=true;jumps++;}
  const intersects=null;
  if(!crossed&&body.position.x<48.6){crossed=true;crossingCallback=callback;}
  trace.push({callback,position:{...body.position},velocity:{...body.velocity},supported:body.supported,control,intersects});
  if(crossed&&callback>=crossingCallback!+25)break;
 }
 count();const endSupport=g.playerSupportHeightAt(body.position.x,body.position.z,20,R,2*R);const finalContacts:any[]=[];
 results.push({jumpEnabled,start,initialSupport:h,initialContacts,initialIntersects,status:crossed?'crossed':'blocked',crossingCallback,jumps,intersections,endSupport,finalContacts,trace});
}
const state=(t:any)=>({callback:t.callback,position:t.position,velocity:t.velocity,supported:t.supported,control:t.control});
const matches=results.map((r,i)=>({jumpEnabled:r.jumpEnabled,jsonSerializedStateTraceMatches:JSON.stringify(r.trace.map(state))===JSON.stringify(prior.results[i].trace.map(state))}));
if(matches.some(v=>!v.jsonSerializedStateTraceMatches))throw Error('Trace mismatch');
writeFileSync(base+'verification.json',JSON.stringify({scope:'Replay without extra initial/final contact and per-callback intersection probes. Serialized JSON state trace equality; not signed-zero/Object.is proof.',matches,additionalQueries:queries,totalQueries:prior.queries+queries,budget:3000},null,2));console.log(JSON.stringify({matches,additionalQueries:queries,totalQueries:prior.queries+queries}));
