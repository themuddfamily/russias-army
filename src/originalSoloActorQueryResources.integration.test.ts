import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {describe,expect,it,vi} from 'vitest';
import {OriginalSoldier,createOriginalSoldierResources,type OriginalSoldierAssets} from './originalSoldier';
import {ORIGINAL_WEAPON_TEXTURES,type OriginalWeaponGeometryData} from './originalWeapons';
import {ORIGINAL_WEAPON_UNIT_SCALE} from './originalWeaponPresentation';
import {createOriginalSoloActorQueryResources} from './originalSoloActorQueryResources';
import {createOriginalSoloActorLifecycle,captureOriginalSoloActorDropYawPlan} from './originalSoloActorLifecycle';
import {OriginalReceiverModelWorld,type ReceiverModelEntry,type ReceiverModelPose} from '../shared/originalReceiverModelWorld';
import {ORIGINAL_MAP_SCALE} from '../shared/originalMapProfile';

// Loaded only inside root's bounded test process. CPU texture handles and Three
// arithmetic establish pack pairing, not native skinning, ray or raster parity.
const base=new URL('../public/assets/',import.meta.url);
const soldierGeometry=JSON.parse(readFileSync(new URL('original-soldier/geometry.json',base),'utf8')) as OriginalSoldierAssets['geometry'];
const rigMotion=JSON.parse(readFileSync(new URL('original-soldier/rig-motion.json',base),'utf8')) as OriginalSoldierAssets['rigMotion'];
const weapons=JSON.parse(readFileSync(new URL('original-weapons/geometry.json',base),'utf8')) as OriginalWeaponGeometryData;
const sourceScale=ORIGINAL_MAP_SCALE;
const basis=new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI/2,0,0)).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),-Math.PI/2));
const options={sourceScale,giResourceOrientation:{x:basis.x,y:basis.y,z:basis.z,w:basis.w},gunScale:1,maxVertices:100000,maxFaces:100000,maxMotionKeys:100000,maxMeshes:256,maxDescriptorTextChars:8192,provenance:'actual-decoded-actor-query-renderer-pair',sidedness:'double' as const};
const pose=(phase=77):ReceiverModelPose=>({position:{x:2,y:3,z:4},yaw:.37,phase,scale:1});
function fixture(){
 const texture=new THREE.Texture(),textures=new Map(ORIGINAL_WEAPON_TEXTURES.map(name=>[name,new THREE.Texture()]));
 const resources=createOriginalSoldierResources({geometry:soldierGeometry,rigMotion,texture},{geometry:weapons,textures},{resourceBindingId:'decoded-actor-generation-27'});
 return {resources,texture,textures,dispose(){resources.dispose();texture.dispose();for(const value of textures.values())value.dispose();}};
}
function matrix(model:Readonly<ReceiverModelEntry>){
 return new THREE.Matrix4().compose(new THREE.Vector3(model.pose.position.x,model.pose.position.y,model.pose.position.z),new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),model.pose.yaw).multiply(basis),new THREE.Vector3().setScalar(model.pose.scale*sourceScale));
}
function close(a:THREE.Vector3,b:THREE.Vector3,digits=8){for(const axis of ['x','y','z'] as const)expect(a[axis]).toBeCloseTo(b[axis],digits);}
function world(resources:ReturnType<typeof createOriginalSoloActorQueryResources>){
 const seed={pose:pose(0),geometryProvenance:'explicit-decoded-gun-clone-policy'};
 const plan=captureOriginalSoloActorDropYawPlan(1,[{actorId:'a',random36:9}],{maxEntries:8,maxTextChars:8192});
 const lifecycle=createOriginalSoloActorLifecycle({actorResources:resources,sourceScale,gi:{pose:pose(),geometryProvenance:'explicit-decoded-GI-clone-policy'},guns:{pistol:seed,shotgun:seed,rifle:seed,launcher:seed,rpg:seed,sniper:seed},parentRestoresMembership:true,readDropYawPlan:()=>plan,maxTextChars:8192});
 const bank=new OriginalReceiverModelWorld({...lifecycle,nearestDetailedDownward:()=>({hit:null,coverage:{complete:false,missing:['map-and-transients'],provenance:'actor-only-pair-fixture'}})},{sourceScale,eyeHeight:85*sourceScale,goodyBspWorld:2,sceneGeneration:27,maxModels:64,maxPickups:16,requireCompleteCoverage:false});
 return {bank,lifecycle};
}
function snapshot(resources:ReturnType<typeof createOriginalSoldierResources>){
 return [resources.geometry,...resources.gunGeometries.values()].map(geometry=>({geometry,index:geometry.index?Array.from(geometry.index.array):null,attributes:Object.fromEntries(Object.entries(geometry.attributes).map(([name,value])=>[name,Array.from(value.array)]))}));
}

