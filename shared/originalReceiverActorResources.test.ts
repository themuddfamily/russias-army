import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {describe,expect,it} from 'vitest';
import {OriginalReceiverActorResources,type ReceiverActorResourceOptions,type ReceiverWeaponGeometry} from './originalReceiverActorResources';
import {OriginalReceiverSoldierResource} from './originalReceiverSoldierResource';
import {OriginalSoldierCollision,type OriginalSoldierCollisionAssets} from './originalSoldierCollision';
import {OriginalReceiverModelWorld,type ReceiverModelBackend,type ReceiverModelEntry} from './originalReceiverModelWorld';
import {ORIGINAL_MAP_SCALE} from './originalMapProfile';

// File reads execute only in root's bounded test process, never as browser imports.
const base=new URL('../public/assets/',import.meta.url);
const soldier:OriginalSoldierCollisionAssets={geometry:JSON.parse(readFileSync(new URL('original-soldier/geometry.json',base),'utf8')),rigMotion:JSON.parse(readFileSync(new URL('original-soldier/rig-motion.json',base),'utf8'))};
const weapons=JSON.parse(readFileSync(new URL('original-weapons/geometry.json',base),'utf8')) as ReceiverWeaponGeometry;
const basis=new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI/2,0,0)).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),-Math.PI/2));
const options:ReceiverActorResourceOptions={sourceScale:ORIGINAL_MAP_SCALE,giResourceOrientation:{x:basis.x,y:basis.y,z:basis.z,w:basis.w},gunScale:1.3,maxVertices:100000,maxFaces:100000,maxMotionKeys:100000,provenance:'actual-decoded-GI-and-guns-adapter',sidedness:'double'};
const kernel=()=>new OriginalReceiverSoldierResource(soldier,options);
const provider=()=>new OriginalReceiverActorResources(soldier,weapons,options);
const q=new THREE.Quaternion().setFromEuler(new THREE.Euler(.37,-.51,.29,'ZYX'));
const gi=(phase=333.3):ReceiverModelEntry=>({handle:'gi:fixture',name:'fixture',resource:'GI',kind:'gi',group:'soldiers',inWorld:true,geometryProvenance:'actual-resource-lifecycle-fixture',pose:{position:{x:12,y:-3,z:7},yaw:1.5,rotation:{x:q.x,y:q.y,z:q.z,w:q.w},phase,scale:.045}});
const matrixFor=(model:ReceiverModelEntry,withBasis=true)=>new THREE.Matrix4().compose(new THREE.Vector3(model.pose.position.x,model.pose.position.y,model.pose.position.z),new THREE.Quaternion(model.pose.rotation!.x,model.pose.rotation!.y,model.pose.rotation!.z,model.pose.rotation!.w).multiply(withBasis?basis:new THREE.Quaternion()),new THREE.Vector3().setScalar(model.pose.scale*options.sourceScale));
const legacyMatrix=(feet:THREE.Vector3,yaw:number)=>new THREE.Matrix4().makeTranslation(feet.x,feet.y,feet.z).multiply(new THREE.Matrix4().makeRotationY(yaw)).multiply(new THREE.Matrix4().compose(new THREE.Vector3(0,55*ORIGINAL_MAP_SCALE,0),basis,new THREE.Vector3().setScalar(.045*ORIGINAL_MAP_SCALE)));
const matrixError=(a:readonly number[],b:readonly number[])=>Math.max(...a.map((v,i)=>Math.abs(v-b[i])));
const vertexError=(a:readonly (readonly number[])[],b:readonly (readonly number[])[])=>Math.max(...a.map((v,i)=>Math.hypot(v[0]-b[i][0],v[1]-b[i][1],v[2]-b[i][2])));

