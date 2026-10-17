import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {describe,expect,it,vi} from 'vitest';
import {OriginalRemoteView,type OriginalRemoteViewTarget} from './originalRemoteView';
import {OriginalReceiverSceneController,type ReceiverSceneEnvironment,type ReceiverSceneEnvironmentTransaction} from './originalReceiverSceneController';
import type {ReceiverModelBackend,ReceiverModelEntry,ReceiverModelPose,OriginalReceiverModelWorld} from './originalReceiverModelWorld';
import type {OriginalReceiverTransientBackend,OriginalReceiverTransientBirth,OriginalReceiverTransientEffect,OriginalReceiverTransientGoody} from './originalReceiverTransientWorld';
import type {ReceiverScenePrefix} from './originalReceiverPrefix';
import {OriginalReceiverActorResources,type ReceiverWeaponGeometry} from './originalReceiverActorResources';
import {OriginalReceiverTransientResources} from './originalReceiverTransientResources';
import type {OriginalSoldierCollisionAssets} from './originalSoldierCollision';
import {createOriginalReceiverSceneRay,ORIGINAL_RECEIVER_SCENE_LAYERS,type OriginalReceiverRayModel} from './originalReceiverSceneRay';
import {createOriginalSoloActorDropCapture} from '../src/originalSoloActorDropCapture';

