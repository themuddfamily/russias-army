import {describe,expect,it,vi} from 'vitest';
import {createOriginalSoloActorDropCapture,type OriginalSoloActorDropCaptureOptions} from './originalSoloActorDropCapture';
import {OriginalReceiverModelWorld,isReceiverDropYawRequest,type ReceiverDropYawRequest,type ReceiverModelBackend,type ReceiverModelPose} from '../shared/originalReceiverModelWorld';
import type {ReceiverScenePrefix} from '../shared/originalReceiverPrefix';
import type {OriginalSoloActorDropYawPlan} from './originalSoloActorLifecycle';

const pose=():ReceiverModelPose=>({position:{x:0,y:0,z:0},yaw:0,phase:0,scale:1,rotation:{x:0,y:0,z:0,w:1}});
const actorPose=()=>({position:{x:0,y:0,z:0},yaw:0,motionTime:0,weapon:'rpg' as const});
function fixture(limits:Partial<Pick<OriginalSoloActorDropCaptureOptions,'maxEntries'|'maxTextChars'>>={}){
 let committed=0,sampleImpl=()=>9,readImpl=()=>committed;
 const sample=vi.fn(()=>sampleImpl()),read=vi.fn(()=>readImpl()),cache=createOriginalSoloActorDropCapture({sceneGeneration:7,maxEntries:8,maxTextChars:512,sampleRandom36:sample,readCommittedCallback:read,...limits});
 const requests:ReceiverDropYawRequest[]=[],plans:OriginalSoloActorDropYawPlan[]=[];
 let active:ReceiverDropYawRequest|undefined;
 let resolve=(id:string,callback:number,request?:ReceiverDropYawRequest)=>cache.readDropYawPlan(id,callback,request);
 const backend:ReceiverModelBackend={cloneGI:()=>({pose:pose(),geometryProvenance:'controlled-GI'}),cloneGun:()=>({pose:pose(),geometryProvenance:'controlled-gun'}),sphere:()=>({bspWorld:1,provenance:'declared-resource'}),heldGunPose:()=>pose(),reparentGunMembership:()=>true,nearestDetailedDownward:()=>({hit:null,coverage:{complete:true,missing:[],provenance:'controlled complete empty downward'}}),dropYaw:(id,callback,request)=>{active=request;if(request)requests.push(request);const plan=resolve(id,callback,request);plans.push(plan);return plan.entries.find(e=>e.actorId===id&&e.callback===callback)!.random36*10*Math.PI/180;}};
 const makeWorld=(generation=7,owner=cache.requestOwner)=>new OriginalReceiverModelWorld(backend,{sceneGeneration:generation,sourceScale:.02,eyeHeight:1,goodyBspWorld:1,maxModels:64,maxPickups:16,dropRequestOwner:owner},{snapshotAt:prefix=>({prefix,models:[],missing:[],provenance:'controlled external prefix inventory'})});
 const world=makeWorld();
 const stage=(callback:number,births:readonly string[]=['A'],kind:'callback'|'receipt'='callback',target=world)=>{
  const tx=target.begin(),prefix:ReceiverScenePrefix=kind==='callback'?{kind,sceneGeneration:target.options.sceneGeneration,callback}:{kind,sceneGeneration:target.options.sceneGeneration,callback,tick:callback};
  if(kind==='callback')tx.advanceExternalCallback(callback);else tx.applyExternalReceipt(callback,callback);
  for(const id of births)tx.birth({actorId:id,targetFeet:{x:0,y:0,z:0},targetYaw:0,callback});
  return {tx,prefix,detach(id='A'){return tx.detach(id,actorPose(),callback);}};
 };
 return {cache,world,makeWorld,stage,sample,read,requests,plans,active:()=>active,setCommitted:(v:number)=>{committed=v;},setSample:(fn:()=>number)=>{sampleImpl=fn;},setRead:(fn:()=>number)=>{readImpl=fn;},setResolve:(fn:typeof resolve)=>{resolve=fn;},dispose(){cache.release();}};
}

