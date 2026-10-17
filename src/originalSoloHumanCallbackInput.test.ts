import {describe,it,expect,vi} from 'vitest';
import * as THREE from 'three';
import {captureOriginalSoloHumanCallbackInput,type OriginalSoloHumanCallbackInputOptions} from './originalSoloHumanCallbackInput';

function options():{-readonly [K in keyof OriginalSoloHumanCallbackInputOptions]:OriginalSoloHumanCallbackInputOptions[K]} {
 return {prefix:{kind:'callback',sceneGeneration:3,callback:7},cameraWorldMatrix:new THREE.Matrix4().elements,velocityWorld:{x:1,y:-2,z:3},pitchRadians:Math.PI/6,yawRadians:-Math.PI/4,
  typing:false,firing:false,keys:new Set<string>(),sourceScopeEnabled:false,weaponModelPresent:{pistol:true,shotgun:false,rifle:true,launcher:true,rpg:true,sniper:false}};
}
describe('human callback input capture',()=>{
 it('detaches and freezes only declared fields before any later input changes',()=>{
  const raw=options(),keys=new Set(['Digit2','KeyR']),velocity={...raw.velocityWorld},matrix=[...raw.cameraWorldMatrix],prefix={...raw.prefix},presence={...raw.weaponModelPresent};
  const input=captureOriginalSoloHumanCallbackInput({...raw,keys,velocityWorld:velocity,cameraWorldMatrix:matrix,prefix,weaponModelPresent:presence});
  keys.clear();velocity.x=99;matrix[12]=100;prefix.callback=8;presence.pistol=false;
  expect(input.prefix.callback).toBe(7);expect(input.velocityWorld.x).toBe(1);expect(input.cameraWorldMatrix[12]).toBe(0);expect(input.weaponModelPresent.pistol).toBe(true);
  expect(input.held).toEqual({typing:false,reload:true,fire:false,digits:[false,true,false,false,false,false]});
  for(const value of [input,input.prefix,input.cameraWorldMatrix,input.velocityWorld,input.sourceRotation,input.held,input.held.digits,input.weaponModelPresent])expect(Object.isFrozen(value)).toBe(true);
 });
 it('reads all known keys once despite firing, typing, and left modifiers already held',()=>{
  const calls:string[]=[],has=vi.fn((key:string)=>{calls.push(key);return true;});
  const input=captureOriginalSoloHumanCallbackInput({...options(),firing:true,typing:true,keys:{has}});
  expect(calls).toEqual(['KeyR','ControlLeft','ControlRight','Digit1','Digit2','Digit3','Digit4','Digit5','Digit6','ShiftLeft','ShiftRight']);
  expect(input.held).toEqual({typing:true,reload:true,fire:true,digits:[true,true,true,true,true,true]});expect(input.shiftHeld).toBe(true);
 });
 it.each(['ControlLeft','ControlRight'])('uses physical %s as fire without mouse firing',key=>{
  expect(captureOriginalSoloHumanCallbackInput({...options(),keys:new Set([key])}).held.fire).toBe(true);
 });
 it.each(['ShiftLeft','ShiftRight'])('captures %s independently of sniper model existence or scope enablement',key=>{
  const captured=captureOriginalSoloHumanCallbackInput({...options(),keys:new Set([key])});expect(captured.shiftHeld).toBe(true);expect(captured.sourceScopeEnabled).toBe(false);expect(captured.weaponModelPresent.sniper).toBe(false);
 });
 it('keeps camera WORLD recoil distinct from logical source rotation with no unit conversion or mutation',()=>{
  const parent=new THREE.Group(),camera=new THREE.PerspectiveCamera();parent.position.set(13,-7,4);parent.rotation.set(.1,.4,-.2);parent.scale.set(2,3,4);parent.add(camera);
  const pitch=.3,yaw=-.6;camera.position.set(1,2,3);camera.rotation.set(pitch+.09,yaw,0,'YXZ');parent.updateMatrixWorld(true);
  const actual=[...camera.matrixWorld.elements],update=vi.spyOn(camera,'updateMatrixWorld'),random=vi.spyOn(Math,'random').mockImplementation(()=>{throw Error('Unexpected RNG');});
  try {
   const captured=captureOriginalSoloHumanCallbackInput({...options(),cameraWorldMatrix:camera.matrixWorld.elements,pitchRadians:pitch,yawRadians:yaw,sourceScopeEnabled:true});
   expect(captured.cameraWorldMatrix).toEqual(actual);expect(captured.cameraWorldMatrix).not.toBe(camera.matrixWorld.elements);
   expect(captured.sourceRotation).toEqual({x:pitch*180/Math.PI,y:0,z:yaw*180/Math.PI});expect(captured.sourceRotation.x).not.toBeCloseTo(camera.rotation.x*180/Math.PI);
   expect(camera.matrixWorld.elements).toEqual(actual);expect(update).not.toHaveBeenCalled();expect(random).not.toHaveBeenCalled();expect(captured.sourceScopeEnabled).toBe(true);
  } finally {random.mockRestore();update.mockRestore();}
 });
 it('does not enumerate or copy arbitrary caller fields',()=>{
  const raw=options();Object.defineProperty(raw,'undeclared',{enumerable:true,get(){throw Error('Unexpected field');}});
  Object.defineProperty(raw.velocityWorld,'undeclared',{enumerable:true,get(){throw Error('Unexpected velocity field');}});
  Object.defineProperty(raw.weaponModelPresent,'undeclared',{enumerable:true,get(){throw Error('Unexpected presence field');}});
  expect(Object.keys(captureOriginalSoloHumanCallbackInput(raw))).toEqual(['prefix','cameraWorldMatrix','velocityWorld','sourceRotation','held','shiftHeld','sourceScopeEnabled','weaponModelPresent']);
 });
 it.each(['receipt','negative-life','fractional-callback','null'])('rejects %s prefix',mode=>{
  const prefix=mode==='receipt'?{kind:'receipt',sceneGeneration:3,callback:7,tick:0}:mode==='negative-life'?{kind:'callback',sceneGeneration:-1,callback:7}:mode==='fractional-callback'?{kind:'callback',sceneGeneration:3,callback:7.5}:null;
  expect(()=>captureOriginalSoloHumanCallbackInput({...options(),prefix} as unknown as OriginalSoloHumanCallbackInputOptions)).toThrow();
 });
 it.each(['null','short','sparse','nan','projective','rounded-affine','singular','inverse-overflow'])('rejects %s camera matrix without repair',mode=>{
  let matrix:number[]|null=new THREE.Matrix4().elements;
  if(mode==='null')matrix=null;else if(mode==='short')matrix.pop();else if(mode==='sparse')Reflect.deleteProperty(matrix,5);else if(mode==='nan')matrix[9]=NaN;
  else if(mode==='projective')matrix[3]=.01;else if(mode==='rounded-affine')matrix[15]=1+Number.EPSILON;else if(mode==='singular')matrix[0]=0;else matrix[0]=Number.MIN_VALUE;
  expect(()=>captureOriginalSoloHumanCallbackInput({...options(),cameraWorldMatrix:matrix} as unknown as OriginalSoloHumanCallbackInputOptions)).toThrow();
 });
 it.each(['pitch','yaw','degree-overflow','velocity','typing','firing','scope','presence','missing-presence','keys','key-result'])('rejects malformed %s operands',mode=>{
  const raw=options();
  if(mode==='pitch')raw.pitchRadians=NaN;else if(mode==='yaw')raw.yawRadians=Infinity;else if(mode==='degree-overflow')raw.pitchRadians=Number.MAX_VALUE;
  else if(mode==='velocity')raw.velocityWorld={x:Infinity,y:0,z:0};else if(mode==='typing')Reflect.set(raw,'typing',null);else if(mode==='firing')Reflect.set(raw,'firing',1);
  else if(mode==='scope')Reflect.set(raw,'sourceScopeEnabled','true');else if(mode==='presence')Reflect.set(raw.weaponModelPresent,'pistol',undefined);else if(mode==='missing-presence')Reflect.set(raw,'weaponModelPresent',null);
  else if(mode==='keys')Reflect.set(raw,'keys',null);else Reflect.set(raw,'keys',{has:()=>undefined});
  expect(()=>captureOriginalSoloHumanCallbackInput(raw)).toThrow();
 });
});