const q={x:Math.sin(.2),y:0,z:0,w:Math.cos(.2)};
const pose=(y:number):ReceiverModelPose=>({position:{x:0,y,z:0},rotation:{...q},yaw:.4,phase:0,scale:1});
const goody:OriginalReceiverTransientGoody={bspWorld:2.25,modelPosition:{x:4,y:5,z:6},eyePosition:{x:4,y:7,z:6},weapon:'rifle'};
const target=(id:string,shots=0):OriginalRemoteViewTarget=>({id,position:{x:0,y:10,z:0},yaw:0,motionTime:440,alive:true,weapon:'rifle',sourceShots:shots});
const prefixKey=(p:ReceiverScenePrefix)=>`${p.kind}:${p.callback}:${p.kind==='receipt'?p.tick:''}`;
const bang=(id:string,y=6):OriginalReceiverTransientBirth=>({kind:'bang',id,position:{x:0,y,z:0},type:'rocket',attackerName:'fixture'});
interface State {health:number;effects:OriginalReceiverTransientEffect[];prefix?:ReceiverScenePrefix}
const setup=(options:{maxEffects?:number;health?:number;dropSample?:()=>number;maxTransientActors?:number}={})=>{
 const events=new Map<string,OriginalReceiverTransientBirth[]>(),flags={failPrepare:false,failSnapshotTick:-1,wrongSnapshotPrefix:false,failPointAt:false,noGoody:false,coincidentBang:false,failQueryNumber:-1};
 let committed:State={health:options.health??100,effects:[]},active=false,queryNumber=0,externalInventory:readonly ReceiverModelEntry[]|undefined;
 const environment:ReceiverSceneEnvironment={begin:()=>{
  if(active)throw Error('Fixture environment already staged');active=true;let open=true,sealed=false;const staged:State={health:committed.health,effects:[...committed.effects],prefix:committed.prefix};
  const check=()=>{if(!open||sealed)throw Error('Fixture environment stage sealed');};
  const stage:ReceiverSceneEnvironmentTransaction={
   advanceCallback:callback=>{check();staged.prefix={sceneGeneration:1,kind:'callback',callback};return events.get(prefixKey(staged.prefix))??[];},
   applyReceipt:(tick,callback)=>{check();staged.prefix={sceneGeneration:1,kind:'receipt',tick,callback};return events.get(prefixKey(staged.prefix))??[];},
   snapshotAt:prefix=>{if(prefix.kind==='receipt'&&prefix.tick===flags.failSnapshotTick)throw Error('Injected second receipt scene failure');return {prefix:flags.wrongSnapshotPrefix?{...prefix,sceneGeneration:2}:prefix,models:externalInventory??[{handle:'floor',name:'floor',resource:'floor',group:'scene',kind:'fixed',inWorld:true,pose:pose(0),geometryProvenance:'non-native-floor-fixture'}],missing:[],provenance:'independently-admitted-fixture-inventory'};},
   goodyContext:()=>flags.noGoody||staged.health<=0?null:{...goody,eyePosition:flags.coincidentBang?{x:0,y:7,z:0}:goody.eyePosition},
   stageEffects:effects=>{check();for(const effect of effects){staged.effects.push(effect);if(effect.kind==='bang-hurt')staged.health-=effect.amount;}},
   prepareCommit:()=>{check();if(flags.failPrepare)throw Error('Injected environment prepare failure');sealed=true;return ()=>{committed=staged;open=false;active=false;};},
   rollback:()=>{open=false;active=false;},
  };return stage;
 }};
 const queries:{models:readonly Readonly<ReceiverModelEntry>[];prefix:ReceiverScenePrefix|undefined}[]=[];
 const backend:ReceiverModelBackend={cloneGI:()=>({pose:pose(50),geometryProvenance:'non-intersecting-GI-fixture'}),sphere:()=>({bspWorld:1,provenance:'declared-resource'}),cloneGun:()=>({pose:pose(6),geometryProvenance:'non-intersecting-gun-fixture'}),
  heldGunPose:()=>pose(13),reparentGunMembership:()=>true,dropYaw:()=>0,
  nearestDetailedDownward:(origin,models,_callback,_generation,prefix)=>{
   queries.push({models,prefix});if(++queryNumber===flags.failQueryNumber)throw Error('Injected second birth query failure');
   // This complete injected fixture oracle gives eligible facets only to floor
   // and FX entries; GI/gun fixture resources have no facet on this ray.
   const hit=models.filter(m=>m.inWorld&&(m.kind==='fixed'||m.kind==='transient')&&m.pose.position.y<=origin.y).sort((a,b)=>b.pose.position.y-a.pose.position.y)[0];
   return {hit:hit?{position:{x:origin.x,y:hit.pose.position.y,z:origin.z},handle:hit.handle,geometryProvenance:hit.geometryProvenance}:null,coverage:{complete:true,missing:[],provenance:'controlled-complete-fixture-oracle'}};
  }};
 const fxBackend:OriginalReceiverTransientBackend={clonePlane:()=>({pose:pose(0),geometryProvenance:'explicit-plane-fixture',inWorld:true}),cloneMuzzle:()=>({pose:{...pose(0),scale:.7},geometryProvenance:'muzzle-fixture',inWorld:true}),
  pointAt:()=>{if(flags.failPointAt)throw Error('Injected FX callback orientation failure');return {...q};},selfRotate:rotation=>rotation};
 const dropCapture=options.dropSample?createOriginalSoloActorDropCapture({sceneGeneration:1,maxEntries:16,maxTextChars:1024,sampleRandom36:options.dropSample,readCommittedCallback:()=>committed.prefix?.callback??0}):undefined;
 if(dropCapture)backend.dropYaw=(actorId,callback,request)=>dropCapture.readDropYawPlan(actorId,callback,request).entries.find(e=>e.actorId===actorId)!.random36*10*Math.PI/180;
 const controller=new OriginalReceiverSceneController(backend,fxBackend,environment,{model:{eyeHeight:1,sourceScale:.02,goodyBspWorld:1,sceneGeneration:1,maxModels:64,maxPickups:16,...(dropCapture?{dropRequestOwner:dropCapture.requestOwner}:{})},transient:{maxModels:32,maxActors:options.maxTransientActors??32,maxShaders:32},maxEffects:options.maxEffects??64});
 const view=new OriginalRemoteView(0,{},'source-callback',controller);
 const freeze=()=>({actors:view.freeze(),corpses:view.freezeCorpses(),clock:view.debugState(),models:controller.freezeModels(),fx:controller.freezeTransientModels(),shaders:controller.freezeShaders(),state:controller.debugState(),publication:controller.freezePublication(),version:controller.freezePublicationVersion(),environment:structuredClone(committed)});
 return {view,controller,backend,fxBackend,environment,events,flags,queries,freeze,environmentState:()=>structuredClone(committed),setExternalInventory:(models:readonly ReceiverModelEntry[]|undefined)=>{externalInventory=models;}};
};
const send=(view:OriginalRemoteView,tick:number,targets:OriginalRemoteViewTarget[])=>expect(view.recordSent({tick,sentAt:0,targets})).toEqual({ok:true});
const accept=(view:OriginalRemoteView,tick:number,callbacks=0)=>view.accept({callbacks,receipts:[{tick,callbacks}]},callbacks*1000/30);
const step=(view:OriginalRemoteView,callbacks:number)=>view.accept({callbacks,receipts:[]},callbacks*1000/30);

