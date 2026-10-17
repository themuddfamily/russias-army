import {readFileSync} from 'node:fs';
import {describe,expect,it,vi} from 'vitest';
import {OriginalSoloObserverWorlds,type OriginalSoloEvent,type OriginalSoloObserver} from './originalSoloObserverWorld';
import {OriginalReceiverModelWorld,type ReceiverModelBackend,type ReceiverModelTransition} from './originalReceiverModelWorld';
import {registerOriginalMapRuntime,type OriginalMapRuntime} from './originalMapRuntime';

let cached:OriginalMapRuntime|undefined;
const runtime=()=>cached??=registerOriginalMapRuntime('woodlands',JSON.parse(readFileSync(new URL('../public/assets/original-scenes/woodland/scene.json',import.meta.url),'utf8')));
// Actual ledgers and coordinator, with explicit empty CPU query coverage.
// skipIds excludes solver work; no native map/actor/render equivalence is claimed.
function fixture(onEvent?:(event:OriginalSoloEvent,worlds:OriginalSoloObserverWorlds)=>void,journal=true){
 const ledgers=new Map<string,OriginalReceiverModelWorld>(),events:OriginalSoloEvent[]=[],releases=new Map<string,number>(),r=runtime();
 const pose={position:{x:0,y:20,z:0},yaw:0,phase:77,scale:1};
 const backend:ReceiverModelBackend={cloneGI:()=>({pose,geometryProvenance:'declared-GI'}),cloneGun:()=>({pose,geometryProvenance:'declared-gun'}),heldGunPose:gi=>gi.pose,sphere:()=>({bspWorld:2,provenance:'declared-resource'}),reparentGunMembership:()=>true,dropYaw:()=>0,nearestDetailedDownward:()=>({hit:null,coverage:{complete:true,missing:[],provenance:'declared-empty-CPU-oracle'}})};
 const worlds=new OriginalSoloObserverWorlds(r,{presentationLifecycle:true,onEvent:event=>{events.push(event);onEvent?.(event,worlds);},createReceiverScene:registration=>{
  const scene=new OriginalReceiverModelWorld(backend,{sceneGeneration:registration.lifeGeneration,sourceScale:r.scale,eyeHeight:r.profile.eyeHeight,goodyBspWorld:50*r.scale,maxModels:32,maxPickups:16,...(journal?{lifecycleJournal:{maxEntries:256,maxTextChars:65536}}:{})},{snapshotAt:prefix=>({prefix,models:[],missing:[],provenance:'declared-empty-CPU-oracle'})});ledgers.set(registration.id,scene);
  return {scene,release:()=>releases.set(registration.id,(releases.get(registration.id)??0)+1)};
 }});
 const a=worlds.register({id:'A',name:'Alpha',eye:{x:1000,y:1000,z:1000}}),b=worlds.register({id:'B',name:'Bravo',eye:{x:2000,y:1000,z:1000}});a.weapon='rifle';b.weapon='pistol';
 const physical=(n:number)=>{const time=n/30;worlds.physics(time,{skipIds:new Set(worlds.worlds.keys())});for(const world of worlds.worlds.values())if(world.alive)worlds.goody(world.id);return time;};
 const cycle=(n:number)=>{const time=physical(n);worlds.completeGoody(time);worlds.actors(time);};
 const batches=()=>events.flatMap(e=>e.kind==='model-transitions'?[e]:[]);
 return {worlds,a,b,events,ledgers,releases,physical,cycle,batches};
}

