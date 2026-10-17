import {describe,it,expect} from 'vitest';
import {OriginalReceiverSceneController,type ReceiverSceneEnvironment,type ReceiverStagedTransientInventoryCapture} from './originalReceiverSceneController';
import {OriginalReceiverCurrentEnvironment,type ReceiverCurrentEnvironmentState} from './originalReceiverCurrentEnvironment';
import type {ReceiverModelBackend,ReceiverModelPose} from './originalReceiverModelWorld';
import {createOriginalSceneGeometry,type OriginalSceneData} from './originalSceneGeometry';
import {OriginalBarrelWorld} from './originalBarrelWorld';
import {createOriginalPlayerHealth} from './originalPlayerHealth';
import type {OriginalMapRuntime} from './originalMapRuntime';

const I=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
const receipt={kind:'receipt' as const,sceneGeneration:7,callback:0,tick:0};
const callback={kind:'callback' as const,sceneGeneration:7,callback:1};
const pose:ReceiverModelPose={position:{x:0,y:0,z:0},yaw:0,phase:0,scale:1,rotation:{x:0,y:0,z:0,w:1}};
function fixture(inlineCapture=false,birthAtReceipt=true,missingCoverage=false){
 const data:OriginalSceneData={nodes:[{name:'floor',parent:'World',resource:'floor',matrix:I,visibility:1,shader:'default'}],meshes:[{resource:'floor',part:0,positions:[[-10,-10,-100],[10,-10,-100],[0,10,-100]],faces:[[0,1,2]],normals:[],tex_coords:[]}]};
 const geometry=createOriginalSceneGeometry(data,{scale:.02}),runtime:OriginalMapRuntime={map:'woodlands',data,scale:.02,geometry,spawnPoints:[],profile:{scale:.02,radius:1,bodyHeight:1,eyeHeight:1,bounds:geometry.bounds}};
 const captures:ReceiverCurrentEnvironmentState[]=[],observedInline:string[][]=[],observedQueries:string[][]=[];
 let staged:ReturnType<OriginalReceiverCurrentEnvironment['begin']>|undefined;
 const env=new OriginalReceiverCurrentEnvironment({sceneGeneration:7,sourceScale:.02,target:{health:createOriginalPlayerHealth(),alive:true},barrels:new OriginalBarrelWorld(runtime),maxCommands:32,maxOutcomes:32,maxModels:64,maxTextChars:65536,snapshotAt:(prefix,state)=>{
  // A deliberately empty, complete synthetic external partition lets the
  // real ModelWorld admit this fixture. It attests no production resources.
  captures.push(state);return {prefix,models:[],missing:missingCoverage?['explicit-template-evidence']:[],provenance:'declared-test-external'};
 }});
 // Use the actual Controller inline capture closure, without supplying a fake
 // complete bullet inventory or admitting a shot in this handoff fixture.
 const wrapped:ReceiverSceneEnvironment={begin:(allocator,models)=>{
  const tx=env.begin(allocator,models);staged=tx;
  return {...tx,dispatchAt:(prefix,emit,capture)=>{
   tx.dispatchAt!(prefix,emit,capture);
   if(inlineCapture&&prefix.kind==='callback')observedQueries.push(capture!().models.filter(model=>model.kind==='transient').map(model=>model.handle));
  }};
 }};
 const backend:ReceiverModelBackend={cloneGI:()=>({pose,geometryProvenance:'declared-GI'}),cloneGun:()=>({pose,geometryProvenance:'declared-gun'}),heldGunPose:gi=>gi.pose,sphere:()=>({bspWorld:1,provenance:'declared-resource'}),reparentGunMembership:x=>x,dropYaw:()=>0,nearestDetailedDownward:(_origin,models)=>{
  observedInline.push(models.filter(model=>model.kind==='transient').map(model=>model.handle));return {hit:null,coverage:{complete:true,missing:[],provenance:'declared-downward'}};
 }};
 const controller=new OriginalReceiverSceneController(backend,{clonePlane:()=>({pose,geometryProvenance:'declared-plane',inWorld:true}),cloneMuzzle:()=>({pose,geometryProvenance:'declared-muzzle',inWorld:true}),pointAt:()=>pose.rotation!,selfRotate:q=>q},wrapped,{model:{sceneGeneration:7,sourceScale:.02,eyeHeight:1,goodyBspWorld:1,maxModels:64,maxPickups:8,requireCompleteCoverage:false},transient:{maxModels:16,maxActors:16,maxShaders:16},maxEffects:32});
 const plane={kind:'transient-birth' as const,event:{kind:'miss' as const,id:'first-plane',position:{x:0,y:0,z:-3},normal:{x:0,y:0,z:1}}};
 const arm=()=>env.arm({physicalCallback:1,goody:{bspWorld:2,modelPosition:{x:0,y:0,z:0},eyePosition:{x:0,y:1,z:0},weapon:'rifle'},frames:[{prefix:receipt,commands:birthAtReceipt?[plane]:[]},{prefix:callback,commands:[...(birthAtReceipt?[]:[plane]),{kind:'transient-birth',event:{kind:'muzzle',id:'first-muzzle',weapon:'rifle',gunPose:pose}}]}]});
 return {env,controller,captures,observedInline,observedQueries,arm,stage:()=>staged!};
}

