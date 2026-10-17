import * as THREE from 'three';
import {readFileSync} from 'node:fs';
import {describe,expect,it,vi} from 'vitest';
import {createOriginalWeaponGeometry,type OriginalWeaponGeometryData} from './originalWeapons';
import type {OriginalSoldierResources} from './originalSoldier';
import {ORIGINAL_WEAPON_UNIT_SCALE} from './originalWeaponPresentation';
import {createOriginalSoloTransientRendererBinding,createOriginalSoloTransientQueryResources,type OriginalSoloTransientBinding,type OriginalSoloTransientRendererBindingInput} from './originalSoloTransientResources';
import type {ReceiverModelEntry} from '../shared/originalReceiverModelWorld';

const names=['mfpistol','mfspas12','mfak47','mfdragunov'] as const;
const limits={maxVertices:100000,maxFaces:100000,maxMeshes:256,maxTextChars:65536};
function fixture(){
 const source=JSON.parse(readFileSync(new URL('../public/assets/original-weapons/geometry.json',import.meta.url),'utf8')) as OriginalWeaponGeometryData;
 const geometries=new Map(names.map(name=>[name,createOriginalWeaponGeometry(source.meshes.find(mesh=>mesh.resource===name)!)]));
 const flash=new THREE.Texture(),material=new THREE.MeshBasicMaterial({map:flash}),plane=new THREE.PlaneGeometry(.75,.75);
 const textures={grenade:new THREE.Texture(),rocket:new THREE.Texture()},combat={spatter:new THREE.Texture(),decalspas:new THREE.Texture(),decal:new THREE.Texture(),pufft:new THREE.Texture()};
 const input:OriginalSoloTransientRendererBindingInput={soldierResources:{gunGeometries:geometries,gunMaterials:new Map([['mfmachinegun',material]])} as unknown as OriginalSoldierResources,
  explosionResources:{geometry:plane,textures,dispose:vi.fn()},combatResources:{geometry:plane,textures:combat,dispose:vi.fn()},planeGeometry:plane,planeWidthWorld:.75,planeGeometryProvenance:'borrowed WORLD plane coordinates',sourceScale:.02,provenance:'actual decoded muzzle pack plus caller plane',sidedness:'double',resourceBindingId:'query-renderer-pack-1',textureBindingId:'query-renderer-textures-1',nearFilter:THREE.LinearFilter,maxVertices:100000,maxFaces:100000,maxResourceEntries:256,maxTextChars:65536};
 const binding=createOriginalSoloTransientRendererBinding(input);
 return {source,geometries,plane,flash,material,input,binding,dispose(){for(const geometry of geometries.values())geometry.dispose();plane.dispose();material.dispose();for(const texture of [flash,...Object.values(textures),...Object.values(combat)])texture.dispose();}};
}
const quaternion=new THREE.Quaternion().setFromEuler(new THREE.Euler(.2,-.4,.3,'ZYX'));
const model=(resource:string):ReceiverModelEntry=>({handle:`query:${resource}`,name:resource,resource,kind:'transient',group:'gsmokes',inWorld:true,geometryProvenance:'fixture-owned-lifecycle',pose:{position:{x:3,y:4,z:5},rotation:{x:quaternion.x,y:quaternion.y,z:quaternion.z,w:quaternion.w},yaw:0,phase:0,scale:2.5}});
const rawWorld=(resource:string)=>new THREE.Matrix4().compose(new THREE.Vector3(3,4,5),quaternion,new THREE.Vector3().setScalar(2.5*(resource==='plane'?1:.02)));
function altered(binding:OriginalSoloTransientBinding,geometries:OriginalSoloTransientBinding['resources']['geometries']):OriginalSoloTransientBinding {
 return {...binding,resources:{...binding.resources,geometries}};
}

