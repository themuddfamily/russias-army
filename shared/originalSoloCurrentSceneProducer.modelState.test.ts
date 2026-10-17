import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {createOriginalSoloCurrentSceneLease,type OriginalSoloCurrentSceneProducerOptions} from './originalSoloCurrentSceneProducer';
import {OriginalSoloObserverWorlds,type OriginalSoloEvent} from './originalSoloObserverWorld';
import {registerOriginalMapRuntime,type OriginalMapRuntime} from './originalMapRuntime';
import {originalPlayerEye} from './originalPlayerPhysics';
import {validateOriginalReceiverActorRegistrySnapshot} from './originalReceiverActorRegistry';
import type {ReceiverModelPose} from './originalReceiverModelWorld';

let decoded:OriginalMapRuntime|undefined;
const runtime=()=>decoded??(decoded=registerOriginalMapRuntime('woodlands',JSON.parse(readFileSync(new URL('../public/assets/original-scenes/woodland/scene.json',import.meta.url),'utf8'))));
type Journal={maxEntries:number;maxTextChars:number};
function fixture(journal?:Journal){
 const events:OriginalSoloEvent[]=[],counts={backends:0,releases:0},pose:ReceiverModelPose={position:{x:0,y:0,z:0},yaw:0,phase:0,scale:1,rotation:{x:0,y:0,z:0,w:1}};
 const options=():OriginalSoloCurrentSceneProducerOptions=>({sourceScale:runtime().scale,maxCapturedBlasts:8,maxCapturedProjectiles:8,
  environment:{maxCommands:16,maxOutcomes:16,maxModels:128,maxTextChars:65536},
  controller:{model:{eyeHeight:runtime().profile.eyeHeight,goodyBspWorld:50*runtime().scale,maxModels:128,maxPickups:32,...(journal?{lifecycleJournal:journal}:{})},transient:{maxModels:32,maxActors:32,maxShaders:32},maxEffects:64},
  createBackends:()=>{counts.backends++;return {model:{cloneGI:()=>({pose,geometryProvenance:'declared-GI'}),cloneGun:()=>({pose,geometryProvenance:'declared-gun'}),heldGunPose:()=>pose,sphere:()=>({bspWorld:1,provenance:'declared-resource'}),reparentGunMembership:inWorld=>inWorld,dropYaw:()=>0,
   nearestDetailedDownward:()=>({hit:null,coverage:{complete:true,missing:[],provenance:'declared-empty-CPU-oracle'}})},
   transient:{clonePlane:()=>({pose,geometryProvenance:'declared-plane',inWorld:true}),cloneMuzzle:()=>({pose,geometryProvenance:'declared-muzzle',inWorld:true}),pointAt:()=>({x:0,y:0,z:0,w:1}),selfRotate:q=>q},release:()=>{counts.releases++;}};},
  goodyAt:context=>context.alive?{eyePosition:originalPlayerEye(context.body),modelPosition:originalPlayerEye(context.body),bspWorld:50*runtime().scale,weapon:context.weapon!}:null,
  // Explicit empty CPU inventory/oracle fixture; it proves forwarding and
  // publication, not complete native geometry or default model membership.
  snapshotAt:prefix=>({prefix,models:[],missing:[],provenance:'declared-empty-producer-inventory'})});
 const worlds=new OriginalSoloObserverWorlds(runtime(),{presentationLifecycle:true,onEvent:event=>events.push(event),createReceiverScene:()=>createOriginalSoloCurrentSceneLease(options())});
 const a=worlds.register({id:'A',name:'Alpha',eye:{x:1000,y:1000,z:1000}}),b=worlds.register({id:'B',name:'Bravo',eye:{x:2000,y:1000,z:1000}});a.weapon='rifle';b.weapon='pistol';
 const physical=(n:number)=>{const time=n/30;worlds.physics(time,{skipIds:new Set(worlds.worlds.keys())});for(const world of worlds.worlds.values())if(world.alive)worlds.goody(world.id);return time;};
 const cycle=(n:number)=>{const time=physical(n);worlds.completeGoody(time);worlds.actors(time);};
 return {worlds,a,b,events,counts,options,physical,cycle};
}

