import {readFileSync} from 'node:fs';
import {describe,expect,it,vi} from 'vitest';
import {OriginalReceiverActorResources,type ReceiverWeaponGeometry} from './originalReceiverActorResources';
import {createOriginalReceiverActorResourceDescriptor,type ReceiverActorResourceDescriptor} from './originalReceiverActorResourceDescriptor';
import type {OriginalSoldierCollisionAssets} from './originalSoldierCollision';
import {createOriginalSoloCurrentSceneLease,type OriginalSoloCurrentSceneProducerOptions} from './originalSoloCurrentSceneProducer';
import {OriginalSoloObserverWorlds,type OriginalSoloEvent,type OriginalSoloObserver,type OriginalSoloReceiverSceneLease} from './originalSoloObserverWorld';
import {registerOriginalMapRuntime,type OriginalMapRuntime} from './originalMapRuntime';
import {originalPlayerEye} from './originalPlayerPhysics';
import type {ReceiverModelBackend,ReceiverModelPose} from './originalReceiverModelWorld';

const base=new URL('../public/assets/',import.meta.url);
const soldier:OriginalSoldierCollisionAssets={geometry:JSON.parse(readFileSync(new URL('original-soldier/geometry.json',base),'utf8')),rigMotion:JSON.parse(readFileSync(new URL('original-soldier/rig-motion.json',base),'utf8'))};
const weapons=JSON.parse(readFileSync(new URL('original-weapons/geometry.json',base),'utf8')) as ReceiverWeaponGeometry;
let saved:OriginalMapRuntime|undefined;
const runtime=()=>saved??=registerOriginalMapRuntime('woodlands',JSON.parse(readFileSync(new URL('original-scenes/woodland/scene.json',base),'utf8')));
interface RecordState {lease:OriginalSoloReceiverSceneLease;resources?:OriginalReceiverActorResources;descriptor?:ReceiverActorResourceDescriptor;created:number;released:number;queries:number;fieldReads:number;reader?:()=>ReceiverActorResourceDescriptor|undefined}
// Real decoded query resources, but an explicitly declared empty downward-hit
// CPU oracle and skipped solver bodies. Neither establishes native coverage.
function fixture(options:{descriptor?:'normal'|'absent'|'forged'|'scale';required?:boolean;journal?:boolean;onEvent?:(event:OriginalSoloEvent,worlds:OriginalSoloObserverWorlds)=>void}={}){
 const r=runtime(),records=new Map<string,RecordState>(),events:OriginalSoloEvent[]=[],drains:string[]=[];
 const worlds=new OriginalSoloObserverWorlds(r,{presentationLifecycle:true,onEvent:event=>{events.push(event);options.onEvent?.(event,worlds);},createReceiverScene:registration=>{
  const record:RecordState={lease:undefined as unknown as OriginalSoloReceiverSceneLease,created:0,released:0,queries:0,fieldReads:0};records.set(registration.id,record);
  const configuration:OriginalSoloCurrentSceneProducerOptions={sourceScale:r.scale,requireActorResources:options.required,maxCapturedBlasts:8,maxCapturedProjectiles:8,environment:{maxCommands:16,maxOutcomes:16,maxModels:64,maxTextChars:65536},controller:{model:{eyeHeight:r.profile.eyeHeight,goodyBspWorld:50*r.scale,maxModels:64,maxPickups:16,...(options.journal===false?{}:{lifecycleJournal:{maxEntries:256,maxTextChars:65536}})},transient:{maxModels:16,maxActors:16,maxShaders:16},maxEffects:32},createBackends:()=>{
   record.created++;const resources=record.resources=new OriginalReceiverActorResources(soldier,weapons,{sourceScale:r.scale,giResourceOrientation:{x:0,y:Math.sin(.23),z:0,w:Math.cos(.23)},gunScale:1,maxVertices:100000,maxFaces:100000,maxMotionKeys:100000,provenance:'actual-decoded-query-pack',sidedness:'double',...(options.descriptor==='absent'?{}:{resourceBindingId:`declared-pack:${registration.id}`})});
   record.descriptor=resources.readResourceDescriptor();
   const pose:ReceiverModelPose={position:{x:0,y:20,z:0},yaw:0,phase:77,scale:.045,rotation:{x:0,y:0,z:0,w:1}};
   const model:ReceiverModelBackend={cloneGI:()=>({pose,geometryProvenance:'actual-decoded-GI'}),cloneGun:()=>({pose:{...pose,scale:1},geometryProvenance:'actual-decoded-gun'}),heldGunPose:(gi,weapon)=>resources.heldGunPose(gi,weapon),sphere:()=>({bspWorld:2,provenance:'declared-resource'}),reparentGunMembership:()=>true,dropYaw:()=>0,nearestDetailedDownward:(_origin,models)=>{record.queries++;for(const m of models)if(m.kind==='gi'||m.kind==='gun')resources.resolve(m,m.kind==='gi'?'live-gi':'held-gun');return {hit:null,coverage:{complete:true,missing:[],provenance:'declared-empty-CPU-oracle'}};}};
   return {model,transient:{clonePlane:()=>({pose,geometryProvenance:'declared-plane',inWorld:true}),cloneMuzzle:()=>({pose,geometryProvenance:'declared-muzzle',inWorld:true}),pointAt:()=>pose.rotation!,selfRotate:q=>q},get actorResources(){record.fieldReads++;if(options.descriptor==='forged')return {...record.descriptor!};if(options.descriptor==='scale')return createOriginalReceiverActorResourceDescriptor({...record.descriptor!,sourceScale:r.scale*2});return record.descriptor;},release:()=>{record.released++;resources.dispose();}};
  },goodyAt:context=>context.alive?{eyePosition:originalPlayerEye(context.body),modelPosition:originalPlayerEye(context.body),bspWorld:50*r.scale,weapon:context.weapon!}:null,snapshotAt:prefix=>({prefix,models:[],missing:[],provenance:'declared-empty-CPU-oracle'})};
  record.lease=createOriginalSoloCurrentSceneLease(configuration);
  return {scene:record.lease.scene,captureCurrent:record.lease.captureCurrent!.bind(record.lease),drainOutcomes:()=>{drains.push(`hurt:${registration.id}`);return record.lease.drainOutcomes!();},drainLoadoutIntents:()=>{drains.push(`loadout:${registration.id}`);return record.lease.drainLoadoutIntents!();},readActorResources:()=>record.reader?record.reader():record.lease.readActorResources!(),release:()=>record.lease.release()};
 }});
 const a=worlds.register({id:'A',name:'Alpha',eye:{x:1000,y:1000,z:1000}}),b=worlds.register({id:'B',name:'Bravo',eye:{x:2000,y:1000,z:1000}});a.weapon='rifle';b.weapon='pistol';
 const physical=(n:number)=>{const time=n/30;worlds.physics(time,{skipIds:new Set(worlds.worlds.keys())});for(const world of worlds.worlds.values())if(world.alive)worlds.goody(world.id);return time;};
 const cycle=(n:number)=>{const time=physical(n);worlds.completeGoody(time);worlds.actors(time);};
 const states=()=>events.flatMap(e=>e.kind==='model-state'?[e]:[]);
 return {worlds,a,b,records,events,drains,physical,cycle,states};
}

