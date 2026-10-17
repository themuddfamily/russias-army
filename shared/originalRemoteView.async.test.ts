import {describe,expect,it,vi} from 'vitest';
import {OriginalRemoteView,type OriginalRemoteViewTarget} from './originalRemoteView';
import type {ReceiverSceneTransaction,ReceiverSceneWorld} from './originalReceiverModelWorld';
import {createOriginalReceiverActorRegistrySnapshot} from './originalReceiverActorRegistry';

function deferred(){let resolve!:()=>void;const promise=new Promise<void>(done=>{resolve=done;});return {promise,resolve};}
const target=(x=0,weapon:OriginalRemoteViewTarget['weapon']='rifle'):OriginalRemoteViewTarget=>({id:'remote',position:{x,y:0,z:0},yaw:.2,motionTime:0,alive:true,weapon,sourceShots:0});
function fixture(asyncCallback=true){
 const gate=deferred(),entered=deferred(),order:string[]=[];
 let callback=0,prepared=false,sealed=false,dispatchError:Error|undefined;
 const registry=()=>createOriginalReceiverActorRegistrySnapshot({sceneGeneration:1,callback,prefix:{kind:'callback',sceneGeneration:1,callback},
  giHandles:[],gunCatalog:[],models:[],actors:[],fades:[],fifo:[],pickups:[],pickupHistory:{observer:'A',lifeGeneration:1,
   root:{key:prepared&&sealed?'final-root':'prior-root',version:prepared&&sealed?1:0,count:prepared&&sealed?17:0,pageCount:prepared&&sealed?2:0,highWaterId:prepared&&sealed?17:0}}},
  {maxModels:8,maxPickups:16,maxTextChars:512});
 const publish=vi.fn(()=>{order.push('publish');}),rollback=vi.fn(()=>{order.push('rollback');});
 const advance=vi.fn((value:number)=>{callback=value;order.push(`callback:${value}`);});
 const advanceAsync=vi.fn(async(value:number)=>{callback=value;order.push(`async:${value}`);entered.resolve();await gate.promise;if(dispatchError)throw dispatchError;});
 const before=vi.fn(()=>{order.push('before');}),after=vi.fn(()=>{order.push('after');}),corpses=vi.fn(()=>{order.push('corpses');});
 const scene:ReceiverSceneTransaction={allocateCloneName:()=>'',freezeModels:()=>[],freezePrefix:()=>({kind:'callback',sceneGeneration:1,callback}),
  freezeActorRegistry:registry,freezeModelTransitions:()=>Object.freeze([]),preparedActorRegistry:()=>{if(!prepared)throw Error('Not prepared');return registry();},
  getActorModels:()=>{throw Error('Unused fake model lookup');},refreshExternalModels:()=>{},advanceExternalCallback:advance,
  ...(asyncCallback?{advanceExternalCallbackAsync:advanceAsync}:{}),applyExternalReceipt:(tick,value)=>{callback=value;order.push(`receipt:${tick}`);},
  birth:request=>{order.push('birth');return {currentFeet:request.targetFeet,targetFeet:request.targetFeet,bspWorld:1,sphereProvenance:'declared-resource',giHandle:'fake-gi',gunHandle:'fake-gun',queryCoverage:{complete:true,missing:[],provenance:'declared-fake-scene'}};},
  beforeCallback:before,afterCallback:after,detach:()=>{},advanceCorpses:corpses,readPickup:()=>{throw Error('Unused fake pickup lookup');},collectPickup:()=>false,
  prepareCommit:()=>{order.push('prepare');prepared=true;return publish;},commit:()=>publish(),rollback};
 const begin=vi.fn(()=>{prepared=false;sealed=false;return scene;}),world:ReceiverSceneWorld={begin};
 const view=new OriginalRemoteView(0,{},'source-callback',world,true);
 const first=view.prepareSynchronousDelivery({tick:0,sentAt:0,targets:[target()]},{receiptCallbacks:0,callbacks:0},0);
 if(!first.ok)throw Error('Fake bootstrap rejected');first.commit();
 begin.mockClear();publish.mockClear();rollback.mockClear();advance.mockClear();advanceAsync.mockClear();before.mockClear();after.mockClear();corpses.mockClear();order.length=0;
 return {view,scene,begin,publish,rollback,advance,advanceAsync,before,after,corpses,gate,entered,order,
  seal:()=>{sealed=true;},failDispatch:(error:Error)=>{dispatchError=error;}};
}
const packet=()=>({tick:1,sentAt:34,targets:[target(90,'shotgun')]});
const timing={receiptCallbacks:0,callbacks:1};

