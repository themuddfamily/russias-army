import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {describe,expect,it,vi} from 'vitest';
import {createOriginalSoloEffectPrototypes,type OriginalSoloEffectPrototypesOptions} from './originalSoloEffectPrototypes';
import {createOriginalSoldierResources,type OriginalSoldierAssets} from './originalSoldier';
import {ORIGINAL_WEAPON_TEXTURES,type OriginalWeaponGeometryData} from './originalWeapons';
import {createOriginalCombatEffectResources} from './originalCombatEffectPresentation';
import {createOriginalExplosionResources} from './originalExplosionPresentation';
import {createOriginalSoloTransientRendererBinding} from './originalSoloTransientResources';
import {OriginalEffectPlanePool} from './originalEffectPlanePool';
import {captureOriginalSoloTransientSeed} from './originalSoloTransientBackend';
import {ORIGINAL_COMBAT_PLANE_SIZE} from '../shared/originalCombatEffects';
import {ORIGINAL_MAP_SCALE} from '../shared/originalMapProfile';
import {ORIGINAL_WEAPON_UNIT_SCALE} from './originalWeaponPresentation';

const base=new URL('../public/assets/',import.meta.url);
const geometry=JSON.parse(readFileSync(new URL('original-soldier/geometry.json',base),'utf8')) as OriginalSoldierAssets['geometry'];
const rigMotion=JSON.parse(readFileSync(new URL('original-soldier/rig-motion.json',base),'utf8')) as OriginalSoldierAssets['rigMotion'];
const weapons=JSON.parse(readFileSync(new URL('original-weapons/geometry.json',base),'utf8')) as OriginalWeaponGeometryData;
const families={pistol:'mfpistol',shotgun:'mfspas12',rifle:'mfak47',sniper:'mfdragunov'} as const;
function fixture(){
 const texture=new THREE.Texture(),textures=new Map(ORIGINAL_WEAPON_TEXTURES.map(name=>[name,new THREE.Texture()]));
 const soldierResources=createOriginalSoldierResources({geometry,rigMotion,texture},{geometry:weapons,textures},{resourceBindingId:'loaded-actor-generation'});
 const combat=createOriginalCombatEffectResources({spatter:new THREE.Texture(),decalspas:new THREE.Texture(),decal:new THREE.Texture(),pufft:new THREE.Texture()}),explosion=createOriginalExplosionResources({grenade:new THREE.Texture(),rocket:new THREE.Texture()});
 const planePool=new OriginalEffectPlanePool(combat.geometry),planeMaterial=new THREE.MeshBasicMaterial({map:explosion.textures.rocket});
 const transientBinding=createOriginalSoloTransientRendererBinding({soldierResources,combatResources:combat,explosionResources:explosion,planeGeometry:combat.geometry,planeWidthWorld:ORIGINAL_COMBAT_PLANE_SIZE,planeGeometryProvenance:'loaded application combat plane WORLD geometry',sourceScale:ORIGINAL_MAP_SCALE,provenance:'loaded copy soldier/effect packs',sidedness:'double',resourceBindingId:'loaded-FX-generation',textureBindingId:'loaded-texture-generation',nearFilter:THREE.LinearFilter,maxVertices:100000,maxFaces:100000,maxResourceEntries:256,maxTextChars:8192});
 const metadata=(resource:string)=>({geometryProvenance:`loaded ${resource} copy constructor`,group:'gsmokes' as const,groupAncestry:['gsmokes']});
 const muzzles={pistol:metadata(families.pistol),shotgun:metadata(families.shotgun),rifle:metadata(families.rifle),sniper:metadata(families.sniper)};
 const options:OriginalSoloEffectPrototypesOptions={soldierResources,transientBinding,planeMaterial,muzzles,constructorPolicy:'copy-fresh-mesh-identity-offworld-phase-zero',initialShader:{handle:'explicit-fresh-plane-shader',texture:'bangrocket',recycled:false,textureScale:{x:1,y:1,z:1},texturePosition:{x:0,y:0,z:0},blend:100,emissiveWhite:true},maxModels:5,maxTextChars:8192};
 return {options,soldierResources,combat,explosion,planePool,planeMaterial,dispose(){planePool.dispose();planeMaterial.dispose();soldierResources.dispose();combat.dispose();explosion.dispose();texture.dispose();for(const t of textures.values())t.dispose();}};
}
const all=(owner:ReturnType<typeof createOriginalSoloEffectPrototypes>)=>[owner.plane,...Object.values(owner.muzzles)];

