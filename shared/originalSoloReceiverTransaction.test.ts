import {readFileSync} from 'node:fs';
import {describe,expect,it,vi} from 'vitest';
import {OriginalRemoteView,type OriginalRemoteViewTarget} from './originalRemoteView';
import {OriginalReceiverModelWorld,type ReceiverModelBackend} from './originalReceiverModelWorld';
import {OriginalSoloObserverWorlds,type OriginalSoloEvent} from './originalSoloObserverWorld';
import {registerOriginalMapRuntime,type OriginalMapRuntime} from './originalMapRuntime';
import {ORIGINAL_MAP_SCALE} from './originalMapProfile';

const target=(weapon:OriginalRemoteViewTarget['weapon']='rifle',sourceShots=0,x=0):OriginalRemoteViewTarget=>({id:'A',position:{x,y:0,z:0},yaw:0,motionTime:440,alive:true,weapon,sourceShots});
const synchronous=(view:OriginalRemoteView,tick:number,targets:OriginalRemoteViewTarget[],callbacks:number,receiptCallbacks=Math.max(0,callbacks-1))=>view.prepareSynchronousDelivery({tick,sentAt:callbacks*1000/30,targets},{callbacks,receiptCallbacks},callbacks*1000/30);
let decodedRuntime:OriginalMapRuntime|undefined;
const runtime=()=>decodedRuntime??(decodedRuntime=registerOriginalMapRuntime('woodlands',JSON.parse(readFileSync(new URL('../public/assets/original-scenes/woodland/scene.json',import.meta.url),'utf8'))));
const setup=()=>{
 let hook:((event:OriginalSoloEvent)=>void)|undefined;const events:OriginalSoloEvent[]=[],worlds=new OriginalSoloObserverWorlds(runtime(),{onEvent:event=>{events.push(event);hook?.(event);}});
 const owner=worlds.register({id:'A',name:'Alpha',eye:{x:1000,y:1000,z:1000}}),first=worlds.register({id:'B',name:'Bravo',eye:{x:2000,y:1000,z:1000}}),last=worlds.register({id:'C',name:'Charlie',eye:{x:3000,y:1000,z:1000}});
 for(const world of worlds.worlds.values())world.barrels.applySnapshots([]);owner.weapon='rifle';
 const physical=(callback:number)=>{const time=callback/30;worlds.physics(time,{skipIds:new Set(worlds.worlds.keys())});for(const world of worlds.worlds.values())worlds.goody(world.id);return time;};
 const callback=(number:number)=>{const time=physical(number);worlds.completeGoody(time);worlds.actors(time);};
 const freeze=()=>({worlds:[...worlds.worlds].map(([id,world])=>({id,life:world.lifeGeneration,alive:world.alive,callback:world.callback,receiptTick:world.receiptTick,names:[...world.actorNames],poses:world.mirror.freeze(),corpses:world.mirror.freezeCorpses(),clock:world.mirror.debugState(),body:structuredClone(world.body.position),health:structuredClone(world.health),projectiles:[...world.projectiles.keys()],blasts:[...world.blasts.keys()]})),events:[...events]});
 return {worlds,owner,first,last,events,physical,callback,freeze,setHook:(next:(event:OriginalSoloEvent)=>void)=>{hook=next;}};
};

