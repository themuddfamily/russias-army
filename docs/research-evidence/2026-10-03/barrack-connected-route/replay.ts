import {readFileSync,writeFileSync} from 'node:fs';
import {createOriginalDoorWorld} from '../../../../shared/originalDoorWorld';
import {getOriginalSettledSpawns,ORIGINAL_SOURCE_SPAWNS,ORIGINAL_MAP_SCALE as S} from '../../../../shared/originalMapProfile';
import {createOriginalPlayerBody,stepOriginalPhysicsWorld,applyOriginalPlayerControls,originalPlayerEye,ORIGINAL_PLAYER_RADIUS as R,ORIGINAL_PLAYER_EYE_OFFSET as E} from '../../../../shared/originalPlayerPhysics';
import {ORIGINAL_COLLISION_CONTACT_DISTANCE as T} from '../../../../shared/originalExplosives';
const base='docs/research-evidence/2026-10-03/barrack-connected-route/';
const scene=JSON.parse(readFileSync('public/assets/original-scenes/barrack/scene.json','utf8')),tracks=JSON.parse(readFileSync('public/assets/original-scenes/barrack/doors.json','utf8')),world=createOriginalDoorWorld(scene,S,tracks),spawns=getOriginalSettledSpawns('barrack',world);
const door=JSON.parse(readFileSync('docs/research-evidence/2026-10-03/barrack-door-passages/replay.json','utf8')).records.find((x:any)=>x.name==='door open 5');
const ramp=JSON.parse(readFileSync('docs/research-evidence/2026-10-03/barrack-route-geometry/replay.json','utf8')).results.find((x:any)=>x.pair[0]===18);
const body=createOriginalPlayerBody('connected-route',{...spawns[5],y:spawns[5].y+R+E});body.supported=true;
const waypoints=[{name:'ramp lower approach',x:ramp.from.x+1,z:ramp.from.z},{name:'ramp upper extension',x:ramp.to.x-1,z:ramp.to.z},{name:'upper corner',x:-19,z:63.5},{name:'upper platform bypass',x:-19,z:66},{name:'upper corridor entrance',x:-8,z:66},{name:'upper corridor exit',x:-8,z:75.5},{name:'door platform approach',x:-1.316875,z:75.5},{name:'door near approach',...door.approaches[1].from},{name:'door far approach',...door.approaches[1].to}];
const trace:any[]=[],segments:any[]=[],contactEvents:any[]=[];let queries=0,callback=0;
const environment={onResolvedContact:(event:any)=>contactEvents.push({callback,...event}),contactDistance:T,memoizePureSweep:true,sweep:(a:any,b:any,r:number)=>{if(++queries>5000)throw Error('query budget');return world.sweepSphere(a,b,r,T)},contactsSphere:(p:any,r:number)=>{if(++queries>5000)throw Error('query budget');return world.contactsSphere(p,r,T)}};
let status='completed';
try{for(const target of waypoints){const begin=callback;let reached=false,minDistance=Infinity,stalled=0;for(let local=0;local<280&&callback<2000;local++,callback++){
stepOriginalPhysicsWorld([body],[],environment);const triggered=world.triggerNearby(originalPlayerEye(body),callback/30),dx=target.x-body.position.x,dz=target.z-body.position.z,distance=Math.hypot(dx,dz);const feet={...body.position,y:body.position.y-R};const intersects=world.playerIntersects(feet,R,2*R);trace.push({callback,target:target.name,position:{...body.position},velocity:{...body.velocity},supported:body.supported,intersects,triggered,distance});
if(distance<.28){applyOriginalPlayerControls(body,{yaw:0,pitch:0});reached=true;callback++;break;}
if(distance<minDistance-.01){minDistance=distance;stalled=0}else stalled++;
applyOriginalPlayerControls(body,{yaw:Math.atan2(-dx,-dz),pitch:0,forward:true});if(stalled>90)break;
}segments.push({target,begin,end:callback,reached,final:{...body.position},minDistance});console.log(JSON.stringify(segments.at(-1)));if(!reached){status='blocked';break;}}}catch(e){status=String(e)}
writeFileSync(base+'replay.json',JSON.stringify({scope:'Continuous shared source-derived controls and physics from real recovered settled spawn5; no dynamic barrels, browser, original runtime or footage equivalence',sourceSpawn:ORIGINAL_SOURCE_SPAWNS.barrack[5],spawns,rampPair:ramp.pair,door:door.name,waypoints,status,callbacks:callback,queries,segments,trace,contactEvents,doorState:world.getStates().find(x=>x.name===door.name)},null,2));
