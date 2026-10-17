import {readFileSync,writeFileSync} from 'node:fs';
import {createOriginalDoorWorld} from '../../../../shared/originalDoorWorld';
import {getOriginalSettledSpawns,ORIGINAL_SOURCE_SPAWNS,ORIGINAL_MAP_SCALE as S} from '../../../../shared/originalMapProfile';
import {createOriginalPlayerBody,stepOriginalPhysicsWorld,applyOriginalPlayerControls,originalPlayerEye,ORIGINAL_PLAYER_RADIUS as R,ORIGINAL_PLAYER_EYE_OFFSET as E} from '../../../../shared/originalPlayerPhysics';
import {ORIGINAL_COLLISION_CONTACT_DISTANCE as T} from '../../../../shared/originalExplosives';
const base='docs/research-evidence/2026-10-03/barrack-window-connection/';
const scene=JSON.parse(readFileSync('public/assets/original-scenes/barrack/scene.json','utf8')),tracks=JSON.parse(readFileSync('public/assets/original-scenes/barrack/doors.json','utf8')),world=createOriginalDoorWorld(scene,S,tracks),spawns=getOriginalSettledSpawns('barrack',world);
const door=JSON.parse(readFileSync('docs/research-evidence/2026-10-03/barrack-door-passages/replay.json','utf8')).records.find((x:any)=>x.name==='door open 5');
const ramp=JSON.parse(readFileSync('docs/research-evidence/2026-10-03/barrack-route-geometry/replay.json','utf8')).results.find((x:any)=>x.pair[0]===18);
const body=createOriginalPlayerBody('window-connection',{...spawns[3],y:spawns[3].y+R+E});body.supported=true;
const waypoints=[{name:'southward edge-lane probe',x:77.12,z:36}];
const trace:any[]=[],segments:any[]=[],contactEvents:any[]=[];let queries=3079,callback=0;
const environment={onResolvedContact:(event:any)=>contactEvents.push({callback,...event}),contactDistance:T,memoizePureSweep:true,sweep:(a:any,b:any,r:number)=>{if(++queries>4000)throw Error('query budget');return world.sweepSphere(a,b,r,T)},contactsSphere:(p:any,r:number)=>{if(++queries>4000)throw Error('query budget');return world.contactsSphere(p,r,T)}};
let status='completed';
try{for(const target of waypoints){const begin=callback;let reached=false,minDistance=Infinity,stalled=0;for(let local=0;local<24&&callback<2000;local++,callback++){
stepOriginalPhysicsWorld([body],[],environment);const triggered=world.triggerNearby(originalPlayerEye(body),callback/30),dx=target.x-body.position.x,dz=target.z-body.position.z,distance=Math.hypot(dx,dz);const feet={...body.position,y:body.position.y-R};if(++queries>4000)throw Error('query budget');const intersects=world.playerIntersects(feet,R,2*R);trace.push({callback,target:target.name,position:{...body.position},velocity:{...body.velocity},supported:body.supported,intersects,triggered,distance});
if(distance<.28){applyOriginalPlayerControls(body,{yaw:0,pitch:0});reached=true;callback++;break;}
if(distance<minDistance-.01){minDistance=distance;stalled=0}else stalled++;
applyOriginalPlayerControls(body,{yaw:Math.atan2(-dx,-dz),pitch:0,forward:true});if(stalled>90)break;
}segments.push({target,begin,end:callback,reached,final:{...body.position},minDistance});console.log(JSON.stringify(segments.at(-1)));if(!reached){status='blocked';break;}}}catch(e){status=String(e)}
writeFileSync(base+'south-probe.json',JSON.stringify({scope:'Continuous shared source-derived controls and physics from real recovered settled spawn3; no dynamic barrels, browser, original runtime or footage equivalence',sourceSpawn:ORIGINAL_SOURCE_SPAWNS.barrack[3],spawns,rampPair:ramp.pair,door:door.name,waypoints,status,callbacks:callback,queries,segments,trace,contactEvents,doorState:world.getStates().find(x=>x.name===door.name)},null,2));
