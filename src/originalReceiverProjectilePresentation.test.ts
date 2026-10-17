import * as THREE from 'three';
import {readFileSync} from 'node:fs';
import {describe,expect,it,vi} from 'vitest';
import {OriginalReceiverProjectilePresentation,type OriginalReceiverProjectileMaterialBinding} from './originalReceiverProjectilePresentation';
import {createOriginalWeapons,ORIGINAL_WEAPON_TEXTURES,type OriginalWeaponGeometryData} from './originalWeapons';
import type {ReceiverProjectileWorldCheckpoint,ReceiverProjectileWorldModel} from '../shared/originalReceiverProjectileWorld';

const geometry=JSON.parse(readFileSync(new URL('../public/assets/original-weapons/geometry.json',import.meta.url),'utf8')) as OriginalWeaponGeometryData;
const prefix={kind:'callback' as const,sceneGeneration:4,callback:1};
const identity=()=>new THREE.Matrix4().toArray();
function pose(x:number):number[]{const m=new THREE.Matrix4().compose(new THREE.Vector3(x,3,5),new THREE.Quaternion().setFromEuler(new THREE.Euler(.2,.5,-.3)),new THREE.Vector3(.03,.02,-.01));m.elements[4]+=.007;return m.toArray();}
function capture():ReceiverProjectileWorldCheckpoint {
 const model=(handle:string,resource:ReceiverProjectileWorldModel['resource'],inWorld:boolean,materialHandle:string,x:number):ReceiverProjectileWorldModel=>({handle,resource,inWorld,materialHandle,worldMatrix:pose(x),groupAncestry:['private-world']});
 return {prefix,template:model('grenade','rg6grenade',false,'grenade-template',0),catalog:[{handle:'grenade-1',weapon:'launcher'},{handle:'rocket-1',weapon:'rpg'}],models:[model('grenade-1','rg6grenade',true,'grenade-clone',10),model('rocket-1','rpgrocket',false,'rocket-material',20)],actors:[{launchId:'launch-1',handle:'grenade-1',weapon:'launcher'}],fifo:{launcher:[],rpg:['rocket-1']}};
}
function fixture(){
 const collection=createOriginalWeapons({geometry,textures:new Map(ORIGINAL_WEAPON_TEXTURES.map(n=>[n,new THREE.Texture()]))});
 const parent=new THREE.Group(),root=new THREE.Group();parent.position.set(10,20,30);parent.rotation.set(.1,-.4,.3);parent.scale.set(2,1,3);parent.add(root);root.position.set(1,-2,3);root.rotation.set(.2,.3,.4);parent.updateMatrixWorld(true);
 const materialBindings=new Map<string,OriginalReceiverProjectileMaterialBinding>([['grenade-template',{resource:'rg6grenade',material:collection.resources.get('rg6grenade')!.material}],['grenade-clone',{resource:'rg6grenade',material:collection.resources.get('rg6grenade')!.material}],['rocket-material',{resource:'rpgrocket',material:collection.rocket.material}]]);
 const options={sceneGeneration:4,maxModels:8,maxActors:4,maxTextChars:8192,rocketMaterialHandle:'rocket-material',materialBindings};
 const adapter=new OriginalReceiverProjectilePresentation(collection,root,options);
 return {collection,parent,root,options,adapter,dispose(){adapter.release();collection.dispose();}};
}
function pointClose(a:THREE.Vector3,b:THREE.Vector3){expect(a.x).toBeCloseTo(b.x,5);expect(a.y).toBeCloseTo(b.y,5);expect(a.z).toBeCloseTo(b.z,5);}

