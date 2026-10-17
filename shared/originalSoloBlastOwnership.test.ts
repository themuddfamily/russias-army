import {readFileSync} from 'node:fs';
import {describe,expect,it,vi} from 'vitest';
import {OriginalSoloObserverWorlds,type OriginalSoloBlast,type OriginalSoloCurrentBlastClaim,type OriginalSoloCurrentCaptureResult} from './originalSoloObserverWorld';
import {OriginalReceiverCurrentEnvironment,type ReceiverCurrentEnvironmentCommand} from './originalReceiverCurrentEnvironment';
import {OriginalReceiverSceneController} from './originalReceiverSceneController';
import type {ReceiverModelBackend,ReceiverModelPose} from './originalReceiverModelWorld';
import {registerOriginalMapRuntime,type OriginalMapRuntime} from './originalMapRuntime';

let decoded:OriginalMapRuntime|undefined;
const runtime=()=>decoded??(decoded=registerOriginalMapRuntime('woodlands',JSON.parse(readFileSync(new URL('../public/assets/original-scenes/woodland/scene.json',import.meta.url),'utf8'))));
type Mode='normal'|'malformed'|'foreign'|'alias'|'omit'|'prefix'|'cap'|'text';
interface RecordState {env?:OriginalReceiverCurrentEnvironment;controller?:OriginalReceiverSceneController;key?:string;plan?:OriginalSoloCurrentCaptureResult;claims:Map<OriginalSoloBlast,OriginalSoloCurrentBlastClaim>;plans:number}
function setup(){
 const records=new Map<string,RecordState>(),control:{claimAll:boolean;selected:Set<string>;mode:Mode;foreign?:OriginalSoloBlast;prefixNoise:boolean;claimReads:number}={claimAll:true,selected:new Set(),mode:'normal',prefixNoise:false,claimReads:0};
 const worlds=new OriginalSoloObserverWorlds(runtime(),{createReceiverScene:()=>{
  const record:RecordState={claims:new Map(),plans:0},pose:ReceiverModelPose={position:{x:0,y:0,z:0},yaw:0,phase:0,scale:1,rotation:{x:0,y:0,z:0,w:1}};
  const backend:ReceiverModelBackend={cloneGI:()=>({pose,geometryProvenance:'declared-GI'}),cloneGun:()=>({pose,geometryProvenance:'declared-gun'}),heldGunPose:()=>pose,sphere:()=>({bspWorld:1,provenance:'declared-resource'}),reparentGunMembership:x=>x,dropYaw:()=>0,nearestDetailedDownward:()=>({hit:null,coverage:{complete:true,missing:[],provenance:'declared-empty-ray-oracle'}})};
  return {scene:{begin:()=>{if(!record.controller)throw Error('capture initializes scene');return record.controller.begin();}},release:()=>{},captureCurrent:context=>{
   records.set(context.id,record);
   if(!context.afterGoody&&context.deliveryKind==='where')throw Error('producer requires post-goody CURRENT');
   if(!record.env){record.env=new OriginalReceiverCurrentEnvironment({sceneGeneration:context.lifeGeneration,sourceScale:runtime().scale,target:context.target,barrels:context.barrels,doors:context.doors,maxCommands:64,maxOutcomes:64,maxModels:128,maxTextChars:65536,
    // Geometry and source event equivalence are declared CPU fixture inputs;
    // this never claims native complete inventory or historical membership.
    snapshotAt:prefix=>({prefix,models:[],missing:[],provenance:'declared-empty-ownership-fixture'})});
    record.controller=new OriginalReceiverSceneController(backend,{clonePlane:()=>({pose,geometryProvenance:'declared-plane',inWorld:true}),cloneMuzzle:()=>({pose,geometryProvenance:'declared-muzzle',inWorld:true}),pointAt:()=>({x:0,y:0,z:0,w:1}),selfRotate:q=>q},record.env,{model:{sceneGeneration:context.lifeGeneration,sourceScale:runtime().scale,eyeHeight:runtime().profile.eyeHeight,goodyBspWorld:1,maxModels:128,maxPickups:32},transient:{maxModels:64,maxActors:64,maxShaders:64},maxEffects:128});}
   const key=`${context.physicalCallback}:${context.mirrorCallback}:${context.receiptTick}:${context.deliveryKind}`;if(key===record.key)return record.plan!;
   record.plans++;const prefix={sceneGeneration:context.lifeGeneration,kind:'receipt' as const,callback:context.order.receiptCallbacks,tick:context.receiptTick},commands:ReceiverCurrentEnvironmentCommand[]=[],claims:OriginalSoloCurrentBlastClaim[]=[];
   for(const blast of context.blasts.values())if(context.id==='A'&&(control.claimAll||control.selected.has(blast.launch.id))){
    let claim=record.claims.get(blast);if(!claim){const birthPrefix={...prefix};if(control.prefixNoise)Object.defineProperty(birthPrefix,'unrelatedMetadata',{enumerable:true,get:()=>{throw Error('undeclared prefix field must not be read');}});claim=Object.freeze({blast,effectId:`private-fx:${context.id}:${blast.launch.id}`,birthPrefix:Object.freeze(birthPrefix)});record.claims.set(blast,claim);commands.push({kind:'transient-birth',event:{kind:'bang',id:claim.effectId,type:blast.launch.weapon==='rpg'?'rocket':'grenade',position:{...blast.state.position},attackerName:blast.launch.ownerName}});}claims.push(claim);
   }
   const eye={...context.body.position,y:context.body.position.y+runtime().profile.eyeHeight};
   record.env.arm({physicalCallback:context.physicalCallback,goody:context.alive?{bspWorld:1,modelPosition:{...context.body.position},eyePosition:eye,weapon:context.weapon??'rifle'}:null,frames:context.order.callbacks===context.order.receiptCallbacks?[{prefix,commands}]:[{prefix,commands},{prefix:{sceneGeneration:context.lifeGeneration,kind:'callback',callback:context.order.callbacks},commands:[]}]});
   let returned=claims;
   if(claims.length&&control.mode==='malformed')returned=[{...claims[0],effectId:''},...claims.slice(1)];
   else if(claims.length&&control.mode==='foreign')returned=[{...claims[0],blast:control.foreign!},...claims.slice(1)];
   else if(claims.length>1&&control.mode==='alias')returned=claims.map(c=>({...c,effectId:claims[0].effectId}));
   else if(control.mode==='omit')returned=[];
   else if(claims.length&&control.mode==='prefix')returned=claims.map(c=>({...c,birthPrefix:{...c.birthPrefix,callback:c.birthPrefix.callback+1}}));
   else if(claims.length&&control.mode==='text')returned=[{...claims[0],effectId:'x'.repeat(65537)}];
   else if(control.mode==='cap')returned=new Proxy(new Array<OriginalSoloCurrentBlastClaim>(65),{get:(array,key,receiver)=>{if(key===Symbol.iterator||typeof key==='string'&&/^\d+$/.test(key)){control.claimReads++;throw Error('oversized claims must not be read');}return Reflect.get(array,key,receiver);}});
   record.plan=Object.freeze({blastClaims:Object.freeze(returned)});record.key=key;return record.plan;
  },drainOutcomes:()=>record.env?.drainOutcomes()??[]};
 }});
 // Signed canonical health is uncapped; 1000 lets lifetime tests avoid death.
 const a=worlds.register({id:'A',name:'Alpha',eye:{x:1000,y:1000,z:1000}}),b=worlds.register({id:'B',name:'Bravo',eye:{x:2000,y:1000,z:1000}});a.health.canonical=1000;b.health.canonical=1000;
 const physical=(n:number,time=n/30)=>{worlds.physics(time,{skipIds:new Set(worlds.worlds.keys())});for(const world of worlds.worlds.values())if(world.alive)worlds.goody(world.id);return time;};
 const cycle=(n:number)=>{const time=physical(n);worlds.completeGoody(time);worlds.actors(time);};
 // Bodies use the declared skipIds external-physics seam. Forcing the final
 // projectile callback obtains real coordinator-created blast provenance;
 // it proves neither native fuse/contact timing nor native scene completeness.
 const detonate=(count=1)=>{const ids:string[]=[];for(let i=0;i<count;i++){const result=worlds.launch({ownerId:'A',weapon:'rpg',eye:{...a.body.position,y:a.body.position.y+runtime().profile.eyeHeight},direction:{x:1,y:0,z:0}},0);if(!result.ok)throw Error(result.reason);ids.push(result.launch.id);}
  const time=physical(1);worlds.completeGoody(time);for(const w of worlds.worlds.values())for(const p of w.projectiles.values())p.state.remainingCallbacks=1;worlds.actors(time);expect(a.blasts.size).toBe(count);return ids;};
 const freeze=()=>({health:[a.health.canonical,b.health.canonical],worlds:[...worlds.worlds].map(([id,w])=>({id,callback:w.callback,tick:w.receiptTick,mirror:w.mirror.debugState(),poses:w.mirror.freeze(),blasts:[...w.blasts].map(([key,v])=>({key,time:v.state.remainingCallbacks}))})),scenes:[...records].map(([id,r])=>({id,state:r.controller?.debugState(),publication:r.controller?.freezePublication()}))});
 return {worlds,a,b,records,control,physical,cycle,detonate,freeze};
}

