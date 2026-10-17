import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {describe,it,expect,vi} from 'vitest';
import {OriginalSoldier,createOriginalSoldierResources,type OriginalSoldierAssets} from './originalSoldier';
import {ORIGINAL_WEAPON_RESOURCES,ORIGINAL_WEAPON_TEXTURES,type OriginalWeaponGeometryData} from './originalWeapons';
import {ORIGINAL_WEAPON_UNIT_SCALE} from './originalWeaponPresentation';
import {captureOriginalSoloActorConstructorSeeds,type OriginalSoloActorConstructorSeedsOptions} from './originalSoloActorConstructorSeeds';
import {createOriginalSoloActorQueryResources} from './originalSoloActorQueryResources';
import {OriginalReceiverSoldierResource} from '../shared/originalReceiverSoldierResource';
import {ORIGINAL_MAP_SCALE} from '../shared/originalMapProfile';
import type {ReceiverModelPose,ReceiverModelEntry} from '../shared/originalReceiverModelWorld';
const base=new URL('../public/assets/',import.meta.url);
const geometry=JSON.parse(readFileSync(new URL('original-soldier/geometry.json',base),'utf8')) as OriginalSoldierAssets['geometry'];
const rigMotion=JSON.parse(readFileSync(new URL('original-soldier/rig-motion.json',base),'utf8')) as OriginalSoldierAssets['rigMotion'];
const weapons=JSON.parse(readFileSync(new URL('original-weapons/geometry.json',base),'utf8')) as OriginalWeaponGeometryData;
function fixture(){
 const texture=new THREE.Texture(),textures=new Map(ORIGINAL_WEAPON_TEXTURES.map(name=>[name,new THREE.Texture()])),resources=createOriginalSoldierResources({geometry,rigMotion,texture},{geometry:weapons,textures},{resourceBindingId:'actual-actor-seed-generation'}),soldier=new OriginalSoldier(resources,{weapon:'rpg'});
 const capture=soldier.readConstructorSeedCapture(),gunFactory=soldier.readGunConstructorSeedCapture('rpg')!;
 const options:OriginalSoloActorConstructorSeedsOptions={soldierResources:resources,sourceScale:ORIGINAL_MAP_SCALE,gunScale:1,renderToWorld:new THREE.Matrix4().toArray(),giResourceOrientation:capture.gi.resourceOrientation,gunClonePolicy:'copy-fresh-gun-mesh-factory',giProvenance:'actual constructor GI',gunProvenance:{pistol:'fresh pistol',shotgun:'fresh spas12',rifle:'fresh ak47',launcher:'fresh rg6',rpg:'fresh rpg',sniper:'fresh dragunov'},maxSeeds:7,maxTextChars:8192};
 return {resources,soldier,capture,gunFactory,options,convert:(o=options)=>captureOriginalSoloActorConstructorSeeds(capture,gunFactory,o),dispose(){soldier.dispose();resources.dispose();texture.dispose();for(const t of textures.values())t.dispose();}};
}
function world(p:Readonly<ReceiverModelPose>,scale:number,basis?:Readonly<{x:number;y:number;z:number;w:number}>){const q=p.rotation!;const m=new THREE.Matrix4().compose(new THREE.Vector3(p.position.x,p.position.y,p.position.z),new THREE.Quaternion(q.x,q.y,q.z,q.w),new THREE.Vector3().setScalar(p.scale*scale));return basis?m.multiply(new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion(basis.x,basis.y,basis.z,basis.w))):m;}
function close(a:readonly number[],b:readonly number[]){expect(a).toHaveLength(b.length);a.forEach((n,i)=>expect(n).toBeCloseTo(b[i],8));}
describe('issued fresh actor constructor seeds',()=>{
 it('uses fresh preparent clone matrices for all six guns rather than the oriented constructor gun',()=>{
  const f=fixture();try{const seeds=f.convert();close(world(seeds.gi.pose,f.options.sourceScale,f.options.giResourceOrientation).toArray(),f.capture.gi.worldMatrix);
   for(const weapon of Object.keys(ORIGINAL_WEAPON_RESOURCES) as (keyof typeof ORIGINAL_WEAPON_RESOURCES)[]){const matrix=world(seeds.guns[weapon].pose,f.options.sourceScale);close(matrix.toArray(),new THREE.Matrix4().makeScale(ORIGINAL_WEAPON_UNIT_SCALE,ORIGINAL_WEAPON_UNIT_SCALE,ORIGINAL_WEAPON_UNIT_SCALE).toArray());expect(seeds.guns[weapon].pose.phase).toBe(0);expect(Object.isFrozen(seeds.guns[weapon].pose.position)).toBe(true);}
   expect(world(seeds.guns.rpg.pose,f.options.sourceScale).toArray()).not.toEqual(seeds.constructorGunRawWorldMatrix);expect(Object.isFrozen(seeds.guns)).toBe(true);
  }finally{f.dispose();}
 });
 it.each([1,1.3])('matches actual phase-zero GI, old bone23 and oriented gun under a mapping scaled %s',scale=>{
  const f=fixture(),mapping=new THREE.Matrix4().compose(new THREE.Vector3(3,4,5),new THREE.Quaternion().setFromEuler(new THREE.Euler(.2,-.3,.4)),new THREE.Vector3().setScalar(scale)),o={...f.options,renderToWorld:mapping.toArray(),sourceScale:ORIGINAL_MAP_SCALE*scale};
  const provider=createOriginalSoloActorQueryResources(f.resources,weapons,{sourceScale:o.sourceScale,gunScale:o.gunScale,giResourceOrientation:o.giResourceOrientation,maxVertices:100000,maxFaces:100000,maxMotionKeys:100000,maxMeshes:256,maxDescriptorTextChars:8192,provenance:'actual constructor paired provider',sidedness:'double'}),rig=new OriginalReceiverSoldierResource(f.resources.assets,{maxVertices:100000,maxFaces:100000,maxMotionKeys:100000,provenance:'independent old bone sample'});
  try{const seeds=f.convert(o),gi:ReceiverModelEntry={handle:'GI-seed',name:'GI-seed',resource:'GI',kind:'gi',group:'soldiers',inWorld:true,pose:seeds.gi.pose,geometryProvenance:seeds.gi.geometryProvenance};
   const giWorld=world(gi.pose,o.sourceScale,o.giResourceOrientation);close(giWorld.toArray(),mapping.clone().multiply(new THREE.Matrix4().fromArray(f.capture.gi.worldMatrix)).toArray());close(rig.sample(0,giWorld.toArray()).bone23WorldMatrix,seeds.constructorBone23WorldMatrix);
   const held=provider.heldGunPose(gi,'rpg'),gun:ReceiverModelEntry={handle:'held',name:'held',resource:'rpg',kind:'gun',group:'gsmokes',inWorld:true,pose:held,geometryProvenance:'actual old bone gun'};close(provider.resolve(gun,'held-gun').worldMatrix,seeds.constructorGunRawWorldMatrix);
   const sampled=provider.resolve(gi,'live-gi').positions;for(let i=0;i<sampled.length;i++){const actual=f.soldier.mesh.getVertexPosition(i,new THREE.Vector3()).applyMatrix4(f.soldier.mesh.matrixWorld).applyMatrix4(mapping);expect(new THREE.Vector3(...sampled[i] as [number,number,number]).distanceTo(actual)).toBeLessThan(1e-6);}
  }finally{provider.dispose();rig.dispose();f.dispose();}
 });
 it('reads historical observations after movement/reuse without updating, sampling or allocating render objects',()=>{
  const f=fixture(),before=f.convert();try{f.soldier.group.position.set(9,8,7);f.soldier.animate(.1,{alive:true});f.soldier.prepareSourceReuse();const sample=vi.spyOn(f.soldier as any,'sampleMotion'),update=vi.spyOn(THREE.Object3D.prototype,'updateMatrixWorld'),random=vi.spyOn(Math,'random');try{expect(f.convert()).toEqual(before);expect(sample).not.toHaveBeenCalled();expect(update).not.toHaveBeenCalled();expect(random).not.toHaveBeenCalled();}finally{sample.mockRestore();update.mockRestore();random.mockRestore();}}finally{f.dispose();}
 });
 it('rejects structural copies, foreign generations and mismatched basis or query gun scale',()=>{
  const f=fixture();try{expect(()=>captureOriginalSoloActorConstructorSeeds({...f.capture},f.gunFactory,f.options)).toThrow('issued fresh');expect(()=>captureOriginalSoloActorConstructorSeeds(f.capture,{...f.gunFactory},f.options)).toThrow('issued fresh');expect(()=>f.convert({...f.options,soldierResources:{...f.resources,resourceBindingId:'foreign'}})).toThrow('generation');expect(()=>f.convert({...f.options,giResourceOrientation:{x:0,y:0,z:0,w:1}})).toThrow('basis mismatch');expect(()=>f.convert({...f.options,gunScale:2})).toThrow('unit/gun scale');expect(()=>f.convert({...f.options,sourceScale:.01})).toThrow('unit/gun scale');}finally{f.dispose();}
 });
 it.each(['shear','nonuniform','reflection','singular','perspective','sparse','nonfinite'] as const)('rejects unsupported %s mapping without altering observations',kind=>{
  const f=fixture(),m=new THREE.Matrix4();if(kind==='shear')m.elements[4]=.2;if(kind==='nonuniform')m.makeScale(1,2,1);if(kind==='reflection')m.makeScale(-1,1,1);if(kind==='singular')m.makeScale(0,1,1);if(kind==='perspective')m.elements[3]=.1;if(kind==='nonfinite')m.elements[12]=Infinity;const matrix=m.toArray();if(kind==='sparse')Reflect.deleteProperty(matrix,2);try{expect(()=>f.convert({...f.options,renderToWorld:matrix})).toThrow();expect(f.soldier.readConstructorSeedCapture()).toBe(f.capture);}finally{f.dispose();}
 });
 it('preflights seed/text bounds and declared policy before mapping reads',()=>{
  const f=fixture();try{let reads=0;const o={...f.options,maxSeeds:6,get renderToWorld():readonly number[]{reads++;throw Error('unexpected mapping');}};expect(()=>f.convert(o)).toThrow('policy or limits');expect(reads).toBe(0);expect(()=>f.convert({...f.options,maxTextChars:10})).toThrow('text budget');expect(()=>f.convert({...f.options,gunClonePolicy:'guess' as never})).toThrow('policy or limits');}finally{f.dispose();}
 });
 it('rejects replaced or disposed borrowed resources',()=>{
  const f=fixture();try{const old=f.resources.gunGeometries.get('rpg')!;f.resources.gunGeometries.set('rpg',f.resources.gunGeometries.get('ak47')!);expect(f.convert).toThrow('resource mismatch');f.resources.gunGeometries.set('rpg',old);f.resources.muzzleModels.dispose();expect(f.convert).toThrow('generation');}finally{f.dispose();}
 });
});
