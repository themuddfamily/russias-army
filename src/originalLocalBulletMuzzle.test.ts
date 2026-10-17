import * as THREE from 'three';
import {readFileSync} from 'node:fs';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {Game} from './game';
import {createOriginalWeapons,ORIGINAL_WEAPON_TEXTURES,type OriginalWeaponGeometryData} from './originalWeapons';
import {OriginalWeaponPresentation} from './originalWeaponPresentation';
import {WeaponState} from './weapons';
import {ORIGINAL_WEAPON_WAIT} from '../shared/originalWeaponCounter';

const geometry=JSON.parse(readFileSync(new URL('../public/assets/original-weapons/geometry.json',import.meta.url),'utf8')) as OriginalWeaponGeometryData;
type BulletWeapon='pistol'|'shotgun'|'rifle'|'sniper';
const families=[['pistol','mfpistol',1,1,'gunfire'],['shotgun','mfspas12',2,7,'spas12wav'],['rifle','mfak47',1,1,'gunfire'],['sniper','mfdragunov',1,3,'resniper']] as const;

// Real Game tryFire/hitscan, ammunition/counters, weapon presentation and
// imported muzzle meshes. Empty world/target queries and audio/UI are seams.
// No renderer, coordinator receiver, native raster or audible mixer is run.
function fixture(map:'barrack'|'woodlands',weapon:BulletWeapon){
 const collection=createOriginalWeapons({geometry,textures:new Map(ORIGINAL_WEAPON_TEXTURES.map(name=>[name,new THREE.Texture()]))});
 const camera=new THREE.PerspectiveCamera();camera.position.set(8,5,-3);camera.rotation.set(.1,.2,0,'YXZ');
 const view=new THREE.Scene();for(const model of collection.models.values())view.add(model);
 const model=collection.models.get(weapon)!;model.position.set(.3,-.2,-.6);
 const state=new WeaponState(map);state.select(weapon);state.ammo[weapon]=10;state.reserve[weapon]=30;
 const presentation=new OriginalWeaponPresentation(weapon),scene=new THREE.Scene();
 const game=Object.assign(Object.create(Game.prototype),{mapId:map,mode:'solo',archivalWinter:false,phase:'playing',playerAlive:true,
  elapsed:10,weaponState:state,originalWeapons:collection,originalWeaponPresentation:presentation,originalFlashes:[],
  scene,camera,enhancedRendering:true,pitch:.1,yaw:.2,recoil:0,shots:0,hits:0,enemies:[],arena:{},
  keys:new Set(),controlsPreset:'legacy',aiming:false,arrowMovement:false,chatOpen:false,
  raycaster:{set:vi.fn(),intersectObjects:vi.fn(()=>[]),far:0},raycastWorld:vi.fn(()=>null),spawnTracer:vi.fn(),
  muzzleLight:{intensity:0},worldMuzzleLight:{intensity:0},spawnMuzzleParticles:vi.fn(),spawnCasing:vi.fn(),
  audio:{play:vi.fn()},playOriginalCombatSound:vi.fn(),updateHud:vi.fn(),setMessage:vi.fn()}) as any;
 const ready=()=>state.applyOriginalCounter({waitgun:map==='woodlands'?0:ORIGINAL_WEAPON_WAIT[weapon],poldwaitgun:0,ready:true},game.elapsed);
 ready();
 const shotWorld=()=>{model.updateWorldMatrix(true,false);camera.updateWorldMatrix(true,false);return new THREE.Matrix4().multiplyMatrices(camera.matrixWorld,model.matrixWorld);};
 return {game,state,collection,presentation,model,ready,shotWorld,dispose(){game.clearOriginalMuzzleFlashes();collection.dispose();}};
}
function sameMatrix(actual:THREE.Matrix4,expected:THREE.Matrix4){for(let i=0;i<16;i++)expect(actual.elements[i]).toBeCloseTo(expected.elements[i],11);}
afterEach(()=>vi.restoreAllMocks());

