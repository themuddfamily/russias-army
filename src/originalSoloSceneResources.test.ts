import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {describe,expect,it,vi} from 'vitest';
import {createOriginalSoloSceneResources,type OriginalSoloSceneResourcesOptions} from './originalSoloSceneResources';
import {createOriginalSoldierResources,type OriginalSoldierAssets} from './originalSoldier';
import {ORIGINAL_WEAPON_TEXTURES,type OriginalWeaponGeometryData} from './originalWeapons';
import {createOriginalCombatEffectResources} from './originalCombatEffectPresentation';
import {createOriginalExplosionResources} from './originalExplosionPresentation';
import {createOriginalSoloTransientRendererBinding} from './originalSoloTransientResources';
import {captureOriginalSoloActorDropYawPlan} from './originalSoloActorLifecycle';
import {OriginalReceiverActorResources} from '../shared/originalReceiverActorResources';
import {OriginalReceiverTransientResources} from '../shared/originalReceiverTransientResources';
import {ORIGINAL_MAP_SCALE} from '../shared/originalMapProfile';
import {ORIGINAL_COMBAT_PLANE_SIZE} from '../shared/originalCombatEffects';
import {ORIGINAL_WEAPON_UNIT_SCALE} from './originalWeaponPresentation';

// Real decoded resources, CPU textures and explicit prototype policies. This
// assembly test neither starts a browser nor establishes complete scene/native
// clone-default, shader, skin or ray fidelity.
const base=new URL('../public/assets/',import.meta.url);
const geometry=JSON.parse(readFileSync(new URL('original-soldier/geometry.json',base),'utf8')) as OriginalSoldierAssets['geometry'];
const rigMotion=JSON.parse(readFileSync(new URL('original-soldier/rig-motion.json',base),'utf8')) as OriginalSoldierAssets['rigMotion'];
const weapons=JSON.parse(readFileSync(new URL('original-weapons/geometry.json',base),'utf8')) as OriginalWeaponGeometryData;
const families={pistol:'mfpistol',shotgun:'mfspas12',rifle:'mfak47',sniper:'mfdragunov'} as const;
const basis=new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI/2,0,0)).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),-Math.PI/2));
function fixture(sourceScale=ORIGINAL_MAP_SCALE){
 const texture=new THREE.Texture(),textures=new Map(ORIGINAL_WEAPON_TEXTURES.map(name=>[name,new THREE.Texture()]));
 const soldierResources=createOriginalSoldierResources({geometry,rigMotion,texture},{geometry:weapons,textures},{resourceBindingId:'scene-actor-generation-42'});
 const combat=createOriginalCombatEffectResources({spatter:new THREE.Texture(),decalspas:new THREE.Texture(),decal:new THREE.Texture(),pufft:new THREE.Texture()}),explosion=createOriginalExplosionResources({grenade:new THREE.Texture(),rocket:new THREE.Texture()});
 const material=new THREE.MeshBasicMaterial({map:explosion.textures.rocket}),root=new THREE.Group();root.position.set(2,3,4);root.rotation.set(.2,.3,-.1);root.scale.setScalar(1.3);
 const plane=new THREE.Mesh(combat.geometry,material);plane.position.set(1,2,-3);plane.scale.setScalar(.8);root.add(plane);
 const muzzles={} as Record<keyof typeof families,OriginalSoloSceneResourcesOptions['muzzles']['pistol']>;
 for(const weapon of Object.keys(families) as (keyof typeof families)[]){const mesh=new THREE.Mesh(soldierResources.gunGeometries.get(families[weapon])!,soldierResources.gunMaterials.get('mfmachinegun')!);mesh.position.set(.2,.4,-.6);mesh.rotation.set(-.3,.1,.2);mesh.scale.setScalar(.9);root.add(mesh);muzzles[weapon]={mesh,phase:17,geometryProvenance:`actual decoded ${families[weapon]}`,inWorld:weapon==='rifle',group:'gsmokes',groupAncestry:['gsmokes']};}
 root.updateMatrixWorld(true);
 const renderToWorld=new THREE.Matrix4().compose(new THREE.Vector3(11,12,13),new THREE.Quaternion().setFromEuler(new THREE.Euler(.3,.1,-.2)),new THREE.Vector3(1,1,1)).toArray();
 const transientBinding=createOriginalSoloTransientRendererBinding({soldierResources,combatResources:combat,explosionResources:explosion,planeGeometry:combat.geometry,planeWidthWorld:ORIGINAL_COMBAT_PLANE_SIZE,planeGeometryProvenance:'actual application WORLD plane',sourceScale,provenance:'actual scene FX generation',sidedness:'double',resourceBindingId:'scene-FX-generation-42',textureBindingId:'scene-texture-generation-42',nearFilter:THREE.LinearFilter,maxVertices:100000,maxFaces:100000,maxResourceEntries:256,maxTextChars:8192});
 const seed={pose:{position:{x:2,y:3,z:4},yaw:.37,phase:77,scale:1},geometryProvenance:'explicit decoded actor clone'};
 const plan=captureOriginalSoloActorDropYawPlan(1,[{actorId:'a',random36:9}],{maxEntries:8,maxTextChars:8192});
 const options:OriginalSoloSceneResourcesOptions={soldierResources,weapons,transientBinding,renderToWorld,
  actor:{sourceScale,giResourceOrientation:{x:basis.x,y:basis.y,z:basis.z,w:basis.w},gunScale:1,maxVertices:100000,maxFaces:100000,maxMotionKeys:100000,maxMeshes:256,maxDescriptorTextChars:8192,provenance:'actual scene actor generation',sidedness:'double'},
  actorLifecycle:{gi:seed,guns:{pistol:seed,shotgun:seed,rifle:seed,launcher:seed,rpg:seed,sniper:seed},parentRestoresMembership:true,readDropYawPlan:()=>plan,maxTextChars:8192},
  transientQuery:{maxVertices:100000,maxFaces:100000,maxMeshes:256,maxTextChars:8192},plane:{mesh:plane,phase:17,geometryProvenance:'actual application WORLD plane',inWorld:false},muzzles,
  transientPolicy:{initialShader:{handle:'observed-initial-plane-shader',texture:'bangrocket',recycled:false,textureScale:{x:1,y:1,z:1},texturePosition:{x:0,y:0,z:0},blend:100,emissiveWhite:true},pointAtPolicy:'copy-plane-positive-z',omittedUpPolicy:'copy-negative-z',parallelUpPolicy:'copy-x',explicitUpPolicy:'copy-three-lookat',selfRotatePolicy:'copy-local-xyz',coincidentPolicy:'retain',maxTextChars:8192}};
 return {options,root,plane,material,soldierResources,combat,explosion,texture,textures,dispose(){soldierResources.dispose();material.dispose();combat.dispose();explosion.dispose();texture.dispose();for(const value of textures.values())value.dispose();}};
}

