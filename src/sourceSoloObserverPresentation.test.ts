import * as THREE from 'three';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {Game} from './game';
import {installOriginalSoloLegacyFixture} from './originalSoloLegacy.fixture';
import {SoldierMaterialLibrary} from './soldierMaterials';
import {createOriginalSoldierResources,type OriginalSoldierAssets} from './originalSoldier';
import {createOriginalWeapons,ORIGINAL_WEAPON_TEXTURES,type OriginalWeaponGeometryData} from './originalWeapons';
import {registerOriginalMapRuntime,type OriginalMapRuntime} from '../shared/originalMapRuntime';
import {OriginalBarrelWorld} from '../shared/originalBarrelWorld';
import {OriginalDoorWorld,type OriginalDoorTracks} from '../shared/originalDoorWorld';
import {originalPlayerEye} from '../shared/originalPlayerPhysics';
import {ORIGINAL_MAP_SCALE} from '../shared/originalMapProfile';
import type {OriginalSoloObserverWorlds} from '../shared/originalSoloObserverWorld';

const read=(path:string)=>JSON.parse(readFileSync(`public/assets/${path}`,'utf8'));
const runtimes=new Map<'barrack'|'woodlands',OriginalMapRuntime>();
function mapRuntime(map:'barrack'|'woodlands'){
 let runtime=runtimes.get(map);if(!runtime){runtime=registerOriginalMapRuntime(map,read(`original-scenes/${map==='woodlands'?'woodland':map}/scene.json`));runtimes.set(map,runtime);}return runtime;
}
function fixture(map:'barrack'|'woodlands'){
 const library=new SoldierMaterialLibrary({presentation:'legacy',tier:'low'}),gi=new THREE.Texture();
 const textures=new Map(ORIGINAL_WEAPON_TEXTURES.map(name=>[name,new THREE.Texture()]));
 const weaponAssets={geometry:read('original-weapons/geometry.json') as OriginalWeaponGeometryData,textures};
 const resources=createOriginalSoldierResources({geometry:read('original-soldier/geometry.json') as OriginalSoldierAssets['geometry'],rigMotion:read('original-soldier/rig-motion.json') as OriginalSoldierAssets['rigMotion'],texture:gi},weaponAssets);
 const weapons=createOriginalWeapons(weaponAssets),runtime=mapRuntime(map),barrels=new OriginalBarrelWorld(runtime),doors=new OriginalDoorWorld(runtime.data,runtime.scale,map==='barrack'?read('original-scenes/barrack/doors.json') as OriginalDoorTracks:{version:1,doors:[]});
 const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera();camera.position.set(1000,1000,1000);
 // Real Enemy construction, Game control/health/scoring/projectile handlers and
 // coordinator run. DOM/audio and dropped-item presentation sinks (including the admitted human detach sink) are inert.
 // Elevated spawns isolate contacts from the map; this is not a map traversal
 // or WebGL acceptance test.
 const game=Object.assign(Object.create(Game.prototype),{
  mapId:map,mode:'solo',phase:'playing',archivalWinter:false,playerAlive:true,health:100,hits:0,kills:0,score:0,deaths:0,
  elapsed:1,yaw:0,pitch:0,recoil:0,weaponSwayX:0,weaponSwayY:0,keys:new Set(),controlsPreset:'legacy',chatOpen:false,arrowMovement:false,
  originalActorDispatchGeneration:0,originalProjectileContactCount:0,combatEffectsFrozen:false,originalPlayerContacts:[],originalBlasts:[],projectiles:[],enemies:[],soloBotShots:[],weaponDrops:[],
  camera,velocity:new THREE.Vector3(),scene,remotePlayers:new Map(),localCallsign:'Local goody',soldierMaterialLibrary:library,originalSoldierResources:resources,originalWeapons:weapons,
  weaponState:{current:'rifle'},arena:{runtime,barrelWorld:barrels,doorWorld:doors,spawnPoints:Array.from({length:8},(_,i)=>new THREE.Vector3(1000+i*20,1000-1.72,1000)),syncBarrels:vi.fn()},
  playOriginalCombatSound:vi.fn(),playPlayerHurtSound:vi.fn(),showOriginalHurt:vi.fn(),spawnImpact:vi.fn(),surfaceNormalAt:()=>new THREE.Vector3(0,1,0),showHitmarker:vi.fn(),updateHud:vi.fn(),setMessage:vi.fn(),addKillFeed:vi.fn(),dropWeapon:vi.fn(),dropSourceSoloWeapon:vi.fn(),spawnExplosion:vi.fn(),
 }) as any;
 installOriginalSoloLegacyFixture(game);
 game.spawnEnemies();const worlds=game.ensureSoloWorlds() as OriginalSoloObserverWorlds;
 return {game,worlds,dispose(){game.clearEnemies();weapons.dispose();resources.dispose();library.dispose();gi.dispose();for(const texture of textures.values())texture.dispose();}};
}
// Run the actual callback chain. Tests concerned with damage lifetime remove
// unrelated distant barrels explicitly; private contact coverage is separate.
function actorCallback(s:ReturnType<typeof fixture>){
 s.game.elapsed+=1/30;
 const human=s.worlds.worlds.get('player')!;
 s.game.updateOriginalPlayerCallback(true);s.game.completeSoloGoody();s.game.updateOriginalExplosives(true);
 expect(s.game.health).toBe(human.health.canonical);
}