describe('loaded effect copy constructor prototype owner (no native-default claim)',()=>{
 it('provides five detached identity phase-zero seeds using exact loaded geometry and material identities',()=>{
  const f=fixture(),owner=createOriginalSoloEffectPrototypes(f.options);try{
   expect(owner.plane.mesh.geometry).toBe(f.combat.geometry);expect(owner.plane.mesh.material).toBe(f.planeMaterial);expect(owner.plane.geometryProvenance).toBe(f.options.transientBinding.resources.planeGeometryProvenance);
   for(const [weapon,resource] of Object.entries(families)){const p=owner.muzzles[weapon as keyof typeof families];expect(p.mesh.geometry).toBe(f.soldierResources.gunGeometries.get(resource));expect(p.mesh.material).toBe(f.soldierResources.gunMaterials.get('mfmachinegun'));expect(p.group).toBe('gsmokes');expect(p.groupAncestry).toEqual(['gsmokes']);}
   expect(new Set(all(owner).map(p=>p.mesh)).size).toBe(5);
   for(const seed of all(owner)){expect(seed.mesh.parent).toBeNull();expect(seed.phase).toBe(0);expect(seed.inWorld).toBe(false);expect(seed.mesh.matrix.toArray()).toEqual(new THREE.Matrix4().toArray());expect(seed.mesh.matrixWorld.toArray()).toEqual(new THREE.Matrix4().toArray());const captured=captureOriginalSoloTransientSeed(seed.mesh,{renderToWorld:new THREE.Matrix4().toArray(),phase:seed.phase,geometryProvenance:seed.geometryProvenance,inWorld:seed.inWorld,maxTextChars:8192});expect(captured.pose).toEqual({position:{x:0,y:0,z:0},rotation:{x:0,y:0,z:0,w:1},yaw:0,phase:0,scale:1});}
   const raw=weapons.meshes.find(m=>m.resource==='mfak47')!.positions[0],position=owner.muzzles.rifle.mesh.geometry.getAttribute('position');expect(position.getX(0)).toBe(Math.fround(raw[0]*ORIGINAL_WEAPON_UNIT_SCALE));
  }finally{owner.release();f.dispose();}
 });
 it('does not acquire/reset live pools, update borrowed assets or sample a gameplay RNG hook; Three UUID draws remain explicit',()=>{
  const f=fixture(),stats=[f.soldierResources.muzzleModels.stats(),f.planePool.stats()],muzzleAcquire=vi.spyOn(f.soldierResources.muzzleModels,'acquire'),muzzleReset=vi.spyOn(f.soldierResources.muzzleModels,'reset'),planeAcquire=vi.spyOn(f.planePool,'acquire'),planeReset=vi.spyOn(f.planePool,'reset');
  const flash=f.soldierResources.gunMaterials.get('mfmachinegun')!,before=[flash.map!.repeat.toArray(),flash.map!.offset.toArray(),f.planeMaterial.map!.repeat.toArray(),f.planeMaterial.map!.offset.toArray()];
  const random=vi.spyOn(Math,'random').mockReturnValue(.5);
  let owner:ReturnType<typeof createOriginalSoloEffectPrototypes>|undefined;
  try{owner=createOriginalSoloEffectPrototypes({...f.options,get gameplayRandom(){throw Error('unknown RNG hook read');}} as OriginalSoloEffectPrototypesOptions);expect(random).toHaveBeenCalledTimes(20);expect(muzzleAcquire).not.toHaveBeenCalled();expect(muzzleReset).not.toHaveBeenCalled();expect(planeAcquire).not.toHaveBeenCalled();expect(planeReset).not.toHaveBeenCalled();expect([f.soldierResources.muzzleModels.stats(),f.planePool.stats()]).toEqual(stats);expect([flash.map!.repeat.toArray(),flash.map!.offset.toArray(),f.planeMaterial.map!.repeat.toArray(),f.planeMaterial.map!.offset.toArray()]).toEqual(before);}finally{random.mockRestore();owner?.release();f.dispose();}
 });
 it('detaches known shader/ancestry fields and ignores undeclared accessors',()=>{
  const f=fixture(),shader={...f.options.initialShader!,textureScale:{x:1,y:1,z:1},texturePosition:{x:0,y:0,z:0},get unknown(){throw Error('unknown shader field read');}},metadata={...f.options.muzzles.rifle,groupAncestry:['gsmokes'],get unknown(){throw Error('unknown metadata field read');}};
  const owner=createOriginalSoloEffectPrototypes({...f.options,initialShader:shader,muzzles:{...f.options.muzzles,rifle:metadata}});try{shader.textureScale.x=99;metadata.groupAncestry[0]='altered';expect(owner.initialShader!.textureScale.x).toBe(1);expect(owner.muzzles.rifle.groupAncestry).toEqual(['gsmokes']);expect(Object.isFrozen(owner.initialShader!.textureScale)).toBe(true);expect(Object.isFrozen(owner.muzzles.rifle.groupAncestry)).toBe(true);expect(Object.isFrozen(owner.plane)).toBe(true);}finally{owner.release();f.dispose();}
 });
 it('permits omitted initial shader while still requiring an exact caller-declared plane texture join',()=>{
  const f=fixture(),owner=createOriginalSoloEffectPrototypes({...f.options,initialShader:undefined});try{expect(owner.initialShader).toBeUndefined();expect(owner.plane.mesh.material).toBe(f.planeMaterial);}finally{owner.release();f.dispose();}
 });
 it('rejects invalid policies/budgets and aggregate metadata before allocating any Mesh UUIDs',()=>{
  const f=fixture(),random=vi.spyOn(Math,'random');try{
   for(const invalid of [{...f.options,maxModels:4},{...f.options,maxModels:257},{...f.options,maxTextChars:65537},{...f.options,maxTextChars:1},{...f.options,constructorPolicy:'inferred-native' as OriginalSoloEffectPrototypesOptions['constructorPolicy']},{...f.options,muzzles:{...f.options.muzzles,rifle:{...f.options.muzzles.rifle,geometryProvenance:'x'.repeat(8192)}}}])expect(()=>createOriginalSoloEffectPrototypes(invalid)).toThrow();expect(random).not.toHaveBeenCalled();expect(f.soldierResources.muzzleModels.stats().allocated).toBe(0);
  }finally{random.mockRestore();f.dispose();}
 });
 it('rejects foreign plane/shader/muzzle identity joins before allocating wrappers',()=>{
  const f=fixture(),foreignTexture=new THREE.Texture(),foreignMaterial=new THREE.MeshBasicMaterial({map:foreignTexture}),foreignGeometry=new THREE.BufferGeometry(),random=vi.spyOn(Math,'random');
  try{
   expect(()=>createOriginalSoloEffectPrototypes({...f.options,planeMaterial:foreignMaterial})).toThrow();expect(()=>createOriginalSoloEffectPrototypes({...f.options,initialShader:{...f.options.initialShader!,texture:'banggrenade'}})).toThrow();
   const old=f.soldierResources.gunGeometries.get('mfak47')!;f.soldierResources.gunGeometries.set('mfak47',foreignGeometry);expect(()=>createOriginalSoloEffectPrototypes(f.options)).toThrow();f.soldierResources.gunGeometries.set('mfak47',old);
   const material=f.soldierResources.gunMaterials.get('mfmachinegun')!,map=material.map;material.map=foreignTexture;expect(()=>createOriginalSoloEffectPrototypes(f.options)).toThrow();material.map=map;expect(random).not.toHaveBeenCalled();
  }finally{random.mockRestore();foreignTexture.dispose();foreignMaterial.dispose();foreignGeometry.dispose();f.dispose();}
 });
 it('checks ancestry parity and counts before walking entries or allocating',()=>{
  const f=fixture(),random=vi.spyOn(Math,'random');try{
   for(const metadata of [{...f.options.muzzles.rifle,groupAncestry:['private-gsmokes']},{...f.options.muzzles.rifle,groupAncestry:['gsmokes','GSMOKES']},{...f.options.muzzles.rifle,groupAncestry:['gsmokes','mfak47']}])expect(()=>createOriginalSoloEffectPrototypes({...f.options,muzzles:{...f.options.muzzles,rifle:metadata}})).toThrow();
   let reads=0;const huge=new Array(8193);Object.defineProperty(huge,0,{get(){reads++;throw Error('oversized entry read');}});expect(()=>createOriginalSoloEffectPrototypes({...f.options,muzzles:{...f.options.muzzles,rifle:{...f.options.muzzles.rifle,groupAncestry:huge}}})).toThrow();expect(reads).toBe(0);expect(random).not.toHaveBeenCalled();
  }finally{random.mockRestore();f.dispose();}
 });
 it('cleans up every allocated wrapper on partial construction failure without disposing borrowed resources',()=>{
  const f=fixture(),updated:THREE.Object3D[]=[],removed:THREE.Object3D[]=[];
  const update=THREE.Object3D.prototype.updateMatrixWorld,remove=THREE.Object3D.prototype.removeFromParent;
  const geometryDispose=vi.spyOn(f.combat.geometry,'dispose'),materialDispose=vi.spyOn(f.planeMaterial,'dispose');
  const updateHook=vi.spyOn(THREE.Object3D.prototype,'updateMatrixWorld').mockImplementation(function(this:THREE.Object3D,force?:boolean){updated.push(this);if(updated.length===4)throw Error('prototype update failed');return update.call(this,force);});
  const removeHook=vi.spyOn(THREE.Object3D.prototype,'removeFromParent').mockImplementation(function(this:THREE.Object3D){removed.push(this);return remove.call(this);});
  try{expect(()=>createOriginalSoloEffectPrototypes(f.options)).toThrow('prototype update failed');expect(updated).toHaveLength(4);expect(removed).toEqual(updated);expect(geometryDispose).not.toHaveBeenCalled();expect(materialDispose).not.toHaveBeenCalled();expect(f.soldierResources.muzzleModels.stats().allocated).toBe(0);}finally{updateHook.mockRestore();removeHook.mockRestore();f.dispose();}
 });
 it('rejects changed constructor seeds or known resource lifetimes through guarded getters',()=>{
  const f=fixture(),owner=createOriginalSoloEffectPrototypes(f.options),mesh=owner.muzzles.rifle.mesh;try{mesh.position.x=1;expect(()=>owner.plane).toThrow('Changed effect prototype');mesh.position.x=0;expect(owner.plane.phase).toBe(0);f.soldierResources.muzzleModels.dispose();expect(()=>owner.muzzles).toThrow('lifetime');expect(()=>createOriginalSoloEffectPrototypes(f.options)).toThrow('loaded assets');}finally{owner.release();f.dispose();}
 });
 it.each(['plane','muzzle','flash-texture','plane-shader-texture','plane-texture-without-shader'] as const)('rejects post-acquisition native Map replacement of %s without changing retained wrappers',kind=>{
  const f=fixture(),owner=createOriginalSoloEffectPrototypes({...f.options,...(kind==='plane-texture-without-shader'?{initialShader:undefined}:{})}),seeds=all(owner),before=seeds.map(p=>({geometry:p.mesh.geometry,material:p.mesh.material,matrix:p.mesh.matrixWorld.toArray()}));
  const resources=f.options.transientBinding.resources,geometryMutation=kind==='plane'||kind==='muzzle',bank=geometryMutation?resources.geometries:resources.textures,key=kind==='plane'?'plane':kind==='muzzle'?'mfak47':kind==='flash-texture'?'mfmachinegun':'bangrocket';
  const original=Map.prototype.get.call(bank,key),foreignTexture=geometryMutation?undefined:new THREE.Texture();
  const replacement=geometryMutation?{...original,unitScale:original.unitScale*2}:foreignTexture;
  const geometryDispose=vi.spyOn(f.combat.geometry,'dispose'),materialDispose=vi.spyOn(f.planeMaterial,'dispose');
  try{
   // Captured maps reject ordinary set; native Map calls are explicitly outside
   // that protection. The owner still guards its declared asset joins on reads.
   Map.prototype.set.call(bank,key,replacement);
   for(const read of [()=>owner.plane,()=>owner.muzzles,()=>owner.initialShader])expect(read).toThrow('binding changed');
   seeds.forEach((seed,i)=>{expect(seed.mesh.geometry).toBe(before[i].geometry);expect(seed.mesh.material).toBe(before[i].material);expect(seed.mesh.matrixWorld.toArray()).toEqual(before[i].matrix);expect(seed.mesh.parent).toBeNull();});
   geometryDispose.mockClear();materialDispose.mockClear();Map.prototype.set.call(bank,key,original);expect(owner.plane).toBe(seeds[0]);expect(owner.muzzles.rifle.mesh).toBe(seeds[3].mesh);owner.release();expect(geometryDispose).not.toHaveBeenCalled();expect(materialDispose).not.toHaveBeenCalled();
  }finally{Map.prototype.set.call(bank,key,original);owner.release();foreignTexture?.dispose();f.dispose();}
 });
 it('attempts every private removal on release failure and never disposes borrowed assets; release and guards are idempotent',()=>{
  const f=fixture(),owner=createOriginalSoloEffectPrototypes(f.options),meshes=all(owner).map(p=>p.mesh),parent=new THREE.Group();parent.add(...meshes);
  const disposals=[vi.spyOn(f.combat.geometry,'dispose'),vi.spyOn(f.planeMaterial,'dispose'),vi.spyOn(f.soldierResources.gunGeometries.get('mfak47')!,'dispose'),vi.spyOn(f.soldierResources.gunMaterials.get('mfmachinegun')!,'dispose'),vi.spyOn(f.planeMaterial.map!,'dispose')];
  meshes[0].addEventListener('removed',()=>{throw Error('remove listener failed');});try{expect(()=>owner.release()).toThrow(AggregateError);expect(meshes.every(m=>m.parent===null)).toBe(true);expect(parent.children).toEqual([]);expect(()=>owner.release()).not.toThrow();expect(()=>owner.dispose()).not.toThrow();for(const read of [()=>owner.plane,()=>owner.muzzles,()=>owner.initialShader])expect(read).toThrow('released');disposals.forEach(spy=>expect(spy).not.toHaveBeenCalled());}finally{owner.release();f.dispose();}
 });
});