describe('physical-stage puff append',()=>{
 const puff=(id='physical-puff')=>({kind:'puff' as const,id,position:{x:2,y:4,z:6},angleSourceDegrees:30});
 const ready=()=>{const f=setup();f.events.set('receipt:0:0',[bang('old')]);send(f.view,0,[target('A')]);expect(accept(f.view,0)).toEqual({ok:true});return f;};
 const prefix:ReceiverScenePrefix={kind:'receipt',sceneGeneration:1,callback:0,tick:0};
 it('jointly publishes the new checkpoint without environment replay, queries, old FX aging or clock changes',()=>{
  const f=ready(),before=f.freeze(),publication=f.controller.freezePublication(),begin=vi.spyOn(f.environment,'begin');
  const stage=f.controller.preparePhysicalPuff(prefix,goody,puff());
  expect(f.freeze()).toEqual(before);expect(begin).not.toHaveBeenCalled();expect(stage.checkpoint.prefix).toEqual(prefix);expect(Object.isFrozen(stage.checkpoint)).toBe(true);
  expect(stage.checkpoint.actors.find(a=>a.id==='physical-puff')).toMatchObject({kind:'puff',time:0});
  stage.commit();expect(f.controller.freezePublication()).toBe(publication);expect(f.controller.freezePublicationVersion()).toBe(before.version+1);
  expect(f.freeze()).toMatchObject({actors:before.actors,corpses:before.corpses,clock:before.clock,models:before.models,environment:before.environment});
  expect(f.controller.debugState().fx.actors.find(a=>a.id==='old')).toEqual(before.state.fx.actors.find(a=>a.id==='old'));
  expect(f.queries).toHaveLength(1);expect(begin).not.toHaveBeenCalled();stage.rollback();expect(()=>stage.commit()).toThrow('closed or failed');
  // The normal CURRENT snapshot, rather than this physical append, refreshes
  // inventory and advances the two previously committed actors exactly once.
  expect(step(f.view,1)).toEqual({ok:true});expect(f.controller.debugState().fx.actors.find(a=>a.id==='physical-puff')?.time).toBe(6);
 });
 it('rolls back the shared clone allocator and retains exact names on retry',()=>{
  const f=ready(),before=f.freeze(),first=f.controller.preparePhysicalPuff(prefix,goody,puff());
  const names=first.checkpoint.models.map(m=>m.handle);first.rollback();first.rollback();expect(f.freeze()).toEqual(before);expect(()=>first.commit()).toThrow();
  const retry=f.controller.preparePhysicalPuff(prefix,goody,puff());expect(retry.checkpoint.models.map(m=>m.handle)).toEqual(names);retry.commit();
  const next=f.controller.preparePhysicalPuff(prefix,goody,puff('next'));expect(next.checkpoint.models.map(m=>m.handle).slice(0,names.length)).toEqual(names);next.rollback();
 });
 it('rejects absent, stale, foreign and distinct receipt prefixes before clone acquisition',()=>{
  const empty=setup();expect(()=>empty.controller.preparePhysicalPuff(prefix,goody,puff())).toThrow('committed prefix');
  const f=ready(),before=f.freeze(),clone=vi.spyOn(f.fxBackend,'clonePlane');
  for(const p of [{...prefix,tick:1},{...prefix,sceneGeneration:2},{kind:'callback' as const,sceneGeneration:1,callback:0},{...prefix,callback:1}])expect(()=>f.controller.preparePhysicalPuff(p,goody,puff())).toThrow('committed prefix');
  expect(clone).not.toHaveBeenCalled();expect(f.freeze()).toEqual(before);
 });
 it('validates finite detached puff/goody operands and sequence limits before allocation',()=>{
  const f=ready(),before=f.freeze(),clone=vi.spyOn(f.fxBackend,'clonePlane');
  for(const event of [{...puff(),angleSourceDegrees:9},{...puff(),id:' '},{...puff(),id:'x'.repeat(65536)},{...puff(),position:{x:NaN,y:0,z:0}}])expect(()=>f.controller.preparePhysicalPuff(prefix,goody,event)).toThrow();
  expect(()=>f.controller.preparePhysicalPuff(prefix,{...goody,bspWorld:0},puff())).toThrow();expect(clone).not.toHaveBeenCalled();expect(f.freeze()).toEqual(before);
  (f.controller as unknown as {publicationVersion:number}).publicationVersion=Number.MAX_SAFE_INTEGER;
  expect(()=>f.controller.preparePhysicalPuff(prefix,goody,puff())).toThrow('publication sequence');expect(clone).not.toHaveBeenCalled();
 });
 it('releases both stages after a constructor failure and permits a clean retry',()=>{
  const f=ready(),before=f.freeze();f.flags.failPointAt=true;
  expect(()=>f.controller.preparePhysicalPuff(prefix,goody,puff())).toThrow('orientation failure');expect(f.freeze()).toEqual(before);
  f.flags.failPointAt=false;const retry=f.controller.preparePhysicalPuff(prefix,goody,puff());retry.commit();expect(f.controller.debugState().fx.actors).toHaveLength(2);
 });
 it('rejects a full transient actor budget without acquiring another clone or changing committed state',()=>{
  const f=setup({maxTransientActors:1});f.events.set('receipt:0:0',[bang('old')]);send(f.view,0,[target('A')]);expect(accept(f.view,0)).toEqual({ok:true});
  const before=f.freeze(),clone=vi.spyOn(f.fxBackend,'clonePlane');expect(()=>f.controller.preparePhysicalPuff(prefix,goody,puff())).toThrow('actor budget');expect(clone).not.toHaveBeenCalled();expect(f.freeze()).toEqual(before);
  const normal=f.controller.begin();normal.rollback();
 });
 it('rolls back an already prepared FX owner when model preparation fails',()=>{
  const f=ready(),before=f.freeze(),models=(f.controller as unknown as {models:OriginalReceiverModelWorld}).models;
  const begin=models.begin.bind(models),spy=vi.spyOn(models,'begin').mockImplementation(()=>{
   const stage=begin();return {...stage,prepareCommit:()=>{throw Error('Injected physical model prepare failure');}};
  });
  expect(()=>f.controller.preparePhysicalPuff(prefix,goody,puff())).toThrow('model prepare failure');expect(f.freeze()).toEqual(before);spy.mockRestore();
  const retry=f.controller.preparePhysicalPuff(prefix,goody,puff());retry.commit();expect(f.controller.debugState().fx.actors).toHaveLength(2);
 });
 it('poisons caught recursive entry during acquisition and prevents regular stages while prepared',()=>{
  const f=ready(),before=f.freeze(),original=f.fxBackend.pointAt;
  f.fxBackend.pointAt=(...args)=>{expect(()=>f.controller.begin()).toThrow('physical puff active');return original(...args);};
  expect(()=>f.controller.preparePhysicalPuff(prefix,goody,puff())).toThrow('closed or failed');expect(f.freeze()).toEqual(before);f.fxBackend.pointAt=original;
  const prepared=f.controller.preparePhysicalPuff(prefix,goody,puff());expect(()=>f.controller.begin()).toThrow('physical puff active');expect(()=>prepared.commit()).toThrow('closed or failed');expect(f.freeze()).toEqual(before);
  f.fxBackend.pointAt=(...args)=>{expect(()=>f.controller.preparePhysicalPuff(prefix,goody,puff('recursive'))).toThrow('physical puff active');return original(...args);};
  expect(()=>f.controller.preparePhysicalPuff(prefix,goody,puff())).toThrow('closed or failed');expect(f.freeze()).toEqual(before);f.fxBackend.pointAt=original;
  const regular=f.controller.begin();expect(()=>f.controller.preparePhysicalPuff(prefix,goody,puff())).toThrow('transaction active');regular.rollback();
  const retry=f.controller.preparePhysicalPuff(prefix,goody,puff());retry.rollback();
 });
 it('captures mutable caller operands once and never reads them during commit',()=>{
  const f=ready(),event=puff(),context=structuredClone(goody),p={...prefix};
  const stage=f.controller.preparePhysicalPuff(p,context,event);event.position.x=999;event.id='changed';(context.modelPosition as {x:number}).x=999;p.tick=99;
  expect(stage.checkpoint.actors.find(a=>a.id==='physical-puff')?.position).toEqual({x:2,y:4,z:6});stage.commit();expect(f.controller.debugState().prefix).toEqual(prefix);
 });
});

