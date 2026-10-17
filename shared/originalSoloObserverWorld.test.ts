import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {registerOriginalMapRuntime,type OriginalMapRuntime} from './originalMapRuntime';
import {createOriginalSceneGeometry,sourcePointToWorld} from './originalSceneGeometry';
import {createOriginalDoorWorld,type OriginalDoorTracks} from './originalDoorWorld';
import {OriginalSoldierCollision,type OriginalSoldierCollisionAssets} from './originalSoldierCollision';
import {OriginalBarrelWorld} from './originalBarrelWorld';
import {createOriginalPlayerBody,ORIGINAL_PLAYER_RADIUS} from './originalPlayerPhysics';
import {createOriginalPlayerHealth} from './originalPlayerHealth';
import {OriginalSoloObserverWorlds,type OriginalSoloEvent} from './originalSoloObserverWorld';
const source=new Map<'barrack'|'woodlands',OriginalMapRuntime>();
function runtime(map:'barrack'|'woodlands'){
 let value=source.get(map);if(!value){value=registerOriginalMapRuntime(map,JSON.parse(readFileSync(`public/assets/original-scenes/${map==='barrack'?'barrack':'woodland'}/scene.json`,'utf8')));source.set(map,value);}
 // Elevated seeds keep real imported fixed geometry outside these local
 // dynamic contacts. No empty-scene constructor or solver stub is used.
 return value;
}
function setup(map:'barrack'|'woodlands'){
 const events:OriginalSoloEvent[]=[],worlds=new OriginalSoloObserverWorlds(runtime(map),{onEvent:event=>events.push(event)});
 const a=worlds.register({id:'human',name:'Launcher',eye:{x:1000,y:1000,z:1000}}),b=worlds.register({id:'bot',name:'Bot',eye:{x:2000,y:1000,z:1000}}),denied=worlds.register({id:'duplicate',name:'lAuNcHeR',eye:{x:3000,y:1000,z:1000}});
 for(const world of worlds.worlds.values())world.barrels.applySnapshots([]);
 const launch=(weapon:'launcher'|'rpg'='launcher')=>{
  const admitted=worlds.launch({ownerId:a.id,weapon,eye:{x:100,y:100,z:100},direction:{x:-1,y:0,z:0}},0);
  if(!admitted.ok)throw Error(admitted.reason);return admitted.launch;
 };
 const callback=(time:number)=>{worlds.physics(time);for(const world of worlds.worlds.values())worlds.goody(world.id);worlds.completeGoody(time);worlds.actors(time);};
 return {worlds,a,b,denied,events,launch,callback};
}
const maps=['barrack','woodlands'] as const;

