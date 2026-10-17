import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {OriginalSoloObserverWorlds,type OriginalSoloObserver,type OriginalSoloEvent,type OriginalSoloReceiverSceneLease} from './originalSoloObserverWorld';
import {OriginalReceiverModelWorld,type ReceiverModelBackend} from './originalReceiverModelWorld';
import {OriginalReceiverWeaponReportWorld,type ReceiverWeaponReportTransaction} from './originalReceiverWeaponReportWorld';
import {registerOriginalMapRuntime,type OriginalMapRuntime} from './originalMapRuntime';
import type {ReceiverLocalHitscanOutcome} from './originalReceiverLocalHitscan';
import type {ReceiverCurrentWeaponReportPublication} from './originalReceiverCurrentEnvironment';

let cached:OriginalMapRuntime|undefined;
const runtime=()=>cached??=registerOriginalMapRuntime('woodlands',JSON.parse(readFileSync(new URL('../public/assets/original-scenes/woodland/scene.json',import.meta.url),'utf8')));
interface Plan {before?:readonly string[];send?:boolean;after?:readonly string[];terminalAfterSend?:boolean}
interface RecordState {bank:OriginalReceiverWeaponReportWorld;plan:Plan;reports:readonly ReceiverCurrentWeaponReportPublication[];released:number}
interface FixtureView {worlds:OriginalSoloObserverWorlds;records:Map<string,RecordState>;events:OriginalSoloEvent[];registered:OriginalSoloObserver[]}
// Actual report record/send/commit stages are joined to the receiver stage.
// Trusted rifle ray outcomes and declared CPU lifecycle geometry isolate report
// admission; this is neither native ray evidence nor a source send-clock test.
function fixture(onEvent?:(e:OriginalSoloEvent,f:FixtureView)=>void,names=['Alpha','Bravo','Charlie'],admit=true){
 const records=new Map<string,RecordState>(),events:OriginalSoloEvent[]=[],r=runtime();
 const pose={position:{x:0,y:0,z:0},yaw:0,phase:0,scale:1};
 const backend:ReceiverModelBackend={cloneGI:()=>({pose,geometryProvenance:'declared-GI'}),cloneGun:()=>({pose,geometryProvenance:'declared-gun'}),heldGunPose:gi=>gi.pose,sphere:()=>({bspWorld:1,provenance:'declared-resource'}),reparentGunMembership:()=>true,dropYaw:()=>0,nearestDetailedDownward:()=>({hit:null,coverage:{complete:true,missing:[],provenance:'declared-CPU-oracle'}})};
 const worlds=new OriginalSoloObserverWorlds(r,{admitWeaponReportDamage:admit,onEvent:e=>{events.push(e);onEvent?.(e,values());},createReceiverScene:c=>{
  const bank=new OriginalReceiverWeaponReportWorld({prefix:{kind:'callback',sceneGeneration:c.lifeGeneration,callback:0},shots:0,hurts:[]},{maxNames:32,maxTextChars:4096,maxCommands:64});
  const record:RecordState={bank,plan:{},reports:[],released:0};records.set(c.id,record);
  const scene=new OriginalReceiverModelWorld(backend,{sceneGeneration:c.lifeGeneration,sourceScale:r.scale,eyeHeight:1,goodyBspWorld:1,maxModels:64,maxPickups:16});
  let pending:ReceiverWeaponReportTransaction|undefined,publications:readonly ReceiverCurrentWeaponReportPublication[]=[],terminalWorld:OriginalSoloObserver|undefined;
  const lease:OriginalSoloReceiverSceneLease={captureCurrent:context=>{
   if(context.deliveryKind!=='where')return;
   const prefix={kind:'callback' as const,sceneGeneration:c.lifeGeneration,callback:context.order.callbacks},tx=bank.begin();pending=tx;tx.admitPrefix(prefix);
   const recordHit=(name:string)=>tx.record({prefix,weapon:'rifle',positiveShot:1,hit:{handle:'trusted-gi',layer:'live-gi',geometryProvenance:'trusted-ray',faceIndex:0,distance:5,point:{x:0,y:1,z:-5},normal:{x:0,y:0,z:1}},hurt:{sourcePositionWorld:{x:0,y:1,z:0},actorId:'trusted-id-not-transported',name,amount:6}} satisfies ReceiverLocalHitscanOutcome);
   for(const name of record.plan.before??[])recordHit(name);
   publications=record.plan.send?Object.freeze([Object.freeze({prefix,report:tx.send()})]):Object.freeze([]);
   for(const name of record.plan.after??[])recordHit(name);
   // Explicit assignment-only terminal participant after an alive send. This
   // isolates committed-report admission, not CURRENT local-goody disappearance.
   terminalWorld=record.plan.terminalAfterSend?context.observer:undefined;
  },drainOutcomes:()=>Object.freeze([]),drainWeaponReports:()=>{const rows=record.reports;record.reports=[];return rows;},release:()=>{record.released++;pending?.rollback();bank.release();},scene:{begin:()=>{
   const tx=scene.begin(),report=pending,rows=publications,ending=terminalWorld;pending=undefined;publications=[];terminalWorld=undefined;
   return {...tx,prepareCommit:()=>{const publish=tx.prepareCommit(),publishReport=report?.prepareCommit();return()=>{publish();publishReport?.();if(report)record.reports=rows;if(ending){ending.health.canonical=-5;ending.alive=false;}};},rollback:()=>{tx.rollback();report?.rollback();}};
  }}};return lease;
 }});
 const registered=names.map((name,i)=>{const w=worlds.register({id:String.fromCharCode(65+i),name,eye:{x:1000+i*1000,y:1000,z:1000}});w.weapon='rifle';return w;});
 function values():FixtureView{return {worlds,records,events,registered};}
 const physical=(n:number)=>{const time=n/30;worlds.physics(time,{skipIds:new Set(worlds.worlds.keys())});for(const w of worlds.worlds.values())if(w.alive)worlds.goody(w.id);return time;};
 const cycle=(n:number)=>{const time=physical(n);worlds.completeGoody(time);worlds.actors(time);};
 return {...values(),physical,cycle};
}

