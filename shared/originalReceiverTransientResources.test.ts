import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {describe,expect,it} from 'vitest';
import {OriginalReceiverTransientResources,type ReceiverTransientResourceOptions} from './originalReceiverTransientResources';
import type {ReceiverWeaponGeometry} from './originalReceiverActorResources';
import type {ReceiverModelEntry} from './originalReceiverModelWorld';

const weapons=JSON.parse(readFileSync(new URL('../public/assets/original-weapons/geometry.json',import.meta.url),'utf8')) as ReceiverWeaponGeometry;
const width=2.25;
// Explicit fixture primitive, not recovered Director plane tessellation/orientation.
const options:ReceiverTransientResourceOptions={sourceScale:.02,planeResource:{widthWorld:width,positions:[[-width/2,0,-width/2],[width/2,0,-width/2],[width/2,0,width/2],[-width/2,0,width/2]],faces:[[0,1,2],[0,2,3]],provenance:'explicit-world-unit-plane-fixture'},maxVertices:100000,maxFaces:100000,provenance:'decoded-muzzles-plus-explicit-plane-fixture',sidedness:'double'};
const rotation=new THREE.Quaternion().setFromEuler(new THREE.Euler(.4,-.6,.2,'ZYX'));
const model=(resource:string):ReceiverModelEntry=>({handle:`transient:${resource}`,name:resource,resource,kind:'transient',group:'gsmokes',inWorld:true,geometryProvenance:'fixture-lifecycle-model',pose:{position:{x:3,y:4,z:5},rotation:{x:rotation.x,y:rotation.y,z:rotation.z,w:rotation.w},yaw:1.2,phase:0,scale:7}});
const matrixFor=(scale:number)=>new THREE.Matrix4().compose(new THREE.Vector3(3,4,5),rotation,new THREE.Vector3().setScalar(scale));