describe('actual resource descriptor delivery through the optional CURRENT producer',()=>{
 it('commits every receiver before exposing exact query metadata and drains both queues before any presentation callback',()=>{
  let inspect=()=>{};const f=fixture({required:true,onEvent:event=>{if(event.kind==='model-state')inspect();}});inspect=()=>{expect(f.drains).toEqual(['hurt:A','loadout:A','hurt:B','loadout:B']);for(const world of [f.a,f.b]){expect(world.callback).toBe(1);expect(world.actorResources).toBe(f.records.get(world.id)!.resources!.readResourceDescriptor());}};expect(f.records.get('A')!.lease.readActorResources!()).toBeUndefined();f.cycle(1);expect(f.states()).toHaveLength(2);for(const event of f.states()){const record=f.records.get(event.recipientId)!;expect(event.resources).toBe(record.descriptor);expect(event.resources!.sourceScale).toBe(runtime().scale);expect(event.resources!.giResourceOrientation).toEqual({x:0,y:Math.sin(.23),z:0,w:Math.cos(.23)});expect(record.fieldReads).toBe(1);expect(record.queries).toBeGreaterThan(0);}f.worlds.clear();
 });
 it('keeps initial metadata uncommitted on later-receiver failure, then publishes the same factory identity on retry, empty journals and death receipts',()=>{
  const f=fixture({required:true}),time=f.physical(1),spy=vi.spyOn(f.b.mirror,'prepareSynchronousDelivery').mockImplementationOnce(()=>{throw Error('later resource delivery failed');});expect(()=>f.worlds.completeGoody(time)).toThrow();const record=f.records.get('A')!,issued=record.descriptor;expect(issued).toBeDefined();expect(record.lease.readActorResources!()).toBeUndefined();expect(f.a.actorResources).toBeUndefined();expect(f.events).toEqual([]);spy.mockRestore();f.worlds.completeGoody(time);expect(record.lease.readActorResources!()).toBe(issued);f.worlds.actors(time);f.cycle(2);expect(record.created).toBe(1);expect(f.states().at(-2)!.resources).toBe(issued);expect(f.events.flatMap(e=>e.kind==='model-transitions'?[e]:[])).toHaveLength(2);f.worlds.dispose('B');expect(f.states().at(-1)!.checkpoint.prefix).toMatchObject({kind:'receipt',callback:2});expect(f.states().at(-1)!.resources).toBe(issued);f.worlds.clear();expect(()=>record.lease.readActorResources!()).toThrow('released');
 });
 it('rejects required missing, forged or wrong-scale factory descriptors before query/publication and cleans owned query resources once',()=>{
  for(const descriptor of ['absent','forged','scale'] as const){const f=fixture({descriptor,required:true}),time=f.physical(1);expect(()=>f.worlds.completeGoody(time)).toThrow();const record=f.records.get('A')!;expect(record.queries).toBe(0);expect(record.released).toBe(1);expect(f.a.callback).toBe(0);expect(f.a.actorResources).toBeUndefined();expect(f.events).toEqual([]);expect(()=>record.resources!.readResourceDescriptor()).toThrow('disposed');f.worlds.clear();expect(record.released).toBe(1);}
 });
 it('preserves optional absence and default journal-disabled event shapes',()=>{
  const f=fixture({descriptor:'absent'});f.cycle(1);expect(f.a.actorResources).toBeUndefined();expect(f.states()).toHaveLength(2);expect(f.states().every(e=>!('resources' in e))).toBe(true);f.worlds.clear();const legacy=fixture({descriptor:'absent',journal:false});legacy.cycle(1);expect(legacy.states()).toEqual([]);expect(legacy.a.modelState).toBeUndefined();expect(legacy.a.actorResources).toBeUndefined();legacy.worlds.clear();
 });
 it('isolates changed, equivalent replacement, forged, oversized, disappeared or throwing metadata readers while draining every committed queue and continuing other model events',()=>{
  for(const bad of ['changed','equivalent','forged','text','missing','throw']){const f=fixture();f.cycle(1);const record=f.records.get('A')!,old=f.a.actorResources!,count=f.states().length;record.reader=()=>{if(bad==='throw')throw Error('metadata reader failed');if(bad==='missing')return undefined;if(bad==='forged')return {...old};if(bad==='text')return createOriginalReceiverActorResourceDescriptor({...old,resourceBindingId:'x'.repeat(65536)},131072);return createOriginalReceiverActorResourceDescriptor({...old,...(bad==='equivalent'?{}:{resourceBindingId:'different-instance'})});};f.drains.length=0;const time=f.physical(2);expect(()=>f.worlds.completeGoody(time)).toThrow();expect(f.a.callback).toBe(2);expect(f.b.callback).toBe(2);expect(f.a.actorResources).toBe(old);expect(f.drains).toEqual(['hurt:A','loadout:A','hurt:B','loadout:B']);expect(f.states().slice(count).map(e=>e.recipientId)).toEqual(['B']);record.reader=undefined;f.worlds.actors(time);f.cycle(3);expect(f.states().slice(count).map(e=>e.recipientId)).toEqual(['B','A','B']);expect(f.records.get('A')!.created).toBe(1);f.worlds.clear();}
 });
 it('keeps committed metadata after callback errors and freeze without replaying old transition batches',()=>{
  let fail=true;const f=fixture({onEvent:event=>{if(event.kind==='model-state'&&event.recipientId==='A'&&fail){fail=false;throw Error('presentation failure');}}}),time=f.physical(1);expect(()=>f.worlds.completeGoody(time)).toThrow();expect(f.states()).toHaveLength(2);expect(f.a.actorResources).toBe(f.records.get('A')!.descriptor);f.worlds.actors(time);f.cycle(2);expect(f.events.flatMap(e=>e.kind==='model-transitions'?[e]:[])).toHaveLength(2);f.worlds.clear();let frozen=false;const paused=fixture({onEvent:(event,worlds)=>{if(event.kind==='model-state'&&!frozen){frozen=true;worlds.freeze();}}});paused.worlds.completeGoody(paused.physical(1));expect(paused.states()).toHaveLength(2);expect(paused.b.actorResources).toBe(paused.records.get('B')!.descriptor);paused.worlds.clear();
 });
 it('does not attach stale committed resource metadata to a clear/re-register replacement with the same numeric generation',()=>{
  let replacement:OriginalSoloObserver|undefined;const f=fixture({onEvent:(event,worlds)=>{if(event.kind==='model-state'&&event.recipientId==='A'&&!replacement){worlds.clear();replacement=worlds.register({id:'A',name:'NewAlpha',eye:{x:1000,y:1000,z:1000}});}}});f.worlds.completeGoody(f.physical(1));expect(replacement).not.toBe(f.a);expect(replacement!.lifeGeneration).toBe(1);expect(replacement!.actorResources).toBeUndefined();expect(f.states()).toHaveLength(1);expect(f.records.get('A')!.created).toBe(0);f.worlds.clear();
 });
 it('poisons capture-time resource reads and fails closed without exposing speculative metadata or reallocating resources',()=>{
  const f=fixture(),record=f.records.get('A')!;
  // Induce the forbidden read from a trusted backend constructor, before the
  // first publisher can exist.
  const construct=vi.spyOn(OriginalReceiverActorResources.prototype,'readResourceDescriptor').mockImplementation(function(this:OriginalReceiverActorResources){try{record.lease.readActorResources!();}catch{/* A caught nested error still poisons the producer. */}return undefined;});
  const time=f.physical(1);expect(()=>f.worlds.completeGoody(time)).toThrow();expect(record.released).toBe(1);expect(record.lease.readActorResources).toBeDefined();expect(()=>record.lease.readActorResources!()).toThrow('released');expect(f.a.actorResources).toBeUndefined();expect(f.events).toEqual([]);construct.mockRestore();f.worlds.clear();expect(record.created).toBe(1);
 });
});
