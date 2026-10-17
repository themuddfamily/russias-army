import * as THREE from 'three';
import {readFileSync} from 'node:fs';
import {describe,expect,it,vi} from 'vitest';
import {captureOriginalSoloTransientSeed,createOriginalSoloTransientBackend} from './originalSoloTransientBackend';
import {createOriginalWeaponGeometry,type OriginalWeaponGeometryData} from './originalWeapons';
import {createOriginalCombatEffectResources} from './originalCombatEffectPresentation';
import {createOriginalExplosionResources} from './originalExplosionPresentation';
import {ORIGINAL_COMBAT_PLANE_SIZE} from '../shared/originalCombatEffects';
import {ORIGINAL_WEAPON_UNIT_SCALE} from './originalWeaponPresentation';
import {ORIGINAL_MAP_SCALE} from '../shared/originalMapProfile';
import type {OriginalSoldierResources} from './originalSoldier';
import {createOriginalSoloTransientRendererBinding,createOriginalSoloTransientQueryResources} from './originalSoloTransientResources';
import {OriginalReceiverTransientPresentation} from './originalReceiverTransientPresentation';
import {OriginalReceiverTransientWorld,type OriginalReceiverTransientBirth,type OriginalReceiverTransientInitialShader,type OriginalReceiverTransientCloneContext} from '../shared/originalReceiverTransientWorld';
import type {ReceiverModelPose} from '../shared/originalReceiverModelWorld';
import type {ReceiverTransientCheckpoint} from '../shared/originalReceiverTransientCheckpoint';