describe('explicit producer lifecycle journal forwarding to real controller/model publications',()=>{
 it('publishes paired committed registry/journal through the actual producer and updates empty-journal final poses',()=>{
  const f=fixture({maxEntries:16,maxTextChars:65536});f.cycle(1);
  const states=f.events.filter((event):event is Extract<OriginalSoloEvent,{kind:'model-state'}>=>event.kind==='model-state'),batches=f.events.filter((event):event is Extract<OriginalSoloEvent,{kind:'model-transitions'}>=>event.kind==='model-transitions');
  expect(f.counts.backends).toBe(2);expect(states).toHaveLength(2);expect(batches).toHaveLength(2);
  for(const state of states){validateOriginalReceiverActorRegistrySnapshot(state.checkpoint);expect(state.checkpoint).toBe(f.worlds.worlds.get(state.recipientId)!.modelState);expect(state.checkpoint.prefix).toEqual({kind:'callback',sceneGeneration:1,callback:1});expect(state.checkpoint.actors).toHaveLength(1);}
  for(const batch of batches){expect(batch.transitions.map(event=>event.kind)).toEqual(['birth','gun-bound']);expect(batch.transitions.map(event=>event.prefix)).toEqual([{kind:'receipt',sceneGeneration:1,callback:0,tick:0},{kind:'callback',sceneGeneration:1,callback:1}]);}
  const previous=f.a.modelState!;f.cycle(2);expect(f.a.modelState).not.toBe(previous);expect(f.a.modelState!.callback).toBe(2);expect(f.events.filter(event=>event.kind==='model-state')).toHaveLength(4);expect(f.events.filter(event=>event.kind==='model-transitions')).toHaveLength(2);f.worlds.clear();
 });
 it('preserves the absent-option path without model-state or journal publications',()=>{
  const f=fixture();f.cycle(1);expect(f.counts.backends).toBe(2);expect(f.a.modelState).toBeUndefined();expect(f.events.some(event=>event.kind==='model-state'||event.kind==='model-transitions')).toBe(false);f.worlds.clear();
 });
 it('rejects invalid journal configuration synchronously before backend creation',()=>{
  const f=fixture();for(const lifecycleJournal of [{maxEntries:0,maxTextChars:10},{maxEntries:1.5,maxTextChars:10},{maxEntries:1,maxTextChars:NaN},{maxEntries:1,maxTextChars:0}]){
   const input=f.options();expect(()=>createOriginalSoloCurrentSceneLease({...input,controller:{...input.controller,model:{...input.controller.model,lifecycleJournal}}})).toThrow('journal');
  }expect(f.counts.backends).toBe(0);f.worlds.clear();
 });
 it('detaches the named budget scalars before callers mutate the original option record',()=>{
  const journal={maxEntries:16,maxTextChars:65536},f=fixture(journal);journal.maxEntries=1;journal.maxTextChars=1;f.cycle(1);expect(f.events.filter(event=>event.kind==='model-transitions')).toHaveLength(2);f.worlds.clear();
  const tight={maxEntries:1,maxTextChars:65536},g=fixture(tight);tight.maxEntries=64;const time=g.physical(1);expect(()=>g.worlds.completeGoody(time)).toThrow('journal entry budget');expect(g.a.callback).toBe(0);expect(g.a.modelState).toBeUndefined();expect(g.events).toEqual([]);g.worlds.clear();
 });
 it('reads each known journal budget once and ignores unrelated structural payloads',()=>{
  const journal={maxEntries:16,maxTextChars:65536};let entries=0,text=0;Object.defineProperty(journal,'maxEntries',{get:()=>++entries===1?16:0});Object.defineProperty(journal,'maxTextChars',{get:()=>++text===1?65536:0});Object.defineProperty(journal,'extra',{get:()=>{throw Error('unrelated journal payload');},enumerable:true});
  const f=fixture(),input=f.options(),lease=createOriginalSoloCurrentSceneLease({...input,controller:{...input.controller,model:{...input.controller.model,lifecycleJournal:journal}}});expect(entries).toBe(1);expect(text).toBe(1);expect(f.counts.backends).toBe(0);lease.release();f.worlds.clear();
 });
});
