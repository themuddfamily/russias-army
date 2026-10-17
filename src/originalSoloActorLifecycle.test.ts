import {describe,it,expect,vi} from 'vitest';
import type {WeaponId} from '../shared/protocol';
import type {ReceiverModelEntry,ReceiverModelPose} from '../shared/originalReceiverModelWorld';
import {OriginalReceiverModelWorld} from '../shared/originalReceiverModelWorld';
import {createOriginalSoloActorDropCapture} from './originalSoloActorDropCapture';
import {captureOriginalSoloActorDropYawPlan,createOriginalSoloActorLifecycle,ORIGINAL_SOLO_GI_DECLARED_RADIUS,type OriginalSoloActorLifecycleOptions,type OriginalSoloActorDropYawPlan} from './originalSoloActorLifecycle';

const weapons=['pistol','shotgun','rifle','launcher','rpg','sniper'] as const;
const pose=():ReceiverModelPose=>({position:{x:4,y:7,z:-3},yaw:.4,phase:333.3,scale:.045,rotation:{x:0,y:0,z:0,w:1}});
const model=():ReceiverModelEntry=>({handle:'gi:baddy1',name:'baddy1',resource:'GI',kind:'gi',group:'soldiers',inWorld:true,geometryProvenance:'GI-pack',pose:pose()});
const plan=()=>captureOriginalSoloActorDropYawPlan(3,[{actorId:'actor',random36:7}],{maxEntries:8,maxTextChars:256});
function configuration():OriginalSoloActorLifecycleOptions {
 return {actorResources:{heldGunPose:()=>pose()},sourceScale:.02,gi:{pose:pose(),geometryProvenance:'GI-seed'},guns:Object.fromEntries(weapons.map((w,i)=>[w,{pose:{...pose(),phase:i,scale:1},geometryProvenance:`gun:${w}`}])) as OriginalSoloActorLifecycleOptions['guns'],parentRestoresMembership:true,readDropYawPlan:plan,maxTextChars:1024};
}
describe('detached source actor lifecycle',()=>{
 it('forwards actual detach admissions and preserves yaw across a rolled back lifecycle stage',()=>{
  let committed=0;const sample=vi.fn(()=>7),capture=createOriginalSoloActorDropCapture({sceneGeneration:7,maxEntries:8,maxTextChars:1024,sampleRandom36:sample,readCommittedCallback:()=>committed});
  const lifecycle=createOriginalSoloActorLifecycle({...configuration(),readDropYawPlan:capture.readDropYawPlan});
  const world=new OriginalReceiverModelWorld({...lifecycle,nearestDetailedDownward:()=>({hit:null,coverage:{complete:true,missing:[],provenance:'empty'}})},{eyeHeight:1,sourceScale:.02,goodyBspWorld:2,sceneGeneration:7,maxModels:32,maxPickups:8,dropRequestOwner:capture.requestOwner});
  const actorPose={position:{x:1,y:10,z:2},yaw:0,motionTime:0,weapon:'rpg' as const};
  let tx=world.begin();tx.admitExternalPrefix!({kind:'callback',sceneGeneration:7,callback:0});tx.advanceExternalCallback(0);tx.birth({actorId:'actor',targetFeet:actorPose.position,targetYaw:0,callback:0});tx.commit();expect(sample).not.toHaveBeenCalled();
  const detach=()=>{const stage=world.begin();stage.admitExternalPrefix!({kind:'callback',sceneGeneration:7,callback:1});stage.advanceExternalCallback(1);stage.detach('actor',actorPose,1);return stage;};
  tx=detach();const first=tx.freezeModels();tx.rollback();expect(world.freezePickups()).toEqual([]);expect(sample).toHaveBeenCalledTimes(1);
  tx=detach();expect(tx.freezeModels()).toEqual(first);tx.commit();committed=1;expect(sample).toHaveBeenCalledTimes(1);expect(world.freezeModels().find(m=>m.kind==='gun')!.pose.yaw).toBe(70*Math.PI/180);
  capture.release();expect(()=>lifecycle.dropYaw('actor',1)).toThrow('unavailable');
 });
 it('copies seven seed poses and provenance without deriving clone pose from a target',()=>{
  const options=configuration(),backend=createOriginalSoloActorLifecycle(options);options.gi.pose.position.x=99;
  const first=backend.cloneGI('baddy1'),second=backend.cloneGI('baddy2');expect(first.pose.position.x).toBe(4);expect(first.pose).not.toBe(second.pose);expect(Object.isFrozen(first.pose.position)).toBe(true);
  for(const [i,w] of weapons.entries()){const gun=backend.cloneGun(`gun${i}`,w);expect(gun.geometryProvenance).toBe(`gun:${w}`);expect(gun.pose.phase).toBe(i);expect(gun.pose.scale).toBe(1);}
 });
 it('computes declared GI world sphere once with model and source scales',()=>{
  const backend=createOriginalSoloActorLifecycle(configuration());expect(backend.sphere(model())).toEqual({bspWorld:ORIGINAL_SOLO_GI_DECLARED_RADIUS*.045*.02*.75,provenance:'declared-resource'});
  const dead=model();dead.pose.phase=3000;expect(backend.sphere(dead)).toEqual(backend.sphere(model()));
 });
 it('delegates the actual previous GI and weapon to the decoded resource provider and copies output',()=>{
  const output=pose(),heldGunPose=vi.fn(()=>output),options={...configuration(),actorResources:{heldGunPose}},backend=createOriginalSoloActorLifecycle(options),gi=model();
  const gun=backend.heldGunPose(gi,'sniper');expect(heldGunPose).toHaveBeenCalledWith(gi,'sniper');expect(gun).toEqual(output);expect(gun).not.toBe(output);output.position.x=88;expect(gun.position.x).toBe(4);
 });
 it.each([true,false])('uses explicit parent membership %s independent of prior gun bit',parentRestoresMembership=>{
  const backend=createOriginalSoloActorLifecycle({...configuration(),parentRestoresMembership});expect(backend.reparentGunMembership(false)).toBe(parentRestoresMembership);expect(backend.reparentGunMembership(true)).toBe(parentRestoresMembership);
 });
 it('captures detached source operands and repeats drop lookup without RNG',()=>{
  const samples=[{actorId:'actor',random36:7}],captured=captureOriginalSoloActorDropYawPlan(3,samples,{maxEntries:8,maxTextChars:256});samples[0].random36=33;
  const backend=createOriginalSoloActorLifecycle({...configuration(),readDropYawPlan:()=>captured});expect(Object.isFrozen(captured.entries[0])).toBe(true);expect(backend.dropYaw('actor',3)).toBe(70*Math.PI/180);expect(backend.dropYaw('actor',3)).toBe(70*Math.PI/180);
 });
 it('supports replacing caller plan only at a later captured plan boundary',()=>{
  let captured=plan();const backend=createOriginalSoloActorLifecycle({...configuration(),readDropYawPlan:()=>captured});expect(backend.dropYaw('actor',3)).toBe(70*Math.PI/180);
  captured=captureOriginalSoloActorDropYawPlan(4,[{actorId:'actor',random36:36}],{maxEntries:8,maxTextChars:256});expect(backend.dropYaw('actor',4)).toBe(2*Math.PI);expect(()=>backend.dropYaw('actor',3)).toThrow('plan');
 });
 it('rejects missing, wrong callback and counterfeit drop plans',()=>{
  const backend=createOriginalSoloActorLifecycle(configuration());expect(()=>backend.dropYaw('unknown',3)).toThrow('Missing');expect(()=>backend.dropYaw('actor',2)).toThrow('plan');
  const counterfeit=Object.freeze({callback:3,entries:Object.freeze([])}) as OriginalSoloActorDropYawPlan;expect(()=>createOriginalSoloActorLifecycle({...configuration(),readDropYawPlan:()=>counterfeit}).dropYaw('actor',3)).toThrow('plan');
 });
 it.each([0,37,1.5,NaN])('rejects invalid source random36 %s',random36=>{expect(()=>captureOriginalSoloActorDropYawPlan(3,[{actorId:'actor',random36}],{maxEntries:8,maxTextChars:256})).toThrow();});
 it('preflights duplicate identities and count/text limits',()=>{
  expect(()=>captureOriginalSoloActorDropYawPlan(3,[{actorId:'a',random36:1},{actorId:'a',random36:2}],{maxEntries:8,maxTextChars:256})).toThrow('Duplicate');
  expect(()=>captureOriginalSoloActorDropYawPlan(3,[{actorId:'aa',random36:1}],{maxEntries:1,maxTextChars:1})).toThrow();
  expect(()=>captureOriginalSoloActorDropYawPlan(3,[{actorId:'a',random36:1},{actorId:'b',random36:1}],{maxEntries:1,maxTextChars:256})).toThrow();
  expect(()=>captureOriginalSoloActorDropYawPlan(3,[],{maxEntries:257,maxTextChars:256})).toThrow();expect(()=>captureOriginalSoloActorDropYawPlan(3,[],{maxEntries:8,maxTextChars:65537})).toThrow();
 });
 it('rejects incomplete gun inventory, invalid phase, scale, quaternion and provenance',()=>{
  const missing=configuration();delete (missing.guns as Partial<Record<WeaponId,unknown>>).rpg;expect(()=>createOriginalSoloActorLifecycle(missing)).toThrow('Missing');
  for(const p of [{...pose(),phase:-1},{...pose(),scale:0},{...pose(),rotation:{x:0,y:0,z:0,w:0}}])expect(()=>createOriginalSoloActorLifecycle({...configuration(),gi:{pose:p,geometryProvenance:'GI'}})).toThrow();
  expect(()=>createOriginalSoloActorLifecycle({...configuration(),maxTextChars:1})).toThrow('budget');expect(()=>createOriginalSoloActorLifecycle({...configuration(),gi:{pose:pose(),geometryProvenance:''}})).toThrow();
 });
 it('rejects non GI spheres and overflow without fitting geometry',()=>{
  const backend=createOriginalSoloActorLifecycle(configuration());expect(()=>backend.sphere({...model(),kind:'gun'})).toThrow('GI');const huge=model();huge.pose.scale=Number.MAX_VALUE;expect(()=>backend.sphere(huge)).toThrow('overflow');
  expect(()=>backend.sphere({...model(),worldMatrix:[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]})).toThrow('explicit GI matrix');
 });
 it('rejects invalid clone identities and unknown gun operands',()=>{
  const backend=createOriginalSoloActorLifecycle(configuration());expect(()=>backend.cloneGI('')).toThrow();expect(()=>backend.cloneGI('a'.repeat(1025))).toThrow('budget');expect(()=>backend.cloneGun('gun','bad' as WeaponId)).toThrow('Unknown');
 });
 it('checks resource descriptor scale and validates GI before calling borrowed provider',()=>{
  const options=configuration(),heldGunPose=vi.fn(()=>pose());
  expect(()=>createOriginalSoloActorLifecycle({...options,actorResources:{heldGunPose,readResourceDescriptor:()=>({sourceScale:.03,giResourceOrientation:{x:0,y:0,z:0,w:1},resourceBindingId:'pack',provenance:'pack'})}})).toThrow('scale mismatch');
  const backend=createOriginalSoloActorLifecycle({...options,actorResources:{heldGunPose}});
  expect(()=>backend.heldGunPose({...model(),pose:{...pose(),phase:-1}},'rifle')).toThrow();
  expect(()=>backend.heldGunPose({...model(),kind:'gun'},'rifle')).toThrow();
  expect(()=>backend.heldGunPose({...model(),worldMatrix:new Array(16).fill(NaN)},'rifle')).toThrow('matrix');
  expect(()=>backend.heldGunPose({...model(),worldMatrix:null as unknown as readonly number[]},'rifle')).toThrow('matrix');
  expect(heldGunPose).not.toHaveBeenCalled();expect(()=>backend.dropYaw('a'.repeat(1025),3)).toThrow('key');
 });
});