describe('actual mirror joint scene controller (controlled inventory and grouped callback adapter)',()=>{
 it('admits the first drop after empty callbacks within one catch-up batch and reuses it on retry',()=>{
  let draws=0;const {view,controller,flags,freeze}=setup({dropSample:()=>{draws++;return 9;}});
  send(view,0,[target('A')]);expect(accept(view,0)).toEqual({ok:true});send(view,1,[{...target('A'),alive:false}]);const before=freeze();flags.failPrepare=true;
  expect(()=>view.accept({callbacks:3,receipts:[{tick:1,callbacks:2}]},100)).toThrow('prepare failure');expect(freeze()).toEqual(before);expect(draws).toBe(1);
  flags.failPrepare=false;expect(view.accept({callbacks:3,receipts:[{tick:1,callbacks:2}]},100)).toMatchObject({ok:true,deaths:[{id:'A',callback:3}]});expect(draws).toBe(1);expect(controller.freezePickups()).toHaveLength(1);expect(view.debugState().callbacks).toBe(3);
 });
 it('samples actual dead-actor detach once through preparation failure and retry',()=>{
  let draws=0;const {view,controller,flags,freeze}=setup({dropSample:()=>{draws++;return 9;}});
  send(view,0,[target('A')]);expect(accept(view,0)).toEqual({ok:true});send(view,1,[{...target('A'),alive:false}]);expect(accept(view,1)).toEqual({ok:true});expect(draws).toBe(0);
  const before=freeze();flags.failPrepare=true;expect(()=>step(view,1)).toThrow('prepare failure');expect(freeze()).toEqual(before);expect(draws).toBe(1);
  flags.failPrepare=false;expect(step(view,1)).toMatchObject({ok:true,deaths:[{id:'A',callback:1}]});expect(draws).toBe(1);expect(controller.freezePickups()).toHaveLength(1);expect(view.freeze()).toEqual([]);
 });
 it('consumes no drop randomness when staged lethal damage suppresses a dead actor callback',()=>{
  let draws=0;const {view,events,controller,environmentState}=setup({health:5,dropSample:()=>{draws++;return 9;}});
  events.set('receipt:0:0',[bang('lethal')]);send(view,0,[target('A')]);expect(accept(view,0)).toEqual({ok:true});send(view,1,[{...target('A'),alive:false}]);expect(accept(view,1)).toEqual({ok:true});
  expect(step(view,1)).toEqual({ok:true});expect(environmentState().health).toBe(0);expect(draws).toBe(0);expect(controller.freezePickups()).toEqual([]);expect(view.freeze()).toHaveLength(1);
 });
 it('admits receipt-born planes before each actor birth at distinct receipts in the same callback',()=>{
  const {view,controller,events,queries}=setup();events.set('receipt:0:0',[bang('first-plane',4)]);events.set('receipt:0:1',[bang('second-plane',7)]);
  send(view,0,[target('A')]);send(view,1,[target('B')]);expect(view.accept({callbacks:0,receipts:[{tick:0,callbacks:0},{tick:1,callbacks:0}]},0)).toEqual({ok:true});
  expect(view.freeze().map(a=>({id:a.id,y:a.position.y,steps:a.steps}))).toEqual([{id:'A',y:4,steps:10},{id:'B',y:7,steps:10}]);
  expect(queries.map(v=>v.models.filter(m=>m.kind==='transient').map(m=>m.pose.position.y))).toEqual([[4],[4,7]]);
  expect(controller.freezePublication().map(e=>e.kind)).toEqual(['sound','sound']);expect(controller.freezePublicationVersion()).toBe(1);
 });
 it('captures a positive-report muzzle from the old gun before replacement and exposes it to a later birth',()=>{
  const {view,controller,queries}=setup();send(view,0,[target('A',1)]);send(view,1,[target('B')]);
  expect(view.accept({callbacks:1,receipts:[{tick:0,callbacks:0},{tick:1,callbacks:1}]},1000/30)).toMatchObject({ok:true,shots:[{id:'A',weapon:'rifle',callback:1,position:{x:0,y:0,z:0}}]});
  const muzzle=controller.freezeTransientModels()[0],held=controller.freezeModels().find(m=>m.resource==='ak47')!;
  expect(muzzle.resource).toBe('mfak47');expect(muzzle.pose.position).toEqual({x:0,y:6,z:0});expect(muzzle.pose.rotation).toEqual(q);expect(muzzle.pose.scale).toBe(.7);expect(held.pose.position.y).toBe(13);
  expect(view.freeze().find(a=>a.id==='B')!.position.y).toBe(6);expect(queries[1].models.some(m=>m.handle===muzzle.handle)).toBe(true);
  expect(controller.debugState().fx.actors[0]).toMatchObject({id:'remote-muzzle:1:A',time:1});expect(controller.freezePublication()).toEqual([{kind:'remote-shot',actorId:'A',weapon:'rifle',callback:1,position:{x:0,y:1,z:0}}]);
  expect(step(view,2)).toEqual({ok:true});expect(controller.debugState().fx.actors[0].time).toBe(0);expect(controller.freezePublication()).toEqual([]);expect(controller.freezePublicationVersion()).toBe(2);
 });
 it('rolls back mirror, models, FX, clone allocation, queued receipts and publication on a second birth failure',()=>{
  const {view,controller,events,flags,freeze}=setup();events.set('receipt:0:0',[bang('first')]);send(view,0,[target('A'),target('B')]);const before=freeze();flags.failQueryNumber=2;
  expect(()=>accept(view,0)).toThrow('Injected second birth query failure');expect(freeze()).toEqual(before);
  flags.failQueryNumber=-1;expect(accept(view,0)).toEqual({ok:true});expect(controller.freezeTransientModels()[0].handle).toBe('plane1');expect(controller.debugState().models.actorHandles.map(a=>a.gi)).toEqual(['gi:baddy3','gi:baddy4']);
 });
 it('rolls back staged private damage and every callback when a later FX actor callback fails',()=>{
  const {view,events,flags,freeze,environmentState}=setup();events.set('receipt:0:0',[bang('old-bang'),{kind:'blood',id:'old-blood',position:{x:0,y:3,z:0}}]);send(view,0,[target('A')]);expect(accept(view,0)).toEqual({ok:true});
  const before=freeze();flags.failPointAt=true;
  // Keep bang's horizontal coincidence so its first callback stages damage
  // without pointAt. The next blood actor necessarily calls pointAt and fails.
  flags.coincidentBang=true;expect(()=>step(view,1)).toThrow('Injected FX callback orientation failure');expect(freeze()).toEqual(before);expect(environmentState().health).toBe(100);
 });
 it('does not publish any prepared state when environment prepare fails',()=>{
  const {view,events,flags,freeze}=setup();events.set('receipt:0:0',[bang('new')]);send(view,0,[target('A')]);const before=freeze();flags.failPrepare=true;
  expect(()=>accept(view,0)).toThrow('Injected environment prepare failure');expect(freeze()).toEqual(before);flags.failPrepare=false;expect(accept(view,0)).toEqual({ok:true});
 });
 it('seals prepared controller stages against further mutation and releases an unpublished stage on rollback',()=>{
  const {controller,freeze}=setup();const before=freeze(),stage=controller.begin();stage.applyExternalReceipt(0,0);const publish=stage.prepareCommit();
  expect(()=>stage.allocateCloneName('plane')).toThrow('closed or failed');expect(()=>stage.birth({actorId:'A',targetFeet:{x:0,y:10,z:0},targetYaw:0,callback:0})).toThrow('closed or failed');stage.rollback();expect(freeze()).toEqual(before);expect(()=>publish()).toThrow('publication closed');
  const next=controller.begin();next.applyExternalReceipt(0,0);expect(next.allocateCloneName('plane')).toBe('plane1');next.rollback();
 });
 it('refreshes staged health between FX actors and freezes baddy callbacks after lethal private damage',()=>{
  const {view,controller,events,environmentState}=setup({health:5});events.set('receipt:0:0',[bang('first'),bang('second')]);send(view,0,[target('A',1)]);expect(accept(view,0)).toEqual({ok:true});const actor=view.freeze()[0];
  expect(step(view,1)).toEqual({ok:true});expect(environmentState().health).toBe(0);expect(controller.debugState().fx.actors.map(a=>a.time)).toEqual([15,16]);expect(view.freeze()[0]).toEqual(actor);expect(view.debugState().callbacks).toBe(1);
  expect(controller.freezePublication().map(e=>e.kind)).toEqual(['bang-hurt']);expect(controller.freezeTransientModels().some(m=>m.resource==='mfak47')).toBe(false);
 });
 it('keeps callback-born FX unadvanced until the following callback in the declared scheduling adapter',()=>{
  const {view,controller,events}=setup();events.set('callback:1:',[bang('callback-new')]);send(view,0,[target('A')]);expect(accept(view,0)).toEqual({ok:true});expect(step(view,1)).toEqual({ok:true});
  expect(controller.debugState().fx.actors[0].time).toBe(16);expect(controller.freezePublication().map(e=>e.kind)).toEqual(['sound']);expect(step(view,2)).toEqual({ok:true});expect(controller.debugState().fx.actors[0].time).toBe(15);
 });
 it('rejects publication exhaustion, missing receipt history and wrong prefix keys with no partial acceptance',()=>{
  const limited=setup({maxEffects:1});limited.events.set('receipt:0:0',[bang('one'),bang('two')]);send(limited.view,0,[target('A')]);const before=limited.freeze();expect(()=>accept(limited.view,0)).toThrow('publication budget requires resynchronization');expect(limited.freeze()).toEqual(before);
  const missing=setup();send(missing.view,0,[target('A')]);missing.flags.failSnapshotTick=0;const absent=missing.freeze();expect(()=>accept(missing.view,0)).toThrow('Injected second receipt scene failure');expect(missing.freeze()).toEqual(absent);
  const wrong=setup();wrong.events.set('receipt:0:0',[bang('uncommitted')]);send(wrong.view,0,[target('A')]);wrong.flags.wrongSnapshotPrefix=true;const initial=wrong.freeze();expect(()=>accept(wrong.view,0)).toThrow('Receiver external prefix mismatch');expect(wrong.freeze()).toEqual(initial);
 });
 it('rejects oversized external and combined FX inventory before reading its iterator or copying any model',()=>{
  for(const length of [65,64]){
   const fixture=setup();let reads=0;
   const inventory=new Proxy(new Array<ReceiverModelEntry>(length),{get:(array,key,receiver)=>{if(key===Symbol.iterator||typeof key==='string'&&/^\d+$/.test(key)){reads++;throw Error('Oversized inventory must not be iterated or copied');}return Reflect.get(array,key,receiver);}});
   fixture.setExternalInventory(inventory);fixture.events.set('receipt:0:0',[bang('staged-before-query')]);send(fixture.view,0,[target('A')]);const before=fixture.freeze();
   // 65 external models exceed maxModels64 directly. 64 external models plus
   // the newly admitted plane exceed it only at the combined-overlay boundary.
   expect(()=>accept(fixture.view,0)).toThrow(/budget|inventory/);expect(reads).toBe(0);expect(fixture.freeze()).toEqual(before);
   fixture.setExternalInventory(undefined);expect(accept(fixture.view,0)).toEqual({ok:true});expect(fixture.controller.freezeTransientModels()[0].handle).toBe('plane1');expect(fixture.controller.debugState().models.actorHandles[0].gi).toBe('gi:baddy3');
  }
 });
 it('retains recycled barrel shader/scale through a failed later birth and publishes unnamed damage only after commit',()=>{
  const f=setup();f.events.set('receipt:0:0',[bang('old-rocket')]);send(f.view,0,[target('A')]);expect(accept(f.view,0)).toEqual({ok:true});expect(step(f.view,16)).toEqual({ok:true});
  const old=f.controller.freezeTransientModels()[0];expect(old.inWorld).toBe(false);expect(old.pose.scale).toBe(8);expect(f.controller.debugState().fx.shaderPool).toEqual([old.shaderHandle]);
  f.events.set('receipt:16:1',[{kind:'bang',id:'barrel',position:{x:0,y:7,z:0},type:'barrel'}]);send(f.view,1,[target('B'),target('C')]);const before=f.freeze();f.flags.failQueryNumber=3;
  expect(()=>accept(f.view,1,16)).toThrow('Injected second birth query failure');expect(f.freeze()).toEqual(before);
  f.flags.failQueryNumber=-1;expect(accept(f.view,1,16)).toEqual({ok:true});const barrel=f.controller.freezeTransientModels()[0];
  expect(barrel).toMatchObject({handle:old.handle,shaderHandle:old.shaderHandle,inWorld:true,pose:{scale:8,position:{x:0,y:7,z:0}}});expect(barrel.pose.rotation).toEqual(old.pose.rotation);
  expect(f.controller.debugState().fx.shaderPool).toEqual([old.shaderHandle]);expect(f.controller.freezePublication()).toEqual([{kind:'sound',sound:'boomnew',position:{x:0,y:7,z:0}}]);
  const health=f.environmentState().health;expect(step(f.view,17)).toEqual({ok:true});expect(f.environmentState().health).toBe(health-5);
  expect(f.controller.freezePublication()).toEqual([{kind:'bang-hurt',effectId:'barrel',position:{x:0,y:7,z:0},attackerName:null,amount:5,radiusSource:250}]);
 });
 it('rejects an undeclared fresh barrel shader before any receiver state or publication commits',()=>{
  const f=setup();f.events.set('receipt:0:0',[{kind:'bang',id:'fresh-barrel',position:{x:0,y:7,z:0},type:'barrel'}]);send(f.view,0,[target('A')]);const before=f.freeze();
  expect(()=>accept(f.view,0)).toThrow(/shader/i);expect(f.freeze()).toEqual(before);expect(f.queries).toEqual([]);
 });
 it('queries full posed actual GI resources and an explicitly admitted tilted plane with independent nearest triangles',()=>{
  const base=new URL('../public/assets/',import.meta.url),assets:OriginalSoldierCollisionAssets={geometry:JSON.parse(readFileSync(new URL('original-soldier/geometry.json',base),'utf8')),rigMotion:JSON.parse(readFileSync(new URL('original-soldier/rig-motion.json',base),'utf8'))};
  const weapons=JSON.parse(readFileSync(new URL('original-weapons/geometry.json',base),'utf8')) as ReceiverWeaponGeometry;
  const basis=new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI/2,0,0)).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),-Math.PI/2));
  const actorResources=new OriginalReceiverActorResources(assets,weapons,{sourceScale:.02,giResourceOrientation:{x:basis.x,y:basis.y,z:basis.z,w:basis.w},gunScale:1,maxVertices:100000,maxFaces:100000,maxMotionKeys:100000,provenance:'actual-decoded-controller-fixture',sidedness:'double'});
  // Imported world, native plane tessellation and unknown dynamic classes are
  // not inferred. This test independently admits a closed fixture inventory.
  const fxResources=new OriginalReceiverTransientResources(weapons,{sourceScale:.02,planeResource:{widthWorld:2.25,positions:[[-1.125,0,-1.125],[1.125,0,-1.125],[1.125,0,1.125],[-1.125,0,1.125]],faces:[[0,1,2],[0,2,3]],provenance:'explicit-plane-fixture'},maxVertices:100000,maxFaces:100000,provenance:'controlled-controller-resource-fixture',sidedness:'double'});
  const {view,controller,backend,events}=setup(),samples:{meshes:OriginalReceiverRayModel[];distance:number;independent:number;handle:string}[]=[];
  backend.cloneGun=()=>({pose:{...pose(100),position:{x:100,y:100,z:100}},geometryProvenance:'actual-gun-off-ray-fixture'});
  backend.heldGunPose=actorResources.heldGunPose.bind(actorResources);
  backend.nearestDetailedDownward=(origin,models,callback,generation)=>{
   const meshes=models.map(model=>{
    if(model.kind==='gi')return actorResources.resolve(model,'live-gi');if(model.kind==='gun')return actorResources.resolve(model,'held-gun');if(model.kind==='transient')return fxResources.resolve(model,2.25);
    return {handle:model.handle,layer:'fixed' as const,inWorld:model.inWorld,groupAncestry:[],geometryProvenance:model.geometryProvenance,positions:[[-100,0,-100],[100,0,-100],[0,0,100]],faces:[[0,1,2]],worldMatrix:new THREE.Matrix4().toArray(),sidedness:'double' as const};
   });
   const oracle=createOriginalReceiverSceneRay(meshes,{sceneGeneration:generation,callback,expectedHandles:models.map(m=>m.handle),accountedLayers:ORIGINAL_RECEIVER_SCENE_LAYERS,unresolved:[]},{maxModels:64,maxVertices:100000,maxTriangles:100000}),hit=oracle.nearestDetailedDownward(origin);
   expect(hit).not.toBeNull();const referenceRay=new THREE.Ray(new THREE.Vector3(origin.x,origin.y,origin.z),new THREE.Vector3(0,-1,0));let nearest=Infinity;
   for(const mesh of meshes){if(!mesh.inWorld)continue;const matrix=new THREE.Matrix4().fromArray(mesh.worldMatrix);for(const face of mesh.faces){const vertices=face.map(index=>new THREE.Vector3().fromArray(mesh.positions[index]).applyMatrix4(matrix)),point=new THREE.Vector3();if(referenceRay.intersectTriangle(vertices[0],vertices[1],vertices[2],false,point))nearest=Math.min(nearest,point.distanceTo(referenceRay.origin));}}
   samples.push({meshes,distance:hit!.distance,independent:nearest,handle:hit!.handle});return {hit:{position:hit!.point,handle:hit!.handle,geometryProvenance:hit!.geometryProvenance},coverage:{complete:true,missing:[],provenance:'independently-closed-fixture-inventory'}};
  };
  try{
   events.set('receipt:0:0',[bang('real-plane',6)]);send(view,0,[target('A')]);expect(accept(view,0)).toEqual({ok:true});expect(view.freeze()[0].position.y).toBeCloseTo(6,12);
   expect(samples[0].handle).toBe('plane1');expect(samples[0].distance).toBeCloseTo(samples[0].independent,10);expect(samples[0].meshes.find(m=>m.layer==='live-gi')!.positions).toHaveLength(742);
   expect(controller.freezeTransientModels()[0].pose.rotation).toEqual(q);const resolved=fxResources.resolve(controller.freezeTransientModels()[0],2.25),scale=new THREE.Vector3(),rotation=new THREE.Quaternion();new THREE.Matrix4().fromArray(resolved.worldMatrix).decompose(new THREE.Vector3(),rotation,scale);
   expect(scale.x).toBeCloseTo(8,12);expect(Math.abs(rotation.dot(new THREE.Quaternion(q.x,q.y,q.z,q.w)))).toBeCloseTo(1,12);
  }finally{actorResources.dispose();fxResources.dispose();}
 });
});
