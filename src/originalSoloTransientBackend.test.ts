import {describe,it,expect} from 'vitest';
import * as THREE from 'three';
import {captureOriginalSoloTransientSeed,createOriginalSoloTransientBackend,type OriginalSoloTransientBackendOptions,type OriginalSoloTransientSeed} from './originalSoloTransientBackend';

const identity=()=>new THREE.Matrix4().elements;
const seed=():OriginalSoloTransientSeed=>({pose:{position:{x:1,y:2,z:3},yaw:0,phase:0,scale:1,rotation:{x:0,y:0,z:0,w:1}},geometryProvenance:'captured-pack',inWorld:false});
const options=():OriginalSoloTransientBackendOptions=>({plane:seed(),planeWidthWorld:2,muzzles:{pistol:seed(),shotgun:seed(),rifle:seed(),sniper:seed()},pointAtPolicy:'copy-plane-positive-z',omittedUpPolicy:'copy-negative-z',parallelUpPolicy:'copy-x',explicitUpPolicy:'copy-three-lookat',selfRotatePolicy:'copy-local-xyz',coincidentPolicy:'retain',maxTextChars:4096});
const direction=(q:{x:number;y:number;z:number;w:number})=>new THREE.Vector3(0,0,1).applyQuaternion(new THREE.Quaternion(q.x,q.y,q.z,q.w));
describe('detached Solo transient backend',()=>{
 it('captures the existing WORLD matrix without updating or scaling raw units twice',()=>{
  const mesh=new THREE.Mesh();mesh.position.set(999,999,999);mesh.matrixWorld.compose(new THREE.Vector3(4,5,6),new THREE.Quaternion().setFromEuler(new THREE.Euler(.2,.3,.4)),new THREE.Vector3(2,2,2));
  const old=mesh.matrixWorld.elements.slice();
  const captured=captureOriginalSoloTransientSeed(mesh,{renderToWorld:new THREE.Matrix4().makeTranslation(10,20,30).elements,phase:7,geometryProvenance:'actual',inWorld:true,maxTextChars:100});
  expect(captured.pose.position).toEqual({x:14,y:25,z:36});expect(captured.pose.scale).toBeCloseTo(2,12);expect(captured.pose.phase).toBe(7);expect(captured.inWorld).toBe(true);expect(mesh.matrixWorld.elements).toEqual(old);expect(mesh.position.x).toBe(999);
  expect(Object.isFrozen(captured.pose.rotation)).toBe(true);
 });
 it.each(['nonuniform','shear','reflection'] as const)('rejects %s instead of losing affine information',kind=>{
  const mesh=new THREE.Mesh();if(kind==='nonuniform')mesh.matrixWorld.makeScale(1,2,1);if(kind==='shear')mesh.matrixWorld.elements[4]=.2;if(kind==='reflection')mesh.matrixWorld.makeScale(-1,1,1);
  expect(()=>captureOriginalSoloTransientSeed(mesh,{renderToWorld:identity(),phase:0,geometryProvenance:'actual',inWorld:true,maxTextChars:100})).toThrow();
 });
 it('rejects sparse, perspective, singular and nonfinite captures',()=>{
  const mesh=new THREE.Mesh(),o={renderToWorld:identity(),phase:0,geometryProvenance:'actual',inWorld:true,maxTextChars:100};
  const sparse=identity();Reflect.deleteProperty(sparse,2);expect(()=>captureOriginalSoloTransientSeed(mesh,{...o,renderToWorld:sparse})).toThrow();
  for(const values of [new THREE.Matrix4().makeScale(0,1,1).elements,identity().map((n,i)=>i===3?1:n),identity().map((n,i)=>i===12?Infinity:n)])expect(()=>captureOriginalSoloTransientSeed(mesh,{...o,renderToWorld:values})).toThrow();
 });
 it('detaches seeds and clone results, retaining declared membership',()=>{
  const o=options(),b=createOriginalSoloTransientBackend(o);o.plane.pose.position.x=700;
  const one=b.clonePlane('plane1',2);expect(one.pose.position.x).toBe(1);expect(one.inWorld).toBe(false);one.pose.position.x=80;
  expect(b.clonePlane('plane2',2).pose.position.x).toBe(1);expect(b.cloneMuzzle('mfpistol1','pistol').inWorld).toBe(false);
  expect(()=>b.clonePlane('plane3',3)).toThrow(/width/);expect(()=>b.cloneMuzzle('bad','rpg')).toThrow(/muzzle/);
 });
 it('does not fabricate an initial shader and copies supplied shader fields',()=>{
  expect(createOriginalSoloTransientBackend(options()).clonePlane('plane1',2).initialShader).toBeUndefined();
  const shader={handle:'seed',texture:'actual-texture',recycled:false,textureScale:{x:2,y:3,z:4},texturePosition:{x:5,y:6,z:7},blend:22,emissiveWhite:false};
  const b=createOriginalSoloTransientBackend({...options(),initialShader:shader});shader.textureScale.x=900;
  expect(b.clonePlane('plane1',2).initialShader?.textureScale.x).toBe(2);expect(b.clonePlane('plane2',2).initialShader?.blend).toBe(22);
 });
 it('faces plane positive Z toward the target using omitted copy negative Z up',()=>{
  const p=seed().pose,b=createOriginalSoloTransientBackend(options()),q=b.pointAt(p,{x:8,y:2,z:3}),f=direction(q);
  expect(f.x).toBeCloseTo(1,12);expect(f.y).toBeCloseTo(0,12);expect(f.z).toBeCloseTo(0,12);
  const up=new THREE.Vector3(0,1,0).applyQuaternion(new THREE.Quaternion(q.x,q.y,q.z,q.w));expect(up.z).toBeCloseTo(-1,12);expect(p.rotation).toEqual({x:0,y:0,z:0,w:1});
 });
 it('uses exact parallel-up copy X fallback without perturbing target direction',()=>{
  const p=seed().pose,q=createOriginalSoloTransientBackend(options()).pointAt(p,{x:1,y:2,z:0});
  const facing=direction(q);expect(facing.x).toBeCloseTo(0,12);expect(facing.y).toBeCloseTo(0,12);expect(facing.z).toBeCloseTo(-1,12);
  const up=new THREE.Vector3(0,1,0).applyQuaternion(new THREE.Quaternion(q.x,q.y,q.z,q.w));expect(up.x).toBeCloseTo(1,12);
 });
 it('honors explicit copy-space up and rejects zero up',()=>{
  const p=seed().pose,b=createOriginalSoloTransientBackend(options()),q=b.pointAt(p,{x:1,y:2,z:9},{x:0,y:1,z:0});expect(q).toEqual({x:0,y:0,z:0,w:1});
  expect(()=>b.pointAt(p,{x:1,y:2,z:9},{x:0,y:0,z:0})).toThrow();
 });
 it('matches installed Three lookAt for vertical supplied-up blood facing',()=>{
  const p=seed().pose,target={x:1,y:12,z:3},q=createOriginalSoloTransientBackend(options()).pointAt(p,target,{x:0,y:1,z:0});
  const mesh=new THREE.Mesh();mesh.position.set(1,2,3);mesh.up.set(0,1,0);mesh.lookAt(new THREE.Vector3(target.x,target.y,target.z));
  expect(q.x).toBeCloseTo(mesh.quaternion.x,12);expect(q.y).toBeCloseTo(mesh.quaternion.y,12);expect(q.z).toBeCloseTo(mesh.quaternion.z,12);expect(q.w).toBeCloseTo(mesh.quaternion.w,12);
 });
 it('makes coincident facing an explicit retain or reject policy',()=>{
  const p=seed().pose;expect(createOriginalSoloTransientBackend(options()).pointAt(p,p.position)).toEqual(p.rotation);
  expect(()=>createOriginalSoloTransientBackend({...options(),coincidentPolicy:'reject'}).pointAt(p,p.position)).toThrow(/coincident/);
 });
 it('postmultiplies local XYZ degrees, rather than rotating in WORLD order',()=>{
  const base=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),Math.PI/2),q=createOriginalSoloTransientBackend(options()).selfRotate(base,{x:90,y:0,z:0});
  const expected=base.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI/2,0,0,'XYZ')));expect(q.x).toBeCloseTo(expected.x,12);expect(q.y).toBeCloseTo(expected.y,12);expect(q.z).toBeCloseTo(expected.z,12);expect(q.w).toBeCloseTo(expected.w,12);
 });
 it('preflights bounded text, declared policies and shader metadata',()=>{
  for(const maxTextChars of [0,65537,Infinity])expect(()=>createOriginalSoloTransientBackend({...options(),maxTextChars})).toThrow();
  expect(()=>createOriginalSoloTransientBackend({...options(),maxTextChars:20})).toThrow(/budget/);expect(()=>createOriginalSoloTransientBackend({...options(),planeWidthWorld:NaN})).toThrow();
  const b=createOriginalSoloTransientBackend(options());expect(()=>b.clonePlane(' '.repeat(5000),2)).toThrow();expect(()=>b.selfRotate({x:0,y:0,z:0,w:2},{x:0,y:0,z:0})).toThrow();
 });
 it('gives explicit fresh-material shaders stable distinct identities and exact staged texture flags',()=>{
  const initialShader={handle:'seed:plane',texture:'bangrocket',recycled:false,textureScale:{x:1,y:1,z:1},texturePosition:{x:0,y:0,z:0},blend:100,emissiveWhite:true,nearFiltering:true as const};
  const backend=createOriginalSoloTransientBackend({...options(),initialShader,initialShaderIdentity:'per-clone-name'});
  const observed={readTexture:()=>Object.freeze({renderFormat:'rgba8888' as const})};
  const a=backend.clonePlane('plane1',2,observed),again=backend.clonePlane('plane1',2,observed),b=backend.clonePlane('plane2',2,observed);
  expect(a.initialShader).toEqual(again.initialShader);expect(a.initialShader!.handle).not.toBe(b.initialShader!.handle);expect(a.initialShader!.renderFormat).toBe('rgba8888');expect(a.initialShader).not.toHaveProperty('nearFiltering');expect(initialShader.nearFiltering).toBe(true);
  expect(backend.clonePlane('plane3',2,{readTexture:()=>undefined}).initialShader!.nearFiltering).toBe(true);
  expect(()=>backend.clonePlane('plane4',2)).toThrow('staged texture');
 });
 it('keeps offworld templates detached while explicitly admitting copy effect births',()=>{
  const input=options(),backend=createOriginalSoloTransientBackend({...input,cloneMembership:'copy-effect-birth-parented'});
  expect(backend.clonePlane('plane1',2).inWorld).toBe(true);for(const weapon of ['pistol','shotgun','rifle','sniper'] as const)expect(backend.cloneMuzzle(`m-${weapon}`,weapon).inWorld).toBe(true);
  expect(input.plane.inWorld).toBe(false);expect(Object.values(input.muzzles).every(s=>!s.inWorld)).toBe(true);
  expect(()=>createOriginalSoloTransientBackend({...input,cloneMembership:'unknown' as never})).toThrow('membership policy');
 });
 it('rejects invalid identity policy and oversized derived names before texture observation',()=>{
  expect(()=>createOriginalSoloTransientBackend({...options(),initialShaderIdentity:'per-clone-name'})).toThrow('identity policy');
  const initialShader={handle:'s'.repeat(40),texture:'texture',recycled:false,textureScale:{x:1,y:1,z:1},texturePosition:{x:0,y:0,z:0},blend:100,emissiveWhite:true};
  const backend=createOriginalSoloTransientBackend({...options(),initialShader,initialShaderIdentity:'per-clone-name',maxTextChars:200});let reads=0;
  expect(()=>backend.clonePlane('p'.repeat(60),2,{readTexture:()=>{reads++;return undefined;}})).toThrow('shader text budget');expect(reads).toBe(0);
 });
});
