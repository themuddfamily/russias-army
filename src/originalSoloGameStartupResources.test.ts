import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {describe,expect,it,vi} from 'vitest';
import {createOriginalSoloGameStartupResources,type OriginalSoloGameStartupResourcesOptions} from './originalSoloGameStartupResources';
import * as planeModule from './originalSoloPlaneMaterial';
import {OriginalSoldier,createOriginalSoldierResources,type OriginalSoldierAssets} from './originalSoldier';
import {ORIGINAL_WEAPON_TEXTURES,type OriginalWeaponGeometryData} from './originalWeapons';
import {createOriginalCombatEffectResources} from './originalCombatEffectPresentation';
import {createOriginalExplosionResources} from './originalExplosionPresentation';
import {createOriginalSoloTransientRendererBinding} from './originalSoloTransientResources';
import {registerOriginalMapRuntime} from '../shared/originalMapRuntime';
import type {OriginalSceneData} from '../shared/originalSceneGeometry';
import type {OriginalSkyDescription} from '../shared/originalSkyRay';
import {ORIGINAL_COMBAT_PLANE_SIZE} from '../shared/originalCombatEffects';

const assets=new URL('../public/assets/',import.meta.url),read=<T>(name:string)=>JSON.parse(readFileSync(new URL(name,assets),'utf8')) as T;
const geometry=read<OriginalSoldierAssets['geometry']>('original-soldier/geometry.json'),rigMotion=read<OriginalSoldierAssets['rigMotion']>('original-soldier/rig-motion.json'),weapons=read<OriginalWeaponGeometryData>('original-weapons/geometry.json');
const data={barrack:read<OriginalSceneData&{runtime:{sky:OriginalSkyDescription}}>('original-scenes/barrack/scene.json'),woodlands:read<OriginalSceneData&{runtime:{sky:OriginalSkyDescription}}>('original-scenes/woodland/scene.json')};
function fixture(map:'barrack'|'woodlands'='woodlands'){
 const runtime=registerOriginalMapRuntime(map,data[map]),texture=new THREE.Texture(),textures=new Map(ORIGINAL_WEAPON_TEXTURES.map(name=>[name,new THREE.Texture()]));
 const soldierResources=createOriginalSoldierResources({geometry,rigMotion,texture},{geometry:weapons,textures},{resourceBindingId:'startup-soldier-generation'}),rig=new OriginalSoldier(soldierResources,{weapon:'rpg'});
 const combat=createOriginalCombatEffectResources({spatter:new THREE.Texture(),decalspas:new THREE.Texture(),decal:new THREE.Texture(),pufft:new THREE.Texture()}),explosion=createOriginalExplosionResources({grenade:new THREE.Texture(),rocket:new THREE.Texture()});
 const binding=createOriginalSoloTransientRendererBinding({soldierResources,combatResources:combat,explosionResources:explosion,planeGeometry:combat.geometry,planeWidthWorld:ORIGINAL_COMBAT_PLANE_SIZE,planeGeometryProvenance:'installed WORLD plane',sourceScale:runtime.scale,provenance:'installed loaded effect packs',sidedness:'double',resourceBindingId:'startup-FX-generation',textureBindingId:'startup-texture-generation',nearFilter:THREE.LinearFilter,maxVertices:100000,maxFaces:100000,maxResourceEntries:256,maxTextChars:65536});
 const options:OriginalSoloGameStartupResourcesOptions={runtime,doorNames:[],soldierResources,weapons,transientBinding:binding,constructorCapture:rig.readConstructorSeedCapture(),gunFactory:rig.readGunConstructorSeedCapture('rpg')!,renderToWorld:new THREE.Matrix4().toArray()};
 return {options,rig,texture,textures,combat,explosion,binding,dispose(){rig.dispose();soldierResources.dispose();combat.dispose();explosion.dispose();texture.dispose();for(const t of textures.values())t.dispose();}};
}
describe('production loaded Solo startup resource construction',()=>{
 it.each(['barrack','woodlands'] as const)('borrows actual %s resources and supplies explicit installed copy policies',map=>{
  const f=fixture(map),owner=createOriginalSoloGameStartupResources(f.options),before=f.rig.readConstructorSeedCapture();
  const borrowedGeometry=vi.spyOn(f.options.soldierResources.geometry,'dispose'),borrowedTexture=vi.spyOn(f.explosion.textures.rocket,'dispose');
  try{
   const r=owner.resources;expect(r.soldierResources).toBe(f.options.soldierResources);expect(r.weapons).toBe(weapons);expect(r.transientBinding).toBe(f.binding);
   expect(owner.inventory.data).toBe(f.options.runtime.data);const {radius,height,position,rotationDegrees}=data[map].runtime.sky;expect(owner.inventory.sky).toEqual({radius,height,position,rotationDegrees});expect(owner.inventory.budgets).toEqual({maxModels:2048,maxVertices:2000000,maxFaces:2000000,maxTextChars:65536,maxMeshes:256});
   expect(r.actor).toMatchObject({sourceScale:f.options.runtime.scale,gunScale:1,maxMeshes:256});expect(r.actorLifecycle).toMatchObject({parentRestoresMembership:true,constructorSeeds:{capture:before,gunFactory:f.options.gunFactory,gunClonePolicy:'copy-fresh-gun-mesh-factory'}});
   expect(r.transientPolicy).toMatchObject({initialShaderIdentity:'per-clone-name',cloneMembership:'copy-effect-birth-parented'});
   expect(r.transientPolicy.initialShader).toBe(owner.planeOwner.initialShader);expect(owner.planeOwner.planeMaterial.map).toBe(f.explosion.textures.rocket);
   expect(f.rig.readConstructorSeedCapture()).toBe(before);owner.release();expect(borrowedGeometry).not.toHaveBeenCalled();expect(borrowedTexture).not.toHaveBeenCalled();
  }finally{owner.release();f.dispose();}
 });
 it('detaches mapping, door list and sky operands while preserving borrowed immutable map identity',()=>{
  const f=fixture(),mapping=[...f.options.renderToWorld],doors=[' declared-door '],sky={radius:4,height:8,position:[1,2,3],rotationDegrees:[4,5,6]},owner=createOriginalSoloGameStartupResources({...f.options,renderToWorld:mapping,doorNames:doors,sky});
  try{mapping[12]=99;doors[0]='changed';sky.position[0]=99;expect(owner.resources.renderToWorld[12]).toBe(0);expect(owner.inventory.doorNames).toEqual([' declared-door ']);expect(owner.inventory.sky.position).toEqual([1,2,3]);expect(Object.isFrozen(owner.inventory.sky.position)).toBe(true);}finally{owner.release();f.dispose();}
 });
 it('rejects foreign constructor capability, mapping/scale and oversized inputs before renderer acquisition',()=>{
  const f=fixture(),random=vi.spyOn(Math,'random');
  try{
   const patches:Partial<OriginalSoloGameStartupResourcesOptions>[]=[{constructorCapture:{...f.options.constructorCapture}},{sourceScale:f.options.runtime.scale*2},{renderToWorld:[1]},{renderToWorld:new THREE.Matrix4().makeScale(1,2,1).toArray()},{doorNames:new Array(2049).fill('door')},{sky:{radius:0,height:1,position:[0,0,0],rotationDegrees:[0,0,0]}}];
   for(const patch of patches)expect(()=>createOriginalSoloGameStartupResources({...f.options,...patch})).toThrow();expect(random).not.toHaveBeenCalled();
   const oversized=new Array(257);let reads=0;Object.defineProperty(oversized,0,{get(){reads++;throw Error('entry read');}});
   expect(()=>createOriginalSoloGameStartupResources({...f.options,weapons:{...weapons,meshes:oversized}})).toThrow('budget');expect(reads).toBe(0);
  }finally{random.mockRestore();f.dispose();}
 });
 it('releases only its owned material once and guards all owner readers after cleanup failure',()=>{
  const f=fixture(),owner=createOriginalSoloGameStartupResources(f.options),material=owner.planeOwner.planeMaterial,dispose=vi.spyOn(material,'dispose').mockImplementation(()=>{throw Error('owned material disposal failed');});
  try{expect(()=>owner.release()).toThrow('owned material disposal failed');owner.release();expect(dispose).toHaveBeenCalledTimes(1);for(const readOwner of [()=>owner.resources,()=>owner.inventory,()=>owner.planeOwner])expect(readOwner).toThrow('released');}finally{dispose.mockRestore();owner.release();f.dispose();}
 });
 it('releases a partially acquired plane owner if installed shader observation cannot be read',()=>{
  const f=fixture(),release=vi.fn(),failure=Error('shader observation failed'),acquire=vi.spyOn(planeModule,'createOriginalSoloPlaneMaterial').mockReturnValue({get planeMaterial():never{throw failure;},get initialShader():never{throw failure;},shaderProvenance:'installed',release});
  try{expect(()=>createOriginalSoloGameStartupResources(f.options)).toThrow(failure);expect(release).toHaveBeenCalledTimes(1);}finally{acquire.mockRestore();f.dispose();}
 });
});
