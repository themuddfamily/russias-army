import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {OriginalSoloObserverWorlds,type OriginalSoloEvent,type OriginalSoloObserver,type OriginalSoloReceiverSceneLease} from './originalSoloObserverWorld';
import {OriginalReceiverModelWorld,type ReceiverModelBackend} from './originalReceiverModelWorld';
import {registerOriginalMapRuntime,type OriginalMapRuntime} from './originalMapRuntime';
import {ORIGINAL_WEAPON_SLOT_ORDER} from './originalPickupRules';
import type {ReceiverLoadoutCheckpoint} from './originalReceiverLoadoutWorld';
import type {ReceiverCurrentHurtOutcome,ReceiverCurrentLoadoutPublication,ReceiverCurrentWeaponReportPublication} from './originalReceiverCurrentEnvironment';
import type {WeaponId} from './protocol';
import type {ReceiverLocalHitscanOutcome} from './originalReceiverLocalHitscan';

let cachedRuntime:OriginalMapRuntime|undefined;
const runtime=()=>cachedRuntime??=registerOriginalMapRuntime('woodlands',JSON.parse(readFileSync(new URL('../public/assets/original-scenes/woodland/scene.json',import.meta.url),'utf8')));
const prefix=(callback=1)=>({kind:'callback' as const,sceneGeneration:1,callback});
const feedback=(message:string,callback=1):ReceiverCurrentLoadoutPublication=>({prefix:prefix(callback),intent:{kind:'feedback',message}});
const counts=()=>Object.fromEntries(ORIGINAL_WEAPON_SLOT_ORDER.map(w=>[w,0])) as Record<WeaponId,number>;
const checkpoint=(callback=1):ReceiverLoadoutCheckpoint=>({prefix:prefix(callback),map:'woodlands',selected:'pistol',owned:Object.fromEntries(ORIGINAL_WEAPON_SLOT_ORDER.map(w=>[w,true])) as Record<WeaponId,boolean>,ammo:{...counts(),pistol:2},reserve:{...counts(),pistol:3},refillTarget:8,counter:{waitgun:30,poldwaitgun:7},score:42,goldScore:123.5});
interface RecordState {world?:OriginalSoloObserver;lease:OriginalSoloReceiverSceneLease;hurt:readonly ReceiverCurrentHurtOutcome[];shots:readonly ReceiverLocalHitscanOutcome[];reports:readonly ReceiverCurrentWeaponReportPublication[];outputs:readonly ReceiverCurrentLoadoutPublication[];state?:ReceiverLoadoutCheckpoint;hurtError?:Error;stateError?:Error;commit?:()=>void;released:number}
function fixture(onEvent?:(event:OriginalSoloEvent,worlds:OriginalSoloObserverWorlds,records:Map<string,RecordState>,log:string[])=>void){
 const records=new Map<string,RecordState>(),events:OriginalSoloEvent[]=[],log:string[]=[],r=runtime(),pose={position:{x:0,y:0,z:0},yaw:0,phase:0,scale:1},backend:ReceiverModelBackend={cloneGI:()=>({pose,geometryProvenance:'declared-GI'}),cloneGun:()=>({pose,geometryProvenance:'declared-gun'}),heldGunPose:gi=>gi.pose,sphere:()=>({bspWorld:1,provenance:'declared-resource'}),reparentGunMembership:()=>true,dropYaw:()=>0,nearestDetailedDownward:()=>({hit:null,coverage:{complete:true,missing:[],provenance:'declared-CPU-oracle'}})};
 const worlds=new OriginalSoloObserverWorlds(r,{onEvent:e=>{events.push(e);log.push(`event:${e.kind}:${e.recipientId}`);onEvent?.(e,worlds,records,log);},createReceiverScene:registration=>{
  const record:RecordState={lease:undefined as unknown as OriginalSoloReceiverSceneLease,hurt:[],shots:[],reports:[],outputs:[],released:0};records.set(registration.id,record);const scene=new OriginalReceiverModelWorld(backend,{sceneGeneration:registration.lifeGeneration,sourceScale:r.scale,eyeHeight:1,goodyBspWorld:1,maxModels:32,maxPickups:8});
  record.lease={captureCurrent:context=>{record.world=context.observer;},drainOutcomes:()=>{log.push(`${registration.id}:hurt`);const values=record.hurt;record.hurt=[];const error=record.hurtError;record.hurtError=undefined;if(error)throw error;return values;},drainLocalHitscanOutcomes:()=>{log.push(`${registration.id}:shots`);const values=record.shots;record.shots=[];return values;},drainWeaponReports:()=>{log.push(`${registration.id}:reports`);const values=record.reports;record.reports=[];return values;},drainLoadoutIntents:()=>{log.push(`${registration.id}:outputs`);const values=record.outputs;record.outputs=[];return values;},readLoadoutState:()=>{log.push(`${registration.id}:state`);const error=record.stateError;record.stateError=undefined;if(error)throw error;return record.state;},release:()=>{record.released++;},scene:{begin:()=>{const tx=scene.begin();return {...tx,prepareCommit:()=>{const publish=tx.prepareCommit();return()=>{publish();record.commit?.();};}};}}};return record.lease;
 }});
 const a=worlds.register({id:'A',name:'Alpha',eye:{x:1000,y:1000,z:1000}}),b=worlds.register({id:'B',name:'Bravo',eye:{x:2000,y:1000,z:1000}});a.weapon='rifle';b.weapon='rifle';
 const physical=(n:number)=>{const time=n/30;worlds.physics(time,{skipIds:new Set(worlds.worlds.keys())});for(const w of worlds.worlds.values())if(w.alive)worlds.goody(w.id);return time;};
 const cycle=(n:number)=>{const time=physical(n);worlds.completeGoody(time);worlds.actors(time);};
 return {worlds,a,b,records,events,log,physical,cycle};
}