// These CPU fixtures exercise observer presentation and frozen query ownership.
// They do not establish native Havok, Director audio or rendered map acceptance.
afterEach(()=>vi.restoreAllMocks());
function noBarrels(s:ReturnType<typeof fixture>){for(const world of s.worlds.worlds.values())world.barrels.applySnapshots([]);}
function triangleRay(mesh:THREE.Mesh){
 mesh.updateWorldMatrix(true,false);const positions=mesh.geometry.getAttribute('position'),index=mesh.geometry.index!;
 const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3();
 for(let face=0;face<index.count;face+=3){
  a.fromBufferAttribute(positions,index.getX(face));b.fromBufferAttribute(positions,index.getX(face+1));c.fromBufferAttribute(positions,index.getX(face+2));
  if(mesh instanceof THREE.SkinnedMesh){mesh.applyBoneTransform(index.getX(face),a);mesh.applyBoneTransform(index.getX(face+1),b);mesh.applyBoneTransform(index.getX(face+2),c);}
  a.applyMatrix4(mesh.matrixWorld);b.applyMatrix4(mesh.matrixWorld);c.applyMatrix4(mesh.matrixWorld);
  const normal=b.clone().sub(a).cross(c.clone().sub(a)).normalize();if(normal.lengthSq()===0)continue;
  const center=a.clone().add(b).add(c).multiplyScalar(1/3),origin=center.clone().addScaledVector(normal,2),direction=normal.negate();
  const hit=new THREE.Raycaster(origin,direction,0,4).intersectObject(mesh,false)[0];if(hit)return {origin,direction,distance:hit.distance};
 }
 throw Error('Imported GI has no intersectable triangle');
}