describe('staged synchronous mirror delivery (source recurrence; no native transport claim)',()=>{
 it('keeps committed poses, queue and clocks frozen while preparing a newborn shot, then rolls back sent watermarks',()=>{
  const view=new OriginalRemoteView(0,{},'source-callback'),before={poses:view.freeze(),clock:view.debugState()},stage=synchronous(view,0,[target('rifle',1)],1);
  expect(stage.ok).toBe(true);if(!stage.ok)throw Error(stage.reason);
  expect(stage.result.shots).toEqual([{id:'A',weapon:'rifle',callback:1,position:{x:0,y:0,z:0}}]);expect(stage.nextPoses[0]).toMatchObject({id:'A',steps:9,motionTime:1000});
  expect({poses:view.freeze(),clock:view.debugState()}).toEqual(before);expect(Object.isFrozen(stage.result.shots![0].position)).toBe(true);
  expect(view.recordSent({tick:1,sentAt:1000/30,targets:[]})).toEqual({ok:false,reason:'acceptance_active'});expect(view.accept({callbacks:1,receipts:[]},1000/30)).toEqual({ok:false,reason:'acceptance_active'});
  expect(synchronous(view,1,[],1)).toEqual({ok:false,reason:'acceptance_active'});
  stage.rollback();expect({poses:view.freeze(),clock:view.debugState()}).toEqual(before);expect(()=>stage.commit()).toThrow('closed');
  const retry=synchronous(view,0,[target('rifle',1)],1);expect(retry.ok).toBe(true);if(!retry.ok)throw Error(retry.reason);retry.commit();expect(view.freeze()).toEqual(retry.nextPoses);expect(view.debugState()).toMatchObject({callbacks:1,pendingTicks:[]});
 });
 it('returns pre-movement shot feet from the real recurrence and advances received targets only after that prefix',()=>{
  const view=new OriginalRemoteView(0,{},'source-callback'),birth=synchronous(view,0,[target()],1);if(!birth.ok)throw Error(birth.reason);birth.commit();
  const shot=synchronous(view,1,[target('rifle',1,9)],2);if(!shot.ok)throw Error(shot.reason);
  expect(shot.result.shots).toEqual([{id:'A',weapon:'rifle',callback:2,position:{x:0,y:0,z:0}}]);expect(shot.nextPoses[0].position.x).toBe(1);expect(view.freeze()[0].position.x).toBe(0);shot.commit();expect(view.freeze()[0].position.x).toBe(1);
 });
 it.each(['launcher','rpg'] as const)('retains %s common shot-phase consumption without publishing a muzzle shot',weapon=>{
  const view=new OriginalRemoteView(0,{},'source-callback'),stage=synchronous(view,0,[target(weapon,2)],1);if(!stage.ok)throw Error(stage.reason);
  expect(stage.result.shots).toBeUndefined();expect(stage.nextPoses[0].motionTime).toBe(1000);stage.commit();
  const second=view.accept({callbacks:2,receipts:[]},2000/30);expect(second.ok).toBe(true);if(!second.ok)throw Error(second.reason);expect(second.shots).toBeUndefined();expect(second.events).toBeUndefined();expect(view.freeze()[0].motionTime).toBe(1000);
  const third=synchronous(view,1,[target(weapon,0,9)],3,2);if(!third.ok)throw Error(third.reason);expect(third.result.shots).toBeUndefined();expect(third.nextPoses[0].motionTime).toBeCloseTo(10/ORIGINAL_MAP_SCALE,10);third.commit();
 });
 it('orders the shot before death when an actor with a pending positive report dies in the same callback',()=>{
  const view=new OriginalRemoteView(0,{},'source-callback'),birth=synchronous(view,0,[target('rifle',1)],0);if(!birth.ok)throw Error(birth.reason);birth.commit();
  const stage=view.prepareSynchronousDelivery({tick:1,sentAt:1000/30,targets:[],deathPlayerId:'A'},{receiptCallbacks:0,callbacks:1},1000/30);if(!stage.ok)throw Error(stage.reason);
  expect(stage.result.events).toEqual([{kind:'shot',shot:{id:'A',weapon:'rifle',callback:1,position:{x:0,y:0,z:0}}},{kind:'death',transition:{id:'A',position:{x:0,y:0,z:0},yaw:Math.PI,weapon:'rifle',callback:1}}]);
  expect(Object.isFrozen(stage.result.events)).toBe(true);expect(stage.nextPoses).toEqual([]);expect(view.freeze()).toHaveLength(1);stage.commit();expect(view.freeze()).toEqual([]);expect(view.freezeCorpses()).toHaveLength(1);
 });
 it('preserves actually transmitted queue entries when an online receipt is rejected, then accepts that same entry once',()=>{
  const view=new OriginalRemoteView(0,{},'source-callback');expect(view.recordSent({tick:0,sentAt:1000/30,targets:[target('rifle',1)]})).toEqual({ok:true});const sent=view.debugState();
  expect(view.accept({callbacks:1,receipts:[{tick:1,callbacks:0}]},1000/30)).toEqual({ok:false,reason:'invalid_receipt_order'});expect(view.debugState()).toEqual(sent);expect(view.freeze()).toEqual([]);
  expect(view.recordSent({tick:0,sentAt:1000/30,targets:[]})).toEqual({ok:false,reason:'invalid_sent_order'});
  const accepted=view.accept({callbacks:1,receipts:[{tick:0,callbacks:0}]},1000/30);if(!accepted.ok)throw Error(accepted.reason);expect(accepted.shots).toHaveLength(1);expect(view.debugState()).toMatchObject({pendingTicks:[],callbacks:1});
  const repeated=view.accept({callbacks:1,receipts:[]},1000/30);if(!repeated.ok)throw Error(repeated.reason);expect(repeated.events).toBeUndefined();
 });
 it('stages a dead-only receipt without changing the life until commit or running an extra soldier callback',()=>{
  const view=new OriginalRemoteView(0,{},'source-callback'),birth=synchronous(view,0,[target()],1);if(!birth.ok)throw Error(birth.reason);birth.commit();const before=view.freeze();
  const staged=view.prepareSynchronousDelivery({tick:1,sentAt:1000/30,targets:[],deathPlayerId:'A'},{receiptCallbacks:1,callbacks:1},1000/30);if(!staged.ok)throw Error(staged.reason);
  expect(view.freeze()).toEqual(before);expect(staged.nextPoses[0]).toMatchObject({alive:false,steps:9});staged.rollback();expect(view.freeze()).toEqual(before);
  const retry=view.prepareSynchronousDelivery({tick:1,sentAt:1000/30,targets:[],deathPlayerId:'A'},{receiptCallbacks:1,callbacks:1},1000/30);if(!retry.ok)throw Error(retry.reason);retry.commit();expect(view.freeze()[0].alive).toBe(false);expect(view.freezeCorpses()).toEqual([]);
  const next=view.accept({callbacks:2,receipts:[]},2000/30);expect(next.ok).toBe(true);if(!next.ok)throw Error(next.reason);expect(next.deaths).toHaveLength(1);expect(view.freeze()).toEqual([]);expect(view.freezeCorpses()).toHaveLength(1);
 });
 it('rolls back a real scene allocator when preparation fails after actor birth, permitting the same sent tick again',()=>{
  const pose={position:{x:0,y:0,z:0},yaw:0,phase:0,scale:1},backend:ReceiverModelBackend={cloneGI:()=>({pose,geometryProvenance:'injected-clone'}),sphere:()=>({bspWorld:1,provenance:'declared-resource'}),nearestDetailedDownward:()=>({hit:null,coverage:{complete:true,missing:[],provenance:'injected-empty-ray'}}),heldGunPose:()=>pose,cloneGun:()=>({pose,geometryProvenance:'injected-gun'}),reparentGunMembership:()=>true,dropYaw:()=>0};
  const scene=new OriginalReceiverModelWorld(backend,{eyeHeight:1,sourceScale:.02,goodyBspWorld:1,sceneGeneration:1,maxModels:16,maxPickups:8}),view=new OriginalRemoteView(0,{},'source-callback',scene),begin=scene.begin.bind(scene);
  const fail=vi.spyOn(scene,'begin').mockImplementation(()=>{const stage=begin();return {...stage,prepareCommit:()=>{throw Error('Injected scene prepare failure');}};});const before=view.debugState();
  expect(()=>synchronous(view,0,[target()],1)).toThrow('Injected scene prepare failure');expect(view.debugState()).toEqual(before);expect(view.freeze()).toEqual([]);expect(scene.freezeModels()).toEqual([]);fail.mockRestore();
  const retry=synchronous(view,0,[target()],1);if(!retry.ok)throw Error(retry.reason);retry.commit();expect(scene.debugState().actorHandles[0].gi).toBe('gi:baddy1');
 });
});