describe('exact live ModelWorld detach admission captures source random36 once',()=>{
 it('samples only an actual detach and retains the exact issued plan through rollback/retry',()=>{
  const f=fixture();try{
   const first=f.stage(1);expect(f.sample).not.toHaveBeenCalled();first.detach();const plan=f.plans[0];expect(plan.entries).toEqual([{actorId:'A',callback:1,random36:9}]);expect(Object.isFrozen(plan)).toBe(true);expect(Object.isFrozen(plan.entries[0])).toBe(true);first.tx.rollback();expect(f.world.freezePickups()).toEqual([]);
   const retry=f.stage(1);retry.detach();expect(f.plans[1]).toBe(plan);expect(f.sample).toHaveBeenCalledTimes(1);retry.tx.commit();expect(f.world.freezePickups()).toHaveLength(1);expect(f.read).toHaveBeenCalledTimes(3);
  }finally{f.dispose();}
 });
 it('captures same-callback actors in insertion order and returns each original plan on retry',()=>{
  const f=fixture();let operand=3;f.setSample(()=>operand++);try{
   const a=f.stage(1,['A','B']);a.detach('A');a.detach('B');const [pa,pb]=f.plans;expect(pa.entries.map(e=>e.actorId)).toEqual(['A']);expect(pb.entries).toEqual([{actorId:'A',callback:1,random36:3},{actorId:'B',callback:1,random36:4}]);a.tx.rollback();
   const b=f.stage(1,['A','B']);b.detach('B');b.detach('A');expect(f.plans[2]).toBe(pb);expect(f.plans[3]).toBe(pa);expect(f.sample).toHaveBeenCalledTimes(2);b.tx.rollback();
  }finally{f.dispose();}
 });
 it('clears only committed callback operands before the exact next callback, without evicting pending entries',()=>{
  const f=fixture({maxEntries:1});try{
   const a=f.stage(1,['A','B']);a.detach('A');a.tx.commit();f.setCommitted(1);f.setSample(()=>18);const b=f.stage(2,[]);b.detach('B');expect(f.plans[1].entries).toEqual([{actorId:'B',callback:2,random36:18}]);expect(f.sample).toHaveBeenCalledTimes(2);b.tx.rollback();
   const retry=f.stage(2,[]);retry.detach('B');expect(f.plans[2]).toBe(f.plans[1]);expect(f.sample).toHaveBeenCalledTimes(2);retry.tx.rollback();
  }finally{f.dispose();}
 });
 it('rejects missing/fabricated/expired requests before inspecting their fields or sampling',()=>{
  const f=fixture();try{
   const fake={get actorId(){throw Error('unissued getter read');}};expect(()=>f.cache.readDropYawPlan('A',1)).toThrow('request');expect(()=>f.cache.readDropYawPlan('A',1,fake as unknown as ReceiverDropYawRequest)).toThrow('request');expect(f.sample).not.toHaveBeenCalled();
   const a=f.stage(1);a.detach();const request=f.requests[0];expect(isReceiverDropYawRequest(request,f.cache.requestOwner)).toBe(false);expect(()=>f.cache.readDropYawPlan('A',1,request)).toThrow('request');expect(f.sample).toHaveBeenCalledTimes(1);a.tx.rollback();
  }finally{f.dispose();}
 });
 it.each(['owner','generation','actor','callback','receipt'] as const)('rejects a real issued request with foreign %s before source RNG',kind=>{
  const f=fixture();try{
   if(kind==='actor')f.setResolve((_id,callback,request)=>f.cache.readDropYawPlan('B',callback,request));
   if(kind==='callback')f.setResolve((id,callback,request)=>f.cache.readDropYawPlan(id,callback+1,request));
   const target=kind==='owner'?f.makeWorld(7,{}):kind==='generation'?f.makeWorld(8):f.world;
   const a=f.stage(1,['A'],kind==='receipt'?'receipt':'callback',target);expect(()=>a.detach()).toThrow();expect(f.sample).not.toHaveBeenCalled();a.tx.rollback();
  }finally{f.dispose();}
 });
 it('retains multiple real staged callbacks through one rollback and reuses both exact plans on retry',()=>{
  const f=fixture();try{
   const a=f.stage(1,['A','B']);a.detach('A');a.tx.advanceExternalCallback(2);a.tx.detach('B',actorPose(),2);const [first,second]=f.plans;expect(first.callback).toBe(1);expect(second.callback).toBe(2);expect(second.entries).toEqual([{actorId:'B',callback:2,random36:9}]);a.tx.rollback();
   const retry=f.stage(1,['A','B']);retry.detach('A');retry.tx.advanceExternalCallback(2);retry.tx.detach('B',actorPose(),2);expect(f.plans[2]).toBe(first);expect(f.plans[3]).toBe(second);expect(f.sample).toHaveBeenCalledTimes(2);retry.tx.rollback();
  }finally{f.dispose();}
 });
 it('admits the first actual detach after empty staged callbacks without speculative draws or synthetic skip gates',()=>{
  const f=fixture();try{const a=f.stage(1);a.tx.advanceExternalCallback(2);a.tx.advanceExternalCallback(3);expect(f.sample).not.toHaveBeenCalled();a.tx.detach('A',actorPose(),3);const plan=f.plans[0];expect(plan.callback).toBe(3);expect(plan.entries).toEqual([{actorId:'A',callback:3,random36:9}]);a.tx.rollback();const retry=f.stage(1);retry.tx.advanceExternalCallback(2);retry.tx.advanceExternalCallback(3);retry.tx.detach('A',actorPose(),3);expect(f.plans[1]).toBe(plan);expect(f.sample).toHaveBeenCalledTimes(1);retry.tx.rollback();}finally{f.dispose();}
 });
 it('poisons a decreased committed watermark so pruned operands cannot be sampled again after external reset',()=>{
  const f=fixture();try{const a=f.stage(1,['A','B']);a.detach('A');a.tx.commit();f.setCommitted(1);const b=f.stage(2,[]);b.detach('B');b.tx.rollback();expect(f.sample).toHaveBeenCalledTimes(2);f.setCommitted(0);const regressed=f.stage(1,['A']);expect(()=>regressed.detach()).toThrow('decreased');regressed.tx.rollback();f.setCommitted(1);const retry=f.stage(2,[]);expect(()=>retry.detach('B')).toThrow('unavailable');retry.tx.rollback();expect(f.sample).toHaveBeenCalledTimes(2);}finally{f.dispose();}
 });
 it.each([{maxEntries:1,maxTextChars:512},{maxEntries:8,maxTextChars:1}])('rejects entry/text exhaustion before drawing and never replaces prior entries',limits=>{
  const f=fixture(limits);try{
   const a=f.stage(1,['A','B']);a.detach('A');const plan=f.plans[0];expect(()=>a.detach('B')).toThrow('budget');expect(f.sample).toHaveBeenCalledTimes(1);a.tx.rollback();const retry=f.stage(1);retry.detach();expect(f.plans[1]).toBe(plan);expect(f.sample).toHaveBeenCalledTimes(1);retry.tx.rollback();
  }finally{f.dispose();}
 });
 it.each([{maxEntries:1,maxTextChars:512},{maxEntries:8,maxTextChars:1}])('bounds all pending callbacks together before sampling while retaining the earlier retry plan',limits=>{
  const f=fixture(limits);try{const a=f.stage(1,['A','B']);a.detach('A');const plan=f.plans[0];a.tx.advanceExternalCallback(2);expect(()=>a.tx.detach('B',actorPose(),2)).toThrow('budget');a.tx.rollback();const retry=f.stage(1);retry.detach();expect(f.plans[1]).toBe(plan);expect(f.sample).toHaveBeenCalledTimes(1);retry.tx.rollback();}finally{f.dispose();}
 });
 it.each([0,37,1.5,NaN])('fails closed after invalid random36=%s and never repeats its source draw',operand=>{
  const f=fixture();f.setSample(()=>operand);try{
   const a=f.stage(1);expect(()=>a.detach()).toThrow('sample');a.tx.rollback();f.setSample(()=>9);const b=f.stage(1);expect(()=>b.detach()).toThrow('unavailable');expect(f.sample).toHaveBeenCalledTimes(1);b.tx.rollback();
  }finally{f.dispose();}
 });
 it('fails closed when the sampler throws or the committed callback changes across sampling',()=>{
  for(const change of [false,true]){const f=fixture();try{f.setSample(()=>{if(change){f.setCommitted(1);return 9;}throw Error('source random failed');});const a=f.stage(1);expect(()=>a.detach()).toThrow(change?'changed':'source random failed');a.tx.rollback();f.setCommitted(0);const b=f.stage(1);expect(()=>b.detach()).toThrow('unavailable');b.tx.rollback();expect(f.sample).toHaveBeenCalledTimes(1);}finally{f.dispose();}}
 });
 it('poisons caught recursive reader access without rolling back the consumed sampler',()=>{
  const f=fixture();f.setSample(()=>{try{f.cache.readDropYawPlan('A',1,f.active());}catch{}return 9;});try{
   const a=f.stage(1);expect(()=>a.detach()).toThrow('sample');a.tx.rollback();const b=f.stage(1);expect(()=>b.detach()).toThrow('unavailable');b.tx.rollback();expect(f.sample).toHaveBeenCalledTimes(1);
  }finally{f.dispose();}
 });
 it('detects committed-reader recursion before any source draw and release during sampling fails closed',()=>{
  const a=fixture();a.setRead(()=>{try{a.cache.readDropYawPlan('A',1,a.active());}catch{}return 0;});try{const stage=a.stage(1);expect(()=>stage.detach()).toThrow('unavailable');expect(a.sample).not.toHaveBeenCalled();stage.tx.rollback();}finally{a.dispose();}
  const b=fixture();b.setSample(()=>{b.cache.release();return 9;});try{const stage=b.stage(1);expect(()=>stage.detach()).toThrow('changed');expect(b.sample).toHaveBeenCalledTimes(1);stage.tx.rollback();expect(()=>b.cache.readDropYawPlan('A',1)).toThrow('unavailable');b.cache.release();}finally{b.dispose();}
 });
 it('rejects invalid options before calling either injected hook and makes release idempotent',()=>{
  const sample=vi.fn(()=>9),read=vi.fn(()=>0),options={sceneGeneration:7,maxEntries:8,maxTextChars:512,sampleRandom36:sample,readCommittedCallback:read};
  for(const invalid of [{sceneGeneration:-1},{maxEntries:0},{maxEntries:257},{maxTextChars:0},{maxTextChars:65537}])expect(()=>createOriginalSoloActorDropCapture({...options,...invalid})).toThrow('options');expect(sample).not.toHaveBeenCalled();expect(read).not.toHaveBeenCalled();const owner=createOriginalSoloActorDropCapture(options);expect(Object.isFrozen(owner.requestOwner)).toBe(true);owner.release();owner.release();expect(()=>owner.readDropYawPlan('A',1)).toThrow('unavailable');
 });
});
