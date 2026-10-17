import {readFileSync} from 'node:fs';
import {describe,expect,it,vi} from 'vitest';
import {createOriginalSoloCurrentSceneLease} from './originalSoloCurrentSceneProducer';
import {OriginalSoloObserverWorlds,type OriginalSoloReceiverSceneLease,type OriginalSoloReceiverCurrentContext,type OriginalSoloCurrentCaptureResult} from './originalSoloObserverWorld';
import {originalPlayerEye} from './originalPlayerPhysics';
import {validateOriginalReceiverActorRegistrySnapshot,type ReceiverActorRegistrySnapshot} from './originalReceiverActorRegistry';
import type {ReceiverModelBackend,ReceiverModelPose} from './originalReceiverModelWorld';
import {registerOriginalMapRuntime,type OriginalMapRuntime} from './originalMapRuntime';
import {createOriginalProjectile} from './originalExplosives';

let decoded:OriginalMapRuntime|undefined;
const runtime=()=>decoded??(decoded=registerOriginalMapRuntime('woodlands',JSON.parse(readFileSync(new URL('../public/assets/original-scenes/woodland/scene.json',import.meta.url),'utf8'))));
interface RecordState {lease:OriginalSoloReceiverSceneLease;contexts:OriginalSoloReceiverCurrentContext[];plans:(void|OriginalSoloCurrentCaptureResult)[];backends:number;goody:number;released:number;clones:{name:string;width:number}[];queries:number;registries?:ReceiverActorRegistrySnapshot[]}
function fixture(){
 const records=new Map<string,RecordState>(),flags={missing:false,partialQuery:false},pose:ReceiverModelPose={position:{x:0,y:0,z:0},yaw:0,phase:0,scale:1,rotation:{x:0,y:0,z:0,w:1}};
 const options=(record:RecordState):Parameters<typeof createOriginalSoloCurrentSceneLease>[0]=>({sourceScale:runtime().scale,maxCapturedBlasts:8,maxCapturedProjectiles:8,
  environment:{maxCommands:16,maxOutcomes:16,maxModels:128,maxTextChars:65536},controller:{model:{eyeHeight:runtime().profile.eyeHeight,goodyBspWorld:50*runtime().scale,maxModels:128,maxPickups:32,requireCompleteCoverage:false},transient:{maxModels:32,maxActors:32,maxShaders:32},maxEffects:64},
  createBackends:binding=>{record.backends++;expect(binding.target).toBe(binding.observer);const model:ReceiverModelBackend={cloneGI:()=>({pose,geometryProvenance:'declared-GI'}),cloneGun:()=>({pose,geometryProvenance:'declared-gun'}),heldGunPose:()=>pose,sphere:()=>({bspWorld:1,provenance:'declared-resource'}),reparentGunMembership:x=>x,dropYaw:()=>0,nearestDetailedDownward:()=>{record.queries++;return {hit:null,coverage:{complete:!flags.partialQuery,missing:flags.partialQuery?['unproved-query-class']:[],provenance:'declared-empty-query-fixture'}};}};
   return {model,transient:{clonePlane:(name,width)=>{record.clones.push({name,width});return {pose,geometryProvenance:'declared-plane',inWorld:true};},cloneMuzzle:()=>({pose,geometryProvenance:'declared-muzzle',inWorld:true}),pointAt:()=>({x:0,y:0,z:0,w:1}),selfRotate:q=>q},release:()=>{record.released++;}};},
  // This is an explicitly supplied measured camera mapping and weapon, not a
  // producer default or human renderer lookup.
  goodyAt:context=>{record.goody++;return context.alive?{eyePosition:originalPlayerEye(context.body),modelPosition:originalPlayerEye(context.body),bspWorld:50*runtime().scale,weapon:context.weapon??'sniper'}:null;},
  // Controlled no-hit CPU oracle only; actual remaining source classes are
  // not inferred. A mandatory missing label is preserved when injected.
  snapshotAt:(prefix,_state,_context,registry)=>{if(record.registries){if(!registry)throw Error('Producer registry forwarding absent');record.registries.push(registry);}return {prefix,models:[],missing:flags.missing?['unresolved-native-inventory']:[],provenance:'declared-empty-producer-fixture'};}});
 const worlds=new OriginalSoloObserverWorlds(runtime(),{createReceiverScene:registration=>{
  const record:RecordState={lease:undefined as unknown as OriginalSoloReceiverSceneLease,contexts:[],plans:[],backends:0,goody:0,released:0,clones:[],queries:0};record.lease=createOriginalSoloCurrentSceneLease(options(record));records.set(registration.id,record);
  return {scene:record.lease.scene,release:()=>record.lease.release(),captureCurrent:context=>{record.contexts.push(context);const result=record.lease.captureCurrent!(context);record.plans.push(result);return result;},drainOutcomes:()=>record.lease.drainOutcomes!()};
 }});
 const a=worlds.register({id:'A',name:'Alpha',eye:{x:1000,y:1000,z:1000}}),b=worlds.register({id:'B',name:'Bravo',eye:{x:2000,y:1000,z:1000}});a.weapon='rifle';b.weapon='pistol';a.health.canonical=1000;b.health.canonical=1000;
 const physical=(n:number)=>{const time=n/30;worlds.physics(time,{skipIds:new Set(worlds.worlds.keys())});for(const w of worlds.worlds.values())if(w.alive)worlds.goody(w.id);return time;};
 // Forced final projectile callbacks create actual coordinator provenance;
 // skipIds and declared query/plane inputs prove no native fuse/contact timing.
 const detonate=()=>{const result=worlds.launch({ownerId:'A',weapon:'rpg',eye:originalPlayerEye(a.body),direction:{x:1,y:0,z:0}},0);if(!result.ok)throw Error(result.reason);const time=physical(1);worlds.completeGoody(time);for(const w of worlds.worlds.values())for(const p of w.projectiles.values())p.state.remainingCallbacks=1;worlds.actors(time);expect(a.blasts.size).toBe(1);return result.launch;};
 const freeze=()=>[...worlds.worlds].map(([id,w])=>({id,health:{...w.health},callback:w.callback,tick:w.receiptTick,clock:w.mirror.debugState(),poses:w.mirror.freeze(),blasts:[...w.blasts].map(([key,v])=>({key,time:v.state.remainingCallbacks}))}));
 return {worlds,a,b,records,flags,options,physical,detonate,freeze};
}
function claims(plan:void|OriginalSoloCurrentCaptureResult){if(!plan)throw Error('producer must return a capture plan');return plan.blastClaims;}