// Custom queues isolate committed notification validation, not native pickup
// admission. Actual CURRENT/loadout producer ownership is tested separately.
describe('solo coordinator committed loadout state and output delivery',()=>{
 it('drains both queues and reads every committed recipient before any public callback, adopting detached explicit state first',()=>{
  const mutable=checkpoint(),aOutput=feedback('A feedback'),f=fixture((_e,_worlds,_records,log)=>{for(const id of ['A','B'])for(const phase of ['hurt','outputs','state'])expect(log).toContain(`${id}:${phase}`);(mutable.ammo as Record<WeaponId,number>).pistol=999;});f.records.get('A')!.state=mutable;f.records.get('A')!.outputs=[aOutput];f.records.get('B')!.outputs=[feedback('B feedback')];f.cycle(1);expect(f.a.weapon).toBe('pistol');expect(f.a.loadout!.ammo.pistol).toBe(2);expect(f.a.loadout!.score).toBe(42);expect(Object.isFrozen(f.a.loadout!.ammo)).toBe(true);const order=f.events.map(e=>e.kind);expect(order.indexOf('loadout-state')).toBeLessThan(order.indexOf('loadout-output'));const outputs=f.events.flatMap(e=>e.kind==='loadout-output'?[e]:[]);expect(outputs.map(e=>e.intent)).toEqual([aOutput.intent,feedback('B feedback').intent]);expect(outputs.every(e=>Object.isFrozen(e)&&Object.isFrozen(e.prefix)&&Object.isFrozen(e.intent))).toBe(true);f.worlds.clear();
 });
 it('continues committed output delivery after freeze without replaying queues',()=>{
  let frozen=false;const f=fixture((e,worlds)=>{if(e.kind==='loadout-output'&&!frozen){frozen=true;worlds.freeze();}});f.records.get('A')!.outputs=[feedback('first'),feedback('second')];f.records.get('B')!.outputs=[feedback('other')];f.cycle(1);expect(f.events.flatMap(e=>e.kind==='loadout-output'&&e.intent.kind==='feedback'?[e.intent.message]:[])).toEqual(['first','second','other']);expect(f.records.get('A')!.outputs).toEqual([]);f.worlds.clear();
 });
 it('continues other recipients after a public output callback throws and never emits that consumed output again',()=>{
  let fail=true;const f=fixture(e=>{if(e.kind==='loadout-output'&&e.recipientId==='A'&&fail){fail=false;throw Error('loadout presentation failed');}});f.records.get('A')!.outputs=[feedback('A')];f.records.get('B')!.outputs=[feedback('B')];const time=f.physical(1);expect(()=>f.worlds.completeGoody(time)).toThrow();expect(f.events.filter(e=>e.kind==='loadout-output')).toHaveLength(2);f.worlds.actors(time);f.cycle(2);expect(f.events.filter(e=>e.kind==='loadout-output')).toHaveLength(2);f.worlds.clear();
 });
 it('publishes already committed output before terminal hurt/death even when its owner was made dead by the publisher',()=>{
  const f=fixture(),record=f.records.get('A')!;record.outputs=[feedback('terminal pickup')];record.state=checkpoint();record.hurt=[{kind:'hurt',effectId:'declared-terminal',prefix:prefix(),position:{x:0,y:0,z:0},attackerName:null,amount:5,health:-1,dead:true}];record.commit=()=>{f.a.health.canonical=-1;f.a.alive=false;};const time=f.physical(1);f.worlds.completeGoody(time);const kinds=f.events.filter(e=>e.recipientId==='A').map(e=>e.kind);expect(kinds.indexOf('loadout-output')).toBeGreaterThanOrEqual(0);expect(kinds.indexOf('loadout-output')).toBeLessThan(kinds.indexOf('damaged'));expect(kinds.indexOf('damaged')).toBeLessThan(kinds.indexOf('dead'));expect(f.a.health.canonical).toBe(-1);expect(f.worlds.worlds.has('A')).toBe(false);expect(record.released).toBe(1);expect(f.events.filter(e=>e.kind==='loadout-output'&&e.recipientId==='A')).toHaveLength(1);f.worlds.clear();
 });
 it('uses exact object identity to suppress remaining old outputs after clear/re-register with the same numeric life',()=>{
  let replacement:OriginalSoloObserver|undefined;const f=fixture((e,worlds)=>{if(e.kind==='loadout-output'&&e.recipientId==='A'&&!replacement){worlds.clear();replacement=worlds.register({id:'A',name:'Replacement',eye:{x:1000,y:1000,z:1000}});replacement.weapon='rifle';}});const old=f.a;f.records.get('A')!.outputs=[feedback('first'),feedback('stale-second')];f.records.get('B')!.outputs=[feedback('stale-other')];const time=f.physical(1);f.worlds.completeGoody(time);expect(replacement).toBeDefined();expect(replacement).not.toBe(old);expect(replacement!.lifeGeneration).toBe(1);expect(f.worlds.worlds.get('A')).toBe(replacement);expect(f.events.flatMap(e=>e.kind==='loadout-output'&&e.intent.kind==='feedback'?[e.intent.message]:[])).toEqual(['first']);f.worlds.clear();
 });
 it('bounds output cardinality before entry/iterator access and independently preserves valid committed state and other queues',()=>{
  const f=fixture(),oversized=new Array(257);let reads=0;Object.defineProperty(oversized,0,{get:()=>{reads++;throw Error('entry read');}});Object.defineProperty(oversized,Symbol.iterator,{get:()=>{reads++;throw Error('iterator read');}});f.records.get('A')!.outputs=oversized;f.records.get('A')!.state=checkpoint();f.records.get('B')!.outputs=[feedback('survivor')];const time=f.physical(1);expect(()=>f.worlds.completeGoody(time)).toThrow();expect(reads).toBe(0);expect(f.a.loadout!.score).toBe(42);expect(f.events.flatMap(e=>e.kind==='loadout-output'&&e.intent.kind==='feedback'?[e.intent.message]:[])).toEqual(['survivor']);expect(f.log).toContain('B:hurt');expect(f.records.get('A')!.outputs).toEqual([]);f.worlds.clear();
 });
 it('rejects malformed generation, future receipt tick, output kind and text without preventing another recipient drain',()=>{
  const invalid:ReceiverCurrentLoadoutPublication[]=[{...feedback('foreign'),prefix:{...prefix(),sceneGeneration:2}},{...feedback('future'),prefix:{kind:'receipt',sceneGeneration:1,callback:1,tick:999}},{prefix:prefix(),intent:{kind:'reload-sound',weapon:'rifle',sound:'not-a-sound',channel:6} as unknown as ReceiverCurrentLoadoutPublication['intent']},feedback('x'.repeat(65537))];for(const output of invalid){const f=fixture();f.records.get('A')!.outputs=[output];f.records.get('B')!.outputs=[feedback('valid')];const time=f.physical(1);expect(()=>f.worlds.completeGoody(time)).toThrow();expect(f.events.flatMap(e=>e.kind==='loadout-output'&&e.intent.kind==='feedback'?[e.intent.message]:[])).toEqual(['valid']);expect(f.log).toContain('A:hurt');expect(f.log).toContain('B:outputs');f.worlds.clear();}
 });
 it('rejects stale same-callback receipt state instead of adopting false selection or score, while still publishing valid outputs',()=>{
  const f=fixture();f.cycle(1);f.records.get('A')!.state={...checkpoint(2),prefix:{kind:'receipt',sceneGeneration:1,callback:2,tick:0},score:999};f.records.get('A')!.outputs=[feedback('already committed',2)];f.records.get('B')!.outputs=[feedback('other committed',2)];const time=f.physical(2);expect(()=>f.worlds.completeGoody(time)).toThrow();expect(f.a.weapon).toBe('rifle');expect(f.a.loadout).toBeUndefined();expect(f.events.filter(e=>e.kind==='loadout-output')).toHaveLength(2);f.worlds.clear();
 });
 it('treats read-state and hurt-drain failures independently so neither strands output or the other life',()=>{
  const f=fixture();f.records.get('A')!.stateError=Error('state read failed');f.records.get('A')!.hurtError=Error('hurt drain failed');f.records.get('A')!.outputs=[feedback('A committed')];f.records.get('B')!.outputs=[feedback('B committed')];const time=f.physical(1);expect(()=>f.worlds.completeGoody(time)).toThrow();expect(f.events.filter(e=>e.kind==='loadout-output')).toHaveLength(2);for(const id of ['A','B'])for(const phase of ['hurt','outputs','state'])expect(f.log).toContain(`${id}:${phase}`);expect(f.a.loadout).toBeUndefined();f.worlds.actors(time);f.cycle(2);expect(f.events.filter(e=>e.kind==='loadout-output')).toHaveLength(2);f.worlds.clear();
 });
});