describe('actual decoded actor renderer pack paired to lifecycle CPU queries',()=>{
 it('attests the renderer generation and leaves all borrowed buffers and textures unchanged',()=>{
  const f=fixture(),before=snapshot(f.resources),textureVersion=f.texture.version;
  const query=createOriginalSoloActorQueryResources(f.resources,weapons,options);
  try{
   expect(query.readResourceDescriptor()).toEqual({sourceScale,giResourceOrientation:options.giResourceOrientation,resourceBindingId:f.resources.resourceBindingId,provenance:options.provenance});
   expect(snapshot(f.resources)).toEqual(before);expect(f.texture.version).toBe(textureVersion);
  }finally{query.dispose();f.dispose();}
 });
 it('matches actual rendered GI skin vertices at birth, moved pose and corpse phase without another unit conversion',()=>{
  const f=fixture(),query=createOriginalSoloActorQueryResources(f.resources,weapons,options),actor=new OriginalSoldier(f.resources),{bank}=world(query);
  const outer=new THREE.Group();outer.position.set(11,-5,7);outer.rotation.set(.12,-.3,.24);outer.scale.set(2,3,.5);outer.add(actor.group);
  function check(){
   const model=bank.freezeModels().find(value=>value.kind==='gi')!,resolved=query.resolve(model,model.pose.phase>=3000?'corpse':'live-gi');
   actor.adoptSourceGIWorld(matrix(model),model.pose.phase,model.inWorld);actor.group.updateWorldMatrix(true,true);actor.skeleton.update();
   const position=actor.mesh.geometry.getAttribute('position');
   for(let i=0;i<position.count;i++){
    const rendered=new THREE.Vector3().fromBufferAttribute(position,i);actor.mesh.applyBoneTransform(i,rendered).applyMatrix4(actor.mesh.matrixWorld);
    close(rendered,new THREE.Vector3().fromArray(resolved.positions[i]));
   }
   expect(resolved.positions).toHaveLength(742);expect(resolved.faces).toHaveLength(832);
  }
  try{
   let tx=bank.begin();tx.birth({actorId:'a',callback:0,targetFeet:{x:5,y:12,z:-4},targetYaw:.72});tx.commit();check();
   tx=bank.begin();tx.beforeCallback('a',{position:{x:20,y:30,z:40},yaw:.72,motionTime:750,weapon:'rifle'});tx.afterCallback('a',{position:{x:20,y:30,z:40},yaw:.72,motionTime:750,weapon:'rifle'});tx.commit();check();
   tx=bank.begin();tx.detach('a',{position:{x:20,y:30,z:40},yaw:.72,motionTime:750,weapon:'rifle'},1);tx.advanceCorpses();tx.commit();check();
  }finally{bank.reset();actor.dispose();query.dispose();f.dispose();}
 });
 it('holds the gun from the actual old rendered bone23, independent of the newly sampled GI',()=>{
  const f=fixture(),query=createOriginalSoloActorQueryResources(f.resources,weapons,options),actor=new OriginalSoldier(f.resources),{bank}=world(query);
  try{
   let tx=bank.begin();const born=tx.birth({actorId:'a',callback:0,targetFeet:{x:5,y:12,z:-4},targetYaw:.72});tx.commit();
   const old=bank.freezeModels().find(value=>value.handle===born.giHandle)!;actor.adoptSourceGIWorld(matrix(old),old.pose.phase,true);actor.group.updateWorldMatrix(true,true);
   const p=new THREE.Vector3(),q=new THREE.Quaternion(),s=new THREE.Vector3();actor.bones[22].matrixWorld.decompose(p,q,s);
   q.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0,170*Math.PI/180,10*Math.PI/180,'ZYX')));p.add(new THREE.Vector3(0,-3*sourceScale,0).applyQuaternion(q));
   tx=bank.begin();tx.beforeCallback('a',{position:{x:20,y:30,z:40},yaw:.72,motionTime:750,weapon:'rifle'});tx.afterCallback('a',{position:{x:20,y:30,z:40},yaw:.72,motionTime:750,weapon:'rifle'});tx.commit();
   const gun=bank.freezeModels().find(value=>value.resource==='ak47')!,held=gun.pose;
   close(new THREE.Vector3(held.position.x,held.position.y,held.position.z),p);
   expect(Math.abs(q.dot(new THREE.Quaternion(held.rotation!.x,held.rotation!.y,held.rotation!.z,held.rotation!.w)))).toBeCloseTo(1,10);expect(held.scale).toBe(1);
   const raw=query.resolve(gun,'held-gun'),borrowed=f.resources.gunGeometries.get('ak47')!.getAttribute('position');
   const rawWorld=new THREE.Matrix4().fromArray(raw.worldMatrix),rendererWorld=rawWorld.clone().multiply(new THREE.Matrix4().makeScale(1/ORIGINAL_WEAPON_UNIT_SCALE,1/ORIGINAL_WEAPON_UNIT_SCALE,1/ORIGINAL_WEAPON_UNIT_SCALE));
   // The renderer pack stores raw*UNIT in Float32; undoing UNIT therefore has
   // that one documented quantization error, unlike the GI skin comparison.
   for(const i of [0,Math.floor(borrowed.count/2),borrowed.count-1])close(new THREE.Vector3().fromArray(raw.positions[i]).applyMatrix4(rawWorld),new THREE.Vector3().fromBufferAttribute(borrowed,i).applyMatrix4(rendererWorld),5);
  }finally{bank.reset();actor.dispose();query.dispose();f.dispose();}
 });
 it.each(['GI-position','GI-index','GI-skinIndex','GI-skinWeight','gun-position','gun-index'] as const)('rejects mutated borrowed %s despite the unchanged decoded source and generation',mutation=>{
  const f=fixture();try{
   const geometry=mutation.startsWith('gun')?f.resources.gunGeometries.get('ak47')!:f.resources.geometry;
   if(mutation.endsWith('index'))geometry.index!.array[0]=(geometry.index!.array[0]+1)%geometry.getAttribute('position').count;
   else{const name=mutation==='GI-skinIndex'?'skinIndex':mutation==='GI-skinWeight'?'skinWeight':'position';const attribute=geometry.getAttribute(name) as THREE.BufferAttribute;attribute.array[0]+=mutation==='GI-skinWeight'?.25:1;}
   expect(()=>createOriginalSoloActorQueryResources(f.resources,weapons,options)).toThrow();
  }finally{f.dispose();}
 });
 it('disposes one private life independently while another life keeps the shared renderer generation usable',()=>{
  const f=fixture(),before=snapshot(f.resources),geometryDispose=vi.spyOn(f.resources.geometry,'dispose'),materialDispose=vi.spyOn(f.resources.material,'dispose'),textureDispose=vi.spyOn(f.texture,'dispose');
  const borrowedDisposals=[...f.resources.gunGeometries.values(),...f.resources.gunMaterials.values(),...f.textures.values()].map(resource=>vi.spyOn(resource,'dispose'));
  const first=createOriginalSoloActorQueryResources(f.resources,weapons,options),second=createOriginalSoloActorQueryResources(f.resources,weapons,options),one=world(first),two=world(second);
  try{
   for(const fixture of [one,two]){const tx=fixture.bank.begin();tx.birth({actorId:'a',callback:0,targetFeet:{x:5,y:12,z:-4},targetYaw:.72});tx.commit();}
   const gi=two.bank.freezeModels().find(value=>value.kind==='gi')!,expected=second.resolve(gi,'live-gi');
   one.bank.reset();first.dispose();first.dispose();expect(()=>first.resolve(gi,'live-gi')).toThrow(/disposed/);
   expect(second.resolve(gi,'live-gi')).toEqual(expected);expect(second.readResourceDescriptor()!.resourceBindingId).toBe(f.resources.resourceBindingId);
   expect(snapshot(f.resources)).toEqual(before);expect(geometryDispose).not.toHaveBeenCalled();expect(materialDispose).not.toHaveBeenCalled();expect(textureDispose).not.toHaveBeenCalled();
   for(const dispose of borrowedDisposals)expect(dispose).not.toHaveBeenCalled();
  }finally{one.bank.reset();two.bank.reset();first.dispose();second.dispose();geometryDispose.mockRestore();materialDispose.mockRestore();textureDispose.mockRestore();for(const dispose of borrowedDisposals)dispose.mockRestore();f.dispose();}
 });
});
