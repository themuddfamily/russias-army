import {readFileSync} from 'node:fs';
import {describe,expect,it,vi} from 'vitest';
import {OriginalSoloObserverWorlds,type OriginalSoloEvent,type OriginalSoloReceiverCurrentContext} from './originalSoloObserverWorld';
import {OriginalReceiverCurrentEnvironment} from './originalReceiverCurrentEnvironment';
import {OriginalReceiverSceneController} from './originalReceiverSceneController';
import type {ReceiverModelBackend,ReceiverModelPose} from './originalReceiverModelWorld';
import {registerOriginalMapRuntime,type OriginalMapRuntime} from './originalMapRuntime';
import type {ReceiverCurrentHurtOutcome} from './originalReceiverCurrentEnvironment';
import type {ReceiverCurrentEnvironmentCommand} from './originalReceiverCurrentEnvironment';
import {createOriginalBlast} from './originalExplosives';

let decoded:OriginalMapRuntime|undefined;
const runtime=()=>decoded??(decoded=registerOriginalMapRuntime('woodlands',JSON.parse(readFileSync(new URL('../public/assets/original-scenes/woodland/scene.json',import.meta.url),'utf8'))));
function expectDispatchError(run:()=>void,message:string):void {let caught:unknown;try{run();}catch(error){caught=error;}expect(caught).toBeInstanceOf(AggregateError);expect((caught as AggregateError).errors.some((error:unknown)=>error instanceof Error&&error.message.includes(message))).toBe(true);}
interface LeaseRecord {environment?:OriginalReceiverCurrentEnvironment;controller?:OriginalReceiverSceneController;key?:string;commands:number;captures:OriginalSoloReceiverCurrentContext[];drains:number;released:number;oversize:boolean}
function setup(){
 const records=new Map<string,LeaseRecord>(),events:OriginalSoloEvent[]=[];let onEvent:((event:OriginalSoloEvent)=>void)|undefined;
 const worlds=new OriginalSoloObserverWorlds(runtime(),{onEvent:event=>{events.push(event);onEvent?.(event);},createReceiverScene:()=>{
  const record:LeaseRecord={commands:0,captures:[],drains:0,released:0,oversize:false};
  const pose:ReceiverModelPose={position:{x:0,y:0,z:0},yaw:0,phase:0,scale:1,rotation:{x:0,y:0,z:0,w:1}};
  const backend:ReceiverModelBackend={cloneGI:()=>({pose,geometryProvenance:'declared-GI'}),cloneGun:()=>({pose,geometryProvenance:'declared-gun'}),heldGunPose:()=>pose,sphere:()=>({bspWorld:1,provenance:'declared-resource'}),reparentGunMembership:x=>x,dropYaw:()=>0,nearestDetailedDownward:()=>({hit:null,coverage:{complete:true,missing:[],provenance:'declared-empty-grounding-oracle'}})};
  return {scene:{begin:()=>{if(!record.controller)throw Error('capture must initialize before begin');return record.controller.begin();}},release:()=>{record.released++;},captureCurrent:context=>{
   record.captures.push(context);records.set(`${context.id}:${context.lifeGeneration}`,record);
   if(!context.afterGoody&&context.deliveryKind==='where')throw Error('producer rejects incomplete goody');
   if(!record.environment){
    record.environment=new OriginalReceiverCurrentEnvironment({sceneGeneration:context.lifeGeneration,sourceScale:runtime().scale,target:context.target,barrels:context.barrels,doors:context.doors,maxCommands:8,maxOutcomes:8,maxModels:128,maxTextChars:65536,
     // Explicit closed CPU fixture oracle, not native scene coverage. Actual
     // projectiles/blasts remain exposed in capture and require a future producer.
     snapshotAt:prefix=>({prefix,models:[],missing:[],provenance:'declared-empty-solo-fixture-oracle'})});
    record.controller=new OriginalReceiverSceneController(backend,{clonePlane:()=>({pose,geometryProvenance:'declared-plane',inWorld:true}),cloneMuzzle:()=>({pose,geometryProvenance:'declared-muzzle',inWorld:true}),pointAt:()=>({x:0,y:0,z:0,w:1}),selfRotate:q=>q},record.environment,{model:{sceneGeneration:context.lifeGeneration,sourceScale:runtime().scale,eyeHeight:runtime().profile.eyeHeight,goodyBspWorld:1,maxModels:128,maxPickups:32},transient:{maxModels:64,maxActors:32,maxShaders:64},maxEffects:64});
   }
   const key=`${context.physicalCallback}:${context.mirrorCallback}:${context.receiptTick}:${context.deliveryKind}`;if(record.key===key)return;
   record.commands++;
   const commands:ReceiverCurrentEnvironmentCommand[]=context.physicalCallback===1&&context.deliveryKind==='where'?[{kind:'transient-birth',event:{kind:'bang',id:'retained-fixture-bang',type:'rocket',attackerName:'fixture-owner',position:{...context.body.position,y:context.body.position.y+runtime().profile.eyeHeight}}}]:[];
   const receipt={sceneGeneration:context.lifeGeneration,kind:'receipt' as const,callback:context.order.receiptCallbacks,tick:context.receiptTick};
   // Admit this fixture bang at the callback prefix, so its first damage step
   // belongs to the next physical callback, not the preceding receipt prefix.
   const frames=context.order.callbacks===context.order.receiptCallbacks?[{prefix:receipt,commands}]:[{prefix:receipt,commands:[]},{prefix:{sceneGeneration:context.lifeGeneration,kind:'callback' as const,callback:context.order.callbacks},commands}];
   const eye={...context.body.position,y:context.body.position.y+runtime().profile.eyeHeight};
   record.environment.arm({physicalCallback:context.physicalCallback,goody:context.alive?{bspWorld:1,modelPosition:{...context.body.position},eyePosition:eye,weapon:context.weapon??'rifle'}:null,frames});record.key=key;
  },drainOutcomes:()=>{record.drains++;const outcomes=record.environment?.drainOutcomes()??[];return record.oversize?new Array<ReceiverCurrentHurtOutcome>(257).fill({kind:'hurt',effectId:'oversized-hook-fixture',prefix:{sceneGeneration:1,kind:'callback',callback:2},position:{x:0,y:0,z:0},attackerName:null,amount:5,health:95,dead:false}):outcomes;}};
 }});
 const a=worlds.register({id:'A',name:'Alpha',eye:{x:1000,y:1000,z:1000}}),b=worlds.register({id:'B',name:'Bravo',eye:{x:2000,y:1000,z:1000}});a.weapon='rifle';b.weapon='pistol';
 const physical=(n:number)=>{const time=n/30;worlds.physics(time,{skipIds:new Set(worlds.worlds.keys())});for(const world of worlds.worlds.values())if(world.alive)worlds.goody(world.id);return time;};
 const complete=(n:number)=>{const time=physical(n);worlds.completeGoody(time);return time;};
 const cycle=(n:number)=>{const time=complete(n);worlds.actors(time);};
 const freeze=()=>({worlds:[...worlds.worlds].map(([id,w])=>({id,alive:w.alive,callback:w.callback,tick:w.receiptTick,health:{...w.health},mirror:w.mirror.debugState(),poses:w.mirror.freeze(),names:[...w.actorNames]})),controllers:[...records].map(([id,r])=>({id,state:r.controller?.debugState(),models:r.controller?.freezeModels(),publication:r.controller?.freezePublication()})),events:[...events]});
 return {worlds,a,b,records,events,physical,complete,cycle,freeze,record:(id:string)=>records.get(`${id}:1`)!,setHook:(hook:(event:OriginalSoloEvent)=>void)=>{onEvent=hook;}};
}