describe('committed source weapon report canonical damage admission',()=>{
 it('admits an already committed alive send when another joint participant later marks its sender dead',()=>{
  const f=fixture();try{
   f.records.get('A')!.plan={before:['Bravo'],send:true,terminalAfterSend:true};f.cycle(1);
   expect(f.registered[0].alive).toBe(false);expect(f.registered[1].health.canonical).toBe(94);
   expect(f.events.filter(e=>e.kind==='weapon-report')).toHaveLength(1);expect(f.events.filter(e=>e.kind==='damaged'&&e.recipientId==='B')).toHaveLength(1);
  }finally{f.worlds.clear();}
 });
 it('damages only sent accumulated reports once, retains a new hit after send, and never debits on unsent hits',()=>{
  const f=fixture(),b=f.registered[1],a=f.records.get('A')!;
  try{
   a.plan={before:['Bravo'],send:true,after:['Bravo']};f.cycle(1);expect(b.health.canonical).toBe(94);expect(a.bank.freeze().hurts).toEqual([{name:'Bravo',amount:6}]);
   a.plan={};f.cycle(2);expect(b.health.canonical).toBe(94);
   a.plan={send:true};f.cycle(3);expect(b.health.canonical).toBe(88);expect(a.bank.freeze().hurts).toEqual([]);
   a.plan={};f.cycle(4);expect(b.health.canonical).toBe(88);expect(f.events.filter(e=>e.kind==='damaged')).toHaveLength(2);
  }finally{f.worlds.clear();}
 });
 it('commits every target health before the first public notification',()=>{
  let checked=false;const f=fixture((_e,state)=>{if(checked)return;checked=true;expect(state.registered[1].health.canonical).toBe(94);expect(state.registered[2].health.canonical).toBe(94);for(const row of state.records.values())expect(row.reports).toEqual([]);});
  try{f.records.get('A')!.plan={before:['Bravo','Charlie'],send:true};f.cycle(1);expect(checked).toBe(true);}finally{f.worlds.clear();}
 });
 it('continues damage and terminal cleanup when report and damage listeners throw',()=>{
  const f=fixture(e=>{if(e.kind==='weapon-report'||e.kind==='damaged'||e.kind==='dead')throw Error('notification failed');});
  try{
   const b=f.registered[1],c=f.registered[2];b.health.canonical=1;c.health.canonical=1;f.records.get('A')!.plan={before:['Bravo','Charlie'],send:true};
   expect(()=>f.worlds.completeGoody(f.physical(1))).toThrow();expect(b.health.canonical).toBe(-5);expect(c.health.canonical).toBe(-5);
   expect(f.events.filter(e=>e.kind==='damaged')).toHaveLength(2);expect(f.events.filter(e=>e.kind==='dead')).toHaveLength(2);expect(f.worlds.worlds.has('B')).toBe(false);expect(f.worlds.worlds.has('C')).toBe(false);expect(f.records.get('B')!.released).toBe(1);expect(f.records.get('C')!.released).toBe(1);
  }finally{f.worlds.clear();}
 });
 it('filters ASCII-equivalent sender names and matches hurt targets by exact string',()=>{
  const f=fixture(undefined,['Alpha','ALPHA','Bravo']);
  try{f.records.get('A')!.plan={before:['ALPHA','bravo'],send:true};f.cycle(1);expect(f.registered[1].health.canonical).toBe(100);expect(f.registered[2].health.canonical).toBe(100);f.records.get('A')!.plan={before:['Bravo'],send:true};f.cycle(2);expect(f.registered[2].health.canonical).toBe(94);}finally{f.worlds.clear();}
 });
 it('finishes committed damage notifications after a listener freezes the population',()=>{
  let frozen=false;const f=fixture((e,state)=>{if(e.kind==='weapon-report'&&!frozen){frozen=true;state.worlds.freeze();}});
  try{f.records.get('A')!.plan={before:['Bravo','Charlie'],send:true};f.cycle(1);expect(f.registered[1].health.canonical).toBe(94);expect(f.registered[2].health.canonical).toBe(94);expect(f.events.filter(e=>e.kind==='damaged')).toHaveLength(2);}finally{f.worlds.clear();}
 });
 it('suppresses old notifications and never transfers committed damage into a same-id replacement life',()=>{
  let replacement:OriginalSoloObserver|undefined;const f=fixture((e,state)=>{if(e.kind==='weapon-report'&&!replacement){state.worlds.clear();replacement=state.worlds.register({id:'B',name:'Bravo',eye:{x:1000,y:1000,z:1000}});}});
  try{const old=f.registered[1];f.records.get('A')!.plan={before:['Bravo'],send:true};f.worlds.completeGoody(f.physical(1));expect(old.health.canonical).toBe(94);expect(replacement).toBeDefined();expect(replacement).not.toBe(old);expect(replacement!.health.canonical).toBe(100);expect(f.events.filter(e=>e.kind==='damaged')).toHaveLength(0);}finally{f.worlds.clear();}
 });
 it('rejects a malformed target health atomically without partially damaging another target',()=>{
  const f=fixture();try{const b=f.registered[1],c=f.registered[2];f.records.get('A')!.plan={before:['Bravo','Charlie'],send:true};const time=f.physical(1);c.health.canonical=NaN;expect(()=>f.worlds.completeGoody(time)).toThrow();expect(b.health.canonical).toBe(100);expect(c.health.canonical).toBeNaN();expect(f.events.filter(e=>e.kind==='damaged'||e.kind==='dead')).toHaveLength(0);}finally{f.worlds.clear();}
 });
 it('keeps canonical health unchanged when admission is disabled',()=>{
  const f=fixture(undefined,undefined,false);try{f.records.get('A')!.plan={before:['Bravo'],send:true};f.cycle(1);expect(f.registered[1].health.canonical).toBe(100);expect(f.events.filter(e=>e.kind==='weapon-report')).toHaveLength(1);expect(f.events.filter(e=>e.kind==='damaged')).toHaveLength(0);}finally{f.worlds.clear();}
 });
});
