import {readFileSync} from 'node:fs';
import {describe,it,expect} from 'vitest';
import {registerOriginalMapRuntime} from './originalMapRuntime';
import {createOriginalPlayerBody,originalPlayerEye,applyOriginalPlayerControls,stepOriginalPhysicsWorld,ORIGINAL_PLAYER_RADIUS,type OriginalPhysicsEnvironment} from './originalPlayerPhysics';
import {createOriginalProjectile,stepOriginalProjectileActor,ORIGINAL_COLLISION_CONTACT_DISTANCE,type OriginalProjectileState,type OriginalProjectileContact} from './originalExplosives';
import type {OriginalSceneData} from './originalSceneGeometry';
const clone=<T>(v:T):T=>structuredClone(v);
// Preserve finite feature evidence without trying to serialize its executable
// current-pose refresh closure. Numeric contact/state parity remains exact.
function snapshotContact(contact:OriginalProjectileContact){
 const {fixedFeature,...fields}=contact;
 return clone({...fields,...(fixedFeature?{fixedFeature:{revision:fixedFeature.revision,sourceIndex:fixedFeature.sourceIndex,model:fixedFeature.model,contactDistance:fixedFeature.contactDistance,triangle:fixedFeature.triangle,refreshPresent:typeof fixedFeature.refresh==='function'}}:{})});
}
function simulate(map:'barrack'|'woodlands',memoizePureSweep:boolean){
 const folder=map==='woodlands'?'woodland':map,data=JSON.parse(readFileSync(new URL(`../public/assets/original-scenes/${folder}/scene.json`,import.meta.url),'utf8')) as OriginalSceneData;
 const runtime=registerOriginalMapRuntime(map,data),players=Array.from({length:7},(_,i)=>{const feet=runtime.spawnPoints[i%runtime.spawnPoints.length];return createOriginalPlayerBody('p'+i,{...feet,y:feet.y+runtime.profile.eyeHeight});});
 let projectiles:OriginalProjectileState[]=[],sweeps=0;const trace:unknown[]=[];
 for(let callback=0;callback<150;callback++){
  if([0,35,85].includes(callback)){
   const eye=originalPlayerEye(players[0]),weapon=callback===35?'rpg':'launcher',p=createOriginalProjectile(weapon,eye,{x:1,y:-.2,z:0},'p0');
   p.position={...players[1].position,x:players[1].position.x-ORIGINAL_PLAYER_RADIUS-.16};p.velocity={x:5,y:0,z:0};projectiles.push(p);
  }
  const events:unknown[]=[];const result=stepOriginalPhysicsWorld(players,projectiles,{contactDistance:ORIGINAL_COLLISION_CONTACT_DISTANCE,memoizePureSweep,sweep:(from,to,radius)=>{sweeps++;return runtime.geometry.sweepSphere(from,to,radius,ORIGINAL_COLLISION_CONTACT_DISTANCE);},sweepConvex:(from,to,shape,surfaceVelocity)=>{sweeps++;return runtime.geometry.sweepConvex(from,to,shape,ORIGINAL_COLLISION_CONTACT_DISTANCE,surfaceVelocity);},
   onPlayerContact:(p,n,otherId)=>events.push({kind:'player',id:p.id,normal:clone(n),otherId}),
   onProjectileContact:(p,contact)=>events.push({kind:'projectile',weapon:p.weapon,position:clone(p.position),velocity:clone(p.velocity),contact:snapshotContact(contact)}),
  });
  const controls=players.map((p,i)=>applyOriginalPlayerControls(p,{yaw:callback*.02,pitch:.12,forward:i===0&&callback<35,right:i===0&&callback>=35&&callback<70,jump:i===0&&callback>=70&&callback<78,typing:i>1}));
  const actorEvents=projectiles.map(p=>stepOriginalProjectileActor(p));
  trace.push(clone({players,projectiles,events,controls,actorEvents,result}));projectiles=projectiles.filter((p,index)=>!actorEvents[index].detonated&&p.remainingCallbacks>0);
 }
 return {trace,sweeps};
}
function floorScenario(memoizePureSweep:boolean,mutate=false){
 let queries=0;const r=ORIGINAL_PLAYER_RADIUS,players=Array.from({length:5},(_,i)=>({id:'p'+i,position:{x:i*3,y:r,z:0},velocity:{x:0,y:0,z:0},supported:false}));
 const projectile=createOriginalProjectile('launcher',{x:30,y:.06,z:0},{x:1,y:0,z:0},'p0');projectile.velocity={x:0,y:0,z:0};
 projectile.position.y=-Math.min(...projectile.convex!.vertices.map(v=>v.y));
 // Infinite horizontal plane: the convex's actual minimum vertex height is
 // its exact support offset, not a sphere proxy or pivot-bound substitute.
 const floorContact:OriginalPhysicsEnvironment['sweep']=(from,to,height)=>{queries++;if(to.y>=height)return null;const fraction=from.y>height?(from.y-height)/(from.y-to.y):0;return {fraction,position:{x:from.x,y:height,z:from.z},normal:{x:0,y:1,z:0},witnessA:{x:from.x,y:0,z:from.z},witnessB:{x:from.x,y:0,z:from.z},body:{id:'fixed',velocity:{x:0,y:0,z:0},mass:Infinity,restitution:1,friction:.1}};};
 const events:unknown[]=[];const environment:OriginalPhysicsEnvironment={memoizePureSweep,sweep:floorContact,sweepConvex:(from,to,shape)=>floorContact(from,to,-Math.min(...shape.vertices.map(v=>v.y))),onProjectileContact:(_p,contact)=>{
  events.push(snapshotContact(contact));if(mutate){contact.position.x=999;contact.normal.x=999;if(contact.body)contact.body.velocity.x=999;if(contact.witnessA)contact.witnessA.x=999;if(contact.witnessB)contact.witnessB.z=999;}
 }};
 const result=stepOriginalPhysicsWorld(players,[projectile],environment);return {result,players,projectile,events,queries};
}
describe('bounded pure geometry sweep memo',()=>{
 for(const map of ['barrack','woodlands'] as const)it(`${map} preserves every seven-body moving/control/projectile callback and contact in exact order`,()=>{
  const raw=simulate(map,false),memo=simulate(map,true);expect(memo.trace).toEqual(raw.trace);expect(memo.sweeps).toBeLessThan(raw.sweeps);
  expect(memo.trace.some((entry:any)=>entry.events.some((e:any)=>e.kind==='projectile'))).toBe(true);
 },20_000);
 it('reduces repeated zero-time floor queries without changing body states or contact order',()=>{
  const raw=floorScenario(false),memo=floorScenario(true);expect(memo.queries).toBeLessThan(raw.queries);const {queries:_,...a}=raw,{queries:__,...b}=memo;expect(b).toEqual(a);
 });
 it('detaches cached contact position, normal, surface witnesses and other-body velocity from callback mutations',()=>{
  const raw=floorScenario(false,true),memo=floorScenario(true,true);expect(raw.events.length).toBeGreaterThan(0);expect(memo.queries).toBeLessThan(raw.queries);const {queries:_,...a}=raw,{queries:__,...b}=memo;expect(b).toEqual(a);
 });
 it('leaves arbitrary stateful sweep callbacks uncached by default',()=>{
  let calls=0;const player={id:'p',position:{x:0,y:0,z:0},velocity:{x:1,y:-1,z:0},supported:false};
  const sweep:OriginalPhysicsEnvironment['sweep']=from=>++calls===1?{fraction:0,position:{...from},normal:{x:0,y:1,z:0}}:null;
  stepOriginalPhysicsWorld([player],[],{sweep});expect(calls).toBe(11);
 });
});
