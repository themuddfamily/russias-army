import * as THREE from 'three';
import {readFileSync} from 'node:fs';
import {describe,expect,it,vi} from 'vitest';
import {createOriginalSoloFreshBanks,type OriginalSoloFreshBanksOptions} from './originalSoloFreshBanks';
import {createOriginalWeapons,ORIGINAL_WEAPON_TEXTURES,type OriginalWeaponGeometryData} from './originalWeapons';
import {ORIGINAL_WEAPON_UNIT_SCALE} from './originalWeaponPresentation';
import {captureOriginalSoloProjectileResource,createOriginalSoloProjectileBirth,type OriginalSoloProjectilePose} from './originalSoloProjectileBinding';
import {OriginalReceiverModelWorld,type ReceiverModelBackend} from '../shared/originalReceiverModelWorld';
import {advanceOriginalReceiverGunCallback} from '../shared/originalReceiverGunCallback';
import {advanceOriginalWeaponMotion} from '../shared/originalWeaponMotion';
import type {ReceiverLocalWeaponHandle} from '../shared/originalReceiverLocalWeaponInventory';

// Actual decoded positions and CPU-only texture handles. These tests establish
// detached ownership and the explicit copy transform policy, not native pixels,
// browser memory usage, Havok actor ordering or a complete default scene.
const geometry=JSON.parse(readFileSync(new URL('../public/assets/original-weapons/geometry.json',import.meta.url),'utf8')) as OriginalWeaponGeometryData;
const unit=ORIGINAL_WEAPON_UNIT_SCALE;
const handles:ReceiverLocalWeaponHandle[]=['pistol','spas12','ak47','rg6','rpg','dragunov','rocket'];
const callback=(generation=31,n=1)=>({kind:'callback' as const,sceneGeneration:generation,callback:n});
const transform=(x:number)=>new THREE.Matrix4().compose(new THREE.Vector3(x,7,-4),new THREE.Quaternion().setFromEuler(new THREE.Euler(.23,-.31,.19)),new THREE.Vector3(1,1,1));
function fixture(map:'barrack'|'woodlands'='barrack'){
 const textures=new Map(ORIGINAL_WEAPON_TEXTURES.map(name=>[name,new THREE.Texture()])),collection=createOriginalWeapons({geometry,textures});
 const parent=new THREE.Group();parent.position.set(4,-3,8);parent.rotation.set(.3,-.2,.1);parent.scale.set(1.4,.8,1.2);
 for(const group of collection.models.values()){parent.add(group);group.position.set(-.2,.1,.3);}
 const grenade=collection.resources.get('rg6grenade')!;parent.add(grenade);grenade.position.set(2,3,-1);parent.updateMatrixWorld(true);
 const saved=[...collection.resources.values()].map(mesh=>({mesh,parent:mesh.parent,local:mesh.matrix.toArray(),world:mesh.matrixWorld.toArray(),visible:mesh.visible,position:mesh.position.toArray(),quaternion:mesh.quaternion.toArray(),scale:mesh.scale.toArray(),auto:mesh.matrixAutoUpdate}));
 const renderToWorld=transform(17),camera=renderToWorld.clone().multiply(parent.matrixWorld);
 const membership=Object.fromEntries(handles.map(h=>[h,h==='rg6'])) as Record<ReceiverLocalWeaponHandle,boolean>;
 const ancestry:Record<ReceiverLocalWeaponHandle,readonly string[]>={pistol:['private-camera'],spas12:['private-camera'],ak47:['private-camera'],rg6:['private-camera'],rpg:['private-camera'],dragunov:['private-camera'],rocket:['rpg','private-camera']};
 const options:OriginalSoloFreshBanksOptions={map,sceneGeneration:31,score:12,goldScore:4.5,sourceScale:unit,renderToWorld:renderToWorld.toArray(),cameraHandle:'private-camera',cameraWorldMatrix:camera.toArray(),initialGunPositionSource:{x:-7,y:-11,z:3},initialLoadedRocket:false,membership,ancestry,followOffworldParents:true,parentRestoresMembership:true,grenadeMaterialHandle:'borrowed-grenade-shader',grenadeAncestry:['source-parent'],rocketMaterialHandle:'canonical-rpg-shader',maxCommands:256,maxTextChars:65536,maxProjectileModels:32,maxProjectileActors:8,maxReportNames:32};
 const banks=createOriginalSoloFreshBanks(collection,options);
 const assertUnchanged=()=>{for(const s of saved){expect(s.mesh.parent).toBe(s.parent);expect(s.mesh.matrix.toArray()).toEqual(s.local);expect(s.mesh.matrixWorld.toArray()).toEqual(s.world);expect(s.mesh.visible).toBe(s.visible);expect(s.mesh.position.toArray()).toEqual(s.position);expect(s.mesh.quaternion.toArray()).toEqual(s.quaternion);expect(s.mesh.scale.toArray()).toEqual(s.scale);expect(s.mesh.matrixAutoUpdate).toBe(s.auto);}};
 const allocatorBackend:ReceiverModelBackend={cloneGI:()=>{throw Error('unused GI');},cloneGun:()=>{throw Error('unused gun');},sphere:()=>{throw Error('unused bounds');},heldGunPose:()=>{throw Error('unused bone');},dropYaw:()=>{throw Error('unused death');},reparentGunMembership:()=>false,nearestDetailedDownward:()=>{throw Error('unused query');}};
 const allocator=new OriginalReceiverModelWorld(allocatorBackend,{eyeHeight:1,sourceScale:unit,goodyBspWorld:0,sceneGeneration:31,maxModels:32,maxPickups:8});
 const birth=(launchId:string)=>{
  const pose:OriginalSoloProjectilePose={launchId,weapon:'launcher',position:{x:5,y:8,z:-3},direction:{x:0,y:0,z:-1},renderToWorld:options.renderToWorld,orientationPolicy:'copy-source-basis-unit-reset'};
  const freshModel=captureOriginalSoloProjectileResource(grenade,{handle:'grenade',resource:'rg6grenade',inWorld:false,materialHandle:options.grenadeMaterialHandle,groupAncestry:options.grenadeAncestry,renderToWorld:options.renderToWorld,maxTextChars:options.maxTextChars});
  return createOriginalSoloProjectileBirth({launchId,weapon:'launcher',freshModel,pose,rocketMaterialHandle:options.rocketMaterialHandle,maxTextChars:options.maxTextChars});
 };
 return {collection,textures,saved,options,banks,allocator,birth,assertUnchanged,dispose(){banks.release();allocator.reset();collection.dispose();}};
}