describe('browser-safe solo observer population coordinator',()=>{
 it.each(maps)('%s isolates admitted constructor state and denies equivalent-name remote receipt',map=>{
  const s=setup(map),record=s.launch(),a=s.a.projectiles.get(record.id)!,b=s.b.projectiles.get(record.id)!;
  expect(s.denied.projectiles.size).toBe(0);expect(s.events.filter(event=>event.kind==='spawned')).toHaveLength(2);
  expect(Object.isFrozen(record)).toBe(true);expect(Object.isFrozen(record.eye)).toBe(true);
  expect(a.state).not.toBe(b.state);expect(a.state.position).not.toBe(b.state.position);expect(a.state.angular).not.toBe(b.state.angular);
  expect(a.state.angular!.orientation).not.toBe(b.state.angular!.orientation);expect(a.state.angular!.angularVelocity).not.toBe(b.state.angular!.angularVelocity);
  a.state.angular!.angularVelocity.x=123;expect(b.state.angular!.angularVelocity.x).toBe(0);
  s.worlds.clear();expect(s.worlds.launches.size).toBe(0);
 });
 it.each(maps)('%s physically contacts only its private local goody and trajectory',map=>{
  const s=setup(map),record=s.launch(),a=s.a.projectiles.get(record.id)!,b=s.b.projectiles.get(record.id)!;
  for(const world of [s.a,s.b,s.denied])world.body.position={x:100,y:100,z:100};
  const extent=-Math.min(...a.state.convex!.vertices.map(vertex=>vertex.x));
  a.state.position={x:100+ORIGINAL_PLAYER_RADIUS+extent+.08,y:100,z:100};a.state.velocity={x:-10,y:0,z:0};
  b.state.position={x:200,y:100,z:100};b.state.velocity={x:-10,y:0,z:0};
  s.callback(1/30);
  expect(s.a.body.velocity.x).not.toBe(0);expect(s.b.body.velocity.x).toBe(0);expect(s.denied.body.velocity.x).toBe(0);
  expect(a.state.velocity.x).not.toBe(b.state.velocity.x);expect(b.state.position.x).toBeCloseTo(199.5,8);
  expect(s.events.filter(event=>event.kind==='contact').map(event=>event.recipientId)).toEqual(['human']);
 });
 it.each(maps)('%s retains B projectile after A expires and damages only A sixteen times',map=>{
  const s=setup(map),record=s.launch(),a=s.a.projectiles.get(record.id)!;
  a.state.position={...s.a.body.position};a.state.remainingCallbacks=1;a.state.velocity={x:0,y:0,z:0};
  s.callback(1/30);expect(s.a.blasts.has(record.id)).toBe(true);expect(s.b.projectiles.has(record.id)).toBe(true);
  // Keep the own goody at its own blast; this isolates actor hurt population
  // and lifetime from the independently tested gravity/trajectory solver.
  for(let step=2;step<=17;step++){
   const blast=s.a.blasts.get(record.id);if(blast){s.a.body.position={...blast.state.position};s.a.body.velocity={x:0,y:0,z:0};}
   s.callback(step/30);
  }
  expect(s.a.health.canonical).toBe(20);expect(s.b.health.canonical).toBe(100);expect(s.denied.health.canonical).toBe(100);
  const hurts=s.events.filter(event=>event.kind==='damaged');expect(hurts).toHaveLength(16);expect(hurts.every(event=>event.recipientId==='human')).toBe(true);
  expect(s.a.blasts.size).toBe(0);expect(s.b.projectiles.has(record.id)).toBe(true);expect(s.worlds.launches.has(record.id)).toBe(true);
 });
 it.each(maps)('%s excludes gun-phase births from the captured actor callback',map=>{
  const s=setup(map);s.worlds.physics(1/30);s.worlds.goody(s.a.id);s.worlds.goody(s.b.id);s.worlds.goody(s.denied.id);s.worlds.completeGoody(1/30);
  const launch=s.launch();s.worlds.actors(1/30);expect(s.a.projectiles.get(launch.id)!.state.remainingCallbacks).toBe(60);
  s.callback(2/30);expect(s.a.projectiles.get(launch.id)!.state.remainingCallbacks).toBe(59);
 });
 it.each(maps)('%s sender disposal preserves remote copies and same-ID replay has no inheritance',map=>{
  const s=setup(map),record=s.launch(),remote=s.b.projectiles.get(record.id)!;
  s.worlds.dispose(s.a.id);expect(s.b.projectiles.get(record.id)).toBe(remote);
  const fresh=s.worlds.register({id:'human',name:'Launcher',eye:{x:1000,y:1000,z:1000}},1/30);
  expect(fresh.lifeGeneration).toBe(2);expect(fresh.cutoff).toBe(record.sequence);expect(fresh.projectiles.size).toBe(0);expect(fresh.body).not.toBe(s.a.body);
  s.callback(2/30);expect(remote.state.remainingCallbacks).toBe(59);
 });
 it.each(maps)('%s freeze/resume never catches up or decrements fuses while paused',map=>{
  const s=setup(map),record=s.launch(),projectile=s.a.projectiles.get(record.id)!;
  s.worlds.freeze();s.callback(100);expect(projectile.state.remainingCallbacks).toBe(60);
  s.worlds.resume(100);s.callback(100+1/30);expect(projectile.state.remainingCallbacks).toBe(59);
 });
 it('counts eight live logical projectile IDs across all lives of a stable owner',()=>{
  const s=setup('woodlands');for(let index=0;index<8;index++)s.launch();
  expect(s.worlds.launch({ownerId:'human',weapon:'launcher',eye:{x:100,y:100,z:100},direction:{x:0,y:1,z:0}},0)).toEqual({ok:false,reason:'projectile-cap'});
  s.worlds.dispose('human');s.worlds.register({id:'human',name:'Launcher',eye:{x:1000,y:1000,z:1000}});
  expect(s.worlds.launch({ownerId:'human',weapon:'launcher',eye:{x:100,y:100,z:100},direction:{x:0,y:1,z:0}},0)).toEqual({ok:false,reason:'projectile-cap'});
  s.worlds.dispose('bot');expect(s.worlds.launches.size).toBe(0);
  expect(s.worlds.launch({ownerId:'human',weapon:'launcher',eye:{x:100,y:100,z:100},direction:{x:0,y:1,z:0}},0).ok).toBe(true);
 });
 it('failed remote constructor delivery creates no actor and local owner still owns its constructor',()=>{
  const worlds=new OriginalSoloObserverWorlds(runtime('woodlands'),{deliverLaunch:()=>false});
  const owner=worlds.register({id:'a',name:'A',eye:{x:100,y:100,z:100}}),remote=worlds.register({id:'b',name:'B',eye:{x:200,y:100,z:100}});
  const admitted=worlds.launch({ownerId:'a',weapon:'launcher',eye:{x:100,y:100,z:100},direction:{x:0,y:1,z:0}},0);
  expect(admitted.ok).toBe(true);expect(owner.projectiles.size).toBe(1);expect(remote.projectiles.size).toBe(0);
 });
 it('binds existing human body/health/arena state and rejects cross-world mutable aliases',()=>{
  const r=runtime('barrack'),barrels=new OriginalBarrelWorld(r),body=createOriginalPlayerBody('a',{x:100,y:100,z:100}),health=createOriginalPlayerHealth();
  const worlds=new OriginalSoloObserverWorlds(r),human=worlds.register({id:'a',name:'A',eye:{x:100,y:100,z:100},body,health,barrels});
  expect(human.body).toBe(body);expect(human.health).toBe(health);expect(human.barrels).toBe(barrels);
  expect(()=>worlds.register({id:'b',name:'B',eye:{x:200,y:100,z:100},body})).toThrow('Aliased');
 });
 it('source damage uses phased strict death and emits one immutable-attribution death',()=>{
  const s=setup('woodlands');s.a.health=createOriginalPlayerHealth(5,2);
  expect(s.worlds.damage('human',5,0,{ownerId:'bot',ownerName:'Bot'})?.dead).toBe(false);
  s.callback(1/30);expect(s.worlds.damage('human',1,1/30,{ownerId:'bot',ownerName:'Bot'})?.dead).toBe(true);
  expect(s.worlds.worlds.has('human')).toBe(false);expect(s.events.filter(event=>event.kind==='dead')).toHaveLength(1);
  expect(s.worlds.damage('human',1,2/30)).toBeNull();
 });
 it('own RPG eye proximity terminates only that private instance while received baddies retain names',()=>{
  const s=setup('woodlands'),record=s.launch('rpg'),a=s.a.projectiles.get(record.id)!;
  a.state.position={x:s.a.body.position.x,y:s.a.body.position.y+1.2,z:s.a.body.position.z};a.state.velocity={x:0,y:0,z:0};
  s.callback(1/30);expect(s.a.blasts.has(record.id)).toBe(true);expect(s.b.projectiles.has(record.id)).toBe(true);
  expect(s.b.actorNames.get('human')?.name).toBe('Launcher');
  s.a.name='Changed';s.callback(2/30);expect(s.b.actorNames.get('human')?.name).toBe('Launcher');
 });
 it('binds moved human arena state while bot and replay templates reset to original imports',()=>{
  const r=runtime('barrack'),barrels=new OriginalBarrelWorld(r),initial={...barrels.bodies[0].position};barrels.bodies[0].position.x+=20;
  const tracks=JSON.parse(readFileSync('public/assets/original-scenes/barrack/doors.json','utf8')) as OriginalDoorTracks;
  const doors=createOriginalDoorWorld(r.data,r.scale,tracks),name=doors.getStates()[0].name;doors.open(name,5);
  const worlds=new OriginalSoloObserverWorlds(r,{templateBarrels:barrels,templateDoors:doors});
  const human=worlds.register({id:'a',name:'A',eye:{x:100,y:100,z:100},barrels,doors});
  const bot=worlds.register({id:'b',name:'B',eye:{x:200,y:100,z:100}});
  expect(human.barrels.bodies[0].position.x).toBe(initial.x+20);expect(bot.barrels.bodies[0].position).toEqual(initial);
  expect(human.doors!.getStates()[0].openedAt).toBe(5);expect(bot.doors!.getStates()[0].openedAt).toBeNull();
  bot.barrels.bodies[0].position.x+=100;bot.doors!.open(name,6);worlds.dispose(bot.id);
  const replay=worlds.register({id:'b',name:'B',eye:{x:200,y:100,z:100}},7);
  expect(replay.barrels.bodies[0].position).toEqual(initial);expect(replay.doors!.getStates()[0].openedAt).toBeNull();
 });
 it('door delivery is private, name eligible, failure aware and monotonic per facade',()=>{
  const r=runtime('barrack'),tracks=JSON.parse(readFileSync('public/assets/original-scenes/barrack/doors.json','utf8')) as OriginalDoorTracks;
  const doors=createOriginalDoorWorld(r.data,r.scale,tracks),events:OriginalSoloEvent[]=[],worlds=new OriginalSoloObserverWorlds(r,{templateDoors:doors,deliverDoor:recipient=>recipient.id!=='failed',onEvent:event=>events.push(event)});
  const eye=sourcePointToWorld(tracks.doors[0].baseMatrix.slice(12,15),r.scale),name=tracks.doors[0].name;
  const owner=worlds.register({id:'a',name:'A',eye}),b=worlds.register({id:'b',name:'B',eye:{x:1000,y:1000,z:1000}}),denied=worlds.register({id:'same',name:'a',eye:{x:2000,y:1000,z:1000}}),failed=worlds.register({id:'failed',name:'Failure',eye:{x:3000,y:1000,z:1000}});
  owner.doors!.update(5);b.doors!.update(10);
  worlds.physics(1/30,{skipIds:new Set(worlds.worlds.keys())});
  expect(owner.doors!.getStates().find(state=>state.name===name)?.openedAt).toBe(5);
  expect(b.doors!.getStates().find(state=>state.name===name)?.openedAt).toBe(10);
  expect(denied.doors!.getStates().find(state=>state.name===name)?.openedAt).toBeNull();
  expect(failed.doors!.getStates().find(state=>state.name===name)?.openedAt).toBeNull();
  expect(events.filter(event=>event.kind==='door'&&event.name===name).map(event=>event.recipientId)).toEqual(['a','b']);
  for(const world of worlds.worlds.values())worlds.goody(world.id);worlds.completeGoody(1/30);worlds.actors(1/30);
 });
 it('private frozen barrel rays preserve their shot-time checkpoint after later mutation',()=>{
  const r=runtime('barrack'),worlds=new OriginalSoloObserverWorlds(r),a=worlds.register({id:'a',name:'A',eye:{x:1000,y:1000,z:1000}}),b=worlds.register({id:'b',name:'B',eye:{x:2000,y:1000,z:1000}});
  const barrel=a.barrels.snapshots()[0];a.barrels.applySnapshots([{...barrel,position:{x:100,y:100,z:100}}]);b.barrels.applySnapshots([]);
  const origin={x:98,y:100.65,z:100},direction={x:1,y:0,z:0},frozen=worlds.freezeRay(a.id),hit=frozen(origin,direction,4);
  expect(hit?.id).toBe(barrel.id);expect(worlds.freezeRay(b.id)(origin,direction,4)).toBeNull();
  a.barrels.applySnapshots([]);expect(frozen(origin,direction,4)).toEqual(hit);expect(worlds.freezeRay(a.id)(origin,direction,4)).toBeNull();
 });
 it('owner constructor is committed before reentrant remote delivery even when owner registered later',()=>{
  let ownerBorn=false;
  const worlds=new OriginalSoloObserverWorlds(runtime('woodlands'),{deliverLaunch:()=>{ownerBorn=worlds.worlds.get('owner')!.projectiles.size===1;return true;}});
  worlds.register({id:'first',name:'First',eye:{x:1000,y:1000,z:1000}});worlds.register({id:'owner',name:'Owner',eye:{x:2000,y:1000,z:1000}});
  expect(worlds.launch({ownerId:'owner',weapon:'launcher',eye:{x:100,y:100,z:100},direction:{x:0,y:1,z:0}},0).ok).toBe(true);expect(ownerBorn).toBe(true);
 });
 it('rejects duplicate and missing goody phases without double health flick',()=>{
  const s=setup('woodlands');s.worlds.physics(1/30);s.worlds.goody('human');const flick=s.a.health.flick;
  expect(()=>s.worlds.goody('human')).toThrow('Duplicate');expect(s.a.health.flick).toBe(flick);
  expect(()=>s.worlds.completeGoody(1/30)).toThrow('Missing');s.worlds.goody('bot');s.worlds.goody('duplicate');s.worlds.completeGoody(1/30);s.worlds.actors(1/30);
 });
 it('reports positive source rays once through private scalar consumption and firing pose',()=>{
  const s=setup('woodlands');s.a.weapon='rifle';
  const stationary=(time:number)=>{s.worlds.physics(time,{skipIds:new Set(s.worlds.worlds.keys())});for(const world of s.worlds.worlds.values())s.worlds.goody(world.id);s.worlds.completeGoody(time);s.worlds.actors(time);};
  stationary(1/30);expect(s.b.mirror.freeze().find(pose=>pose.id==='human')!.motionTime).toBe(0);
  s.worlds.reportShots('human',1);stationary(2/30);
  const shots=s.events.filter(event=>event.kind==='shot');expect(shots).toHaveLength(1);expect(shots[0].recipientId).toBe('bot');expect(shots[0].time).toBe(2/30);
  const fired=s.b.mirror.freeze().find(pose=>pose.id==='human')!;expect(fired.motionTime).toBe(1000);
  stationary(3/30);expect(s.events.filter(event=>event.kind==='shot')).toHaveLength(1);
 });
 it('frozen soldier rays use the same asymmetric model yaw already stored in received mirror poses',()=>{
  const assets={geometry:JSON.parse(readFileSync('public/assets/original-soldier/geometry.json','utf8')),rigMotion:JSON.parse(readFileSync('public/assets/original-soldier/rig-motion.json','utf8'))} as OriginalSoldierCollisionAssets;
  const worlds=new OriginalSoloObserverWorlds(runtime('woodlands'),{soldierAssets:assets}),a=worlds.register({id:'a',name:'A',eye:{x:1000,y:1000,z:1000}}),b=worlds.register({id:'b',name:'B',eye:{x:100,y:100,z:100},yaw:.4});
  worlds.physics(1/30);worlds.goody(a.id);worlds.goody(b.id);worlds.completeGoody(1/30);worlds.actors(1/30);
  const pose=a.mirror.freeze().find(p=>p.id===b.id)!,right=new OriginalSoldierCollision(assets),wrong=new OriginalSoldierCollision(assets);
  try{
   const vertices=right.evaluatePose({...pose.position},pose.yaw,pose.motionTime).map(p=>({...p}));wrong.evaluatePose({...pose.position},pose.yaw-Math.PI,pose.motionTime);
   const origin={x:pose.position.x-3,y:pose.position.y+1,z:pose.position.z};let checked=false;
   for(const face of assets.geometry.meshes.find(mesh=>mesh.resource==='GI')!.faces){
    const points=face.map(index=>vertices[index]),point={x:(points[0].x+points[1].x+points[2].x)/3,y:(points[0].y+points[1].y+points[2].y)/3,z:(points[0].z+points[1].z+points[2].z)/3};
    const delta={x:point.x-origin.x,y:point.y-origin.y,z:point.z-origin.z},length=Math.hypot(delta.x,delta.y,delta.z),direction={x:delta.x/length,y:delta.y/length,z:delta.z/length};
    const expected=right.intersectRay(origin,direction,8),opposite=wrong.intersectRay(origin,direction,8);
    if(!expected||(opposite&&Math.abs(expected.distance-opposite.distance)<1e-4))continue;
    const actual=worlds.freezeRay(a.id)(origin,direction,8);expect(actual?.id).toBe('b');expect(actual!.distance).toBeCloseTo(expected.distance,9);checked=true;break;
   }
   expect(checked).toBe(true);
  }finally{right.dispose();wrong.dispose();}
 });

 it('frozen private door rays retain the closed shot-time geometry after only one facade opens',()=>{
  const r=runtime('barrack'),tracks=JSON.parse(readFileSync('public/assets/original-scenes/barrack/doors.json','utf8')) as OriginalDoorTracks;
  const doors=createOriginalDoorWorld(r.data,r.scale,tracks),worlds=new OriginalSoloObserverWorlds(r,{templateDoors:doors});
  const a=worlds.register({id:'a',name:'A',eye:{x:1000,y:1000,z:1000}}),b=worlds.register({id:'b',name:'B',eye:{x:2000,y:1000,z:1000}}),name=tracks.doors[0].name;
  a.barrels.applySnapshots([]);b.barrels.applySnapshots([]);
  const closed=worlds.freezeRay(a.id),other=worlds.freezeRay(b.id);
  const doorGeometry=createOriginalSceneGeometry(r.data,{scale:r.scale,includeModel:model=>model===name});
  a.doors!.open(name,0);a.doors!.update(2);const opened=worlds.freezeRay(a.id);
  let checked=false;
  for(let offset=0;offset<doorGeometry.triangleCount&&!checked;){
   const page=doorGeometry.fixedTrianglePage(offset);offset=page.nextOffset;
   for(const entry of page.triangles){
    const [x,y,z]=entry.triangle,ab={x:y.x-x.x,y:y.y-x.y,z:y.z-x.z},ac={x:z.x-x.x,y:z.y-x.y,z:z.z-x.z};
    const normal={x:ab.y*ac.z-ab.z*ac.y,y:ab.z*ac.x-ab.x*ac.z,z:ab.x*ac.y-ab.y*ac.x},length=Math.hypot(normal.x,normal.y,normal.z);if(length<1e-12)continue;
    const direction={x:-normal.x/length,y:-normal.y/length,z:-normal.z/length},center={x:(x.x+y.x+z.x)/3,y:(x.y+y.y+z.y)/3,z:(x.z+y.z+z.z)/3};
    const origin={x:center.x-direction.x*.01,y:center.y-direction.y*.01,z:center.z-direction.z*.01};
    const previous=closed(origin,direction,.02),next=opened(origin,direction,.02);
    if(previous?.id!==name||(next?.id===name&&Math.abs(next.distance-previous.distance)<1e-6))continue;
    expect(closed(origin,direction,.02)).toEqual(previous);expect(other(origin,direction,.02)).toEqual(previous);checked=true;break;
   }
  }
  expect(checked).toBe(true);expect(b.doors!.getStates().find(state=>state.name===name)?.openedAt).toBeNull();
 });

});