describe('paired actor and FX resources for a fresh Solo scene life',()=>{
 it('acquires both real providers and preserves actual pre-scaled muzzle template matrices and explicit membership',()=>{
  const f=fixture(),saved=[f.plane,...Object.values(f.options.muzzles).map(p=>p.mesh)].map(mesh=>({mesh,parent:mesh.parent,matrix:mesh.matrix.toArray(),world:mesh.matrixWorld.toArray(),visible:mesh.visible}));
  const scene=createOriginalSoloSceneResources(f.options);try{
   expect(scene.actorDescriptor.resourceBindingId).toBe(f.soldierResources.resourceBindingId);expect(scene.transientDescriptor.resourceBindingId).toBe(f.options.transientBinding.resources.resourceBindingId);
   expect(scene.muzzleTemplates).toHaveLength(4);expect(Object.isFrozen(scene.muzzleTemplates)).toBe(true);
   for(const weapon of Object.keys(families) as (keyof typeof families)[]){
    const template=scene.muzzleTemplates.find(t=>t.resource===families[weapon])!,prototype=f.options.muzzles[weapon];
    const expected=new THREE.Matrix4().fromArray(f.options.renderToWorld).multiply(prototype.mesh.matrixWorld).scale(new THREE.Vector3().setScalar(ORIGINAL_WEAPON_UNIT_SCALE)).toArray();
    expect(template.worldMatrix).toEqual(expected);expect(template.groupAncestry).toEqual(['gsmokes']);expect(template.inWorld).toBe(weapon==='rifle');expect(Object.isFrozen(template.worldMatrix)).toBe(true);
    const clone=scene.transientBackend.cloneMuzzle(`clone-${weapon}`,weapon);expect(clone.inWorld).toBe(template.inWorld);expect(clone.pose.phase).toBe(17);expect(clone.pose.scale).toBeCloseTo(1.3*.9,12);
   }
   const plane=scene.transientBackend.clonePlane('clone-plane',ORIGINAL_COMBAT_PLANE_SIZE);expect(plane.inWorld).toBe(false);expect(plane.initialShader!.texture).toBe('bangrocket');
   expect(scene.actorLifecycle.cloneGI('fresh-GI').pose.phase).toBe(77);
   for(const s of saved){expect(s.mesh.parent).toBe(s.parent);expect(s.mesh.matrix.toArray()).toEqual(s.matrix);expect(s.mesh.matrixWorld.toArray()).toEqual(s.world);expect(s.mesh.visible).toBe(s.visible);}
 }finally{scene.release();f.dispose();}
 });
 it('normalizes a non-UNIT provider scale so RAW clones still match actual pre-scaled borrowed vertices',()=>{
  const f=fixture(ORIGINAL_MAP_SCALE*3),scene=createOriginalSoloSceneResources(f.options);try{
   for(const weapon of Object.keys(families) as (keyof typeof families)[]){
    const prototype=f.options.muzzles[weapon],clone=scene.transientBackend.cloneMuzzle(`clone-${weapon}`,weapon);
    expect(clone.pose.scale).toBeCloseTo(1.3*.9/3,12);
    const queried=scene.transientQueryResources.resolve({handle:`clone-${weapon}`,name:`clone-${weapon}`,resource:families[weapon],kind:'transient',group:'gsmokes',pose:clone.pose,inWorld:clone.inWorld,geometryProvenance:clone.geometryProvenance},ORIGINAL_COMBAT_PLANE_SIZE),world=new THREE.Matrix4().fromArray(queried.worldMatrix),renderWorld=new THREE.Matrix4().fromArray(f.options.renderToWorld).multiply(prototype.mesh.matrixWorld),buffer=prototype.mesh.geometry.getAttribute('position');
    let worst=0;for(let i=0;i<buffer.count;i++)worst=Math.max(worst,new THREE.Vector3().fromArray(queried.positions[i]).applyMatrix4(world).distanceTo(new THREE.Vector3().fromBufferAttribute(buffer,i).applyMatrix4(renderWorld)));
    expect(worst).toBeLessThan(2e-5);
   }
  }finally{scene.release();f.dispose();}
 });
 it('requires exact scene/gsmokes ancestry parity and accepts the original smokes alias case-insensitively',()=>{
  const f=fixture();try{
   expect(()=>createOriginalSoloSceneResources({...f.options,muzzles:{...f.options.muzzles,pistol:{...f.options.muzzles.pistol,groupAncestry:['private-gsmokes']}}})).toThrow(/ancestry mismatch/);
   expect(()=>createOriginalSoloSceneResources({...f.options,muzzles:{...f.options.muzzles,pistol:{...f.options.muzzles.pistol,group:'scene'}}})).toThrow(/ancestry mismatch/);
   const scene=createOriginalSoloSceneResources({...f.options,muzzles:{...f.options.muzzles,pistol:{...f.options.muzzles.pistol,groupAncestry:['SmOkEs','private-root']}}});
   try{expect(scene.muzzleTemplates.find(t=>t.resource==='mfpistol')!.groupAncestry).toEqual(['SmOkEs','private-root']);}finally{scene.release();}
  }finally{f.dispose();}
 });
 it('rejects explicit actor/FX scale disagreement before either provider is acquired',()=>{
  const f=fixture(),dispose=vi.spyOn(OriginalReceiverActorResources.prototype,'dispose');try{
   expect(()=>createOriginalSoloSceneResources({...f.options,actor:{...f.options.actor,sourceScale:ORIGINAL_MAP_SCALE*2}})).toThrow(/scale/);expect(dispose).not.toHaveBeenCalled();
  }finally{dispose.mockRestore();f.dispose();}
 });
 it('rejects a foreign prototype geometry even if its content and provenance match',()=>{
  const f=fixture(),foreign=f.plane.geometry.clone();try{
   const plane={...f.options.plane,mesh:new THREE.Mesh(foreign,f.material)};plane.mesh.updateMatrixWorld(true);
   expect(()=>createOriginalSoloSceneResources({...f.options,plane})).toThrow(/Foreign/);
  }finally{foreign.dispose();f.dispose();}
 });
 it('rejects an initial shader texture observation that disagrees with the actual plane material',()=>{
  const f=fixture();try{
   expect(()=>createOriginalSoloSceneResources({...f.options,transientPolicy:{...f.options.transientPolicy,initialShader:{...f.options.transientPolicy.initialShader!,texture:'banggrenade'}}})).toThrow(/shader texture/);
  }finally{f.dispose();}
 });
 it('rejects aliased prototypes and a changed plane geometry provenance',()=>{
  const f=fixture();try{
   expect(()=>createOriginalSoloSceneResources({...f.options,muzzles:{...f.options.muzzles,pistol:f.options.muzzles.rifle}})).toThrow(/Foreign|aliased/);
   expect(()=>createOriginalSoloSceneResources({...f.options,plane:{...f.options.plane,geometryProvenance:'foreign plane'}})).toThrow(/provenance/);
  }finally{f.dispose();}
 });
 it('cleans up the acquired actor provider if subsequent actual FX pairing fails',()=>{
  const f=fixture(),dispose=vi.spyOn(OriginalReceiverActorResources.prototype,'dispose'),borrowed=vi.spyOn(f.soldierResources.geometry,'dispose');
  const mismatched={...weapons,meshes:weapons.meshes.map(mesh=>mesh.resource==='mfpistol'?{...mesh,positions:mesh.positions.map((p,i)=>i===0?[p[0]+1,p[1],p[2]]:p)}:mesh)};
  try{
   expect(()=>createOriginalSoloSceneResources({...f.options,weapons:mismatched})).toThrow(/Foreign.*muzzle/);expect(dispose).toHaveBeenCalledTimes(1);expect(borrowed).not.toHaveBeenCalled();
  }finally{dispose.mockRestore();borrowed.mockRestore();f.dispose();}
 });
 it('cleans up both acquired providers if lifecycle construction rejects its captured seed',()=>{
  const f=fixture(),actorDispose=vi.spyOn(OriginalReceiverActorResources.prototype,'dispose'),fxDispose=vi.spyOn(OriginalReceiverTransientResources.prototype,'dispose');try{
   const lifecycle=f.options.actorLifecycle;if(!('gi' in lifecycle))throw Error('Expected explicit fixture seeds');
   const invalid={...lifecycle,gi:{...lifecycle.gi,pose:{...lifecycle.gi.pose,scale:0}}};
   expect(()=>createOriginalSoloSceneResources({...f.options,actorLifecycle:invalid})).toThrow(/pose/);expect(actorDispose).toHaveBeenCalledTimes(1);expect(fxDispose).toHaveBeenCalledTimes(1);
  }finally{actorDispose.mockRestore();fxDispose.mockRestore();f.dispose();}
 });
 it('preserves construction and cleanup errors when partially acquired resources cannot release',()=>{
  const f=fixture(),cleanupError=Error('captured cleanup failure');let acquired:OriginalReceiverActorResources|undefined;
  const dispose=vi.spyOn(OriginalReceiverActorResources.prototype,'dispose').mockImplementation(function(this:OriginalReceiverActorResources){acquired=this;throw cleanupError;});
  const mismatched={...weapons,meshes:weapons.meshes.map(mesh=>mesh.resource==='mfpistol'?{...mesh,positions:mesh.positions.map((p,i)=>i===0?[p[0]+1,p[1],p[2]]:p)}:mesh)};
  try{
   let thrown:unknown;try{createOriginalSoloSceneResources({...f.options,weapons:mismatched});}catch(error){thrown=error;}
   expect(thrown).toBeInstanceOf(AggregateError);const error=thrown as AggregateError;
   expect(error.errors[0].message).toMatch(/Foreign.*muzzle/);expect(error.cause).toBe(error.errors[0]);expect(error.errors[1]).toBeInstanceOf(AggregateError);expect((error.errors[1] as AggregateError).errors).toEqual([cleanupError]);
  }finally{dispose.mockRestore();acquired?.dispose();f.dispose();}
 });
 it('attempts both provider releases even when they throw, then remains closed and idempotent',()=>{
  const f=fixture(),scene=createOriginalSoloSceneResources(f.options),actorError=Error('actor release failed'),fxError=Error('FX release failed');
  const actorDispose=vi.spyOn(scene.actorQueryResources,'dispose').mockImplementation(()=>{throw actorError;}),fxDispose=vi.spyOn(scene.transientQueryResources,'dispose').mockImplementation(()=>{throw fxError;});
  try{
   let thrown:unknown;try{scene.release();}catch(error){thrown=error;}
   expect(thrown).toBeInstanceOf(AggregateError);expect((thrown as AggregateError).errors).toEqual([fxError,actorError]);expect(actorDispose).toHaveBeenCalledTimes(1);expect(fxDispose).toHaveBeenCalledTimes(1);
   expect(()=>scene.release()).not.toThrow();expect(actorDispose).toHaveBeenCalledTimes(1);expect(fxDispose).toHaveBeenCalledTimes(1);expect(()=>scene.actorLifecycle.cloneGI('closed')).toThrow(/released/);expect(()=>scene.transientBackend.cloneMuzzle('closed','rifle')).toThrow(/released/);
  }finally{actorDispose.mockRestore();fxDispose.mockRestore();scene.actorQueryResources.dispose();scene.transientQueryResources.dispose();f.dispose();}
 });
 it('releases both private providers once, blocks released adapters and leaves every borrowed asset alive',()=>{
  const f=fixture(),scene=createOriginalSoloSceneResources(f.options),actorDispose=vi.spyOn(scene.actorQueryResources,'dispose'),fxDispose=vi.spyOn(scene.transientQueryResources,'dispose');
  const borrowed=[f.soldierResources.geometry,f.soldierResources.material,...f.soldierResources.gunGeometries.values(),...f.soldierResources.gunMaterials.values(),f.combat.geometry,f.explosion.geometry,f.material,f.texture,...f.textures.values(),...Object.values(f.combat.textures),...Object.values(f.explosion.textures)].map(resource=>vi.spyOn(resource,'dispose'));
  try{
   scene.release();scene.release();expect(actorDispose).toHaveBeenCalledTimes(1);expect(fxDispose).toHaveBeenCalledTimes(1);for(const spy of borrowed)expect(spy).not.toHaveBeenCalled();
   expect(()=>scene.actorQueryResources.readResourceDescriptor()).toThrow(/disposed/);expect(()=>scene.transientQueryResources.readResourceDescriptor()).toThrow(/disposed/);
   expect(()=>scene.actorLifecycle.cloneGI('after-release')).toThrow(/released/);expect(()=>scene.actorLifecycle.cloneGun('after-release','rifle')).toThrow(/released/);
   expect(()=>scene.transientBackend.clonePlane('after-release',ORIGINAL_COMBAT_PLANE_SIZE)).toThrow(/released/);expect(()=>scene.transientBackend.cloneMuzzle('after-release','rifle')).toThrow(/released/);
  }finally{scene.release();actorDispose.mockRestore();fxDispose.mockRestore();for(const spy of borrowed)spy.mockRestore();f.dispose();}
 });
});
