import {describe,expect,it} from 'vitest';
import {OriginalReceiverModelWorld,type ReceiverModelBackend,type ReceiverModelEntry,type ReceiverModelPose} from './originalReceiverModelWorld';

const pose=(y=20,phase=77):ReceiverModelPose=>({position:{x:0,y,z:0},yaw:.4,phase,scale:1});
const backend=(query:ReceiverModelBackend['nearestDetailedDownward']=()=>({hit:null,coverage:{complete:true,missing:[],provenance:'test-complete-model-oracle'}})):ReceiverModelBackend=>({
 cloneGI:()=>({pose:pose(),geometryProvenance:'fixture-clone'}),sphere:()=>({bspWorld:2,provenance:'declared-resource'}),
 nearestDetailedDownward:query,heldGunPose:gi=>({...gi.pose,position:{...gi.pose.position,x:gi.pose.position.x+3}}),
 cloneGun:()=>({pose:pose(30,0),geometryProvenance:'fixture-gun'}),reparentGunMembership:inWorld=>inWorld,dropYaw:()=>.7,
});
const world=(b=backend(),extra={})=>new OriginalReceiverModelWorld(b,{eyeHeight:1,sourceScale:.02,goodyBspWorld:2,sceneGeneration:4,maxModels:32,maxPickups:16,requireCompleteCoverage:true,...extra});
const birth=(actorId:string,y=10)=>({actorId,targetFeet:{x:0,y,z:0},targetYaw:.2,callback:0});
const actorPose=(y=10)=>({position:{x:0,y,z:0},yaw:.2,motionTime:123,weapon:'rpg' as const});
const model=(handle:string,kind:ReceiverModelEntry['kind']='fixed'):ReceiverModelEntry=>({handle,name:handle,resource:handle,group:'scene',kind,inWorld:true,pose:pose(),geometryProvenance:'fixture'});

