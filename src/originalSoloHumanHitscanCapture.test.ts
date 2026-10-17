import {describe,it,expect,vi} from 'vitest';
import {captureOriginalSoloHumanHitscan} from './originalSoloHumanHitscanCapture';
import type {OriginalSoloHumanCallbackInput} from './originalSoloHumanCallbackInput';
import type {OriginalSoloReceiverCurrentContext} from '../shared/originalSoloObserverWorld';
import type {OriginalSoloGunHitscanCapture} from '../shared/originalSoloGunCallbackProgram';
import type {ReceiverLocalWeaponWorldCheckpoint} from '../shared/originalReceiverLocalWeaponWorld';
import type {WeaponId} from '../shared/protocol';
import {ORIGINAL_RECEIVER_LOCAL_WEAPON_RESOURCES} from '../shared/originalReceiverLocalWeaponInventory';
import {createOriginalPlayerBody,originalPlayerEye} from '../shared/originalPlayerPhysics';

const matrix=(x=0)=>[1,0,0,0,0,1,0,0,0,0,1,0,x,2,3,1];
const options={sourceScale:.02,bspWorld:1,maxModels:64,maxTextChars:8192};
function fixture(weapon:WeaponId='rifle',rayIndex=0){
 const prefix={kind:'callback' as const,sceneGeneration:3,callback:1},actorNames=new Map([['old',{name:'Old',lifeGeneration:2}]]);
 const world={id:'player',name:'Human',lifeGeneration:3,body:createOriginalPlayerBody('player',{x:10,y:20,z:30}),health:{},barrels:{sourceScale:.02},doors:undefined,projectiles:new Map(),blasts:new Map(),actorNames,callback:0,receiptTick:0,updatedAt:4,alive:true};
 const context={observer:world,target:world,id:'player',name:'Human',lifeGeneration:3,body:world.body,health:world.health,barrels:world.barrels,doors:undefined,projectiles:world.projectiles,blasts:world.blasts,actorNames,alive:true,deliveryKind:'where',phase:'physics',afterGoody:true,mirrorCallback:0,physicalCallback:1,receiptTick:0,time:4,order:{callbacks:1,receiptCallbacks:0},receiptActorNames:[{actorId:'new',name:'New',lifeGeneration:9}]} as unknown as OriginalSoloReceiverCurrentContext;
 const cameraWorldMatrix=matrix(),input:OriginalSoloHumanCallbackInput={prefix,cameraWorldMatrix,sourceRotation:{x:12,y:0,z:34},velocityWorld:{x:0,y:0,z:0},held:{typing:false,reload:false,fire:true,digits:[false,false,false,false,false,false]},shiftHeld:false,sourceScopeEnabled:true,weaponModelPresent:{pistol:true,shotgun:true,rifle:true,launcher:true,rpg:true,sniper:true}};
 const rayCoordinates=weapon==='shotgun'?[[310,190],[330,210]]:[[320,200]];
 const request={intentIndex:5,rayIndex,coordinates:rayCoordinates[rayIndex],fire:{kind:'fire',action:'hitscan',weapon,rayCoordinates},checkpoint:{prefix,selected:weapon},precedingCommands:[]} as unknown as OriginalSoloGunHitscanCapture;
 const preview={prefix,cameraHandle:'camera',cameraWorldMatrix,selectedWeapon:weapon,loadedRocket:false,motion:{weapon,ticker:7,gunPositionSource:{x:0,y:0,z:0}},models:Object.entries(ORIGINAL_RECEIVER_LOCAL_WEAPON_RESOURCES).map(([handle,resource])=>({handle,resource,worldMatrix:matrix(5),inWorld:true,groupAncestry:['camera']}))} as ReceiverLocalWeaponWorldCheckpoint;
 const capture=()=>captureOriginalSoloHumanHitscan(context,input,request,preview,options);
 return {world,context,input,request,preview,capture};
}
describe('operation-time authored human hitscan operands',()=>{
 it.each(['pistol','shotgun','rifle','sniper'] as const)('%s captures actual post-goody eye, source aim and preview gun pose without query/RNG/mutation',weapon=>{
  const f=fixture(weapon),before=JSON.stringify({body:f.world.body,input:f.input,preview:f.preview}),random=vi.spyOn(Math,'random');
  try{
   const action=f.capture();expect(action.weapon).toBe(weapon);expect(action.origin).toEqual(originalPlayerEye(f.world.body));expect(action.sourceRotation).toEqual(f.input.sourceRotation);
   expect(action.gunPose.position).toEqual({x:5,y:2,z:3});expect(action.gunPose.scale).toBe(50);expect(action.actorNames).toEqual({old:'Old',new:'New'});
   expect(Object.isFrozen(action)).toBe(true);expect(Object.isFrozen(action.actorNames)).toBe(true);expect(Object.isFrozen(action.origin)).toBe(true);expect(Object.isFrozen(action.sourceRotation)).toBe(true);expect(Object.isFrozen(action.gunPose.position)).toBe(true);
   expect(random).not.toHaveBeenCalled();expect(JSON.stringify({body:f.world.body,input:f.input,preview:f.preview})).toBe(before);
   f.world.body.position.x=99;Object.assign(f.input.sourceRotation,{x:99});(f.preview.models[0].worldMatrix as number[])[12]=99;expect(action.origin.x).toBe(10);expect(action.sourceRotation.x).toBe(12);expect(action.gunPose.position.x).toBe(5);
  }finally{random.mockRestore();}
 });
 it('captures identical literal SPAS aim twice with distinct deterministic effect/muzzle identities',()=>{
  const first=fixture('shotgun',0),second=fixture('shotgun',1),a=first.capture(),b=second.capture();
  expect(a.origin).toEqual(b.origin);expect(a.sourceRotation).toEqual(b.sourceRotation);expect(a.gunPose).toEqual(b.gunPose);expect(a.effectId).not.toBe(b.effectId);expect(a.muzzleId).not.toBe(b.muzzleId);expect(a.effectId).not.toBe(a.muzzleId);
  expect(first.capture()).toEqual(a);
 });
 it('includes newborn receipt names on the first callback and lets receipt names supersede prior metadata',()=>{
  const f=fixture();f.world.actorNames.clear();expect(f.capture().actorNames).toEqual({new:'New'});
  f.world.actorNames.set('new',{name:'Old name',lifeGeneration:8});expect(f.capture().actorNames).toEqual({new:'New'});
 });
 it('preserves exact nonempty actor names including surrounding spaces',()=>{
  const f=fixture();f.world.actorNames.set('old',{name:' Old ',lifeGeneration:2});
  expect(captureOriginalSoloHumanHitscan({...f.context,receiptActorNames:[{actorId:'new',name:' New ',lifeGeneration:9}]},f.input,f.request,f.preview,options).actorNames).toEqual({old:' Old ',new:' New '});
 });
 it('retains the prior dead actor at the pre-detach gun boundary, then respects the next pruned prior map',()=>{
  const f=fixture();
  // Death receipts mark the mirror actor dead but do not detach its model.
  // CURRENT gun dispatch precedes RemoteView's actor-detach loop, so the old
  // binding remains queryable on that first following callback.
  expect(f.capture().actorNames).toEqual({old:'Old',new:'New'});
  // After committed detach, coordinator nextPoses pruning removes the name.
  f.world.actorNames.delete('old');expect(f.capture().actorNames).toEqual({new:'New'});
 });
 it('uses bounded intrinsic Map access and never arbitrary iterators or unknown fields',()=>{
  const f=fixture();Object.defineProperty(f.world.actorNames,'size',{get(){throw Error('instance size');}});Object.defineProperty(f.world.actorNames,Symbol.iterator,{value(){throw Error('instance iterator');}});Object.defineProperty(f.world.actorNames,'forEach',{value(){throw Error('instance traversal');}});
  Object.defineProperty(f.request,'extra',{get(){throw Error('extra request');}});Object.defineProperty(f.context.receiptActorNames[0],'extra',{get(){throw Error('extra row');}});
  expect(f.capture().actorNames).toEqual({old:'Old',new:'New'});
 });
 it('rejects foreign/dead/wrong-phase contexts and mismatched actual callback/preview/request identities',()=>{
  const f=fixture();
  for(const patch of [{id:'bot'},{lifeGeneration:4},{body:{...f.world.body}},{alive:false},{afterGoody:false},{deliveryKind:'death'},{phase:'goody'},{physicalCallback:2},{time:3},{mirrorCallback:1},{receiptTick:1},{order:{callbacks:2,receiptCallbacks:0}}])expect(()=>captureOriginalSoloHumanHitscan({...f.context,...patch} as OriginalSoloReceiverCurrentContext,f.input,f.request,f.preview,options)).toThrow('boundary');
  expect(()=>captureOriginalSoloHumanHitscan(f.context,{...f.input,prefix:{kind:'callback',sceneGeneration:3,callback:2}},f.request,f.preview,options)).toThrow('boundary');
  expect(()=>captureOriginalSoloHumanHitscan(f.context,f.input,f.request,f.preview,{...options,sourceScale:.03})).toThrow('boundary');
  expect(()=>captureOriginalSoloHumanHitscan(f.context,f.input,f.request,{...f.preview,prefix:{kind:'receipt',sceneGeneration:3,callback:1,tick:1}},options)).toThrow('boundary');
  expect(()=>captureOriginalSoloHumanHitscan(f.context,f.input,f.request,{...f.preview,cameraWorldMatrix:matrix(9)},options)).toThrow('camera');
  expect(()=>captureOriginalSoloHumanHitscan(f.context,f.input,{...f.request,coordinates:[0,0]},f.preview,options)).toThrow('coordinates');
 });
 it('rejects explosive or wrong selected/ordinal/ray requests',()=>{
  const f=fixture();for(const patch of [{intentIndex:-1},{intentIndex:64},{rayIndex:1},{fire:{...f.request.fire,weapon:'rpg'}},{fire:{...f.request.fire,action:'rocket-constructor'}},{checkpoint:{...f.request.checkpoint,selected:'pistol'}}])expect(()=>captureOriginalSoloHumanHitscan(f.context,f.input,{...f.request,...patch} as OriginalSoloGunHitscanCapture,f.preview,options)).toThrow('request');
  expect(()=>captureOriginalSoloHumanHitscan(f.context,f.input,f.request,{...f.preview,selectedWeapon:'pistol'},options)).toThrow('request');
 });
 it('checks scalar limits before context walking and actor count before row traversal',()=>{
  const unread={get observer(){throw Error('context walked');}} as unknown as OriginalSoloReceiverCurrentContext,f=fixture();
  for(const patch of [{sourceScale:0},{bspWorld:NaN},{maxModels:0},{maxModels:10001},{maxTextChars:0},{maxTextChars:65537}])expect(()=>captureOriginalSoloHumanHitscan(unread,f.input,f.request,f.preview,{...options,...patch})).toThrow('limits');
  const oversized=new Array(65);Object.defineProperty(oversized,0,{get(){throw Error('row walked');}});
  expect(()=>captureOriginalSoloHumanHitscan({...f.context,receiptActorNames:oversized},f.input,f.request,f.preview,options)).toThrow('budget');
  const many=fixture();for(let i=0;i<65;i++)many.world.actorNames.set(`actor-${i}`,{name:'Actor',lifeGeneration:1});expect(()=>many.capture()).toThrow('budget');
  expect(()=>captureOriginalSoloHumanHitscan(f.context,f.input,f.request,f.preview,{...options,maxTextChars:20})).toThrow('text budget');
 });
 it('rejects repeated receipt IDs, malformed life/name entries and excess merged inventory',()=>{
  const f=fixture(),rows=f.context.receiptActorNames;
  expect(()=>captureOriginalSoloHumanHitscan({...f.context,receiptActorNames:[rows[0],rows[0]]},f.input,f.request,f.preview,options)).toThrow('Repeated');
  f.world.actorNames.set('old',{name:'',lifeGeneration:2});expect(()=>f.capture()).toThrow('label');f.world.actorNames.set('old',{name:0 as unknown as string,lifeGeneration:2});expect(()=>f.capture()).toThrow('label');f.world.actorNames.set('old',{name:'Old',lifeGeneration:0});expect(()=>f.capture()).toThrow('identity');
  f.world.actorNames.set('old',{name:'Old',lifeGeneration:2});expect(()=>captureOriginalSoloHumanHitscan(f.context,f.input,f.request,f.preview,{...options,maxModels:1})).toThrow('budget');
 });
});