describe('actual staged transient inventory handoff without coverage inference',()=>{
 it('keeps declared missing external coverage fail-closed despite a valid staged FX capture',()=>{
  const f=fixture(false,true,true);f.arm();const tx=f.controller.begin();
  expect(()=>tx.applyExternalReceipt(0,0)).toThrow('Incomplete receiver external scene');
  const captured=f.captures.at(-1)!.transients!;
  expect(captured.prefix).toEqual(receipt);expect(captured.models).toHaveLength(1);
  expect(captured.expectedHandles).toEqual(captured.models.map(model=>model.handle));
  tx.rollback();expect(f.controller.freezeTransientModels()).toEqual([]);
 });
 it('provides an explicit empty owned pool and null width before the first FX birth',()=>{
  const f=fixture(false,false);f.arm();const tx=f.controller.begin();tx.applyExternalReceipt(0,0);tx.refreshExternalModels();
  expect(f.captures.at(-1)!.transients).toEqual({prefix:receipt,models:[],expectedHandles:[],planeWidthWorld:null});
  tx.advanceExternalCallback(1);tx.refreshExternalModels();expect(f.captures.at(-1)!.transients!.models).toHaveLength(2);tx.rollback();
 });
 it('uses the same staged FX entries once in the actual inline query capture',()=>{
  // Explicit empty external fixture only; this does not attest production
  // template resources, sky or native geometry.
  const f=fixture(true);f.arm();const tx=f.controller.begin();tx.applyExternalReceipt(0,0);tx.advanceExternalCallback(1);
  expect(f.observedQueries).toHaveLength(1);expect(f.observedQueries[0]).toHaveLength(2);expect(new Set(f.observedQueries[0]).size).toBe(2);
  expect(f.captures.at(-1)!.transients!.models.map(model=>model.handle)).toEqual(f.observedQueries[0]);tx.rollback();
 });
 it('exposes receipt/actor-birth/callback/final refresh pools while appending each FX model once',()=>{
  const f=fixture();f.arm();const tx=f.controller.begin();tx.applyExternalReceipt(0,0);
  tx.birth({actorId:'peer',targetFeet:{x:0,y:0,z:-5},targetYaw:0,callback:0});
  tx.advanceExternalCallback(1);tx.refreshExternalModels();
  const latest=f.captures.at(-1)!.transients!;
  expect(latest.prefix).toEqual(callback);expect(latest.models).toHaveLength(2);expect(latest.planeWidthWorld).toBe(2);
  expect(latest.expectedHandles).toEqual(latest.models.map(model=>model.handle));expect(Object.isFrozen(latest)).toBe(true);expect(Object.isFrozen(latest.expectedHandles)).toBe(true);
  expect(f.captures.some(state=>state.transients?.prefix.kind==='receipt'&&state.transients.models.length===1)).toBe(true);
  expect(f.observedInline[0]).toHaveLength(1);expect(f.controller.freezeTransientModels()).toEqual([]);
  tx.commit();expect(f.controller.freezeTransientModels()).toHaveLength(2);expect(latest.models).toHaveLength(2);
 });
 it('retains immutable staged captures through rollback and retries without consulting committed FX',()=>{
  const f=fixture();f.arm();const first=f.controller.begin();first.applyExternalReceipt(0,0);first.advanceExternalCallback(1);first.refreshExternalModels();
  const saved=f.captures.at(-1)!.transients!;first.rollback();expect(f.controller.freezeTransientModels()).toEqual([]);expect(saved.models).toHaveLength(2);
  const retry=f.controller.begin();retry.applyExternalReceipt(0,0);retry.advanceExternalCallback(1);retry.refreshExternalModels();expect(f.captures.at(-1)!.transients).toEqual(saved);retry.commit();
  expect(f.controller.freezeTransientModels()).toHaveLength(2);
 });
 it.each(['foreign','stale','handles'] as const)('rejects %s stage metadata before invoking the factory snapshot',mode=>{
  const f=fixture();f.arm();const tx=f.controller.begin();tx.applyExternalReceipt(0,0);tx.advanceExternalCallback(1);tx.refreshExternalModels();
  const valid=f.captures.at(-1)!.transients!,before=f.captures.length;
  const invalid:ReceiverStagedTransientInventoryCapture=Object.freeze({...valid,prefix:Object.freeze({...callback,sceneGeneration:mode==='foreign'?8:7,callback:mode==='stale'?0:1}),expectedHandles:mode==='handles'?Object.freeze(['wrong']):valid.expectedHandles});
  expect(()=>f.stage().snapshotAt(callback,undefined,invalid)).toThrow(/staged transient/);expect(f.captures).toHaveLength(before);tx.rollback();expect(f.controller.freezeTransientModels()).toEqual([]);
 });
});
