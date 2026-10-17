import {describe,expect,it} from 'vitest';
import {OriginalRemoteView,type OriginalRemoteViewTarget} from './originalRemoteView';
import type {OriginalRemoteShots} from './originalRemoteShots';
import {advanceOriginalRemoteSoldierPhase} from './originalRemoteSoldierPhase';

const actor=(sourceShots?:number,weapon:OriginalRemoteViewTarget['weapon']='rifle',id='source',x=0):OriginalRemoteViewTarget=>({id,position:{x,y:0,z:0},yaw:0,motionTime:440,alive:true,...(weapon===undefined?{}:{weapon}),...(sourceShots===undefined?{}:{sourceShots})});
const scalars=(view:OriginalRemoteView,id='source')=>{
 const a=(view as unknown as {actors:Map<string,OriginalRemoteShots>}).actors.get(id)!;
 return {misses:a.misses,aiming:a.aiming};
};
const receive=(view:OriginalRemoteView,tick:number,callbacks:number,targets:OriginalRemoteViewTarget[])=>{
 const now=callbacks*1000/30;expect(view.recordSent({tick,sentAt:now,targets})).toEqual({ok:true});
 expect(view.accept({callbacks,receipts:[{tick,callbacks}]},now)).toMatchObject({ok:true});
};
const step=(view:OriginalRemoteView,callbacks:number)=>expect(view.accept({callbacks,receipts:[]},callbacks*1000/30)).toMatchObject({ok:true});

