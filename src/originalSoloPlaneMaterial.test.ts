import * as THREE from 'three';
import {describe,it,expect,vi} from 'vitest';
import {createOriginalSoloPlaneMaterial,type OriginalSoloPlaneMaterialOptions} from './originalSoloPlaneMaterial';
import type {OriginalSoloTransientBinding} from './originalSoloTransientResources';
import type {OriginalReceiverTransientInitialShader} from '../shared/originalReceiverTransientWorld';
import {OriginalEffectPlanePool} from './originalEffectPlanePool';

const options:OriginalSoloPlaneMaterialOptions={texture:'bangrocket',constructorPolicy:'copy-fresh-basic-material-borrowed-texture',maxTextChars:8192};
function fixture(){
 const texture=new THREE.Texture(),geometry=new THREE.PlaneGeometry(1,1);
 texture.repeat.set(.25,.5);texture.offset.set(.2,.3);
 const resources={sourceScale:.02,planeWidthWorld:1,planeGeometryProvenance:'loaded WORLD plane',provenance:'loaded FX pack',sidedness:'double',resourceBindingId:'FX-generation',textureBindingId:'texture-generation',textures:new Map([['bangrocket',texture]]),geometries:new Map([['plane',{geometry,unitScale:1}]])};
 const binding={resources,side:THREE.DoubleSide,nearFilter:THREE.LinearFilter} as OriginalSoloTransientBinding;
 return {binding,resources,texture,geometry,dispose(){geometry.dispose();texture.dispose();}};
}
const shader=():OriginalReceiverTransientInitialShader=>({handle:'observed-startup-shader',texture:'bangrocket',recycled:false,blend:37.5,emissiveWhite:false,textureScale:{x:2,y:3,z:4},texturePosition:{x:5,y:6,z:7},specularBlack:false,shininess:0,nearFiltering:true,renderFormat:'rgba8888'});
const observation=()=>({policy:'installed-basic-material-uv-with-unit-z' as const,handle:'installed-startup-shader',recycled:false,provenance:'installed BasicMaterial/borrowed 2D UV constructor observation; explicit unit Z'});
describe('loaded source plane material owner',()=>{
 it('explicitly observes the acquired installed material and exact borrowed inverse UV operands without native flags',()=>{
  const f=fixture(),before={repeat:f.texture.repeat.toArray(),offset:f.texture.offset.toArray(),matrix:f.texture.matrix.toArray(),version:f.texture.version};
  const clone=vi.spyOn(f.texture,'clone'),update=vi.spyOn(f.texture,'updateMatrix'),acquire=vi.spyOn(OriginalEffectPlanePool.prototype,'acquire');
  const owner=createOriginalSoloPlaneMaterial(f.binding,{...options,shaderObservation:observation()});
  try{
   const captured=owner.initialShader!;expect(captured).toMatchObject({handle:'installed-startup-shader',texture:'bangrocket',recycled:false,blend:100,emissiveWhite:true,textureScale:{x:4,y:2,z:1}});
   expect(captured.texturePosition.x).toBeCloseTo(-.8);expect(captured.texturePosition.y).toBeCloseTo(.4);expect(captured.texturePosition.z).toBe(0);
   expect(1/captured.textureScale.x).toBe(f.texture.repeat.x);expect(1/captured.textureScale.y).toBe(f.texture.repeat.y);
   expect(-captured.texturePosition.x/captured.textureScale.x).toBeCloseTo(f.texture.offset.x);expect(1-(captured.texturePosition.y+1)/captured.textureScale.y).toBeCloseTo(f.texture.offset.y);
   expect(owner.shaderProvenance).toBe(observation().provenance);expect(Object.isFrozen(captured)).toBe(true);expect(Object.isFrozen(captured.texturePosition)).toBe(true);expect(Object.isFrozen(captured.textureScale)).toBe(true);
   for(const field of ['specularBlack','shininess','nearFiltering','renderFormat'])expect(Object.hasOwn(captured,field)).toBe(false);
   expect({repeat:f.texture.repeat.toArray(),offset:f.texture.offset.toArray(),matrix:f.texture.matrix.toArray(),version:f.texture.version}).toEqual(before);expect(clone).not.toHaveBeenCalled();expect(update).not.toHaveBeenCalled();expect(acquire).not.toHaveBeenCalled();
   f.texture.repeat.set(1,1);owner.planeMaterial.opacity=.5;expect(owner.initialShader).toBe(captured);expect(captured.blend).toBe(100);expect(captured.textureScale.x).toBe(4);
  }finally{owner.release();acquire.mockRestore();f.dispose();}
 });
 it('keeps declared recycle identity and reads only known observation fields once',()=>{
  const f=fixture();let handles=0,policies=0,provenances=0,recycled=0;
  const raw={get policy(){policies++;return 'installed-basic-material-uv-with-unit-z' as const;},get handle(){handles++;return 'fresh-barrel-shader';},get provenance(){provenances++;return 'installed copy constructor';},get recycled(){recycled++;return true;},get extra(){throw Error('unknown observation walked');}};
  const owner=createOriginalSoloPlaneMaterial(f.binding,{...options,shaderObservation:raw});
  try{expect(owner.initialShader!.recycled).toBe(true);expect([handles,policies,provenances,recycled]).toEqual([1,1,1,1]);expect(Object.hasOwn(owner.initialShader!,'extra')).toBe(false);}finally{owner.release();f.dispose();}
 });
 it('rejects conflicting/invalid/budget-exceeding observation policies before wrapper allocation',()=>{
  const f=fixture(),random=vi.spyOn(Math,'random');
  try{
   const patches=[{shaderObservation:{...observation(),policy:'native-shader-default'}},{shaderObservation:{...observation(),recycled:0}},{shaderObservation:{...observation(),handle:' '}},{shaderObservation:{...observation(),provenance:''}},{shaderObservation:observation(),initialShader:shader(),shaderProvenance:'manual'},{shaderObservation:observation(),shaderProvenance:'manual'},{shaderObservation:observation(),maxTextChars:120}];
   for(const patch of patches)expect(()=>createOriginalSoloPlaneMaterial(f.binding,{...options,...patch} as OriginalSoloPlaneMaterialOptions)).toThrow();expect(random).not.toHaveBeenCalled();
  }finally{random.mockRestore();f.dispose();}
 });
 it.each(['zero-repeat','rotation','center','manual-matrix','nonfinite','overflow'] as const)('releases only the acquired wrapper after unsupported %s texture observation',kind=>{
  const f=fixture();if(kind==='zero-repeat')f.texture.repeat.x=0;if(kind==='rotation')f.texture.rotation=.1;if(kind==='center')f.texture.center.x=.5;if(kind==='manual-matrix')f.texture.matrixAutoUpdate=false;if(kind==='nonfinite')f.texture.offset.y=NaN;if(kind==='overflow')f.texture.repeat.x=Number.MIN_VALUE;
  const dispose=vi.spyOn(THREE.Material.prototype,'dispose'),borrowed=vi.spyOn(f.texture,'dispose'),geometryDispose=vi.spyOn(f.geometry,'dispose');
  try{expect(()=>createOriginalSoloPlaneMaterial(f.binding,{...options,shaderObservation:observation()})).toThrow(/texture observation/);expect(dispose).toHaveBeenCalledOnce();expect(borrowed).not.toHaveBeenCalled();expect(geometryDispose).not.toHaveBeenCalled();}
  finally{dispose.mockRestore();f.dispose();}
 });
 it('rejects a constructor-time binding change and preserves both observation and cleanup failures',()=>{
  const f=fixture(),replacement=new THREE.Texture();
  const random=vi.spyOn(Math,'random').mockImplementation(()=>{f.resources.textures.set('bangrocket',replacement);return .25;}),dispose=vi.spyOn(THREE.Material.prototype,'dispose'),borrowed=vi.spyOn(f.texture,'dispose');
  try{
   expect(()=>createOriginalSoloPlaneMaterial(f.binding,{...options,shaderObservation:observation()})).toThrow('rebound during acquisition');expect(dispose).toHaveBeenCalledOnce();expect(borrowed).not.toHaveBeenCalled();random.mockRestore();dispose.mockRestore();
   f.resources.textures.set('bangrocket',f.texture);f.texture.repeat.x=0;const cleanup=Error('owned observation cleanup failed'),failure=vi.spyOn(THREE.Material.prototype,'dispose').mockImplementation(()=>{throw cleanup;});
   try{let caught:unknown;try{createOriginalSoloPlaneMaterial(f.binding,{...options,shaderObservation:observation()});}catch(error){caught=error;}expect(caught).toBeInstanceOf(AggregateError);const error=caught as AggregateError;expect(error.errors[0].message).toMatch(/texture observation/);expect(error.errors[1]).toBe(cleanup);expect(error.cause).toBe(error.errors[0]);expect(failure).toHaveBeenCalledOnce();expect(borrowed).not.toHaveBeenCalled();}finally{failure.mockRestore();}
  }finally{random.mockRestore();dispose.mockRestore();replacement.dispose();f.dispose();}
 });
 it('owns a fresh installed BasicMaterial wrapper while borrowing the exact texture without pool or UV changes',()=>{
  const f=fixture(),before={repeat:f.texture.repeat.toArray(),offset:f.texture.offset.toArray(),matrix:f.texture.matrix.toArray(),version:f.texture.version};
  const clone=vi.spyOn(f.texture,'clone'),update=vi.spyOn(f.texture,'updateMatrix'),acquire=vi.spyOn(OriginalEffectPlanePool.prototype,'acquire');
  const textureDispose=vi.spyOn(f.texture,'dispose'),geometryDispose=vi.spyOn(f.geometry,'dispose');
  const owner=createOriginalSoloPlaneMaterial(f.binding,options),other=createOriginalSoloPlaneMaterial(f.binding,options),material=owner.planeMaterial;
  try{
   expect(material).toBeInstanceOf(THREE.MeshBasicMaterial);expect(material).not.toBe(other.planeMaterial);expect(material.map).toBe(f.texture);
   expect(material.color.getHex()).toBe(0xffffff);expect(material).toMatchObject({transparent:true,side:THREE.FrontSide,toneMapped:false,depthWrite:false});
   expect(owner.initialShader).toBeUndefined();expect(owner.shaderProvenance).toBeUndefined();
   expect({repeat:f.texture.repeat.toArray(),offset:f.texture.offset.toArray(),matrix:f.texture.matrix.toArray(),version:f.texture.version}).toEqual(before);
   expect(clone).not.toHaveBeenCalled();expect(update).not.toHaveBeenCalled();expect(acquire).not.toHaveBeenCalled();
   owner.release();expect(textureDispose).not.toHaveBeenCalled();expect(geometryDispose).not.toHaveBeenCalled();expect(other.planeMaterial.map).toBe(f.texture);
  }finally{owner.release();other.release();acquire.mockRestore();f.dispose();}
 });
 it('deeply detaches only known observed shader fields and never substitutes renderer flags',()=>{
  const f=fixture(),raw=shader(),owner=createOriginalSoloPlaneMaterial(f.binding,{...options,initialShader:raw,shaderProvenance:'actual issued observation'});
  try{
   const capture=owner.initialShader!;expect(capture).toEqual(raw);expect(capture).not.toBe(raw);expect(Object.isFrozen(capture)).toBe(true);expect(Object.isFrozen(capture.textureScale)).toBe(true);expect(Object.isFrozen(capture.texturePosition)).toBe(true);
   Object.assign(raw,{blend:100,emissiveWhite:true});Object.assign(raw.textureScale,{x:99});expect(capture.blend).toBe(37.5);expect(capture.emissiveWhite).toBe(false);expect(capture.textureScale.x).toBe(2);expect(owner.shaderProvenance).toBe('actual issued observation');
   expect(owner.planeMaterial.transparent).toBe(true);expect(owner.planeMaterial.opacity).toBe(1);
  }finally{owner.release();f.dispose();}
 });
 it('reads known shader operands once and ignores arbitrary extra getters',()=>{
  const f=fixture();let handles=0,vectors=0,xs=0;
  const raw={...shader(),get handle(){handles++;return 'observed';},get textureScale(){vectors++;return {get x(){xs++;return 1;},y:2,z:3,get extra(){throw Error('vector extra');}};},get extra(){throw Error('shader extra');}};
  const owner=createOriginalSoloPlaneMaterial(f.binding,{...options,initialShader:raw,shaderProvenance:'observed'});
  try{expect(owner.initialShader!.textureScale).toEqual({x:1,y:2,z:3});expect([handles,vectors,xs]).toEqual([1,1,1]);expect(Object.hasOwn(owner.initialShader!,'extra')).toBe(false);}finally{owner.release();f.dispose();}
 });
 it('keeps absent optional native shader flags absent',()=>{
  const f=fixture(),{specularBlack:_black,shininess:_shine,nearFiltering:_near,renderFormat:_format,...raw}=shader();
  // Destructured fields are deliberately discarded, without defaults.
  void _black;void _shine;void _near;void _format;
  const owner=createOriginalSoloPlaneMaterial(f.binding,{...options,initialShader:raw,shaderProvenance:'partial observation'});
  try{for(const field of ['specularBlack','shininess','nearFiltering','renderFormat'])expect(Object.hasOwn(owner.initialShader!,field)).toBe(false);}finally{owner.release();f.dispose();}
 });
 it('rejects policy, limits, missing provenance and mismatched or malformed observations before acquisition',()=>{
  const f=fixture(),random=vi.spyOn(Math,'random');
  try{
   const patches=[{constructorPolicy:'native-default'},{maxTextChars:0},{maxTextChars:65537},{texture:'missing'},{initialShader:shader()},{initialShader:shader(),shaderProvenance:' '},{initialShader:{...shader(),texture:'spatter'},shaderProvenance:'observed'},{initialShader:{...shader(),nearFiltering:false},shaderProvenance:'observed'},{initialShader:{...shader(),shininess:1},shaderProvenance:'observed'},{initialShader:{...shader(),renderFormat:'rgb'},shaderProvenance:'observed'},{initialShader:{...shader(),texturePosition:{x:NaN,y:0,z:0}},shaderProvenance:'observed'}];
   for(const patch of patches)expect(()=>createOriginalSoloPlaneMaterial(f.binding,{...options,...patch} as OriginalSoloPlaneMaterialOptions)).toThrow();
   expect(random).not.toHaveBeenCalled();
  }finally{random.mockRestore();f.dispose();}
 });
 it('bounds intrinsic map size and aggregate names/observation text before construction',()=>{
  const f=fixture(),random=vi.spyOn(Math,'random');
  try{
   expect(()=>createOriginalSoloPlaneMaterial(f.binding,{...options,maxTextChars:10})).toThrow('text budget');
   expect(()=>createOriginalSoloPlaneMaterial(f.binding,{...options,maxTextChars:150,initialShader:shader(),shaderProvenance:'o'.repeat(100)})).toThrow('text budget');
   const textures=new Map(Array.from({length:257},(_,i)=>[`texture-${i}`,f.texture] as const));
   Object.defineProperty(textures,'size',{get(){throw Error('instance size walked');}});
   const malformed={...f.binding,resources:{...f.resources,textures}} as OriginalSoloTransientBinding;
   expect(()=>createOriginalSoloPlaneMaterial(malformed,options)).toThrow('resource bank');
   f.resources.textures.set(' bad ',f.texture);expect(()=>createOriginalSoloPlaneMaterial(f.binding,options)).toThrow('text');
   expect(random).not.toHaveBeenCalled();
  }finally{random.mockRestore();f.dispose();}
 });
 it('uses intrinsic bank access and rejects malformed resource schema',()=>{
  const f=fixture();
  Object.defineProperty(f.resources.textures,'get',{value(){throw Error('instance get walked');}});
  Object.defineProperty(f.resources.textures,Symbol.iterator,{value(){throw Error('instance iterator walked');}});
  const owner=createOriginalSoloPlaneMaterial(f.binding,options);owner.release();
  try{
   f.resources.geometries.set('plane',{geometry:f.geometry,unitScale:2});expect(()=>createOriginalSoloPlaneMaterial(f.binding,options)).toThrow('WORLD plane');
   f.resources.geometries.set('plane',{geometry:f.geometry,unitScale:NaN});expect(()=>createOriginalSoloPlaneMaterial(f.binding,options)).toThrow('geometry');
  }finally{f.dispose();}
 });
 it('guards material rebinding and external material/borrowed texture disposal',()=>{
  const f=fixture(),first=createOriginalSoloPlaneMaterial(f.binding,options),second=createOriginalSoloPlaneMaterial(f.binding,options),third=createOriginalSoloPlaneMaterial(f.binding,options);
  const material=first.planeMaterial;material.map=null;expect(()=>first.initialShader).toThrow('rebound');
  second.planeMaterial.dispose();expect(()=>second.shaderProvenance).toThrow('disposed');
  f.texture.dispose();expect(()=>third.planeMaterial).toThrow('disposed');first.release();second.release();third.release();f.dispose();
 });
 it('guards rebinding of the captured bank entry',()=>{
  const f=fixture(),owner=createOriginalSoloPlaneMaterial(f.binding,options),replacement=new THREE.Texture();
  try{f.resources.textures.set('bangrocket',replacement);expect(()=>owner.planeMaterial).toThrow('rebound');expect(()=>owner.initialShader).toThrow('rebound');}finally{owner.release();replacement.dispose();f.dispose();}
 });
 it('attempts only owned disposal once even when it throws, then guards every reader',()=>{
  const f=fixture(),owner=createOriginalSoloPlaneMaterial(f.binding,options),material=owner.planeMaterial,error=new Error('material disposal failure');
  const dispose=vi.spyOn(material,'dispose').mockImplementation(()=>{throw error;}),borrowed=vi.spyOn(f.texture,'dispose');
  try{
   expect(()=>owner.release()).toThrow(error);owner.release();expect(dispose).toHaveBeenCalledOnce();expect(borrowed).not.toHaveBeenCalled();
   expect(()=>owner.planeMaterial).toThrow('released');expect(()=>owner.initialShader).toThrow('released');expect(()=>owner.shaderProvenance).toThrow('released');
  }finally{dispose.mockRestore();f.dispose();}
 });
});
