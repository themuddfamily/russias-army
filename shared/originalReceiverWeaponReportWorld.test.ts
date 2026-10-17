import {describe,it,expect} from 'vitest';
import {OriginalReceiverWeaponReportWorld,copyReceiverWeaponReportPayload,type ReceiverWeaponReportCheckpoint,type ReceiverWeaponReportOptions} from './originalReceiverWeaponReportWorld';
import type {ReceiverLocalHitscanOutcome} from './originalReceiverLocalHitscan';
import type {ReceiverScenePrefix} from './originalReceiverPrefix';

const p=(callback=1):Extract<ReceiverScenePrefix,{kind:'callback'}>=>({kind:'callback',sceneGeneration:7,callback});
const options:ReceiverWeaponReportOptions={maxNames:8,maxTextChars:512,maxCommands:32};
const seed=(shots=0,hurts:ReceiverWeaponReportCheckpoint['hurts']=[]):ReceiverWeaponReportCheckpoint=>({prefix:p(0),shots,hurts});
function outcome(weapon:'rifle'|'shotgun'='rifle',name?:string,hit=true):ReceiverLocalHitscanOutcome {
 return {prefix:p(),weapon,positiveShot:hit?1:0,hit:hit?{handle:'g',geometryProvenance:'q',layer:name===undefined?'fixed':'live-gi',faceIndex:0,distance:5,point:{x:0,y:0,z:-5},normal:{x:0,y:0,z:1}}:null,...(name!==undefined?{hurt:{sourcePositionWorld:{x:0,y:1,z:0},actorId:'actor',name,amount:weapon==='shotgun'?18:6}}:{})};
}

