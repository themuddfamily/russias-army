import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {describe,expect,it,vi} from 'vitest';
import {OriginalReceiverActorResources,type ReceiverWeaponGeometry} from '../shared/originalReceiverActorResources';
import {OriginalReceiverSoldierResource} from '../shared/originalReceiverSoldierResource';
import type {OriginalSoldierCollisionAssets} from '../shared/originalSoldierCollision';
import {OriginalReceiverModelWorld,type ReceiverModelEntry,type ReceiverModelPose,type ReceiverActorPose} from '../shared/originalReceiverModelWorld';
import {ORIGINAL_MAP_SCALE} from '../shared/originalMapProfile';
import {createOriginalSoloActorLifecycle,captureOriginalSoloActorDropYawPlan} from './originalSoloActorLifecycle';

// Decoded packs are read once, inside root's bounded test job. The lifecycle
// query deliberately declares missing map/transient inventory; it is not a
// complete scene, native measured sphere, clone-default or render comparison.
const base=new URL('../public/assets/',import.meta.url);
const soldier:OriginalSoldierCollisionAssets={geometry:JSON.parse(readFileSync(new URL('original-soldier/geometry.json',base),'utf8')),rigMotion:JSON.parse(readFileSync(new URL('original-soldier/rig-motion.json',base),'utf8'))};
const weapons=JSON.parse(readFileSync(new URL('original-weapons/geometry.json',base),'utf8')) as ReceiverWeaponGeometry;
const basis=new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI/2,0,0)).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),-Math.PI/2));
const sourceScale=ORIGINAL_MAP_SCALE;
const resourceOptions={sourceScale,giResourceOrientation:{x:basis.x,y:basis.y,z:basis.z,w:basis.w},gunScale:1,maxVertices:100000,maxFaces:100000,maxMotionKeys:100000,provenance:'decoded-GI-rig-and-six-guns-lifecycle-adapter',sidedness:'double' as const};
const pose=(phase=77,scale=1):ReceiverModelPose=>({position:{x:2,y:3,z:4},yaw:.37,phase,scale});
const actor=(y=12):ReceiverActorPose=>({position:{x:5,y,z:-4},yaw:.72,motionTime:750,weapon:'rifle'});
const birth=(actorId='a',callback=0)=>({actorId,callback,targetFeet:{x:5,y:12,z:-4},targetYaw:.72});
function fixture(parentRestoresMembership=true){
 const resources=new OriginalReceiverActorResources(soldier,weapons,resourceOptions);
 const guns={pistol:{pose:pose(0),geometryProvenance:'decoded-pistol-copy-clone'},shotgun:{pose:pose(0),geometryProvenance:'decoded-spas12-copy-clone'},rifle:{pose:pose(0),geometryProvenance:'decoded-ak47-copy-clone'},launcher:{pose:pose(0),geometryProvenance:'decoded-rg6-copy-clone'},rpg:{pose:pose(0),geometryProvenance:'decoded-rpg-copy-clone'},sniper:{pose:pose(0),geometryProvenance:'decoded-dragunov-copy-clone'}};
 const dropYawPlan=captureOriginalSoloActorDropYawPlan(1,[{actorId:'a',random36:9},{actorId:'b',random36:36}],{maxEntries:8,maxTextChars:8192});
 const binding=createOriginalSoloActorLifecycle({actorResources:resources,sourceScale,gi:{pose:pose(77,2),geometryProvenance:'decoded-GI-copy-clone'},guns,parentRestoresMembership,readDropYawPlan:()=>dropYawPlan,maxTextChars:8192});
 const querySnapshots: Array<readonly Readonly<ReceiverModelEntry>[]>=[];
 const world=new OriginalReceiverModelWorld({...binding,nearestDetailedDownward:(_origin,models)=>{querySnapshots.push(models);return {hit:null,coverage:{complete:false,missing:['map-and-transient-inventory'],provenance:'explicit-lifecycle-only-query-fixture'}};}},{sourceScale,eyeHeight:85*sourceScale,goodyBspWorld:2,sceneGeneration:27,maxModels:64,maxPickups:16,requireCompleteCoverage:false});
 return {resources,binding,world,querySnapshots,dispose(){world.reset();resources.dispose();}};
}
const find=(world:OriginalReceiverModelWorld,handle:string)=>world.freezeModels().find(m=>m.handle===handle)!;

