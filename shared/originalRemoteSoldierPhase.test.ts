import {describe,expect,it} from 'vitest';
import {OriginalRemoteView,type OriginalRemoteViewTarget} from './originalRemoteView';
import {advanceOriginalRemoteSoldierPhase} from './originalRemoteSoldierPhase';
import {ORIGINAL_MAP_SCALE} from './originalMapProfile';

const actor=(x=0,id='source',motionTime=440):OriginalRemoteViewTarget=>({id,position:{x,y:0,z:0},yaw:0,motionTime,alive:true});
const receive=(view:OriginalRemoteView,tick:number,callbacks:number,targets:OriginalRemoteViewTarget[])=>{
 const now=callbacks*1000/30;
 expect(view.recordSent({tick,sentAt:now,targets})).toEqual({ok:true});
 expect(view.accept({callbacks,receipts:[{tick,callbacks}]},now)).toEqual({ok:true});
};
const step=(view:OriginalRemoteView,callbacks:number)=>expect(view.accept({callbacks,receipts:[]},callbacks*1000/30)).toMatchObject({ok:true});
describe('recovered baddie callback skeletal phase',()=>{
 it('retains the exact strict single subtraction, including stationary firing and large advances',()=>{
  expect(advanceOriginalRemoteSoldierPhase(1000,{x:0,y:0,z:0})).toBe(1000);
  expect(advanceOriginalRemoteSoldierPhase(2000,{x:0,y:0,z:0})).toBe(1000);
  expect(advanceOriginalRemoteSoldierPhase(0,{x:512*ORIGINAL_MAP_SCALE,y:0,z:0})).toBe(4120);
  expect(advanceOriginalRemoteSoldierPhase(0,{x:3*ORIGINAL_MAP_SCALE,y:4*ORIGINAL_MAP_SCALE,z:0})).toBeCloseTo(50,12);
 });
 it('starts at zero and preserves callback phase across newstuff, snap and negative catch-up steps',()=>{
  const view=new OriginalRemoteView(0,{},'source-callback');receive(view,0,0,[actor()]);expect(view.freeze()[0].motionTime).toBe(0);
  receive(view,1,0,[actor(.09,'source',999)]);expect(view.freeze()[0].motionTime).toBe(0);
  let expected=0;
  for(let callback=1;callback<=15;callback++){
   step(view,callback);expected=advanceOriginalRemoteSoldierPhase(expected,{x:.01,y:0,z:0});
   expect(view.freeze()[0].motionTime).toBeCloseTo(expected,10);
  }
  expect(view.freeze()[0]).toMatchObject({steps:-5,position:{x:.09}});
  const phase=view.freeze()[0].motionTime;receive(view,2,15,[actor(.23,'source',2000)]);
  expect(view.freeze()[0]).toMatchObject({steps:15,motionTime:phase});step(view,16);
  expect(view.freeze()[0].motionTime).toBeCloseTo(advanceOriginalRemoteSoldierPhase(phase,{x:.01,y:0,z:0}),10);
 });
 it('keeps zero callbacks inert and batched callbacks identical to sequential callbacks',()=>{
  const batch=new OriginalRemoteView(0,{},'source-callback'),single=new OriginalRemoteView(0,{},'source-callback');
  for(const view of [batch,single]){receive(view,0,0,[actor()]);receive(view,1,0,[actor(.81)]);}
  const before=batch.freeze();step(batch,0);expect(batch.freeze()).toEqual(before);
  step(batch,30);for(let callback=1;callback<=30;callback++)step(single,callback);
  expect(batch.freeze()).toEqual(single.freeze());expect(batch.debugState()).toEqual(single.debugState());
 });
 it('orders firing, empty projectile receipt, pending death and fresh actor birth',()=>{
  const view=new OriginalRemoteView(0,{},'source-callback');receive(view,0,0,[actor()]);
  expect(view.recordSent({tick:1,sentAt:0,targets:[],firePlayerId:'source'})).toEqual({ok:true});
  expect(view.accept({callbacks:0,receipts:[{tick:1,callbacks:0}]},0)).toEqual({ok:true});expect(view.freeze()[0].motionTime).toBe(0);
  receive(view,2,0,[{...actor(),sourceShots:1}]);expect(view.freeze()[0].motionTime).toBe(0);step(view,1);expect(view.freeze()[0].motionTime).toBe(1000);
  expect(view.recordSent({tick:3,sentAt:1000/30,targets:[],deathPlayerId:'source'})).toEqual({ok:true});
  expect(view.accept({callbacks:1,receipts:[{tick:3,callbacks:1}]},1000/30)).toEqual({ok:true});expect(view.freeze()[0].motionTime).toBe(1000);
  expect(view.accept({callbacks:2,receipts:[]},2000/30).ok).toBe(true);expect(view.freeze()).toEqual([]);expect(view.freezeCorpses()[0]).toMatchObject({motionTime:3000,deathBon:0});
  step(view,3);expect(view.freezeCorpses()[0]).toMatchObject({motionTime:2408,deathBon:8});receive(view,4,3,[actor(5,'source',900)]);
  expect(view.freeze()[0]).toMatchObject({motionTime:0,steps:10,position:{x:5}});expect(view.freezeCorpses()).toHaveLength(1);
 });
 it('preserves the standalone transported phase adapter',()=>{
  const view=new OriginalRemoteView(0);receive(view,0,0,[actor()]);expect(view.freeze()[0].motionTime).toBe(440);
  receive(view,1,0,[actor(.09,'source',999)]);step(view,10);expect(view.freeze()[0].motionTime).toBe(999);
 });
 it('rejects phase overflow without committing earlier actors, corpses, receipts or clocks',()=>{
  const view=new OriginalRemoteView(0,{},'source-callback');receive(view,0,0,[actor(0,'first'),actor(0,'overflow'),actor(0,'old-corpse')]);
  expect(view.recordSent({tick:1,sentAt:0,targets:[],deathPlayerId:'old-corpse'})).toEqual({ok:true});
  expect(view.accept({callbacks:1,receipts:[{tick:1,callbacks:0}]},1000/30).ok).toBe(true);
  expect(view.freezeCorpses()[0]).toMatchObject({sequence:1,deathBon:0,motionTime:3000});
  receive(view,2,1,[actor(.09,'first'),actor(Number.MAX_VALUE/2,'overflow')]);
  expect(view.recordSent({tick:3,sentAt:1000/30,targets:[],deathPlayerId:'first'})).toEqual({ok:true});
  expect(view.accept({callbacks:1,receipts:[{tick:3,callbacks:1}]},1000/30)).toEqual({ok:true});
  expect(view.recordSent({tick:4,sentAt:1000/30,targets:[]})).toEqual({ok:true});
  const poses=view.freeze(),corpses=view.freezeCorpses(),clock=view.debugState();
  const result=view.accept({callbacks:2,receipts:[{tick:4,callbacks:2}]},2000/30);
  expect(result).toEqual({ok:false,reason:'source_phase_overflow'});expect(view.freeze()).toEqual(poses);expect(view.freezeCorpses()).toEqual(corpses);expect(view.debugState()).toEqual(clock);
  // A changed reset input recovers without replaying the failed overflow. The
  // next death must use sequence2, not a sequence consumed by the failed trial.
  expect(view.recordSent({tick:5,sentAt:1000/30,targets:[{...actor(0,'overflow'),reset:true}]})).toEqual({ok:true});
  expect(view.accept({callbacks:1,receipts:[{tick:4,callbacks:1},{tick:5,callbacks:1}]},1000/30)).toEqual({ok:true});
  expect(view.accept({callbacks:2,receipts:[]},2000/30).ok).toBe(true);
  expect(view.freezeCorpses()).toMatchObject([{ownerId:'old-corpse',sequence:1,deathBon:8},{ownerId:'first',sequence:2,deathBon:0}]);
 });
});
