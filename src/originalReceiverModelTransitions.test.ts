import {describe,expect,it} from 'vitest';
import {OriginalReceiverModelWorld,type ReceiverModelBackend,type ReceiverModelPose,type ReceiverModelWorldOptions,type ReceiverSceneTransaction} from '../shared/originalReceiverModelWorld';
import {OriginalRemoteView} from '../shared/originalRemoteView';
import {OriginalReceiverSceneController} from '../shared/originalReceiverSceneController';
import type {ReceiverScenePrefix} from '../shared/originalReceiverPrefix';

// A complete declared CPU oracle isolates ledger publication. This does not
// attest native map coverage, actor chronology, parenting or rendered models.
const pose=():ReceiverModelPose=>({position:{x:0,y:20,z:0},yaw:.4,phase:77,scale:1,rotation:{x:0,y:0,z:0,w:1}});
const backend=():ReceiverModelBackend=>({cloneGI:()=>({pose:pose(),geometryProvenance:'declared-GI'}),cloneGun:()=>({pose:pose(),geometryProvenance:'declared-gun'}),sphere:()=>({bspWorld:2,provenance:'declared-resource'}),heldGunPose:gi=>({...gi.pose,position:{...gi.pose.position}}),reparentGunMembership:()=>true,dropYaw:()=>.7,nearestDetailedDownward:()=>({hit:null,coverage:{complete:true,missing:[],provenance:'declared-empty-CPU-oracle'}})});
const world=(extra:Partial<ReceiverModelWorldOptions>={})=>new OriginalReceiverModelWorld(backend(),{sceneGeneration:4,sourceScale:.02,eyeHeight:1,goodyBspWorld:2,maxModels:64,maxPickups:32,lifecycleJournal:{maxEntries:64,maxTextChars:65536},...extra});
const receipt=(tick=0,callback=0):ReceiverScenePrefix=>({kind:'receipt',sceneGeneration:4,tick,callback});
const callback=(n:number):ReceiverScenePrefix=>({kind:'callback',sceneGeneration:4,callback:n});
const label=(tx:ReceiverSceneTransaction,p:ReceiverScenePrefix)=>{tx.admitExternalPrefix!(p);if(p.kind==='receipt')tx.applyExternalReceipt(p.tick,p.callback);else tx.advanceExternalCallback(p.callback);};
const birth=(id:string,n=0,y=10)=>({actorId:id,targetFeet:{x:0,y,z:0},targetYaw:.2,callback:n});
const actor=(y=10)=>({position:{x:0,y,z:0},yaw:.2,motionTime:123,weapon:'rpg' as const});