describe('explicit per-blast solo damage ownership (observed detonation, declared FX adapter)',()=>{
 it('publishes one FX five-point step and suppresses only that exact legacy blast health step',()=>{
  const f=setup();f.control.prefixNoise=true;f.detonate();const blast=[...f.a.blasts.values()][0],time=f.physical(2);f.worlds.completeGoody(time);expect(f.a.health.canonical).toBe(995);expect(f.records.get('A')!.controller!.debugState().fx.actors[0].time).toBe(15);
  f.worlds.actors(time);expect(f.a.health.canonical).toBe(995);expect(blast.state.remainingCallbacks).toBe(15);expect(f.b.health.canonical).toBe(1000);
 });
 it('keeps an unclaimed sibling legacy-owned so mixed blasts damage ten points, not fifteen',()=>{
  const f=setup(),ids=f.detonate(2);f.control.claimAll=false;f.control.selected.add(ids[0]);const time=f.physical(2);f.worlds.completeGoody(time);expect(f.a.health.canonical).toBe(995);expect(f.records.get('A')!.controller!.debugState().fx.actors).toHaveLength(1);
  f.worlds.actors(time);expect(f.a.health.canonical).toBe(990);expect([...f.a.blasts.values()].map(b=>b.state.remainingCallbacks)).toEqual([15,15]);
 });
 it('publishes no ownership or FX on later receiver failure and retries the same precomputed claim plan',()=>{
  const f=setup();f.detonate();const time=f.physical(2),before=f.freeze(),fail=vi.spyOn(f.b.mirror,'prepareSynchronousDelivery').mockImplementationOnce(()=>{throw Error('later ownership receiver failure');});
  expect(()=>f.worlds.completeGoody(time)).toThrow('later ownership receiver failure');expect(f.freeze()).toEqual(before);const plans=[...f.records.values()].map(r=>r.plans);fail.mockRestore();f.worlds.completeGoody(time);expect([...f.records.values()].map(r=>r.plans)).toEqual(plans);f.worlds.actors(time);expect(f.a.health.canonical).toBe(995);
 });
 it('rejects first adoption after an earlier legacy callback instead of reconstructing elapsed FX history',()=>{
  const f=setup();f.detonate();f.control.claimAll=false;f.cycle(2);expect(f.a.health.canonical).toBe(995);f.control.claimAll=true;const time=f.physical(3),before=f.freeze();expect(()=>f.worlds.completeGoody(time)).toThrow();expect(f.freeze()).toEqual(before);
 });
 it.each(['malformed','foreign','replaced','alias'] as const)('rejects %s first claims before mirror/FX state publishes',mode=>{
  const f=setup();f.detonate(mode==='alias'?2:1);
  if(mode==='replaced'){const [id,blast]=[...f.a.blasts][0];f.a.blasts.set(id,{launch:blast.launch,state:structuredClone(blast.state)});}else{f.control.mode=mode;if(mode==='foreign')f.control.foreign=[...f.b.blasts.values()][0];}
  const time=f.physical(2),before=f.freeze();expect(()=>f.worlds.completeGoody(time)).toThrow();expect(f.freeze()).toEqual(before);
 });
 it.each(['omit','prefix'] as const)('rejects %s of a live owned claim instead of silently restoring legacy damage',mode=>{
  const f=setup();f.detonate();f.cycle(2);f.control.mode=mode;const time=f.physical(3),before=f.freeze();expect(()=>f.worlds.completeGoody(time)).toThrow();expect(f.freeze()).toEqual(before);expect(f.a.health.canonical).toBe(995);
 });
 it('bounds claim count before entry access and effect-id text before ownership or FX publication',()=>{
  for(const mode of ['cap','text'] as const){const f=setup();f.detonate();f.control.mode=mode;const time=f.physical(2),before=f.freeze();expect(()=>f.worlds.completeGoody(time)).toThrow(/budget/);expect(f.control.claimReads).toBe(0);expect(f.freeze()).toEqual(before);}
 });
 it('repeats the original sticky claim on a same-physical-callback death receipt without aging or damaging again',()=>{
  const f=setup();f.detonate();f.cycle(2);const record=f.records.get('A')!,claim=record.plan!.blastClaims[0],fx=record.controller!.debugState().fx,blast=[...f.a.blasts.values()][0];
  f.worlds.dispose('B');expect(f.worlds.worlds.has('B')).toBe(false);expect(record.plan!.blastClaims[0]).toBe(claim);expect(record.plan!.blastClaims[0].birthPrefix).toEqual({sceneGeneration:1,kind:'receipt',callback:1,tick:1});expect(f.a.receiptTick).toBe(3);expect(f.a.callback).toBe(2);expect(f.a.health.canonical).toBe(995);expect(blast.state.remainingCallbacks).toBe(15);expect(record.controller!.debugState().fx).toEqual(fx);
 });
 it('advances both exact sixteen-callback lifetimes together and retires ownership with the legacy map',()=>{
  const f=setup();f.detonate();for(let n=2;n<=16;n++)f.cycle(n);expect([...f.a.blasts.values()][0].state.remainingCallbacks).toBe(1);expect(f.records.get('A')!.controller!.debugState().fx.actors[0].time).toBe(1);
  f.cycle(17);expect(f.a.blasts.size).toBe(0);expect(f.records.get('A')!.controller!.debugState().fx.actors).toEqual([]);expect(f.a.health.canonical).toBe(920);f.cycle(18);expect(f.a.health.canonical).toBe(920);
 });
 it('retains ownership and timers while frozen and does not inherit them in a clear/replacement life',()=>{
  const f=setup();f.detonate();f.cycle(2);const blast=[...f.a.blasts.values()][0],before=f.freeze();f.worlds.freeze(2/30);f.worlds.physics(3/30);f.worlds.completeGoody(3/30);f.worlds.actors(3/30);expect(f.freeze()).toEqual(before);
  f.worlds.clear();const replacement=f.worlds.register({id:'A',name:'NewAlpha',eye:{x:1000,y:1000,z:1000}});replacement.blasts.set(blast.launch.id,blast);replacement.health.canonical=1000;const time=f.physical(1,1);expect(()=>f.worlds.completeGoody(time)).toThrow();expect(replacement).not.toBe(f.a);expect(replacement.health.canonical).toBe(1000);
 });
});
