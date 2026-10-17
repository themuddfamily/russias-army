import {readFileSync} from 'node:fs';
import {describe,expect,it,vi} from 'vitest';
import {OriginalReceiverCurrentEnvironment,type ReceiverCurrentEnvironmentCommand,type ReceiverCurrentEnvironmentOptions} from './originalReceiverCurrentEnvironment';
import {OriginalReceiverProjectileWorld,type ReceiverProjectileWorldModel,type ReceiverProjectileWorldCheckpoint} from './originalReceiverProjectileWorld';
import {createOriginalReceiverProjectileInventory} from './originalReceiverProjectileInventory';
import {OriginalReceiverLocalWeaponWorld,type ReceiverLocalWeaponWorldCheckpoint} from './originalReceiverLocalWeaponWorld';
import {ORIGINAL_RECEIVER_LOCAL_WEAPON_RESOURCES} from './originalReceiverLocalWeaponInventory';
import {OriginalReceiverSceneController,type ReceiverSceneEnvironmentTransaction} from './originalReceiverSceneController';
import {OriginalRemoteView} from './originalRemoteView';
import {OriginalBarrelWorld} from './originalBarrelWorld';
import {OriginalDoorWorld} from './originalDoorWorld';
import {registerOriginalMapRuntime,type OriginalMapRuntime} from './originalMapRuntime';
import {createOriginalPlayerHealth} from './originalPlayerHealth';
import type {ReceiverWeaponGeometry} from './originalReceiverActorResources';
import type {ReceiverScenePrefix} from './originalReceiverPrefix';
import type {ReceiverModelBackend,ReceiverModelEntry,ReceiverModelPose} from './originalReceiverModelWorld';