describe('solo CURRENT capture and outcome publication (real coordinator, declared CPU inventory)',()=>{
 it('lazily initializes each private environment before mirror acceptance with exact post-goody context',()=>{
  const f=setup();expect(f.records.size).toBe(0);f.a.yaw=.7;f.a.motionTime=123;f.a.weapon='sniper';
  const launch=f.worlds.launch({ownerId:'A',weapon:'rpg',eye:{...f.a.body.position,y:f.a.body.position.y+1},direction:{x:1,y:0,z:0}},0);if(!launch.ok)throw Error(launch.reason);
  f.a.blasts.set('explicit-private-blast',{launch:launch.launch,state:createOriginalBlast(f.a.body.position,'A','rpg')});const namesBefore=f.a.actorNames;f.complete(1);
  const context=f.record('A').captures[0];expect(context.observer).toBe(f.a);expect(context.target).toBe(f.a);expect(context.health).toBe(f.a.health);expect(context.body).toBe(f.a.body);expect(context.barrels).toBe(f.a.barrels);expect(context.projectiles).toBe(f.a.projectiles);expect(context.blasts).toBe(f.a.blasts);
  expect(context).toMatchObject({physicalCallback:1,mirrorCallback:0,receiptTick:0,phase:'physics',afterGoody:true,deliveryKind:'where',yaw:.7,motionTime:123,weapon:'sniper',order:{receiptCallbacks:0,callbacks:1}});expect(Object.isFrozen(context)).toBe(true);expect(f.a.callback).toBe(1);expect(f.record('A').controller!.debugState().fx.actors[0].time).toBe(16);
  expect(context.projectiles.size).toBe(1);expect(context.blasts.size).toBe(1);expect(context.actorNames).toBe(namesBefore);
 });
 it('assigns staged source health once and drains every committed queue before any public damage callback',()=>{
  const f=setup();f.cycle(1);let callbacks=0;f.setHook(event=>{if(event.kind!=='damaged')return;callbacks++;expect([f.a,f.b].map(w=>w.callback)).toEqual([2,2]);expect([f.a,f.b].map(w=>w.health)).toEqual([{canonical:95,flick:2},{canonical:95,flick:2}]);expect([...f.records.values()].every(r=>r.drains===2)).toBe(true);expect([...f.records.values()].map(r=>r.environment!.drainOutcomes())).toEqual([[],[]]);});
  f.complete(2);expect(callbacks).toBe(2);expect(f.events.flatMap(e=>e.kind==='damaged'?[e.damage]:[])).toEqual([5,5]);expect(f.a.health.canonical).toBe(95);
 });
 it('retains one physical capture and command set when a later receiver fails, then retries lagging mirrors',()=>{
  const f=setup();f.cycle(1);const time=f.physical(2),before=f.freeze(),fail=vi.spyOn(f.b.mirror,'prepareSynchronousDelivery').mockImplementationOnce(()=>{throw Error('later receiver failed');});
  expect(()=>f.worlds.completeGoody(time)).toThrow('later receiver failed');expect(f.freeze()).toEqual(before);expect(f.record('A').captures.at(-1)).toMatchObject({physicalCallback:2,mirrorCallback:1});const commands=[f.record('A').commands,f.record('B').commands];fail.mockRestore();
  f.worlds.completeGoody(time);expect([f.record('A').commands,f.record('B').commands]).toEqual(commands);expect([f.a,f.b].map(w=>w.health.canonical)).toEqual([95,95]);expect([f.a,f.b].map(w=>w.callback)).toEqual([2,2]);
 });
 it('delivers committed dead outcomes even after staged alive became false and disposes the exact old life',()=>{
  const f=setup();f.cycle(1);f.a.health.canonical=0;f.complete(2);expect(f.events.filter(e=>e.recipientId==='A'&&(e.kind==='damaged'||e.kind==='dead')).map(e=>e.kind)).toEqual(['damaged','dead']);expect(f.worlds.worlds.has('A')).toBe(false);expect(f.record('A').released).toBe(1);expect(f.b.health.canonical).toBe(95);
 });
 it('does not route an old death into a life re-registered by a damage callback',()=>{
  const f=setup();f.cycle(1);f.a.health.canonical=0;let replacement:ReturnType<OriginalSoloObserverWorlds['register']>|undefined;
  f.setHook(event=>{if(event.kind==='damaged'&&event.recipientId==='A'){f.worlds.clear();replacement=f.worlds.register({id:'A',name:'NewAlpha',eye:{x:1000,y:1000,z:1000}});}});f.complete(2);
  // clear resets numeric life counters: exact object identity must protect the
  // replacement even when its id and generation match the retired life.
  expect(f.worlds.worlds.get('A')).toBe(replacement);expect(replacement).not.toBe(f.a);expect(replacement?.lifeGeneration).toBe(f.a.lifeGeneration);expect(replacement?.alive).toBe(true);expect(f.events.filter(e=>e.kind==='dead'&&e.recipientId==='A')).toEqual([]);
 });
 it('continues other committed outcomes and cleanup after a public callback throws',()=>{
  const f=setup();f.cycle(1);f.a.health.canonical=0;f.b.health.canonical=0;f.setHook(event=>{if(event.kind==='damaged'&&event.recipientId==='A')throw Error('public hook failed');});
  expectDispatchError(()=>{f.complete(2);},'public hook failed');expect(f.worlds.worlds.size).toBe(0);expect(f.events.filter(e=>e.kind==='dead').map(e=>e.recipientId)).toEqual(['A','B']);expect([...f.records.values()].map(r=>r.released)).toEqual([1,1]);
 });
 it('bounds each drained hook before public event iteration',()=>{
  const f=setup();f.cycle(1);f.record('A').oversize=true;expectDispatchError(()=>{f.complete(2);},'outcome budget');expect(f.events.filter(e=>e.kind==='damaged').map(e=>e.recipientId)).toEqual(['B']);expect(f.a.callback).toBe(2);expect(f.a.health.canonical).toBe(95);
 });
 it('retains a dead owner when mirror disposal fails and permits explicit retry without replaying health or death outcomes',()=>{
  const f=setup();f.cycle(1);f.a.health.canonical=0;const prepare=f.b.mirror.prepareSynchronousDelivery.bind(f.b.mirror);let rejectDeath=true;
  const fail=vi.spyOn(f.b.mirror,'prepareSynchronousDelivery').mockImplementation((snapshot,order,now)=>{if(snapshot.deathPlayerId==='A'&&rejectDeath){rejectDeath=false;throw Error('injected-dead-delivery');}return prepare(snapshot,order,now);});
  expectDispatchError(()=>{f.complete(2);},'injected-dead-delivery');expect(f.worlds.worlds.get('A')).toBe(f.a);expect(f.a.alive).toBe(false);expect(f.record('A').released).toBe(0);const health={...f.a.health},events=f.events.filter(e=>e.recipientId==='A'&&(e.kind==='damaged'||e.kind==='dead'));
  expect(events.map(e=>e.kind)).toEqual(['damaged','dead']);f.worlds.dispose('A');expect(f.worlds.worlds.has('A')).toBe(false);expect(f.a.health).toEqual(health);expect(f.events.filter(e=>e.recipientId==='A'&&(e.kind==='damaged'||e.kind==='dead'))).toEqual(events);expect(f.record('A').released).toBe(1);fail.mockRestore();
 });
 it('refuses incomplete goody phases before creating a capture or synthesizing missing physics history',()=>{
  const f=setup();f.worlds.physics(1/30,{skipIds:new Set(f.worlds.worlds.keys())});f.worlds.goody('A');expect(()=>f.worlds.completeGoody(1/30)).toThrow('Missing solo goody phase');expect(f.records.size).toBe(0);
  f.worlds.goody('B');f.worlds.completeGoody(1/30);expect([...f.records.values()].map(r=>r.captures[0].physicalCallback)).toEqual([1,1]);
 });
 it('releases a newly owned scene when paired capture/drain hooks are malformed',()=>{
  const release=vi.fn(),worlds=new OriginalSoloObserverWorlds(runtime(),{createReceiverScene:()=>({scene:{begin:()=>{throw Error('unused');}},release,captureCurrent:()=>{}})});
  expect(()=>worlds.register({id:'A',name:'Alpha',eye:{x:1000,y:1000,z:1000}})).toThrow();expect(release).toHaveBeenCalledTimes(1);expect(worlds.worlds.size).toBe(0);
 });
 it('rejects unpaired hooks and never releases a live scene through a reused invalid lease',()=>{
  const shared={begin:()=>{throw Error('unused scene');}},release=vi.fn();let invocation=0;
  const worlds=new OriginalSoloObserverWorlds(runtime(),{createReceiverScene:()=>{invocation++;return invocation===1?{scene:shared,release}:{scene:shared,release,captureCurrent:()=>{}};}});
  worlds.register({id:'A',name:'Alpha',eye:{x:1000,y:1000,z:1000}});expect(()=>worlds.register({id:'B',name:'Bravo',eye:{x:2000,y:1000,z:1000}})).toThrow();expect(release).not.toHaveBeenCalled();expect(worlds.worlds.size).toBe(1);worlds.clear();expect(release).toHaveBeenCalledTimes(1);
 });
});