describe('transient geometry adapter (decoded muzzle resources; explicitly injected plane)',()=>{
 it('rejects oversized decoded inventory before reading entries or invoking an iterator, with a bounded allocation-free lookup',()=>{
  let entries=0,iterations=0;const oversized=new Array<ReceiverWeaponGeometry['meshes'][number]>(257);
  Object.defineProperty(oversized,0,{get(){entries++;throw Error('Entry read before budget');}});
  Object.defineProperty(oversized,Symbol.iterator,{get(){iterations++;throw Error('Iterator read before budget');}});
  expect(()=>new OriginalReceiverTransientResources({meshes:oversized},options)).toThrow('mesh budget exceeded');expect(entries).toBe(0);expect(iterations).toBe(0);
  for(const maxMeshes of [0,-1,1.5,Infinity])expect(()=>new OriginalReceiverTransientResources(weapons,{...options,maxMeshes})).toThrow('mesh budget');
  const bounded=Object.create(weapons.meshes) as ReceiverWeaponGeometry['meshes'];expect(()=>new OriginalReceiverTransientResources({meshes:bounded},options)).toThrow('mesh budget');
  const exact=weapons.meshes.filter(m=>['mfpistol','mfspas12','mfak47','mfdragunov'].includes(m.resource));Object.defineProperty(exact,'filter',{get(){throw Error('Filter allocation forbidden');}});Object.defineProperty(exact,Symbol.iterator,{get(){throw Error('Iterator lookup forbidden');}});
  const provider=new OriginalReceiverTransientResources({meshes:exact},{...options,maxMeshes:4});try{expect(provider.resolve(model('mfak47')).positions).toEqual(weapons.meshes.find(m=>m.resource==='mfak47')!.positions);}finally{provider.dispose();}
 });
 it.each(['mfpistol','mfspas12','mfak47','mfdragunov'])('keeps actual %s mesh and retained full pose with exactly one source conversion',resource=>{
  const provider=new OriginalReceiverTransientResources(weapons,options);try{
   const source=weapons.meshes.find(m=>m.resource===resource)!,resolved=provider.resolve(model(resource));
   expect(resolved.positions).toEqual(source.positions);expect(resolved.faces).toEqual(source.faces);expect(resolved.worldMatrix).toEqual(matrixFor(7*.02).elements);
   expect(resolved).toMatchObject({layer:'transient',inWorld:true,groupAncestry:['gsmokes']});
   const point=new THREE.Vector3().fromArray(resolved.positions[0]).applyMatrix4(new THREE.Matrix4().fromArray(resolved.worldMatrix));
   const expected=new THREE.Vector3().fromArray(source.positions[0]).applyMatrix4(matrixFor(7*.02));expect(point.distanceTo(expected)).toBeLessThan(1e-12);
   const explicit=new THREE.Matrix4().makeTranslation(-1,2,3);expect(provider.resolve({...model(resource),worldMatrix:explicit.elements}).worldMatrix).toEqual(explicit.elements);
  }finally{provider.dispose();}
 });
 it('scales an already-world-unit plane once and enforces its immutable generation width',()=>{
  const provider=new OriginalReceiverTransientResources(weapons,options);try{
   const resolved=provider.resolve(model('plane'),width);expect(resolved.worldMatrix).toEqual(matrixFor(7).elements);expect(resolved.positions).toEqual(options.planeResource.positions);
   const a=new THREE.Vector3().fromArray(resolved.positions[0]).applyMatrix4(new THREE.Matrix4().fromArray(resolved.worldMatrix)),b=new THREE.Vector3().fromArray(resolved.positions[1]).applyMatrix4(new THREE.Matrix4().fromArray(resolved.worldMatrix));
   expect(a.distanceTo(b)).toBeCloseTo(width*7,12);expect(()=>provider.resolve(model('plane'))).toThrow('generation mismatch');expect(()=>provider.resolve(model('plane'),9)).toThrow('generation mismatch');
  }finally{provider.dispose();}
 });
 it('owns immutable source meshes and option state across later mutation and reverse query order',()=>{
  const raw=structuredClone(weapons),configuration=structuredClone(options),provider=new OriginalReceiverTransientResources(raw,configuration);try{
   const a=provider.resolve(model('plane'),width),b=provider.resolve(model('mfak47')),before={a:structuredClone(a),b:structuredClone(b)};
   configuration.planeResource.positions[0][0]+=999;configuration.planeResource.widthWorld=9;configuration.sourceScale=5;raw.meshes.find(m=>m.resource==='mfak47')!.positions[0][0]+=999;
   expect(provider.resolve(model('mfak47'))).toEqual(before.b);expect(provider.resolve(model('plane'),width)).toEqual(before.a);expect(a).toEqual(before.a);expect(b).toEqual(before.b);
   expect(Object.isFrozen(a.positions[0])).toBe(true);expect(Object.isFrozen(b.worldMatrix)).toBe(true);
  }finally{provider.dispose();}
 });
 it('rejects missing resources, malformed topology, resource budgets and disposed resolution',()=>{
  expect(()=>new OriginalReceiverTransientResources({meshes:weapons.meshes.filter(m=>m.resource!=='mfpistol')},options)).toThrow('Missing or duplicate');
  expect(()=>new OriginalReceiverTransientResources(weapons,{...options,maxVertices:3})).toThrow('budget exceeded');
  const bad=structuredClone(options);bad.planeResource.faces[0][0]=4;expect(()=>new OriginalReceiverTransientResources(weapons,bad)).toThrow('Invalid receiver transient face');
  const provider=new OriginalReceiverTransientResources(weapons,options);expect(()=>provider.resolve({...model('mfak47'),pose:{...model('mfak47').pose,rotation:{x:0,y:0,z:0,w:0}}})).toThrow('rotation');
  provider.dispose();provider.dispose();expect(()=>provider.resolve(model('plane'),width)).toThrow('disposed');
 });
});