describe('real lazy solo CURRENT producer (explicit CPU backends, no native scene-completeness claim)',()=>{
 it('forwards the actual staged ownership audit through producer, CURRENT and Controller inventory readers',()=>{
  const f=fixture(),record=f.records.get('A')!;record.registries=[];f.detonate();
  const audits=record.registries;expect(audits.length).toBeGreaterThan(0);expect(audits[0].prefix).toEqual({kind:'receipt',sceneGeneration:1,callback:0,tick:0});expect(audits[0].expectedHandles).toEqual([]);
  const bound=audits.find(value=>value.actors.some(actor=>actor.actorId==='B'));expect(bound).toBeDefined();expect(bound!.prefix?.callback).toBe(1);
  for(const audit of audits){validateOriginalReceiverActorRegistrySnapshot(audit);expect(new Set(audit.expectedHandles)).toEqual(new Set(audit.models.map(model=>model.handle)));expect(Object.isFrozen(audit.models)).toBe(true);}
  const time=f.physical(2);f.worlds.completeGoody(time);f.worlds.actors(time);expect(audits[0].expectedHandles).toEqual([]);expect(f.a.health.canonical).toBe(995);f.worlds.clear();
 });

 it('rejects begin before capture and lazily admits actual fresh blasts at receipt before the first five-point callback',()=>{
  const f=fixture(),record=f.records.get('A')!;expect(()=>record.lease.scene.begin()).toThrow();expect(record.backends).toBe(0);f.detonate();expect(record.backends).toBe(1);const time=f.physical(2);f.worlds.completeGoody(time);const claim=claims(record.plans.at(-1))[0];
  expect(claim.blast).toBe([...f.a.blasts.values()][0]);expect(claim.birthPrefix).toEqual({sceneGeneration:1,kind:'receipt',callback:1,tick:1});expect(claim.effectId.length).toBeGreaterThan(0);expect(record.clones).toHaveLength(1);expect(record.clones[0].width).toBe(50*runtime().scale);expect(f.a.health).toEqual({canonical:995,flick:2});f.worlds.actors(time);expect(f.a.health.canonical).toBe(995);
 });
 it('reuses IDs and armed plans after later receiver failure without rebuilding resources or resolving goody again',()=>{
  const f=fixture();f.detonate();const time=f.physical(2),before=f.freeze(),fail=vi.spyOn(f.b.mirror,'prepareSynchronousDelivery').mockImplementationOnce(()=>{throw Error('later producer receiver failed');});expect(()=>f.worlds.completeGoody(time)).toThrow('later producer receiver failed');expect(f.freeze()).toEqual(before);
  const record=f.records.get('A')!,plan=record.plans.at(-1),calls=record.goody,backends=record.backends;fail.mockRestore();f.worlds.completeGoody(time);expect(record.plans.at(-1)).toBe(plan);expect(record.goody).toBe(calls);expect(record.backends).toBe(backends);expect(record.clones).toHaveLength(2);expect(record.clones[1].name).toBe(record.clones[0].name);f.worlds.actors(time);expect(f.a.health.canonical).toBe(995);
 });
 it('rejects changed watched payload during an otherwise identical retry',()=>{
  const f=fixture();f.detonate();const time=f.physical(2),fail=vi.spyOn(f.b.mirror,'prepareSynchronousDelivery').mockImplementationOnce(()=>{throw Error('hold producer plan');});expect(()=>f.worlds.completeGoody(time)).toThrow('hold producer plan');fail.mockRestore();[...f.a.blasts.values()][0].state.position.x+=1;const before=f.freeze();expect(()=>f.worlds.completeGoody(time)).toThrow();expect(f.freeze()).toEqual(before);
 });
 it('rejects midphysics, missing-goody and lagging where keys without inventing history',()=>{
  const f=fixture();f.detonate();const record=f.records.get('A')!,base={...record.contexts[0],actorNames:f.a.actorNames,physicalCallback:2,mirrorCallback:1,receiptTick:1,time:2/30,order:{receiptCallbacks:1,callbacks:2}},calls=record.goody;
  for(const changed of [{afterGoody:false},{phase:'idle' as const},{physicalCallback:5,mirrorCallback:1,order:{receiptCallbacks:1,callbacks:2}}])expect(()=>record.lease.captureCurrent!({...base,...changed})).toThrow();expect(record.goody).toBe(calls);
 });
 it('preserves sticky claims on a same-callback death receipt without additional health or lifetime advancement',()=>{
  const f=fixture();f.detonate();const time=f.physical(2);f.worlds.completeGoody(time);f.worlds.actors(time);const record=f.records.get('A')!,claim=claims(record.plans.at(-1))[0];f.worlds.dispose('B');expect(claims(record.plans.at(-1))[0].effectId).toBe(claim.effectId);expect(claims(record.plans.at(-1))[0].birthPrefix).toEqual(claim.birthPrefix);expect(f.a.callback).toBe(2);expect(f.a.receiptTick).toBe(3);expect(f.a.health.canonical).toBe(995);expect(claim.blast.state.remainingCallbacks).toBe(15);
 });
 it('preserves mandatory missing inventory, rejects before query, and commits no damage or ownership until a valid retry',()=>{
  const f=fixture();f.detonate();const time=f.physical(2),before=f.freeze(),record=f.records.get('A')!,queries=record.queries;f.flags.missing=true;expect(()=>f.worlds.completeGoody(time)).toThrow('Incomplete receiver external scene');expect(f.freeze()).toEqual(before);expect(record.queries).toBe(queries);const plan=record.plans.at(-1);f.flags.missing=false;f.worlds.completeGoody(time);expect(record.plans.at(-1)).toBe(plan);f.worlds.actors(time);expect(f.a.health.canonical).toBe(995);
 });
 it('keeps per-life backend resources private and releases initialized lives once, including clear/re-register',()=>{
  const f=fixture();f.detonate();const first=f.records.get('A')!,second=f.records.get('B')!;expect(first.lease.scene).not.toBe(second.lease.scene);expect(first.backends).toBe(1);expect(second.backends).toBe(1);f.worlds.clear();first.lease.release();second.lease.release();expect(first.released).toBe(1);expect(second.released).toBe(1);
  f.worlds.register({id:'A',name:'NewAlpha',eye:{x:1000,y:1000,z:1000}});const next=f.records.get('A')!;expect(next.lease.scene).not.toBe(first.lease.scene);expect(next.backends).toBe(0);expect(()=>first.lease.scene.begin()).toThrow();f.worlds.clear();expect(next.released).toBe(0);
 });
 it('rejects oversized blast/projectile maps before iteration or partial backend initialization',()=>{
  for(const field of ['blasts','projectiles'] as const){const f=fixture(),launch=f.detonate(),base={...f.records.get('A')!.contexts[0],actorNames:f.a.actorNames,physicalCallback:2,mirrorCallback:1,receiptTick:1,time:2/30,order:{receiptCallbacks:1,callbacks:2}};let reads=0;
   if(field==='blasts'){const blast=[...f.a.blasts.values()][0];for(let i=0;i<9;i++)f.a.blasts.set(`oversized-${i}`,blast);}else{const projectile={launch,state:createOriginalProjectile('rpg',originalPlayerEye(f.a.body),{x:1,y:0,z:0},'A')};for(let i=0;i<9;i++)f.a.projectiles.set(`oversized-${i}`,projectile);}
   const map=f.a[field];for(const key of [Symbol.iterator,'values','entries'])Object.defineProperty(map,key,{configurable:true,get:()=>{reads++;throw Error('oversized map must not be iterated');}});
   const record:RecordState={lease:undefined as unknown as OriginalSoloReceiverSceneLease,contexts:[],plans:[],backends:0,goody:0,released:0,clones:[],queries:0};record.lease=createOriginalSoloCurrentSceneLease(f.options(record));expect(()=>record.lease.captureCurrent!(base)).toThrow(/budget/);expect(reads).toBe(0);expect(record.backends).toBe(0);record.lease.release();
  }
 });
 it('admits no FX or claim from manual, foreign, replaced or retired blast objects exposed through the live lookup',()=>{
  for(const mode of ['manual','foreign','replaced','retired'] as const){const f=fixture();f.detonate();const [id,blast]=[...f.a.blasts][0],lookup=f.records.get('A')!.contexts[0].detonationFor;expect(lookup(blast)?.physicalCallback).toBe(1);expect(Object.isFrozen(lookup(blast))).toBe(true);
   const foreign=[...f.b.blasts.values()][0],replacement={launch:blast.launch,state:structuredClone(blast.state)};expect(lookup(foreign)).toBeUndefined();expect(lookup(replacement)).toBeUndefined();
   if(mode==='retired')f.a.blasts.delete(id);else f.a.blasts.set(id,mode==='foreign'?foreign:replacement);expect(lookup(blast)).toBeUndefined();const time=f.physical(2);f.worlds.completeGoody(time);expect(claims(f.records.get('A')!.plans.at(-1))).toEqual([]);expect(f.records.get('A')!.clones).toEqual([]);expect(f.a.health.canonical).toBe(1000);
  }
 });
 it('requires caller-supplied live goody and matching explicit weapon before creating private resources',()=>{
  const f=fixture();f.detonate();const base={...f.records.get('A')!.contexts[0],actorNames:f.a.actorNames,physicalCallback:2,mirrorCallback:1,receiptTick:1,time:2/30,order:{receiptCallbacks:1,callbacks:2}};
  for(const kind of ['null','mismatch'] as const){const record:RecordState={lease:undefined as unknown as OriginalSoloReceiverSceneLease,contexts:[],plans:[],backends:0,goody:0,released:0,clones:[],queries:0};record.lease=createOriginalSoloCurrentSceneLease({...f.options(record),goodyAt:()=>kind==='null'?null:{eyePosition:originalPlayerEye(f.a.body),modelPosition:originalPlayerEye(f.a.body),bspWorld:50*runtime().scale,weapon:'pistol'}});expect(()=>record.lease.captureCurrent!(base)).toThrow('explicit goody');expect(record.backends).toBe(0);record.lease.release();}
 });
 it('cleans failed lazy initialization once and leaves no usable half-bound scene',()=>{
  const f=fixture();f.detonate();const base={...f.records.get('A')!.contexts[0],actorNames:f.a.actorNames,physicalCallback:2,mirrorCallback:1,receiptTick:1,time:2/30,order:{receiptCallbacks:1,callbacks:2}},record:RecordState={lease:undefined as unknown as OriginalSoloReceiverSceneLease,contexts:[],plans:[],backends:0,goody:0,released:0,clones:[],queries:0},options=f.options(record);
  record.lease=createOriginalSoloCurrentSceneLease({...options,createBackends:binding=>{const resources=options.createBackends(binding);Reflect.deleteProperty(resources,'transient');return resources;}});expect(()=>record.lease.captureCurrent!(base)).toThrow();expect(record.backends).toBe(1);expect(record.released).toBe(1);expect(()=>record.lease.scene.begin()).toThrow();expect(()=>record.lease.captureCurrent!(base)).toThrow();expect(()=>record.lease.drainOutcomes!()).toThrow();record.lease.release();expect(record.released).toBe(1);expect(record.backends).toBe(1);
 });
 it('accepts multiple successful callback captures despite coordinator actor-name map replacement',()=>{
  const f=fixture();f.detonate();const record=f.records.get('A')!;let firstId:string|undefined;const names=[];
  for(let n=2;n<=5;n++){const time=f.physical(n);f.worlds.completeGoody(time);names.push(record.contexts.at(-1)!.actorNames);const claim=claims(record.plans.at(-1))[0];firstId??=claim.effectId;expect(claim.effectId).toBe(firstId);expect(claim.birthPrefix).toEqual({sceneGeneration:1,kind:'receipt',callback:1,tick:1});f.worlds.actors(time);}
  expect(new Set(names).size).toBe(4);expect(record.backends).toBe(1);expect(record.clones).toHaveLength(1);expect(f.a.health.canonical).toBe(980);
 });
 it('makes rollback then commit/publish harmless and retains the same armed plan for a later successful transaction',()=>{
  const f=fixture();f.detonate();const time=f.physical(2),fail=vi.spyOn(f.b.mirror,'prepareSynchronousDelivery').mockImplementationOnce(()=>{throw Error('retain terminal test plan');});expect(()=>f.worlds.completeGoody(time)).toThrow('retain terminal test plan');fail.mockRestore();const record=f.records.get('A')!,base=record.contexts.at(-1)!,plan=record.plans.at(-1);
  // No cached publisher exists here: commit after this rollback must not try
  // preparing the closed underlying controller/environment transaction.
  const unopened=record.lease.scene.begin();unopened.rollback();expect(()=>{unopened.commit();unopened.rollback();}).not.toThrow();
  const staged=record.lease.scene.begin();staged.applyExternalReceipt(1,1);staged.advanceExternalCallback(2);const publish=staged.prepareCommit();staged.rollback();expect(()=>{staged.commit();publish();staged.rollback();}).not.toThrow();expect(f.a.health.canonical).toBe(1000);expect(record.lease.captureCurrent!(base)).toBe(plan);
  f.worlds.completeGoody(time);expect(f.a.health.canonical).toBe(995);f.worlds.actors(time);expect(f.a.health.canonical).toBe(995);f.worlds.clear();
 });
 it('forces complete coverage even when caller disables it, on a real deferred death/drop query',()=>{
  const f=fixture(),first=f.physical(1);f.worlds.completeGoody(first);f.worlds.actors(first);expect(f.a.mirror.freeze().find(p=>p.id==='B')?.alive).toBe(true);f.worlds.dispose('B');expect(f.a.mirror.freeze().find(p=>p.id==='B')?.alive).toBe(false);
  const record=f.records.get('A')!,time=f.physical(2),before=f.freeze(),queries=record.queries;f.flags.partialQuery=true;expect(()=>f.worlds.completeGoody(time)).toThrow('Incomplete receiver scene query');expect(record.queries).toBeGreaterThan(queries);expect(f.freeze()).toEqual(before);
 });
});
