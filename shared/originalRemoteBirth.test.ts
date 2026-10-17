import {describe,expect,it} from 'vitest';
import {OriginalRemoteView,type OriginalRemoteViewTarget} from './originalRemoteView';
import {OriginalReceiverModelWorld,type ReceiverModelBackend,type ReceiverModelEntry} from './originalReceiverModelWorld';
import type {OriginalRemoteMovement} from './originalRemoteMovement';
import {ORIGINAL_MAP_SCALE,ORIGINAL_SOURCE_SPAWNS} from './originalMapProfile';
import {sourcePointToWorld} from './originalSceneGeometry';

const target=(id='a',y=10):OriginalRemoteViewTarget=>({id,position:{x:0,y,z:0},yaw:.1,motionTime:440,alive:true,weapon:'rifle'});
const movement=(v:OriginalRemoteView,id='a')=>(v as unknown as {actors:Map<string,{movement:OriginalRemoteMovement}>}).actors.get(id)!.movement;
const setup=(query:ReceiverModelBackend['nearestDetailedDownward'],eyeHeight=1,requireCompleteCoverage=true)=>{
 const b:ReceiverModelBackend={cloneGI:()=>({pose:{position:{x:0,y:50,z:0},yaw:.6,phase:456,scale:1},geometryProvenance:'fixture-clone'}),
  sphere:()=>({bspWorld:2,provenance:'declared-resource'}),nearestDetailedDownward:query,
  heldGunPose:gi=>({...gi.pose,position:{...gi.pose.position}}),cloneGun:()=>({pose:{position:{x:0,y:0,z:0},yaw:0,phase:0,scale:1},geometryProvenance:'fixture-gun'}),
  reparentGunMembership:present=>present,dropYaw:()=>0};
 const world=new OriginalReceiverModelWorld(b,{eyeHeight,sourceScale:.02,goodyBspWorld:2,sceneGeneration:1,maxModels:32,maxPickups:16,requireCompleteCoverage});
 return {world,view:new OriginalRemoteView(0,{},'source-callback',world)};
};
const sent=(view:OriginalRemoteView,tick:number,targets:OriginalRemoteViewTarget[],callbacks=0)=>expect(view.recordSent({tick,sentAt:callbacks*1000/30,targets})).toEqual({ok:true});
const accept=(view:OriginalRemoteView,tick:number,callbacks=0)=>view.accept({callbacks,receipts:[{tick,callbacks}]},callbacks*1000/30);
const step=(view:OriginalRemoteView,callbacks:number)=>view.accept({callbacks,receipts:[]},callbacks*1000/30);

