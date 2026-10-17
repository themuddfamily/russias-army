import * as THREE from 'three';
import {readFileSync} from 'node:fs';
import {describe,expect,it,vi} from 'vitest';
import {createOriginalWeaponGeometry,type OriginalWeaponGeometryData} from './originalWeapons';
import type {OriginalSoldierResources} from './originalSoldier';
import {ORIGINAL_WEAPON_UNIT_SCALE} from './originalWeaponPresentation';
import {createOriginalSoloTransientRendererBinding,type OriginalSoloTransientRendererBindingInput} from './originalSoloTransientResources';

function fixture(){
 const source=JSON.parse(readFileSync(new URL('../public/assets/original-weapons/geometry.json',import.meta.url),'utf8')) as OriginalWeaponGeometryData;
 const geometries=new Map(['mfpistol','mfspas12','mfak47','mfdragunov'].map(name=>[name,createOriginalWeaponGeometry(source.meshes.find(mesh=>mesh.resource===name)!)]));
 const flash=new THREE.Texture(),material=new THREE.MeshBasicMaterial({map:flash}),plane=new THREE.PlaneGeometry(.75,.75),textures={grenade:new THREE.Texture(),rocket:new THREE.Texture()},combat={spatter:new THREE.Texture(),decalspas:new THREE.Texture(),decal:new THREE.Texture(),pufft:new THREE.Texture()};
 // Borrowed resource assembly seam: actual decoded muzzle geometries, explicit
 // caller plane and texture objects. No GI sampling or native primitive claim.
 const soldier={gunGeometries:geometries,gunMaterials:new Map([['mfmachinegun',material]])} as unknown as OriginalSoldierResources;
 const input:OriginalSoloTransientRendererBindingInput={soldierResources:soldier,explosionResources:{geometry:plane,textures,dispose:vi.fn()},combatResources:{geometry:plane,textures:combat,dispose:vi.fn()},planeGeometry:plane,planeWidthWorld:.75,planeGeometryProvenance:'caller measured world plane',sourceScale:.02,provenance:'decoded bank attestation',sidedness:'front',resourceBindingId:'geometry-generation-1',textureBindingId:'texture-generation-1',nearFilter:THREE.LinearFilter,maxVertices:10000,maxFaces:10000,maxResourceEntries:256,maxTextChars:4096};
 return {input,source,geometries,flash,material,plane,textures,combat,dispose(){for(const geometry of geometries.values())geometry.dispose();plane.dispose();material.dispose();for(const texture of [flash,...Object.values(textures),...Object.values(combat)])texture.dispose();}};
}
describe('explicit borrowed Solo transient renderer bank',()=>{
 it('captures actual pre-scaled decoded muzzle references with their exact unit scale and caller plane/texture metadata',()=>{
  const f=fixture();try{
   const binding=createOriginalSoloTransientRendererBinding(f.input),bank=binding.resources;
   expect(Object.isFrozen(binding)).toBe(true);expect(Object.isFrozen(bank)).toBe(true);expect(binding.side).toBe(THREE.FrontSide);expect(binding.nearFilter).toBe(THREE.LinearFilter);
   expect(bank.planeWidthWorld).toBe(.75);expect(bank.planeGeometryProvenance).toBe('caller measured world plane');expect(bank.resourceBindingId).toBe('geometry-generation-1');expect(bank.textureBindingId).toBe('texture-generation-1');expect(bank.geometries.get('plane')).toEqual({geometry:f.plane,unitScale:1});
   for(const [name,geometry] of f.geometries){expect(bank.geometries.get(name)?.geometry).toBe(geometry);expect(bank.geometries.get(name)?.unitScale).toBe(ORIGINAL_WEAPON_UNIT_SCALE);const source=f.source.meshes.find(mesh=>mesh.resource===name)!;expect(geometry.getAttribute('position').getX(0)).toBeCloseTo(source.positions[0][0]*ORIGINAL_WEAPON_UNIT_SCALE,5);}
   expect(bank.textures.get('mfmachinegun')).toBe(f.flash);expect(bank.textures.get('banggrenade')).toBe(f.textures.grenade);expect(bank.textures.get('pufft')).toBe(f.combat.pufft);
   const originalGeometry=f.geometries.get('mfpistol')!,originalTexture=f.combat.pufft,replacement=new THREE.Texture();f.geometries.delete('mfpistol');f.combat.pufft=replacement;expect(bank.geometries.has('mfpistol')).toBe(true);expect(bank.textures.get('pufft')).toBe(originalTexture);f.geometries.set('mfpistol',originalGeometry);f.combat.pufft=originalTexture;replacement.dispose();
  }finally{f.dispose();}
 });
 it('creates no GPU clones and neither mutates nor disposes borrowed GPU assets',()=>{
  const f=fixture();try{
   const before=f.flash.toJSON(),geometryClone=vi.spyOn(f.plane,'clone'),textureClone=vi.spyOn(f.flash,'clone'),geometryDispose=vi.spyOn(f.plane,'dispose'),textureDispose=vi.spyOn(f.flash,'dispose'),materialDispose=vi.spyOn(f.material,'dispose');
   const binding=createOriginalSoloTransientRendererBinding(f.input);expect(binding.resources.geometries.get('plane')?.geometry).toBe(f.plane);expect(f.flash.toJSON()).toEqual(before);for(const spy of [geometryClone,textureClone,geometryDispose,textureDispose,materialDispose])expect(spy).not.toHaveBeenCalled();
   expect(()=>((binding.resources.textures as Map<string,THREE.Texture>).clear())).toThrow('Immutable');expect(()=>((binding.resources.geometries as Map<string,unknown>).set('plane',{}))).toThrow('Immutable');
  }finally{f.dispose();}
 });
 it('rejects invalid metadata and budgets before invoking resource/geometry getters',()=>{
  const getter=vi.fn(()=>{throw Error('asset getter reached');});
  const metadata={sourceScale:.02,planeWidthWorld:.75,planeGeometryProvenance:'plane',provenance:'pack',sidedness:'front',resourceBindingId:'',textureBindingId:'textures',nearFilter:THREE.LinearFilter,maxVertices:100,maxFaces:100,maxResourceEntries:256,maxTextChars:4096};
  const input=Object.defineProperty({...metadata},'soldierResources',{get:getter}) as unknown as OriginalSoloTransientRendererBindingInput;
  expect(()=>createOriginalSoloTransientRendererBinding(input)).toThrow('descriptor');expect(getter).not.toHaveBeenCalled();
  const invalidBudget=Object.defineProperty({...metadata,resourceBindingId:'valid',maxVertices:0},'soldierResources',{get:getter}) as unknown as OriginalSoloTransientRendererBindingInput;
  expect(()=>createOriginalSoloTransientRendererBinding(invalidBudget)).toThrow('limits');expect(getter).not.toHaveBeenCalled();
 });
 it('rejects missing required borrowed entries and aggregate geometry budgets without disposing resources',()=>{
  const f=fixture();try{
   const dispose=vi.spyOn(f.plane,'dispose'),missing=f.geometries.get('mfdragunov')!;f.geometries.delete('mfdragunov');expect(()=>createOriginalSoloTransientRendererBinding(f.input)).toThrow('muzzle geometry');f.geometries.set('mfdragunov',missing);
   const flash=f.material.map;f.material.map=null;expect(()=>createOriginalSoloTransientRendererBinding(f.input)).toThrow('texture');f.material.map=flash;
   expect(()=>createOriginalSoloTransientRendererBinding({...f.input,maxVertices:1})).toThrow('budget');expect(dispose).not.toHaveBeenCalled();
   expect(()=>createOriginalSoloTransientRendererBinding({...f.input,extraTextures:new Map([['pufft',f.flash]])})).toThrow('extra');const extras=new Map([['explicit-seed',f.flash]]),binding=createOriginalSoloTransientRendererBinding({...f.input,extraTextures:extras});extras.clear();expect(binding.resources.textures.get('explicit-seed')).toBe(f.flash);
  }finally{f.dispose();}
 });
});