const I=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
const receipt=(tick=0):ReceiverScenePrefix=>({kind:'receipt',sceneGeneration:7,callback:0,tick});
const callback:ReceiverScenePrefix={kind:'callback',sceneGeneration:7,callback:1};
let savedRuntime:OriginalMapRuntime|undefined;
const runtime=()=>savedRuntime??=registerOriginalMapRuntime('woodlands',JSON.parse(readFileSync(new URL('../public/assets/original-scenes/woodland/scene.json',import.meta.url),'utf8')));
const matrix=(x=11,y=22,z=33)=>{const m=[...I];m[12]=x;m[13]=y;m[14]=z;return m;};
const projectile=(handle:string):ReceiverProjectileWorldModel=>({handle,resource:'rg6grenade',inWorld:true,materialHandle:'declared-grenade-shader',worldMatrix:matrix(),groupAncestry:['declared-projectiles']});
const checkpoint=():ReceiverProjectileWorldCheckpoint=>({prefix:{kind:'callback',sceneGeneration:7,callback:0},template:{...projectile('grenade'),inWorld:false,worldMatrix:[...I]},catalog:[],models:[],actors:[],fifo:{launcher:[],rpg:[]}});
const bang={kind:'bang' as const,id:'declared-retirement',position:{x:11,y:22,z:33},type:'grenade' as const,attackerName:''};
const retire:ReceiverCurrentEnvironmentCommand={kind:'projectile-retire',launchId:'launch:L',event:bang};
const puff:ReceiverCurrentEnvironmentCommand={kind:'transient-birth',event:{kind:'puff',id:'after-removal',position:{x:0,y:0,z:0},angleSourceDegrees:10}};
function setup(extra:Partial<ReceiverCurrentEnvironmentOptions>={},withLocal=false,withProjectiles=true){
 const r=runtime(),barrels=new OriginalBarrelWorld(r),doors=new OriginalDoorWorld(r.data,r.scale,{version:1,doors:[]}),target={health:createOriginalPlayerHealth(),alive:true},bank=new OriginalReceiverProjectileWorld(checkpoint(),{maxModels:32,maxActors:16,maxCommands:32,maxTextChars:65536,rocketMaterialHandle:'declared-rpg-shader'}),names:string[]=[];
 const localSeed:ReceiverLocalWeaponWorldCheckpoint={prefix:checkpoint().prefix,cameraHandle:'private-camera',cameraWorldMatrix:I,selectedWeapon:'rifle',loadedRocket:false,motion:{weapon:'rifle',ticker:1,gunPositionSource:{x:-12,y:-20,z:5}},models:Object.entries(ORIGINAL_RECEIVER_LOCAL_WEAPON_RESOURCES).map(([handle,resource])=>({handle:handle as ReceiverLocalWeaponWorldCheckpoint['models'][number]['handle'],resource,inWorld:handle==='ak47',worldMatrix:[...I],groupAncestry:['declared-local']}))},local=new OriginalReceiverLocalWeaponWorld(localSeed,{sourceScale:r.scale,maxCommands:32,maxTextChars:8192,bindModels:(_op,state)=>({models:state.models,loadedRocket:state.loadedRocket})});
 const inventory=createOriginalReceiverProjectileInventory(JSON.parse(readFileSync(new URL('../public/assets/original-weapons/geometry.json',import.meta.url),'utf8')) as ReceiverWeaponGeometry,{sceneGeneration:7,provenance:'declared-CURRENT-projectile-bank',sidedness:'double',maxModels:32,maxVertices:100000,maxFaces:100000}),captures:{prefix:ReceiverScenePrefix;models:readonly ReceiverModelEntry[];expected:readonly string[]}[]=[],flags={missing:false};
 const options:ReceiverCurrentEnvironmentOptions={sceneGeneration:7,sourceScale:r.scale,target,barrels,doors,...(withProjectiles?{projectileWorld:bank}:{}),...(withLocal?{localWeaponWorld:local}:{}),maxCommands:16,maxOutcomes:16,maxModels:128,maxTextChars:65536,snapshotAt:(prefix,state)=>{
  if(!state.projectiles)return {prefix,models:[],missing:['projectile','actor-ledger'],provenance:'declared-absent-projectile-bank'};
  const snapshot=inventory.snapshotAt(prefix,state.projectiles);captures.push({prefix,models:snapshot.models,expected:state.projectiles.expectedHandles});
  // Empty missing[] closes this declared CPU oracle only. Independently
  // injected native-class uncertainty remains unresolved in the negative case.
  return {prefix,models:snapshot.models,missing:flags.missing?['unresolved-native-class']:[],provenance:snapshot.provenance};
 },...extra},env=new OriginalReceiverCurrentEnvironment(options);
 const birth:ReceiverCurrentEnvironmentCommand={kind:'projectile-birth',birth:{launchId:'launch:L',weapon:'launcher',cloneFresh:name=>{names.push(name??'manual-grenade');return projectile(name??'manual-grenade');},resetModel:retained=>({...retained,worldMatrix:matrix()})}};
 const arm=(commands:readonly ReceiverCurrentEnvironmentCommand[]=[])=>env.arm({physicalCallback:0,goody:{bspWorld:50*r.scale,eyePosition:{x:0,y:0,z:0},modelPosition:{x:0,y:-1,z:0},weapon:'rifle'},frames:[{prefix:receipt(),commands}]});
 return {env,options,bank,local,barrels,doors,target,names,inventory,captures,flags,birth,arm};
}
function controllerFixture(){
 const f=setup(),pose:ReceiverModelPose={position:{x:0,y:0,z:0},yaw:0,phase:0,scale:1,rotation:{x:0,y:0,z:0,w:1}},planeNames:string[]=[];let active:ReceiverSceneEnvironmentTransaction|undefined;const flags=Object.assign(f.flags,{failPlane:0});let planes=0;
 const queries:{prefix:ReceiverScenePrefix|undefined;models:readonly Readonly<ReceiverModelEntry>[]}[]=[];
 const model:ReceiverModelBackend={cloneGI:()=>({pose,geometryProvenance:'declared-GI'}),cloneGun:()=>({pose,geometryProvenance:'declared-gun'}),sphere:()=>({bspWorld:1,provenance:'declared-resource'}),heldGunPose:gi=>gi.pose,reparentGunMembership:()=>true,dropYaw:()=>0,nearestDetailedDownward:(_origin,models,_cb,_generation,prefix)=>{queries.push({prefix,models});return {hit:null,coverage:{complete:true,missing:[],provenance:'declared-query-subset'}};}};
 const controller=new OriginalReceiverSceneController(model,{clonePlane:name=>{planeNames.push(name);active!.snapshotAt(receipt());if(++planes===flags.failPlane)throw Error('later plane failure');return {pose,geometryProvenance:'declared-plane',inWorld:true};},cloneMuzzle:()=>({pose,geometryProvenance:'declared-muzzle',inWorld:true}),pointAt:()=>pose.rotation!,selfRotate:q=>q},{begin:allocator=>{active=f.env.begin(allocator);return active;}},{model:{sceneGeneration:7,sourceScale:runtime().scale,eyeHeight:1,goodyBspWorld:1,maxModels:128,maxPickups:16},transient:{maxModels:32,maxActors:32,maxShaders:32},maxEffects:64}),view=new OriginalRemoteView(0,{},'source-callback',controller);
 const freeze=()=>({bank:f.bank.freeze(),local:f.local.freeze(),models:controller.freezeModels(),fx:controller.debugState().fx,publication:controller.freezePublication(),version:controller.freezePublicationVersion(),target:structuredClone(f.target),clock:view.debugState(),actors:view.freeze()});
 const send=()=>view.recordSent({tick:0,sentAt:0,targets:[{id:'remote',position:{x:0,y:10,z:0},yaw:0,motionTime:0,alive:true,weapon:'rifle'}]});
 return {...f,controller,view,planeNames,queries,flags,freeze,send,resetPlanes:()=>{planes=0;}};
}

