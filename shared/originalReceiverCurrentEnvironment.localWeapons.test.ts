import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {describe,expect,it,vi} from 'vitest';
import {OriginalReceiverCurrentEnvironment,type ReceiverCurrentEnvironmentArm,type ReceiverCurrentEnvironmentOptions} from './originalReceiverCurrentEnvironment';
import {OriginalReceiverLocalWeaponWorld,type ReceiverLocalWeaponWorldCheckpoint,type ReceiverLocalWeaponBindingOperation} from './originalReceiverLocalWeaponWorld';
import {createOriginalReceiverLocalWeaponInventory,ORIGINAL_RECEIVER_LOCAL_WEAPON_RESOURCES} from './originalReceiverLocalWeaponInventory';
import {OriginalBarrelWorld} from './originalBarrelWorld';
import {OriginalDoorWorld} from './originalDoorWorld';
import {registerOriginalMapRuntime,type OriginalMapRuntime} from './originalMapRuntime';
import {createOriginalPlayerHealth} from './originalPlayerHealth';
import type {OriginalSceneData} from './originalSceneGeometry';
import type {ReceiverWeaponGeometry} from './originalReceiverActorResources';
import type {ReceiverScenePrefix} from './originalReceiverPrefix';
import type {OriginalReceiverTransientBirth,OriginalReceiverTransientEffect} from './originalReceiverTransientWorld';
import {OriginalReceiverSceneController} from './originalReceiverSceneController';
import type {ReceiverModelBackend} from './originalReceiverModelWorld';
import type {OriginalReceiverTransientBackend} from './originalReceiverTransientWorld';

const I=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
const receipt=(tick=0):ReceiverScenePrefix=>({kind:'receipt',sceneGeneration:4,callback:0,tick});
const callback:ReceiverScenePrefix={kind:'callback',sceneGeneration:4,callback:1};
let cachedRuntime:OriginalMapRuntime|undefined;
const runtime=()=>cachedRuntime??=registerOriginalMapRuntime('woodlands',JSON.parse(readFileSync(new URL('../public/assets/original-scenes/woodland/scene.json',import.meta.url),'utf8')) as OriginalSceneData);
const selected={rifle:'ak47',pistol:'pistol',shotgun:'spas12',sniper:'dragunov',rpg:'rpg',launcher:'rg6'} as const;
const event=(id:string,weapon:'rifle'|'pistol'='rifle'):OriginalReceiverTransientBirth=>({kind:'muzzle',id,weapon,gunPose:{position:{x:0,y:0,z:0},yaw:0,phase:0,scale:1,rotation:{x:0,y:0,z:0,w:1}}});
const hurt:Extract<OriginalReceiverTransientEffect,{kind:'bang-hurt'}>={kind:'bang-hurt',effectId:'declared-joint-hurt',position:{x:0,y:0,z:0},amount:5,radiusSource:250,attackerName:null};
// This fixture's all-seven binding is explicit CPU policy. Native parenting,
// local gun placement and complete scene coverage remain separate evidence.
function bind(op:ReceiverLocalWeaponBindingOperation,state:ReceiverLocalWeaponWorldCheckpoint){
 let models=state.models,loadedRocket=state.loadedRocket;
 if(op.kind==='whichgun')models=models.map(m=>m.handle==='rocket'?m:{...m,inWorld:op.weapon!==null&&m.handle===selected[op.weapon],groupAncestry:op.weapon!==null&&m.handle===selected[op.weapon]?['private-camera']:['declared-template']});
 if(op.kind==='rocket'){loadedRocket=op.loadedRocket;models=models.map(m=>m.handle==='rocket'?{...m,inWorld:op.loadedRocket}:m);}
 if(op.kind==='position'){const scale=runtime().scale,p=op.positionSource,world=new THREE.Matrix4().fromArray([...state.cameraWorldMatrix]).multiply(new THREE.Matrix4().makeTranslation(p.x*scale,p.y*scale,p.z*scale)).multiply(new THREE.Matrix4().makeScale(scale,scale,scale)).toArray();models=models.map(m=>m.handle===selected[op.weapon]?{...m,worldMatrix:world}:m);}
 return {models,loadedRocket};
}
function setup(extra:Partial<ReceiverCurrentEnvironmentOptions>={},binding=bind,withBank=true){
 const r=runtime(),barrels=new OriginalBarrelWorld(r),doors=new OriginalDoorWorld(r.data,r.scale,{version:1,doors:[]}),target={health:createOriginalPlayerHealth(100,2),alive:true},ops:ReceiverLocalWeaponBindingOperation[]=[];
 const checkpoint:ReceiverLocalWeaponWorldCheckpoint={prefix:receipt(),cameraHandle:'private-camera',cameraWorldMatrix:I,selectedWeapon:'rifle',loadedRocket:false,motion:{weapon:'rifle',ticker:1,gunPositionSource:{x:-12,y:-20,z:5}},models:Object.entries(ORIGINAL_RECEIVER_LOCAL_WEAPON_RESOURCES).map(([handle,resource])=>({handle:handle as ReceiverLocalWeaponWorldCheckpoint['models'][number]['handle'],resource,worldMatrix:[...I],inWorld:handle==='ak47',groupAncestry:handle==='ak47'?['private-camera']:['declared-template']}))};
 const bank=new OriginalReceiverLocalWeaponWorld(checkpoint,{sourceScale:r.scale,maxCommands:32,maxTextChars:8192,bindModels:(op,state)=>{ops.push(op);return binding(op,state);}});
 const provider=createOriginalReceiverLocalWeaponInventory(JSON.parse(readFileSync(new URL('../public/assets/original-weapons/geometry.json',import.meta.url),'utf8')) as ReceiverWeaponGeometry,{sceneGeneration:4,maxModels:7,maxVertices:100000,maxFaces:100000,provenance:'declared-joint-weapon-binding',sidedness:'double'});
 const captured:NonNullable<Parameters<ReceiverCurrentEnvironmentOptions['snapshotAt']>[1]['localWeapons']>[]=[];
 const options:ReceiverCurrentEnvironmentOptions={sceneGeneration:4,sourceScale:r.scale,target,barrels,doors,...(withBank?{localWeaponWorld:bank}:{}),maxCommands:16,maxOutcomes:16,maxModels:32,maxTextChars:8192,snapshotAt:(prefix,state)=>{
  if(!state.localWeapons)return {prefix,models:[],missing:['local-camera-weapon','actor-ledger'],provenance:'declared-absent-bank'};
  captured.push(state.localWeapons);const snapshot=provider.snapshotAt(prefix,state.localWeapons);return {prefix,models:snapshot.models,missing:['actor-ledger'],provenance:snapshot.provenance};
 },...extra};
 const env=new OriginalReceiverCurrentEnvironment(options);
 const frame=(commands:ReceiverCurrentEnvironmentArm['frames'][number]['commands']=[],cameraWorldMatrix:readonly number[]=I,velocityWorld={x:0,y:0,z:0}):ReceiverCurrentEnvironmentArm=>({physicalCallback:1,goody:{bspWorld:50*r.scale,eyePosition:{x:0,y:0,z:0},modelPosition:{x:0,y:-1,z:0},weapon:'rifle'},frames:[{prefix:callback,commands,localWeapon:{cameraWorldMatrix,velocityWorld}}]});
 return {env,bank,provider,barrels,doors,target,captured,ops,frame,options};
}