describe('actual local source trigger owns one muzzle lease per bullet',()=>{
 for(const map of ['barrack','woodlands'] as const){
  for(const [weapon,resource,count,pitchDegrees,sound] of families)it(`${map} ${weapon}: ${count} independent muzzle models with one trigger debit/sound/recoil`,()=>{
   const f=fixture(map,weapon);try{
    vi.spyOn(Math,'random').mockReturnValue(.99);
    const fire=vi.spyOn(f.presentation,'fire'),expected=f.shotWorld(),reserve=f.state.reserve[weapon];
    const order:string[]=[],damage=vi.fn(()=>{order.push('damage');return 'hurt';});
    const mutateFollowingBirth=()=>{f.game.camera.position.set(30,-4,18);f.model.position.set(6,7,8);};
    const spawn=f.game.spawnOriginalMuzzleFlash.bind(f.game);
    vi.spyOn(f.game,'spawnOriginalMuzzleFlash').mockImplementation((...args:unknown[])=>{order.push('flash');return spawn(...args);});
    f.game.playOriginalCombatSound.mockImplementation((name:string)=>{if(name==='hurt')order.push('hurt');});
    f.game.originalCombatEffectPresentation={
     spawnMiss:vi.fn(()=>{order.push('miss');mutateFollowingBirth();}),
     spawnBlood:vi.fn(()=>{order.push('blood');mutateFollowingBirth();}),
    };
    if(weapon==='shotgun'){
     const source=f.collection.resources.get('spas12')!;
     const target=new THREE.Mesh(source.geometry,source.material);const enemy={alive:true,damage,group:new THREE.Group(),hitMeshes:[target]};target.userData.enemy=enemy;
     f.game.enemies=[enemy];f.game.showHitmarker=vi.fn();
     f.game.raycaster.intersectObjects.mockImplementation(()=>{mutateFollowingBirth();return [{distance:10,point:new THREE.Vector3(8,5,-13),object:target}];});
    }else if(weapon==='pistol'||weapon==='sniper'){
     f.game.raycastWorld.mockImplementation(()=>{mutateFollowingBirth();return {distance:20,normal:{x:0,y:1,z:0}};});
    }else{
     f.game.raycastWorld.mockImplementation(()=>{mutateFollowingBirth();return null;});
    }
    f.game.tryFire();
    expect(f.game.originalFlashes).toHaveLength(count);
    const meshes=f.game.originalFlashes.map((entry:{mesh:THREE.Mesh})=>entry.mesh) as THREE.Mesh[];
    expect(new Set(meshes).size).toBe(count);
    expect(f.collection.muzzleModels.stats()).toEqual({allocated:count,active:count,pooled:0});
    for(const mesh of meshes){
     expect(mesh.geometry).toBe(f.collection.resources.get(resource)!.geometry);
     expect(mesh.material).toBe(f.collection.resources.get(resource)!.material);
     expect(f.collection.hasFlashLease(mesh)).toBe(true);expect(mesh.parent).toBe(f.game.scene);
     sameMatrix(mesh.matrix,expected);
    }
    expect(f.state.ammo[weapon]).toBe(9);expect(f.state.reserve[weapon]).toBe(reserve);expect(f.game.shots).toBe(1);
    expect(fire).toHaveBeenCalledOnce();
    expect(f.game.playOriginalCombatSound.mock.calls.filter((call:unknown[])=>call[0]===sound)).toEqual([[sound,undefined,6]]);
    expect(order).toEqual(weapon==='shotgun'?['damage','hurt','blood','flash','hurt','blood','flash']:
     weapon==='rifle'?['flash']:['miss','flash']);
    if(weapon==='shotgun')expect(damage).toHaveBeenCalledExactlyOnceWith(36,10);
    expect(f.game.raycaster.set).toHaveBeenCalledOnce();expect(f.game.raycaster.intersectObjects).toHaveBeenCalledOnce();
    expect(f.game.pitch).toBeCloseTo(.1+pitchDegrees*Math.PI/180,12);expect(f.game.yaw).toBeCloseTo(.2+.5*Math.PI/180,12);
    // Birth freezes the pre-recoil gun WORLD, independent of subsequent camera
    // movement, weapon placement changes and selection of another gun.
    f.game.camera.position.set(-20,40,60);f.game.camera.rotation.set(-.8,1.1,.2);f.model.position.set(3,4,5);f.state.select('rpg');
    for(const mesh of meshes)sameMatrix(mesh.matrix,expected);
    f.game.advanceOriginalMuzzleFlashes();expect(f.game.originalFlashes).toHaveLength(count);
    for(const mesh of meshes){expect(mesh.parent).toBe(f.game.scene);sameMatrix(mesh.matrix,expected);}
    f.game.advanceOriginalMuzzleFlashes();expect(f.game.originalFlashes).toEqual([]);
    for(const mesh of meshes){expect(mesh.parent).toBeNull();expect(f.collection.hasFlashLease(mesh)).toBe(false);}
    expect(f.collection.muzzleModels.stats()).toEqual({allocated:count,active:0,pooled:count});
   }finally{f.dispose();}
  });
  it(`${map}: retires both shotgun bullets in birth order and reuses the exact FIFO pair`,()=>{
   const f=fixture(map,'shotgun');try{
    vi.spyOn(Math,'random').mockReturnValue(.5);f.game.tryFire();
    const first=f.game.originalFlashes.map((entry:{mesh:THREE.Mesh})=>entry.mesh);
    const names=first.map((mesh:THREE.Mesh)=>mesh.name),ids=first.map((mesh:THREE.Mesh)=>mesh.uuid);
    expect(first).toHaveLength(2);f.game.advanceOriginalMuzzleFlashes();f.game.advanceOriginalMuzzleFlashes();
    f.game.elapsed++;f.model.position.set(.7,-.3,-.9);f.ready();const expected=f.shotWorld();f.game.tryFire();
    const second=f.game.originalFlashes.map((entry:{mesh:THREE.Mesh})=>entry.mesh);
    expect(second).toEqual(first);expect(second.map((mesh:THREE.Mesh)=>mesh.uuid)).toEqual(ids);
    expect(second.map((mesh:THREE.Mesh)=>mesh.name)).toEqual(names);
    for(const mesh of second)sameMatrix(mesh.matrix,expected);
    expect(f.collection.muzzleModels.stats()).toEqual({allocated:2,active:2,pooled:0});
    expect(f.state.ammo.shotgun).toBe(8);expect(f.game.shots).toBe(2);expect(f.game.playOriginalCombatSound).toHaveBeenCalledTimes(2);
   }finally{f.dispose();}
  });
  it(`${map}: a counter-blocked shotgun trigger creates no model or presentation side effects`,()=>{
   const f=fixture(map,'shotgun');try{
    const fire=vi.spyOn(f.presentation,'fire');f.state.applyOriginalCounter({waitgun:30,poldwaitgun:30,ready:false},f.game.elapsed);
    f.game.tryFire();expect(f.game.originalFlashes).toEqual([]);expect(f.collection.muzzleModels.stats().allocated).toBe(0);
    expect(f.state.ammo.shotgun).toBe(10);expect(f.game.shots).toBe(0);expect(fire).not.toHaveBeenCalled();
    expect(f.game.playOriginalCombatSound).not.toHaveBeenCalled();expect(f.game.raycaster.set).not.toHaveBeenCalled();
    expect(f.game.pitch).toBe(.1);expect(f.game.yaw).toBe(.2);
   }finally{f.dispose();}
  });
  it(`${map}: an unowned target emits miss then muzzle per bullet on the normal hit path`,()=>{
   const f=fixture(map,'shotgun');try{
    const target=f.collection.resources.get('spas12')!,order:string[]=[];
    // Explicit receiver bookkeeping seam: every model hit is a source shot,
    // even when this nearest target has no registered baddy ownership.
    Object.assign(f.game,{isSourceSolo:()=>true,soloRayTargets:()=>({meshes:[target],corpseMeshes:new Set()}),soloWorlds:{worlds:new Map(),reportShots:vi.fn()}});
    f.game.raycaster.intersectObjects.mockReturnValue([{distance:10,point:new THREE.Vector3(8,5,-13),object:target}]);
    f.game.originalCombatEffectPresentation={spawnBlood:vi.fn(),spawnMiss:vi.fn(()=>order.push('miss'))};
    const spawn=f.game.spawnOriginalMuzzleFlash.bind(f.game);
    vi.spyOn(f.game,'spawnOriginalMuzzleFlash').mockImplementation((...args:unknown[])=>{order.push('flash');return spawn(...args);});
    f.game.tryFire();
    expect(order).toEqual(['miss','flash','miss','flash']);expect(f.game.originalFlashes).toHaveLength(2);
    expect(f.collection.muzzleModels.stats()).toEqual({allocated:2,active:2,pooled:0});
    expect(f.state.ammo.shotgun).toBe(9);expect(f.game.shots).toBe(1);
    expect(f.game.playOriginalCombatSound.mock.calls.map((call:unknown[])=>call[0])).toEqual(['spas12wav']);
    expect(f.game.originalCombatEffectPresentation.spawnBlood).not.toHaveBeenCalled();expect(f.game.spawnTracer).toHaveBeenCalledOnce();
    expect(f.game.soloWorlds.reportShots).toHaveBeenCalledExactlyOnceWith('player',2);
   }finally{f.dispose();}
  });
  it(`${map}: online corpse hits emit miss then muzzle per bullet with one network shot and no damage report`,()=>{
   const f=fixture(map,'shotgun');try{
    const target=f.collection.resources.get('spas12')!,order:string[]=[];
    Object.assign(f.game,{mode:'online',needsAuthoritativeSpawn:false,onlineWeaponReadyAt:0,
     network:{connected:true,shoot:vi.fn(()=> 'corpse-shot'),hit:vi.fn()},
     sourceRemoteRayTargets:vi.fn(()=>({meshes:[target],corpseMeshes:new Set([target])}))});
    f.game.raycaster.intersectObjects.mockReturnValue([{distance:10,point:new THREE.Vector3(8,5,-13),object:target,face:{normal:new THREE.Vector3(0,0,1)}}]);
    f.game.originalCombatEffectPresentation={spawnMiss:vi.fn(()=>order.push('miss')),spawnBlood:vi.fn()};
    const spawn=f.game.spawnOriginalMuzzleFlash.bind(f.game);
    vi.spyOn(f.game,'spawnOriginalMuzzleFlash').mockImplementation((...args:unknown[])=>{order.push('flash');return spawn(...args);});
    f.game.tryFire();
    expect(order).toEqual(['miss','flash','miss','flash']);expect(f.game.originalFlashes).toHaveLength(2);
    expect(f.game.network.shoot).toHaveBeenCalledOnce();expect(f.game.network.hit).not.toHaveBeenCalled();
    expect(f.game.pendingSourceShot).toBe('corpse-shot');expect(f.game.originalCombatEffectPresentation.spawnBlood).not.toHaveBeenCalled();
    expect(f.game.playOriginalCombatSound.mock.calls.map((call:unknown[])=>call[0])).toEqual(['spas12wav']);
    expect(f.state.ammo.shotgun).toBe(9);expect(f.game.shots).toBe(1);expect(f.game.spawnTracer).toHaveBeenCalledOnce();
   }finally{f.dispose();}
  });
  for(const invalid of ['stale-owner','wrong-mesh'] as const)it(`${map}: local ${invalid} metadata does not classify a model as a baddy`,()=>{
   const f=fixture(map,'shotgun');try{
    const target=f.collection.resources.get('spas12')!,damage=vi.fn(),order:string[]=[];
    const enemy={alive:true,damage,hitMeshes:invalid==='wrong-mesh'?[]:[target],group:new THREE.Group()};
    target.userData.enemy=enemy;f.game.enemies=invalid==='stale-owner'?[]:[enemy];
    f.game.raycaster.intersectObjects.mockReturnValue([{distance:10,point:new THREE.Vector3(8,5,-13),object:target,face:{normal:new THREE.Vector3(0,0,1)}}]);
    f.game.originalCombatEffectPresentation={spawnMiss:vi.fn(()=>order.push('miss')),spawnBlood:vi.fn()};
    const spawn=f.game.spawnOriginalMuzzleFlash.bind(f.game);
    vi.spyOn(f.game,'spawnOriginalMuzzleFlash').mockImplementation((...args:unknown[])=>{order.push('flash');return spawn(...args);});
    f.game.tryFire();
    expect(order).toEqual(['miss','flash','miss','flash']);expect(f.game.originalFlashes).toHaveLength(2);expect(damage).not.toHaveBeenCalled();
    expect(f.game.originalCombatEffectPresentation.spawnBlood).not.toHaveBeenCalled();
    expect(f.game.playOriginalCombatSound.mock.calls.map((call:unknown[])=>call[0])).toEqual(['spas12wav']);
    expect(f.state.ammo.shotgun).toBe(9);expect(f.game.shots).toBe(1);expect(f.game.spawnTracer).toHaveBeenCalledOnce();
   }finally{f.dispose();}
  });
  it(`${map}: online missing/stale IDs and wrong model identity all produce miss without a hit report`,()=>{
   const f=fixture(map,'shotgun');try{
    const target=f.collection.resources.get('spas12')!,order:string[]=[];
    Object.assign(f.game,{mode:'online',needsAuthoritativeSpawn:false,onlineWeaponReadyAt:0,
     network:{connected:true,shoot:vi.fn(()=> 'invalid-owner-shot'),hit:vi.fn()},remotePlayers:new Map(),
     sourceRemoteRayTargets:vi.fn(()=>({meshes:[target],corpseMeshes:new Set()}))});
    f.game.raycaster.intersectObjects.mockReturnValue([{distance:10,point:new THREE.Vector3(8,5,-13),object:target,face:{normal:new THREE.Vector3(0,0,1)}}]);
    f.game.originalCombatEffectPresentation={spawnMiss:vi.fn(()=>order.push('miss')),spawnBlood:vi.fn()};
    const spawn=f.game.spawnOriginalMuzzleFlash.bind(f.game);
    vi.spyOn(f.game,'spawnOriginalMuzzleFlash').mockImplementation((...args:unknown[])=>{order.push('flash');return spawn(...args);});
    for(const invalid of ['missing-id','stale-id','wrong-mesh']){
     order.length=0;f.game.pendingSourceShot=undefined;f.game.elapsed++;f.ready();
     target.userData.remoteId=invalid==='missing-id'?undefined:'remote';
     f.game.remotePlayers.clear();if(invalid==='wrong-mesh')f.game.remotePlayers.set('remote',{sourceActorActive:true,hitMeshes:[]});
     f.game.tryFire();expect(order).toEqual(['miss','flash','miss','flash']);expect(f.game.originalFlashes).toHaveLength(2);
     expect(f.game.network.hit).not.toHaveBeenCalled();expect(f.game.originalCombatEffectPresentation.spawnBlood).not.toHaveBeenCalled();
     f.game.clearOriginalMuzzleFlashes();
    }
    expect(f.game.network.shoot).toHaveBeenCalledTimes(3);expect(f.game.spawnTracer).toHaveBeenCalledTimes(3);
    expect(f.state.ammo.shotgun).toBe(7);expect(f.game.shots).toBe(3);
    expect(f.game.playOriginalCombatSound.mock.calls.map((call:unknown[])=>call[0])).toEqual(['spas12wav','spas12wav','spas12wav']);
   }finally{f.dispose();}
  });
  it(`${map}: a registered pending-death remote retains blood classification until actor detach`,()=>{
   const f=fixture(map,'shotgun');try{
    const target=f.collection.resources.get('spas12')!,order:string[]=[],expected=f.shotWorld();target.userData.remoteId='remote';
    const remote={alive:false,sourceActorActive:true,hitMeshes:[target],group:new THREE.Group()};
    Object.assign(f.game,{mode:'online',needsAuthoritativeSpawn:false,onlineWeaponReadyAt:0,
     network:{connected:true,shoot:vi.fn(()=> 'pending-death-shot'),hit:vi.fn()},remotePlayers:new Map([['remote',remote]]),
     sourceRemoteRayTargets:vi.fn(()=>({meshes:[target],corpseMeshes:new Set()}))});
    f.game.raycaster.intersectObjects.mockReturnValue([{distance:10,point:new THREE.Vector3(8,5,-13),object:target}]);
    f.game.originalCombatEffectPresentation={spawnBlood:vi.fn(()=>order.push('blood')),spawnMiss:vi.fn()};
    const spawn=f.game.spawnOriginalMuzzleFlash.bind(f.game);
    vi.spyOn(f.game,'spawnOriginalMuzzleFlash').mockImplementation((...args:unknown[])=>{order.push('flash');return spawn(...args);});
    f.game.playOriginalCombatSound.mockImplementation((name:string)=>{if(name==='hurt')order.push('hurt');});
    f.game.tryFire();expect(order).toEqual(['hurt','blood','flash','hurt','blood','flash']);expect(f.game.originalFlashes).toHaveLength(2);
    for(const entry of f.game.originalFlashes)sameMatrix(entry.mesh.matrix,expected);
    expect(f.game.network.shoot).toHaveBeenCalledOnce();expect(f.game.network.hit).toHaveBeenCalledExactlyOnceWith({shotId:'pending-death-shot',targetId:'remote'});
    expect(f.game.originalCombatEffectPresentation.spawnMiss).not.toHaveBeenCalled();expect(f.state.ammo.shotgun).toBe(9);expect(f.game.spawnTracer).toHaveBeenCalledOnce();
   }finally{f.dispose();}
  });
 }
});