// Explicit trusted nonempty drain queues isolate coordinator delivery. Actual
// query/FX staging is exercised in CurrentEnvironment.hitscan.test.ts; these
// cases do not establish producer action admission or native source geometry.
const shotOutcome=(callback=1):ReceiverLocalHitscanOutcome=>({prefix:prefix(callback),weapon:'rifle',positiveShot:1,hit:{handle:'attested-gi',layer:'live-gi',geometryProvenance:'attested-query',faceIndex:0,distance:5,point:{x:0,y:1,z:-5},normal:{x:0,y:0,z:1}},hurt:{sourcePositionWorld:{x:0,y:1,z:0},actorId:'target',name:'Target',amount:6}});

describe('solo coordinator committed local bullet outcome delivery (trusted queues)',()=>{
 it('drains every recipient before callbacks and emits detached hit metadata before audio outputs',()=>{
  const mutable=shotOutcome(),f=fixture((_event,_worlds,records,log)=>{
   for(const id of ['A','B']){expect(log).toContain(`${id}:shots`);expect(records.get(id)!.shots).toEqual([]);}
   (mutable.hit!.point as {z:number}).z=999;
  });f.records.get('A')!.shots=[mutable];f.records.get('A')!.outputs=[feedback('after shot')];f.records.get('B')!.shots=[shotOutcome()];f.cycle(1);
  const shots=f.events.flatMap(e=>e.kind==='local-hitscan-outcome'?[e]:[]);expect(shots).toHaveLength(2);expect(f.a.localHitscanOutcomes![0]).toBe(shots[0].outcome);expect(Object.isFrozen(f.a.localHitscanOutcomes)).toBe(true);expect(shots[0].outcome.hit!.point.z).toBe(-5);expect(Object.isFrozen(shots[0].outcome.hit!.point)).toBe(true);const kinds=f.events.map(e=>e.kind);expect(kinds.lastIndexOf('local-hitscan-outcome')).toBeLessThan(kinds.indexOf('loadout-output'));f.worlds.clear();
 });
 it('continues other shots and audio after a listener error without replaying consumed rows',()=>{
  let fail=true;const f=fixture(event=>{if(event.kind==='local-hitscan-outcome'&&event.recipientId==='A'&&fail){fail=false;throw Error('shot listener failed');}});f.records.get('A')!.shots=[shotOutcome()];f.records.get('B')!.shots=[shotOutcome()];f.records.get('B')!.outputs=[feedback('surviving audio')];const time=f.physical(1);expect(()=>f.worlds.completeGoody(time)).toThrow();expect(f.events.filter(e=>e.kind==='local-hitscan-outcome')).toHaveLength(2);expect(f.events.filter(e=>e.kind==='loadout-output')).toHaveLength(1);f.worlds.actors(time);f.cycle(2);expect(f.events.filter(e=>e.kind==='local-hitscan-outcome')).toHaveLength(2);f.worlds.clear();
 });
 it('suppresses remaining old hit reports after replacement with the same id and numeric life',()=>{
  let fresh:OriginalSoloObserver|undefined;const f=fixture((event,worlds)=>{if(event.kind==='local-hitscan-outcome'&&event.recipientId==='A'&&!fresh){worlds.clear();fresh=worlds.register({id:'A',name:'Replacement',eye:{x:1000,y:1000,z:1000}});}});f.records.get('A')!.shots=[shotOutcome(),shotOutcome()];f.records.get('B')!.shots=[shotOutcome()];f.worlds.completeGoody(f.physical(1));expect(fresh?.lifeGeneration).toBe(1);expect(fresh).not.toBe(f.a);expect(f.events.filter(e=>e.kind==='local-hitscan-outcome')).toHaveLength(1);f.worlds.clear();
 });
 it.each(['foreign','future','oversized'] as const)('rejects %s hit queues independently while still draining and publishing other recipients',mode=>{
  const f=fixture();let reads=0;
  const raw=mode==='oversized'?new Array<ReceiverLocalHitscanOutcome>(257):[{...shotOutcome(),prefix:{...prefix(mode==='future'?2:1),sceneGeneration:mode==='foreign'?2:1}}];
  if(mode==='oversized')Object.defineProperty(raw,0,{get(){reads++;throw Error('unexpected oversized row read');}});
  f.records.get('A')!.shots=raw;f.records.get('B')!.shots=[shotOutcome()];f.records.get('B')!.outputs=[feedback('other queue')];expect(()=>f.worlds.completeGoody(f.physical(1))).toThrow();expect(reads).toBe(0);expect(f.records.get('A')!.shots).toEqual([]);expect(f.events.filter(e=>e.kind==='local-hitscan-outcome').map(e=>e.recipientId)).toEqual(['B']);expect(f.events.filter(e=>e.kind==='loadout-output')).toHaveLength(1);f.worlds.clear();
 });
});