const source=JSON.parse(readFileSync(new URL('../public/assets/original-weapons/geometry.json',import.meta.url),'utf8')) as OriginalWeaponGeometryData;
const families={pistol:'mfpistol',shotgun:'mfspas12',rifle:'mfak47',sniper:'mfdragunov'} as const;
const limits={maxModels:32,maxActors:32,maxShaders:32,maxTextures:32,maxPoolEntries:32,maxTextChars:65536};
const prefix={sceneGeneration:41,kind:'callback' as const,callback:1};
const point={x:3,y:4,z:5},goody={bspWorld:ORIGINAL_COMBAT_PLANE_SIZE,modelPosition:{x:8,y:2,z:-4},eyePosition:{x:8,y:7,z:-4},weapon:'rifle' as const};
const initialShader:OriginalReceiverTransientInitialShader={handle:'observed-plane-shader',texture:'bangrocket',recycled:false,textureScale:{x:1,y:1,z:1},texturePosition:{x:0,y:0,z:0},blend:100,emissiveWhite:true};
function fixture(options:{inWorld?:boolean;barrelSeed?:boolean;perClone?:boolean;parented?:boolean}={}){
 const combat=createOriginalCombatEffectResources({spatter:new THREE.Texture(),decalspas:new THREE.Texture(),decal:new THREE.Texture(),pufft:new THREE.Texture()}),explosion=createOriginalExplosionResources({grenade:new THREE.Texture(),rocket:new THREE.Texture()}),flash=new THREE.Texture(),material=new THREE.MeshBasicMaterial({map:flash});
 const geometries=new Map(Object.values(families).map(name=>[name,createOriginalWeaponGeometry(source.meshes.find(mesh=>mesh.resource===name)!)])),root=new THREE.Group();
 root.position.set(2,-3,7);root.rotation.set(.2,-.4,.3,'ZYX');root.scale.setScalar(1.3);
 const plane=new THREE.Mesh(combat.geometry,material),muzzles=Object.fromEntries(Object.entries(families).map(([weapon,name])=>[weapon,new THREE.Mesh(geometries.get(name)!,material)])) as unknown as Record<keyof typeof families,THREE.Mesh>;
 root.add(plane,...Object.values(muzzles));plane.position.set(-1,.5,2);plane.rotation.set(.1,.3,-.2,'ZYX');plane.scale.setScalar(.8);
 for(const mesh of Object.values(muzzles)){mesh.position.set(.2,.4,-.6);mesh.rotation.set(-.3,.1,.2,'ZYX');mesh.scale.setScalar(.9);}
 root.updateMatrixWorld(true);
 const renderToWorld=new THREE.Matrix4().compose(new THREE.Vector3(11,12,13),new THREE.Quaternion().setFromEuler(new THREE.Euler(.3,.1,-.2,'ZYX')),new THREE.Vector3(1,1,1)).toArray();
 const seed=(mesh:THREE.Mesh,geometryProvenance:string)=>captureOriginalSoloTransientSeed(mesh,{renderToWorld,phase:17,geometryProvenance,inWorld:options.inWorld??true,maxTextChars:65536});
 const planeSeed=seed(plane,'actual combat plane borrowed WORLD geometry'),muzzleSeeds={pistol:seed(muzzles.pistol,'decoded mfpistol'),shotgun:seed(muzzles.shotgun,'decoded mfspas12'),rifle:seed(muzzles.rifle,'decoded mfak47'),sniper:seed(muzzles.sniper,'decoded mfdragunov')};
 const backend=createOriginalSoloTransientBackend({plane:planeSeed,planeWidthWorld:ORIGINAL_COMBAT_PLANE_SIZE,muzzles:muzzleSeeds,...(options.barrelSeed?{initialShader}:{}),...(options.perClone?{initialShaderIdentity:'per-clone-name' as const}:{}),...(options.parented?{cloneMembership:'copy-effect-birth-parented' as const}:{}),pointAtPolicy:'copy-plane-positive-z',omittedUpPolicy:'copy-negative-z',explicitUpPolicy:'copy-three-lookat',parallelUpPolicy:'copy-x',selfRotatePolicy:'copy-local-xyz',coincidentPolicy:'retain',maxTextChars:65536});
 const binding=createOriginalSoloTransientRendererBinding({soldierResources:{gunGeometries:geometries,gunMaterials:new Map([['mfmachinegun',material]])} as unknown as OriginalSoldierResources,explosionResources:explosion,combatResources:combat,planeGeometry:combat.geometry,planeWidthWorld:ORIGINAL_COMBAT_PLANE_SIZE,planeGeometryProvenance:planeSeed.geometryProvenance,sourceScale:ORIGINAL_MAP_SCALE,provenance:'decoded muzzles and actual application combat plane',sidedness:'double',resourceBindingId:'transient-integration-assets-41',textureBindingId:'transient-integration-textures-41',nearFilter:THREE.LinearFilter,maxVertices:100000,maxFaces:100000,maxResourceEntries:256,maxTextChars:65536});
 const query=createOriginalSoloTransientQueryResources(source,binding,{maxVertices:100000,maxFaces:100000,maxMeshes:256,maxTextChars:65536}),parent=new THREE.Group();parent.matrixAutoUpdate=false;parent.matrix.set(1,.2,0,20,0,2,.1,30,.3,0,-1,40,0,0,0,1);parent.updateMatrixWorld(true);
 const presentation=new OriginalReceiverTransientPresentation(binding.resources,parent,{sceneGeneration:41,maxModels:32,maxShaders:32,maxTextChars:65536,resourceBindingId:binding.resources.resourceBindingId,textureBindingId:binding.resources.textureBindingId,side:binding.side,nearFilter:binding.nearFilter}),world=new OriginalReceiverTransientWorld(backend,{maxModels:32,maxActors:32,maxShaders:32,maxShaderPoolEntries:32,maxTextChars:65536});
 let counter=0;
 const begin=()=>{let staged=counter;const tx=world.begin((name,inc='before')=>inc==='before'?`${name}${++staged}`:`${name}${staged++}`);return {tx,commit(){tx.commit();counter=staged;},rollback(){tx.rollback();}};};
 const descriptor=query.readResourceDescriptor()!;
 return {root,plane,muzzles,planeSeed,muzzleSeeds,renderToWorld,backend,binding,query,presentation,parent,world,begin,descriptor,dispose(){presentation.dispose();query.dispose();for(const geometry of geometries.values())geometry.dispose();material.dispose();flash.dispose();combat.dispose();explosion.dispose();}};
}
const puff=(id='puff'):OriginalReceiverTransientBirth=>({kind:'puff',id,position:point,angleSourceDegrees:90});
function quaternion(pose:Readonly<ReceiverModelPose>){const q=pose.rotation!;return new THREE.Quaternion(q.x,q.y,q.z,q.w);}
function assertRendered(f:ReturnType<typeof fixture>,state:ReceiverTransientCheckpoint){
 f.presentation.adopt(state,f.descriptor);
 for(const model of state.models){const mesh=f.presentation.readModel(model.handle)!,ray=f.query.resolve(model,ORIGINAL_COMBAT_PLANE_SIZE),world=new THREE.Matrix4().fromArray(ray.worldMatrix),positions=mesh.geometry.getAttribute('position');mesh.updateWorldMatrix(true,false);
  let worst=0;for(let i=0;i<positions.count;i++){const actual=new THREE.Vector3().fromBufferAttribute(positions,i).applyMatrix4(mesh.matrixWorld),expected=new THREE.Vector3().fromArray(ray.positions[i]).applyMatrix4(world);worst=Math.max(worst,actual.distanceTo(expected));}
  expect(worst).toBeLessThan(2e-5);expect(mesh.parent).toBe(model.inWorld?f.parent:null);
 }
}