describe('actual receiver acceptance birth foundation (injected complete oracle; no map integration claim)',()=>{
 it.each(['barrack','woodlands'] as const)('%s anchor preserves received TARGET while first callback advances adjusted CURRENT and bon',map=>{
  // Real source spawn anchors vary by map; the downward oracle and sphere are
  // deliberately injected fixtures, not a claim about either map's geometry.
  const received=sourcePointToWorld(ORIGINAL_SOURCE_SPAWNS[map][0].position,ORIGINAL_MAP_SCALE),current={...received,y:received.y-1};
  let count=0;const {world,view}=setup((_origin,models)=>{count++;return {hit:{position:{...received,y:received.y-2},handle:models[0].handle,geometryProvenance:'fixture-detailed-hit'},coverage:{complete:true,missing:[],provenance:'fixture'}};});
  sent(view,0,[{...target(),position:received}]);expect(count).toBe(0);expect(world.freezeModels()).toEqual([]);
  expect(accept(view,0)).toEqual({ok:true});expect(count).toBe(1);
  expect(movement(view)).toMatchObject({position:{x:current.x,z:current.z},target:received,yaw:.1+Math.PI,targetYaw:.1+Math.PI,speed:{x:0,y:0,z:0},steps:10});
  expect(movement(view).position.y).toBeCloseTo(current.y,12);
  expect(view.freeze()[0]).toMatchObject({position:{x:current.x,z:current.z},motionTime:0,steps:10,birthCoverage:{complete:true,missing:[],provenance:'fixture'}});
  expect(step(view,1)).toEqual({ok:true});expect(movement(view).position.y).toBeCloseTo(current.y+1/9,12);expect(movement(view).speed.y).toBeCloseTo(1/9,12);
  const raw=(1/9)/ORIGINAL_MAP_SCALE*10;expect(view.freeze()[0].motionTime).toBeCloseTo(raw>1000?raw-1000:raw,10);
  expect(step(view,9)).toEqual({ok:true});expect(movement(view).position.y).toBeCloseTo(received.y,12);const speed={...movement(view).speed};
  expect(step(view,10)).toEqual({ok:true});expect(movement(view).position).toEqual(received);expect(movement(view).speed).toEqual(speed);expect(movement(view).steps).toBe(0);
  const later={...received,y:received.y+4};sent(view,1,[{...target(),position:later}],10);expect(accept(view,1,10)).toEqual({ok:true});expect(count).toBe(1);
  expect(movement(view).target).toEqual(later);expect(movement(view).position).toEqual(received);
 });
 it('preserves no-hit recurrence and queries at the accepted receipt callback prefix, never dispatch',()=>{
  const calls:number[]=[];const {view}=setup((_origin,_models,callback)=>{calls.push(callback);return {hit:null,coverage:{complete:true,missing:[],provenance:'fixture'}};});
  sent(view,0,[target()]);expect(calls).toEqual([]);
  expect(accept(view,0,3)).toEqual({ok:true});expect(calls).toEqual([3]);expect(movement(view).position).toEqual(movement(view).target);
  expect(step(view,4)).toEqual({ok:true});expect(movement(view).speed).toEqual({x:0,y:0,z:0});expect(view.freeze()[0].motionTime).toBe(0);
 });
 it('rolls back the first successful birth, allocator, queue, actors and clocks when the second birth fails',()=>{
  let failSecond=true;let calls=0;const {world,view}=setup((_origin,_models)=>{calls++;if(failSecond&&calls===2)throw Error('synthetic second birth failure');return {hit:null,coverage:{complete:true,missing:[],provenance:'fixture'}};});
  sent(view,0,[target('a'),target('b')]);const before={models:world.freezeModels(),pickups:world.freezePickups(),ledger:world.debugState(),actors:view.freeze(),corpses:view.freezeCorpses(),clock:view.debugState()};
  expect(()=>accept(view,0,2)).toThrow('synthetic second birth failure');
  expect({models:world.freezeModels(),pickups:world.freezePickups(),ledger:world.debugState(),actors:view.freeze(),corpses:view.freezeCorpses(),clock:view.debugState()}).toEqual(before);
  failSecond=false;expect(accept(view,0,2)).toEqual({ok:true});expect(view.freeze().map(a=>a.id)).toEqual(['a','b']);
  expect(world.debugState().actorHandles.map(a=>a.gi)).toEqual(['gi:baddy1','gi:baddy2']);expect(view.debugState()).toMatchObject({callbacks:2,pendingTicks:[],lastAcceptedAt:2000/30});
 });
 it('rejects incomplete geometry without substituting an existing fixed floor, preserving the pending receipt',()=>{
  const {world,view}=setup(()=>({hit:null,coverage:{complete:false,missing:['live-gi','held-gun'],provenance:'world-only'}}));
  const floor:ReceiverModelEntry={handle:'floor',name:'floor',resource:'floor',kind:'fixed',group:'scene',inWorld:true,pose:{position:{x:0,y:0,z:0},yaw:0,phase:0,scale:1},geometryProvenance:'fixture-floor'};
  world.setExternalModels([floor]);sent(view,0,[target()]);const clock=view.debugState();
  expect(()=>accept(view,0)).toThrow('Incomplete receiver scene query');expect(view.freeze()).toEqual([]);expect(view.debugState()).toEqual(clock);expect(world.freezeModels()).toEqual([floor]);
 });
 it('rolls back a fade retirement and FIFO reuse while preserving existing corpse and pickup aliases',()=>{
  let failAt=Infinity,calls=0;const {world,view}=setup(()=>{if(++calls===failAt)throw Error('second reused-prefix birth failure');return {hit:null,coverage:{complete:true,missing:[],provenance:'fixture'}};});
  sent(view,0,[target('old')]);expect(accept(view,0)).toEqual({ok:true});sent(view,1,[{...target('old'),alive:false}]);expect(accept(view,1)).toEqual({ok:true});
  expect(step(view,1).ok).toBe(true);expect(step(view,76)).toEqual({ok:true});expect(world.debugState().fades[0].bon).toBe(600);
  sent(view,2,[target('first-new'),target('second-new')],76);
  const before={models:world.freezeModels(),pickups:world.freezePickups(),ledger:world.debugState(),actors:view.freeze(),corpses:view.freezeCorpses(),clock:view.debugState()};failAt=calls+2;
  expect(()=>accept(view,2,77)).toThrow('second reused-prefix birth failure');
  expect({models:world.freezeModels(),pickups:world.freezePickups(),ledger:world.debugState(),actors:view.freeze(),corpses:view.freezeCorpses(),clock:view.debugState()}).toEqual(before);
  failAt=Infinity;expect(accept(view,2,77)).toEqual({ok:true});expect(world.debugState().actorHandles.map(a=>a.gi)).toEqual(['gi:baddy1','gi:baddy2']);
  expect(world.freezePickups()).toEqual(before.pickups);expect(view.freezeCorpses()).toEqual([]);
 });
 it('rejects a live reset requiring resynchronization without discarding the existing life',()=>{
  const {world,view}=setup(()=>({hit:null,coverage:{complete:true,missing:[],provenance:'fixture'}}));sent(view,0,[target()]);expect(accept(view,0)).toEqual({ok:true});
  sent(view,1,[{...target('a',20),reset:true}]);const actors=view.freeze(),models=world.freezeModels(),clock=view.debugState();
  expect(()=>accept(view,1)).toThrow('reset requires scene resynchronization');expect(view.freeze()).toEqual(actors);expect(world.freezeModels()).toEqual(models);expect(view.debugState()).toEqual(clock);
 });
 it('requires an explicit partial-coverage opt-in and exposes the unresolved birth coverage on the admitted pose',()=>{
  const missing=['held-gun'];const {view}=setup(()=>({hit:null,coverage:{complete:false,missing,provenance:'explicit-partial-fixture'}}),1,false);
  sent(view,0,[target()]);expect(accept(view,0)).toEqual({ok:true});missing.push('later-mutation');
  expect(view.freeze()[0].birthCoverage).toEqual({complete:false,missing:['held-gun'],provenance:'explicit-partial-fixture'});
  expect(Object.isFrozen(view.freeze()[0].birthCoverage!.missing)).toBe(true);
 });
});
