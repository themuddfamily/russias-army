import {readFileSync} from 'node:fs';
import {registerOriginalMapRuntime} from '../../shared/originalMapRuntime';
import {createOriginalPlayerBody,originalPlayerEye,applyOriginalPlayerControls,stepOriginalPhysicsWorld,ORIGINAL_PLAYER_RADIUS} from '../../shared/originalPlayerPhysics';
import {createOriginalProjectile,stepOriginalProjectileActor,ORIGINAL_COLLISION_CONTACT_DISTANCE as T,type OriginalProjectileState} from '../../shared/originalExplosives';
const map=process.argv[2]==='barrack'?'barrack':'woodlands',folder=map==='woodlands'?'woodland':map;
const runtime=registerOriginalMapRuntime(map,JSON.parse(readFileSync(`public/assets/original-scenes/${folder}/scene.json`,'utf8')));
const players=Array.from({length:7},(_,i)=>{const feet=runtime.spawnPoints[i%runtime.spawnPoints.length];return createOriginalPlayerBody('p'+i,{...feet,y:feet.y+runtime.profile.eyeHeight});});
let projectiles:OriginalProjectileState[]=[],total=0;
for(let callback=0;callback<50;callback++){
 if([0,35].includes(callback)){const p=createOriginalProjectile(callback===35?'rpg':'launcher',originalPlayerEye(players[0]),{x:1,y:-.2,z:0},'p0');p.position={...players[1].position,x:players[1].position.x-ORIGINAL_PLAYER_RADIUS-.16};p.velocity={x:5,y:0,z:0};projectiles.push(p);}
 const begin=performance.now();
 const result=stepOriginalPhysicsWorld(players,projectiles,{contactDistance:T,memoizePureSweep:true,sweep:(a,b,r)=>runtime.geometry.sweepSphere(a,b,r,T),sweepConvex:(a,b,s,v)=>runtime.geometry.sweepConvex(a,b,s,T,v)});
 players.forEach((p,i)=>applyOriginalPlayerControls(p,{yaw:callback*.02,pitch:.12,forward:i===0&&callback<35,right:i===0&&callback>=35,jump:false,typing:i>1}));
 projectiles=projectiles.filter(p=>!stepOriginalProjectileActor(p).detonated&&p.remainingCallbacks>0);
 const elapsed=performance.now()-begin;total+=elapsed;
 console.log(JSON.stringify({map,callback,elapsedMs:elapsed,contacts:result.contacts,projectiles:projectiles.length,angularSpeeds:projectiles.map(p=>p.angular&&Math.hypot(...Object.values(p.angular.angularVelocity)))}));
}
console.log(JSON.stringify({map,totalMs:total,scope:'Copy-only CPU benchmark; overlapping seven-player fixture and two projectiles, no original runtime.'}));