describe('actual solo Game observer presentation and blocker integration',()=>{
 for(const map of ['barrack','woodlands'] as const){
  it(`${map}: private ${map==='barrack'?'barrel':'projectile'} obstruction snapshots survive later movement`,()=>{
   const s=fixture(map);try{
    const first=s.game.enemies[0],second=s.game.enemies[1],a=s.worlds.worlds.get(first.id)!,b=s.worlds.worlds.get(second.id)!;
    if(map==='woodlands'){
     // This recovered map has no barrels. Use real imported projectile triangles
     // and independently evolved recipient copies instead of adding map models.
     noBarrels(s);const admission=s.worlds.launch({ownerId:'player',weapon:'launcher',eye:s.game.camera.position,direction:{x:0,y:1,z:0}},s.game.elapsed);if(!admission.ok)throw Error('Expected launch');
     const local=a.projectiles.get(admission.launch.id)!.state,sibling=b.projectiles.get(admission.launch.id)!.state;
     local.position={x:1004,y:1000,z:1000};sibling.position={x:1050,y:1000,z:1000};
     const mesh=s.game.createProjectileMesh('launcher') as THREE.Mesh;try{
      mesh.position.copy(local.position);s.game.orientProjectileMesh(mesh,new THREE.Vector3().copy(local.direction),local.sourceRotation,local.angular);
      const ray=triangleRay(mesh),frozen=s.worlds.freezeRay(first.id),captured=frozen(ray.origin,ray.direction,4);
      expect(captured?.id).toBe(admission.launch.id);expect(captured!.distance).toBeCloseTo(ray.distance,8);expect(s.worlds.freezeRay(second.id)(ray.origin,ray.direction,4)).toBeNull();
      local.position={x:1100,y:1000,z:1000};expect(frozen(ray.origin,ray.direction,4)).toEqual(captured);expect(s.worlds.freezeRay(first.id)(ray.origin,ray.direction,4)).toBeNull();expect(sibling.position).toEqual({x:1050,y:1000,z:1000});
     }finally{mesh.removeFromParent();}
     return;
    }
    const barrel=a.barrels.snapshots()[0];expect(barrel).toBeDefined();
    for(const world of s.worlds.worlds.values())world.barrels.applySnapshots([]);
    a.barrels.applySnapshots([{...barrel,position:{x:1004,y:1000,z:1000}}]);
    const hull=a.barrels.bodies[0].convex!.vertices,center=hull.reduce((sum,v)=>({x:sum.x+v.x/hull.length,y:sum.y+v.y/hull.length,z:sum.z+v.z/hull.length}),{x:0,y:0,z:0});
    const origin={x:1000,y:1000+center.y,z:1000+center.z},direction={x:1,y:0,z:0},frozen=s.worlds.freezeRay(first.id),other=s.worlds.freezeRay(second.id);
    const captured=frozen(origin,direction,10);expect(captured?.id).toBe(barrel.id);expect(captured!.distance).toBeLessThan(10);
    expect(other(origin,direction,10)).toBeNull();expect(s.game.soloWorldDistance(first.id,origin,direction,10)).toBe(captured!.distance);expect(s.game.soloWorldDistance(second.id,origin,direction,10)).toBe(10);
    a.barrels.applySnapshots([{...barrel,position:{x:1050,y:1000,z:1000}}]);
    expect(frozen(origin,direction,10)).toEqual(captured);expect(s.worlds.freezeRay(first.id)(origin,direction,10)).toBeNull();expect(b.barrels.bodies).toHaveLength(0);
   }finally{s.dispose();}
  });
  it(`${map}: accepted scalar shots advance the actual received rig phase and preserve model yaw in GI query basis`,()=>{
   const s=fixture(map);try{
    noBarrels(s);const enemy=s.game.enemies[0],world=s.worlds.worlds.get(enemy.id)!;enemy.sourceYaw=.37;world.yaw=enemy.sourceYaw-Math.PI;
    actorCallback(s);const before=s.worlds.remotePoses('player').find(p=>p.id===enemy.id)!;s.worlds.reportShots(enemy.id,1);actorCallback(s);
    const pose=s.worlds.remotePoses('player').find(p=>p.id===enemy.id)!;
    const stride=Math.hypot(pose.position.x-before.position.x,pose.position.y-before.position.y,pose.position.z-before.position.z)/ORIGINAL_MAP_SCALE*10;
    // Shoot sets bon = 2000; the same callback advances by retained displacement
    // and subtracts 1000 once. The adapter admits where before this callback.
    expect(pose.motionTime).toBeCloseTo(1000+stride,8);expect(enemy.rig.debugState().timeMs).toBe(pose.motionTime);expect(enemy.group.rotation.y).toBe(pose.yaw);
    expect(pose.yaw).toBeCloseTo(enemy.sourceYaw,12);
    const ray=triangleRay(enemy.hitMeshes[0]),hit=s.worlds.freezeRay('player')(ray.origin,ray.direction,4);
    expect(hit?.id).toBe(enemy.id);expect(hit!.distance).toBeCloseTo(ray.distance,8);
   }finally{s.dispose();}
  });
 }

 it('actual Enemy decisions reject a private barrel probe without moving either observer body or received GI',()=>{
  const s=fixture('barrack'),random=vi.spyOn(Math,'random').mockReturnValue(.5);try{
   const blocked=s.game.enemies[0],clear=s.game.enemies[1],world=s.worlds.worlds.get(blocked.id)!;
   const barrel=world.barrels.snapshots()[0];expect(barrel).toBeDefined();noBarrels(s);
   world.barrels.applySnapshots([barrel]);const hull=world.barrels.bodies[0].convex!.vertices,center=hull.reduce((sum,v)=>({x:sum.x+v.x/hull.length,y:sum.y+v.y/hull.length,z:sum.z+v.z/hull.length}),{x:0,y:0,z:0});
   world.barrels.applySnapshots([{...barrel,position:{x:1000+.125-center.x,y:1001-center.y,z:1000-center.z}}]);
   const before=[blocked,clear].map(enemy=>({body:structuredClone(s.worlds.worlds.get(enemy.id)!.body),group:enemy.group.position.clone(),yaw:enemy.group.rotation.y}));
   for(const enemy of [blocked,clear]){enemy.sourcePosition.set(1000,1000,1000);enemy.target.set(1010,1000,1000);enemy.alert=0;enemy.strafe=1;enemy.nextDecision=99;
    enemy.update(.1,1,new THREE.Vector3(1100,1000,1000),s.game.arena,vi.fn(),s.game.camera.position,s.game.soloEnemyDecisionContext(enemy));}
   expect(blocked.sourceIntent.speed).toBe(0);expect(blocked.strafe).toBe(-1);expect(blocked.nextDecision).toBe(1);
   expect(clear.sourceIntent.speed).toBe(1.25);expect(clear.strafe).toBe(1);expect(clear.nextDecision).toBe(99);
   for(const [index,enemy] of [blocked,clear].entries()){expect(s.worlds.worlds.get(enemy.id)!.body).toEqual(before[index].body);expect(enemy.group.position).toEqual(before[index].group);expect(enemy.group.rotation.y).toBe(before[index].yaw);expect(enemy.sourcePosition).toEqual(new THREE.Vector3(1000,1000,1000));}
  }finally{random.mockRestore();s.dispose();}
 });
 it('pending death keeps the accepted GI phase and ray geometry until the next source callback detaches its corpse',()=>{
  const s=fixture('woodlands');try{
   noBarrels(s);const enemy=s.game.enemies[0];enemy.sourceYaw=.43;actorCallback(s);
   const prior=s.worlds.remotePoses('player').find(p=>p.id===enemy.id)!,mesh=enemy.hitMeshes[0] as THREE.SkinnedMesh,ray=triangleRay(mesh);
   const displayedBefore=new THREE.Raycaster(ray.origin,ray.direction,0,4).intersectObject(mesh,false)[0];expect(displayedBefore).toBeDefined();
   expect(s.game.damageSoloEnemy(enemy,110)).toBe('killed');const pending=s.worlds.remotePoses('player').find(p=>p.id===enemy.id)!;
   expect(pending).toMatchObject({alive:false,position:prior.position,yaw:prior.yaw,motionTime:prior.motionTime});expect(s.worlds.worlds.has(enemy.id)).toBe(false);
   s.game.syncSoloMirrors();
   expect(enemy.rig.debugState()).toMatchObject({alive:true,timeMs:prior.motionTime,deathBon:0});expect(enemy.group.visible).toBe(true);expect(mesh.userData.enemy).toBe(enemy);
   expect(s.game.soloRayTargets().meshes).toContain(mesh);expect(s.game.soloCorpses.size).toBe(0);
   const displayedPending=new THREE.Raycaster(ray.origin,ray.direction,0,4).intersectObject(mesh,false)[0],frozen=s.worlds.freezeRay('player')(ray.origin,ray.direction,4);
   expect(displayedPending).toBeDefined();expect(displayedPending.distance).toBeCloseTo(displayedBefore.distance,10);expect(frozen?.id).toBe(enemy.id);expect(frozen!.distance).toBeCloseTo(displayedPending.distance,8);
   const score=s.game.score,kills=s.game.kills,deaths=enemy.deaths;expect(s.game.damageSoloEnemy(enemy,5)).toBe('ignored');expect(s.game.score).toBe(score);expect(s.game.kills).toBe(kills);expect(enemy.deaths).toBe(deaths);
   actorCallback(s);expect(s.worlds.remotePoses('player').some(p=>p.id===enemy.id)).toBe(false);expect(enemy.group.visible).toBe(false);expect(s.game.soloRayTargets().meshes).toContain(mesh);expect(enemy.hitMeshes).not.toContain(mesh);expect(mesh.userData.enemy).toBeUndefined();
   const corpse=[...s.game.soloCorpses.values()][0] as any;expect(corpse).toBeDefined();expect(corpse.mesh).toBe(mesh);expect(s.game.soloRayTargets().corpseMeshes.has(corpse.mesh)).toBe(true);expect(corpse.debugState()).toMatchObject({alive:false,timeMs:3000,deathBon:0});
  }finally{s.dispose();}
 });
 it('death corpse and fresh same-ID GI coexist as actual Game blockers at their separate accepted poses',()=>{
  const s=fixture('woodlands');try{
   noBarrels(s);const enemy=s.game.enemies[0];enemy.sourceYaw=.29;actorCallback(s);
   const oldYaw=enemy.group.rotation.y;expect(s.game.damageSoloEnemy(enemy,110)).toBe('killed');actorCallback(s);
   const corpse=[...s.game.soloCorpses.values()][0] as any;expect(corpse).toBeDefined();expect(corpse.group.rotation.y).toBe(oldYaw);
   const birth=s.worlds.worlds.get('player')!.mirror.freezeCorpses()[0];expect(birth.deathBon).toBe(0);expect(birth.motionTime).toBe(3000);expect(corpse.debugState()).toMatchObject({deathBon:birth.deathBon,timeMs:birth.motionTime});
   const birthRay=triangleRay(corpse.mesh),birthHit=s.worlds.freezeRay('player')(birthRay.origin,birthRay.direction,4);expect(birthHit?.id).toMatch(new RegExp(`^corpse:${enemy.id}:`));expect(birthHit!.distance).toBeCloseTo(birthRay.distance,8);
   const oldPosition=corpse.group.position.clone();enemy.respawn(oldPosition.clone().add(new THREE.Vector3(0,0,40)),s.game.elapsed,true);s.game.registerSoloEnemy(enemy);actorCallback(s);
   const targets=s.game.soloRayTargets();expect(targets.meshes).toContain(corpse.mesh);expect(targets.corpseMeshes.has(corpse.mesh)).toBe(true);expect(targets.meshes).toContain(enemy.hitMeshes[0]);expect(targets.corpseMeshes.has(enemy.hitMeshes[0])).toBe(false);
   expect(corpse.group.parent).toBe(s.game.scene);expect(enemy.group.position.distanceTo(corpse.group.position)).toBeGreaterThan(30);
   const frozen=s.worlds.freezeRay('player'),oldRay=triangleRay(corpse.mesh),freshRay=triangleRay(enemy.hitMeshes[0]);
   const oldHit=frozen(oldRay.origin,oldRay.direction,4),freshHit=frozen(freshRay.origin,freshRay.direction,4);
   expect(oldHit?.id).toMatch(new RegExp(`^corpse:${enemy.id}:`));expect(oldHit!.distance).toBeCloseTo(oldRay.distance,8);expect(freshHit?.id).toBe(enemy.id);expect(freshHit!.distance).toBeCloseTo(freshRay.distance,8);
  }finally{s.dispose();}
 });
 it('each delivered constructor makes only one human sound and one human projectile visual',()=>{
  const s=fixture('woodlands');try{
   noBarrels(s);const enemy=s.game.enemies[3],owner=s.worlds.worlds.get(enemy.id)!;
   s.game.playOriginalCombatSound.mockClear();const admission=s.worlds.launch({ownerId:enemy.id,weapon:'launcher',eye:originalPlayerEye(owner.body),direction:{x:0,y:1,z:0}},s.game.elapsed);
   expect(admission.ok).toBe(true);if(!admission.ok)throw Error('Expected source launch');
   for(const world of s.worlds.worlds.values())expect(world.projectiles.has(admission.launch.id)).toBe(true);
   expect(s.game.projectiles).toHaveLength(1);expect(s.game.projectiles[0].soloId).toBe(admission.launch.id);expect(s.game.scene.children).toContain(s.game.projectiles[0].mesh);
   expect(s.game.playOriginalCombatSound).toHaveBeenCalledTimes(1);expect(s.game.playOriginalCombatSound.mock.calls[0][1]).toEqual(admission.launch.eye);expect(s.game.playOriginalCombatSound.mock.calls[0][2]).toBe(7);
  }finally{s.dispose();}
 });
 it('hurt source lookup uses source ASCII names and the human received pose, including self hurt',()=>{
  const s=fixture('woodlands');try{
   noBarrels(s);actorCallback(s);const human=s.worlds.worlds.get('player')!,enemy=s.game.enemies[0],pose=s.worlds.remotePoses('player').find(p=>p.id===enemy.id)!;
   // Rendering group movement cannot substitute for the retained received pose.
   enemy.group.position.set(-900,-900,-900);
   expect(s.game.soloHurtAttackerPosition(enemy.name.toLowerCase())).toEqual({...pose.position,y:pose.position.y+1.72});
   expect(s.game.soloHurtAttackerPosition(s.game.localCallsign.toUpperCase())).toEqual({x:s.game.camera.position.x,y:s.game.camera.position.y,z:s.game.camera.position.z});expect(s.game.soloHurtAttackerPosition('NO SUCH ACTOR')).toBeUndefined();
   s.worlds.damage('player',5,s.game.elapsed,{ownerId:enemy.id,ownerName:enemy.name.toLowerCase()});expect(s.game.showOriginalHurt).toHaveBeenLastCalledWith({...pose.position,y:pose.position.y+1.72});
   s.worlds.damage('player',5,s.game.elapsed,{ownerId:'player',ownerName:human.name.toUpperCase()});expect(s.game.showOriginalHurt).toHaveBeenLastCalledWith({x:s.game.camera.position.x,y:s.game.camera.position.y,z:s.game.camera.position.z});expect(s.game.health).toBe(90);
  }finally{s.dispose();}
 });
});