describe('all-recipient solo goody and dead-delivery transaction (real imported runtime; bodies held stationary)',()=>{
 it.each(['reject','throw'] as const)('rolls back every prepared receiver when a later receiver fails by %s, retains reports, then retries the same physical phase',failure=>{
  const s=setup();s.worlds.reportShots('A',1);const time=s.physical(1),before=s.freeze(),fail=vi.spyOn(s.last.mirror,'prepareSynchronousDelivery');
  if(failure==='reject')fail.mockReturnValueOnce({ok:false,reason:'injected-later-receiver'});else fail.mockImplementationOnce(()=>{throw Error('injected-later-receiver');});
  expect(()=>s.worlds.completeGoody(time)).toThrow('injected-later-receiver');expect(s.freeze()).toEqual(before);fail.mockRestore();
  s.worlds.completeGoody(time);expect([s.first,s.last].map(w=>w.mirror.freeze().find(p=>p.id==='A')!.motionTime)).toEqual([1000,1000]);expect(s.events.filter(e=>e.kind==='shot').map(e=>e.recipientId)).toEqual(['B','C']);
  s.worlds.actors(time);s.callback(2);expect(s.events.filter(e=>e.kind==='shot')).toHaveLength(2);expect([...s.worlds.worlds.values()].map(w=>[w.callback,w.receiptTick])).toEqual([[2,2],[2,2],[2,2]]);
 });
 it('publishes actual pre-movement shot positions exactly once after every receiver mirror has committed',()=>{
  const s=setup();s.callback(1);const prior=s.first.mirror.freeze().find(p=>p.id==='A')!;s.owner.body.position.x+=9;s.worlds.reportShots('A',1);let publications=0;
  s.setHook(event=>{if(event.kind!=='shot')return;publications++;for(const receiver of [s.first,s.last])expect(receiver.mirror.freeze().find(p=>p.id==='A')!.position.x).toBeCloseTo(prior.position.x+1,12);});
  s.callback(2);const shots=s.events.filter(e=>e.kind==='shot');expect(publications).toBe(2);expect(shots.map(e=>e.position.x)).toEqual([prior.position.x,prior.position.x]);expect(shots.map(e=>e.position.y)).toEqual([prior.position.y+runtime().profile.eyeHeight,prior.position.y+runtime().profile.eyeHeight]);
 });
 it('uses the actual source SPAS scalar cadence without a second independently consumed shot counter',()=>{
  const s=setup();s.owner.weapon='shotgun';s.callback(1);s.worlds.reportShots('A',4);for(let callback=2;callback<=17;callback++)s.callback(callback);
  expect(s.events.filter(e=>e.kind==='shot')).toHaveLength(2);s.callback(18);for(let callback=19;callback<=34;callback++)s.callback(callback);expect(s.events.filter(e=>e.kind==='shot')).toHaveLength(4);
  const shots=s.events.filter((e):e is Extract<OriginalSoloEvent,{kind:'shot'}>=>e.kind==='shot'&&e.ownerId==='A');expect(shots.map(e=>({recipient:e.recipientId,time:e.time,weapon:e.weapon}))).toEqual([{recipient:'B',time:2/30,weapon:'shotgun'},{recipient:'C',time:2/30,weapon:'shotgun'},{recipient:'B',time:18/30,weapon:'shotgun'},{recipient:'C',time:18/30,weapon:'shotgun'}]);
 });
 it('keeps the entire delivery committed when a presentation hook throws, and does not replay its shot on retry',()=>{
  const s=setup();s.worlds.reportShots('A',1);const time=s.physical(1);s.setHook(event=>{if(event.kind==='shot')throw Error('Injected presentation failure');});
  expect(()=>s.worlds.completeGoody(time)).toThrow('Injected presentation failure');expect([...s.worlds.worlds.values()].map(w=>[w.callback,w.receiptTick])).toEqual([[1,1],[1,1],[1,1]]);
  expect([s.first,s.last].map(w=>w.mirror.freeze().find(p=>p.id==='A')!.motionTime)).toEqual([1000,1000]);expect(s.events.filter(e=>e.kind==='shot')).toHaveLength(1);
  expect(()=>s.worlds.completeGoody(time)).toThrow('Solo physics phase missing');s.setHook(()=>{});s.worlds.actors(time);s.callback(2);expect(s.events.filter(e=>e.kind==='shot')).toHaveLength(1);
 });
 it('keeps the owner registry and all dead-only receiver deliveries unchanged when a later direct disposal delivery fails',()=>{
  const s=setup();s.callback(1);const before=s.freeze(),fail=vi.spyOn(s.last.mirror,'prepareSynchronousDelivery').mockReturnValueOnce({ok:false,reason:'injected-death-delivery'});
  expect(()=>s.worlds.dispose('A')).toThrow('injected-death-delivery');expect(s.freeze()).toEqual(before);expect(s.worlds.worlds.get('A')).toBe(s.owner);fail.mockRestore();
  s.worlds.dispose('A');expect(s.worlds.worlds.has('A')).toBe(false);expect([s.first,s.last].map(w=>w.mirror.freeze().find(p=>p.id==='A')!.alive)).toEqual([false,false]);
  expect(s.events.filter(e=>e.kind==='baddy-detached')).toHaveLength(0);s.callback(2);expect(s.events.filter(e=>e.kind==='baddy-detached'&&e.ownerId==='A').map(e=>e.recipientId)).toEqual(['B','C']);
 });
});
