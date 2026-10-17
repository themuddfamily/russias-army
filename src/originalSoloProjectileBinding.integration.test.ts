import * as THREE from 'three';
import {readFileSync} from 'node:fs';
import {describe,expect,it,vi} from 'vitest';
import {createOriginalWeapons,ORIGINAL_WEAPON_TEXTURES,type OriginalWeaponGeometryData} from './originalWeapons';
import {ORIGINAL_WEAPON_UNIT_SCALE} from './originalWeaponPresentation';
import {captureOriginalSoloProjectileSeed,captureOriginalSoloProjectileResource,createOriginalSoloProjectileBirth,captureOriginalSoloProjectilePose,type OriginalSoloProjectilePose} from './originalSoloProjectileBinding';
import {OriginalReceiverProjectileWorld,type ReceiverProjectileWorldWeapon,type ReceiverProjectileWorldModel} from '../shared/originalReceiverProjectileWorld';
import {OriginalReceiverModelWorld,type ReceiverModelBackend} from '../shared/originalReceiverModelWorld';
import {createOriginalReceiverProjectileInventory} from '../shared/originalReceiverProjectileInventory';
import {createOriginalProjectile} from '../shared/originalExplosives';
import {originalProjectileDirection} from '../shared/originalProjectileOrientation';
import {originalProjectileModelQuaternion} from '../shared/originalProjectileRay';

// Decode once. CPU texture handles and explicit material labels do not attest
// native clone defaults, Havok parenting, shader pixels or global actor order.
const geometry=JSON.parse(readFileSync(new URL('../public/assets/original-weapons/geometry.json',import.meta.url),'utf8')) as OriginalWeaponGeometryData;
const prefix=(callback=0)=>({kind:'callback' as const,sceneGeneration:23,callback});
const affine=(m:THREE.Matrix4)=>{m.elements[3]=m.elements[7]=m.elements[11]=0;m.elements[15]=1;return m;};
const conversion=()=>new THREE.Matrix4().compose(new THREE.Vector3(13,-7,4),new THREE.Quaternion().setFromEuler(new THREE.Euler(.2,-.35,.1)),new THREE.Vector3(1,1,1));
function pose(launchId:string,weapon:ReceiverProjectileWorldWeapon,x=2):OriginalSoloProjectilePose{
 const rotation={x:21,y:0,z:-37},direction=originalProjectileDirection(rotation),physical=createOriginalProjectile(weapon,{x,y:8,z:-5},direction,'owner',weapon==='rpg'?rotation:undefined);
 return {launchId,weapon,position:physical.position,direction:physical.direction,...(physical.sourceRotation?{sourceRotation:physical.sourceRotation}:{}),orientation:physical.angular!.orientation,renderToWorld:conversion().toArray(),orientationPolicy:'copy-source-basis-unit-reset'};
}
function fixture(){
 const textures=new Map(ORIGINAL_WEAPON_TEXTURES.map(name=>[name,new THREE.Texture()])),collection=createOriginalWeapons({geometry,textures}),root=new THREE.Group();
 root.position.set(3,6,-2);root.rotation.set(.17,-.23,.12);
 for(const group of collection.models.values())root.add(group);
 const grenade=collection.resources.get('rg6grenade')!;root.add(grenade);grenade.position.set(-2,4,1);grenade.rotation.set(.2,.4,.3);root.updateMatrixWorld(true);
 const saved=[grenade,collection.rocket].map(mesh=>({mesh,parent:mesh.parent,world:mesh.matrixWorld.toArray(),local:mesh.matrix.toArray(),visible:mesh.visible}));
 const seed=captureOriginalSoloProjectileSeed(collection,{prefix:prefix(),renderToWorld:conversion().toArray(),grenadeMaterialHandle:'captured-grenade-material',grenadeAncestry:['source-root'],maxTextChars:8192});
 const world=new OriginalReceiverProjectileWorld(seed,{maxModels:32,maxActors:8,maxCommands:64,maxTextChars:8192,rocketMaterialHandle:'canonical-rocket-material'});
 const bodyPose={position:{x:0,y:0,z:0},yaw:0,phase:0,scale:1};
 const backend:ReceiverModelBackend={cloneGI:()=>({pose:bodyPose,geometryProvenance:'explicit-unused-GI'}),cloneGun:()=>({pose:bodyPose,geometryProvenance:'explicit-unused-gun'}),sphere:()=>({bspWorld:1,provenance:'declared-resource'}),heldGunPose:gi=>gi.pose,reparentGunMembership:()=>true,dropYaw:()=>0,nearestDetailedDownward:()=>({hit:null,coverage:{complete:true,missing:[],provenance:'explicit-unused-query'}})};
 const allocator=new OriginalReceiverModelWorld(backend,{eyeHeight:1,sourceScale:ORIGINAL_WEAPON_UNIT_SCALE,goodyBspWorld:1,sceneGeneration:23,maxModels:32,maxPickups:8});
 const inventory=createOriginalReceiverProjectileInventory(geometry,{sceneGeneration:23,provenance:'decoded-projectile-pack-through-copy-binding',sidedness:'front',maxModels:32,maxVertices:100000,maxFaces:100000,maxTextChars:8192});
 const fresh=(weapon:ReceiverProjectileWorldWeapon)=>captureOriginalSoloProjectileResource(collection.resources.get(weapon==='launcher'?'rg6grenade':'rpgrocket')!,{handle:weapon==='launcher'?'grenade':'rocket',resource:weapon==='launcher'?'rg6grenade':'rpgrocket',inWorld:false,materialHandle:weapon==='launcher'?'captured-grenade-material':'captured-rocket-material',groupAncestry:['source-root'],renderToWorld:conversion().toArray(),maxTextChars:8192});
 const birth=(p:OriginalSoloProjectilePose)=>createOriginalSoloProjectileBirth({launchId:p.launchId,weapon:p.weapon,freshModel:fresh(p.weapon),pose:p,rocketMaterialHandle:'canonical-rocket-material',maxTextChars:8192});
 return {collection,saved,seed,world,allocator,inventory,birth,dispose(){world.release();allocator.reset();collection.dispose();}};
}
function unchanged(saved:ReturnType<typeof fixture>['saved']){for(const s of saved){expect(s.mesh.parent).toBe(s.parent);expect(s.mesh.matrixWorld.toArray()).toEqual(s.world);expect(s.mesh.matrix.toArray()).toEqual(s.local);expect(s.mesh.visible).toBe(s.visible);}}
function verifyVertices(model:ReceiverProjectileWorldModel,p:OriginalSoloProjectilePose){
 const raw=geometry.meshes.find(m=>m.resource===model.resource)!;
 const quaternion=originalProjectileModelQuaternion(p.weapon,p.direction,p.sourceRotation,p.orientation);
 const expectedMatrix=affine(new THREE.Matrix4().fromArray(p.renderToWorld).multiply(new THREE.Matrix4().compose(new THREE.Vector3(p.position.x,p.position.y,p.position.z),quaternion,new THREE.Vector3(ORIGINAL_WEAPON_UNIT_SCALE,ORIGINAL_WEAPON_UNIT_SCALE,ORIGINAL_WEAPON_UNIT_SCALE))));
 for(const i of [0,Math.floor(raw.positions.length/2),raw.positions.length-1]){
  const actual=new THREE.Vector3().fromArray(raw.positions[i]).applyMatrix4(new THREE.Matrix4().fromArray(model.worldMatrix)),expected=new THREE.Vector3().fromArray(raw.positions[i]).applyMatrix4(expectedMatrix);
  for(const axis of ['x','y','z'] as const)expect(actual[axis]).toBeCloseTo(expected[axis],11);
 }
}

