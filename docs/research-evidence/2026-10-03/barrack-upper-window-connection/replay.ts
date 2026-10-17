import {readFileSync,writeFileSync} from 'node:fs';
import {createOriginalDoorWorld} from '../../../../shared/originalDoorWorld';
import {getOriginalSettledSpawns,ORIGINAL_SOURCE_SPAWNS,ORIGINAL_MAP_SCALE as S} from '../../../../shared/originalMapProfile';
import {createOriginalPlayerBody,stepOriginalPhysicsWorld,applyOriginalPlayerControls,originalPlayerEye,ORIGINAL_PLAYER_RADIUS as R,ORIGINAL_PLAYER_EYE_OFFSET as E} from '../../../../shared/originalPlayerPhysics';
import {ORIGINAL_COLLISION_CONTACT_DISTANCE as T} from '../../../../shared/originalExplosives';
const base='docs/research-evidence/2026-10-03/barrack-upper-window-connection/';
const scene=JSON.parse(readFileSync('public/assets/original-scenes/barrack/scene.json','utf8')),tracks=JSON.parse(readFileSync('public/assets/original-scenes/barrack/doors.json','utf8')),world=createOriginalDoorWorld(scene,S,tracks);
let queries=0;const queryTypes:Record<string,number>={};
function count(name:string){if(queries>=7962)throw Error('query budget');queryTypes[name]=(queryTypes[name]??0)+1;queries++;}
const spawnGeometry=Object.fromEntries(['supportHeightAt','playerSupportHeightAt','resolvePlayerOverlap','playerIntersects'].map(name=>[name,(...args:any[])=>{count('spawn:'+name);return (world as any)[name](...args)}])) as any;
const spawns=getOriginalSettledSpawns('barrack',spawnGeometry),spawnQueries=queries;
const body=createOriginalPlayerBody('spawn3-south-route',{...spawns[3],y:spawns[3].y+R+E});body.supported=true;
const trace:any[]=[],segments:any[]=[],contactEvents:any[]=[];let callback=0;
const environment={onResolvedContact:(event:any)=>contactEvents.push({callback,...event}),contactDistance:T,memoizePureSweep:true,sweep:(a:any,b:any,r:number)=>{count('sweep');return world.sweepSphere(a,b,r,T)},contactsSphere:(p:any,r:number)=>{count('contactsSphere');return world.contactsSphere(p,r,T)}};
let status='completed',jumpFired=false;
function save(file:string){writeFileSync(base+file,JSON.stringify({scope:'Continuous source-derived callback physics from recovered settled spawn3; no dynamic barrels, browser or original runtime',sourceSpawn:ORIGINAL_SOURCE_SPAWNS.barrack[3],spawns,spawnQueries,status,callbacks:callback,queries,queryTypes,segments,trace,contactEvents,jumpFired},null,2))}
function run(target:{name:string,x:number,z:number},jump:boolean){const begin=callback;let reached=false,minDistance=Infinity,stalled=0;
for(let local=0;local<200;local++,callback++){
stepOriginalPhysicsWorld([body],[],environment);const triggered=world.triggerNearby(originalPlayerEye(body),callback/30),dx=target.x-body.position.x,dz=target.z-body.position.z,distance=Math.hypot(dx,dz);count('playerIntersects');const intersects=world.playerIntersects({...body.position,y:body.position.y-R},R,2*R);
trace.push({callback,target:target.name,position:{...body.position},velocity:{...body.velocity},supported:body.supported,intersects,triggered,distance});
if(distance<.28){applyOriginalPlayerControls(body,{yaw:0,pitch:0});reached=true;callback++;break;}
if(distance<minDistance-.01){minDistance=distance;stalled=0}else stalled++;
const controls={yaw:Math.atan2(-dx,-dz),pitch:0,forward:true,jump:jump&&!jumpFired};const outcome=applyOriginalPlayerControls(body,controls);if(outcome.jumped){jumpFired=true;trace.at(-1).jump=true;}
if(stalled>12){callback++;break;}
}segments.push({target,begin,end:callback,reached,final:{...body.position},minDistance});console.log(JSON.stringify(segments.at(-1)));return reached;}
try{
for(const target of [{name:'southward edge lane to z68',x:77.12,z:68},{name:'westward diagonal corridor',x:74,z:71},{name:'round inner taller wall endpoint',x:71,z:71.8},{name:'western parallel corridor',x:68,z:71.8},{name:'ramp55/57 lower approach',x:48.4,z:71.88648},{name:'ramp55/57 upper extension',x:35.1,z:71.88649}]){
if(!run(target,false)){status='ordinary corridor blocked';save('blocked.json');break;}}
if(status==='completed'){const begin=callback;for(let i=0;i<8;i++,callback++){stepOriginalPhysicsWorld([body],[],environment);const triggered=world.triggerNearby(originalPlayerEye(body),callback/30);count('playerIntersects');const intersects=world.playerIntersects({...body.position,y:body.position.y-R},R,2*R);trace.push({callback,target:'released-controls upper-platform settling',position:{...body.position},velocity:{...body.velocity},supported:body.supported,intersects,triggered});applyOriginalPlayerControls(body,{yaw:Math.PI/2,pitch:0});}segments.push({target:{name:'released-controls upper-platform settling'},begin,end:callback,final:{...body.position},feetY:body.position.y-R});}
if(status==='completed'){for(const target of [{name:'north along upper platform',x:34.3,z:64.24},{name:'east to outside sill approach',x:47.7,z:64.24},{name:'eastward entry into room80',x:50.7,z:64.24}]){if(!run(target,false)){status='upper ordinary continuation blocked';save('ordinary-blocked.json');break;}}}
if(status==='upper ordinary continuation blocked'){if(run({name:'original jump across exterior sill rise',x:50.7,z:64.24},true)){status='completed with one original jump';const begin=callback;for(let i=0;i<16;i++,callback++){stepOriginalPhysicsWorld([body],[],environment);count('playerIntersects');const intersects=world.playerIntersects({...body.position,y:body.position.y-R},R,2*R);const controls=applyOriginalPlayerControls(body,{yaw:-Math.PI/2,pitch:0});trace.push({callback,target:'room80 release settling',position:{...body.position},velocity:{...body.velocity},supported:body.supported,intersects,controls});}segments.push({target:{name:'room80 release settling'},begin,end:callback,final:{...body.position},feetY:body.position.y-R});}else status='upper jump continuation blocked';}

}catch(e){status=String(e)}
save('replay.json');console.log(JSON.stringify({status,callbacks:callback,queries,spawnQueries,queryTypes,jumpFired}));