describe('receiver-private source weapon report bank (exact string key adapter)',()=>{
 it('counts each positive SPAS/world ray and merges GI hurts, while complete no-hit contributes nothing',()=>{
  const bank=new OriginalReceiverWeaponReportWorld(seed(),options),tx=bank.begin();tx.admitPrefix(p());
  // Independent recovered literal expectations: one SPAS bullettest is18;
  // it is called twice. Positive world hits count, no-hit rays do not.
  tx.record(outcome('shotgun','Bravo'));tx.record(outcome('shotgun','Bravo'));tx.record(outcome());tx.record(outcome('rifle',undefined,false));
  expect(tx.freeze()).toMatchObject({shots:3,hurts:[{name:'Bravo',amount:36}]});expect(bank.freeze()).toEqual(seed());
  const payload=tx.send();expect(payload).toEqual({shots:3,hurts:[{name:'Bravo',amount:36}]});expect(tx.freeze()).toEqual({prefix:p(),shots:0,hurts:[]});
  expect(Object.isFrozen(payload)).toBe(true);expect(Object.isFrozen(payload.hurts)).toBe(true);expect(Object.isFrozen(payload.hurts![0])).toBe(true);
  tx.prepareCommit()();expect(bank.freeze()).toEqual({prefix:p(),shots:0,hurts:[]});bank.release();
 });
 it('retains first-name insertion order and literal case/empty keys, without claiming native symbol equality',()=>{
  const bank=new OriginalReceiverWeaponReportWorld(seed(),options),tx=bank.begin();tx.admitPrefix(p());
  for(const name of ['Beta','Alpha','Beta','alpha',''])tx.record(outcome('rifle',name));
  expect(tx.send()).toEqual({shots:5,hurts:[{name:'Beta',amount:12},{name:'Alpha',amount:6},{name:'alpha',amount:6},{name:'',amount:6}]});tx.rollback();bank.release();
 });
 it('clears at explicit send, then preserves a later gun ray in the same callback for the next send',()=>{
  const bank=new OriginalReceiverWeaponReportWorld(seed(2,[{name:'Earlier',amount:12}]),options),tx=bank.begin();tx.admitPrefix(p());
  expect(tx.send()).toEqual({shots:2,hurts:[{name:'Earlier',amount:12}]});expect(tx.send()).toEqual({});
  tx.record(outcome('rifle','Later'));tx.prepareCommit()();expect(bank.freeze()).toMatchObject({shots:1,hurts:[{name:'Later',amount:6}]});
  const next=bank.begin();next.admitPrefix(p(2));expect(next.send()).toEqual({shots:1,hurts:[{name:'Later',amount:6}]});next.prepareCommit()();expect(bank.freeze().shots).toBe(0);bank.release();
 });
 it('does not publish speculative send clearing or later accumulation on rollback, and retries from the prior checkpoint',()=>{
  const bank=new OriginalReceiverWeaponReportWorld(seed(1,[{name:'Prior',amount:6}]),options),before=bank.freeze(),first=bank.begin();first.admitPrefix(p());
  expect(first.send()).toEqual({shots:1,hurts:[{name:'Prior',amount:6}]});first.record(outcome('shotgun','New'));const unpublished=first.prepareCommit();
  expect(bank.freeze()).toBe(before);first.rollback();unpublished();expect(bank.freeze()).toBe(before);
  const retry=bank.begin();retry.admitPrefix(p());expect(retry.send()).toEqual({shots:1,hurts:[{name:'Prior',amount:6}]});retry.record(outcome('shotgun','New'));retry.prepareCommit()();expect(bank.freeze()).toMatchObject({shots:1,hurts:[{name:'New',amount:18}]});bank.release();
 });
 it.each(['shots','name-sum','total-sum'] as const)('rejects %s overflow and poisons the stage without changing committed state',mode=>{
  const initial=mode==='shots'?seed(Number.MAX_SAFE_INTEGER):mode==='name-sum'?seed(0,[{name:'Bravo',amount:Number.MAX_SAFE_INTEGER}]):seed(0,[{name:'Other',amount:Number.MAX_SAFE_INTEGER-3}]);
  const bank=new OriginalReceiverWeaponReportWorld(initial,options),before=bank.freeze(),tx=bank.begin();tx.admitPrefix(p());
  expect(()=>tx.record(outcome('rifle',mode==='shots'?undefined:'Bravo'))).toThrow(/overflow/);expect(()=>tx.send()).toThrow(/failed/);expect(()=>tx.prepareCommit()).toThrow(/failed/);expect(bank.freeze()).toBe(before);tx.rollback();bank.release();
 });
 it('enforces name and command budgets and captures options independently of caller aliases',()=>{
  const mutable={...options,maxNames:1,maxCommands:3},bank=new OriginalReceiverWeaponReportWorld(seed(),mutable);mutable.maxNames=99;mutable.maxCommands=99;
  const tx=bank.begin();tx.admitPrefix(p());tx.record(outcome('rifle','One'));expect(()=>tx.record(outcome('rifle','Two'))).toThrow(/name budget/);expect(()=>tx.freeze()).toThrow(/failed/);tx.rollback();
  const retry=bank.begin();retry.admitPrefix(p());retry.record(outcome());retry.send();expect(()=>retry.send()).toThrow(/command budget/);retry.rollback();bank.release();
 });
 it('bounds text across records even when a send releases stored names',()=>{
  const bank=new OriginalReceiverWeaponReportWorld(seed(),{...options,maxTextChars:30}),tx=bank.begin();tx.admitPrefix(p());
  tx.record(outcome('rifle','abcdefghijklmnopqrst'));tx.send();expect(()=>tx.record(outcome('rifle','abcdefghijklmnopqrst'))).toThrow(/text budget/);tx.rollback();bank.release();
 });
 it.each(['wrong-damage','hurt-without-hit','positive-without-hit','foreign-prefix'] as const)('rejects invalid trusted outcome %s',mode=>{
  const bank=new OriginalReceiverWeaponReportWorld(seed(),options),tx=bank.begin();tx.admitPrefix(p());const raw=outcome('rifle','Bravo');
  const invalid=mode==='wrong-damage'?{...raw,hurt:{...raw.hurt!,amount:18 as const}}:mode==='hurt-without-hit'?{...raw,hit:null,positiveShot:0 as const}:mode==='positive-without-hit'?{...raw,hit:null}: {...raw,prefix:{...p(),sceneGeneration:8}};
  expect(()=>tx.record(invalid)).toThrow();expect(()=>tx.record(outcome())).toThrow(/failed/);tx.rollback();expect(bank.freeze()).toEqual(seed());bank.release();
 });
 it('requires monotone same-generation receipt/callback prefixes and callback-only record/send',()=>{
  const bank=new OriginalReceiverWeaponReportWorld(seed(),options),tx=bank.begin();tx.admitPrefix({kind:'receipt',sceneGeneration:7,callback:0,tick:4});
  expect(()=>tx.send()).toThrow(/requires callback/);tx.rollback();
  const accepted=bank.begin();accepted.admitPrefix({kind:'receipt',sceneGeneration:7,callback:0,tick:4});accepted.admitPrefix(p());accepted.record(outcome());accepted.prepareCommit()();
  for(const prefix of [{kind:'receipt' as const,sceneGeneration:7,callback:1,tick:4},p(1),p(3),{...p(2),sceneGeneration:8}]){const invalid=bank.begin();expect(()=>invalid.admitPrefix(prefix)).toThrow(/prefix/);invalid.rollback();}
  const receipt=bank.begin();receipt.admitPrefix({kind:'receipt',sceneGeneration:7,callback:1,tick:5});expect(()=>receipt.record(outcome())).toThrow(/requires callback/);receipt.rollback();bank.release();
 });
 it('copies seeds and payloads, reads hurt-array count once, and ignores unknown payload fields',()=>{
  const rows=[{name:'Bravo',amount:6}],rawSeed=seed(1,rows),bank=new OriginalReceiverWeaponReportWorld(rawSeed,options);rows[0].name='Changed';rows.push({name:'Extra',amount:12});expect(bank.freeze().hurts).toEqual([{name:'Bravo',amount:6}]);
  const raw: {name:string;amount:number}[]=[];Object.defineProperty(raw,0,{get(){raw.push({name:'Extra',amount:12});return {name:'',amount:6};}});
  let unknownReads=0;const payload=copyReceiverWeaponReportPayload({shots:1,hurts:raw,get actorId(){unknownReads++;throw Error('unknown must not be read');}} as {shots:number;hurts:typeof raw},1,30);
  expect(raw).toHaveLength(2);expect(payload).toEqual({shots:1,hurts:[{name:'',amount:6}]});expect(unknownReads).toBe(0);bank.release();
 });
 it.each([{shots:0},{shots:-1},{shots:1.5},{hurts:[]},{hurts:[{name:'x',amount:0}]},{hurts:[{name:'x',amount:6},{name:'x',amount:6}]}])('rejects noncanonical payload %j',raw=>{
  expect(()=>copyReceiverWeaponReportPayload(raw,8,512)).toThrow();
 });
 it('seals mutations, permits one active owner, and release rolls back a prepared stage safely',()=>{
  const bank=new OriginalReceiverWeaponReportWorld(seed(),options),tx=bank.begin();expect(()=>bank.begin()).toThrow(/active/);tx.admitPrefix(p());tx.record(outcome());const publish=tx.prepareCommit();expect(tx.prepareCommit()).toBe(publish);
  expect(()=>tx.send()).toThrow(/prepared/);expect(bank.freeze()).toEqual(seed());bank.release();publish();bank.release();expect(()=>bank.freeze()).toThrow(/released/);expect(()=>tx.freeze()).toThrow(/closed|released/);expect(()=>bank.begin()).toThrow(/released/);
 });
});
