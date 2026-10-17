import {readFileSync} from 'node:fs';
import {describe,expect,it,vi} from 'vitest';
import {createOriginalSoloCurrentSceneLease,type OriginalSoloCurrentSceneProducerOptions} from './originalSoloCurrentSceneProducer';
import {OriginalSoloObserverWorlds} from './originalSoloObserverWorld';
import {registerOriginalMapRuntime,type OriginalMapRuntime} from './originalMapRuntime';
import {originalPlayerEye} from './originalPlayerPhysics';
import {copyReceiverPickupHistory,type ReceiverPickupHistory,type ReceiverPickupHistorySource,type ReceiverPickupHistoryTransaction} from './originalReceiverPickupHistory';
import type {ReceiverScenePrefix} from './originalReceiverPrefix';
import type {ReceiverModelPose} from './originalReceiverModelWorld';

let decoded:OriginalMapRuntime|undefined;
const runtime=()=>decoded??(decoded=registerOriginalMapRuntime('woodlands',JSON.parse(readFileSync(new URL('../public/assets/original-scenes/woodland/scene.json',import.meta.url),'utf8'))));

// Declared synchronous empty-history port: these tests prove CURRENT wiring
// and assignment publication, not durable CAS, page IO or default Game use.
class EmptyHistorySource implements ReceiverPickupHistorySource {
 history:ReceiverPickupHistory;
 next:ReceiverPickupHistory;
 begins=0;publishes=0;rollbacks=0;
 prefixes:ReceiverScenePrefix[]=[];
 private active=false;
 constructor(readonly observer:string){
  this.history=copyReceiverPickupHistory({observer,lifeGeneration:1,root:{key:`${observer}-empty`,version:0,count:0,pageCount:0,highWaterId:0}});
  this.next=this.history;
 }
 plan(callback:number){
  this.next=copyReceiverPickupHistory({...this.history,root:{...this.history.root,key:`${this.observer}-callback-${callback}`,version:this.history.root.version+1}});
 }
 begin():ReceiverPickupHistoryTransaction {
  if(this.active)throw Error('Test history transaction active');
  this.active=true;this.begins++;
  const baseHistory=this.history,next=this.next,epoch={};let open=true,prepared=false;
  const check=()=>{if(!open)throw Error('Test history transaction closed');};
  return {
   baseHistory,
   assertPrefix:prefix=>{check();expect(prefix.sceneGeneration).toBe(1);this.prefixes.push(prefix);},
   readPickup:id=>{check();if(id===0)return null;throw Error('Test pickup not resident');},
   append:()=>{throw Error('Unexpected pickup append in empty CURRENT fixture');},
   remove:()=>{throw Error('Unexpected pickup removal in empty CURRENT fixture');},
   operandEpoch:()=>{check();return epoch;},
   validateEpoch:token=>{check();if(token!==epoch)throw Error('Test stale window epoch');},
   prepareHistory:()=>{check();prepared=true;return next;},
   preparePublish:()=>{check();if(!prepared)throw Error('Test history not prepared');return ()=>{if(!open)throw Error('Test history publication closed');this.history=next;this.publishes++;open=false;this.active=false;};},
   rollback:()=>{if(!open)return;open=false;this.active=false;this.rollbacks++;},
  };
 }
}

