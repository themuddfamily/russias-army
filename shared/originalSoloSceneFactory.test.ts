import {readFileSync} from 'node:fs';
import {describe,expect,it,vi} from 'vitest';
import {registerOriginalMapRuntime,type OriginalMapRuntime} from './originalMapRuntime';
import {OriginalSoloObserverWorlds,type OriginalSoloWorldOptions,type OriginalSoloEvent} from './originalSoloObserverWorld';
import {OriginalReceiverModelWorld,type ReceiverModelBackend} from './originalReceiverModelWorld';

type Context=Parameters<NonNullable<OriginalSoloWorldOptions['createReceiverScene']>>[0];
const runtimes=new Map<'barrack'|'woodlands',OriginalMapRuntime>();
function runtime(map:'barrack'|'woodlands'){
 let value=runtimes.get(map);if(!value){value=registerOriginalMapRuntime(map,JSON.parse(readFileSync(new URL(`../public/assets/original-scenes/${map==='woodlands'?'woodland':map}/scene.json`,import.meta.url),'utf8')));runtimes.set(map,value);}return value;
}
// Real lifecycle transactions with an explicitly declared fixture oracle.
// The floor handle exhausts this controlled scene's external inventory; it
// does not assert complete recovered-map geometry or native grounding rules.
function scene(failQuery:()=>boolean=()=>false){
 const pose=()=>({position:{x:0,y:90,z:0},yaw:0,phase:77,scale:1});
 const backend:ReceiverModelBackend={
  cloneGI:()=>({pose:pose(),geometryProvenance:'fixture-GI'}),sphere:()=>({bspWorld:2,provenance:'declared-resource'}),
  cloneGun:()=>({pose:pose(),geometryProvenance:'fixture-gun'}),heldGunPose:gi=>({...gi.pose,position:{...gi.pose.position}}),
  reparentGunMembership:()=>true,dropYaw:()=>0,
  nearestDetailedDownward:(origin,models)=>{
   if(failQuery())throw Error('fixture receiver query failure');
   if(!models.some(model=>model.handle==='fixture-floor'&&model.inWorld))throw Error('Missing fixture floor');
   return {hit:{position:{x:origin.x,y:80,z:origin.z},handle:'fixture-floor',geometryProvenance:'fixture-floor'},coverage:{complete:true,missing:[],provenance:'declared-fixture-inventory'}};
  },
 };
 const value=new OriginalReceiverModelWorld(backend,{eyeHeight:1.72,sourceScale:.02,goodyBspWorld:2,sceneGeneration:1,maxModels:64,maxPickups:32});
 value.setExternalModels([{handle:'fixture-floor',name:'fixture-floor',resource:'fixture-floor',group:'scene',kind:'fixed',inWorld:true,pose:pose(),geometryProvenance:'fixture-floor'}]);
 return value;
}
const registration=(id:string)=>({id,name:id.toUpperCase(),eye:{x:id==='a'?1000:2000,y:1000,z:1000}});
function prepareCallback(worlds:OriginalSoloObserverWorlds,time=1/30){
 worlds.physics(time);for(const world of worlds.worlds.values())worlds.goody(world.id);
}
function setup(map:'barrack'|'woodlands'='barrack'){
 const scenes=new Map<string,OriginalReceiverModelWorld>(),releases=new Map<string,ReturnType<typeof vi.fn>>(),contexts:Context[]=[],events:OriginalSoloEvent[]=[];
 const fail=new Set<string>();
 const factory=vi.fn((context:Context)=>{
  contexts.push(context);const model=scene(()=>fail.has(context.id)),release=vi.fn();scenes.set(context.id,model);releases.set(context.id,release);return {scene:model,release};
 });
 const worlds=new OriginalSoloObserverWorlds(runtime(map),{presentationLifecycle:true,createReceiverScene:factory,onEvent:event=>events.push(event)});
 const a=worlds.register(registration('a')),b=worlds.register(registration('b'));
 for(const world of worlds.worlds.values())world.barrels.applySnapshots([]);
 return {worlds,a,b,scenes,releases,contexts,events,fail,factory};
}

