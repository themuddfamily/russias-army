import * as THREE from 'three';
import {readFileSync} from 'node:fs';
import {describe,expect,it,vi} from 'vitest';
import {createOriginalWeapons,ORIGINAL_WEAPON_RESOURCES,ORIGINAL_WEAPON_TEXTURES,type OriginalWeaponGeometryData} from './originalWeapons';
import {ORIGINAL_WEAPON_UNIT_SCALE} from './originalWeaponPresentation';
import {OriginalReceiverLocalWeaponPresentation} from './originalReceiverLocalWeaponPresentation';
import {captureOriginalSoloLocalWeaponSeed,createOriginalSoloLocalWeaponBinding} from './originalSoloLocalWeaponBinding';
import {OriginalReceiverLocalWeaponWorld,type ReceiverLocalWeaponWorldCheckpoint} from '../shared/originalReceiverLocalWeaponWorld';
import {advanceOriginalWeaponMotion} from '../shared/originalWeaponMotion';
import type {WeaponId} from '../shared/protocol';
import {ORIGINAL_RECEIVER_LOCAL_WEAPON_RESOURCES,type ReceiverLocalWeaponHandle} from '../shared/originalReceiverLocalWeaponInventory';

// Decode the packaged source positions once, not one pack per callback. Textures
// are CPU-only borrowed handles; this suite does not claim raster fidelity.
const geometry=JSON.parse(readFileSync(new URL('../public/assets/original-weapons/geometry.json',import.meta.url),'utf8')) as OriginalWeaponGeometryData;
const scale=ORIGINAL_WEAPON_UNIT_SCALE;
const weapons=Object.keys(ORIGINAL_WEAPON_RESOURCES) as WeaponId[];
const receipt=(tick=0,callback=0)=>({kind:'receipt' as const,sceneGeneration:19,callback,tick});
const callback=(n=1)=>({kind:'callback' as const,sceneGeneration:19,callback:n});
const affine=(matrix:THREE.Matrix4)=>{matrix.elements[3]=matrix.elements[7]=matrix.elements[11]=0;matrix.elements[15]=1;return matrix;};
const pose=(x:number)=>new THREE.Matrix4().compose(new THREE.Vector3(x,4,-7),new THREE.Quaternion().setFromEuler(new THREE.Euler(.17,-.43,.21)),new THREE.Vector3(1,1,1));
const model=(state:ReceiverLocalWeaponWorldCheckpoint,handle:string)=>state.models.find(m=>m.handle===handle)!;
function close(a:THREE.Vector3,b:THREE.Vector3){for(const axis of ['x','y','z'] as const)expect(a[axis]).toBeCloseTo(b[axis],4);}
function borrowed(collection:ReturnType<typeof createOriginalWeapons>){return [...collection.resources.values()].map(mesh=>({mesh,parent:mesh.parent,matrix:mesh.matrix.toArray(),world:mesh.matrixWorld.toArray(),visible:mesh.visible,position:mesh.position.toArray(),quaternion:mesh.quaternion.toArray(),scale:mesh.scale.toArray(),auto:mesh.matrixAutoUpdate}));}
function unchanged(saved:ReturnType<typeof borrowed>){for(const s of saved){expect(s.mesh.parent).toBe(s.parent);expect(s.mesh.matrix.toArray()).toEqual(s.matrix);expect(s.mesh.matrixWorld.toArray()).toEqual(s.world);expect(s.mesh.visible).toBe(s.visible);}}
function checkVertices(collection:ReturnType<typeof createOriginalWeapons>,state:ReceiverLocalWeaponWorldCheckpoint,conversion:THREE.Matrix4){
 for(const capture of state.models){const mesh=collection.resources.get(capture.resource)!,raw=geometry.meshes.find(m=>m.resource===capture.resource)!.positions;
  for(const index of [0,Math.floor(raw.length/2),raw.length-1]){
   const actual=new THREE.Vector3().fromBufferAttribute(mesh.geometry.getAttribute('position'),index).applyMatrix4(mesh.matrixWorld);
   const expected=new THREE.Vector3().fromArray(raw[index]).applyMatrix4(new THREE.Matrix4().fromArray(capture.worldMatrix)).applyMatrix4(conversion);close(actual,expected);
  }
  expect(mesh.visible).toBe(capture.inWorld);
 }
}
function fixture(followOffworldParents=true){
 const textures=new Map(ORIGINAL_WEAPON_TEXTURES.map(name=>[name,new THREE.Texture()])),collection=createOriginalWeapons({geometry,textures});
 const sourceRoot=new THREE.Group();sourceRoot.position.set(2,-1,3);sourceRoot.rotation.set(.12,.2,-.15);
 for(const [weapon,group] of collection.models){sourceRoot.add(group);group.position.set(-.25,-.4,.1);group.visible=weapon==='rifle';}
 sourceRoot.updateMatrixWorld(true);
 const renderToWorld=pose(23),camera=affine(renderToWorld.clone().multiply(sourceRoot.matrixWorld));
 const entries=Object.keys(ORIGINAL_RECEIVER_LOCAL_WEAPON_RESOURCES) as ReceiverLocalWeaponHandle[];
 const membership=Object.fromEntries(entries.map(handle=>[handle,handle==='ak47'||handle==='rocket'])) as Record<ReceiverLocalWeaponHandle,boolean>;
 const ancestry:Record<ReceiverLocalWeaponHandle,readonly string[]>={pistol:['private-camera'],spas12:['private-camera'],ak47:['private-camera'],rg6:['private-camera'],rpg:['private-camera'],dragunov:['private-camera'],rocket:['rpg','private-camera']};
 const saved=borrowed(collection);
 const seed=captureOriginalSoloLocalWeaponSeed(collection,{prefix:receipt(),cameraHandle:'private-camera',cameraWorldMatrix:camera.toArray(),renderToWorld:renderToWorld.toArray(),selectedWeapon:'rifle',loadedRocket:false,motion:{weapon:'rifle',ticker:11,gunPositionSource:{x:-12,y:-20,z:5}},membership,ancestry,maxTextChars:8192});
 const binding=createOriginalSoloLocalWeaponBinding({followOffworldParents,parentRestoresMembership:true,maxTextChars:8192});
 const bank=new OriginalReceiverLocalWeaponWorld(seed,{sourceScale:scale,maxCommands:32,maxTextChars:8192,bindModels:binding});
 const outer=new THREE.Group(),root=new THREE.Group();outer.position.set(17,-9,3);outer.rotation.set(-.3,.4,.1);outer.scale.set(2,3,.5);outer.add(root);root.position.set(-3,2,1);root.rotation.set(.4,-.2,.25);outer.updateMatrixWorld(true);
 const presentation=new OriginalReceiverLocalWeaponPresentation(collection,root,{sceneGeneration:19,maxTextChars:8192});
 const conversion=affine(new THREE.Matrix4().makeTranslation(1,2,-3).multiply(camera.clone().invert()));
 return {textures,collection,saved,seed,bank,presentation,conversion,renderToWorld,camera,root,dispose(){bank.release();presentation.release();collection.dispose();}};
}