function fixture(paged=true){
 const sources=new Map<string,EmptyHistorySource>(),counts={backends:0,releases:0,sourceReads:0};
 const pose:ReceiverModelPose={position:{x:0,y:0,z:0},yaw:0,phase:0,scale:1,rotation:{x:0,y:0,z:0,w:1}};
 const options=(source:EmptyHistorySource):OriginalSoloCurrentSceneProducerOptions=>({
  sourceScale:runtime().scale,maxCapturedBlasts:8,maxCapturedProjectiles:8,
  environment:{maxCommands:16,maxOutcomes:16,maxModels:128,maxTextChars:65536},
  controller:{model:{eyeHeight:runtime().profile.eyeHeight,goodyBspWorld:50*runtime().scale,maxModels:128,maxPickups:16,lifecycleJournal:{maxEntries:16,maxTextChars:65536}},transient:{maxModels:32,maxActors:32,maxShaders:32},maxEffects:64},
  createBackends:()=>{
   counts.backends++;
   const resources:ReturnType<OriginalSoloCurrentSceneProducerOptions['createBackends']>={model:{cloneGI:()=>({pose,geometryProvenance:'declared-GI'}),cloneGun:()=>({pose,geometryProvenance:'declared-gun'}),heldGunPose:()=>pose,sphere:()=>({bspWorld:1,provenance:'declared-resource'}),reparentGunMembership:inWorld=>inWorld,dropYaw:()=>0,nearestDetailedDownward:()=>({hit:null,coverage:{complete:true,missing:[],provenance:'declared-empty-CPU-oracle'}})},
    transient:{clonePlane:()=>({pose,geometryProvenance:'declared-plane',inWorld:true}),cloneMuzzle:()=>({pose,geometryProvenance:'declared-muzzle',inWorld:true}),pointAt:()=>({x:0,y:0,z:0,w:1}),selfRotate:q=>q},
    release:()=>{counts.releases++;}};
   if(paged)Object.defineProperty(resources,'pickupHistorySource',{get:()=>{counts.sourceReads++;return source;}});
   return resources;
  },
  goodyAt:c=>c.alive?{eyePosition:originalPlayerEye(c.body),modelPosition:originalPlayerEye(c.body),bspWorld:50*runtime().scale,weapon:c.weapon!}:null,
  snapshotAt:prefix=>({prefix,models:[],missing:[],provenance:'declared-empty-producer-inventory'}),
 });
 const worlds=new OriginalSoloObserverWorlds(runtime(),{presentationLifecycle:true,createReceiverScene:r=>{
  const source=new EmptyHistorySource(r.id);sources.set(r.id,source);return createOriginalSoloCurrentSceneLease(options(source));
 }});
 const a=worlds.register({id:'A',name:'Alpha',eye:{x:1000,y:1000,z:1000}}),b=worlds.register({id:'B',name:'Bravo',eye:{x:2000,y:1000,z:1000}});a.weapon='rifle';b.weapon='pistol';
 const physical=(callback:number)=>{
  for(const source of sources.values())source.plan(callback);
  const time=callback/30;worlds.physics(time,{skipIds:new Set(worlds.worlds.keys())});for(const world of worlds.worlds.values())if(world.alive)worlds.goody(world.id);return time;
 };
 const cycle=(callback:number)=>{const time=physical(callback);worlds.completeGoody(time);worlds.actors(time);};
 return {worlds,a,b,sources,counts,physical,cycle};
}

describe('configured paged history through actual Solo CURRENT producer/controller',()=>{
 it('captures one source per backend life and publishes the prepared successor metadata on successive callbacks',()=>{
  const f=fixture();
  try{
   for(let callback=1;callback<=3;callback++){
    f.cycle(callback);
    for(const world of [f.a,f.b]){
     const source=f.sources.get(world.id)!;
     expect(source.publishes).toBe(callback);
     expect(world.modelState!.pickupHistory).toEqual(source.history);
     expect(world.modelState!.pickupHistory!.root).toEqual({key:`${world.id}-callback-${callback}`,version:callback,count:0,pageCount:0,highWaterId:0});
     expect(world.modelState!.pickups).toEqual([]);
     expect(world.modelState!.prefix).toEqual({kind:'callback',sceneGeneration:1,callback});
    }
   }
   expect(f.counts.backends).toBe(2);expect(f.counts.sourceReads).toBe(2);
   expect(f.sources.get('A')!.prefixes).toContainEqual({kind:'callback',sceneGeneration:1,callback:3});
  }finally{f.worlds.clear();}
  expect(f.counts.releases).toBe(2);
 });

 it('rolls back a prepared source when a later observer fails, then retries against the same life and base root',()=>{
  const f=fixture();let fail:{mockRestore():void}|undefined;
  try{
   const before=f.sources.get('A')!.history,time=f.physical(1);
   fail=vi.spyOn(f.b.mirror,'prepareSynchronousDelivery').mockImplementationOnce(()=>{throw Error('late paged observer');});
   expect(()=>f.worlds.completeGoody(time)).toThrow('late paged observer');fail.mockRestore();fail=undefined;
   const source=f.sources.get('A')!;
   expect(source.history).toBe(before);expect(source.publishes).toBe(0);expect(source.rollbacks).toBe(1);
   expect(f.a.callback).toBe(0);expect(f.a.receiptTick).toBe(0);expect(f.a.modelState).toBeUndefined();
   f.worlds.completeGoody(time);f.worlds.actors(time);
   expect(source.begins).toBe(2);expect(source.publishes).toBe(1);
   expect(f.a.modelState!.pickupHistory).toEqual(source.history);
   expect(f.counts.backends).toBe(2);expect(f.counts.sourceReads).toBe(2);
  }finally{fail?.mockRestore();f.worlds.clear();}
 });

 it('keeps the source-absent CURRENT path inline and never begins an optional history transaction',()=>{
  const f=fixture(false);
  try{
   f.cycle(1);f.cycle(2);
   for(const world of [f.a,f.b]){expect(world.modelState!.pickupHistory).toBeUndefined();expect(world.modelState!.pickups).toEqual([]);}
   for(const source of f.sources.values()){expect(source.begins).toBe(0);expect(source.publishes).toBe(0);}
   expect(f.counts.sourceReads).toBe(0);expect(f.counts.backends).toBe(2);
  }finally{f.worlds.clear();}
 });
});
