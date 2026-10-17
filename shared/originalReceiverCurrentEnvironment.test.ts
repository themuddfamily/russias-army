import {readFileSync} from 'node:fs';
import {describe,expect,it,vi} from 'vitest';
import {OriginalReceiverCurrentEnvironment} from './originalReceiverCurrentEnvironment';
import {OriginalBarrelWorld} from './originalBarrelWorld';
import {OriginalDoorWorld,type OriginalDoorTracks} from './originalDoorWorld';
import {registerOriginalMapRuntime} from './originalMapRuntime';
import {createOriginalPlayerHealth} from './originalPlayerHealth';
import type {OriginalSceneData} from './originalSceneGeometry';
import type {ReceiverScenePrefix} from './originalReceiverPrefix';
import type {OriginalReceiverTransientEffect,OriginalReceiverTransientGoody} from './originalReceiverTransientWorld';
import {OriginalReceiverSceneController} from './originalReceiverSceneController';
import {OriginalRemoteView} from './originalRemoteView';
import type {ReceiverModelBackend,ReceiverModelPose} from './originalReceiverModelWorld';

const scale=1.72/85;
const receipt=(tick=0,callback=0):ReceiverScenePrefix=>({sceneGeneration:1,kind:'receipt',tick,callback});
const callback=(value=1):ReceiverScenePrefix=>({sceneGeneration:1,kind:'callback',callback:value});
const goody=(x=0,y=0,z=0):OriginalReceiverTransientGoody=>({bspWorld:123,modelPosition:{x,y:y-1,z},eyePosition:{x,y,z},weapon:'rifle'});
const hurt=(x=0,y=0,z=0):Extract<OriginalReceiverTransientEffect,{kind:'bang-hurt'}>=>({kind:'bang-hurt',effectId:'declared-hurt-fixture',position:{x,y,z},amount:5,radiusSource:250,attackerName:null});
function setup(map:'barrack'|'woodlands'='barrack',canonical=100,flick:2|-2=2,limits:Partial<{maxCommands:number;maxOutcomes:number;maxModels:number;maxTextChars:number}>={}){
 const source=JSON.parse(readFileSync(new URL(`../public/assets/original-scenes/${map==='barrack'?'barrack':'woodland'}/scene.json`,import.meta.url),'utf8')) as OriginalSceneData;
 const runtime=registerOriginalMapRuntime(map,source),barrels=new OriginalBarrelWorld(runtime);
 const tracks:OriginalDoorTracks=map==='barrack'?JSON.parse(readFileSync(new URL('../public/assets/original-scenes/barrack/doors.json',import.meta.url),'utf8')) as OriginalDoorTracks:{version:1,doors:[]};
 const doors=new OriginalDoorWorld(source,scale,tracks),target={health:createOriginalPlayerHealth(canonical,flick),alive:true};
 const observed:{prefix:ReceiverScenePrefix;barrels:ReturnType<OriginalBarrelWorld['snapshots']>;doors:ReturnType<OriginalDoorWorld['getStates']>}[]=[];
 const snapshot=vi.fn((prefix:ReceiverScenePrefix,state:Parameters<ConstructorParameters<typeof OriginalReceiverCurrentEnvironment>[0]['snapshotAt']>[1])=>{
  observed.push({prefix,barrels:state.barrels.snapshots(),doors:state.doors?.getStates()??[]});
  return {prefix,models:[],missing:['actor-ledger','projectile'],provenance:'explicit-current-subset-fixture'};
 });
 const options={sceneGeneration:1,sourceScale:scale,target,barrels,doors,snapshotAt:snapshot,maxCommands:16,maxOutcomes:16,maxModels:128,maxTextChars:8192,...limits};
 const env=new OriginalReceiverCurrentEnvironment(options);
 return {env,barrels,doors,target,observed,snapshot,options};
}

