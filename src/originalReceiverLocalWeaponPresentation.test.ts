import * as THREE from 'three';
import {readFileSync} from 'node:fs';
import {describe,expect,it,vi} from 'vitest';
import {OriginalReceiverLocalWeaponPresentation} from './originalReceiverLocalWeaponPresentation';
import {createOriginalWeapons,ORIGINAL_WEAPON_TEXTURES,type OriginalWeaponGeometryData} from './originalWeapons';
import {ORIGINAL_RECEIVER_LOCAL_WEAPON_RESOURCES,type ReceiverLocalWeaponModelCapture} from '../shared/originalReceiverLocalWeaponInventory';
import type {ReceiverLocalWeaponWorldCheckpoint} from '../shared/originalReceiverLocalWeaponWorld';

const geometry=JSON.parse(readFileSync(new URL('../public/assets/original-weapons/geometry.json',import.meta.url),'utf8')) as OriginalWeaponGeometryData;
const prefix={kind:'callback' as const,sceneGeneration:4,callback:1};
const identity=()=>new THREE.Matrix4().toArray();
const handles=Object.entries(ORIGINAL_RECEIVER_LOCAL_WEAPON_RESOURCES);
function capture():ReceiverLocalWeaponWorldCheckpoint{
 const camera=new THREE.Matrix4().compose(new THREE.Vector3(30,40,50),new THREE.Quaternion().setFromEuler(new THREE.Euler(.2,.5,-.3)),new THREE.Vector3(1,1,1));
 return {prefix,cameraHandle:'private-camera',cameraWorldMatrix:camera.toArray(),selectedWeapon:'rifle',loadedRocket:false,motion:{weapon:'rifle',ticker:7,gunPositionSource:{x:3,y:-10,z:7}},models:handles.map(([handle,resource],i)=>{
  const local=new THREE.Matrix4().compose(new THREE.Vector3(i+.5,-2,1),new THREE.Quaternion().setFromEuler(new THREE.Euler(.1,.2,-.5)),new THREE.Vector3(.03,.02,-.01));
  local.elements[4]+=.007; // Explicit affine shear; decomposition loses it.
  return {handle:handle as ReceiverLocalWeaponModelCapture['handle'],resource,worldMatrix:camera.clone().multiply(local).toArray(),inWorld:handle==='ak47'||handle==='rocket',groupAncestry:['private-camera']};
 })};
}
function fixture(){
 const textures=new Map(ORIGINAL_WEAPON_TEXTURES.map(name=>[name,new THREE.Texture()]));
 const collection=createOriginalWeapons({geometry,textures});
 const parent=new THREE.Group(),root=new THREE.Group();parent.position.set(10,20,30);parent.rotation.set(.1,-.4,.3);parent.scale.set(2,1,3);parent.add(root);root.position.set(1,-2,3);root.rotation.set(.2,.3,.4);parent.updateMatrixWorld(true);
 const adapter=new OriginalReceiverLocalWeaponPresentation(collection,root,{sceneGeneration:4,maxTextChars:8192});
 return {collection,root,parent,adapter,dispose(){adapter.release();collection.dispose();}};
}
function closePoint(a:THREE.Vector3,b:THREE.Vector3){expect(a.x).toBeCloseTo(b.x,4);expect(a.y).toBeCloseTo(b.y,4);expect(a.z).toBeCloseTo(b.z,4);}