// Actual application plane/muzzle buffers and CPU Texture handles. Explicit
// Three orientation, clone membership and seed shader policies are exercised;
// this is not a browser, native primitive or raster equivalence claim.
describe('application transient backend with real owner, query and presentation',()=>{
 it('captures actual transformed prototype geometry before births without doubling the application source unit scale',()=>{
  const f=fixture();try{expect(ORIGINAL_MAP_SCALE).toBe(ORIGINAL_WEAPON_UNIT_SCALE);
   const clones=[{resource:'plane',mesh:f.plane,clone:f.backend.clonePlane('seed-plane',ORIGINAL_COMBAT_PLANE_SIZE)},...Object.entries(families).map(([weapon,resource])=>({resource,mesh:f.muzzles[weapon as keyof typeof families],clone:f.backend.cloneMuzzle(`seed-${weapon}`,weapon as keyof typeof families)}))];
   for(const {resource,mesh,clone} of clones){const queried=f.query.resolve({handle:`seed:${resource}`,name:`seed:${resource}`,resource,kind:'transient',group:'gsmokes',pose:clone.pose,inWorld:clone.inWorld,geometryProvenance:clone.geometryProvenance},ORIGINAL_COMBAT_PLANE_SIZE),raw=new THREE.Matrix4().fromArray(queried.worldMatrix),captured=new THREE.Matrix4().fromArray(f.renderToWorld).multiply(mesh.matrixWorld),position=mesh.geometry.getAttribute('position');
    let worst=0;for(let i=0;i<position.count;i++)worst=Math.max(worst,new THREE.Vector3().fromArray(queried.positions[i]).applyMatrix4(raw).distanceTo(new THREE.Vector3().fromBufferAttribute(position,i).applyMatrix4(captured)));expect(worst).toBeLessThan(2e-5);
   }
  }finally{f.dispose();}
 });
 it.each(Object.keys(families) as (keyof typeof families)[])('binds %s cloned muzzle scale exactly once and follows source two-callback retirement',weapon=>{
  const f=fixture(),stage=f.begin();try{const gunPose:ReceiverModelPose={position:point,rotation:{x:0,y:Math.sin(.2),z:0,w:Math.cos(.2)},yaw:.4,phase:6,scale:9};stage.tx.birth({kind:'muzzle',id:'flash',weapon,gunPose},goody);let state=stage.tx.freezeCheckpoint(prefix,limits),model=state.models[0];
   expect(model.pose.scale).toBeCloseTo(f.muzzleSeeds[weapon].pose.scale,12);expect(model.pose.scale).not.toBe(gunPose.scale);expect(model.pose.position).toEqual(point);expect(model.pose.rotation).toEqual(gunPose.rotation);assertRendered(f,state);
   stage.tx.step(goody);expect(stage.tx.freezeActorIds()).toEqual(['flash']);stage.tx.step(goody);state=stage.tx.freezeCheckpoint({...prefix,callback:2},limits);assertRendered(f,state);expect(state.actors).toHaveLength(0);expect(state.muzzlePools).toEqual([{weapon,handles:[model.handle]}]);stage.commit();
  }finally{stage.rollback();f.dispose();}
 });
 it('matches actual WORLD geometry for puff, both projectile bangs, miss and blood under an affine reflected render root',()=>{
  const f=fixture(),stage=f.begin();try{for(const event of [puff(),{kind:'bang',id:'rocket',position:point,type:'rocket',attackerName:'owner'},{kind:'bang',id:'grenade',position:point,type:'grenade',attackerName:'owner'},{kind:'miss',id:'miss',position:point,normal:{x:.1,y:.2,z:.3}},{kind:'blood',id:'blood',position:point}] as OriginalReceiverTransientBirth[])stage.tx.birth(event,goody);
   let state=stage.tx.freezeCheckpoint(prefix,limits);assertRendered(f,state);expect(state.actors.map(a=>a.kind)).toEqual(['puff','bang','bang','miss','blood']);expect(state.shaders.map(s=>s.texture)).toEqual(['pufft','bangrocket','banggrenade','decal','spatter']);
   const effects=stage.tx.step(goody);expect(effects.filter(e=>e.kind==='bang-hurt')).toHaveLength(2);state=stage.tx.freezeCheckpoint({...prefix,callback:2},limits);assertRendered(f,state);stage.commit();
  }finally{stage.rollback();f.dispose();}
 });
 it('keeps puff rotation local to pointAt, and miss positive-Z normal alignment after its 180-degree local flip',()=>{
  const f=fixture(),stage=f.begin();try{stage.tx.birth(puff(),goody);stage.tx.birth({kind:'miss',id:'miss',position:point,normal:{x:0,y:0,z:.25}},goody);const state=stage.tx.freezeCheckpoint(prefix,limits),p=state.models[0].pose,m=state.models[1].pose;
   const puffForward=new THREE.Vector3(0,0,1).applyQuaternion(quaternion(p)),puffTarget=new THREE.Vector3(goody.modelPosition.x-p.position.x,goody.modelPosition.y-p.position.y,goody.modelPosition.z-p.position.z).normalize();expect(puffForward.distanceTo(puffTarget)).toBeLessThan(1e-10);
   const missForward=new THREE.Vector3(0,0,1).applyQuaternion(quaternion(m));expect(missForward.distanceTo(new THREE.Vector3(0,0,1))).toBeLessThan(1e-10);expect(m.position).toEqual({x:3,y:4,z:5.25});
   assertRendered(f,state);stage.commit();
  }finally{stage.rollback();f.dispose();}
 });
 it('reuses plane and recycled shader FIFO identities without resetting the catalog or replacing owned wrappers',()=>{
  const f=fixture(),stage=f.begin();try{stage.tx.birth(puff(),goody);const first=stage.tx.freezeCheckpoint(prefix,limits),handle=first.models[0].handle,shader=first.models[0].shaderHandle;assertRendered(f,first);const mesh=f.presentation.readModel(handle),material=f.presentation.readMaterial(shader);
   for(let i=0;i<31;i++)stage.tx.step(goody);let state=stage.tx.freezeCheckpoint({...prefix,callback:2},limits);assertRendered(f,state);expect(state.planePool).toEqual([handle]);expect(state.shaderPool).toEqual([shader]);
   stage.tx.birth({kind:'bang',id:'reused',position:point,type:'rocket',attackerName:'owner'},goody);state=stage.tx.freezeCheckpoint({...prefix,callback:3},limits);assertRendered(f,state);expect(state.models).toHaveLength(1);expect(state.models[0].shaderHandle).toBe(shader);expect(f.presentation.readModel(handle)).toBe(mesh);expect(f.presentation.readMaterial(shader)).toBe(material);expect(state.shaders[0].texture).toBe('bangrocket');stage.commit();
  }finally{stage.rollback();f.dispose();}
 });
 it('preserves explicitly offworld clone membership until the source actor writes membership',()=>{
  const f=fixture({inWorld:false}),stage=f.begin();try{stage.tx.birth(puff(),goody);stage.tx.birth({kind:'miss',id:'miss',position:point,normal:{x:0,y:0,z:1}},goody);stage.tx.birth({kind:'bang',id:'bang',position:point,type:'grenade',attackerName:'owner'},goody);let state=stage.tx.freezeCheckpoint(prefix,limits);expect(state.models.map(m=>m.inWorld)).toEqual([false,false,true]);assertRendered(f,state);
   stage.tx.step(goody);state=stage.tx.freezeCheckpoint({...prefix,callback:2},limits);expect(state.models.map(m=>m.inWorld)).toEqual([false,true,true]);assertRendered(f,state);stage.commit();
  }finally{stage.rollback();f.dispose();}
 });
 it('admits every first copy effect from offworld templates with actual rendered/query vertex agreement',()=>{
  const f=fixture({inWorld:false,parented:true}),stage=f.begin();try{
   const events:OriginalReceiverTransientBirth[]=[puff(),{kind:'miss',id:'miss',position:point,normal:{x:0,y:0,z:1}},{kind:'blood',id:'blood',position:point},{kind:'bang',id:'bang',position:point,type:'rocket',attackerName:'owner'},{kind:'muzzle',id:'muzzle',weapon:'rifle',gunPose:{position:point,yaw:0,phase:0,scale:1,rotation:{x:0,y:0,z:0,w:1}}}];
   for(const event of events)stage.tx.birth(event,goody);const state=stage.tx.freezeCheckpoint(prefix,limits);expect(state.models).toHaveLength(5);expect(state.models.every(m=>m.inWorld)).toBe(true);expect(f.planeSeed.inWorld).toBe(false);expect(Object.values(f.muzzleSeeds).every(s=>!s.inWorld)).toBe(true);assertRendered(f,state);stage.commit();
  }finally{stage.rollback();f.dispose();}
 });
 it('retains strict shared shader observations after an earlier barrel changed the alias',()=>{
  const f=fixture({barrelSeed:true}),stage=f.begin();try{
   stage.tx.birth({kind:'bang',id:'one',position:point,type:'barrel'},goody);
   expect(()=>stage.tx.birth({kind:'bang',id:'two',position:point,type:'barrel'},goody)).toThrow(/alias mismatch/);
   stage.rollback();expect(f.world.freezeModels()).toEqual([]);
  }finally{stage.rollback();f.dispose();}
 });
 it('preserves staged texture flags through fresh barrels, rollback, FIFO reuse and later fresh allocation',()=>{
  const f=fixture({barrelSeed:true,perClone:true});try{
   const birth=(tx:ReturnType<typeof f.begin>['tx'],id:string)=>tx.birth({kind:'bang',id,position:point,type:'barrel'},goody);
   const first=f.begin();birth(first.tx,'one');birth(first.tx,'two');const speculative=first.tx.freezeCheckpoint(prefix,limits);first.rollback();expect(f.world.freezeModels()).toEqual([]);
   const retry=f.begin();birth(retry.tx,'one');birth(retry.tx,'two');expect(retry.tx.freezeCheckpoint(prefix,limits)).toEqual(speculative);
   let state=retry.tx.freezeCheckpoint(prefix,limits);expect(new Set(state.models.map(m=>m.shaderHandle)).size).toBe(2);expect(state.shaders.every(s=>s.nearFiltering&&s.renderFormat==='rgba8888')).toBe(true);assertRendered(f,state);
   const retained=state.models.map(m=>({handle:m.handle,shader:m.shaderHandle}));for(let i=0;i<16;i++)retry.tx.step(goody);
   state=retry.tx.freezeCheckpoint({...prefix,callback:2},limits);expect(state.actors).toEqual([]);expect(state.models.every(m=>!m.inWorld)).toBe(true);
   birth(retry.tx,'reused-one');birth(retry.tx,'reused-two');birth(retry.tx,'fresh-three');state=retry.tx.freezeCheckpoint({...prefix,callback:3},limits);
   expect(state.models.slice(0,2).map(m=>({handle:m.handle,shader:m.shaderHandle}))).toEqual(retained);expect(state.models).toHaveLength(3);expect(new Set(state.models.map(m=>m.shaderHandle)).size).toBe(3);assertRendered(f,state);retry.commit();
  }finally{f.dispose();}
 });
 it.each(['return','throw'] as const)('expires clone texture observations immediately after hook %s',mode=>{
  const f=fixture({barrelSeed:true,perClone:true});let retained:OriginalReceiverTransientCloneContext|undefined;
  const backend={...f.backend,clonePlane:(name:string,width:number,context?:OriginalReceiverTransientCloneContext)=>{retained=context;expect(context!.readTexture(initialShader.texture)).toBeUndefined();if(mode==='throw')throw Error('clone failed');return f.backend.clonePlane(name,width,context);}};
  const world=new OriginalReceiverTransientWorld(backend,{maxModels:8,maxActors:8,maxShaders:8,maxTextChars:65536}),tx=world.begin((name)=>`${name}-one`);
  try{const birth=()=>tx.birth({kind:'bang',id:'one',position:point,type:'barrel'},goody);if(mode==='throw')expect(birth).toThrow('clone failed');else birth();expect(()=>retained!.readTexture(initialShader.texture)).toThrow(/expired|closed or failed/);tx.rollback();expect(()=>retained!.readTexture(initialShader.texture)).toThrow(/closed or failed/);}finally{tx.rollback();f.dispose();}
 });
 it('rejects a fresh barrel without a captured initial shader and leaves the committed owner empty',()=>{
  const f=fixture(),stage=f.begin();try{expect(()=>stage.tx.birth({kind:'bang',id:'barrel',position:point,type:'barrel'},goody)).toThrow(/initial shader/i);stage.rollback();expect(f.world.freezeModels()).toEqual([]);expect(f.world.freezeShaders()).toEqual([]);expect(f.presentation.freeze()).toBeUndefined();
  }finally{stage.rollback();f.dispose();}
 });
 it('uses only the explicitly supplied fresh barrel shader observation and retains its clone scale',()=>{
  const f=fixture({barrelSeed:true}),stage=f.begin();try{const effects=stage.tx.birth({kind:'bang',id:'barrel',position:point,type:'barrel'},goody),state=stage.tx.freezeCheckpoint(prefix,limits);expect(effects).toEqual([{kind:'sound',sound:'boomnew',position:point}]);expect(state.models[0].pose.scale).toBeCloseTo(f.planeSeed.pose.scale,12);expect(state.models[0].shaderHandle).toBe(initialShader.handle);expect(state.shaders[0].texture).toBe(initialShader.texture);assertRendered(f,state);stage.commit();
  }finally{stage.rollback();f.dispose();}
 });
 it('rolls back detached births and allocator names before rendering, then retries the same input without borrowed asset writes',()=>{
  const f=fixture(),before=[f.plane,...Object.values(f.muzzles)].map(m=>({matrix:m.matrix.toArray(),world:m.matrixWorld.toArray(),parent:m.parent,visible:m.visible}));
  try{const rejected=f.begin();rejected.tx.birth(puff(),goody);const pending=rejected.tx.freezeCheckpoint(prefix,limits);rejected.rollback();expect(f.world.freezeModels()).toEqual([]);expect(f.presentation.freeze()).toBeUndefined();const retry=f.begin();try{retry.tx.birth(puff(),goody);const accepted=retry.tx.freezeCheckpoint(prefix,limits);expect(accepted).toEqual(pending);retry.commit();assertRendered(f,accepted);expect([f.plane,...Object.values(f.muzzles)].map(m=>({matrix:m.matrix.toArray(),world:m.matrixWorld.toArray(),parent:m.parent,visible:m.visible}))).toEqual(before);}finally{retry.rollback();}
  }finally{f.dispose();}
 });
 it('disposes owned presentation wrappers once while retaining every borrowed plane, muzzle, material and texture',()=>{
  const f=fixture(),stage=f.begin();try{stage.tx.birth(puff(),goody);stage.tx.birth({kind:'muzzle',id:'flash',weapon:'rifle',gunPose:f.muzzleSeeds.rifle.pose},goody);const state=stage.tx.freezeCheckpoint(prefix,limits);stage.commit();assertRendered(f,state);
   const borrowed=[...f.binding.resources.geometries.values()].map(e=>vi.spyOn(e.geometry,'dispose')).concat([...f.binding.resources.textures.values()].map(t=>vi.spyOn(t,'dispose'))),owned=state.shaders.flatMap(s=>{const m=f.presentation.readMaterial(s.handle)!;return [vi.spyOn(m,'dispose'),vi.spyOn(m.map!,'dispose')];}),meshes=state.models.map(m=>f.presentation.readModel(m.handle)!);
   f.presentation.dispose();f.presentation.dispose();expect(meshes.every(m=>m.parent===null)).toBe(true);for(const spy of owned)expect(spy).toHaveBeenCalledTimes(1);for(const spy of borrowed)expect(spy).not.toHaveBeenCalled();for(const spy of [...borrowed,...owned])spy.mockRestore();
  }finally{stage.rollback();f.dispose();}
 });
});