describe('CURRENT private environment adapter (explicit commands, no historical or physics replay)',()=>{
 it('labels the same CURRENT post-goody state at receipt N-1 then callback N without updating dynamics or flick',()=>{
  const f=setup(),before=f.barrels.snapshots(),doorTime=f.doors.updatedAtSeconds,update=vi.spyOn(f.doors,'update'),reset=vi.spyOn(f.barrels,'reset');
  f.env.arm({physicalCallback:1,goody:goody(),frames:[{prefix:receipt(0,0),commands:[]},{prefix:callback(),commands:[]}]});const stage=f.env.begin();
  expect(stage.applyReceipt(0,0)).toEqual([]);const a=stage.snapshotAt(receipt());expect(a.missing).toEqual(['actor-ledger','projectile']);expect(a.models).toEqual([]);
  expect(stage.advanceCallback(1)).toEqual([]);stage.snapshotAt(callback());stage.prepareCommit()();
  expect(f.observed.map(x=>x.prefix)).toEqual([receipt(),callback()]);expect(f.observed.every(x=>JSON.stringify(x.barrels)===JSON.stringify(before))).toBe(true);
  expect(f.target.health).toEqual({canonical:100,flick:2});expect(f.doors.updatedAtSeconds).toBe(doorTime);expect(update).not.toHaveBeenCalled();expect(reset).not.toHaveBeenCalled();
 });
 it('keeps decoded Woodland empty dynamics and rejects invented or out-of-order prefixes',()=>{
  const f=setup('woodlands');f.env.arm({physicalCallback:1,goody:null,frames:[{prefix:receipt(7,0),commands:[]},{prefix:callback(1),commands:[]}]});const stage=f.env.begin();
  expect(()=>stage.advanceCallback(1)).toThrow();stage.rollback();const retry=f.env.begin();expect(retry.applyReceipt(7,0)).toEqual([]);expect(retry.snapshotAt(receipt(7,0)).models).toEqual([]);expect(retry.advanceCallback(1)).toEqual([]);retry.prepareCommit()();
  expect(f.barrels.snapshots()).toEqual([]);expect(f.doors.getStates()).toEqual([]);
 });
 it('stages ordered explicit door opening and barrel removal without inferring touching contacts',()=>{
  const f=setup(),id=f.barrels.bodies[0].id,name=f.doors.getStates()[0].name,before=f.barrels.snapshots();
  f.env.arm({physicalCallback:0,goody:goody(),frames:[{prefix:receipt(),commands:[{kind:'door-open',name,atSeconds:0},{kind:'barrel-hurt',id,birthId:'explicit-barrel'}]}]});
  const stage=f.env.begin(),births=stage.applyReceipt(0,0);expect(births).toMatchObject([{kind:'bang',id:'explicit-barrel',type:'barrel'}]);stage.snapshotAt(receipt());
  expect(f.observed[0].barrels).toEqual([]);expect(f.observed[0].doors.find(d=>d.name===name)?.openedAt).toBe(0);expect(f.barrels.snapshots()).toEqual(before);expect(f.doors.getStates().find(d=>d.name===name)?.openedAt).toBeNull();
  stage.prepareCommit()();expect(f.barrels.snapshots()).toEqual([]);expect(f.doors.getStates().find(d=>d.name===name)?.openedAt).toBe(0);
 });
 it('uses strict full 3D source-scaled radius, independent of goody bsp',()=>{
  const f=setup();f.env.arm({physicalCallback:1,goody:goody(),frames:[{prefix:callback(),commands:[]}]});const stage=f.env.begin();stage.advanceCallback(1);
  // Distinct adapter points detect the wrong field: source goody.pos is the
  // eye/camera point. Native pmod and pos coincide; no native offset is claimed.
  stage.stageEffects([hurt(0,250*scale,0),hurt(0,250*scale+.01,0)],callback());expect(stage.goodyContext()).not.toBeNull();
  stage.stageEffects([hurt(0,250*scale-.001,0)],callback());stage.prepareCommit()();expect(f.target.health).toEqual({canonical:95,flick:2});expect(f.env.drainOutcomes()).toMatchObject([{kind:'hurt',amount:5,health:95,dead:false,attackerName:null}]);
 });
 it.each([2,-2] as const)('uses canonical signed health plus twice flick %s and suppresses later damage only after strict death',flick=>{
  const f=setup('woodlands',5-2*flick,flick);f.env.arm({physicalCallback:1,goody:goody(),frames:[{prefix:callback(),commands:[]}]});const stage=f.env.begin();stage.advanceCallback(1);
  stage.stageEffects([hurt()],callback());expect(stage.goodyContext()).not.toBeNull();stage.stageEffects([hurt(),hurt()],callback());expect(stage.goodyContext()).toBeNull();stage.prepareCommit()();
  expect(f.target.alive).toBe(false);expect(f.target.health).toEqual({canonical:-5-2*flick,flick});expect(f.env.drainOutcomes().map(x=>x.dead)).toEqual([false,true]);
 });
 it('does not damage a null goody and never admits FX models through the external snapshot',()=>{
  const f=setup('woodlands');f.env.arm({physicalCallback:1,goody:null,frames:[{prefix:callback(),commands:[{kind:'transient-birth',event:{kind:'puff',id:'puff',position:{x:0,y:0,z:0},angleSourceDegrees:10}}]}]});const stage=f.env.begin();
  expect(stage.advanceCallback(1)).toHaveLength(1);stage.stageEffects([hurt()],callback());expect(stage.snapshotAt(callback())).toMatchObject({models:[],missing:['actor-ledger','projectile']});stage.prepareCommit()();expect(f.target.health.canonical).toBe(100);expect(f.env.drainOutcomes()).toEqual([]);
 });
 it('rolls back dynamics, health and outcomes and retries the same armed input',()=>{
  const f=setup(),id=f.barrels.bodies[0].id,before=f.barrels.snapshots();f.env.arm({physicalCallback:1,goody:goody(),frames:[{prefix:callback(),commands:[{kind:'barrel-hurt',id,birthId:'barrel'}]}]});
  const first=f.env.begin();first.advanceCallback(1);first.stageEffects([hurt()],callback());const publish=first.prepareCommit();first.rollback();publish();expect(f.barrels.snapshots()).toEqual(before);expect(f.target.health.canonical).toBe(100);expect(f.env.drainOutcomes()).toEqual([]);
  const retry=f.env.begin();expect(retry.advanceCallback(1)).toHaveLength(1);retry.stageEffects([hurt()],callback());retry.prepareCommit()();expect(f.barrels.snapshots()).toEqual([]);expect(f.target.health.canonical).toBe(95);
 });
 it('releases a first prepared adopter when the second adopter rejects, allowing retry',()=>{
  const f=setup('woodlands');f.env.arm({physicalCallback:1,goody:goody(),frames:[{prefix:callback(),commands:[]}]});const stage=f.env.begin();stage.advanceCallback(1);
  const prepare=vi.spyOn(f.doors,'prepareAdopt').mockImplementationOnce(()=>{throw Error('second adopter failure');});expect(()=>stage.prepareCommit()).toThrow('second adopter failure');stage.rollback();prepare.mockRestore();
  expect(()=>f.barrels.reset()).not.toThrow();const retry=f.env.begin();retry.advanceCallback(1);retry.prepareCommit()();
 });
 it('seals prepared stages and provides detached idempotent terminal results',()=>{
  const f=setup('woodlands');f.env.arm({physicalCallback:1,goody:goody(),frames:[{prefix:callback(),commands:[]}]});const stage=f.env.begin();stage.advanceCallback(1);stage.stageEffects([hurt()],callback());const publish=stage.prepareCommit();
  expect(()=>stage.stageEffects([hurt()],callback())).toThrow();expect(()=>stage.advanceCallback(1)).toThrow();publish();publish();stage.rollback();expect(f.target.health.canonical).toBe(95);
  const outcomes=f.env.drainOutcomes();expect(Object.isFrozen(outcomes)).toBe(true);expect(Object.isFrozen(outcomes[0])).toBe(true);expect(Object.isFrozen(outcomes[0].position)).toBe(true);expect(f.env.drainOutcomes()).toEqual([]);
 });
 it('detaches armed commands, prefixes and goody vectors from later caller changes',()=>{
  const f=setup('woodlands'),context={...goody(),eyePosition:{x:0,y:0,z:0}},prefix={sceneGeneration:1,kind:'callback' as const,callback:1},event={kind:'puff' as const,id:'captured',position:{x:0,y:0,z:0},angleSourceDegrees:10};
  f.env.arm({physicalCallback:1,goody:context,frames:[{prefix,commands:[{kind:'transient-birth',event}]}]});context.eyePosition.x=1000;event.position.x=999;prefix.callback=9;
  const stage=f.env.begin();expect(stage.advanceCallback(1)).toMatchObject([{id:'captured',position:{x:0,y:0,z:0}}]);expect(stage.goodyContext()?.eyePosition.x).toBe(0);stage.stageEffects([hurt()],callback());stage.prepareCommit()();expect(f.target.health.canonical).toBe(95);
 });
 it('rejects private health changes after begin without overwriting newer target state',()=>{
  const f=setup('woodlands');f.env.arm({physicalCallback:1,goody:goody(),frames:[{prefix:callback(),commands:[]}]});const stage=f.env.begin();stage.advanceCallback(1);stage.stageEffects([hurt()],callback());f.target.health.canonical=77;
  expect(()=>stage.prepareCommit()).toThrow();stage.rollback();expect(f.target.health.canonical).toBe(77);expect(f.env.drainOutcomes()).toEqual([]);
  const retry=f.env.begin();retry.advanceCallback(1);retry.prepareCommit()();expect(f.target.health.canonical).toBe(77);
 });
 it('bounds commands and outcomes and requires outcomes to be drained before rearming',()=>{
  const f=setup('woodlands',100,2,{maxCommands:1,maxOutcomes:1}),frame={physicalCallback:1,goody:goody(),frames:[{prefix:callback(),commands:[]}]};
  expect(()=>f.env.arm({...frame,frames:[{prefix:callback(),commands:[{kind:'transient-birth',event:{kind:'blood',id:'a',position:{x:0,y:0,z:0}}},{kind:'transient-birth',event:{kind:'blood',id:'b',position:{x:0,y:0,z:0}}}]}]})).toThrow();
  f.env.arm(frame);const first=f.env.begin();first.advanceCallback(1);expect(()=>first.stageEffects([hurt(),hurt()],callback())).toThrow();first.rollback();expect(f.target.health.canonical).toBe(100);
  const retry=f.env.begin();retry.advanceCallback(1);retry.stageEffects([hurt()],callback());retry.prepareCommit()();expect(()=>f.env.arm({physicalCallback:2,goody:goody(),frames:[{prefix:callback(2),commands:[]}]})).toThrow();
  expect(f.env.drainOutcomes()).toHaveLength(1);expect(()=>f.env.arm({physicalCallback:2,goody:goody(),frames:[{prefix:callback(2),commands:[]}]})).not.toThrow();f.env.begin().rollback();
 });
 it('rejects actual mirror birth on incomplete CURRENT inventory before querying and preserves all staged state',()=>{
  const f=setup('woodlands'),pose:ReceiverModelPose={position:{x:0,y:0,z:0},rotation:{x:0,y:0,z:0,w:1},yaw:0,phase:0,scale:1};
  const query=vi.fn(()=>({hit:null,coverage:{complete:true,missing:[],provenance:'controlled-oracle-must-not-run'}}));
  const backend:ReceiverModelBackend={cloneGI:()=>({pose,geometryProvenance:'declared-GI-fixture'}),sphere:()=>({bspWorld:1,provenance:'declared-resource'}),cloneGun:()=>({pose,geometryProvenance:'declared-gun-fixture'}),heldGunPose:()=>pose,reparentGunMembership:()=>true,dropYaw:()=>0,nearestDetailedDownward:query};
  const controller=new OriginalReceiverSceneController(backend,{clonePlane:()=>({pose,geometryProvenance:'declared-plane',inWorld:true}),cloneMuzzle:()=>({pose,geometryProvenance:'declared-muzzle',inWorld:true}),pointAt:()=>({x:0,y:0,z:0,w:1}),selfRotate:q=>q},f.env,{model:{eyeHeight:1,sourceScale:scale,goodyBspWorld:1,sceneGeneration:1,maxModels:64,maxPickups:8},transient:{maxModels:16,maxActors:16,maxShaders:16},maxEffects:16});
  const view=new OriginalRemoteView(0,{},'source-callback',controller);expect(view.recordSent({tick:0,sentAt:0,targets:[{id:'A',position:{x:0,y:10,z:0},yaw:0,motionTime:0,alive:true,weapon:'rifle',sourceShots:0}]})).toEqual({ok:true});
  f.env.arm({physicalCallback:0,goody:goody(),frames:[{prefix:receipt(),commands:[]}]});const before={view:view.debugState(),actors:view.freeze(),controller:controller.debugState(),health:{...f.target.health}};
  expect(()=>view.accept({callbacks:0,receipts:[{tick:0,callbacks:0}]},0)).toThrow();expect(query).not.toHaveBeenCalled();expect({view:view.debugState(),actors:view.freeze(),controller:controller.debugState(),health:{...f.target.health}}).toEqual(before);expect(f.env.drainOutcomes()).toEqual([]);
  const retry=f.env.begin();expect(retry.applyReceipt(0,0)).toEqual([]);retry.rollback();
 });
 it('rejects scale mismatch, invalid named limits and skipped physical callbacks before staging',()=>{
  const f=setup('woodlands');expect(()=>new OriginalReceiverCurrentEnvironment({...f.options,sourceScale:scale*2})).toThrow();expect(()=>new OriginalReceiverCurrentEnvironment({...f.options,maxCommands:0})).toThrow();
  expect(()=>new OriginalReceiverCurrentEnvironment({...f.options,sourceScale:-scale})).toThrow();
  expect(()=>f.env.arm({physicalCallback:2,goody:goody(),frames:[{prefix:callback(2),commands:[]}]})).toThrow();
  expect(()=>f.env.arm({physicalCallback:1,goody:goody(),frames:[{prefix:{...callback(),sceneGeneration:2},commands:[]}]})).toThrow();
  expect(()=>f.env.arm({physicalCallback:1,goody:goody(),frames:[{prefix:callback(),commands:[]}]})).not.toThrow();f.env.begin().rollback();
 });
 it('rejects a future door epoch instead of advancing the already-completed dynamics clock',()=>{
  const f=setup(),name=f.doors.getStates()[0].name,time=f.doors.updatedAtSeconds,before=f.doors.getStates();
  f.env.arm({physicalCallback:0,goody:goody(),frames:[{prefix:receipt(),commands:[{kind:'door-open',name,atSeconds:time+1}]}]});const stage=f.env.begin();
  expect(()=>stage.applyReceipt(0,0)).toThrow();stage.rollback();expect(f.doors.updatedAtSeconds).toBe(time);expect(f.doors.getStates()).toEqual(before);expect(f.target.health).toEqual({canonical:100,flick:2});
 });
 it('requires nonempty effect IDs and bounds effect plus attacker text before publishing health or outcomes',()=>{
  for(const effect of [{...hurt(),effectId:''},{...hurt(),effectId:'x'.repeat(41)},{...hurt(),effectId:'x'.repeat(39),attackerName:'ab'}]){
   const f=setup('woodlands',100,2,{maxTextChars:40});f.env.arm({physicalCallback:1,goody:goody(),frames:[{prefix:callback(),commands:[]}]});const stage=f.env.begin();stage.advanceCallback(1);expect(()=>stage.stageEffects([effect],callback())).toThrow();stage.rollback();expect(f.target.health.canonical).toBe(100);expect(f.env.drainOutcomes()).toEqual([]);
  }
  const f=setup('woodlands',100,2,{maxTextChars:40});f.env.arm({physicalCallback:1,goody:goody(),frames:[{prefix:callback(),commands:[]}]});const stage=f.env.begin();stage.advanceCallback(1);stage.stageEffects([{...hurt(),effectId:'x'.repeat(20)}],callback());stage.stageEffects([{...hurt(),effectId:'y'.repeat(20)}],callback());expect(()=>stage.stageEffects([{...hurt(),effectId:'z'}],callback())).toThrow();stage.rollback();expect(f.target.health.canonical).toBe(100);expect(f.env.drainOutcomes()).toEqual([]);
 });
});
