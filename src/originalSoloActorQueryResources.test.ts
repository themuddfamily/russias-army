import * as THREE from 'three';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {createOriginalSoloActorQueryResources,type OriginalSoloActorQueryResourceOptions} from './originalSoloActorQueryResources';
import {createOriginalSoldierResources,type OriginalSoldierAssets} from './originalSoldier';
import type {OriginalMeshData,OriginalWeaponAssets} from './originalWeapons';
import {ORIGINAL_WEAPON_UNIT_SCALE} from './originalWeaponPresentation';

const guns=['pistol','spas12','ak47','rg6','rpg','dragunov'];
const cleanup:Array<()=>void>=[];
afterEach(()=>{for(const dispose of cleanup.splice(0).reverse())dispose();vi.restoreAllMocks();});
function mesh(resource:string):OriginalMeshData {return {resource,part:0,positions:[[.1,0,0],[0,.2,0],[0,0,.3]],normals:[[0,0,1],[0,0,1],[0,0,1]],faces:[[0,1,2]],tex_coords:[[[0,0],[0,0],[0,0]]]};}
function fixture(){
 const gi={...mesh('GI'),bone_indices:[[0,1],[0],[0]],bone_weights:[[.3,.7],[1],[1]]};
 const texture=new THREE.Texture();cleanup.push(()=>texture.dispose());
 const assets:OriginalSoldierAssets={geometry:{meshes:[gi]},texture,rigMotion:{rigs:[{name:'GI',bones:Array.from({length:25},(_,i)=>({name:`bone${i}`,parent:i===0?-1:0,length:0,displacement:[0,0,0],quaternion_xyzw:[0,0,0,1]}))}],motions:[{name:'GI',tracks:[{bone:'bone0',keys:[{time:0,position:[0,0,0],quaternion_xyzw:[0,0,0,1],scale:[1,1,1]}]}]}]}};
 const weapons:OriginalWeaponAssets={geometry:{meshes:guns.map(mesh),nodes:[]},textures:new Map()};
 const resources=createOriginalSoldierResources(assets,weapons,{resourceBindingId:'actual-pack'});cleanup.push(()=>resources.dispose());
 const options:OriginalSoloActorQueryResourceOptions={sourceScale:.02,giResourceOrientation:{x:0,y:0,z:0,w:1},gunScale:1,maxVertices:21,maxFaces:7,maxMotionKeys:1,maxMeshes:16,provenance:'paired',sidedness:'double',maxDescriptorTextChars:1024};
 const create=()=>{const provider=createOriginalSoloActorQueryResources(resources,weapons.geometry,options);cleanup.push(()=>provider.dispose());return provider;};
 return {gi,assets,weapons,resources,options,create};
}
describe('actual renderer actor query resource pairing',()=>{
 it('captures the actual binding and explicit basis/scales, owns only its scratch provider',()=>{
  const f=fixture(),geometryDispose=vi.spyOn(f.resources.geometry,'dispose'),materialDispose=vi.spyOn(f.resources.material,'dispose');
  const provider=f.create();expect(provider.readResourceDescriptor()).toEqual({sourceScale:.02,giResourceOrientation:{x:0,y:0,z:0,w:1},resourceBindingId:'actual-pack',provenance:'paired'});
  const gun=provider.resolve({handle:'gun',name:'gun',resource:'pistol',kind:'gun',group:'soldiers',inWorld:true,geometryProvenance:'paired',pose:{position:{x:0,y:0,z:0},yaw:0,phase:0,scale:1}},'held-gun');
  expect(gun.positions[0][0]).toBe(.1);expect(gun.worldMatrix[0]).toBe(.02);expect(gun.sidedness).toBe('double');
  expect(f.resources.gunGeometries.get('pistol')!.getAttribute('position').getX(0)).toBe(Math.fround(.1*ORIGINAL_WEAPON_UNIT_SCALE));
  provider.dispose();provider.dispose();expect(geometryDispose).not.toHaveBeenCalled();expect(materialDispose).not.toHaveBeenCalled();
 });
 it.each(['GI','pistol'])('rejects foreign %s position even with matching resource IDs',name=>{
  const f=fixture(),geometry=name==='GI'?f.resources.geometry:f.resources.gunGeometries.get(name)!;
  geometry.getAttribute('position').setX(0,12);expect(f.create).toThrow('positions');
 });
 it.each(['GI','rpg'])('checks every %s topology index',name=>{
  const f=fixture(),geometry=name==='GI'?f.resources.geometry:f.resources.gunGeometries.get(name)!;
  geometry.index!.setX(2,0);expect(f.create).toThrow('topology');
 });
 it.each(['skinIndex','skinWeight'])('checks %s including padded slots',name=>{
  const f=fixture();f.resources.geometry.getAttribute(name).setW(0,1);expect(f.create).toThrow('skin');
 });
 it('rejects missing mandatory actual renderer binding ID',()=>{
  const f=fixture(),missing={...f.resources,resourceBindingId:undefined};expect(()=>createOriginalSoloActorQueryResources(missing,f.weapons.geometry,f.options)).toThrow('binding ID');
 });
 it('rejects duplicate GI and gun resources',()=>{
  const f=fixture();f.assets.geometry.meshes.push(f.gi);expect(f.create).toThrow('duplicate');f.assets.geometry.meshes.pop();
  f.weapons.geometry.meshes.push(f.weapons.geometry.meshes[0]);expect(f.create).toThrow('duplicate');
 });
 it('rejects aliased borrowed geometries and position attributes',()=>{
  const f=fixture();const first=f.resources.gunGeometries.get('pistol')!,second=f.resources.gunGeometries.get('spas12')!;
  f.resources.gunGeometries.set('spas12',first);expect(f.create).toThrow('Aliased');f.resources.gunGeometries.set('spas12',second);
  second.setAttribute('position',first.getAttribute('position'));expect(f.create).toThrow('Aliased');
 });
 it('rejects raw arrays aliased across named resource entries',()=>{
  const f=fixture(),first=f.weapons.geometry.meshes[0],second=f.weapons.geometry.meshes[1],positions=second.positions;
  second.positions=first.positions;expect(f.create).toThrow('Aliased');second.positions=positions;second.faces=first.faces;expect(f.create).toThrow('Aliased');
 });
 it('preflights aggregate count budgets before reading raw vertices',()=>{
  const f=fixture();Object.defineProperty(f.gi.positions,0,{get(){throw Error('walked forbidden vertex');}});
  f.options.maxVertices=20;expect(f.create).toThrow('geometry budget');f.options.maxVertices=21;f.options.maxFaces=6;expect(f.create).toThrow('geometry budget');
 });
 it('preflights motion, text and mesh budgets before geometry walks',()=>{
  const f=fixture();Object.defineProperty(f.gi.positions,0,{get(){throw Error('walked forbidden vertex');}});
  f.assets.rigMotion.motions[0].tracks[0].keys.push(f.assets.rigMotion.motions[0].tracks[0].keys[0]);expect(f.create).toThrow('motion budget');f.assets.rigMotion.motions[0].tracks[0].keys.pop();
  f.options.maxDescriptorTextChars=30;expect(f.create).toThrow('text budget');f.options.maxDescriptorTextChars=1024;f.options.maxMeshes=5;expect(f.create).toThrow('mesh budget');
 });
 it('rejects malformed normalized/interleaved attributes and nonindexed topology',()=>{
  const f=fixture();const position=f.resources.geometry.getAttribute('position');position.normalized=true;expect(f.create).toThrow('position');position.normalized=false;
  f.resources.geometry.setAttribute('position',new THREE.InterleavedBufferAttribute(new THREE.InterleavedBuffer(new Float32Array(9),3),3,0));expect(f.create).toThrow('position');f.resources.geometry.setAttribute('position',position);
  f.resources.geometry.setIndex(null);expect(f.create).toThrow('indices');
 });
 it('rejects nonfinite vertices, bad indices and malformed skin before construction',()=>{
  const f=fixture();f.weapons.geometry.meshes[0].positions[0][0]=Infinity;expect(f.create).toThrow('positions');f.weapons.geometry.meshes[0].positions[0][0]=.1;
  f.gi.faces[0][2]=3;expect(f.create).toThrow('topology');f.gi.faces[0][2]=2;
  f.gi.bone_indices[0]=[0,1,2,3,4];expect(f.create).toThrow('influences');
 });
 it('rejects unsupported limits, side, basis and gun scale',()=>{
  const f=fixture();for(const patch of [{maxMeshes:257},{maxDescriptorTextChars:65537},{maxVertices:0},{gunScale:0},{sidedness:'bogus'},{giResourceOrientation:{x:0,y:0,z:0,w:0}}])expect(()=>createOriginalSoloActorQueryResources(f.resources,f.weapons.geometry,{...f.options,...patch} as OriginalSoloActorQueryResourceOptions)).toThrow();
 });
});
