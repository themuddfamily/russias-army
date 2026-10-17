import {readFileSync} from 'node:fs';
import {describe,expect,it,vi} from 'vitest';
import {OriginalReceiverActorResources,type ReceiverWeaponGeometry} from './originalReceiverActorResources';
import type {OriginalSoldierCollisionAssets} from './originalSoldierCollision';
import {createOriginalSoloCurrentSceneLease} from './originalSoloCurrentSceneProducer';
import {OriginalSoloObserverWorlds,type OriginalSoloEvent,type OriginalSoloObserver,type OriginalSoloReceiverSceneLease} from './originalSoloObserverWorld';
import {registerOriginalMapRuntime,type OriginalMapRuntime} from './originalMapRuntime';
import {originalPlayerEye} from './originalPlayerPhysics';
import type {ReceiverModelBackend,ReceiverModelPose} from './originalReceiverModelWorld';

const base=new URL('../public/assets/',import.meta.url),soldier:OriginalSoldierCollisionAssets={geometry:JSON.parse(readFileSync(new URL('original-soldier/geometry.json',base),'utf8')),rigMotion:JSON.parse(readFileSync(new URL('original-soldier/rig-motion.json',base),'utf8'))},weapons=JSON.parse(readFileSync(new URL('original-weapons/geometry.json',base),'utf8')) as ReceiverWeaponGeometry;
let cached:OriginalMapRuntime|undefined;
const runtime=()=>cached??=registerOriginalMapRuntime('woodlands',JSON.parse(readFileSync(new URL('original-scenes/woodland/scene.json',base),'utf8')));
interface RecordState {lease:OriginalSoloReceiverSceneLease;query?:OriginalReceiverActorResources;created:number;released:number;badReader:boolean}
function fixture(onEvent?:(event:OriginalSoloEvent,worlds:OriginalSoloObserverWorlds)=>void,enabled=true){
 const r=runtime(),records=new Map<string,RecordState>(),events:OriginalSoloEvent[]=[],drains:string[]=[];
 const worlds=new OriginalSoloObserverWorlds(r,{presentationLifecycle:true,onEvent:event=>{events.push(event);onEvent?.(event,worlds);},createReceiverScene:registration=>{
  const record:RecordState={lease:undefined as unknown as OriginalSoloReceiverSceneLease,created:0,released:0,badReader:false};records.set(registration.id,record);
  record.lease=createOriginalSoloCurrentSceneLease({sourceScale:r.scale,requireActorResources:true,maxCapturedBlasts:8,maxCapturedProjectiles:8,environment:{maxCommands:16,maxOutcomes:16,maxModels:64,maxTextChars:65536},controller:{model:{eyeHeight:r.profile.eyeHeight,goodyBspWorld:50*r.scale,maxModels:64,maxPickups:16,lifecycleJournal:{maxEntries:256,maxTextChars:65536}},transient:{maxModels:16,maxActors:16,maxShaders:16},maxEffects:32,...(enabled?{shotJournal:{maxEntries:8,maxTextChars:65536}}:{})},createBackends:()=>{
   record.created++;const query=record.query=new OriginalReceiverActorResources(soldier,weapons,{sourceScale:r.scale,giResourceOrientation:{x:0,y:Math.sin(.23),z:0,w:Math.cos(.23)},gunScale:1,maxVertices:100000,maxFaces:100000,maxMotionKeys:100000,provenance:'actual-query-pack',sidedness:'double',resourceBindingId:`explicit-pack:${registration.id}`}),pose:ReceiverModelPose={position:{x:5,y:6,z:7},yaw:.4,phase:333.3,scale:.045,rotation:{x:Math.sin(.2),y:0,z:0,w:Math.cos(.2)}};
   const model:ReceiverModelBackend={cloneGI:()=>({pose,geometryProvenance:'actual-GI'}),cloneGun:()=>({pose:{...pose,scale:1},geometryProvenance:'actual-constructor-gun'}),heldGunPose:(gi,weapon)=>query.heldGunPose(gi,weapon),sphere:()=>({bspWorld:2,provenance:'declared-resource'}),reparentGunMembership:()=>true,dropYaw:()=>.7,nearestDetailedDownward:()=>({hit:null,coverage:{complete:true,missing:[],provenance:'declared-empty-CPU-oracle'}})};
   return {model,actorResources:query.readResourceDescriptor(),transient:{clonePlane:()=>({pose,geometryProvenance:'declared-plane',inWorld:true}),cloneMuzzle:()=>({pose,geometryProvenance:'declared-muzzle',inWorld:true}),pointAt:()=>pose.rotation!,selfRotate:q=>q},release:()=>{record.released++;query.dispose();}};
  },goodyAt:c=>c.alive?{eyePosition:originalPlayerEye(c.body),modelPosition:originalPlayerEye(c.body),bspWorld:50*r.scale,weapon:c.weapon!}:null,snapshotAt:prefix=>({prefix,models:[],missing:[],provenance:'declared-empty-CPU-oracle'})});
  return {scene:record.lease.scene,captureCurrent:record.lease.captureCurrent!.bind(record.lease),drainOutcomes:()=>{drains.push(registration.id);return record.lease.drainOutcomes!();},readActorResources:()=>{if(record.badReader)throw Error('shot resource read failed');return record.lease.readActorResources!();},release:()=>record.lease.release()};
 }});
 const a=worlds.register({id:'A',name:'Alpha',eye:{x:1000,y:1000,z:1000}}),b=worlds.register({id:'B',name:'Bravo',eye:{x:2000,y:1000,z:1000}});a.weapon='rifle';b.weapon='rifle';
 const physical=(n:number)=>{const time=n/30;worlds.physics(time,{skipIds:new Set(worlds.worlds.keys())});for(const w of worlds.worlds.values())if(w.alive)worlds.goody(w.id);return time;};
 const cycle=(n:number)=>{const time=physical(n);worlds.completeGoody(time);worlds.actors(time);};
 const report=()=>{worlds.reportShots('A',1);worlds.reportShots('B',1);};
 const batches=()=>events.flatMap(e=>e.kind==='shot-models'?[e]:[]);
 return {worlds,a,b,records,events,drains,physical,cycle,report,batches};
}