describe('explicit source WORLD to pre-scaled renderer binding (CPU geometry, no native projection claim)',()=>{
 it('maps real decoded vertices through full affine captures once under a transformed render root',()=>{
  const f=fixture(),c=capture();try{
   f.adapter.adopt(prefix,c,identity());
   for(const m of c.models){
    const mesh=f.collection.resources.get(m.resource)!;expect(mesh.parent).toBe(f.root);expect(mesh.matrixAutoUpdate).toBe(false);expect(mesh.visible).toBe(m.inWorld);
    const raw=geometry.meshes.find(g=>g.resource===m.resource)!.positions;
    for(const index of [0,Math.floor(raw.length/2),raw.length-1]){
     const rendered=new THREE.Vector3().fromBufferAttribute(mesh.geometry.getAttribute('position'),index).applyMatrix4(mesh.matrixWorld);
     const expected=new THREE.Vector3().fromArray(raw[index]).applyMatrix4(new THREE.Matrix4().fromArray([...m.worldMatrix]));closePoint(rendered,expected);
    }
   }
   expect(f.adapter.freeze()).toEqual(c);
  }finally{f.dispose();}
 });
 it('uses an explicit world-to-overlay transform without adding camera rotation or source scale twice',()=>{
  const f=fixture(),c=capture();try{
   const overlay=new THREE.Matrix4().makeTranslation(2,3,4),conversion=overlay.clone().multiply(new THREE.Matrix4().fromArray([...c.cameraWorldMatrix]).invert());
   // Canonical affine input; inversion can round the mathematical bottom row.
   conversion.elements[3]=conversion.elements[7]=conversion.elements[11]=0;conversion.elements[15]=1;
   f.adapter.adopt(prefix,c,conversion.toArray());
   for(const m of c.models){const mesh=f.collection.resources.get(m.resource)!,raw=geometry.meshes.find(g=>g.resource===m.resource)!.positions[0];closePoint(new THREE.Vector3().fromBufferAttribute(mesh.geometry.getAttribute('position'),0).applyMatrix4(mesh.matrixWorld),new THREE.Vector3().fromArray(raw).applyMatrix4(new THREE.Matrix4().fromArray([...m.worldMatrix])).applyMatrix4(conversion));}
  }finally{f.dispose();}
 });
 it('renders rocket membership independently of loaded metadata and logical selected gun',()=>{
  const f=fixture(),c=capture();try{f.collection.models.get('rpg')!.visible=false;f.adapter.adopt(prefix,c,identity());expect(f.collection.rocket.parent).toBe(f.root);expect(f.collection.rocket.visible).toBe(true);expect(f.adapter.freeze()!.loadedRocket).toBe(false);expect(f.collection.resources.get('rpg')!.visible).toBe(false);}finally{f.dispose();}
 });
 it('retains detached capture metadata and updates exact matrices without animation',()=>{
  const f=fixture(),c=capture();try{f.adapter.adopt(prefix,c,identity());(c.models[0].worldMatrix as number[])[12]=999;(c.motion.gunPositionSource as {x:number}).x=999;expect(f.adapter.freeze()!.models[0].worldMatrix[12]).not.toBe(999);expect(f.adapter.freeze()!.motion.gunPositionSource.x).toBe(3);expect(f.adapter.freeze()!.motion.ticker).toBe(7);expect(Object.isFrozen(f.adapter.freeze()!.models)).toBe(true);}finally{f.dispose();}
 });
 it('rejects malformed final records before changing any target or publishing a capture',()=>{
  const f=fixture(),c=capture(),parents=c.models.map(m=>f.collection.resources.get(m.resource)!.parent);try{
   const models=c.models.map(m=>({...m,worldMatrix:[...m.worldMatrix]}));models[6].worldMatrix[15]=0;
   expect(()=>f.adapter.adopt(prefix,{...c,models},identity())).toThrow();expect(f.adapter.freeze()).toBeUndefined();c.models.forEach((m,i)=>expect(f.collection.resources.get(m.resource)!.parent).toBe(parents[i]));
  }finally{f.dispose();}
 });
 it('rejects singular root and world conversion without adopting',()=>{
  const f=fixture(),c=capture();try{f.root.scale.x=0;f.parent.updateMatrixWorld(true);expect(()=>f.adapter.adopt(prefix,c,identity())).toThrow();expect(f.adapter.freeze()).toBeUndefined();f.root.scale.x=1;f.parent.updateMatrixWorld(true);expect(()=>f.adapter.adopt(prefix,c,new THREE.Matrix4().makeScale(0,1,1).toArray())).toThrow();expect(f.adapter.freeze()).toBeUndefined();}finally{f.dispose();}
 });
 it('rejects wrong generation, absent/duplicate resource and oversized model count before reading entries',()=>{
  const f=fixture(),c=capture();try{
   expect(()=>f.adapter.adopt({...prefix,sceneGeneration:5},{...c,prefix:{...prefix,sceneGeneration:5}},identity())).toThrow();expect(()=>f.adapter.adopt(prefix,{...c,models:c.models.slice(1)},identity())).toThrow();
   expect(()=>f.adapter.adopt(prefix,{...c,models:[...c.models.slice(0,6),c.models[0]]},identity())).toThrow();
   let reads=0;const huge=new Array(8);Object.defineProperty(huge,0,{get(){reads++;throw Error('entry read');}});expect(()=>f.adapter.adopt(prefix,{...c,models:huge},identity())).toThrow();expect(reads).toBe(0);expect(f.adapter.freeze()).toBeUndefined();
  }finally{f.dispose();}
 });
 it('fails closed when an input getter catches recursive adoption before target writes',()=>{
  const f=fixture(),c=capture(),mesh=f.collection.resources.get('ak47')!,parent=mesh.parent;try{
   const nested={...c,get cameraHandle(){try{f.adapter.adopt(prefix,c,identity());}catch{}return 'private-camera';}};
   expect(()=>f.adapter.adopt(prefix,nested,identity())).toThrow();expect(mesh.parent).toBe(parent);expect(f.adapter.freeze()).toBeUndefined();
   f.adapter.adopt(prefix,c,identity());expect(f.adapter.freeze()).toEqual(c);
  }finally{f.dispose();}
 });
 it('does not publish accepted metadata when the last matrix update catches recursive adoption',()=>{
  const f=fixture(),c=capture(),mesh=f.collection.rocket,update=mesh.updateWorldMatrix.bind(mesh);
  const hook=vi.spyOn(mesh,'updateWorldMatrix').mockImplementation((up,down)=>{try{f.adapter.adopt(prefix,c,identity());}catch{}update(up,down);});
  try{expect(()=>f.adapter.adopt(prefix,c,identity())).toThrow();expect(f.adapter.freeze()).toBeUndefined();}finally{hook.mockRestore();f.dispose();}
 });
 it('restores borrowed parents/transforms/visibility on release and never disposes geometry/material',()=>{
  const f=fixture(),c=capture(),mesh=f.collection.resources.get('ak47')!,originalParent=mesh.parent;mesh.position.set(9,8,7);mesh.updateMatrix();
  // Restoration snapshots are owned at adapter construction, before this later
  // caller change. This fixture explicitly asserts that lifetime contract.
  const disposeGeometry=vi.spyOn(mesh.geometry,'dispose'),disposeMaterial=vi.spyOn(mesh.material as THREE.Material,'dispose');
  f.adapter.adopt(prefix,c,identity());f.adapter.release();expect(mesh.parent).toBe(originalParent);expect(mesh.position.toArray()).toEqual([0,0,0]);expect(mesh.matrixAutoUpdate).toBe(true);expect(f.collection.rocket.parent).toBe(f.collection.models.get('rpg'));expect(disposeGeometry).not.toHaveBeenCalled();expect(disposeMaterial).not.toHaveBeenCalled();expect(f.adapter.freeze()).toBeUndefined();expect(()=>f.adapter.adopt(prefix,c,identity())).toThrow();f.collection.dispose();
 });
});