describe('receiver model identity foundation (injected geometry, no Game/Room wiring)',()=>{
 it('journals exact fade constructor logical eye independently of lower drop and later corpse movement',()=>{
  const w=new OriginalReceiverModelWorld(backend(),{eyeHeight:1,sourceScale:.02,goodyBspWorld:2,sceneGeneration:4,maxModels:32,maxPickups:16,requireCompleteCoverage:true,lifecycleJournal:{maxEntries:8,maxTextChars:65536}},
   {snapshotAt:prefix=>({prefix,models:[],missing:[],provenance:'fixture-external-prefix'})}),tx=w.begin();tx.applyExternalReceipt(0,0);
  const input={...actorPose(),position:{x:3,y:10,z:7}};tx.birth({...birth('fade'),targetFeet:input.position});tx.beforeCallback('fade',input);tx.afterCallback('fade',input);tx.detach('fade',input,0);
  const detach=tx.freezeModelTransitions!().find(event=>event.kind==='detach')!;if(detach.kind!=='detach')throw Error('fixture kind');
  expect(detach.fadePositionWorld).toEqual({x:3,y:11,z:7});expect(detach.pickup.position).toEqual({x:3,y:10,z:7});expect(Object.isFrozen(detach.fadePositionWorld)).toBe(true);
  input.position.y=200;tx.advanceCorpses();expect(detach.fadePositionWorld).toEqual({x:3,y:11,z:7});expect(tx.freezeModels().find(model=>model.handle===detach.giHandle)!.pose.position.y).not.toBe(11);tx.commit();
 });
 it('queries the retained newborn GI before constructor translation or gun acquisition',()=>{
  const observed:{origin:unknown;models:readonly Readonly<ReceiverModelEntry>[];callback:number}[]=[];
  const w=world(backend((origin,models,callback)=>{observed.push({origin,models,callback});return {hit:{position:{x:0,y:8,z:0},handle:models[0].handle,geometryProvenance:'fixture-retained-gi'},coverage:{complete:true,missing:[],provenance:'fixture'}};}));
  const tx=w.begin(),result=tx.birth(birth('a'));tx.commit();
  expect(observed).toHaveLength(1);expect(observed[0].origin).toEqual({x:0,y:11,z:0});expect(observed[0].callback).toBe(0);
  expect(observed[0].models).toHaveLength(1);expect(observed[0].models[0]).toMatchObject({kind:'gi',inWorld:true,pose:{position:{x:0,y:20,z:0},phase:77,yaw:.4,scale:.045}});
  expect(result).toMatchObject({currentFeet:{x:0,y:9,z:0},targetFeet:{x:0,y:10,z:0},bspWorld:2,sphereProvenance:'declared-resource'});
  expect(w.freezeActorRegistry().actors[0].sourcePositionWorld).toEqual({x:0,y:10,z:0});
  expect(w.freezeModels().find(m=>m.kind==='gi')!.pose).toEqual({position:{x:.08,y:11.5,z:0},phase:77,yaw:.4,scale:.045});
  expect(w.freezeModels().find(m=>m.kind==='gun')).toMatchObject({resource:'rpg',group:'gsmokes'});
 });
 it('retains logical source position independently of constructor and displayed GI offsets',()=>{
  const w=world(),tx=w.begin(),request={...birth('a'),targetFeet:{x:3,y:10,z:7}};tx.birth(request);const born=tx.freezeActorRegistry();
  expect(born.actors[0].sourcePositionWorld).toEqual({x:3,y:11,z:7});expect(born.models.find(m=>m.kind==='gi')!.pose.position).toEqual({x:3.08,y:12.5,z:7});
  const input={...actorPose(12),position:{x:5,y:12,z:9}};tx.beforeCallback('a',input);
  expect(tx.freezeActorRegistry().actors[0].sourcePositionWorld).toEqual({x:5,y:13,z:9});
  // Gun placement still uses the prior GI, not this logical hurt operand.
  expect(tx.freezeModels().find(m=>m.kind==='gi')!.pose.position).toEqual(born.models.find(m=>m.kind==='gi')!.pose.position);
  input.position.x=100;expect(tx.freezeActorRegistry().actors[0].sourcePositionWorld.x).toBe(5);
  tx.afterCallback('a',{...input,position:{x:6,y:14,z:10}});tx.commit();
  expect(w.freezeActorRegistry().actors[0].sourcePositionWorld).toEqual({x:6,y:15,z:10});
  expect(w.freezeModels().find(m=>m.kind==='gi')!.pose.position).toEqual({x:6,y:13.8,z:10});
  expect(born.actors[0].sourcePositionWorld).toEqual({x:3,y:11,z:7});
 });
 it('rolls back staged logical position while preserving detached prior audits and retry operands',()=>{
  const w=world();let tx=w.begin();tx.birth(birth('a'));tx.commit();const before=w.freezeActorRegistry();
  tx=w.begin();tx.beforeCallback('a',actorPose(20));tx.afterCallback('a',actorPose(21));const staged=tx.freezeActorRegistry();tx.rollback();
  expect(w.freezeActorRegistry()).toEqual(before);expect(staged.actors[0].sourcePositionWorld).toEqual({x:0,y:22,z:0});
  tx=w.begin();tx.beforeCallback('a',actorPose(20));tx.afterCallback('a',actorPose(21));tx.commit();expect(w.freezeActorRegistry().actors).toEqual(staged.actors);
  expect(before.actors[0].sourcePositionWorld).toEqual({x:0,y:11,z:0});
 });
 it.each(['before','after'] as const)('rejects a nonfinite explicit logical position during %s callback',phase=>{
  const w=world();let tx=w.begin();tx.birth(birth('a'));tx.commit();const before=w.freezeActorRegistry();tx=w.begin();
  expect(()=>phase==='before'?tx.beforeCallback('a',actorPose(Infinity)):tx.afterCallback('a',actorPose(Infinity))).toThrow('logical actor position');tx.rollback();expect(w.freezeActorRegistry()).toEqual(before);
 });
 it('uses the previous GI bone pose before updating living position and phase',()=>{
  const seen:ReceiverModelPose[]=[];const b=backend();b.heldGunPose=gi=>{seen.push({...gi.pose,position:{...gi.pose.position}});return {...gi.pose,position:{x:7,y:8,z:9}};};
  const w=world(b),tx=w.begin(),born=tx.birth(birth('a'));tx.beforeCallback('a',actorPose(12));tx.afterCallback('a',actorPose(12));tx.commit();
  expect(seen[0]).toMatchObject({position:{x:.08,y:12.5,z:0},phase:77,yaw:.4});
  expect(w.freezeModels().find(m=>m.handle===born.gunHandle)!.pose.position).toEqual({x:7,y:8,z:9});
  expect(w.freezeModels().find(m=>m.handle===born.giHandle)!.pose).toMatchObject({position:{x:0,y:11.8,z:0},phase:123,yaw:.2});
 });
 it('excludes only the dying GI from fade birth and includes its freshly dropped gun and other corpse',()=>{
  const queries:(readonly Readonly<ReceiverModelEntry>[])[]=[];const w=world(backend((_origin,models)=>{queries.push(models);return {hit:null,coverage:{complete:true,missing:[],provenance:'fixture'}};}));
  const tx=w.begin(),a=tx.birth(birth('a')),b=tx.birth(birth('b'));
  tx.detach('a',actorPose(),1);tx.detach('b',actorPose(12),1);tx.commit();
  const deathA=queries[2],deathB=queries[3];
  expect(deathA.find(m=>m.handle===a.giHandle)!.inWorld).toBe(false);expect(deathA.find(m=>m.handle===b.giHandle)!.inWorld).toBe(true);
  expect(deathA.find(m=>m.handle===a.gunHandle)!.pose.position).toEqual({x:0,y:10,z:0});
  expect(deathB.find(m=>m.handle===a.giHandle)!.inWorld).toBe(true);expect(deathB.find(m=>m.handle===b.giHandle)!.inWorld).toBe(false);
 });
 it('retires at fade callback 76, reuses GI FIFO with retained pose, and preserves old pickup gun alias',()=>{
  const queries:(readonly Readonly<ReceiverModelEntry>[])[]=[];const w=world(backend((_origin,models)=>{queries.push(models);return {hit:null,coverage:{complete:true,missing:[],provenance:'fixture'}};}));
  let tx=w.begin();const a=tx.birth(birth('a')),b=tx.birth(birth('b'));tx.detach('a',actorPose(),0);tx.detach('b',actorPose(12),0);tx.commit();
  const old=w.freezePickups()[0];expect(old.position).toEqual({x:0,y:10,z:0});
  tx=w.begin();for(let i=0;i<75;i++)tx.advanceCorpses();tx.commit();expect(w.debugState().fifo).toEqual([]);expect(w.debugState().fades.map(f=>f.bon)).toEqual([600,600]);
  tx=w.begin();tx.advanceCorpses();tx.commit();expect(w.debugState().fifo).toEqual([a.giHandle,b.giHandle]);
  const retained=w.freezeModels().find(m=>m.handle===a.giHandle)!.pose;
  tx=w.begin();const c=tx.birth(birth('c',40));tx.commit();expect(c.giHandle).toBe(a.giHandle);expect(c.gunHandle).toBe(old.handle);
  const queried=queries.at(-1)!.find(m=>m.handle===a.giHandle)!;expect(queried.inWorld).toBe(true);expect(queried.pose).toEqual(retained);
  expect(w.freezePickups()[0]).toEqual(old);expect(w.freezeModels().find(m=>m.handle===c.gunHandle)!.inWorld).toBe(true);
  tx=w.begin();expect(tx.collectPickup(old.id)).toBe(true);tx.commit();
  expect(w.freezeModels().find(m=>m.handle===c.gunHandle)!.inWorld).toBe(false);expect(w.debugState().actorHandles.find(a=>a.actorId==='c')!.gun).toBe(old.handle);
  expect(w.freezePickups().some(p=>p.id===old.id)).toBe(false);
 });
 it('records a fade query target without snapping the corpse to it',()=>{
  let query=0;const w=world(backend((_origin,models)=>({hit:++query===1?null:{position:{x:0,y:-50,z:0},handle:models.find(m=>m.kind==='gun')!.handle,geometryProvenance:'fixture'},coverage:{complete:true,missing:[],provenance:'fixture'}})));
  let tx=w.begin();const a=tx.birth(birth('a'));tx.detach('a',actorPose(),0);tx.commit();expect(w.debugState().fades[0].target).toEqual({x:0,y:-48,z:0});
  tx=w.begin();tx.advanceCorpses();tx.commit();expect(w.freezeModels().find(m=>m.handle===a.giHandle)!.pose.position.y).toBeCloseTo(11-2/300*8,12);
 });
 it('uses the phase-3000 sphere for fade sinking while preserving the birth sphere in the drop point',()=>{
  const phases:number[]=[];const b=backend();b.sphere=gi=>{phases.push(gi.pose.phase);return {bspWorld:gi.pose.phase===3000?4:2,provenance:'declared-resource'};};
  const w=world(b);let tx=w.begin();const a=tx.birth(birth('a'));tx.detach('a',actorPose(),0);tx.commit();
  expect(phases).toEqual([77,3000]);expect(w.freezePickups()[0].position.y).toBe(10);
  tx=w.begin();tx.advanceCorpses();tx.commit();expect(w.freezeModels().find(m=>m.handle===a.giHandle)!.pose.position.y).toBeCloseTo(11-4/300*8,12);
 });
 it('uses stable source resource names for weapon replacement and keeps old gun identities',()=>{
  const b=backend();b.reparentGunMembership=()=>true;const w=world(b),tx=w.begin(),a=tx.birth(birth('a'));
  tx.beforeCallback('a',{...actorPose(),weapon:'rifle'});tx.commit();
  expect(w.freezeModels().find(m=>m.handle===a.gunHandle)!.inWorld).toBe(false);
  expect(w.debugState().actorHandles[0].gun).toBe('gun:ak47:baddy1');expect(w.freezeModels().find(m=>m.resource==='ak47')).toMatchObject({name:'ak47baddy1',group:'gsmokes',inWorld:true});
 });
 it.each([false,true])('exposes the explicit reparent revival policy (%s), without silently restoring membership',revive=>{
  const b=backend();b.reparentGunMembership=inWorld=>revive||inWorld;const w=world(b),tx=w.begin(),a=tx.birth(birth('a'));
  tx.beforeCallback('a',actorPose());tx.commit();expect(w.freezeModels().find(m=>m.handle===a.gunHandle)!.inWorld).toBe(revive);
 });
 it('preserves detached nonplanar rotations and freezes query input quaternion state',()=>{
  const rotation={x:Math.SQRT1_2,y:0,z:0,w:Math.SQRT1_2};const b=backend();b.cloneGI=()=>({pose:{...pose(),rotation},geometryProvenance:'fixture-nonplanar'});
  const observed:ReceiverModelEntry[]=[];b.nearestDetailedDownward=(_origin,models)=>{observed.push(models[0]);expect(Object.isFrozen(models[0].pose.rotation)).toBe(true);return {hit:null,coverage:{complete:true,missing:[],provenance:'fixture'}};};
  const w=world(b),tx=w.begin();const a=tx.birth(birth('a'));tx.commit();rotation.x=0;
  expect(observed[0].pose.rotation).toEqual({x:Math.SQRT1_2,y:0,z:0,w:Math.SQRT1_2});expect(w.freezeModels().find(m=>m.handle===a.giHandle)!.pose.rotation).toEqual(observed[0].pose.rotation);
 });
 it('rejects incomplete coverage and model budget exhaustion without evicting admitted handles',()=>{
  const w=world(backend(()=>({hit:null,coverage:{complete:false,missing:['held-gun'],provenance:'world-only'}})));const before=w.freezeModels(),tx=w.begin();
  expect(()=>tx.birth(birth('a'))).toThrow('Incomplete receiver scene query');tx.rollback();expect(w.freezeModels()).toEqual(before);
  const capped=world(backend(),{maxModels:2});capped.setExternalModels([model('floor')]);const cappedBefore=capped.freezeModels(),t=capped.begin();
  expect(()=>t.birth(birth('a'))).toThrow('budget requires resynchronization');t.rollback();expect(capped.freezeModels()).toEqual(cappedBefore);
 });
});