describe('actual projectile resources and shared allocator through declared detached copy pose policy',()=>{
 it('captures actual offworld grenade template without mutating or inferring membership from borrowed visibility',()=>{
  const f=fixture();try{
   unchanged(f.saved);expect(f.seed.template.inWorld).toBe(false);expect(f.collection.resources.get('rg6grenade')!.visible).toBe(true);expect(f.seed.catalog).toEqual([]);
   const raw=geometry.meshes.find(m=>m.resource==='rg6grenade')!,mesh=f.collection.resources.get('rg6grenade')!;
   for(const index of [0,raw.positions.length-1]){
    const expected=new THREE.Vector3().fromBufferAttribute(mesh.geometry.getAttribute('position'),index).applyMatrix4(mesh.matrixWorld).applyMatrix4(conversion()),actual=new THREE.Vector3().fromArray(raw.positions[index]).applyMatrix4(new THREE.Matrix4().fromArray(f.seed.template.worldMatrix));
    for(const axis of ['x','y','z'] as const)expect(actual[axis]).toBeCloseTo(expected[axis],5);
   }
   expect(f.inventory.snapshotAt(prefix(),f.world.snapshotAt(prefix())).missing).toEqual([]);
  }finally{f.dispose();}
 });
 it.each(['launcher','rpg'] as const)('constructs %s with real indexed resources, one unit conversion and allocated source identity',weapon=>{
  const f=fixture();try{
   const owner=f.allocator.begin(),stage=f.world.begin(owner),p=pose('launch:first',weapon),handle=stage.birth(f.birth(p)),model=stage.freeze().models[0];
   expect(handle).toBe(weapon==='launcher'?'grenade1':'rocket1');expect(model.materialHandle).toBe(weapon==='launcher'?'captured-grenade-material':'canonical-rocket-material');verifyVertices(model,p);unchanged(f.saved);
   const publishModels=stage.prepareCommit(),publishOwner=owner.prepareCommit();publishOwner();publishModels();
   const snapshot=f.inventory.snapshotAt(prefix(),f.world.snapshotAt(prefix()));expect(snapshot.missing).toEqual([]);expect(snapshot.triangles.find(t=>t.handle===handle)!.faces).toEqual(geometry.meshes.find(m=>m.resource===model.resource)!.faces);expect(snapshot.models.find(m=>m.handle===handle)!.inWorld).toBe(true);
  }finally{f.dispose();}
 });
 it.each(['launcher','rpg'] as const)('recycles %s without cloning, retaining grenade material and resetting RPG material after readmission',weapon=>{
  const f=fixture();try{
   let owner=f.allocator.begin(),stage=f.world.begin(owner);const handle=stage.birth(f.birth(pose('old',weapon)));stage.capturePose('old',{...stage.freeze().models[0],materialHandle:'retained-custom-material'});stage.retire('old',()=>{});owner.commit();stage.commit();
   const retained=f.world.freeze().models[0];owner=f.allocator.begin();stage=f.world.begin(owner);const p=pose('new',weapon,19),birth=f.birth(p),clone=vi.fn(()=>{throw Error('must reuse family FIFO');});let readmitted:ReceiverProjectileWorldModel|undefined;
   expect(stage.birth({...birth,cloneFresh:clone,onRecycled:model=>{readmitted=model;expect(stage.freeze().constructing?.handle).toBe(handle);expect(stage.freeze().actors).toEqual([]);}})).toBe(handle);
   expect(clone).not.toHaveBeenCalled();expect(readmitted).toMatchObject({inWorld:true,materialHandle:'retained-custom-material',worldMatrix:retained.worldMatrix});expect(stage.freeze().models[0].materialHandle).toBe(weapon==='launcher'?'retained-custom-material':'canonical-rocket-material');verifyVertices(stage.freeze().models[0],p);owner.commit();stage.commit();unchanged(f.saved);
   expect(f.world.freeze().catalog).toHaveLength(1);expect(f.world.freeze().fifo[weapon]).toEqual([]);
  }finally{f.dispose();}
 });
 it('captures continuing angular WORLD pose before retirement emission and keeps the emitted pose in the offworld FIFO',()=>{
  const f=fixture();try{
   const owner=f.allocator.begin(),stage=f.world.begin(owner),p=pose('moving','launcher'),handle=stage.birth(f.birth(p));
   const q=new THREE.Quaternion().setFromEuler(new THREE.Euler(.5,.1,-.3)),continuing={...p,position:{x:31,y:12,z:-8},orientation:{x:q.x,y:q.y,z:q.z,w:q.w}};
   const captured=captureOriginalSoloProjectilePose(stage.freeze().models[0],continuing,8192);stage.capturePose(captured.launchId,captured.model);verifyVertices(stage.freeze().models[0],continuing);
   stage.retire('moving',model=>{expect(model.inWorld).toBe(true);expect(stage.freeze().actors[0].launchId).toBe('moving');expect(stage.freeze().fifo.launcher).toEqual([]);const during=f.inventory.snapshotAt(prefix(),stage.snapshotAt(prefix()));expect(during.models.find(m=>m.handle===handle)!.inWorld).toBe(true);verifyVertices(model,continuing);});owner.commit();stage.commit();
   const state=f.world.freeze();expect(state.models[0].inWorld).toBe(false);expect(state.models[0].worldMatrix).toEqual(captured.model.worldMatrix);expect(state.fifo.launcher).toEqual([handle]);expect(state.actors).toEqual([]);expect(state.models[0].worldMatrix[13]).not.toBe(-1000);
  }finally{f.dispose();}
 });
 it('rolls back real constructor captures and shared numbering, then retries the identical detached program',()=>{
  const f=fixture();try{
   const initial=f.world.freeze(),p=pose('retry','rpg');let owner=f.allocator.begin(),stage=f.world.begin(owner);expect(stage.birth(f.birth(p))).toBe('rocket1');const failed=stage.freeze(),publish=stage.prepareCommit();stage.rollback();owner.rollback();publish();expect(f.world.freeze()).toBe(initial);unchanged(f.saved);
   owner=f.allocator.begin();stage=f.world.begin(owner);expect(stage.birth(f.birth(p))).toBe('rocket1');expect(stage.freeze()).toEqual(failed);const publishBank=stage.prepareCommit(),publishAllocator=owner.prepareCommit();publishAllocator();publishBank();unchanged(f.saved);expect(f.world.freeze()).toEqual(failed);
  }finally{f.dispose();}
 });
 it('rejects absent/mismatched physical capture and unknown launch without implicitly retiring the live model',()=>{
  const f=fixture();try{
   const owner=f.allocator.begin(),stage=f.world.begin(owner),p=pose('live','launcher');stage.birth(f.birth(p));owner.commit();stage.commit();const before=f.world.freeze(),retained=before.models[0];
   expect(()=>captureOriginalSoloProjectilePose(retained,undefined as unknown as OriginalSoloProjectilePose,8192)).toThrow();expect(()=>captureOriginalSoloProjectilePose(retained,pose('live','rpg'),8192)).toThrow();expect(f.world.freeze()).toBe(before);
   const next=f.world.begin(),unknown=captureOriginalSoloProjectilePose(retained,{...p,launchId:'unknown'},8192);expect(()=>next.capturePose(unknown.launchId,unknown.model)).toThrow();next.rollback();expect(f.world.freeze()).toBe(before);expect(before.actors[0].launchId).toBe('live');expect(before.fifo.launcher).toEqual([]);unchanged(f.saved);
  }finally{f.dispose();}
 });
});