// Trusted committed report queues exercise the observer boundary only. They do
// not send a network packet, apply health, or infer a source send clock.
const weaponReport=(callback=1):ReceiverCurrentWeaponReportPublication=>({prefix:prefix(callback),report:{shots:1,hurts:[{name:'Target',amount:6}]}});
describe('solo coordinator committed weapon report delivery (trusted queues)',()=>{
 it('drains all recipients before the first report callback and detaches mutable payload aliases',()=>{
  const hurts=[{name:'Original',amount:12}],mutable={shots:2,hurts},f=fixture((event,_worlds,records,log)=>{
   if(event.kind!=='weapon-report')return;
   for(const id of ['A','B']){expect(log).toContain(`${id}:reports`);expect(records.get(id)!.reports).toEqual([]);}
   mutable.shots=999;hurts[0].name='Changed';hurts[0].amount=999;hurts.push({name:'Added',amount:6});
  });try{
   f.records.get('A')!.reports=[{prefix:prefix(),report:mutable}];f.records.get('B')!.reports=[weaponReport()];f.cycle(1);
   const reports=f.events.flatMap(e=>e.kind==='weapon-report'?[e]:[]);expect(reports).toHaveLength(2);expect(reports[0].report).toEqual({shots:2,hurts:[{name:'Original',amount:12}]});
   expect(f.a.weaponReports).toEqual([reports[0]]);expect(f.a.weaponReports![0]).toBe(reports[0]);expect(Object.isFrozen(f.a.weaponReports)).toBe(true);
   expect(reports.every(e=>Object.isFrozen(e)&&Object.isFrozen(e.prefix)&&Object.isFrozen(e.report)&&Object.isFrozen(e.report.hurts)&&Object.isFrozen(e.report.hurts![0]))).toBe(true);
   expect(f.a.health.canonical).toBe(100);expect(f.b.health.canonical).toBe(100);
  }finally{f.worlds.clear();}
 });
 it('delivers report events before local hitscan outcomes and deferred loadout audio/output',()=>{
  const f=fixture();try{
   for(const id of ['A','B']){const record=f.records.get(id)!;record.reports=[weaponReport()];record.shots=[shotOutcome()];record.outputs=[feedback('deferred audio/output')];}
   f.cycle(1);const kinds=f.events.map(e=>e.kind);expect(kinds.filter(k=>k==='weapon-report')).toHaveLength(2);
   expect(kinds.lastIndexOf('weapon-report')).toBeLessThan(kinds.indexOf('local-hitscan-outcome'));expect(kinds.lastIndexOf('weapon-report')).toBeLessThan(kinds.indexOf('loadout-output'));
  }finally{f.worlds.clear();}
 });
 it('continues report/shot/output queues after a report listener throws, without replay on the next callback',()=>{
  let fail=true;const f=fixture(event=>{if(event.kind==='weapon-report'&&event.recipientId==='A'&&fail){fail=false;throw Error('report listener failed');}});try{
   f.records.get('A')!.reports=[weaponReport()];const other=f.records.get('B')!;other.reports=[weaponReport()];other.shots=[shotOutcome()];other.outputs=[feedback('after failing report')];
   const time=f.physical(1);expect(()=>f.worlds.completeGoody(time)).toThrow(/committed callback dispatch failed/);
   expect(f.events.filter(e=>e.kind==='weapon-report').map(e=>e.recipientId)).toEqual(['A','B']);expect(f.events.filter(e=>e.kind==='local-hitscan-outcome')).toHaveLength(1);expect(f.events.filter(e=>e.kind==='loadout-output')).toHaveLength(1);
   f.worlds.actors(time);f.cycle(2);expect(f.events.filter(e=>e.kind==='weapon-report')).toHaveLength(2);expect(other.reports).toEqual([]);
  }finally{f.worlds.clear();}
 });
 it('suppresses stale remaining report and output events after clear/re-register with the same id and numeric life',()=>{
  let replacement:OriginalSoloObserver|undefined;const f=fixture((event,worlds)=>{
   if(event.kind==='weapon-report'&&event.recipientId==='A'&&!replacement){worlds.clear();replacement=worlds.register({id:'A',name:'Replacement',eye:{x:1000,y:1000,z:1000}});}
  });try{
   f.records.get('A')!.reports=[weaponReport(),weaponReport()];f.records.get('A')!.shots=[shotOutcome()];f.records.get('A')!.outputs=[feedback('stale A')];f.records.get('B')!.reports=[weaponReport()];
   f.worlds.completeGoody(f.physical(1));expect(replacement?.lifeGeneration).toBe(f.a.lifeGeneration);expect(replacement).not.toBe(f.a);
   expect(f.events.filter(e=>e.kind==='weapon-report')).toHaveLength(1);expect(f.events.filter(e=>e.kind==='local-hitscan-outcome'||e.kind==='loadout-output')).toEqual([]);
  }finally{f.worlds.clear();}
 });
 it('rejects foreign/future prefixes and oversized queues before entry access while another recipient delivers',()=>{
  for(const mode of ['foreign','future','oversized'] as const){const f=fixture();try{
   let reads=0;const raw=mode==='oversized'?new Array<ReceiverCurrentWeaponReportPublication>(257):[{...weaponReport(mode==='future'?2:1),prefix:{...prefix(mode==='future'?2:1),sceneGeneration:mode==='foreign'?2:1}}];
   if(mode==='oversized'){Object.defineProperty(raw,0,{get(){reads++;throw Error('oversized report entry');}});Object.defineProperty(raw,Symbol.iterator,{get(){reads++;throw Error('oversized report iterator');}});}
   f.records.get('A')!.reports=raw;f.records.get('B')!.reports=[weaponReport()];f.records.get('B')!.outputs=[feedback('surviving output')];expect(()=>f.worlds.completeGoody(f.physical(1))).toThrow();
   expect(reads).toBe(0);expect(f.records.get('A')!.reports).toEqual([]);expect(f.events.filter(e=>e.kind==='weapon-report').map(e=>e.recipientId)).toEqual(['B']);expect(f.events.filter(e=>e.kind==='loadout-output')).toHaveLength(1);
  }finally{f.worlds.clear();}}
 });
 it('bounds aggregate names/text across reports, rather than merely accepting each individually bounded payload',()=>{
  for(const mode of ['names','text'] as const){const f=fixture();try{
   const hurts=mode==='names'?Array.from({length:129},(_,i)=>({name:`name:${i}`,amount:6})):[{name:'x'.repeat(40000),amount:6}];
   f.records.get('A')!.reports=[{prefix:prefix(),report:{hurts}},{prefix:prefix(),report:{hurts}}];f.records.get('B')!.reports=[weaponReport()];
   expect(()=>f.worlds.completeGoody(f.physical(1))).toThrow();expect(f.records.get('A')!.reports).toEqual([]);expect(f.events.filter(e=>e.kind==='weapon-report').map(e=>e.recipientId)).toEqual(['B']);
  }finally{f.worlds.clear();}}
 });
});