describe('decoded receiver GI and gun resource foundation (Three adapter; no native sphere or scene-completeness claim)',()=>{
 it.each([0,333.3,1000,3000])('matches all 742 legacy CPU-skinned vertices at phase %s using an explicit compatible matrix',phase=>{
  const k=kernel(),legacy=new OriginalSoldierCollision(soldier),feet=new THREE.Vector3(12.25,-3.5,7.125),yaw=1.731;
  try{
   const actual=k.sample(phase,legacyMatrix(feet,yaw).elements),reference=legacy.evaluatePose(feet,yaw,phase).map(v=>[v.x,v.y,v.z]);
   expect(k.vertexCount).toBe(742);expect(k.triangleCount).toBe(832);expect(k.faces).toEqual(soldier.geometry.meshes.find(m=>m.resource==='GI')!.faces);
   expect(vertexError(actual.positions,reference)).toBeLessThan(1e-9);expect(Object.isFrozen(actual.positions[0])).toBe(true);
  }finally{k.dispose();legacy.dispose();}
 });
 it.each(['live-gi','pending-death-gi','corpse'] as const)('applies a nonplanar full root and resource basis exactly once for %s',layer=>{
  const resources=provider(),k=kernel(),model=gi(3000);
  try{
   const resolved=resources.resolve(model,layer),expected=k.sample(model.pose.phase,matrixFor(model).elements);
   expect(vertexError(resolved.positions,expected.positions)).toBeLessThan(1e-12);expect(resolved.worldMatrix).toEqual(new THREE.Matrix4().toArray());
   expect(resolved).toMatchObject({handle:model.handle,inWorld:true,layer,geometryProvenance:model.geometryProvenance});
   // This layer conversion changes no height or fade offset by itself.
   expect(resolved.positions).toEqual(resources.resolve(model,'live-gi').positions);
   const override=new THREE.Matrix4().compose(new THREE.Vector3(-8,4,1),new THREE.Quaternion().setFromEuler(new THREE.Euler(.2,.8,-.6)),new THREE.Vector3(.003,.004,.005));
   const explicit=resources.resolve({...model,worldMatrix:override.elements},layer),raw=k.sample(model.pose.phase,override.elements);
   expect(vertexError(explicit.positions,raw.positions)).toBeLessThan(1e-12);
  }finally{resources.dispose();k.dispose();}
 });
 it('keeps A-B-A samples and reverse query order detached from the single scratch skeleton',()=>{
  const resources=provider(),a=gi(0),b={...gi(750),handle:'gi:other',name:'other',pose:{...gi(750).pose,position:{x:-10,y:5,z:12}}};
  try{
   const first=resources.resolve(a,'live-gi'),saved=first.positions.map(p=>[...p]);resources.resolve(b,'corpse');const again=resources.resolve(a,'live-gi');
   expect(first.positions).toEqual(saved);expect(again.positions).toEqual(first.positions);expect(again.positions).not.toBe(first.positions);
   const other=provider();try{other.resolve(b,'corpse');expect(other.resolve(a,'live-gi').positions).toEqual(first.positions);}finally{other.dispose();}
  }finally{resources.dispose();}
 });
 it.each(['pistol','spas12','ak47','rg6','rpg','dragunov'])('retains raw %s vertices with an independent full gun model scale',resource=>{
  const resources=provider(),model:ReceiverModelEntry={...gi(0),kind:'gun',resource,group:'gsmokes',pose:{...gi(0).pose,scale:options.gunScale}};
  try{
   const resolved=resources.resolve(model,'held-gun'),raw=weapons.meshes.find(m=>m.resource===resource)!;
   expect(resolved.positions).toEqual(raw.positions);expect(resolved.faces).toEqual(raw.faces);expect(matrixError(resolved.worldMatrix,matrixFor(model,false).elements)).toBeLessThan(1e-12);
   expect(resolved.groupAncestry).toEqual(['gsmokes']);expect(resources.resolve(model,'dropped-gun').positions).toEqual(resolved.positions);
   const explicit=new THREE.Matrix4().makeTranslation(2,3,4);expect(resources.resolve({...model,worldMatrix:explicit.elements},'dropped-gun').worldMatrix).toEqual(explicit.elements);
  }finally{resources.dispose();}
 });
 it('composes held bone23 position and rotation independently of inherited GI scale',()=>{
  const resources=provider(),legacy=new OriginalSoldierCollision(soldier),model=gi(650);
  try{
   legacy.evaluatePose({x:0,y:0,z:0},0,model.pose.phase);
   const legacyBone=(legacy as unknown as {bones:THREE.Bone[]}).bones[22].matrixWorld;
   const bone=matrixFor(model).clone().multiply(legacyMatrix(new THREE.Vector3(),0).invert()).multiply(legacyBone);
   const position=new THREE.Vector3(),rotation=new THREE.Quaternion(),scale=new THREE.Vector3();bone.decompose(position,rotation,scale);
   rotation.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0,170*Math.PI/180,10*Math.PI/180,'ZYX')));
   position.add(new THREE.Vector3(0,-3*options.sourceScale,0).applyQuaternion(rotation));
   const held=resources.heldGunPose(model,'rifle');expect(new THREE.Vector3(held.position.x,held.position.y,held.position.z).distanceTo(position)).toBeLessThan(1e-9);
   expect(Math.abs(new THREE.Quaternion(held.rotation!.x,held.rotation!.y,held.rotation!.z,held.rotation!.w).dot(rotation))).toBeCloseTo(1,10);
   expect(held.scale).toBe(options.gunScale);expect(held.phase).toBe(0);expect(held.scale).not.toBeCloseTo(scale.x,3);expect(Object.isFrozen(held.rotation)).toBe(true);
  }finally{resources.dispose();legacy.dispose();}
 });
 it('updates the held gun from the old GI before publishing the next callback pose',()=>{
  const resources=provider(),birthPose=gi(0).pose;
  const backend:ReceiverModelBackend={cloneGI:()=>({pose:birthPose,geometryProvenance:'actual-GI-fixture'}),sphere:()=>({bspWorld:2,provenance:'declared-resource'}),
   nearestDetailedDownward:()=>({hit:null,coverage:{complete:true,missing:[],provenance:'injected-complete-query'}}),heldGunPose:resources.heldGunPose.bind(resources),
   cloneGun:()=>({pose:{position:{x:0,y:0,z:0},yaw:0,phase:0,scale:1},geometryProvenance:'actual-gun-fixture'}),reparentGunMembership:()=>true,dropYaw:()=>0};
  const world=new OriginalReceiverModelWorld(backend,{eyeHeight:1,sourceScale:options.sourceScale,goodyBspWorld:2,sceneGeneration:1,maxModels:32,maxPickups:8});
  try{
   let tx=world.begin();const born=tx.birth({actorId:'a',targetFeet:{x:2,y:3,z:4},targetYaw:0,callback:0});tx.commit();
   const old=world.freezeModels().find(m=>m.handle===born.giHandle)!,expected=resources.heldGunPose(old,'rifle');
   tx=world.begin();tx.beforeCallback('a',{position:{x:2,y:3,z:4},yaw:0,motionTime:0,weapon:'rifle'});tx.afterCallback('a',{position:{x:20,y:30,z:40},yaw:.8,motionTime:750,weapon:'rifle'});tx.commit();
   const held=world.freezeModels().find(m=>m.resource==='ak47')!;expect(held.pose.position).toEqual(expected.position);expect(held.pose.rotation).toEqual(expected.rotation);
   const current=world.freezeModels().find(m=>m.handle===born.giHandle)!;expect(current.pose.phase).toBe(750);expect(resources.heldGunPose(current,'rifle').position).not.toEqual(expected.position);
  }finally{resources.dispose();}
 });
 it('rejects invalid budgets, missing guns, malformed skin and invalid poses before replacing valid resources',()=>{
  expect(()=>new OriginalReceiverActorResources(soldier,weapons,{...options,maxVertices:741})).toThrow();expect(()=>new OriginalReceiverActorResources(soldier,{meshes:weapons.meshes.filter(m=>m.resource!=='ak47')},options)).toThrow();
  expect(()=>new OriginalReceiverActorResources(soldier,weapons,{...options,giResourceOrientation:{x:0,y:0,z:0,w:0}})).toThrow();
  const corrupt=structuredClone(soldier);corrupt.geometry.meshes.find(m=>m.resource==='GI')!.bone_indices[0][0]=25;expect(()=>new OriginalReceiverSoldierResource(corrupt,options)).toThrow();
  const duplicateRig=structuredClone(soldier);duplicateRig.rigMotion.rigs.push(duplicateRig.rigMotion.rigs.find(r=>r.name==='GI')!);expect(()=>new OriginalReceiverSoldierResource(duplicateRig,options)).toThrow();
  const duplicateMotion=structuredClone(soldier);duplicateMotion.rigMotion.motions.push(duplicateMotion.rigMotion.motions.find(m=>m.name==='GI')!);expect(()=>new OriginalReceiverSoldierResource(duplicateMotion,options)).toThrow();
  const overflow=structuredClone(soldier);overflow.rigMotion.rigs.find(r=>r.name==='GI')!.bones[0].quaternion_xyzw=[1e308,0,0,1];expect(()=>new OriginalReceiverSoldierResource(overflow,options)).toThrow();
  expect(()=>new OriginalReceiverSoldierResource(soldier,{...options,maxMotionKeys:1})).toThrow();
  const resources=provider(),model=gi();try{
   expect(()=>resources.resolve({...model,pose:{...model.pose,phase:-1}},'live-gi')).toThrow();expect(()=>resources.resolve(model,'held-gun')).toThrow();
   expect(()=>resources.resolve({...model,worldMatrix:[1,2,3]},'live-gi')).toThrow();expect(resources.resolve(model,'live-gi').positions).toHaveLength(742);
  }finally{resources.dispose();}
 });
 it('owns decoded geometry, skin, rig, motion, weapons and options independently of later caller mutation',()=>{
  const source=structuredClone(soldier),guns=structuredClone(weapons),configuration={...options,giResourceOrientation:{...options.giResourceOrientation}},resources=new OriginalReceiverActorResources(source,guns,configuration);
  const model=gi(333.3),gun:ReceiverModelEntry={...gi(0),handle:'gun:ownership',kind:'gun',group:'gsmokes',resource:'ak47',pose:{...gi(0).pose,scale:1.3}};
  try{
   const resolved=resources.resolve(model,'live-gi'),held=resources.heldGunPose(model,'rifle'),weapon=resources.resolve(gun,'held-gun');
   const before={gi:structuredClone(resolved.positions),held:structuredClone(held),gun:structuredClone(weapon.positions),matrix:structuredClone(weapon.worldMatrix)};
   const mesh=source.geometry.meshes.find(m=>m.resource==='GI')!,rig=source.rigMotion.rigs.find(r=>r.name==='GI')!,motion=source.rigMotion.motions.find(m=>m.name==='GI')!;
   mesh.positions[0][0]+=999;mesh.bone_weights[0][0]=0;mesh.bone_indices[0][0]=24;rig.bones[0].displacement[0]+=999;
   const key=motion.tracks.find(t=>t.keys.length>0)!.keys[0];key.time=999;key.position[0]+=999;
   guns.meshes.find(m=>m.resource==='ak47')!.positions[0][0]+=999;configuration.giResourceOrientation.x=0;configuration.giResourceOrientation.w=0;configuration.sourceScale=999;configuration.gunScale=999;configuration.maxVertices=1;
   expect(resources.resolve(model,'live-gi').positions).toEqual(before.gi);expect(resources.heldGunPose(model,'rifle')).toEqual(before.held);
   const again=resources.resolve(gun,'held-gun');expect(again.positions).toEqual(before.gun);expect(again.worldMatrix).toEqual(before.matrix);
   expect(resolved.positions).toEqual(before.gi);expect(held).toEqual(before.held);expect(weapon.positions).toEqual(before.gun);expect(weapon.worldMatrix).toEqual(before.matrix);
  }finally{resources.dispose();}
 });
 it('rejects sampling and model resolution after idempotent disposal',()=>{
  const k=kernel();k.dispose();k.dispose();expect(()=>k.sample(0,new THREE.Matrix4().elements)).toThrow('disposed');
  const resources=provider();resources.dispose();resources.dispose();expect(()=>resources.resolve(gi(),'live-gi')).toThrow('disposed');expect(()=>resources.heldGunPose(gi(),'rifle')).toThrow('disposed');
 });
});