describe('opt-in staged receiver model transitions (CPU ledger adapter)',()=>{
 it('records ordered same-batch birth, gun binding and detach with real pickup/fade ownership',()=>{
  const w=world(),tx=w.begin(),p=receipt();label(tx,p);const born=tx.birth(birth('a'));tx.beforeCallback('a',actor());tx.detach('a',actor(),0);const events=tx.freezeModelTransitions!();
  expect(events.map(e=>e.kind)).toEqual(['birth','gun-bound','detach']);expect(events.map(e=>e.ordinal)).toEqual([1,2,3]);expect(events.map(e=>e.prefix)).toEqual([p,p,p]);
  expect(events[0]).toMatchObject({actorId:'a',giHandle:born.giHandle,gunHandle:born.gunHandle,reused:false});expect(events[1]).toMatchObject({previousGunHandle:born.gunHandle,gunHandle:born.gunHandle,weapon:'rpg'});expect(events[2]).toMatchObject({fadeId:1,pickup:{id:1,handle:born.gunHandle,weapon:'rpg',position:{x:0,y:10,z:0}}});tx.commit();expect(w.freezePickups()[0]).toEqual(events[2].kind==='detach'?events[2].pickup:undefined);
 });
 it('distinguishes receipt and callback operations at the same callback without inferred labels',()=>{
  const w=world(),tx=w.begin();label(tx,receipt(0,0));tx.birth(birth('a'));label(tx,callback(1));tx.beforeCallback('a',actor());label(tx,receipt(1,1));tx.detach('a',actor(),1);
  expect(tx.freezeModelTransitions!().map(e=>e.prefix)).toEqual([receipt(0,0),callback(1),receipt(1,1)]);tx.commit();
 });
 it('records exact terminal pose only on callback 76, then FIFO reuse and old pickup collection remove the held alias',()=>{
  const w=world();let tx=w.begin();label(tx,receipt());const a=tx.birth(birth('a')),b=tx.birth(birth('b'));tx.beforeCallback('a',actor());tx.beforeCallback('b',actor(12));tx.detach('a',actor(),0);tx.detach('b',actor(12),0);tx.commit();const old=w.freezePickups()[0];
  tx=w.begin();for(let n=1;n<=75;n++){label(tx,callback(n));tx.advanceCorpses();}expect(tx.freezeModelTransitions!()).toEqual([]);tx.commit();expect(w.debugState().fifo).toEqual([]);
  tx=w.begin();label(tx,callback(76));tx.advanceCorpses();const retired=tx.freezeModelTransitions!();expect(retired.map(e=>e.kind)).toEqual(['corpse-retired','corpse-retired']);expect(retired[0]).toMatchObject({giHandle:a.giHandle,fadeId:1,terminalPose:{phase:3008}});expect(retired[1]).toMatchObject({giHandle:b.giHandle,fadeId:2});const terminal=tx.freezeModels().find(m=>m.handle===a.giHandle)!.pose;expect(retired[0].kind==='corpse-retired'&&retired[0].terminalPose).toEqual(terminal);tx.commit();
  tx=w.begin();label(tx,receipt(1,76));const c=tx.birth(birth('c',76,40));tx.beforeCallback('c',actor(40));expect(c.giHandle).toBe(a.giHandle);expect(c.gunHandle).toBe(old.handle);expect(tx.freezeActorRegistry().pickups[0]).toEqual(old);expect(tx.collectPickup(old.id)).toBe(true);expect(tx.collectPickup(old.id)).toBe(false);const events=tx.freezeModelTransitions!();expect(events.map(e=>e.kind)).toEqual(['birth','gun-bound','pickup-collected']);expect(events[0]).toMatchObject({reused:true});expect(events.at(-1)).toMatchObject({pickup:old});expect(tx.freezeModels().find(m=>m.handle===old.handle)!.inWorld).toBe(false);expect(tx.freezeActorRegistry().actors.find(a=>a.actorId==='c')!.gun).toBe(old.handle);tx.beforeCallback('c',{...actor(40),weapon:'rifle'});const rifle=tx.freezeActorRegistry().actors.find(a=>a.actorId==='c')!.gun;expect(tx.freezeModelTransitions!().at(-1)).toMatchObject({kind:'gun-bound',weapon:'rifle',previousGunHandle:old.handle,gunHandle:rifle});expect(rifle).toBe('gun:ak47:baddy1');expect(tx.freezeActorRegistry().gunCatalog.some(g=>g.handle===old.handle)).toBe(true);expect(tx.freezeModels().find(m=>m.handle===old.handle)!.inWorld).toBe(false);tx.beforeCallback('c',actor(40));expect(tx.freezeModelTransitions!().at(-1)).toMatchObject({kind:'gun-bound',weapon:'rpg',previousGunHandle:rifle,gunHandle:old.handle});expect(tx.freezeModels().find(m=>m.handle===old.handle)!.inWorld).toBe(true);tx.commit();
 });
 it('detaches frozen nested payloads from later model changes and later transactions',()=>{
  const w=world(),tx=w.begin();label(tx,receipt());tx.birth(birth('a'));tx.beforeCallback('a',actor());tx.detach('a',actor(),0);const frozen=tx.freezeModelTransitions!(),json=JSON.stringify(frozen);tx.advanceCorpses();tx.commit();const later=w.begin();label(later,callback(1));later.collectPickup(1);later.commit();expect(JSON.stringify(frozen)).toBe(json);expect(Object.isFrozen(frozen)).toBe(true);expect(frozen.every(e=>Object.isFrozen(e)&&Object.isFrozen(e.prefix))).toBe(true);const detached=frozen.find(e=>e.kind==='detach')!;if(detached.kind!=='detach')throw Error('missing detach');expect(Object.isFrozen(detached.pickup.position)).toBe(true);
 });
 it('rolls back names, pickup/fade identities and journal ordinals without retaining a global journal',()=>{
  const w=world(),before=w.debugState();let tx=w.begin();label(tx,receipt());const first=tx.birth(birth('a'));tx.beforeCallback('a',actor());tx.detach('a',actor(),0);const speculative=tx.freezeModelTransitions!();tx.rollback();expect(w.debugState()).toEqual(before);expect(w.freezeModels()).toEqual([]);
  tx=w.begin();label(tx,receipt());const retry=tx.birth(birth('a'));tx.beforeCallback('a',actor());tx.detach('a',actor(),0);expect(retry.giHandle).toBe(first.giHandle);expect(tx.freezeModelTransitions!()).toEqual(speculative);tx.commit();const next=w.begin();expect(next.freezeModelTransitions!()).toEqual([]);next.rollback();expect('freezeModelTransitions' in w).toBe(false);
 });
 it('poisons preparation after caught entry or text exhaustion and permits a reduced fresh retry',()=>{
  for(const lifecycleJournal of [{maxEntries:1,maxTextChars:65536},{maxEntries:64,maxTextChars:1}]){const w=world({lifecycleJournal}),tx=w.begin();label(tx,receipt());if(lifecycleJournal.maxEntries===1){tx.birth(birth('a'));expect(()=>tx.beforeCallback('a',actor())).toThrow('budget');}else expect(()=>tx.birth(birth('a'))).toThrow('budget');expect(()=>tx.prepareCommit()).toThrow();tx.rollback();expect(w.freezeModels()).toEqual([]);expect(w.debugState().actorHandles).toEqual([]);if(lifecycleJournal.maxEntries===1){const retry=w.begin();label(retry,receipt());expect(retry.birth(birth('a')).giHandle).toBe('gi:baddy1');expect(retry.freezeModelTransitions!()).toHaveLength(1);retry.commit();}}
 });
 it('requires actual prefix evidence only when enabled and validates captured journal limits',()=>{
  const w=world(),tx=w.begin();expect(()=>tx.birth(birth('a'))).toThrow('callback prefix mismatch');expect(()=>tx.prepareCommit()).toThrow();tx.rollback();for(const lifecycleJournal of [{maxEntries:0,maxTextChars:1},{maxEntries:1,maxTextChars:Infinity}])expect(()=>world({lifecycleJournal})).toThrow('journal options');
  const plain=world({lifecycleJournal:undefined}),t=plain.begin();expect(t.freezeModelTransitions).toBeUndefined();t.birth(birth('a'));t.commit();
 });
 it('rejects a mismatched birth callback before allocating or querying and a mismatched detach before dropping',()=>{
  const w=world(),tx=w.begin();label(tx,receipt());expect(()=>tx.birth(birth('a',1))).toThrow('callback prefix mismatch');expect(()=>tx.prepareCommit()).toThrow();tx.rollback();expect(w.freezeModels()).toEqual([]);
  const born=w.begin();label(born,receipt());expect(born.birth(birth('a')).giHandle).toBe('gi:baddy1');born.commit();const before=w.freezeModels(),death=w.begin();label(death,callback(1));expect(()=>death.detach('a',actor(),2)).toThrow('callback prefix mismatch');expect(()=>death.prepareCommit()).toThrow();death.rollback();expect(w.freezeModels()).toEqual(before);expect(w.freezePickups()).toEqual([]);
 });
 it('forwards speculative and enabled-empty journals through actual RemoteView acceptance without publishing rolled-back state',()=>{
  const w=new OriginalReceiverModelWorld(backend(),{sceneGeneration:4,sourceScale:.02,eyeHeight:1,goodyBspWorld:2,maxModels:64,maxPickups:32,lifecycleJournal:{maxEntries:64,maxTextChars:65536}},{snapshotAt:prefix=>({prefix,models:[],missing:[],provenance:'declared-empty-CPU-oracle'})}),view=new OriginalRemoteView(0,{},'source-callback',w),snapshot={tick:0,sentAt:0,targets:[{id:'a',position:{x:0,y:10,z:0},yaw:.2,motionTime:123,alive:true,weapon:'rpg' as const}]};const order={receiptCallbacks:0,callbacks:0};
  const stage=view.prepareSynchronousDelivery(snapshot,order,0);expect(stage.ok).toBe(true);if(!stage.ok)throw Error('fixture preparation rejected');expect(stage.result.modelTransitions).toMatchObject([{kind:'birth',prefix:receipt()}]);expect(w.freezeModels()).toEqual([]);stage.rollback();expect(view.freeze()).toEqual([]);expect(w.freezeModels()).toEqual([]);
  const retry=view.prepareSynchronousDelivery(snapshot,order,0);if(!retry.ok)throw Error('fixture retry rejected');expect(retry.result.modelTransitions).toEqual(stage.result.modelTransitions);retry.commit();const empty=view.accept({callbacks:0,receipts:[]},0);expect(empty).toMatchObject({ok:true,modelTransitions:[]});
 });
 it('forwards the same enabled journal through actual Controller and keeps disabled acceptance metadata absent',()=>{
  let commits=0;const fx={clonePlane:()=>({pose:pose(),geometryProvenance:'declared-plane',inWorld:true}),cloneMuzzle:()=>({pose:pose(),geometryProvenance:'declared-muzzle',inWorld:true}),pointAt:()=>({x:0,y:0,z:0,w:1}),selfRotate:(q:{x:number;y:number;z:number;w:number})=>q};
  const environment={begin:()=>({advanceCallback:()=>[],applyReceipt:()=>[],snapshotAt:(prefix:ReceiverScenePrefix)=>({prefix,models:[],missing:[],provenance:'declared-empty-CPU-oracle'}),goodyContext:()=>null,stageEffects:()=>{},prepareCommit:()=>()=>{commits++;},rollback:()=>{}})};
  const controller=new OriginalReceiverSceneController(backend(),fx,environment,{model:{sceneGeneration:4,sourceScale:.02,eyeHeight:1,goodyBspWorld:2,maxModels:64,maxPickups:32,lifecycleJournal:{maxEntries:64,maxTextChars:65536}},transient:{maxModels:16,maxActors:16,maxShaders:16},maxEffects:16}),view=new OriginalRemoteView(0,{},'source-callback',controller),snapshot={tick:0,sentAt:0,targets:[{id:'a',position:{x:0,y:10,z:0},yaw:.2,motionTime:0,alive:true,weapon:'rpg' as const}]};
  const stage=view.prepareSynchronousDelivery(snapshot,{receiptCallbacks:0,callbacks:0},0);if(!stage.ok)throw Error('controller fixture rejected');expect(stage.result.modelTransitions).toMatchObject([{kind:'birth',ordinal:1,prefix:receipt()}]);expect(controller.freezeModels()).toEqual([]);stage.commit();expect(commits).toBe(1);expect(controller.freezeModels().some(m=>m.handle==='gi:baddy1')).toBe(true);
  const plain=new OriginalRemoteView(0,{},'source-callback',world({lifecycleJournal:undefined}));expect(plain.accept({callbacks:0,receipts:[]},0)).toEqual({ok:true});
 });
});