describe('trusted positive where reports in the source callback mirror',()=>{
 it('queues a birth report without receipt-time phase mutation, then consumes its callback prefix',()=>{
  const view=new OriginalRemoteView(0,{},'source-callback');receive(view,0,0,[actor(2)]);
  expect(view.freeze()[0].motionTime).toBe(0);expect(scalars(view)).toEqual({misses:2,aiming:0});
  step(view,0);expect(scalars(view)).toEqual({misses:2,aiming:0});
  step(view,1);expect(view.freeze()[0].motionTime).toBe(1000);expect(scalars(view)).toEqual({misses:1,aiming:2});
  step(view,2);expect(scalars(view)).toEqual({misses:1,aiming:1});
  step(view,3);expect(scalars(view)).toEqual({misses:1,aiming:0});
  step(view,4);expect(scalars(view)).toEqual({misses:0,aiming:2});
 });
 it('replaces positive reports rather than adding and leaves absent/zero reports inert',()=>{
  const view=new OriginalRemoteView(0,{},'source-callback');receive(view,0,0,[actor(5)]);step(view,1);
  receive(view,1,1,[actor(2)]);expect(scalars(view)).toEqual({misses:2,aiming:2});
  receive(view,2,1,[actor()]);receive(view,3,1,[actor(0)]);expect(scalars(view)).toEqual({misses:2,aiming:2});
 });
 it('uses the current publication weapon and preserves the odd shotgun remainder',()=>{
  const view=new OriginalRemoteView(0,{},'source-callback');receive(view,0,0,[actor(3)]);step(view,1);
  receive(view,1,1,[actor(1,'shotgun')]);expect(scalars(view)).toEqual({misses:1,aiming:2});
  step(view,3);expect(scalars(view)).toEqual({misses:1,aiming:0});
  step(view,4);expect(scalars(view)).toEqual({misses:-1,aiming:15});
  receive(view,2,4,[actor(0,'pistol')]);expect(scalars(view)).toEqual({misses:-1,aiming:15});
 });
 it('sets bon before movement and its single source phase subtraction',()=>{
  const view=new OriginalRemoteView(0,{},'source-callback');receive(view,0,0,[actor()]);receive(view,1,0,[actor(1,'rifle','source',.09)]);
  step(view,1);expect(view.freeze()[0]).toMatchObject({position:{x:.01}});
  expect(view.freeze()[0].motionTime).toBeCloseTo(advanceOriginalRemoteSoldierPhase(2000,{x:.01,y:0,z:0}),10);
 });
 it.each(['launcher','rpg'] as const)('%s keeps common bon consumption even without bullet muzzle semantics',weapon=>{
  const view=new OriginalRemoteView(0,{},'source-callback');receive(view,0,0,[actor(2,weapon)]);step(view,1);
  expect(scalars(view)).toEqual({misses:1,aiming:0});expect(view.freeze()[0].motionTime).toBe(1000);
  step(view,2);expect(scalars(view)).toEqual({misses:0,aiming:0});
 });
 it('defaults a source actor without transported weapon metadata to rifle consumption',()=>{
  const view=new OriginalRemoteView(0,{},'source-callback');const target=actor(1);delete target.weapon;receive(view,0,0,[target]);step(view,1);
  expect(scalars(view)).toEqual({misses:0,aiming:2});
 });
 it('ignores immediate fire receipts only in source-callback mode',()=>{
  for(const mode of ['source-callback','transported'] as const){
   const view=new OriginalRemoteView(0,{},mode);receive(view,0,0,[actor(2)]);
   expect(view.recordSent({tick:1,sentAt:0,targets:[],firePlayerId:'source'})).toEqual({ok:true});
   expect(view.accept({callbacks:0,receipts:[{tick:1,callbacks:0}]},0)).toEqual({ok:true});
   expect(view.freeze()[0].motionTime).toBe(mode==='source-callback'?0:2000);
   expect(scalars(view)).toEqual({misses:mode==='source-callback'?2:0,aiming:0});
  }
 });
 it('validates every report before committing sent-order metadata or actor state',()=>{
  const view=new OriginalRemoteView(0,{},'source-callback');receive(view,0,0,[actor(2)]);
  const poses=view.freeze(),clock=view.debugState();
  for(const bad of [-1,.5,129,Infinity,NaN]){
   expect(view.recordSent({tick:1,sentAt:0,targets:[actor(1,'rifle','valid'),actor(bad)]})).toEqual({ok:false,reason:'invalid_sent_target'});
   expect(view.freeze()).toEqual(poses);expect(view.debugState()).toEqual(clock);expect(scalars(view)).toEqual({misses:2,aiming:0});
  }
  receive(view,1,0,[actor(128)]);expect(scalars(view)).toEqual({misses:128,aiming:0});
 });
 it('copies the trusted report rather than following later caller mutations',()=>{
  const view=new OriginalRemoteView(0,{},'source-callback'),target=actor(2);
  expect(view.recordSent({tick:0,sentAt:0,targets:[target]})).toEqual({ok:true});target.sourceShots=128;
  expect(view.accept({callbacks:0,receipts:[{tick:0,callbacks:0}]},0)).toEqual({ok:true});expect(scalars(view)).toEqual({misses:2,aiming:0});
 });
 it('keeps batched and sequential scalar consumption identical',()=>{
  const batch=new OriginalRemoteView(0,{},'source-callback'),single=new OriginalRemoteView(0,{},'source-callback');
  for(const view of [batch,single]){receive(view,0,0,[actor(8,'pistol')]);receive(view,1,0,[actor(undefined,'pistol','source',.09)]);}
  step(batch,20);for(let callback=1;callback<=20;callback++)step(single,callback);
  expect(batch.freeze()).toEqual(single.freeze());expect(scalars(batch)).toEqual(scalars(single));expect(batch.debugState()).toEqual(single.debugState());
 });
 it('does not let dead packets replace queued scalars and clears them on fresh birth',()=>{
  const view=new OriginalRemoteView(0,{},'source-callback');receive(view,0,0,[actor(2)]);
  receive(view,1,0,[{...actor(128,'shotgun'),alive:false}]);expect(scalars(view)).toEqual({misses:2,aiming:0});
  const result=view.accept({callbacks:1,receipts:[]},1000/30);expect(result.ok).toBe(true);expect(view.freeze()).toEqual([]);
  expect(view.freezeCorpses()[0]).toMatchObject({motionTime:3000,deathBon:0});
  receive(view,2,1,[actor()]);expect(scalars(view)).toEqual({misses:0,aiming:0});
 });
 it('rolls back both shot scalars when a later actor overflows source phase',()=>{
  const view=new OriginalRemoteView(0,{},'source-callback');receive(view,0,0,[actor(2,'rifle','first'),actor(undefined,'rifle','overflow')]);
  receive(view,1,0,[actor(undefined,'rifle','overflow',Number.MAX_VALUE/2)]);
  expect(view.recordSent({tick:2,sentAt:0,targets:[]})).toEqual({ok:true});
  const poses=view.freeze(),clock=view.debugState(),before=scalars(view,'first');
  expect(view.accept({callbacks:1,receipts:[{tick:2,callbacks:1}]},1000/30)).toEqual({ok:false,reason:'source_phase_overflow'});
  expect(view.freeze()).toEqual(poses);expect(view.debugState()).toEqual(clock);expect(scalars(view,'first')).toEqual(before);
 });
});