describe('optional private Solo receiver scene factory',()=>{
 for(const map of ['barrack','woodlands'] as const)it(`${map}: separate model worlds ground births while the default path keeps transported birth feet`,()=>{
  const f=setup(map),plainEvents:OriginalSoloEvent[]=[],plain=new OriginalSoloObserverWorlds(runtime(map),{presentationLifecycle:true,onEvent:event=>plainEvents.push(event)});
  try{
   plain.register(registration('a'));plain.register(registration('b'));for(const world of plain.worlds.values())world.barrels.applySnapshots([]);
   expect(f.scenes.get('a')).not.toBe(f.scenes.get('b'));
   expect(Object.isFrozen(f.contexts[0])).toBe(true);expect(f.contexts[0]).toMatchObject({id:'a',name:'A',lifeGeneration:1,epochMs:0});
   expect(f.contexts[0].body).toBe(f.a.body);expect(f.contexts[0].health).toBe(f.a.health);expect(f.contexts[0].barrels).toBe(f.a.barrels);
   prepareCallback(f.worlds);f.worlds.completeGoody(1/30);prepareCallback(plain);plain.completeGoody(1/30);
   const grounded=f.events.find(event=>event.kind==='baddy-born'&&event.recipientId==='a');
   const transported=plainEvents.find(event=>event.kind==='baddy-born'&&event.recipientId==='a');
   expect(grounded?.kind).toBe('baddy-born');expect(transported?.kind).toBe('baddy-born');
   if(grounded?.kind!=='baddy-born'||transported?.kind!=='baddy-born')throw Error('Missing actual birth events');
   expect(grounded.position.y).toBeCloseTo(80+2-1.72,10);expect(transported.position.y).toBeGreaterThan(900);
   expect(f.a.mirror.freeze()[0].position.y).not.toBe(plain.remotePoses('a')[0].position.y);
   expect(f.scenes.get('a')!.debugState().actorHandles).toHaveLength(1);expect(f.scenes.get('b')!.debugState().actorHandles).toHaveLength(1);
  }finally{f.worlds.clear();plain.clear();}
 });
 it('rolls back every prepared scene and mirror when a later receiver query fails',()=>{
  const f=setup();try{
   const initial=[...f.scenes.values()].map(model=>model.freezeModels());f.fail.add('b');prepareCallback(f.worlds);
   expect(()=>f.worlds.completeGoody(1/30)).toThrow('fixture receiver query failure');
   for(const [index,world] of [...f.worlds.worlds.values()].entries()){
    expect(world.mirror.freeze()).toEqual([]);expect(world.mirror.debugState().pendingTicks).toEqual([]);expect(world.callback).toBe(0);expect(world.receiptTick).toBe(0);expect(world.actorNames.size).toBe(0);
    expect(f.scenes.get(world.id)!.freezeModels()).toEqual(initial[index]);
   }
   expect(f.events).toEqual([]);expect([...f.releases.values()].every(release=>release.mock.calls.length===0)).toBe(true);
   f.fail.clear();f.worlds.completeGoody(1/30);expect(f.a.callback).toBe(1);expect(f.b.callback).toBe(1);
  }finally{f.worlds.clear();}
 });
 it('does not consume a life generation or publish an observer when the factory throws',()=>{
  let fail=true;const contexts:Context[]=[],release=vi.fn();
  const worlds=new OriginalSoloObserverWorlds(runtime('barrack'),{createReceiverScene:context=>{contexts.push(context);if(fail)throw Error('factory failed');return {scene:scene(),release};}});
  try{
   expect(()=>worlds.register(registration('a'))).toThrow('factory failed');expect(worlds.worlds.size).toBe(0);
   fail=false;expect(worlds.register(registration('a')).lifeGeneration).toBe(1);expect(contexts.map(context=>context.lifeGeneration)).toEqual([1,1]);expect(release).not.toHaveBeenCalled();
  }finally{worlds.clear();}expect(release).toHaveBeenCalledOnce();
 });
 it('rejects scene identity aliases across observers and retired lives without releasing the active lease',()=>{
  let current=scene();const release=vi.fn();
  const worlds=new OriginalSoloObserverWorlds(runtime('barrack'),{createReceiverScene:()=>({scene:current,release})});
  try{
   worlds.register(registration('a'));expect(()=>worlds.register(registration('b'))).toThrow();expect(worlds.worlds.size).toBe(1);expect(release).not.toHaveBeenCalled();
   const probe=current.begin();const born=probe.birth({actorId:'probe',targetFeet:{x:0,y:100,z:0},targetYaw:0,callback:0});
   expect(born.currentFeet.y).toBeCloseTo(80+2-1.72,10);probe.rollback();expect(current.debugState().actorHandles).toEqual([]);
   worlds.dispose('a');expect(release).toHaveBeenCalledOnce();expect(()=>worlds.register(registration('a'))).toThrow();expect(worlds.worlds.size).toBe(0);
   current=scene();expect(worlds.register(registration('a')).lifeGeneration).toBe(2);
  }finally{worlds.clear();}expect(release).toHaveBeenCalledTimes(2);
 });
 it('rejects mutable world aliases before invoking the scene factory',()=>{
  const f=setup();try{
   expect(()=>f.worlds.register({...registration('c'),body:f.a.body})).toThrow('Aliased');expect(f.factory).toHaveBeenCalledTimes(2);expect(f.worlds.worlds.size).toBe(2);
  }finally{f.worlds.clear();}
 });
 it('retains the owner lease through failed disposal acceptance and releases it only after successful commit',()=>{
  const f=setup();let fail=true;const receiver=f.scenes.get('b')!,begin=receiver.begin.bind(receiver);
  vi.spyOn(receiver,'begin').mockImplementation(()=>{if(fail)throw Error('disposal scene failed');return begin();});
  try{
   expect(()=>f.worlds.dispose('a')).toThrow('disposal scene failed');expect(f.worlds.worlds.get('a')).toBe(f.a);expect(f.a.alive).toBe(true);expect(f.releases.get('a')).not.toHaveBeenCalled();expect(f.b.receiptTick).toBe(0);
   fail=false;f.worlds.dispose('a');expect(f.worlds.worlds.has('a')).toBe(false);expect(f.b.receiptTick).toBe(1);expect(f.releases.get('a')).toHaveBeenCalledOnce();expect(f.releases.get('b')).not.toHaveBeenCalled();
  }finally{f.worlds.clear();vi.restoreAllMocks();}
 });
 it('freeze retains scenes, clear releases each lease once, and a new generation obtains a fresh scene',()=>{
  const f=setup();const oldScene=f.scenes.get('a')!,firstRelease=f.releases.get('a')!;
  f.worlds.freeze(0);expect([...f.releases.values()].every(release=>release.mock.calls.length===0)).toBe(true);
  f.worlds.clear();expect(firstRelease).toHaveBeenCalledOnce();expect(f.releases.get('b')).toHaveBeenCalledOnce();f.worlds.clear();expect(firstRelease).toHaveBeenCalledOnce();
  f.worlds.register(registration('a'));expect(f.scenes.get('a')).not.toBe(oldScene);const nextRelease=f.releases.get('a')!;expect(nextRelease).not.toHaveBeenCalled();f.worlds.clear();expect(nextRelease).toHaveBeenCalledOnce();expect(firstRelease).toHaveBeenCalledOnce();
 });
});