describe('committed projectile RAW WORLD renderer projection (explicit policy, CPU assets)',()=>{
 it('maps real grenade and rocket vertices once under a nonidentity root using private wrappers and actual material aliases',()=>{
  const f=fixture(),c=capture(),borrowed=[...f.collection.resources.values()].map(m=>({m,parent:m.parent,matrix:m.matrix.toArray(),visible:m.visible}));try{
   f.adapter.adopt(prefix,c,identity());
   for(const model of c.models){const mesh=f.adapter.meshForHandle(model.handle)!,source=f.collection.resources.get(model.resource)!,raw=geometry.meshes.find(m=>m.resource===model.resource)!.positions;expect(mesh).not.toBe(source);expect(mesh.geometry).toBe(source.geometry);expect(mesh.material).toBe(source.material);expect(mesh.parent).toBe(model.inWorld?f.root:null);expect(mesh.visible).toBe(model.inWorld);expect(mesh.matrixAutoUpdate).toBe(false);
    for(const index of [0,Math.floor(raw.length/2),raw.length-1])pointClose(new THREE.Vector3().fromBufferAttribute(mesh.geometry.getAttribute('position'),index).applyMatrix4(mesh.matrixWorld),new THREE.Vector3().fromArray(raw[index]).applyMatrix4(new THREE.Matrix4().fromArray([...model.worldMatrix])));
   }
   expect(f.adapter.meshForHandle('grenade')).toBeUndefined();expect(f.adapter.freeze()).toEqual(c);
   for(const saved of borrowed){expect(saved.m.parent).toBe(saved.parent);expect(saved.m.matrix.toArray()).toEqual(saved.matrix);expect(saved.m.visible).toBe(saved.visible);}
  }finally{f.dispose();}
 });
 it('uses explicit world-to-render conversion and rebases after parent motion without advancing captured poses',()=>{
  const f=fixture(),c=capture(),conversion=new THREE.Matrix4().makeRotationY(.4).setPosition(12,13,14);try{
   f.adapter.adopt(prefix,c,conversion.toArray());const mesh=f.adapter.meshForHandle('grenade-1')!,before=mesh.matrixWorld.clone(),saved=f.adapter.freeze();
   f.parent.position.set(-70,20,18);f.root.rotation.z+=.4;f.adapter.rebase();expect(f.adapter.meshForHandle('grenade-1')).toBe(mesh);expect(f.adapter.freeze()).toEqual(saved);
   const raw=geometry.meshes.find(m=>m.resource==='rg6grenade')!.positions[0],expected=new THREE.Vector3().fromArray(raw).applyMatrix4(new THREE.Matrix4().fromArray([...c.models[0].worldMatrix])).applyMatrix4(conversion);pointClose(new THREE.Vector3().fromBufferAttribute(mesh.geometry.getAttribute('position'),0).applyMatrix4(mesh.matrixWorld),expected);mesh.matrixWorld.elements.forEach((v,i)=>expect(v).toBeCloseTo(before.elements[i],8));
  }finally{f.dispose();}
 });
 it('retains exact clone identity through retirement FIFO and readmission; membership alone controls drawing',()=>{
  const f=fixture(),c=capture();try{
   f.adapter.adopt(prefix,c);const grenade=f.adapter.meshForHandle('grenade-1')!,rocket=f.adapter.meshForHandle('rocket-1')!;
   const retired={...c,prefix:{...prefix,callback:2},models:c.models.map(m=>({...m,inWorld:false})),actors:[],fifo:{launcher:['grenade-1'],rpg:['rocket-1']}};f.adapter.adopt(retired.prefix,retired);expect(grenade.visible).toBe(false);expect(grenade.parent).toBeNull();
   const reborn={...retired,prefix:{...prefix,callback:3},models:retired.models.map(m=>m.handle==='grenade-1'?{...m,inWorld:true,worldMatrix:pose(100)}:m),actors:[{launchId:'launch-2',handle:'grenade-1',weapon:'launcher' as const}],fifo:{launcher:[],rpg:['rocket-1']}};f.adapter.adopt(reborn.prefix,reborn);expect(f.adapter.meshForHandle('grenade-1')).toBe(grenade);expect(f.adapter.meshForHandle('rocket-1')).toBe(rocket);expect(grenade.visible).toBe(true);expect(rocket.visible).toBe(false);expect(f.root.children).toHaveLength(1);
  }finally{f.dispose();}
 });
 it('deeply detaches known checkpoint fields and does not retain arbitrary getters',()=>{
  const f=fixture(),c=capture();try{const raw={...c,get ignored(){throw Error('unknown field read');}};f.adapter.adopt(prefix,raw);(c.models[0].worldMatrix as number[])[12]=999;(c.models[0].groupAncestry as string[])[0]='changed';expect(f.adapter.freeze()!.models[0].worldMatrix[12]).not.toBe(999);expect(f.adapter.freeze()!.models[0].groupAncestry).toEqual(['private-world']);expect(Object.isFrozen(f.adapter.freeze()!.models[0].worldMatrix)).toBe(true);}finally{f.dispose();}
 });
 it('rejects malformed final records, unmapped materials and constructing state before allocating or writing meshes',()=>{
  const f=fixture(),c=capture();try{
   const invalids=[{...c,models:c.models.map((m,i)=>i===1?{...m,worldMatrix:[...m.worldMatrix.slice(0,15),0]}:m)},{...c,models:c.models.map((m,i)=>i===1?{...m,materialHandle:'unknown'}:m)},{...c,template:{...c.template,materialHandle:'rocket-material'}},{...c,constructing:{launchId:'pending',handle:'rocket-1',weapon:'rpg' as const},fifo:{launcher:[],rpg:[]}}];
   for(const invalid of invalids){expect(()=>f.adapter.adopt(prefix,invalid)).toThrow();expect(f.root.children).toHaveLength(0);expect(f.adapter.freeze()).toBeUndefined();}
   f.adapter.adopt(prefix,c);const mesh=f.adapter.meshForHandle('grenade-1')!,before=mesh.matrix.toArray();expect(()=>f.adapter.adopt(prefix,{...c,models:c.models.map((m,i)=>i===1?{...m,materialHandle:'unknown'}:{...m,worldMatrix:pose(500)})})).toThrow();expect(mesh.matrix.toArray()).toEqual(before);expect(f.adapter.freeze()).toEqual(c);
  }finally{f.dispose();}
 });
 it('rejects singular captured/root/conversion matrices, nonfinite values, foreign prefixes and replay before writes',()=>{
  const f=fixture(),c=capture();try{
   const singular=new THREE.Matrix4().makeScale(0,1,1).toArray();expect(()=>f.adapter.adopt(prefix,{...c,models:c.models.map((m,i)=>i?m:{...m,worldMatrix:singular})})).toThrow();expect(()=>f.adapter.adopt(prefix,c,singular)).toThrow();f.root.scale.x=0;expect(()=>f.adapter.adopt(prefix,c)).toThrow();f.root.scale.x=1;
   const bad=[...identity()];bad[12]=NaN;expect(()=>f.adapter.adopt(prefix,c,bad)).toThrow();expect(()=>f.adapter.adopt({...prefix,sceneGeneration:5},{...c,prefix:{...prefix,sceneGeneration:5}})).toThrow();expect(()=>f.adapter.adopt({...prefix,callback:2},c)).toThrow();expect(f.root.children).toHaveLength(0);
   f.adapter.adopt({...prefix,callback:2},{...c,prefix:{...prefix,callback:2}});expect(()=>f.adapter.adopt(prefix,c)).toThrow();
  }finally{f.dispose();}
 });
 it('rejects catalog deletion, changed family and invalid ownership while preserving retained wrappers',()=>{
  const f=fixture(),c=capture();try{
   f.adapter.adopt(prefix,c);const mesh=f.adapter.meshForHandle('grenade-1')!;
   expect(()=>f.adapter.adopt(prefix,{...c,catalog:c.catalog.slice(1),models:c.models.slice(1),actors:[]})).toThrow();expect(()=>f.adapter.adopt(prefix,{...c,actors:[],fifo:{launcher:[],rpg:['rocket-1']}})).toThrow();
   const changed:ReceiverProjectileWorldCheckpoint={...c,catalog:[{handle:'grenade-1',weapon:'rpg'},c.catalog[1]],models:c.models.map((m,i)=>i?m:{...m,resource:'rpgrocket',materialHandle:'rocket-material'}),actors:[{launchId:'launch-1',handle:'grenade-1',weapon:'rpg'}]};expect(()=>f.adapter.adopt(prefix,changed)).toThrow();expect(f.adapter.meshForHandle('grenade-1')).toBe(mesh);expect(f.adapter.freeze()).toEqual(c);
  }finally{f.dispose();}
 });
 it('checks budgets before entry reads and rejects resource/material/options bindings without borrowing mutations',()=>{
  const f=fixture(),c=capture();try{
   let reads=0;const huge=new Array(8);Object.defineProperty(huge,0,{get(){reads++;throw Error('read oversized');}});expect(()=>f.adapter.adopt(prefix,{...c,models:huge})).toThrow();expect(reads).toBe(0);
   const foreign=new Map(f.options.materialBindings);foreign.set('rocket-material',{resource:'rpgrocket',material:new THREE.MeshBasicMaterial()});expect(()=>new OriginalReceiverProjectilePresentation(f.collection,f.root,{...f.options,materialBindings:foreign})).toThrow();(foreign.get('rocket-material')!.material as THREE.Material).dispose();
   for(const override of [{maxModels:257},{maxActors:257},{maxTextChars:65537},{maxModels:0}])expect(()=>new OriginalReceiverProjectilePresentation(f.collection,f.root,{...f.options,...override})).toThrow();expect(f.root.children).toHaveLength(0);
  }finally{f.dispose();}
 });
 it('fails closed on caught recursive getter adoption before target writes and permits a clean retry',()=>{
  const f=fixture(),c=capture();try{const recursive={...c,get template(){try{f.adapter.adopt(prefix,c);}catch{}return c.template;}};expect(()=>f.adapter.adopt(prefix,recursive)).toThrow();expect(f.root.children).toHaveLength(0);expect(f.adapter.freeze()).toBeUndefined();f.adapter.adopt(prefix,c);expect(f.adapter.freeze()).toEqual(c);}finally{f.dispose();}
 });
 it('isolates two lives sharing assets and releases private wrappers idempotently without borrowed disposal',()=>{
  const f=fixture(),c=capture(),otherRoot=new THREE.Group(),other=new OriginalReceiverProjectilePresentation(f.collection,otherRoot,{...f.options,sceneGeneration:5});
  const sources=['rg6grenade','rpgrocket'].map(n=>f.collection.resources.get(n)!);const disposals=sources.flatMap(m=>[vi.spyOn(m.geometry,'dispose'),vi.spyOn(m.material as THREE.Material,'dispose')]);try{
   f.adapter.adopt(prefix,c);const p={...prefix,sceneGeneration:5};other.adopt(p,{...c,prefix:p});expect(other.meshForHandle('grenade-1')).not.toBe(f.adapter.meshForHandle('grenade-1'));f.adapter.release();f.adapter.dispose();expect(f.root.children).toHaveLength(0);expect(otherRoot.children).toHaveLength(1);expect(f.adapter.freeze()).toBeUndefined();expect(()=>f.adapter.adopt(prefix,c)).toThrow();expect(()=>f.adapter.meshForHandle('grenade-1')).toThrow();expect(()=>f.adapter.rebase()).toThrow();disposals.forEach(spy=>expect(spy).not.toHaveBeenCalled());other.release();disposals.forEach(spy=>expect(spy).not.toHaveBeenCalled());
  }finally{other.release();f.dispose();}
 });
});