describe('coordinator staged model-transition publication without CURRENT hooks',()=>{
 it('issues exact frozen fade constructor identities with logical eye positions after committed model events',()=>{
  const f=fixture();try{
   f.cycle(1);f.worlds.dispose('B');expect(f.events.some(e=>e.kind==='fade-born')).toBe(false);f.cycle(2);
   const events=f.events.filter((e):e is Extract<OriginalSoloEvent,{kind:'fade-born'}>=>e.kind==='fade-born');expect(events).toHaveLength(1);
   const event=events[0],batch=f.batches().at(-1)!,detach=batch.transitions.find(t=>t.kind==='detach')!;
   expect(event.transition).toBe(detach);expect(f.a.fadeBirths).toEqual([event]);expect(f.a.fadeBirths![0]).toBe(event);expect(Object.isFrozen(event)).toBe(true);expect(Object.isFrozen(f.a.fadeBirths)).toBe(true);
   expect(event.transition.fadePositionWorld.x).toBe(event.transition.pickup.position.x);expect(event.transition.fadePositionWorld.y).toBeCloseTo(event.transition.pickup.position.y+1,12);
   expect(event.transition.fadePositionWorld.z).toBe(event.transition.pickup.position.z);expect(Object.isFrozen(event.transition.fadePositionWorld)).toBe(true);
   expect(f.events.indexOf(batch)).toBeLessThan(f.events.indexOf(event));f.cycle(3);expect(f.events.filter(e=>e.kind==='fade-born')).toHaveLength(1);expect(f.a.fadeBirths).toEqual([]);
  }finally{f.worlds.clear();}
 });
 it('suppresses speculative fade births on a later recipient failure and retries exactly once',()=>{
  const f=fixture();let fail:{mockRestore():void}|undefined;try{
   const c=f.worlds.register({id:'C',name:'Charlie',eye:{x:3000,y:1000,z:1000}});c.weapon='launcher';f.cycle(1);f.worlds.dispose('B');
   const old=f.a.fadeBirths,time=f.physical(2);fail=vi.spyOn(c.mirror,'prepareSynchronousDelivery').mockImplementationOnce(()=>{throw Error('late fade receiver');});
   expect(()=>f.worlds.completeGoody(time)).toThrow('late fade receiver');fail.mockRestore();fail=undefined;
   expect(f.events.filter(e=>e.kind==='fade-born')).toEqual([]);expect(f.a.fadeBirths).toBe(old);expect(f.ledgers.get('A')!.freezePickups()).toEqual([]);
   f.worlds.completeGoody(time);f.worlds.actors(time);expect(f.events.filter(e=>e.kind==='fade-born').map(e=>e.recipientId)).toEqual(['A','C']);
   f.cycle(3);expect(f.events.filter(e=>e.kind==='fade-born')).toHaveLength(2);
  }finally{fail?.mockRestore();f.worlds.clear();}
 });
 it('continues committed fade recipients after a sound sink error without replaying events',()=>{
  const f=fixture(event=>{if(event.kind==='fade-born'&&event.recipientId==='A')throw Error('fade sound sink');});try{
   const c=f.worlds.register({id:'C',name:'Charlie',eye:{x:3000,y:1000,z:1000}});c.weapon='launcher';f.cycle(1);f.worlds.dispose('B');const time=f.physical(2);
   expect(()=>f.worlds.completeGoody(time)).toThrow();const issued=f.events.filter(e=>e.kind==='fade-born');expect(issued.map(e=>e.recipientId)).toEqual(['A','C']);
   expect(f.a.fadeBirths![0]).toBe(issued[0]);expect(c.fadeBirths![0]).toBe(issued[1]);expect(f.ledgers.get('A')!.freezePickups()).toHaveLength(1);
   f.worlds.actors(time);f.cycle(3);expect(f.events.filter(e=>e.kind==='fade-born')).toHaveLength(2);
  }finally{f.worlds.clear();}
 });
 it('delivers committed fade sounds after freeze but invalidates remaining recipients after clear',()=>{
  for(const clear of [false,true]){
   const f=fixture((event,worlds)=>{if(event.kind==='fade-born'&&event.recipientId==='A'){if(clear)worlds.clear();else worlds.freeze();}});try{
    const c=f.worlds.register({id:'C',name:'Charlie',eye:{x:3000,y:1000,z:1000}});c.weapon='launcher';f.cycle(1);f.worlds.dispose('B');f.worlds.completeGoody(f.physical(2));
    expect(f.events.filter(e=>e.kind==='fade-born').map(e=>e.recipientId)).toEqual(clear?['A']:['A','C']);
   }finally{f.worlds.clear();}
  }
 });
 it('commits every receiver before the first batch callback and prepends exact birth/binding labels before legacy intents',()=>{
  let inspect=()=>{};const f=fixture(event=>{if(event.kind==='model-transitions')inspect();});inspect=()=>{for(const world of [f.a,f.b]){expect(world.callback).toBe(1);expect(world.receiptTick).toBe(1);expect(f.ledgers.get(world.id)!.freezeActorRegistry().actors).toHaveLength(1);}};f.cycle(1);
  expect(f.batches()).toHaveLength(2);for(const batch of f.batches()){expect(batch.transitions.map(t=>t.kind)).toEqual(['birth','gun-bound']);expect(batch.transitions.map(t=>t.ordinal)).toEqual([1,2]);expect(batch.transitions.map(t=>t.prefix)).toEqual([{kind:'receipt',sceneGeneration:1,callback:0,tick:0},{kind:'callback',sceneGeneration:1,callback:1}]);const stream=f.events.filter(e=>e.recipientId===batch.recipientId);expect(stream[0].kind).toBe('model-state');expect(stream[1]).toBe(batch);expect(Object.isFrozen(batch.transitions)).toBe(true);}f.worlds.clear();
 });
 it('suppresses all speculative batches on a later receiver failure and retries identical model handles once',()=>{
  const f=fixture(),time=f.physical(1),failed=vi.spyOn(f.b.mirror,'prepareSynchronousDelivery').mockImplementationOnce(()=>{throw Error('later journal receiver failed');});expect(()=>f.worlds.completeGoody(time)).toThrow('later journal receiver failed');expect(f.batches()).toEqual([]);expect(f.ledgers.get('A')!.freezeModels()).toEqual([]);expect(f.a.callback).toBe(0);failed.mockRestore();f.worlds.completeGoody(time);expect(f.batches()).toHaveLength(2);for(const batch of f.batches())expect(batch.transitions[0]).toMatchObject({kind:'birth',giHandle:'gi:baddy1',gunHandle:'gun:rpg:baddy1'});f.worlds.actors(time);f.cycle(2);expect(f.batches()).toHaveLength(2);f.worlds.clear();
 });
 it('continues recipient streams after callback errors, aggregates after commit and never replays consumed batches',()=>{
  let failed=false;const f=fixture(event=>{if(event.kind==='model-transitions'&&event.recipientId==='A'&&!failed){failed=true;throw Error('journal renderer failed');}}),time=f.physical(1);expect(()=>f.worlds.completeGoody(time)).toThrow();expect(f.batches().map(e=>e.recipientId)).toEqual(['A','B']);expect(f.a.callback).toBe(1);expect(f.b.callback).toBe(1);expect(f.events.some(e=>e.kind==='baddy-born'&&e.recipientId==='B')).toBe(true);f.worlds.actors(time);f.cycle(2);expect(f.batches()).toHaveLength(2);f.worlds.clear();
 });
 it('delivers already committed exact-life batches after freeze',()=>{
  let frozen=false;const f=fixture((event,worlds)=>{if(event.kind==='model-transitions'&&!frozen){frozen=true;worlds.freeze();}});const time=f.physical(1);f.worlds.completeGoody(time);expect(f.batches().map(e=>e.recipientId)).toEqual(['A','B']);expect(f.events.some(e=>e.kind==='baddy-born'&&e.recipientId==='B')).toBe(true);f.worlds.clear();
 });
 it('invalidates remaining old streams when a callback clears and replaces the same numeric life',()=>{
  let replacement:OriginalSoloObserver|undefined;const f=fixture((event,worlds)=>{if(event.kind==='model-transitions'&&event.recipientId==='A'&&!replacement){worlds.clear();replacement=worlds.register({id:'A',name:'NewAlpha',eye:{x:1000,y:1000,z:1000}});}});const time=f.physical(1);f.worlds.completeGoody(time);expect(replacement).toBeDefined();expect(replacement).not.toBe(f.a);expect(replacement!.lifeGeneration).toBe(1);expect(f.worlds.worlds.get('A')).toBe(replacement);expect(f.batches().map(e=>e.recipientId)).toEqual(['A']);expect(f.events.some(e=>e.kind==='baddy-born')).toBe(false);f.worlds.clear();
 });
 it('marks death at its receipt, then publishes detach ownership once on the following callback',()=>{
  const f=fixture();f.cycle(1);const before=f.batches().length;f.worlds.dispose('B');expect(f.batches()).toHaveLength(before);expect(f.a.receiptTick).toBe(2);expect(f.ledgers.get('A')!.freezePickups()).toEqual([]);f.cycle(2);const batch=f.batches().at(-1)!;expect(batch.recipientId).toBe('A');const detach=batch.transitions.find(t=>t.kind==='detach');expect(detach).toBeDefined();if(!detach||detach.kind!=='detach')throw Error('missing detach');expect(detach.prefix).toEqual({kind:'callback',sceneGeneration:1,callback:2});expect(detach.pickup).toEqual(f.ledgers.get('A')!.freezePickups()[0]);expect(detach.pickup.weapon).toBe('pistol');expect(detach.fadeId).toBe(1);const count=f.batches().length;f.worlds.dispose('B');expect(f.batches()).toHaveLength(count);f.cycle(3);expect(f.batches()).toHaveLength(count);expect(f.releases.get('B')).toBe(1);f.worlds.clear();
 });
 it('preserves disabled-journal legacy first-error behavior and absent model-transition events',()=>{
  const f=fixture(event=>{if(event.kind==='baddy-born'&&event.recipientId==='A')throw Error('legacy stop');},false),time=f.physical(1);expect(()=>f.worlds.completeGoody(time)).toThrow('legacy stop');expect(f.batches()).toEqual([]);expect(f.events.some(e=>e.kind==='baddy-born'&&e.recipientId==='B')).toBe(false);expect(f.b.callback).toBe(1);f.worlds.clear();
 });
 it('rejects malformed enabled transition metadata before committing any recipient or publishing callbacks',()=>{
  const f=fixture(),scene=f.ledgers.get('B')!,original=scene.begin.bind(scene);const spy=vi.spyOn(scene,'begin').mockImplementation(()=>{const tx=original(),read=tx.freezeModelTransitions!;return {...tx,freezeModelTransitions:()=>read().map(t=>({...t,ordinal:t.ordinal+1})) as readonly ReceiverModelTransition[]};});const time=f.physical(1);expect(()=>f.worlds.completeGoody(time)).toThrow();expect(f.batches()).toEqual([]);expect(f.a.callback).toBe(0);expect(f.b.callback).toBe(0);expect(f.ledgers.get('A')!.freezeModels()).toEqual([]);spy.mockRestore();f.worlds.completeGoody(time);expect(f.batches()).toHaveLength(2);f.worlds.clear();
 });
});