describe('real weapon pack through detached private binding and renderer projection (declared CPU parent policy)',()=>{
 it('captures seven borrowed RAW-to-WORLD models once without mutating their renderer or inferring membership',()=>{
  const f=fixture();try{
   unchanged(f.saved);expect(f.seed.models).toHaveLength(7);expect(f.seed.loadedRocket).toBe(false);expect(model(f.seed,'rocket').inWorld).toBe(true);
   for(const capture of f.seed.models){const mesh=f.collection.resources.get(capture.resource)!,raw=geometry.meshes.find(m=>m.resource===capture.resource)!.positions;
    for(const i of [0,raw.length-1])close(new THREE.Vector3().fromArray(raw[i]).applyMatrix4(new THREE.Matrix4().fromArray(capture.worldMatrix)),new THREE.Vector3().fromBufferAttribute(mesh.geometry.getAttribute('position'),i).applyMatrix4(mesh.matrixWorld).applyMatrix4(f.renderToWorld));
   }
   f.presentation.adopt(receipt(),f.bank.freeze(),f.conversion.toArray());checkVertices(f.collection,f.bank.freeze(),f.conversion);
  }finally{f.dispose();}
 });
 it.each(weapons)('selects %s, applies one source 30 Hz recoil/bob recurrence and projects actual buffer vertices',weapon=>{
  const f=fixture();try{
   const tx=f.bank.begin();tx.beginCallback(callback(),pose(31).toArray());tx.equip(weapon);tx.reload();tx.fire();const before=tx.freeze();
   const expected=advanceOriginalWeaponMotion(before.motion,{frames:1,sourceSpeed:13});
   tx.finishPhysicalCallback({x:3*scale,y:4*scale,z:12*scale});const staged=tx.freeze();unchanged(f.saved);expect(f.bank.freeze()).toEqual(f.seed);tx.commit();
   expect(f.bank.freeze()).toEqual(staged);expect(staged.motion).toEqual(expected.state);expect(staged.motion.ticker).toBeCloseTo(11+.65,12);
   for(const mode of weapons)expect(model(staged,ORIGINAL_WEAPON_RESOURCES[mode]).inWorld).toBe(mode===weapon);
   const cameraInverse=affine(new THREE.Matrix4().fromArray(staged.cameraWorldMatrix).invert()),local=new THREE.Matrix4().fromArray(model(staged,ORIGINAL_WEAPON_RESOURCES[weapon]).worldMatrix).premultiply(cameraInverse);
   close(new THREE.Vector3().setFromMatrixPosition(local),new THREE.Vector3(expected.positionSource!.x,expected.positionSource!.y,expected.positionSource!.z).multiplyScalar(scale));
   f.presentation.adopt(callback(),staged,f.conversion.toArray());checkVertices(f.collection,staged,f.conversion);
  }finally{f.dispose();}
 });
 it('moves camera-parented WORLD without advancing motion, then retains VOID motion through receipt-only delivery',()=>{
  const f=fixture();try{
   const tx=f.bank.begin(),old=f.bank.freeze(),nextCamera=pose(42),delta=affine(nextCamera.clone().multiply(new THREE.Matrix4().fromArray(old.cameraWorldMatrix).invert()));
   tx.beginCallback(callback(),nextCamera.toArray());const cameraOnly=tx.freeze();expect(cameraOnly.motion).toEqual(old.motion);
   for(const capture of old.models){const expected=affine(delta.clone().multiply(new THREE.Matrix4().fromArray(capture.worldMatrix))).toArray(),actual=model(cameraOnly,capture.handle).worldMatrix;for(let i=0;i<16;i++)expect(actual[i]).toBeCloseTo(expected[i],12);}
   tx.whichGun(null);const beforeFinish=tx.freeze();tx.finishCallback(20);tx.commit();expect(f.bank.freeze().models).toEqual(beforeFinish.models);expect(f.bank.freeze().motion.gunPositionSource).toEqual(old.motion.gunPositionSource);expect(f.bank.freeze().motion.ticker).toBe(12);
   const committed=f.bank.freeze(),delivery=f.bank.begin();delivery.applyReceipt(receipt(1,1));delivery.commit();expect(f.bank.freeze().models).toEqual(committed.models);expect(f.bank.freeze().motion).toEqual(committed.motion);
   f.presentation.adopt(receipt(1,1),f.bank.freeze(),f.conversion.toArray());checkVertices(f.collection,f.bank.freeze(),f.conversion);
  }finally{f.dispose();}
 });
 it('honors explicit offworld-parent policy without deriving membership from visible borrowed meshes',()=>{
  const f=fixture(false);try{
   const old=f.bank.freeze(),tx=f.bank.begin();tx.beginCallback(callback(),pose(52).toArray());const staged=tx.freeze();
   expect(model(staged,'ak47').worldMatrix).not.toEqual(model(old,'ak47').worldMatrix);expect(model(staged,'pistol').worldMatrix).toEqual(model(old,'pistol').worldMatrix);expect(f.collection.resources.get('pistol')!.visible).toBe(true);
   tx.whichGun(null);tx.finishCallback(0);tx.commit();const before=f.bank.freeze(),next=f.bank.begin();next.beginCallback(callback(2),pose(62).toArray());expect(model(next.freeze(),'ak47').worldMatrix).toEqual(model(before,'ak47').worldMatrix);next.finishCallback(0);next.commit();
  }finally{f.dispose();}
 });
 it('removes and reparents the loaded rocket in explicit RPG reload/fire/whichgun order',()=>{
  const f=fixture();try{
   const tx=f.bank.begin();tx.beginCallback(callback(),pose(71).toArray());tx.equip('rpg');expect(model(tx.freeze(),'rocket').inWorld).toBe(true);expect(model(tx.freeze(),'rocket').worldMatrix).toEqual(model(tx.freeze(),'rpg').worldMatrix);
   tx.refreshRocket(false);const removed=tx.freeze();expect(model(removed,'rocket').inWorld).toBe(false);expect(removed.loadedRocket).toBe(false);
   tx.reload();expect(model(tx.freeze(),'rocket').inWorld).toBe(false);tx.fire();tx.whichGun('rpg');expect(model(tx.freeze(),'rocket').inWorld).toBe(true);tx.refreshRocket(false);tx.finishCallback(0);tx.commit();
   expect(f.bank.freeze().loadedRocket).toBe(false);expect(model(f.bank.freeze(),'rocket').inWorld).toBe(false);f.presentation.adopt(callback(),f.bank.freeze(),f.conversion.toArray());checkVertices(f.collection,f.bank.freeze(),f.conversion);expect(f.collection.rocket.visible).toBe(false);
   const next=f.bank.begin();next.beginCallback(callback(2),pose(72).toArray());next.refreshRocket(true);next.finishCallback(0);next.commit();const rocketWorld=model(f.bank.freeze(),'rocket').worldMatrix,rpgWorld=model(f.bank.freeze(),'rpg').worldMatrix;for(let i=0;i<16;i++)expect(rocketWorld[i]).toBeCloseTo(rpgWorld[i],12);expect(model(f.bank.freeze(),'rocket').groupAncestry).toEqual(['rpg','private-camera']);
  }finally{f.dispose();}
 });
 it('rolls back all private writes and retries identically while borrowed presentation stays unchanged until adoption',()=>{
  const f=fixture();try{
   const initial=f.bank.freeze();
   const run=()=>{const tx=f.bank.begin();tx.beginCallback(callback(),pose(81).toArray());tx.equip('rpg');tx.reload();tx.fire();tx.refreshRocket(false);tx.finishPhysicalCallback({x:3*scale,y:4*scale,z:0});return tx;};
   const failed=run(),staged=failed.freeze();failed.rollback();expect(f.bank.freeze()).toBe(initial);unchanged(f.saved);const retry=run();expect(retry.freeze()).toEqual(staged);retry.commit();unchanged(f.saved);
   f.presentation.adopt(callback(),f.bank.freeze(),f.conversion.toArray());checkVertices(f.collection,f.bank.freeze(),f.conversion);expect(f.presentation.freeze()).toEqual(staged);
  }finally{f.dispose();}
 });
 it('position-only finish preserves nonstandard local affine orientation and shear without a selection rewrite',()=>{
  const f=fixture(),local=new THREE.Matrix4().compose(new THREE.Vector3(.1,-.2,.3),new THREE.Quaternion().setFromEuler(new THREE.Euler(.3,.7,-.4)),new THREE.Vector3(scale,scale*1.2,scale*.8));local.elements[4]+=.003;
  const worldMatrix=affine(f.camera.clone().multiply(local)).toArray(),seed={...f.seed,models:f.seed.models.map(m=>m.handle==='ak47'?{...m,worldMatrix}:m)};
  const bank=new OriginalReceiverLocalWeaponWorld(seed,{sourceScale:scale,maxCommands:16,maxTextChars:8192,bindModels:createOriginalSoloLocalWeaponBinding({followOffworldParents:true,parentRestoresMembership:true,maxTextChars:8192})});
  try{
   const tx=bank.begin();tx.beginCallback(callback(),f.camera.toArray());tx.finishCallback(0);tx.commit();const after=affine(f.camera.clone().invert()).multiply(new THREE.Matrix4().fromArray(model(bank.freeze(),'ak47').worldMatrix));
   for(const index of [0,1,2,4,5,6,8,9,10])expect(after.elements[index]).toBeCloseTo(local.elements[index],12);
   f.presentation.adopt(callback(),bank.freeze(),f.conversion.toArray());checkVertices(f.collection,bank.freeze(),f.conversion);
  }finally{bank.release();f.dispose();}
 });
 it('release restores every borrowed resource and leaves geometry, materials and texture handles usable',()=>{
  const f=fixture(),geometryDisposes=f.saved.map(s=>vi.spyOn(s.mesh.geometry,'dispose')),materialDisposes=[...new Set(f.saved.map(s=>s.mesh.material as THREE.Material))].map(m=>vi.spyOn(m,'dispose')),textureDisposes=[...f.textures.values()].map(t=>vi.spyOn(t,'dispose'));
  try{
   const tx=f.bank.begin();tx.beginCallback(callback(),pose(91).toArray());tx.equip('sniper');tx.finishCallback(0);tx.commit();f.presentation.adopt(callback(),f.bank.freeze(),f.conversion.toArray());f.bank.release();f.presentation.release();unchanged(f.saved);
   for(const saved of f.saved){expect(saved.mesh.position.toArray()).toEqual(saved.position);expect(saved.mesh.quaternion.toArray()).toEqual(saved.quaternion);expect(saved.mesh.scale.toArray()).toEqual(saved.scale);expect(saved.mesh.matrixAutoUpdate).toBe(saved.auto);expect(saved.mesh.geometry.getAttribute('position').count).toBeGreaterThan(0);}
   for(const spy of [...geometryDisposes,...materialDisposes,...textureDisposes])expect(spy).not.toHaveBeenCalled();expect(f.collection.rocket.parent).toBe(f.collection.models.get('rpg'));
  }finally{f.dispose();}
 });
});