describe('decoded GI/rig/guns through the detached actor lifecycle and actual ModelWorld',()=>{
 it('uses the declared resource radius at newborn .045 scale and at death phase3000',()=>{
  const f=fixture();try{
   const tx=f.world.begin(),born=tx.birth(birth());tx.commit();
   const radius=1726.8026123046875*.045*sourceScale*.75;
   expect(born.bspWorld).toBeCloseTo(radius,12);expect(born.sphereProvenance).toBe('declared-resource');
   expect(born.queryCoverage).toMatchObject({complete:false,missing:['map-and-transient-inventory']});
   expect(f.querySnapshots[0][0].pose).toEqual({...pose(77,2),scale:.045});
   const gi=find(f.world,born.giHandle);expect(gi.pose.scale).toBe(.045);
   const resolved=f.resources.resolve(gi,'live-gi');expect(resolved.positions).toHaveLength(742);expect(resolved.faces).toHaveLength(832);
   expect(resolved.positions.every(vertex=>vertex.every(Number.isFinite))).toBe(true);expect(find(f.world,born.giHandle)).toEqual(gi);
   const death=f.world.begin();death.detach('a',actor(),1);death.commit();
   expect(find(f.world,born.giHandle).pose.phase).toBe(3000);
   const before=find(f.world,born.giHandle).pose.position.y,step=f.world.begin();step.advanceCorpses();step.commit();
   expect(find(f.world,born.giHandle).pose.position.y).toBeCloseTo(before-radius/300*8,12);
   expect(f.world.freezePickups()[0].position.y).toBeCloseTo(12+85*sourceScale-radius/2,12);
  }finally{f.dispose();}
 });
 it('places a held gun from the previous bone23 pose, before movement and motion sampling',()=>{
  const f=fixture(),kernel=new OriginalReceiverSoldierResource(soldier,resourceOptions);try{
   let tx=f.world.begin();const born=tx.birth(birth());tx.commit();const old=find(f.world,born.giHandle);
   const worldMatrix=new THREE.Matrix4().compose(new THREE.Vector3(old.pose.position.x,old.pose.position.y,old.pose.position.z),new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),old.pose.yaw).multiply(basis),new THREE.Vector3().setScalar(old.pose.scale*sourceScale));
   const sample=kernel.sample(old.pose.phase,worldMatrix.toArray()),p=new THREE.Vector3(),q=new THREE.Quaternion(),s=new THREE.Vector3();new THREE.Matrix4().fromArray(sample.bone23WorldMatrix).decompose(p,q,s);
   q.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0,170*Math.PI/180,10*Math.PI/180,'ZYX')));p.add(new THREE.Vector3(0,-3*sourceScale,0).applyQuaternion(q));
   tx=f.world.begin();tx.beforeCallback('a',actor());tx.afterCallback('a',{...actor(30),position:{x:20,y:30,z:40}});tx.commit();
   const held=f.world.freezeModels().find(m=>m.resource==='ak47')!.pose;
   for(const axis of ['x','y','z'] as const)expect(held.position[axis]).toBeCloseTo(p[axis],12);
   expect(Math.abs(new THREE.Quaternion(held.rotation!.x,held.rotation!.y,held.rotation!.z,held.rotation!.w).dot(q))).toBeCloseTo(1,12);
   expect(held.scale).toBe(1);expect(held.phase).toBe(0);expect(held.scale).not.toBeCloseTo(s.x,3);
   const current=find(f.world,born.giHandle);expect(current.pose.phase).toBe(750);expect(f.binding.heldGunPose(current,'rifle').position).not.toEqual(held.position);
  }finally{kernel.dispose();f.dispose();}
 });
 it('retains gun catalog identities, FIFO corpse state and the fixed pickup alias across reuse',()=>{
  const f=fixture();try{
   let tx=f.world.begin();const born=tx.birth(birth());tx.beforeCallback('a',actor());tx.afterCallback('a',actor());tx.detach('a',actor(),1);tx.commit();
   const pickup=f.world.freezePickups()[0],fixed={...pickup.position},catalog=f.world.freezeActorRegistry().gunCatalog;
   tx=f.world.begin();for(let n=0;n<75;n++)tx.advanceCorpses();tx.commit();expect(f.world.debugState().fifo).toEqual([]);
   tx=f.world.begin();tx.advanceCorpses();tx.commit();const retained=find(f.world,born.giHandle).pose;expect(retained.phase).toBe(3008);expect(f.world.debugState().fifo).toEqual([born.giHandle]);
   tx=f.world.begin();const reused=tx.birth(birth('c',2));tx.beforeCallback('c',{...actor(),position:{x:50,y:60,z:70}});tx.afterCallback('c',{...actor(),position:{x:50,y:60,z:70}});tx.commit();
   expect(reused.giHandle).toBe(born.giHandle);expect(f.querySnapshots.at(-1)!.find(m=>m.handle===born.giHandle)!.pose).toEqual({...retained,scale:.045});
   expect(f.world.freezePickups()[0].position).toEqual(fixed);expect(f.world.freezeActorRegistry().gunCatalog).toEqual(catalog);
   expect(f.world.freezeActorRegistry().actors[0].gun).toBe(pickup.handle);expect(find(f.world,pickup.handle).inWorld).toBe(true);
   tx=f.world.begin();expect(tx.collectPickup(pickup.id)).toBe(true);tx.commit();expect(find(f.world,pickup.handle).inWorld).toBe(false);expect(f.world.freezeActorRegistry().actors[0].gun).toBe(pickup.handle);
  }finally{f.dispose();}
 });
 it('retries a rolled-back death with identical captured yaw and no RNG or resource disposal',()=>{
  const f=fixture(),random=vi.spyOn(Math,'random').mockImplementation(()=>{throw Error('Lifecycle must not sample RNG');});try{
   let tx=f.world.begin();tx.birth(birth());tx.beforeCallback('a',actor());tx.afterCallback('a',actor());tx.commit();const before=f.world.freezeModels();
   tx=f.world.begin();tx.detach('a',actor(),1);const staged=tx.freezeModels();tx.rollback();expect(f.world.freezeModels()).toEqual(before);expect(f.world.freezePickups()).toEqual([]);
   tx=f.world.begin();tx.detach('a',actor(),1);expect(tx.freezeModels()).toEqual(staged);tx.commit();
   const dropped=find(f.world,f.world.freezePickups()[0].handle);expect(dropped.pose.yaw).toBeCloseTo(Math.PI/2,12);expect(random).not.toHaveBeenCalled();
   expect(f.resources.resolve(dropped,'dropped-gun').positions).toEqual(weapons.meshes.find(m=>m.resource==='ak47')!.positions);
  }finally{random.mockRestore();f.dispose();}
 });
 it.each([false,true])('obeys the declared gsmokes parent membership policy (%s)',revive=>{
  const f=fixture(revive);try{
   let tx=f.world.begin();const born=tx.birth(birth());tx.beforeCallback('a',{...actor(),weapon:'rpg'});tx.commit();expect(find(f.world,born.gunHandle).inWorld).toBe(revive);
   tx=f.world.begin();tx.beforeCallback('a',actor());tx.beforeCallback('a',{...actor(),weapon:'rpg'});tx.commit();expect(find(f.world,born.gunHandle).inWorld).toBe(revive);
  }finally{f.dispose();}
 });
 it('rejects an uncaptured actor/callback drop before committing pickup or corpse changes',()=>{
  const f=fixture();try{
   let tx=f.world.begin();tx.birth(birth());tx.commit();const before=f.world.freezeModels();tx=f.world.begin();expect(()=>tx.detach('a',actor(),2)).toThrow();tx.rollback();expect(f.world.freezeModels()).toEqual(before);expect(f.world.freezePickups()).toEqual([]);
  }finally{f.dispose();}
 });
});
