import {describe,expect,it,vi} from 'vitest';
import {OriginalReceiverModelWorld,isReceiverDropYawRequest,type ReceiverDropYawRequest,type ReceiverModelBackend,type ReceiverModelWorldOptions,type ReceiverSceneTransaction} from './originalReceiverModelWorld';
import type {ReceiverScenePrefix} from './originalReceiverPrefix';
const pose=()=>({position:{x:1,y:10,z:2},yaw:.2,motionTime:0,weapon:'rpg' as const});
const modelPose=()=>({position:{x:0,y:0,z:0},yaw:0,phase:0,scale:1});
function fixture(hook:ReceiverModelBackend['dropYaw'],owner:object|undefined,maxPickups=8){
 const backend:ReceiverModelBackend={cloneGI:()=>({pose:modelPose(),geometryProvenance:'declared-GI'}),cloneGun:()=>({pose:modelPose(),geometryProvenance:'declared-gun'}),sphere:()=>({bspWorld:2,provenance:'declared-resource'}),heldGunPose:()=>modelPose(),reparentGunMembership:()=>true,nearestDetailedDownward:()=>({hit:null,coverage:{complete:true,missing:[],provenance:'declared-empty-query'}}),dropYaw:hook};
 const options:ReceiverModelWorldOptions={eyeHeight:1,sourceScale:.02,goodyBspWorld:2,sceneGeneration:7,maxModels:32,maxPickups,...(owner!==undefined?{dropRequestOwner:owner}:{})};
 const world=new OriginalReceiverModelWorld(backend,options);
 const admit=(tx:ReceiverSceneTransaction,prefix:ReceiverScenePrefix)=>{tx.admitExternalPrefix!(prefix);if(prefix.kind==='callback')tx.advanceExternalCallback(prefix.callback);else tx.applyExternalReceipt(prefix.tick,prefix.callback);};
 let tx=world.begin();admit(tx,{kind:'callback',sceneGeneration:7,callback:0});for(const actorId of ['a','b'])tx.birth({actorId,targetFeet:pose().position,targetYaw:0,callback:0});tx.commit();
 const begin=(kind:'callback'|'receipt'='callback')=>{const tx=world.begin();admit(tx,kind==='callback'?{kind,sceneGeneration:7,callback:1}:{kind,sceneGeneration:7,callback:0,tick:0});return tx;};
 return {world,owner,backend,begin};
}
describe('actual-stage receiver drop operand capability',()=>{
 it.each(['callback','receipt'] as const)('issues exact immutable %s operands only around actual detach hooks',kind=>{
  const requests:ReceiverDropYawRequest[]=[],owner={},order:string[]=[];
  const f=fixture((actorId,callback,request)=>{expect(isReceiverDropYawRequest(request,owner)).toBe(true);expect(request).toEqual({actorId,callback,prefix:kind==='callback'?{kind,sceneGeneration:7,callback:1}:{kind,sceneGeneration:7,callback:0,tick:0}});expect(Object.isFrozen(request)).toBe(true);expect(Object.isFrozen(request!.prefix)).toBe(true);expect(isReceiverDropYawRequest({...request},owner)).toBe(false);expect(isReceiverDropYawRequest(request,{})).toBe(false);requests.push(request!);order.push(actorId);return .7;},owner);
  const tx=f.begin(kind),callback=kind==='callback'?1:0;expect(requests).toEqual([]);tx.beforeCallback('a',pose());tx.afterCallback('a',pose());expect(requests).toEqual([]);tx.detach('b',pose(),callback);tx.detach('a',pose(),callback);expect(order).toEqual(['b','a']);expect(requests.every(request=>!isReceiverDropYawRequest(request,owner))).toBe(true);tx.commit();expect(f.world.freezePickups()).toHaveLength(2);expect(f.world.freezeModels().filter(m=>m.kind==='gun').every(m=>m.pose.yaw===.7)).toBe(true);
 });
 it('expires on hook return even before later stage work or rollback',()=>{
  let captured:ReceiverDropYawRequest|undefined;const owner={},f=fixture((_id,_callback,request)=>{captured=request;return 1;},owner),before=f.world.freezeActorRegistry(),tx=f.begin();tx.detach('a',pose(),1);expect(isReceiverDropYawRequest(captured,owner)).toBe(false);tx.rollback();expect(isReceiverDropYawRequest(captured,owner)).toBe(false);expect(f.world.freezeActorRegistry()).toEqual(before);
 });
 it('expires and rejects publication when the hook throws',()=>{
  let captured:ReceiverDropYawRequest|undefined;const owner={},f=fixture((_id,_callback,request)=>{captured=request;expect(isReceiverDropYawRequest(request,owner)).toBe(true);throw Error('sampling failed');},owner),tx=f.begin();expect(()=>tx.detach('a',pose(),1)).toThrow('sampling failed');expect(isReceiverDropYawRequest(captured,owner)).toBe(false);expect(()=>tx.commit()).toThrow('closed');tx.rollback();expect(f.world.freezePickups()).toEqual([]);
 });
 it.each(['read','detach','rollback'] as const)('revokes immediately on recursive %s misuse even when the hook catches it',operation=>{
  let tx:ReceiverSceneTransaction,captured:ReceiverDropYawRequest|undefined;const owner={},f=fixture((_id,_callback,request)=>{captured=request;expect(isReceiverDropYawRequest(request,owner)).toBe(true);if(operation==='rollback')tx.rollback();else expect(()=>operation==='read'?tx.freezeModels():tx.detach('b',pose(),1)).toThrow('Recursive');expect(isReceiverDropYawRequest(request,owner)).toBe(false);return 1;},owner);tx=f.begin();expect(()=>tx.detach('a',pose(),1)).toThrow('rejected');expect(isReceiverDropYawRequest(captured,owner)).toBe(false);expect(()=>tx.commit()).toThrow();tx.rollback();expect(f.world.freezePickups()).toEqual([]);
 });
 it('issues no capability in the legacy absent-owner path',()=>{
  const hook=vi.fn((_id:string,_callback:number,request?:ReceiverDropYawRequest)=>{expect(request).toBeUndefined();return .4;}),f=fixture(hook,undefined),tx=f.begin();tx.detach('a',pose(),1);tx.commit();expect(hook).toHaveBeenCalledExactlyOnceWith('a',1);
 });
 it.each([null,1,'owner',true,()=>{}])('rejects invalid owner %s before a stage or backend call',dropRequestOwner=>{
  const hook=vi.fn(()=>0),f=fixture(hook,{});expect(()=>new OriginalReceiverModelWorld(f.backend,{...f.world.options,dropRequestOwner} as unknown as ReceiverModelWorldOptions)).toThrow('request owner');expect(hook).not.toHaveBeenCalled();
 });
 it.each(['unknown','pose','callback','budget','pending'] as const)('rejects invalid %s detach before issuing a request or sampling',failure=>{
  const hook=vi.fn(()=>.4),f=fixture(hook,{},failure==='budget'?1:8),tx=f.begin();
  if(failure==='budget'){tx.detach('a',pose(),1);hook.mockClear();expect(()=>tx.detach('b',pose(),1)).toThrow('pickup budget');}
  else if(failure==='unknown')expect(()=>tx.detach('missing',pose(),1)).toThrow('Unknown');
  else if(failure==='pose')expect(()=>tx.detach('a',{...pose(),position:{x:NaN,y:0,z:0}},1)).toThrow('drop pose');
  else if(failure==='callback')expect(()=>tx.detach('a',pose(),2)).toThrow('prefix mismatch');
  else{tx.admitExternalPrefix!({kind:'receipt',sceneGeneration:7,callback:1,tick:0});expect(()=>tx.detach('a',pose(),1)).toThrow('refresh pending');}
  expect(hook).not.toHaveBeenCalled();tx.rollback();
 });
 it('rejects missing actual prefix without sampling',()=>{
  const hook=vi.fn(()=>0),owner={},f=fixture(hook,owner),w=new OriginalReceiverModelWorld(f.backend,{...f.world.options}),tx=w.begin();tx.birth({actorId:'a',targetFeet:pose().position,targetYaw:0,callback:0});expect(()=>tx.detach('a',pose(),0)).toThrow('prefix mismatch');expect(hook).not.toHaveBeenCalled();tx.rollback();
 });
 it('does not authenticate arbitrary values or an undefined owner',()=>{
  for(const value of [undefined,null,0,{},Object.freeze({actorId:'a',callback:1,prefix:{kind:'callback',sceneGeneration:7,callback:1}})])expect(isReceiverDropYawRequest(value,{})).toBe(false);expect(isReceiverDropYawRequest({},undefined as unknown as object)).toBe(false);
 });
});