// Actual producer/Controller/mirror/committed descriptors, explicit clone poses
// and an empty CPU query oracle. No native gun defaults or renderer FX claims.
describe('committed Solo shot model delivery',()=>{
 it('delivers exact retained constructor gun captures after every recipient commits/drains and model-state, before legacy shot events',()=>{
  let inspect=()=>{};const f=fixture(event=>{if(event.kind==='shot-models')inspect();});inspect=()=>{expect(f.a.callback).toBe(1);expect(f.b.callback).toBe(1);expect(f.drains).toEqual(['A','B']);};f.report();f.cycle(1);expect(f.batches()).toHaveLength(2);for(const event of f.batches()){const world=f.worlds.worlds.get(event.recipientId)!;expect(event.resources).toBe(world.actorResources);expect(event.resources).toBe(f.records.get(event.recipientId)!.query!.readResourceDescriptor());expect(event.shots).toHaveLength(1);expect(event.shots[0]).toMatchObject({weapon:'rifle',callback:1,gun:{resource:'rpg',pose:{position:{x:5,y:6,z:7}}}});const stream=f.events.filter(e=>e.recipientId===event.recipientId);expect(stream.findIndex(e=>e.kind==='model-state')).toBeLessThan(stream.indexOf(event));expect(stream.indexOf(event)).toBeLessThan(stream.findIndex(e=>e.kind==='shot'));expect(Object.isFrozen(event.shots[0].gun.pose.position)).toBe(true);}expect(f.events.filter(e=>e.kind==='shot')).toHaveLength(2);f.worlds.clear();
 });
 it('publishes no speculative capture after a later receiver failure and retries the same handles/factory once without replay on death receipt',()=>{
  const f=fixture();f.report();const time=f.physical(1),spy=vi.spyOn(f.b.mirror,'prepareSynchronousDelivery').mockImplementationOnce(()=>{throw Error('later shot receiver failed');});expect(()=>f.worlds.completeGoody(time)).toThrow();expect(f.events).toEqual([]);expect(f.a.callback).toBe(0);expect(f.records.get('A')!.lease.readActorResources!()).toBeUndefined();spy.mockRestore();f.worlds.completeGoody(time);expect(f.batches()).toHaveLength(2);expect(f.batches()[0].shots[0].gunHandle).toContain('baddy1');expect(f.records.get('A')!.created).toBe(1);f.worlds.actors(time);f.worlds.dispose('B');expect(f.batches()).toHaveLength(2);f.worlds.clear();
 });
 it('rejects foreign-life, missing, extra or mismatched admitted shot captures before any recipient publishes, then accepts exact retry',()=>{
  for(const invalid of ['life','missing','extra','actor']){const f=fixture();f.report();const original=f.b.mirror.prepareSynchronousDelivery.bind(f.b.mirror),spy=vi.spyOn(f.b.mirror,'prepareSynchronousDelivery').mockImplementation((...args)=>{const stage=original(...args);if(!stage.ok)return stage;const shots=stage.result.shotModels!,shot=shots[0],next=invalid==='missing'?[]:invalid==='extra'?[shot,shot]:invalid==='actor'?[{...shot,actorId:'different-actor'}]:[{...shot,prefix:{...shot.prefix,sceneGeneration:2}}];return {...stage,result:{...stage.result,shotModels:next}};});const time=f.physical(1);expect(()=>f.worlds.completeGoody(time)).toThrow();expect(f.a.callback).toBe(0);expect(f.b.callback).toBe(0);expect(f.events).toEqual([]);spy.mockRestore();f.worlds.completeGoody(time);expect(f.batches()).toHaveLength(2);f.worlds.clear();}
 });
 it('suppresses only the failed-resource recipient capture while independently draining and delivering other committed shot/audio streams',()=>{
  const f=fixture();f.cycle(1);f.records.get('A')!.badReader=true;f.drains.length=0;f.report();const time=f.physical(2);expect(()=>f.worlds.completeGoody(time)).toThrow();expect(f.drains).toEqual(['A','B']);expect(f.a.callback).toBe(2);expect(f.b.callback).toBe(2);expect(f.batches().map(e=>e.recipientId)).toEqual(['B']);expect(f.events.filter(e=>e.kind==='shot')).toHaveLength(2);f.records.get('A')!.badReader=false;f.worlds.actors(time);f.cycle(3);expect(f.batches()).toHaveLength(1);f.worlds.clear();
 });
 it('continues every committed batch after a presentation callback error and does not replay it next callback',()=>{
  let fail=true;const f=fixture(event=>{if(event.kind==='shot-models'&&fail){fail=false;throw Error('shot model presentation failed');}});f.report();const time=f.physical(1);expect(()=>f.worlds.completeGoody(time)).toThrow();expect(f.batches()).toHaveLength(2);expect(f.events.filter(e=>e.kind==='shot')).toHaveLength(2);f.worlds.actors(time);f.cycle(2);expect(f.batches()).toHaveLength(2);expect(f.a.callback).toBe(2);f.worlds.clear();
 });
 it('retains already committed capture delivery after freeze without adding duplicate shot/audio events',()=>{
  let frozen=false;const f=fixture((event,worlds)=>{if(event.kind==='shot-models'&&!frozen){frozen=true;worlds.freeze();}});f.report();f.worlds.completeGoody(f.physical(1));expect(f.batches()).toHaveLength(2);expect(f.events.filter(e=>e.kind==='shot')).toHaveLength(2);expect(f.b.actorResources).toBe(f.records.get('B')!.query!.readResourceDescriptor());f.worlds.clear();
 });
 it('uses exact life-object gates after clear/re-register rather than replaying remaining captures into same-generation replacements',()=>{
  let replacement:OriginalSoloObserver|undefined;const f=fixture((event,worlds)=>{if(event.kind==='shot-models'&&!replacement){worlds.clear();replacement=worlds.register({id:'A',name:'NewAlpha',eye:{x:1000,y:1000,z:1000}});}});f.report();f.worlds.completeGoody(f.physical(1));expect(replacement).not.toBe(f.a);expect(replacement!.lifeGeneration).toBe(1);expect(replacement!.actorResources).toBeUndefined();expect(f.batches()).toHaveLength(1);expect(f.events.filter(e=>e.kind==='shot')).toEqual([]);f.worlds.clear();
 });
 it('keeps journal-disabled deliveries free of shot-model events while preserving the existing shot stream',()=>{
  const f=fixture(undefined,false);f.report();f.cycle(1);expect(f.batches()).toEqual([]);expect(f.events.filter(e=>e.kind==='shot')).toHaveLength(2);expect(f.a.actorResources).toBeDefined();f.worlds.clear();
 });
});
