import {readFileSync} from 'node:fs';
import {describe,expect,it,vi} from 'vitest';
import {OriginalSoloObserverWorlds,type OriginalSoloEvent,type OriginalSoloCurrentBlastClaim,type OriginalSoloCurrentCaptureResult,type OriginalSoloBlast} from './originalSoloObserverWorld';
import {OriginalReceiverCurrentEnvironment,type ReceiverCurrentEnvironmentCommand} from './originalReceiverCurrentEnvironment';
import {OriginalReceiverSceneController} from './originalReceiverSceneController';
import type {ReceiverModelBackend,ReceiverModelPose} from './originalReceiverModelWorld';
import {registerOriginalMapRuntime,type OriginalMapRuntime} from './originalMapRuntime';

let decoded:OriginalMapRuntime|undefined;
const runtime=()=>decoded??(decoded=registerOriginalMapRuntime('woodlands',JSON.parse(readFileSync(new URL('../public/assets/original-scenes/woodland/scene.json',import.meta.url),'utf8'))));
type Damage=Extract<OriginalSoloEvent,{kind:'damaged'|'dead'}>;
interface PrivateScene {env?:OriginalReceiverCurrentEnvironment;controller?:OriginalReceiverSceneController;key?:string;plan?:OriginalSoloCurrentCaptureResult;claim?:OriginalSoloCurrentBlastClaim;plans:number;decoyBorn:boolean;unclaimedBorn:boolean}
function fixture(){
 const records=new Map<string,PrivateScene>(),events:OriginalSoloEvent[]=[],config:{claimWorlds:Set<string>;decoy:boolean;unclaimedB:boolean;label?:string|null}={claimWorlds:new Set(['A']),decoy:false,unclaimedB:false};let hook:((event:OriginalSoloEvent)=>void)|undefined;
 const worlds=new OriginalSoloObserverWorlds(runtime(),{onEvent:event=>{events.push(event);hook?.(event);},createReceiverScene:()=>{
  const record:PrivateScene={plans:0,decoyBorn:false,unclaimedBorn:false},pose:ReceiverModelPose={position:{x:0,y:0,z:0},yaw:0,phase:0,scale:1,rotation:{x:0,y:0,z:0,w:1}};
  const backend:ReceiverModelBackend={cloneGI:()=>({pose,geometryProvenance:'declared-GI'}),cloneGun:()=>({pose,geometryProvenance:'declared-gun'}),heldGunPose:()=>pose,sphere:()=>({bspWorld:1,provenance:'declared-resource'}),reparentGunMembership:x=>x,dropYaw:()=>0,nearestDetailedDownward:()=>({hit:null,coverage:{complete:true,missing:[],provenance:'declared-empty-grounding-oracle'}})};
  return {scene:{begin:()=>{if(!record.controller)throw Error('capture must initialize');return record.controller.begin();}},release:()=>{},captureCurrent:context=>{
   records.set(context.id,record);if(!record.env){record.env=new OriginalReceiverCurrentEnvironment({sceneGeneration:context.lifeGeneration,sourceScale:runtime().scale,target:context.target,barrels:context.barrels,maxCommands:8,maxOutcomes:16,maxModels:64,maxTextChars:65536,snapshotAt:prefix=>({prefix,models:[],missing:[],provenance:'declared-empty-attribution-fixture'})});
    record.controller=new OriginalReceiverSceneController(backend,{clonePlane:()=>({pose,geometryProvenance:'declared-plane',inWorld:true}),cloneMuzzle:()=>({pose,geometryProvenance:'declared-muzzle',inWorld:true}),pointAt:()=>({x:0,y:0,z:0,w:1}),selfRotate:q=>q},record.env,{model:{sceneGeneration:context.lifeGeneration,sourceScale:runtime().scale,eyeHeight:runtime().profile.eyeHeight,goodyBspWorld:1,maxModels:64,maxPickups:16},transient:{maxModels:16,maxActors:16,maxShaders:16},maxEffects:32});}
   const key=`${context.physicalCallback}:${context.mirrorCallback}:${context.receiptTick}:${context.deliveryKind}`;if(record.key===key)return record.plan!;record.plans++;
   const prefix={sceneGeneration:context.lifeGeneration,kind:'receipt' as const,callback:context.order.receiptCallbacks,tick:context.receiptTick},commands:ReceiverCurrentEnvironmentCommand[]=[],blast=context.blasts.values().next().value as OriginalSoloBlast|undefined;
   const bang=(effectId:string)=>{commands.push({kind:'transient-birth',event:{kind:'bang',id:effectId,type:'rocket',position:{...blast!.state.position},attackerName:blast!.launch.ownerName}});};
   if(blast&&config.claimWorlds.has(context.id)&&!record.claim){record.claim=Object.freeze({blast,effectId:'same-private-effect',birthPrefix:Object.freeze({...prefix})});bang(record.claim.effectId);}
   if(blast&&context.id==='A'&&config.decoy&&!record.decoyBorn){bang('unclaimed-twin');record.decoyBorn=true;}
   if(blast&&context.id==='B'&&config.unclaimedB&&!record.unclaimedBorn){bang('same-private-effect');record.unclaimedBorn=true;}
   const claims=record.claim&&context.blasts.get(record.claim.blast.launch.id)===record.claim.blast?[record.claim]:[];
   record.env.arm({physicalCallback:context.physicalCallback,goody:context.alive?{bspWorld:1,modelPosition:{...context.body.position},eyePosition:{...context.body.position,y:context.body.position.y+runtime().profile.eyeHeight},weapon:'rifle'}:null,frames:context.order.callbacks===context.order.receiptCallbacks?[{prefix,commands}]:[{prefix,commands},{prefix:{sceneGeneration:context.lifeGeneration,kind:'callback',callback:context.order.callbacks},commands:[]}]});
   record.plan=Object.freeze({blastClaims:Object.freeze(claims)});record.key=key;return record.plan;
  },drainOutcomes:()=>{const outcomes=record.env?.drainOutcomes()??[];
   // Explicit label projection tests the coordinator notification boundary.
   // It does not claim null attribution for a native named rocket constructor.
   const label=config.label;return label===undefined?outcomes:outcomes.map(outcome=>({...outcome,attackerName:label}));}};
 }});
 // Overlapping stationary bodies are an explicit skipIds physics seam, so the
 // same received launch is close to both receivers without a solver claim.
 const a=worlds.register({id:'A',name:'Alpha',eye:{x:1000,y:1000,z:1000}}),b=worlds.register({id:'B',name:'Bravo',eye:{x:1000,y:1000,z:1000}});a.health.canonical=1000;b.health.canonical=1000;
 const physical=(n:number)=>{const time=n/30;worlds.physics(time,{skipIds:new Set(worlds.worlds.keys())});for(const w of worlds.worlds.values())if(w.alive)worlds.goody(w.id);return time;};
 const detonate=()=>{const result=worlds.launch({ownerId:'A',weapon:'rpg',eye:{...a.body.position,y:a.body.position.y+runtime().profile.eyeHeight},direction:{x:1,y:0,z:0}},0);if(!result.ok)throw Error(result.reason);const time=physical(1);worlds.completeGoody(time);for(const w of worlds.worlds.values())for(const p of w.projectiles.values())p.state.remainingCallbacks=1;worlds.actors(time);expect(a.blasts.size).toBe(1);expect(b.blasts.size).toBe(1);return result.launch;};
 const damages=()=>events.filter((e):e is Damage=>(e.kind==='damaged'||e.kind==='dead')&&e.effectId!==undefined);
 const freeze=()=>({worlds:[...worlds.worlds].map(([id,w])=>({id,health:{...w.health},callback:w.callback,tick:w.receiptTick,mirror:w.mirror.debugState(),poses:w.mirror.freeze()})),controllers:[...records].map(([id,r])=>({id,state:r.controller?.debugState(),publication:r.controller?.freezePublication()})),events:[...events]});
 return {worlds,a,b,records,config,events,physical,detonate,damages,freeze,setHook:(next:(event:OriginalSoloEvent)=>void)=>{hook=next;}};
}

