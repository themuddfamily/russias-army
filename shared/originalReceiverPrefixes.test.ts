import {describe,expect,it} from 'vitest';
import {OriginalRemoteView,type OriginalRemoteViewTarget} from './originalRemoteView';
import {OriginalReceiverModelWorld,type ReceiverModelBackend,type ReceiverModelEntry} from './originalReceiverModelWorld';
import type {ReceiverExternalSceneSource,ReceiverExternalSceneSnapshot,ReceiverScenePrefix} from './originalReceiverPrefix';
import {OriginalReceiverPrefixJournal,type ReceiverExternalPrefixDelta,type ReceiverPrefixJournalLimits} from './originalReceiverPrefixJournal';
import {createOriginalReceiverGeometryBackend} from './originalReceiverGeometryBackend';
import {ORIGINAL_RECEIVER_SCENE_LAYERS} from './originalReceiverSceneRay';

const key=(p:ReceiverScenePrefix)=>`${p.sceneGeneration}:${p.callback}:${p.kind}:${p.kind==='receipt'?p.tick:''}`;
const prefix=(callback:number,tick?:number):ReceiverScenePrefix=>tick===undefined?{sceneGeneration:3,callback,kind:'callback'}:{sceneGeneration:3,callback,kind:'receipt',tick};
const floor=(y:number):ReceiverModelEntry=>({handle:'floor',name:'floor',resource:'floor',group:'scene',kind:'fixed',inWorld:true,pose:{position:{x:0,y,z:0},yaw:0,phase:0,scale:1},geometryProvenance:'prefix-fixture-floor'});
const snapshot=(p:ReceiverScenePrefix,y:number,missing:string[]=[]):ReceiverExternalSceneSnapshot=>({prefix:p,models:[floor(y)],missing,provenance:'trusted-prefix-fixture'});
const target=(id:string):OriginalRemoteViewTarget=>({id,position:{x:0,y:10,z:0},yaw:0,motionTime:300,alive:true,weapon:'rifle'});
const setup=(snapshots:ReceiverExternalSceneSnapshot[],externalSource?:ReceiverExternalSceneSource)=>{
 const history=new Map(snapshots.map(s=>[key(s.prefix),s])),lookups:ReceiverScenePrefix[]=[],queries:{prefix:ReceiverScenePrefix|undefined;floorY:number}[]=[];
 const source:ReceiverExternalSceneSource={snapshotAt:p=>{lookups.push({...p});const found=history.get(key(p));if(!found)throw Error('Required receiver prefix unavailable');return found;}};
 const backend:ReceiverModelBackend={cloneGI:()=>({pose:{position:{x:0,y:50,z:0},yaw:0,phase:0,scale:1},geometryProvenance:'injected-gi-fixture'}),
  sphere:()=>({bspWorld:1,provenance:'declared-resource'}),nearestDetailedDownward:(origin,models,_callback,_generation,p)=>{
   const admitted=models.find(m=>m.handle==='floor')!;queries.push({prefix:p?{...p}:undefined,floorY:admitted.pose.position.y});
   return {hit:{position:{x:origin.x,y:admitted.pose.position.y,z:origin.z},handle:'floor',geometryProvenance:admitted.geometryProvenance},coverage:{complete:true,missing:[],provenance:'injected-complete-prefix-oracle'}};
  },heldGunPose:gi=>({...gi.pose,position:{...gi.pose.position}}),cloneGun:()=>({pose:{position:{x:0,y:0,z:0},yaw:0,phase:0,scale:1},geometryProvenance:'injected-gun-fixture'}),
  reparentGunMembership:()=>true,dropYaw:()=>0};
 const world=new OriginalReceiverModelWorld(backend,{eyeHeight:1,sourceScale:.02,goodyBspWorld:1,sceneGeneration:3,maxModels:32,maxPickups:16},externalSource??source);
 // Current canonical geometry is a separate fixture; querying it during a
 // historical receipt would yield 8 instead of the recorded 0 or 4.
 const futureFloor=floor(8);return {view:new OriginalRemoteView(0,{},'source-callback',world),world,history,lookups,queries,backend,futureFloor};
};
const sendTwo=(view:OriginalRemoteView)=>{expect(view.recordSent({tick:0,sentAt:0,targets:[target('a')]})).toEqual({ok:true});expect(view.recordSent({tick:1,sentAt:0,targets:[target('b')]})).toEqual({ok:true});};