// Query/render resource correspondence under explicit Three basis/scaling and
// caller plane policy. Decoded muzzle geometry is real; the plane is a fixture,
// and Float32 render quantization is allowed rather than called native parity.
describe('borrowed Solo transient query resource assembly',()=>{
 it('copies the exact renderer binding metadata and texture names into its branded query descriptor',()=>{
  const f=fixture(),provider=createOriginalSoloTransientQueryResources(f.source,f.binding,limits);
  try{const bank=f.binding.resources,descriptor=provider.readResourceDescriptor();expect(descriptor).toEqual({sourceScale:bank.sourceScale,planeWidthWorld:bank.planeWidthWorld,planeGeometryProvenance:bank.planeGeometryProvenance,provenance:bank.provenance,sidedness:bank.sidedness,resourceBindingId:bank.resourceBindingId,textureBindingId:bank.textureBindingId,textureNames:[...bank.textures.keys()]});expect(Object.isFrozen(descriptor)).toBe(true);expect(Object.isFrozen(descriptor!.textureNames)).toBe(true);}finally{provider.dispose();f.dispose();}
 });
 it.each(names)('matches decoded %s WORLD triangles to its borrowed pre-scaled renderer geometry',resource=>{
  const f=fixture(),provider=createOriginalSoloTransientQueryResources(f.source,f.binding,limits);
  try{
   const ray=provider.resolve(model(resource)),borrowed=f.geometries.get(resource)!,positions=borrowed.getAttribute('position'),indices=borrowed.index!;
   const renderWorld=rawWorld(resource).multiply(new THREE.Matrix4().makeScale(1/ORIGINAL_WEAPON_UNIT_SCALE,1/ORIGINAL_WEAPON_UNIT_SCALE,1/ORIGINAL_WEAPON_UNIT_SCALE));
   expect(ray.sidedness).toBe(f.binding.resources.sidedness);expect(ray.positions.length).toBe(positions.count);expect(ray.faces.length*3).toBe(indices.count);
   let worst=0;for(let i=0;i<ray.faces.length;i++)for(let vertex=0;vertex<3;vertex++){
    const index=ray.faces[i][vertex];expect(index).toBe(indices.getX(i*3+vertex));
    const queried=new THREE.Vector3().fromArray(ray.positions[index]).applyMatrix4(new THREE.Matrix4().fromArray(ray.worldMatrix));
    const rendered=new THREE.Vector3().fromBufferAttribute(positions,index).applyMatrix4(renderWorld);worst=Math.max(worst,queried.distanceTo(rendered));
   }
   expect(worst).toBeLessThan(2e-6);expect(ray.worldMatrix).toEqual(rawWorld(resource).elements);
  }finally{provider.dispose();f.dispose();}
 });
 it('extracts actual borrowed WORLD plane vertices and indexed topology without applying muzzle unit conversion',()=>{
  const f=fixture(),provider=createOriginalSoloTransientQueryResources(f.source,f.binding,limits);
  try{const ray=provider.resolve(model('plane'),.75),position=f.plane.getAttribute('position'),index=f.plane.index!;
   expect(ray.worldMatrix).toEqual(rawWorld('plane').elements);expect(ray.positions).toEqual(Array.from({length:position.count},(_,i)=>[position.getX(i),position.getY(i),position.getZ(i)]));expect(ray.faces).toEqual(Array.from({length:index.count/3},(_,i)=>[index.getX(i*3),index.getX(i*3+1),index.getX(i*3+2)]));
   for(let i=0;i<position.count;i++){const actual=new THREE.Vector3().fromArray(ray.positions[i]).applyMatrix4(new THREE.Matrix4().fromArray(ray.worldMatrix)),expected=new THREE.Vector3().fromBufferAttribute(position,i).applyMatrix4(rawWorld('plane'));expect(actual.toArray()).toEqual(expected.toArray());}
   expect(()=>provider.resolve(model('plane'),1)).toThrow(/generation/i);
  }finally{provider.dispose();f.dispose();}
 });
 it('does not clone, mutate or dispose any borrowed renderer asset and disposal only closes its CPU provider',()=>{
  const f=fixture(),assets=[f.plane,...f.geometries.values()],before=assets.map(g=>({positions:Array.from(g.getAttribute('position').array),indices:Array.from(g.index!.array)}));
  const spies=[...assets.flatMap(g=>[vi.spyOn(g,'clone'),vi.spyOn(g,'dispose')]),vi.spyOn(f.flash,'clone'),vi.spyOn(f.flash,'dispose'),vi.spyOn(f.material,'dispose')];
  let provider:ReturnType<typeof createOriginalSoloTransientQueryResources>|undefined;
  try{provider=createOriginalSoloTransientQueryResources(f.source,f.binding,limits);provider.resolve(model('mfak47'));provider.resolve(model('plane'),.75);provider.dispose();provider.dispose();expect(()=>provider!.resolve(model('plane'),.75)).toThrow(/disposed/i);
   expect(assets.map(g=>({positions:Array.from(g.getAttribute('position').array),indices:Array.from(g.index!.array)}))).toEqual(before);for(const spy of spies)expect(spy).not.toHaveBeenCalled();expect(f.binding.resources.geometries.get('plane')!.geometry).toBe(f.plane);expect(f.binding.resources.textures.get('mfmachinegun')).toBe(f.flash);
  }finally{provider?.dispose();for(const spy of spies)spy.mockRestore();f.dispose();}
 });
 it('rejects missing plane and malformed borrowed indices without taking ownership of the pack',()=>{
  const f=fixture(),dispose=vi.spyOn(f.plane,'dispose');
  try{const missing=new Map(f.binding.resources.geometries);missing.delete('plane');expect(()=>createOriginalSoloTransientQueryResources(f.source,altered(f.binding,missing),limits)).toThrow(/plane/i);
   f.plane.setIndex([0,1,999]);expect(()=>createOriginalSoloTransientQueryResources(f.source,f.binding,limits)).toThrow(/face|index|indices/i);expect(dispose).not.toHaveBeenCalled();
  }finally{dispose.mockRestore();f.dispose();}
 });
 it('rejects vertex, face, decoded mesh and text budgets before returning a query provider',()=>{
  const f=fixture();try{for(const cap of [{maxVertices:1},{maxFaces:1},{maxMeshes:1},{maxTextChars:1}])expect(()=>createOriginalSoloTransientQueryResources(f.source,f.binding,{...limits,...cap})).toThrow(/budget|mesh|descriptor|limit/i);}finally{f.dispose();}
 });
 it.each(['vertex','topology'] as const)('rejects same-named RAW muzzle %s that disagrees with the borrowed renderer buffer',kind=>{
  const f=fixture();try{const foreign=structuredClone(f.source),mesh=foreign.meshes.find(row=>row.resource==='mfak47')!;
   if(kind==='vertex')mesh.positions[0][0]+=1;else [mesh.faces[0][0],mesh.faces[0][1]]=[mesh.faces[0][1],mesh.faces[0][0]];
   expect(()=>createOriginalSoloTransientQueryResources(foreign,f.binding,limits)).toThrow(/foreign.*geometry|foreign.*topology/i);
   const provider=createOriginalSoloTransientQueryResources(f.source,f.binding,limits);provider.dispose();
  }finally{f.dispose();}
 });
 it('rejects borrowed plane and muzzle unit scales that differ from their actual coordinate conventions',()=>{
  const f=fixture();try{for(const name of ['plane','mfak47']){const wrong=new Map(f.binding.resources.geometries),entry=wrong.get(name)!;wrong.set(name,{...entry,unitScale:entry.unitScale*2});expect(()=>createOriginalSoloTransientQueryResources(f.source,altered(f.binding,wrong),limits)).toThrow(/plane|binding/i);}}finally{f.dispose();}
 });
 it('preflights the aggregate plane plus muzzle budget before walking raw vertex values',()=>{
  const f=fixture();try{const raw=structuredClone(f.source),selected=raw.meshes.filter(row=>names.includes(row.resource as typeof names[number]));
   const total=f.plane.getAttribute('position').count+selected.reduce((sum,row)=>sum+row.positions.length,0),first=selected[0].positions[0];let reads=0;
   Object.defineProperty(selected[0].positions,0,{get:()=>{reads++;return first;}});
   expect(()=>createOriginalSoloTransientQueryResources(raw,f.binding,{...limits,maxVertices:total-1})).toThrow(/geometry budget/i);expect(reads).toBe(0);
  }finally{f.dispose();}
 });
});