describe('CURRENT environment joint local weapon stage (real resources, explicit CPU binding)',()=>{
 it('interleaves fire and selection births against old WORLD, then publishes final all-seven query matrices',()=>{
  const f=setup(),before=f.bank.freeze();f.env.arm(f.frame([{kind:'weapon-fire'},{kind:'transient-birth',event:event('old-rifle-shot')},{kind:'weapon-equip',weapon:'pistol'},{kind:'transient-birth',event:event('new-selection','pistol')} ]));const tx=f.env.begin(),observed:{id:string;selected:unknown;matrix:readonly number[]}[]=[];
  tx.dispatchAt!(callback,birth=>{tx.snapshotAt(callback);const capture=f.captured.at(-1)!;observed.push({id:birth.id,selected:capture.selectedWeapon,matrix:capture.models.find(m=>m.handle==='ak47')!.worldMatrix});});const final=tx.snapshotAt(callback);expect(observed.map(o=>[o.id,o.selected])).toEqual([['old-rifle-shot','rifle'],['new-selection','pistol']]);expect(observed.every(o=>o.matrix.every((v,i)=>v===before.models.find(m=>m.handle==='ak47')!.worldMatrix[i]))).toBe(true);expect(final.models).toHaveLength(7);expect(final.missing).toEqual(['actor-ledger']);expect(final.models.find(m=>m.handle==='pistol')!.worldMatrix![14]).toBeCloseTo(3.5*runtime().scale);tx.prepareCommit()();expect(f.bank.freeze().selectedWeapon).toBe('pistol');expect(f.ops.map(o=>o.kind)).toEqual(['camera','whichgun','position']);
 });
 it('receipts at the same physical callback preserve all models and ticker without camera or gun bindings',()=>{
  const f=setup(),before=f.bank.freeze();for(const tick of [1,2]){f.env.arm({physicalCallback:0,goody:null,frames:[{prefix:receipt(tick),commands:[]}]});const tx=f.env.begin();tx.applyReceipt(tick,0);expect(tx.snapshotAt(receipt(tick)).models).toHaveLength(7);tx.prepareCommit()();}expect(f.ops).toEqual([]);expect(f.bank.freeze().motion).toEqual(before.motion);expect(f.bank.freeze().models).toEqual(before.models);expect(f.bank.freeze().prefix).toEqual(receipt(2));
 });
 it('captures full affine camera and three-dimensional WORLD speed exactly once at callback finish',()=>{
  const f=setup(),camera=new THREE.Matrix4().compose(new THREE.Vector3(10,20,30),new THREE.Quaternion().setFromEuler(new THREE.Euler(.2,.4,.6)),new THREE.Vector3(2,3,4)).toArray(),scale=runtime().scale;f.env.arm(f.frame([],camera,{x:3*scale,y:4*scale,z:12*scale}));const tx=f.env.begin();tx.advanceCallback(1);tx.prepareCommit()();expect(f.bank.freeze().cameraWorldMatrix).toEqual(camera);expect(f.bank.freeze().motion.ticker).toBeCloseTo(1+13*.05);expect(f.ops.filter(o=>o.kind==='position')).toHaveLength(1);const position=f.ops.find(o=>o.kind==='position')!;if(position.kind!=='position')throw Error('missing final assignment');const expected=new THREE.Matrix4().fromArray(camera).multiply(new THREE.Matrix4().makeTranslation(position.positionSource.x*scale,position.positionSource.y*scale,position.positionSource.z*scale)).multiply(new THREE.Matrix4().makeScale(scale,scale,scale)).toArray();expect(f.bank.freeze().models.find(m=>m.handle==='ak47')!.worldMatrix).toEqual(expected);
 });
 it('rolls back jointly prepared bank, health, outcomes and dynamics, retaining an identical arm for retry',()=>{
  const f=setup(),before=f.bank.freeze(),barrels=f.barrels.snapshots();f.env.arm(f.frame([{kind:'weapon-fire'},{kind:'weapon-rocket',loadedRocket:true}]));let tx=f.env.begin();tx.advanceCallback(1);tx.stageEffects([hurt],callback);const pending=f.captured.length;const publish=tx.prepareCommit();expect(f.target.health.canonical).toBe(100);tx.rollback();publish();expect(f.bank.freeze()).toBe(before);expect(f.target.health).toEqual({canonical:100,flick:2});expect(f.barrels.snapshots()).toEqual(barrels);expect(f.env.drainOutcomes()).toEqual([]);
  tx=f.env.begin();tx.advanceCallback(1);tx.stageEffects([hurt],callback);tx.snapshotAt(callback);tx.prepareCommit()();expect(f.target.health.canonical).toBe(95);expect(f.bank.freeze().loadedRocket).toBe(true);expect(f.captured.length).toBe(pending+1);expect(f.env.drainOutcomes()[0]).toMatchObject({effectId:hurt.effectId,health:95});
 });
 it('releases earlier participant locks when a later adopter fails, then retries the same bank stage',()=>{
  const f=setup(),before=f.bank.freeze();f.env.arm(f.frame([{kind:'weapon-fire'}]));let tx=f.env.begin();tx.advanceCallback(1);const failure=vi.spyOn(f.doors,'prepareAdopt').mockImplementationOnce(()=>{throw Error('second adopter rejected');});expect(()=>tx.prepareCommit()).toThrow('second adopter rejected');tx.rollback();failure.mockRestore();expect(f.bank.freeze()).toBe(before);const candidate=f.barrels.fork(),probe=f.barrels.prepareAdopt(candidate);probe.rollback();tx=f.env.begin();tx.advanceCallback(1);tx.prepareCommit()();expect(f.bank.freeze()).not.toBe(before);
 });
 it('poisons malformed hook results and preserves all committed participants until explicit rollback',()=>{
  const f=setup({},(op,state)=>{const answer=bind(op,state);return op.kind==='position'?{...answer,models:answer.models.slice(1)}:answer;}),before=f.bank.freeze();f.env.arm(f.frame());const tx=f.env.begin();expect(()=>tx.advanceCallback(1)).toThrow();expect(()=>tx.prepareCommit()).toThrow();tx.rollback();expect(f.bank.freeze()).toBe(before);expect(f.target.health.canonical).toBe(100);expect(f.env.drainOutcomes()).toEqual([]);
  const terminal=setup(),oldBank=terminal.bank.freeze();terminal.target.health.canonical=0;terminal.env.arm(terminal.frame([{kind:'transient-birth',event:event('declared-terminal-transition')},{kind:'weapon-whichgun',weapon:'pistol'}]));const stage=terminal.env.begin();expect(()=>stage.dispatchAt!(callback,()=>stage.stageEffects([hurt],callback))).toThrow();expect(terminal.ops.map(op=>op.kind)).toEqual(['camera']);expect(()=>stage.prepareCommit()).toThrow();stage.rollback();expect(terminal.bank.freeze()).toBe(oldBank);expect(terminal.target).toMatchObject({alive:true,health:{canonical:0,flick:2}});expect(terminal.env.drainOutcomes()).toEqual([]);
 });
 it('copies armed camera, velocity and commands so caller mutation cannot change the staged assignment',()=>{
  const f=setup(),camera=[...I],velocity={x:0,y:0,z:0},commands=[{kind:'weapon-equip' as const,weapon:'pistol' as const}],input=f.frame(commands,camera,velocity);f.env.arm(input);camera[12]=999;velocity.y=999;commands.pop();const tx=f.env.begin();tx.advanceCallback(1);tx.prepareCommit()();expect(f.bank.freeze().selectedWeapon).toBe('pistol');expect(f.bank.freeze().motion.ticker).toBe(1);expect(f.bank.freeze().cameraWorldMatrix[12]).toBe(0);
 });
 it('rejects oversized command arrays before entry/iterator access and invalid frame-bank metadata before arm',()=>{
  const f=setup({maxCommands:1}),oversized=new Array(2);let reads=0;Object.defineProperty(oversized,0,{get:()=>{reads++;throw Error('entry read');}});Object.defineProperty(oversized,Symbol.iterator,{get:()=>{reads++;throw Error('iterator read');}});expect(()=>f.env.arm(f.frame(oversized))).toThrow('budget');expect(reads).toBe(0);
  expect(()=>f.env.arm({...f.frame(),frames:[{prefix:callback,commands:[]}]})).toThrow();expect(()=>f.env.arm({physicalCallback:0,goody:null,frames:[{prefix:receipt(1),commands:[],localWeapon:{cameraWorldMatrix:I,velocityWorld:{x:0,y:0,z:0}}}]})).toThrow();
  const original=f.bank.freeze();for(const kind of ['scale','generation']){const bank=new OriginalReceiverLocalWeaponWorld({...original,prefix:kind==='generation'?{...original.prefix,sceneGeneration:5}:original.prefix},{sourceScale:runtime().scale*(kind==='scale'?2:1),maxCommands:32,maxTextChars:8192,bindModels:bind});expect(()=>new OriginalReceiverCurrentEnvironment({...f.options,localWeaponWorld:bank})).toThrow(kind==='scale'?'binding':'clock');}
  f.env.arm(f.frame());const stage=f.env.begin();stage.advanceCallback(1);stage.prepareCommit()();
 });
 it('preserves optional compatibility while refusing weapon commands or callback metadata without a bank',()=>{
  const f=setup({},bind,false);f.env.arm({physicalCallback:1,goody:null,frames:[{prefix:callback,commands:[]}]});const tx=f.env.begin();tx.advanceCallback(1);expect(tx.snapshotAt(callback).missing).toEqual(['local-camera-weapon','actor-ledger']);tx.prepareCommit()();expect(f.ops).toEqual([]);
  const without=setup({},bind,false);expect(()=>without.env.arm(without.frame())).toThrow();expect(()=>without.env.arm({physicalCallback:1,goody:null,frames:[{prefix:callback,commands:[{kind:'weapon-fire'}]}]})).toThrow();
 });
 it('does not wedge the environment if bank acquisition fails before staging, and publishes no closed bank',()=>{
  const f=setup(),blocked=f.bank.begin();f.env.arm(f.frame());expect(()=>f.env.begin()).toThrow('active');blocked.rollback();const tx=f.env.begin();tx.advanceCallback(1);tx.rollback();expect(f.bank.freeze().prefix).toEqual(receipt());const retry=f.env.begin();retry.advanceCallback(1);retry.prepareCommit()();expect(f.bank.freeze().prefix).toEqual(callback);
  const closed=setup();closed.env.arm(closed.frame());const stage=closed.env.begin();stage.advanceCallback(1);stage.stageEffects([hurt],callback);closed.bank.release();expect(()=>stage.prepareCommit()).toThrow();stage.rollback();expect(closed.target.health).toEqual({canonical:100,flick:2});expect(closed.env.drainOutcomes()).toEqual([]);expect(()=>closed.bank.begin()).toThrow();
 });
 it('distinguishes absent goody skipping the whole bank callback from living selected VOID ticking only motion',()=>{
  const skipped=setup(),before=skipped.bank.freeze();skipped.env.arm({physicalCallback:1,goody:null,frames:[{prefix:callback,commands:[]}]});const deadStage=skipped.env.begin();deadStage.advanceCallback(1);deadStage.prepareCommit()();expect(skipped.bank.freeze().prefix).toEqual(callback);expect(skipped.bank.freeze().motion).toEqual(before.motion);expect(skipped.bank.freeze().models).toEqual(before.models);expect(skipped.ops).toEqual([]);
  const live=setup();live.env.arm(live.frame([{kind:'weapon-whichgun',weapon:null}],I,{x:100*runtime().scale,y:0,z:0}));const stage=live.env.begin();stage.advanceCallback(1);stage.prepareCommit()();expect(live.bank.freeze().motion.weapon).toBeNull();expect(live.bank.freeze().motion.ticker).toBe(6);expect(live.ops.map(op=>op.kind)).toEqual(['camera','whichgun']);
  const invalid=setup();expect(()=>invalid.env.arm({...invalid.frame(),goody:null})).toThrow();expect(()=>invalid.env.arm({physicalCallback:1,goody:null,frames:[{prefix:callback,commands:[{kind:'weapon-fire'}]}]})).toThrow();
 });
 it('forwards the staged seven-model inventory through the actual joint controller at receipt and callback prefixes',()=>{
  const f=setup(),pose={position:{x:0,y:0,z:0},yaw:0,phase:0,scale:1,rotation:{x:0,y:0,z:0,w:1}},queries:{prefix:ReceiverScenePrefix|undefined;local:number}[]=[];
  const model:ReceiverModelBackend={cloneGI:()=>({pose,geometryProvenance:'declared-GI'}),cloneGun:()=>({pose,geometryProvenance:'declared-gun'}),sphere:()=>({bspWorld:1,provenance:'declared-resource'}),heldGunPose:gi=>gi.pose,reparentGunMembership:()=>true,dropYaw:()=>0,nearestDetailedDownward:(_o,models,_cb,_g,p)=>{queries.push({prefix:p,local:models.filter(m=>m.kind==='local-weapon').length});return {hit:null,coverage:{complete:true,missing:[],provenance:'declared-CPU-query-subset'}};}};
  const transient:OriginalReceiverTransientBackend={clonePlane:()=>({pose,geometryProvenance:'declared-plane',inWorld:true}),cloneMuzzle:()=>({pose,geometryProvenance:'declared-muzzle',inWorld:true}),pointAt:()=>pose.rotation,selfRotate:rotation=>rotation};
  // This oracle attests only the declared CPU query fixture. It does not
  // discharge native external classes or activate the production factory.
  const closed=new OriginalReceiverCurrentEnvironment({...f.options,snapshotAt:(prefix,state)=>{f.captured.push(state.localWeapons!);const snapshot=f.provider.snapshotAt(prefix,state.localWeapons!);return {prefix,models:snapshot.models,missing:[],provenance:'declared-CPU-closed-subset'};}});
  const controller=new OriginalReceiverSceneController(model,transient,closed,{model:{eyeHeight:1,sourceScale:runtime().scale,goodyBspWorld:1,sceneGeneration:4,maxModels:32,maxPickups:8},transient:{maxModels:16,maxActors:16,maxShaders:16},maxEffects:32}),input=f.frame([{kind:'weapon-fire'}]);closed.arm({...input,frames:[{prefix:receipt(1),commands:[]},...input.frames]});const tx=controller.begin();tx.applyExternalReceipt(1,0);tx.birth({actorId:'remote',targetFeet:{x:0,y:10,z:0},targetYaw:0,callback:0});tx.advanceExternalCallback(1);tx.commit();
  expect(queries).toEqual([{prefix:receipt(1),local:7}]);expect(f.captured.map(c=>c.prefix)).toEqual([receipt(1),callback]);const final=controller.freezeModels().filter(m=>m.kind==='local-weapon');expect(final).toHaveLength(7);expect(final.find(m=>m.handle==='ak47')!.worldMatrix).toEqual(f.bank.freeze().models.find(m=>m.handle==='ak47')!.worldMatrix);expect(controller.freezePublication()).toEqual([]);
 });
});