// Decoy/cross-world effects are synthetic notification controls. Their emission
// does not establish safe production admission or legacy/FX damage equivalence;
// those remain the trusted producer's responsibilities.
describe('exact private effect attribution (actual observed detonation; declared CPU scene)',()=>{
 it('associates the claimed ID with the actual frozen launch and owner without reapplying health',()=>{
  const f=fixture(),launch=f.detonate(),time=f.physical(2);f.worlds.completeGoody(time);const event=f.damages()[0];expect(event.effectId).toBe('same-private-effect');expect(event.launch).toBe(launch);expect(event.ownerId).toBe('A');expect(event.ownerName).toBe('Alpha');expect(Object.isFrozen(event)).toBe(true);expect(Object.isFrozen(event.launch)).toBe(true);expect(Object.isFrozen(event.position)).toBe(true);expect(f.a.health.canonical).toBe(995);f.worlds.actors(time);expect(f.a.health.canonical).toBe(995);expect(f.events.filter(e=>e.kind==='spawned')).toHaveLength(2);expect(f.events.filter(e=>e.kind==='detonated')).toHaveLength(2);expect(f.events.filter(e=>e.kind==='shot')).toEqual([]);
 });
 it('does not infer a launch for an unclaimed effect with identical position and attacker name',()=>{
  const f=fixture();f.config.decoy=true;const launch=f.detonate();f.worlds.completeGoody(f.physical(2));const [owned,twin]=f.damages();expect(owned.launch).toBe(launch);expect(twin.effectId).toBe('unclaimed-twin');expect(twin.position).toEqual(owned.position);expect(twin.ownerName).toBe(owned.ownerName);expect(twin.launch).toBeUndefined();expect(twin.ownerId).toBeUndefined();expect(f.a.health.canonical).toBe(990);
 });
 it('scopes matching IDs to the exact receiving world instead of borrowing another world claim',()=>{
  const f=fixture();f.config.unclaimedB=true;const launch=f.detonate();f.worlds.completeGoody(f.physical(2));const events=f.damages();expect(events.map(e=>e.effectId)).toEqual(['same-private-effect','same-private-effect']);expect(events[0].launch).toBe(launch);expect(events[1].recipientId).toBe('B');expect(events[1].launch).toBeUndefined();expect(events[1].ownerId).toBeUndefined();expect(events[1].position).toEqual(events[0].position);
 });
 it.each([null,''] as const)('preserves the source-compatible nullable/empty label %s instead of filling it from launch ownership',label=>{
  const f=fixture();f.config.label=label;const launch=f.detonate();f.worlds.completeGoody(f.physical(2));const event=f.damages()[0];expect(event.launch).toBe(launch);expect(event.ownerId).toBe('A');expect(event.ownerName).toBe(label===null?undefined:'');
 });
 it('publishes no association on rollback and retries the same effect/launch plan without duplicate health or events',()=>{
  const f=fixture(),launch=f.detonate(),time=f.physical(2),before=f.freeze(),fail=vi.spyOn(f.b.mirror,'prepareSynchronousDelivery').mockImplementationOnce(()=>{throw Error('later attribution receiver failed');});expect(()=>f.worlds.completeGoody(time)).toThrow('later attribution receiver failed');expect(f.freeze()).toEqual(before);const plans=[...f.records.values()].map(r=>r.plans);fail.mockRestore();f.worlds.completeGoody(time);expect([...f.records.values()].map(r=>r.plans)).toEqual(plans);expect(f.damages()).toHaveLength(1);expect(f.damages()[0].launch).toBe(launch);expect(f.a.health.canonical).toBe(995);
 });
 it('invalidates detached queued notifications after clear/replacement without redirecting launch association',()=>{
  const f=fixture();f.config.claimWorlds.add('B');const launch=f.detonate();let replacement:ReturnType<OriginalSoloObserverWorlds['register']>|undefined;f.setHook(event=>{if(event.kind==='damaged'&&event.recipientId==='A'){f.worlds.clear();replacement=f.worlds.register({id:'B',name:'NewBravo',eye:{x:1000,y:1000,z:1000}});}});f.worlds.completeGoody(f.physical(2));expect(f.damages()).toHaveLength(1);expect(f.damages()[0].launch).toBe(launch);expect(f.worlds.worlds.get('B')).toBe(replacement);expect(replacement).not.toBe(f.b);expect(replacement?.health.canonical).toBe(100);
 });
 it('retains the frozen launch association after the original shooter departs',()=>{
  const f=fixture();f.config.claimWorlds=new Set(['B']);const launch=f.detonate(),time=f.physical(2);f.worlds.completeGoody(time);f.worlds.actors(time);f.worlds.dispose('A');expect(f.worlds.worlds.has('A')).toBe(false);f.worlds.completeGoody(f.physical(3));const event=f.damages().at(-1)!;expect(event.recipientId).toBe('B');expect(event.launch).toBe(launch);expect(event.ownerId).toBe('A');expect(event.ownerName).toBe('Alpha');expect(f.b.health.canonical).toBe(990);
 });
});