describe('asynchronous receiver replay (controlled CPU scene; no Game/storage integration claim)',()=>{
 it('keeps live actors, weapons and clocks committed during replay and commits once',async()=>{
  const f=fixture(),before=f.view.freeze(),debug=f.view.debugState();
  const pending=f.view.prepareAsynchronousDelivery(packet(),timing,34);await f.entered.promise;
  expect(f.view.freeze()).toEqual(before);expect(f.view.freezeCorpses()).toEqual([]);expect(f.view.debugState()).toEqual(debug);
  expect(f.view.sourceWeaponOf('remote')).toBe('rifle');expect(f.begin).toHaveBeenCalledTimes(1);expect(f.before).not.toHaveBeenCalled();
  expect(f.view.recordSent({tick:2,sentAt:35,targets:[]})).toEqual({ok:false,reason:'acceptance_active'});
  expect(f.view.accept({callbacks:1,receipts:[]},34)).toEqual({ok:false,reason:'acceptance_active'});
  expect(await f.view.prepareAsynchronousDelivery(packet(),timing,34)).toEqual({ok:false,reason:'acceptance_active'});
  f.gate.resolve();const stage=await pending;if(!stage.ok)throw Error('Async replay rejected');
  expect(f.view.freeze()).toEqual(before);expect(f.publish).not.toHaveBeenCalled();expect(stage.nextPoses[0].position.x).not.toBe(0);
  expect(f.advanceAsync).toHaveBeenCalledTimes(1);expect(f.advance).not.toHaveBeenCalled();expect(f.before).toHaveBeenCalledTimes(1);expect(f.after).toHaveBeenCalledTimes(1);
  expect(f.order).toEqual(['receipt:1','async:1','corpses','before','after','prepare']);
  stage.commit();expect(f.publish).toHaveBeenCalledTimes(1);expect(f.view.sourceWeaponOf('remote')).toBe('shotgun');expect(f.view.debugState()).toMatchObject({callbacks:1,lastAcceptedAt:34,pendingTicks:[]});
  expect(()=>stage.commit()).toThrow(/closed/);stage.rollback();expect(f.rollback).not.toHaveBeenCalled();
 });

 it('holds finalization before prepare and returns the prepared final-root checkpoint',async()=>{
  const f=fixture(),finalGate=deferred(),finalEntered=deferred();f.gate.resolve();
  const pending=f.view.prepareAsynchronousDelivery(packet(),timing,34,async scene=>{expect(scene).toBe(f.scene);finalEntered.resolve();await finalGate.promise;f.seal();});
  await finalEntered.promise;expect(f.order).not.toContain('prepare');expect(f.view.sourceWeaponOf('remote')).toBe('rifle');
  expect(f.view.recordSent({tick:2,sentAt:35,targets:[]})).toEqual({ok:false,reason:'acceptance_active'});
  finalGate.resolve();const stage=await pending;if(!stage.ok)throw Error('Finalization rejected');
  expect(stage.result.modelTransitions).toEqual([]);expect(stage.result.modelState?.pickupHistory?.root).toMatchObject({key:'final-root',count:17,pageCount:2});
  stage.rollback();expect(f.publish).not.toHaveBeenCalled();expect(f.rollback).toHaveBeenCalledTimes(1);
 });

 it('rolls back a failed asynchronous dispatch without publishing private receipt mutations',async()=>{
  const f=fixture(),before=f.view.freeze(),debug=f.view.debugState(),error=Error('birth emitter failed');f.failDispatch(error);
  const pending=f.view.prepareAsynchronousDelivery(packet(),timing,34),rejected=expect(pending).rejects.toBe(error);await f.entered.promise;
  f.gate.resolve();await rejected;expect(f.rollback).toHaveBeenCalledTimes(1);expect(f.publish).not.toHaveBeenCalled();
  expect(f.view.freeze()).toEqual(before);expect(f.view.debugState()).toEqual(debug);expect(f.before).not.toHaveBeenCalled();
  expect(f.view.recordSent({tick:1,sentAt:34,targets:[]})).toEqual({ok:true});
 });

 it('cancels immediately but drains the active callback before reopening admission',async()=>{
  const f=fixture(),controller=new AbortController(),before=f.view.freeze(),debug=f.view.debugState(),reason=Error('cancelled');
  const pending=f.view.prepareAsynchronousDelivery(packet(),timing,34,undefined,controller.signal),rejected=expect(pending).rejects.toBe(reason);
  await f.entered.promise;controller.abort(reason);expect(f.rollback).toHaveBeenCalledTimes(1);
  expect(f.view.recordSent({tick:2,sentAt:35,targets:[]})).toEqual({ok:false,reason:'acceptance_active'});
  expect(f.view.freeze()).toEqual(before);expect(f.view.debugState()).toEqual(debug);f.gate.resolve();await rejected;
  expect(f.rollback).toHaveBeenCalledTimes(1);expect(f.before).not.toHaveBeenCalled();expect(f.publish).not.toHaveBeenCalled();
  expect(f.view.recordSent({tick:1,sentAt:34,targets:[]})).toEqual({ok:true});
 });

 it('cancels a prepared stage and rejects its later commit without consuming the snapshot',async()=>{
  const f=fixture(),controller=new AbortController(),before=f.view.freeze();f.gate.resolve();
  const stage=await f.view.prepareAsynchronousDelivery(packet(),timing,34,undefined,controller.signal);if(!stage.ok)throw Error('Async replay rejected');
  controller.abort(Error('cancel ready'));expect(f.rollback).toHaveBeenCalledTimes(1);expect(()=>stage.commit()).toThrow(/closed/);
  stage.rollback();expect(f.rollback).toHaveBeenCalledTimes(1);expect(f.view.freeze()).toEqual(before);expect(f.publish).not.toHaveBeenCalled();
  expect(f.view.recordSent({tick:1,sentAt:34,targets:[]})).toEqual({ok:true});
 });

 it('drains cancelled finalization and rejects finalizer errors without reopening a pending frame early',async()=>{
  const f=fixture(),controller=new AbortController(),finalGate=deferred(),finalEntered=deferred(),error=Error('finalization cancelled');f.gate.resolve();
  const pending=f.view.prepareAsynchronousDelivery(packet(),timing,34,async()=>{finalEntered.resolve();await finalGate.promise;},controller.signal),rejected=expect(pending).rejects.toBe(error);
  await finalEntered.promise;controller.abort(error);expect(f.view.accept({callbacks:1,receipts:[]},34)).toEqual({ok:false,reason:'acceptance_active'});
  finalGate.resolve();await rejected;expect(f.order).not.toContain('prepare');expect(f.rollback).toHaveBeenCalledTimes(1);
 });

 it('rolls back an independent finalizer failure and preserves all prior clocks',async()=>{
  const f=fixture(),debug=f.view.debugState(),before=f.view.freeze(),error=Error('sealing failed');f.gate.resolve();
  await expect(f.view.prepareAsynchronousDelivery(packet(),timing,34,async()=>{throw error;})).rejects.toBe(error);
  expect(f.rollback).toHaveBeenCalledTimes(1);expect(f.publish).not.toHaveBeenCalled();expect(f.order).not.toContain('prepare');
  expect(f.view.debugState()).toEqual(debug);expect(f.view.freeze()).toEqual(before);expect(f.view.sourceWeaponOf('remote')).toBe('rifle');
 });

 it('uses the synchronous callback fallback with equivalent private recurrence',async()=>{
  const f=fixture(false),before=f.view.freeze(),stage=await f.view.prepareAsynchronousDelivery(packet(),timing,34);if(!stage.ok)throw Error('Fallback rejected');
  expect(f.advance).toHaveBeenCalledTimes(1);expect(f.before).toHaveBeenCalledTimes(1);expect(f.view.freeze()).toEqual(before);
  stage.commit();expect(f.view.freeze()).toEqual(stage.nextPoses);expect(f.view.debugState().callbacks).toBe(1);
 });

 it('rejects invalid or already-cancelled input without opening a scene or changing admission',async()=>{
  const f=fixture(),controller=new AbortController(),reason=Error('pre-cancelled');controller.abort(reason);
  await expect(f.view.prepareAsynchronousDelivery(packet(),timing,34,undefined,controller.signal)).rejects.toBe(reason);
  expect(await f.view.prepareAsynchronousDelivery(packet(),{receiptCallbacks:0,callbacks:99},34)).toEqual({ok:false,reason:'future_callbacks'});
  expect(f.begin).not.toHaveBeenCalled();expect(f.view.recordSent({tick:1,sentAt:34,targets:[]})).toEqual({ok:true});
 });
});