describe('accepted receiver scene prefix chronology (injected geometry; no Game/Room historical scene claim)',()=>{
 it('grounds two births in their different receipt prefixes instead of the future scene',()=>{
  const {view,world,queries,lookups,futureFloor}=setup([snapshot(prefix(0,0),0),snapshot(prefix(1),2),snapshot(prefix(1,1),4)]);sendTwo(view);
  expect(view.accept({callbacks:1,receipts:[{tick:0,callbacks:0},{tick:1,callbacks:1}]},1000/30)).toEqual({ok:true});
  expect(lookups).toEqual([prefix(0,0),prefix(1),prefix(1,1)]);expect(queries).toEqual([{prefix:prefix(0,0),floorY:0},{prefix:prefix(1,1),floorY:4}]);
  const poses=view.freeze();expect(poses.find(a=>a.id==='a')!.position.y).toBeCloseTo(10/9,12);expect(poses.find(a=>a.id==='b')!.position.y).toBe(4);
  expect(futureFloor.pose.position.y).toBe(8);expect(queries.every(q=>q.floorY!==futureFloor.pose.position.y)).toBe(true);
  expect(world.freezeModels().find(m=>m.handle==='floor')!.pose.position.y).toBe(4);expect(world.freezePrefix()).toEqual(prefix(1,1));
 });
 it('distinguishes different receipt ticks at the same callback without advancing either newborn',()=>{
  const {view,world,queries}=setup([snapshot(prefix(0,0),0),snapshot(prefix(0,1),4)]);sendTwo(view);
  expect(view.accept({callbacks:0,receipts:[{tick:0,callbacks:0},{tick:1,callbacks:0}]},0)).toEqual({ok:true});
  expect(queries.map(q=>q.prefix)).toEqual([prefix(0,0),prefix(0,1)]);expect(view.freeze().map(a=>({id:a.id,y:a.position.y,steps:a.steps,motionTime:a.motionTime}))).toEqual([{id:'a',y:0,steps:10,motionTime:0},{id:'b',y:4,steps:10,motionTime:0}]);
  expect(world.freezePrefix()).toEqual(prefix(0,1));
 });
 it('rolls back the first receipt birth and intervening callback when the second prefix is incomplete',()=>{
  const second=snapshot(prefix(1,1),4,['projectile geometry']);const {view,world,history}=setup([snapshot(prefix(0,0),0),snapshot(prefix(1),2),second]);sendTwo(view);
  const before={models:world.freezeModels(),pickups:world.freezePickups(),ledger:world.debugState(),prefix:world.freezePrefix(),actors:view.freeze(),corpses:view.freezeCorpses(),clock:view.debugState()};
  const trace={callbacks:1,receipts:[{tick:0,callbacks:0},{tick:1,callbacks:1}]};expect(()=>view.accept(trace,1000/30)).toThrow('Incomplete receiver external scene');
  expect({models:world.freezeModels(),pickups:world.freezePickups(),ledger:world.debugState(),prefix:world.freezePrefix(),actors:view.freeze(),corpses:view.freezeCorpses(),clock:view.debugState()}).toEqual(before);
  history.set(key(second.prefix),snapshot(second.prefix,4));expect(view.accept(trace,1000/30)).toEqual({ok:true});expect(world.debugState().actorHandles.map(a=>a.gi)).toEqual(['gi:baddy1','gi:baddy2']);
 });
 it('rejects an unavailable callback prefix without falling back to the current floor',()=>{
  const {view,world}=setup([snapshot(prefix(0,0),0),snapshot(prefix(1,1),4)]);sendTwo(view);const clock=view.debugState(),models=world.freezeModels();
  expect(()=>view.accept({callbacks:1,receipts:[{tick:0,callbacks:0},{tick:1,callbacks:1}]},1000/30)).toThrow('Required receiver prefix unavailable');
  expect(view.debugState()).toEqual(clock);expect(view.freeze()).toEqual([]);expect(world.freezeModels()).toEqual(models);expect(world.freezePrefix()).toBeUndefined();
 });
 it('rejects a returned receipt prefix with a different trusted tick',()=>{
  const {view,world,history}=setup([snapshot(prefix(0,0),0)]);history.set(key(prefix(0,0)),snapshot(prefix(0,9),0));
  expect(view.recordSent({tick:0,sentAt:0,targets:[target('a')]})).toEqual({ok:true});const before=world.freezeModels();
  expect(()=>view.accept({callbacks:0,receipts:[{tick:0,callbacks:0}]},0)).toThrow('Receiver external prefix mismatch');expect(view.freeze()).toEqual([]);expect(world.freezeModels()).toEqual(before);expect(view.debugState().pendingTicks).toEqual([0]);
 });
 it('rejects manual external geometry replacement when a historical provider owns the scene',()=>{
  const {world,futureFloor}=setup([]);expect(()=>world.setExternalModels([futureFloor])).toThrow('require an exact provider prefix');expect(world.freezeModels()).toEqual([]);
 });
 it('rejects geometry coverage for a different receipt at the same callback before resolving any model',()=>{
  const {backend}=setup([]);let resolved=0;
  const bridge=createOriginalReceiverGeometryBackend(backend,{sceneGeneration:3,provenance:'receipt-coverage-contract-fixture',budget:{maxModels:8,maxTriangles:8,maxVertices:24},
   resolveModel:()=>{resolved++;throw Error('Wrong-prefix coverage must not resolve geometry');},
   coverageAt:callback=>({sceneGeneration:3,callback,prefix:prefix(callback,1),expectedHandles:['floor'],accountedLayers:ORIGINAL_RECEIVER_SCENE_LAYERS,unresolved:[]})});
  expect(()=>bridge.nearestDetailedDownward({x:0,y:10,z:0},[floor(0)],0,3,prefix(0,0))).toThrow('receipt prefix mismatch');expect(resolved).toBe(0);
 });
});

