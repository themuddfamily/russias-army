import {describe,it,expect,vi} from 'vitest';
import {OriginalReceiverCurrentEnvironment,type ReceiverCurrentEnvironmentArm,type ReceiverCurrentEnvironmentCommand} from './originalReceiverCurrentEnvironment';
import {OriginalReceiverProjectileWorld,type ReceiverProjectileWorldModel} from './originalReceiverProjectileWorld';
import {OriginalReceiverLocalWeaponWorld} from './originalReceiverLocalWeaponWorld';
import {ORIGINAL_RECEIVER_LOCAL_WEAPON_RESOURCES} from './originalReceiverLocalWeaponInventory';
import {createOriginalSceneGeometry,type OriginalSceneData} from './originalSceneGeometry';
import {OriginalBarrelWorld} from './originalBarrelWorld';
import {createOriginalPlayerHealth} from './originalPlayerHealth';
import type {OriginalMapRuntime} from './originalMapRuntime';
const I=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
const receipt={kind:'receipt' as const,sceneGeneration:7,callback:0,tick:0},callback={kind:'callback' as const,sceneGeneration:7,callback:1};
const model=(handle:string):ReceiverProjectileWorldModel=>({handle,resource:'rg6grenade',inWorld:true,materialHandle:'declared-material',worldMatrix:[...I],groupAncestry:['declared-projectiles']});
function fixture(maxCommands=8,maxTextChars=65536,withLocal=false){
 const data:OriginalSceneData={nodes:[{name:'floor',parent:'World',resource:'floor',matrix:I,visibility:1,shader:'default'}],meshes:[{resource:'floor',part:0,positions:[[-10,-10,-100],[10,-10,-100],[0,10,-100]],faces:[[0,1,2]],normals:[],tex_coords:[]}]};
 const geometry=createOriginalSceneGeometry(data,{scale:.02}),runtime:OriginalMapRuntime={map:'woodlands',data,scale:.02,geometry,spawnPoints:[],profile:{scale:.02,radius:1,bodyHeight:1,eyeHeight:1,bounds:geometry.bounds}};
 const seed={kind:'callback' as const,sceneGeneration:7,callback:0};
 const bank=new OriginalReceiverProjectileWorld({prefix:seed,template:{...model('grenade'),inWorld:false},catalog:[],models:[],fifo:{launcher:[],rpg:[]},actors:[]},{maxModels:16,maxActors:8,maxCommands:32,maxTextChars:65536,rocketMaterialHandle:'declared-rocket'});
 const local=new OriginalReceiverLocalWeaponWorld({prefix:seed,cameraHandle:'camera',cameraWorldMatrix:I,selectedWeapon:'rifle',loadedRocket:false,motion:{weapon:'rifle',ticker:1,gunPositionSource:{x:-12,y:-20,z:5}},models:Object.entries(ORIGINAL_RECEIVER_LOCAL_WEAPON_RESOURCES).map(([handle,resource])=>({handle:handle as 'ak47',resource,inWorld:handle==='ak47',worldMatrix:[...I],groupAncestry:['camera']}))},{sourceScale:.02,maxCommands:32,maxTextChars:65536,bindModels:(_op,state)=>({models:state.models,loadedRocket:state.loadedRocket})});
 const env=new OriginalReceiverCurrentEnvironment({sceneGeneration:7,sourceScale:.02,target:{health:createOriginalPlayerHealth(),alive:true},barrels:new OriginalBarrelWorld(runtime),projectileWorld:bank,...(withLocal?{localWeaponWorld:local}:{}),maxCommands,maxOutcomes:16,maxModels:32,maxTextChars,snapshotAt:prefix=>({prefix,models:[],missing:['declared-no-query-inventory'],provenance:'test-only'})});
 const clone=vi.fn(()=>model('remote-grenade'));
 const birth:ReceiverCurrentEnvironmentCommand={kind:'projectile-birth',birth:{launchId:'remote-launch',weapon:'launcher',cloneFresh:clone,resetModel:retained=>retained}};
 const arm=(commands:readonly ReceiverCurrentEnvironmentCommand[]=[])=>env.arm({physicalCallback:1,goody:withLocal?{bspWorld:1,modelPosition:{x:0,y:0,z:0},eyePosition:{x:0,y:1,z:0},weapon:'rifle'}:null,frames:[{prefix:receipt,commands:[]},{prefix:callback,...(withLocal?{localWeapon:{cameraWorldMatrix:I,velocityWorld:{x:0,y:0,z:0}}}:{}),commands:withLocal?[...commands,{kind:'weapon-finish'}]:commands}]});
 const consume=()=>{const tx=env.begin();tx.applyReceipt(0,0);tx.advanceCallback(1);return tx;};
 return {env,bank,local,clone,birth,arm,consume};
}
describe('finalized incoming launch receipt commands',()=>{
 it('appends an empty receipt once and preserves the original callback camera and command capture',()=>{
  const f=fixture(8,65536,true),camera=[...I];camera[12]=20;
  const arm:ReceiverCurrentEnvironmentArm={physicalCallback:1,goody:{bspWorld:1,modelPosition:{x:0,y:0,z:0},eyePosition:{x:0,y:1,z:0},weapon:'rifle'},frames:[{prefix:receipt,commands:[]},{prefix:callback,localWeapon:{cameraWorldMatrix:camera,velocityWorld:{x:0,y:0,z:0}},commands:[{kind:'weapon-finish'}]}]};
  f.env.arm(arm);camera[12]=999;f.env.appendReceiptCommands(receipt,[]);expect(()=>f.env.appendReceiptCommands(receipt,[])).toThrow(/unavailable/);
  f.consume().prepareCommit()();expect(f.local.freeze().cameraWorldMatrix[12]).toBe(20);expect(f.bank.freeze().prefix).toEqual(callback);
 });
 it('jointly stages actual projectile birth/pose/model capture without invoking constructors during finalization',()=>{
  const f=fixture();f.arm();const pose={...model('remote-grenade'),worldMatrix:[...I]};pose.worldMatrix[12]=12;
  f.env.appendReceiptCommands(receipt,[f.birth,{kind:'projectile-pose',launchId:'remote-launch',model:pose},{kind:'projectile-capture-model',handle:'remote-grenade',model:pose}]);pose.worldMatrix[12]=999;
  expect(f.clone).not.toHaveBeenCalled();const tx=f.consume();expect(f.bank.freeze().models).toEqual([]);tx.prepareCommit()();expect(f.clone).toHaveBeenCalledTimes(1);expect(f.bank.freeze().models[0].worldMatrix[12]).toBe(12);
 });
 it('keeps finalized commands through joint rollback and retries without a second append',()=>{
  const f=fixture();f.arm();f.env.appendReceiptCommands(receipt,[f.birth]);const before=f.bank.freeze(),first=f.consume();first.rollback();expect(f.bank.freeze()).toBe(before);
  expect(()=>f.env.appendReceiptCommands(receipt,[])).toThrow();f.consume().prepareCommit()();expect(f.bank.freeze().actors).toHaveLength(1);expect(f.clone).toHaveBeenCalledTimes(2);
 });
 it.each(['foreign','stale','callback','injection'] as const)('poisons invalid %s finalization so the old arm cannot commit',mode=>{
  const f=fixture();f.arm();const prefix=mode==='callback'?callback:{...receipt,sceneGeneration:mode==='foreign'?8:7,tick:mode==='stale'?1:0};
  const commands:readonly ReceiverCurrentEnvironmentCommand[]=mode==='injection'?[{kind:'transient-birth',event:{kind:'blood',id:'injected',position:{x:0,y:0,z:0}}}]:[];
  expect(()=>f.env.appendReceiptCommands(prefix,commands)).toThrow();expect(()=>f.env.begin()).toThrow(/unavailable/);expect(f.clone).not.toHaveBeenCalled();expect(f.bank.freeze().models).toEqual([]);
 });
 it('checks aggregate command count before reading incoming entries and rejects text overflow',()=>{
  const f=fixture(1);f.arm([f.birth]);let read=0;const input=new Array(1);Object.defineProperty(input,0,{get:()=>{read++;return f.birth;}});
  expect(()=>f.env.appendReceiptCommands(receipt,input)).toThrow(/budget/);expect(read).toBe(0);expect(()=>f.env.begin()).toThrow();
  const text=fixture(8,2);text.arm();expect(()=>text.env.appendReceiptCommands(receipt,[text.birth])).toThrow(/text/);expect(text.bank.freeze().models).toEqual([]);
 });
 it('captures incoming array length once when an entry getter appends another command',()=>{
  const f=fixture(),input:ReceiverCurrentEnvironmentCommand[]=[];Object.defineProperty(input,0,{get:()=>{input.push(f.birth);return f.birth;},configurable:true});input.length=1;
  f.arm();f.env.appendReceiptCommands(receipt,input);f.consume().prepareCommit()();expect(f.clone).toHaveBeenCalledTimes(1);expect(f.bank.freeze().actors).toHaveLength(1);
 });
 it('fails closed on caught recursive finalization and rejects append after begin without corrupting the active transaction',()=>{
  const f=fixture();f.arm();const raw={get kind(){try{f.env.appendReceiptCommands(receipt,[]);}catch{}return 'projectile-birth' as const;},birth:(f.birth as Extract<ReceiverCurrentEnvironmentCommand,{kind:'projectile-birth'}>).birth};
  expect(()=>f.env.appendReceiptCommands(receipt,[raw])).toThrow();expect(()=>f.env.begin()).toThrow();
  const good=fixture();good.arm();const tx=good.env.begin();expect(()=>good.env.appendReceiptCommands(receipt,[])).toThrow();tx.applyReceipt(0,0);tx.advanceCallback(1);tx.prepareCommit()();expect(good.bank.freeze().prefix).toEqual(callback);
 });
});