describe('fresh four-bank assembly from actual borrowed weapon resources',()=>{
 it.each(['barrack','woodlands'] as const)('%s owns source constructor counts and explicit copy seeds at callback zero',map=>{
  const f=fixture(map);try{
   const b=f.banks,p=callback(31,0),local=b.localWeaponWorld.freeze(),projectiles=b.projectileWorld.freeze(),loadout=b.loadoutWorld.freeze(),report=b.weaponReportWorld.freeze();
   for(const state of [local,projectiles,loadout,report])expect(state.prefix).toEqual(p);
   expect(local).toMatchObject({selectedWeapon:'launcher',loadedRocket:false,motion:{weapon:'launcher',ticker:1,gunPositionSource:{x:-7,y:-11,z:3}}});
   expect(local.models).toHaveLength(7);expect(local.models.filter(m=>m.inWorld).map(m=>m.handle)).toEqual(['rg6']);
   expect(loadout).toMatchObject({selected:'launcher',score:12,goldScore:4.5,ammo:{pistol:8,shotgun:6,rifle:28,launcher:6,rpg:1,sniper:30},reserve:{pistol:54,shotgun:24,rifle:140,launcher:18,rpg:12,sniper:12},counter:{waitgun:map==='barrack'?10:0,poldwaitgun:0},refillTarget:6});
   expect(Object.values(loadout.owned)).toEqual([true,true,true,true,true,true]);
   expect(projectiles).toMatchObject({catalog:[],models:[],actors:[],fifo:{launcher:[],rpg:[]},template:{handle:'grenade',resource:'rg6grenade',inWorld:false,materialHandle:'borrowed-grenade-shader'}});
   expect(f.collection.resources.get('rg6grenade')!.visible).toBe(true);
   expect(report).toEqual({prefix:p,shots:0,hurts:[]});const send=b.weaponReportWorld.begin();expect(send.send()).toEqual({});send.rollback();f.assertUnchanged();
  }finally{f.dispose();}
 });
 it('captures all seven RAW matrices and the grenade with one imported unit conversion under a transformed parent',()=>{
  const f=fixture();try{
   const captures=[...f.banks.localWeaponWorld.freeze().models,f.banks.projectileWorld.freeze().template];
   for(const capture of captures){const mesh=f.collection.resources.get(capture.resource)!,raw=geometry.meshes.find(m=>m.resource===capture.resource)!;
    for(const i of [0,Math.floor(raw.positions.length/2),raw.positions.length-1]){
     const actual=new THREE.Vector3().fromArray(raw.positions[i]).applyMatrix4(new THREE.Matrix4().fromArray(capture.worldMatrix));
     const expected=new THREE.Vector3().fromBufferAttribute(mesh.geometry.getAttribute('position'),i).applyMatrix4(mesh.matrixWorld).applyMatrix4(new THREE.Matrix4().fromArray(f.options.renderToWorld));
     for(const axis of ['x','y','z'] as const)expect(actual[axis]).toBeCloseTo(expected[axis],4);
    }
   }f.assertUnchanged();
  }finally{f.dispose();}
 });
 it.each(['barrack','woodlands'] as const)('%s prepares first source gun decrement, actual grenade birth and local motion together; rollback retries the same shared name',map=>{
  const f=fixture(map);try{
   const b=f.banks,initial=[b.localWeaponWorld.freeze(),b.projectileWorld.freeze(),b.loadoutWorld.freeze(),b.weaponReportWorld.freeze()];
   const run=()=>{
    const owner=f.allocator.begin(),local=b.localWeaponWorld.begin(),projectile=b.projectileWorld.begin(owner),loadout=b.loadoutWorld.begin(),report=b.weaponReportWorld.begin(),p=callback();
    const gun=advanceOriginalReceiverGunCallback(loadout.freeze(),{prefix:p,held:{typing:false,reload:false,fire:true,digits:[false,false,false,false,false,false]},weaponModelPresent:b.loadoutWorld.freezeWeaponModelPresence()});
    expect(gun.intents.filter(i=>i.kind==='fire')).toMatchObject([{weapon:'launcher',action:'grenade-constructor',savedAmmo:6}]);
    local.beginCallback(p,transform(28).toArray());local.fire();const before=local.freeze();local.finishPhysicalCallback({x:3*unit,y:4*unit,z:0});expect(local.freeze().motion).toEqual(advanceOriginalWeaponMotion(before.motion,{frames:1,sourceSpeed:5}).state);
    projectile.advanceCallback(p);expect(projectile.birth(f.birth('first-launch'))).toBe('grenade1');loadout.advanceCallback(p);loadout.capture(gun.checkpoint);report.admitPrefix(p);expect(report.send()).toEqual({});
    const states=[local.freeze(),projectile.freeze(),loadout.freeze(),report.freeze()];const publications=[owner.prepareCommit(),local.prepareCommit(),projectile.prepareCommit(),loadout.prepareCommit(),report.prepareCommit()];
    return {states,publications,rollback(){local.rollback();projectile.rollback();loadout.rollback();report.rollback();owner.rollback();}};
   };
   const failed=run();expect([b.localWeaponWorld.freeze(),b.projectileWorld.freeze(),b.loadoutWorld.freeze(),b.weaponReportWorld.freeze()]).toEqual(initial);failed.rollback();expect(failed.publications[0]).toThrow('Receiver scene publication closed');for(const publish of failed.publications.slice(1))publish();
   expect([b.localWeaponWorld.freeze(),b.projectileWorld.freeze(),b.loadoutWorld.freeze(),b.weaponReportWorld.freeze()]).toEqual(initial);f.assertUnchanged();
   const retry=run();expect(retry.states).toEqual(failed.states);for(const publish of retry.publications)publish();expect(b.loadoutWorld.freeze().ammo.launcher).toBe(5);expect(b.projectileWorld.freeze().actors).toEqual([{launchId:'first-launch',handle:'grenade1',weapon:'launcher'}]);f.assertUnchanged();
  }finally{f.dispose();}
 });
 it('retains the real grenade model in the family FIFO and readmits it without another clone allocation',()=>{
  const f=fixture();try{
   let owner=f.allocator.begin(),tx=f.banks.projectileWorld.begin(owner);tx.birth(f.birth('old'));tx.retire('old',model=>expect(model.inWorld).toBe(true));const p1=owner.prepareCommit(),p2=tx.prepareCommit();p1();p2();
   expect(f.banks.projectileWorld.freeze().fifo.launcher).toEqual(['grenade1']);
   owner=f.allocator.begin();tx=f.banks.projectileWorld.begin(owner);const noClone=vi.fn(()=>{throw Error('FIFO must reuse');});expect(tx.birth({...f.birth('new'),cloneFresh:noClone})).toBe('grenade1');expect(noClone).not.toHaveBeenCalled();const p3=owner.prepareCommit(),p4=tx.prepareCommit();p3();p4();
   expect(f.banks.projectileWorld.freeze().catalog).toHaveLength(1);expect(f.banks.projectileWorld.freeze().fifo.launcher).toEqual([]);f.assertUnchanged();
  }finally{f.dispose();}
 });
 it('keeps replacement generations and concurrent lives isolated while borrowing the same collection',()=>{
  const f=fixture(),other=createOriginalSoloFreshBanks(f.collection,{...f.options,sceneGeneration:32});try{
   const tx=f.banks.loadoutWorld.begin();tx.addScore(7);tx.commit();expect(f.banks.loadoutWorld.freeze().score).toBe(19);expect(other.loadoutWorld.freeze().score).toBe(12);
   const stale=other.projectileWorld.begin();expect(()=>stale.advanceCallback(callback(31))).toThrow();stale.rollback();expect(other.projectileWorld.freeze().prefix).toEqual(callback(32,0));
   f.banks.release();const replacement=createOriginalSoloFreshBanks(f.collection,{...f.options,sceneGeneration:33});try{expect(replacement.loadoutWorld.freeze().ammo.launcher).toBe(6);expect(replacement.localWeaponWorld.freeze().motion.ticker).toBe(1);expect(other.localWeaponWorld.freeze().prefix.sceneGeneration).toBe(32);}finally{replacement.release();}f.assertUnchanged();
  }finally{other.release();f.dispose();}
 });
 it('release cancels open stages and never disposes or changes borrowed geometry, materials, textures or meshes',()=>{
  const f=fixture(),geometrySpies=[...new Set(f.saved.map(s=>s.mesh.geometry))].map(g=>vi.spyOn(g,'dispose')),materialSpies=[...new Set(f.saved.flatMap(s=>Array.isArray(s.mesh.material)?s.mesh.material:[s.mesh.material]))].map(m=>vi.spyOn(m,'dispose')),textureSpies=[...f.textures.values()].map(t=>vi.spyOn(t,'dispose'));
  try{
   const local=f.banks.localWeaponWorld.begin();local.beginCallback(callback(),transform(40).toArray());local.equip('rpg');
   const loadout=f.banks.loadoutWorld.begin();loadout.addScore(9);const owner=f.allocator.begin(),projectile=f.banks.projectileWorld.begin(owner);projectile.birth(f.birth('cancelled'));const report=f.banks.weaponReportWorld.begin();report.admitPrefix(callback());
   f.banks.release();f.banks.release();for(const world of [f.banks.localWeaponWorld,f.banks.projectileWorld,f.banks.loadoutWorld,f.banks.weaponReportWorld])expect(()=>world.freeze()).toThrow('released');
   for(const spy of [...geometrySpies,...materialSpies,...textureSpies])expect(spy).not.toHaveBeenCalled();f.assertUnchanged();for(const s of f.saved)expect(s.mesh.geometry.getAttribute('position').count).toBeGreaterThan(0);
   // The shared allocator is a separately owned participant; release of the
   // four-bank assembly never pretends to roll that fifth participant back.
   projectile.rollback();local.rollback();loadout.rollback();report.rollback();owner.rollback();
  }finally{f.dispose();}
 });
});