const journalLimits={maxPrefixes:8,maxChanges:32,maxModels:16,maxTextChars:4096};
const delta=(p:ReceiverScenePrefix,y:number):ReceiverExternalPrefixDelta=>({prefix:p,upsert:[floor(y)],remove:[],missing:[],provenance:'trusted-journal-fixture'});
describe('bounded exact receiver prefix journal (explicit controller acknowledgement)',()=>{
 it('retains getter-backed position and quaternion scalars through checkpoint and actual view acceptance',()=>{
  class Position {
   constructor(private values:{x:number;y:number;z:number}){}
   get x(){return this.values.x;}get y(){return this.values.y;}get z(){return this.values.z;}
  }
  class Quaternion {
   constructor(private values:{x:number;y:number;z:number;w:number}){}
   get x(){return this.values.x;}get y(){return this.values.y;}get z(){return this.values.z;}get w(){return this.values.w;}
  }
  const coordinates={x:0,y:2,z:0},orientation={x:Math.SQRT1_2,y:0,z:0,w:Math.SQRT1_2},entry=floor(2);
  entry.pose={...entry.pose,position:new Position(coordinates),rotation:new Quaternion(orientation)};
  const journal=new OriginalReceiverPrefixJournal({...snapshot(prefix(0,0),2),models:[entry]},journalLimits),{world,view,backend}=setup([],journal);
  const cloneOrientation={x:0,y:0,z:Math.SQRT1_2,w:Math.SQRT1_2},cloneCoordinates={x:0,y:50,z:0};
  backend.cloneGI=()=>({pose:{position:new Position(cloneCoordinates),rotation:new Quaternion(cloneOrientation),yaw:0,phase:0,scale:1},geometryProvenance:'getter-backed-clone-fixture'});
  const receivedCoordinates={x:0,y:10,z:0},received={...target('a'),position:new Position(receivedCoordinates)};
  expect(view.recordSent({tick:0,sentAt:0,targets:[received]})).toEqual({ok:true});receivedCoordinates.y=999;
  expect(view.accept({callbacks:0,receipts:[{tick:0,callbacks:0}]},0)).toEqual({ok:true});
  coordinates.y=999;orientation.x=0;orientation.w=0;cloneCoordinates.y=999;cloneOrientation.z=0;cloneOrientation.w=0;
  const stored=journal.snapshotAt(prefix(0,0)).models[0],admittedFloor=world.freezeModels().find(m=>m.handle==='floor')!,gi=world.freezeModels().find(m=>m.kind==='gi')!;
  expect(stored.pose.position).toEqual({x:0,y:2,z:0});expect(stored.pose.rotation).toEqual({x:Math.SQRT1_2,y:0,z:0,w:Math.SQRT1_2});
  expect(admittedFloor.pose.position).toEqual(stored.pose.position);expect(admittedFloor.pose.rotation).toEqual(stored.pose.rotation);
  expect(gi.pose.rotation).toEqual({x:0,y:0,z:Math.SQRT1_2,w:Math.SQRT1_2});expect(view.freeze()[0].position).toEqual({x:0,y:2,z:0});
  expect(Object.isFrozen(stored.pose.position)).toBe(true);expect(Object.isFrozen(admittedFloor.pose.rotation)).toBe(true);expect(Object.isFrozen(gi.pose.rotation)).toBe(true);
  journal.record(delta(prefix(1),2));expect(view.accept({callbacks:1,receipts:[]},1000/30)).toEqual({ok:true});
  expect(view.freeze()[0].position.y).toBeCloseTo(2+(10-2)/9,12);expect(view.freeze()[0].steps).toBe(9);
 });
 it('requires named runtime budgets and string provenance, and retains monotonic receipt ticks across callback acknowledgement',()=>{
  for(const incomplete of [{},{maxPrefixes:1}])expect(()=>new OriginalReceiverPrefixJournal(snapshot(prefix(0),0),incomplete as ReceiverPrefixJournalLimits)).toThrow('Invalid receiver prefix journal limits');
  expect(()=>new OriginalReceiverPrefixJournal({...snapshot(prefix(0),0),provenance:42 as unknown as string},journalLimits)).toThrow('Missing receiver prefix provenance');
  const journal=new OriginalReceiverPrefixJournal(snapshot(prefix(0),0),journalLimits);journal.record(delta(prefix(1,10),1));journal.record(delta(prefix(2),2));
  const before=journal.debugState();expect(()=>journal.record(delta(prefix(2,9),3))).toThrow('receipt order mismatch');expect(()=>journal.record(delta(prefix(2,10),3))).toThrow('receipt order mismatch');expect(journal.debugState()).toEqual(before);
  journal.acknowledge(prefix(2));const acknowledged=journal.debugState();
  expect(()=>journal.record(delta(prefix(2,9),3))).toThrow('receipt order mismatch');expect(()=>journal.record(delta(prefix(2,10),3))).toThrow('receipt order mismatch');expect(journal.debugState()).toEqual(acknowledged);
  journal.record(delta(prefix(2,11),3));expect(journal.snapshotAt(prefix(2,11)).models[0].pose.position.y).toBe(3);
 });
 it('replays checkpoint and patches at different receipt ticks within one callback',()=>{
  const journal=new OriginalReceiverPrefixJournal(snapshot(prefix(0),8),journalLimits);journal.record(delta(prefix(0,0),0));journal.record(delta(prefix(0,1),4));
  expect(journal.snapshotAt(prefix(0)).models[0].pose.position.y).toBe(8);expect(journal.snapshotAt(prefix(0,0)).models[0].pose.position.y).toBe(0);expect(journal.snapshotAt(prefix(0,1)).models[0].pose.position.y).toBe(4);
 });
 it('rejects missing callback prefixes instead of clamping to a recorded past or future state',()=>{
  const journal=new OriginalReceiverPrefixJournal(snapshot(prefix(0),0),journalLimits);journal.record(delta(prefix(2),4));const before=journal.debugState();
  expect(()=>journal.snapshotAt(prefix(1))).toThrow('historical prefix unavailable');expect(()=>journal.snapshotAt(prefix(3))).toThrow('historical prefix unavailable');expect(journal.debugState()).toEqual(before);
 });
 it('keeps lookup pure and all retained matrix, pose and quaternion state detached and frozen',()=>{
  const matrix=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],entry=floor(2);entry.worldMatrix=matrix;entry.pose.rotation={x:0,y:0,z:0,w:1};
  const journal=new OriginalReceiverPrefixJournal({...snapshot(prefix(0),2),models:[entry]},journalLimits);journal.record(delta(prefix(0,0),3));const before=journal.debugState(),stored=journal.snapshotAt(prefix(0)).models[0];
  matrix[13]=100;entry.pose.position.y=200;entry.pose.rotation.w=0;
  expect(stored.worldMatrix![13]).toBe(0);expect(stored.pose.position.y).toBe(2);expect(stored.pose.rotation!.w).toBe(1);
  expect(Object.isFrozen(stored.worldMatrix)).toBe(true);expect(Object.isFrozen(stored.pose.position)).toBe(true);expect(Object.isFrozen(stored.pose.rotation)).toBe(true);
  journal.snapshotAt(prefix(0,0));journal.snapshotAt(prefix(0));expect(journal.debugState()).toEqual(before);
 });
 it('keeps committed and pending journal events unchanged after failed or successful view acceptance until explicit acknowledgement',()=>{
  const journal=new OriginalReceiverPrefixJournal(snapshot(prefix(0),8),journalLimits);journal.record(delta(prefix(0,0),0));journal.record(delta(prefix(0,1),4));journal.record(delta(prefix(1),7));
  const {world,view,backend}=setup([],journal),baseQuery=backend.nearestDetailedDownward;let fail=true,count=0;
  backend.nearestDetailedDownward=(...args)=>{if(++count===2&&fail)throw Error('journal second birth failure');return baseQuery(...args);};
  sendTwo(view);const state=journal.debugState(),clock=view.debugState(),trace={callbacks:0,receipts:[{tick:0,callbacks:0},{tick:1,callbacks:0}]};
  expect(()=>view.accept(trace,0)).toThrow('journal second birth failure');expect(journal.debugState()).toEqual(state);expect(view.debugState()).toEqual(clock);expect(world.freezeModels()).toEqual([]);expect(view.freeze()).toEqual([]);
  fail=false;expect(view.accept(trace,0)).toEqual({ok:true});expect(journal.debugState()).toEqual(state);expect(world.freezePrefix()).toEqual(prefix(0,1));
  journal.acknowledge(prefix(0,1));expect(journal.debugState()).toEqual({checkpoint:prefix(0,1),pending:[prefix(1)]});expect(journal.snapshotAt(prefix(1)).models[0].pose.position.y).toBe(7);
  expect(()=>journal.snapshotAt(prefix(0,0))).toThrow('historical prefix unavailable');
 });
 it('rejects prefix and model budget exhaustion without evicting a retained event or handle',()=>{
  const journal=new OriginalReceiverPrefixJournal(snapshot(prefix(0),0),{...journalLimits,maxPrefixes:1});journal.record(delta(prefix(0,0),1));const before=journal.debugState();
  expect(()=>journal.record(delta(prefix(0,1),2))).toThrow('budget requires resynchronization');expect(journal.debugState()).toEqual(before);expect(journal.snapshotAt(prefix(0,0)).models[0].pose.position.y).toBe(1);
  const capped=new OriginalReceiverPrefixJournal(snapshot(prefix(0),0),{...journalLimits,maxModels:1}),newModel={...floor(2),handle:'door',name:'door',kind:'door' as const};
  expect(()=>capped.record({...delta(prefix(0,0),2),upsert:[newModel]})).toThrow('model budget requires resynchronization');expect(capped.snapshotAt(prefix(0)).models.map(m=>m.handle)).toEqual(['floor']);expect(capped.debugState().pending).toEqual([]);
 });
 it.each(['gi','gun'] as const)('rejects owned %s handles from the external journal',kind=>{
  const journal=new OriginalReceiverPrefixJournal(snapshot(prefix(0),0),journalLimits),before=journal.debugState();
  expect(()=>journal.record({...delta(prefix(0,0),1),upsert:[{...floor(1),handle:kind,name:kind,kind}]})).toThrow('Invalid receiver prefix model');expect(journal.debugState()).toEqual(before);
 });
});
