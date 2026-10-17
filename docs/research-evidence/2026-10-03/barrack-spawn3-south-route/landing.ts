import {readFileSync,writeFileSync} from 'node:fs';
import {createOriginalDoorWorld} from '../../../../shared/originalDoorWorld';
import {getOriginalSettledSpawns,ORIGINAL_SOURCE_SPAWNS,ORIGINAL_MAP_SCALE as S} from '../../../../shared/originalMapProfile';
import {createOriginalPlayerBody,stepOriginalPhysicsWorld,applyOriginalPlayerControls,originalPlayerEye,ORIGINAL_PLAYER_RADIUS as R,ORIGINAL_PLAYER_EYE_OFFSET as E} from '../../../../shared/originalPlayerPhysics';
import {ORIGINAL_COLLISION_CONTACT_DISTANCE as T} from '../../../../shared/originalExplosives';
const base='docs/research-evidence/2026-10-03/barrack-spawn3-south-route/';
const prior=JSON.parse(readFileSync(base+'replay.json','utf8')),last=prior.trace.at(-1),world=createOriginalDoorWorld(JSON.parse(readFileSync('public/assets/original-scenes/barrack/scene.json','utf8')),S,JSON.parse(readFileSync('public/assets/original-scenes/barrack/doors.json','utf8')));
if(prior.trace.some((x:any)=>x.triggered.length))throw Error('Cannot restore changed door world');
const body={id:'spawn3-south-route',position:{...last.position},velocity:{...last.velocity},supported:false};
let queries=prior.queries,callback=prior.callbacks;const trace:any[]=[],contactEvents:any[]=[];function count(){if(++queries>4000)throw Error('query budget')}
const environment={onResolvedContact:(e:any)=>contactEvents.push({callback,...e}),contactDistance:T,memoizePureSweep:true,sweep:(a:any,b:any,r:number)=>{count();return world.sweepSphere(a,b,r,T)},contactsSphere:(p:any,r:number)=>{count();return world.contactsSphere(p,r,T)}};
let status='observation ended';try{for(let local=0;local<40;local++,callback++){
stepOriginalPhysicsWorld([body],[],environment);world.triggerNearby(originalPlayerEye(body),callback/30);count();const intersects=world.playerIntersects({...body.position,y:body.position.y-R},R,2*R);
trace.push({callback,position:{...body.position},velocity:{...body.velocity},supported:body.supported,intersects});
applyOriginalPlayerControls(body,{yaw:Math.atan2(-(77.12-body.position.x),-(72-body.position.z)),pitch:0,forward:true});
if(trace.at(-1).supported){status='landed; further traversal untested';callback++;break;}
}}catch(e){status=String(e)}
writeFileSync(base+'landing.json',JSON.stringify({scope:'Snapshot continuation of source body at end of premature airborne stall; exact position/velocity restored, no route reset; no door triggers in prior run',parent:'replay.json',initialSnapshot:last,status,queries,callbacks:callback,trace,contactEvents},null,2));console.log(JSON.stringify({status,queries,callbacks:callback,last:trace.at(-1)}));
