import {describe,expect,it} from 'vitest';
import {OriginalReceiverSceneController,type ReceiverSceneEnvironmentTransaction} from './originalReceiverSceneController';
import type {ReceiverModelBackend,ReceiverModelPose} from './originalReceiverModelWorld';
import type {OriginalReceiverTransientBirth} from './originalReceiverTransientWorld';

const pose:ReceiverModelPose={position:{x:0,y:0,z:0},yaw:0,phase:0,scale:1,rotation:{x:0,y:0,z:0,w:1}};
const birth=(id:string):OriginalReceiverTransientBirth=>({kind:'bang',type:'rocket',id,attackerName:'fixture',position:{x:0,y:0,z:0}});
function setup(mode:'ordered'|'retained'|'recursive'|'excess'|'caught-recursive'|'caught-excess'){
 let retained:((event:OriginalReceiverTransientBirth)=>void)|undefined,marker=0,committed=0,active=false;
 const observations:number[]=[],prefixes:unknown[]=[],legacyCalls:number[]=[];
 const controller=new OriginalReceiverSceneController({cloneGI:()=>({pose,geometryProvenance:'declared-GI'}),cloneGun:()=>({pose,geometryProvenance:'declared-gun'}),sphere:()=>({bspWorld:1,provenance:'declared-resource'}),heldGunPose:gi=>gi.pose,reparentGunMembership:present=>present,dropYaw:()=>0,
  nearestDetailedDownward:()=>({hit:null,coverage:{complete:true,missing:[],provenance:'empty-fixture'}})} satisfies ReceiverModelBackend,
 {clonePlane:()=>{observations.push(marker);if(mode==='recursive')retained!(birth('recursive'));if(mode==='caught-recursive'){try{retained!(birth('recursive'));}catch{/* Deliberately malicious fixture swallows rejection. */}}return {pose,geometryProvenance:'declared-plane',inWorld:true};},cloneMuzzle:()=>({pose,geometryProvenance:'declared-muzzle',inWorld:true}),pointAt:()=>pose.rotation!,selfRotate:q=>q},
 {begin:()=>{
  if(active)throw Error('Fixture active');active=true;marker=committed;let open=true,staged=marker;
  const stage:ReceiverSceneEnvironmentTransaction={
   advanceCallback:()=>{legacyCalls.push(1);throw Error('Legacy callback must not be used');},applyReceipt:()=>{legacyCalls.push(2);throw Error('Legacy receipt must not be used');},
   dispatchAt:(prefix,emit)=>{prefixes.push(prefix);retained=emit;if(mode==='retained')return;emit(birth('first'));staged++;marker=staged;if(mode==='recursive'||mode==='caught-recursive')return;emit(birth('second'));if(mode==='excess')emit(birth('third'));if(mode==='caught-excess'){try{emit(birth('third'));}catch{/* Deliberately swallows the budget rejection. */}}},
   snapshotAt:prefix=>({prefix,models:[],missing:[],provenance:'declared-empty-external-fixture'}),
   goodyContext:()=>({bspWorld:1,modelPosition:{x:0,y:0,z:0},eyePosition:{x:0,y:1,z:0},weapon:'rifle'}),stageEffects:()=>{},
   prepareCommit:()=>()=>{committed=marker;open=false;active=false;},rollback:()=>{if(!open)return;open=false;active=false;marker=committed;},
  };return stage;
 }},{model:{sceneGeneration:7,sourceScale:.02,goodyBspWorld:1,eyeHeight:1,maxModels:32,maxPickups:8},transient:{maxActors:2,maxModels:8,maxShaders:8},maxEffects:8});
 return {controller,observations,prefixes,legacyCalls,emit:(event:OriginalReceiverTransientBirth)=>retained!(event)};
}

describe('joint controller incremental constructor delivery (controlled environment)',()=>{
 it('finishes each constructor before the next environment command, without calling legacy arrays',()=>{
  const f=setup('ordered'),stage=f.controller.begin();stage.applyExternalReceipt(2,0);stage.commit();
  expect(f.observations).toEqual([0,1]);expect(f.legacyCalls).toEqual([]);expect(f.prefixes).toEqual([{kind:'receipt',tick:2,callback:0,sceneGeneration:7}]);
  expect(f.controller.debugState().fx.actors.map(a=>a.id)).toEqual(['first','second']);expect(f.controller.freezePublication().map(e=>e.kind)).toEqual(['sound','sound']);
 });
 it('invalidates a retained emitter immediately after synchronous dispatch returns',()=>{
  const f=setup('retained'),stage=f.controller.begin();stage.advanceExternalCallback(1);const before=f.controller.debugState();
  expect(()=>f.emit(birth('late'))).toThrow('birth budget');expect(f.controller.debugState()).toEqual(before);stage.commit();expect(f.controller.freezeTransientModels()).toEqual([]);expect(f.legacyCalls).toEqual([]);
 });
 for(const mode of ['recursive','excess'] as const)it(`rolls back ${mode} emissions and the joint clone allocator`,()=>{
  const f=setup(mode),before=f.controller.debugState(),stage=f.controller.begin();
  expect(()=>stage.applyExternalReceipt(0,0)).toThrow('birth budget');stage.rollback();expect(f.controller.debugState()).toEqual(before);expect(f.controller.freezePublication()).toEqual([]);
  const retry=f.controller.begin();expect(retry.allocateCloneName('plane')).toBe('plane1');retry.rollback();
 });
 for(const mode of ['caught-recursive','caught-excess'] as const)it(`keeps a ${mode} rejection fatal even when the provider catches it`,()=>{
  const f=setup(mode),before=f.controller.debugState(),stage=f.controller.begin();
  expect(()=>stage.applyExternalReceipt(0,0)).toThrow('dispatch failed');expect(()=>stage.prepareCommit()).toThrow('closed or failed');
  stage.rollback();expect(f.controller.debugState()).toEqual(before);expect(f.controller.freezePublication()).toEqual([]);
 });
});