// Source inputs are explicit captures and pure constructor hooks. No physics
// simulation, fuse/contact inference, native reset pose/material pixels or
// global actor chronology is established by this optional adapter wiring.
describe('CURRENT projectile bank joint staging and ordered retirement (CPU resources)',()=>{
 it('keeps the projectile inWorld during retirement emission, then exposes offworld retained history to the next command',()=>{
  const f=setup();f.arm([f.birth,retire,puff]);const stage=f.env.begin(),during:{id:string;inWorld:boolean;matrix:readonly number[]}[]=[];stage.dispatchAt!(receipt(),event=>{const snapshot=stage.snapshotAt(receipt()),model=snapshot.models.find(m=>m.handle==='manual-grenade')!;during.push({id:event.id,inWorld:model.inWorld,matrix:model.worldMatrix!});});stage.prepareCommit()();expect(during.map(d=>[d.id,d.inWorld])).toEqual([['declared-retirement',true],['after-removal',false]]);expect(during.every(d=>d.matrix.every((v,i)=>v===matrix()[i]))).toBe(true);expect(f.bank.freeze().actors).toEqual([]);expect(f.bank.freeze().fifo.launcher).toEqual(['manual-grenade']);expect(f.bank.snapshotAt(receipt()).expectedHandles).toEqual(['grenade','manual-grenade']);
 });
 it('connects actual Controller/View and shares clone names across projectile, FX shaders and newborn GI',()=>{
  const f=controllerFixture();f.arm([f.birth,retire,puff]);expect(f.send()).toEqual({ok:true});expect(f.view.accept({callbacks:0,receipts:[{tick:0,callbacks:0}]},0)).toEqual({ok:true});expect(f.names).toEqual(['grenade1']);expect(f.planeNames).toEqual(['plane2','plane4']);expect(f.captures.slice(0,2).map(c=>c.models.find(m=>m.handle==='grenade1')!.inWorld)).toEqual([true,false]);expect(f.controller.freezeModels().find(m=>m.kind==='gi')!.name).toBe('baddy6');expect(f.queries[0].models.find(m=>m.handle==='grenade1')!.inWorld).toBe(false);expect(f.controller.freezePublication().map(e=>e.kind)).toEqual(['sound']);
 });
 it('rolls back mirror, projectile FIFO/catalog, FX, clone counter and publications on a later emitter failure then retries names',()=>{
  const f=controllerFixture();f.arm([f.birth,retire,puff]);f.send();const before=f.freeze();f.flags.failPlane=2;expect(()=>f.view.accept({callbacks:0,receipts:[{tick:0,callbacks:0}]},0)).toThrow('later plane failure');expect(f.freeze()).toEqual(before);expect(f.env.drainOutcomes()).toEqual([]);f.flags.failPlane=0;f.resetPlanes();f.names.length=0;f.planeNames.length=0;expect(f.view.accept({callbacks:0,receipts:[{tick:0,callbacks:0}]},0)).toEqual({ok:true});expect(f.names).toEqual(['grenade1']);expect(f.planeNames).toEqual(['plane2','plane4']);expect(f.controller.freezeModels().find(m=>m.kind==='gi')!.name).toBe('baddy6');
 });
 it('copies exact full affine pose/model commands and permits receipt events without aging retained models',()=>{
  const f=setup(),owned=projectile('manual-grenade'),affine=matrix(30,40,50);affine[0]=2;affine[4]=.3;affine[5]=3;affine[10]=4;const capture={...owned,worldMatrix:affine};f.arm([f.birth,{kind:'projectile-pose',launchId:'launch:L',model:capture},retire,{kind:'projectile-capture-model',handle:'manual-grenade',model:{...capture,inWorld:false}}]);affine[12]=999;const stage=f.env.begin();stage.dispatchAt!(receipt(),()=>{});const snapshot=stage.snapshotAt(receipt());stage.prepareCommit()();expect(snapshot.models.find(m=>m.handle==='manual-grenade')!.worldMatrix).toEqual([2,0,0,0,.3,3,0,0,0,0,4,0,30,40,50,1]);const old=f.bank.freeze();f.env.arm({physicalCallback:0,goody:null,frames:[{prefix:receipt(1),commands:[]}]});let next=f.env.begin();next.applyReceipt(1,0);next.prepareCommit()();expect(f.bank.freeze().models).toEqual(old.models);expect(f.bank.freeze().fifo).toEqual(old.fifo);expect(f.bank.freeze().prefix).toEqual(receipt(1));f.env.arm({physicalCallback:1,goody:null,frames:[{prefix:callback,commands:[]}]});next=f.env.begin();next.advanceCallback(1);next.prepareCommit()();expect(f.bank.freeze().models).toEqual(old.models);expect(f.bank.freeze().fifo).toEqual(old.fifo);expect(f.bank.freeze().prefix).toEqual(callback);
 });
 it('releases the first bank when second-bank begin fails, preserving arm and participant owners for retry',()=>{
  const f=setup({},true),blocker=f.bank.begin();f.arm([]);expect(()=>f.env.begin()).toThrow('active');const localProbe=f.local.begin();localProbe.rollback();blocker.rollback();const stage=f.env.begin();stage.applyReceipt(0,0);stage.rollback();const retry=f.env.begin();retry.applyReceipt(0,0);retry.prepareCommit()();expect(f.local.freeze().prefix).toEqual(receipt());expect(f.bank.freeze().prefix).toEqual(receipt());
 });
 it('rolls back all prepared participants and staged health if the projectile participant closes before prepare',()=>{
  const f=setup({},true),before=f.local.freeze();f.arm([f.birth]);const stage=f.env.begin();stage.dispatchAt!(receipt(),()=>{});stage.stageEffects([{kind:'bang-hurt',effectId:'explicit-hurt',position:{x:0,y:0,z:0},amount:5,radiusSource:250,attackerName:null}],receipt());f.bank.release();expect(()=>stage.prepareCommit()).toThrow();stage.rollback();expect(f.local.freeze()).toBe(before);expect(f.target.health).toEqual({canonical:100,flick:2});expect(f.env.drainOutcomes()).toEqual([]);const localProbe=f.local.begin();localProbe.rollback();const adoption=f.barrels.prepareAdopt(f.barrels.fork());adoption.rollback();
 });
 it('releases earlier adoption locks on a later adopter failure and preserves bank/catalog for exact retry',()=>{
  const f=setup(),before=f.bank.freeze();f.arm([f.birth]);let stage=f.env.begin();stage.dispatchAt!(receipt(),()=>{});const failure=vi.spyOn(f.doors,'prepareAdopt').mockImplementationOnce(()=>{throw Error('door adopter failure');});expect(()=>stage.prepareCommit()).toThrow('door adopter failure');stage.rollback();failure.mockRestore();expect(f.bank.freeze()).toBe(before);const adoption=f.barrels.prepareAdopt(f.barrels.fork());adoption.rollback();stage=f.env.begin();stage.dispatchAt!(receipt(),()=>{});stage.prepareCommit()();expect(f.bank.freeze().actors[0].launchId).toBe('launch:L');
 });
 it('rejects oversized command arrays, retained text, malformed captures and retirement family mismatches before publication',()=>{
  const f=setup({maxCommands:1}),oversized=new Array(2);let reads=0;Object.defineProperty(oversized,0,{get:()=>{reads++;throw Error('entry read');}});Object.defineProperty(oversized,Symbol.iterator,{get:()=>{reads++;throw Error('iterator read');}});expect(()=>f.arm(oversized)).toThrow('budget');expect(reads).toBe(0);const text=setup({maxTextChars:7});expect(()=>text.arm([text.birth])).toThrow('text budget');const malformed=setup();expect(()=>malformed.arm([{kind:'projectile-capture-model',handle:'grenade',model:{...checkpoint().template,worldMatrix:[1]}}])).toThrow('capture');
  const wrong=setup(),before=wrong.bank.freeze();wrong.arm([wrong.birth,{...retire,event:{...bang,type:'rocket'}}]);const stage=wrong.env.begin();expect(()=>stage.dispatchAt!(receipt(),()=>{})).toThrow('family');stage.rollback();expect(wrong.bank.freeze()).toBe(before);
 });
 it('requires ordered retirement, rejects caught mutating callback reentry and preserves copied constructor hooks',()=>{
  const f=setup(),before=f.bank.freeze();f.arm([f.birth,retire]);let stage=f.env.begin();expect(()=>stage.applyReceipt(0,0)).toThrow('ordered');stage.rollback();stage=f.env.begin();expect(()=>stage.dispatchAt!(receipt(),()=>{try{stage.prepareCommit();}catch{/* A caught reentry still poisons the stage. */}})).toThrow();stage.rollback();expect(f.bank.freeze()).toBe(before);
  const copied=setup(),birth=copied.birth;if(birth.kind!=='projectile-birth')throw Error('fixture shape');copied.arm([birth]);Reflect.set(birth.birth,'cloneFresh',()=>{throw Error('changed hook must not run');});const retry=copied.env.begin();retry.dispatchAt!(receipt(),()=>{});retry.prepareCommit()();expect(copied.bank.freeze().catalog[0].handle).toBe('manual-grenade');
 });
 it('preserves absent-bank compatibility and unresolved inventory classes without silently enabling receiver births',()=>{
  const absent=setup({},false,false);absent.arm([]);const stage=absent.env.begin();stage.applyReceipt(0,0);expect(stage.snapshotAt(receipt()).missing).toEqual(['projectile','actor-ledger']);stage.prepareCommit()();const commands=setup({},false,false);expect(()=>commands.arm([commands.birth])).toThrow();
  const f=controllerFixture();f.flags.missing=true;f.arm([f.birth]);f.send();const before=f.freeze();expect(()=>f.view.accept({callbacks:0,receipts:[{tick:0,callbacks:0}]},0)).toThrow('Incomplete receiver external scene');expect(f.freeze()).toEqual(before);expect(f.queries).toEqual([]);f.flags.missing=false;expect(f.view.accept({callbacks:0,receipts:[{tick:0,callbacks:0}]},0)).toEqual({ok:true});expect(f.names.at(-1)).toBe('grenade1');
 });
});
