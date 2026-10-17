import {describe,it,expect} from 'vitest';
import {OriginalReceiverCurrentEnvironment,type ReceiverCurrentEnvironmentCommand} from './originalReceiverCurrentEnvironment';
import {captureOriginalReceiverGunOutputs,type ReceiverGunOutput} from './originalReceiverGunOutput';
import {advanceOriginalReceiverGunCallback} from './originalReceiverGunCallback';
import {OriginalReceiverLoadoutWorld,type ReceiverLoadoutCheckpoint} from './originalReceiverLoadoutWorld';
import {OriginalReceiverLocalWeaponWorld} from './originalReceiverLocalWeaponWorld';
import {ORIGINAL_RECEIVER_LOCAL_WEAPON_RESOURCES} from './originalReceiverLocalWeaponInventory';
import {OriginalReceiverSceneController} from './originalReceiverSceneController';
import {OriginalReceiverWeaponReportWorld} from './originalReceiverWeaponReportWorld';
import {OriginalBarrelWorld} from './originalBarrelWorld';
import {createOriginalSceneGeometry,type OriginalSceneData} from './originalSceneGeometry';
import {createOriginalPlayerHealth} from './originalPlayerHealth';
import type {OriginalMapRuntime} from './originalMapRuntime';
import type {WeaponId} from './protocol';
const I=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],slots=['pistol','shotgun','rifle','launcher','rpg','sniper'] as const;
const prefix={kind:'callback' as const,sceneGeneration:4,callback:1},seed={...prefix,callback:0};
const counts=(n:number)=>Object.fromEntries(slots.map(w=>[w,n])) as Record<WeaponId,number>,presence=()=>Object.fromEntries(slots.map(w=>[w,true])) as Record<WeaponId,boolean>;
const sound:ReceiverGunOutput={kind:'sound',weapon:'rifle',sound:'gunfire',channel:6};
const output=(value:ReceiverGunOutput=sound):ReceiverCurrentEnvironmentCommand=>({kind:'gun-output',output:value});
function fixture(maxOutcomes=32,maxTextChars=65536){
 const data:OriginalSceneData={nodes:[{name:'floor',parent:'World',resource:'floor',matrix:I,visibility:1,shader:'default'}],meshes:[{resource:'floor',part:0,positions:[[-10,-10,-100],[10,-10,-100],[0,10,-100]],faces:[[0,1,2]],normals:[],tex_coords:[]}]};
 const geometry=createOriginalSceneGeometry(data,{scale:.02}),runtime:OriginalMapRuntime={map:'woodlands',data,scale:.02,geometry,spawnPoints:[],profile:{scale:.02,radius:1,bodyHeight:1,eyeHeight:1,bounds:geometry.bounds}};
 const checkpoint:ReceiverLoadoutCheckpoint={prefix:seed,map:'woodlands',selected:'rifle',owned:presence(),ammo:counts(10),reserve:counts(30),refillTarget:28,counter:{waitgun:0,poldwaitgun:0},score:0,goldScore:0};
 const loadout=new OriginalReceiverLoadoutWorld(checkpoint,{maxCommands:64,maxTextChars:65536,weaponModelPresent:presence()});
 const local=new OriginalReceiverLocalWeaponWorld({prefix:seed,cameraHandle:'camera',cameraWorldMatrix:I,selectedWeapon:'rifle',loadedRocket:false,motion:{weapon:'rifle',ticker:1,gunPositionSource:{x:-12,y:-20,z:5}},models:Object.entries(ORIGINAL_RECEIVER_LOCAL_WEAPON_RESOURCES).map(([handle,resource])=>({handle:handle as 'ak47',resource,inWorld:handle==='ak47',worldMatrix:[...I],groupAncestry:['camera']}))},{sourceScale:.02,maxCommands:64,maxTextChars:65536,bindModels:(_op,state)=>({models:state.models,loadedRocket:state.loadedRocket})});
 const report=new OriginalReceiverWeaponReportWorld({prefix:seed,shots:0,hurts:[]},{maxNames:16,maxCommands:64,maxTextChars:65536}),target={alive:true,health:createOriginalPlayerHealth()};
 // Explicit empty external partition for this publication-only fixture. The
 // query backend below throws, so no empty ray oracle attests scene coverage.
 const env=new OriginalReceiverCurrentEnvironment({sceneGeneration:4,sourceScale:.02,target,barrels:new OriginalBarrelWorld(runtime),localWeaponWorld:local,loadoutWorld:loadout,weaponReportWorld:report,maxCommands:128,maxOutcomes,maxModels:128,maxTextChars,snapshotAt:p=>({prefix:p,models:[],missing:[],provenance:'gun-publication-only-declared-partition'})});
 const pose={position:{x:0,y:0,z:0},yaw:0,phase:0,scale:1,rotation:{x:0,y:0,z:0,w:1}};
 const controller=new OriginalReceiverSceneController({cloneGI:()=>({pose,geometryProvenance:'test-GI'}),cloneGun:()=>({pose,geometryProvenance:'test-gun'}),heldGunPose:gi=>gi.pose,sphere:()=>({bspWorld:1,provenance:'declared-resource' as const}),dropYaw:()=>0,reparentGunMembership:()=>true,nearestDetailedDownward:()=>{throw Error('No query is admitted by gun output fixture');}},{clonePlane:()=>({pose,geometryProvenance:'test-plane',inWorld:true}),cloneMuzzle:()=>({pose,geometryProvenance:'test-muzzle',inWorld:true}),pointAt:()=>pose.rotation,selfRotate:q=>q},env,{model:{sceneGeneration:4,sourceScale:.02,eyeHeight:1,goodyBspWorld:1,maxModels:128,maxPickups:16},transient:{maxModels:32,maxActors:32,maxShaders:32},maxEffects:64});
 const arm=(commands:readonly ReceiverCurrentEnvironmentCommand[],goody=true)=>env.arm({physicalCallback:1,goody:goody?{bspWorld:1,modelPosition:{x:0,y:0,z:0},eyePosition:{x:0,y:1,z:0},weapon:'rifle'}:null,frames:[{prefix,commands,...(goody?{localWeapon:{cameraWorldMatrix:I,velocityWorld:{x:0,y:0,z:0}}}:{})}]});
 const consume=()=>{const tx=controller.begin();tx.advanceExternalCallback(1);return tx;};
 const clear=()=>{local.release();loadout.release();report.release();};
 return {env,controller,local,loadout,report,checkpoint,target,arm,consume,clear};
}
describe('CURRENT committed ordered gun output queue',()=>{
 it.each([65536,1000000])('publishes bounded gun outputs under the declared %i scene text budget',maxText=>{
  const f=fixture(32,maxText);try{f.arm([output(),{kind:'weapon-finish'}]);f.consume().prepareCommit()();expect(f.env.drainGunOutputs().map(row=>row.output)).toEqual([sound]);}finally{f.clear();}
 });
 it('retains a smaller scene text bound instead of substituting the gun schema cap',()=>{
  const f=fixture(32,2);try{expect(()=>f.arm([output(),{kind:'weapon-finish'}])).toThrow(/text budget/);expect(f.env.drainGunOutputs()).toEqual([]);expect(f.local.freeze().prefix).toEqual(seed);}finally{f.clear();}
 });

 it('captures actual helper sound/look/frame outputs in frame order without exposing them before joint commit',()=>{
  const f=fixture();try{
   const result=advanceOriginalReceiverGunCallback(f.checkpoint,{prefix,held:{typing:false,reload:false,fire:true,digits:[false,false,false,false,false,false]},weaponModelPresent:presence()});
   const captured=captureOriginalReceiverGunOutputs(result,{typing:false,shiftHeld:false,random3:[2]});expect(captured.some(row=>row.output.kind==='sound')).toBe(true);
   f.arm([{kind:'loadout-capture',checkpoint:result.checkpoint},...captured.map(row=>output(row.output)),{kind:'weapon-finish'}]);const tx=f.consume();
   expect(()=>f.env.drainGunOutputs()).toThrow(/active/);expect(f.loadout.freeze().ammo.rifle).toBe(10);tx.prepareCommit()();
   const rows=f.env.drainGunOutputs();expect(rows.map(row=>row.output)).toEqual(captured.map(row=>row.output));expect(rows.map(row=>row.commandIndex)).toEqual(captured.map((_row,index)=>index+1));expect(rows.every(row=>row.prefix.callback===1&&Object.isFrozen(row)&&Object.isFrozen(row.output))).toBe(true);expect(f.loadout.freeze().ammo.rifle).toBe(9);expect(f.env.drainGunOutputs()).toEqual([]);
  }finally{f.clear();}
 });
 it('keeps rollback unpublished and retries the same captured arm',()=>{
  const f=fixture();try{f.arm([output(),{kind:'weapon-finish'}]);const before=f.local.freeze(),first=f.consume();first.rollback();expect(f.local.freeze()).toBe(before);expect(f.env.drainGunOutputs()).toEqual([]);f.consume().prepareCommit()();expect(f.env.drainGunOutputs()).toHaveLength(1);}finally{f.clear();}
 });
 it('keeps gun-only publications undrained after every other drain until explicitly consumed',()=>{
  const f=fixture();try{f.arm([output(),{kind:'weapon-finish'}]);f.consume().prepareCommit()();f.env.drainOutcomes();f.env.drainLoadoutIntents();f.env.drainLocalHitscanOutcomes();f.env.drainWeaponReports();expect(()=>f.env.begin()).toThrow(/unavailable/);expect(()=>f.arm([])).toThrow(/undrained/);expect(f.env.drainGunOutputs()).toHaveLength(1);f.env.arm({physicalCallback:2,goody:null,frames:[{prefix:{...prefix,callback:2},commands:[]}]});}finally{f.clear();}
 });
 it('rejects output after physical finish and report-send after gun output at arm',()=>{
  const f=fixture();try{expect(()=>f.arm([{kind:'weapon-finish'},output()])).toThrow(/after finish/);expect(()=>f.arm([output(),{kind:'weapon-report-send'},{kind:'weapon-finish'}])).toThrow(/precede/);const marker=output({kind:'scope-frame',weapon:'rifle',typing:false,shiftHeld:false});expect(()=>f.arm([marker,output()])).toThrow(/after scope frame/);expect(()=>f.arm([marker,marker])).toThrow(/after scope frame/);}finally{f.clear();}
 });
 it('allows captured scope-frame for VOID but cannot queue sound from VOID',()=>{
  for(const allowed of [true,false]){const f=fixture();try{
   const final={...f.checkpoint,prefix,selected:null};f.arm([{kind:'loadout-capture',checkpoint:final},{kind:'weapon-whichgun',weapon:null},output(allowed?{kind:'scope-frame',weapon:null,typing:false,shiftHeld:false}:sound),{kind:'weapon-finish'}]);
   if(allowed){f.consume().prepareCommit()();expect(f.env.drainGunOutputs()[0].output.kind).toBe('scope-frame');}
   else{const tx=f.controller.begin();expect(()=>tx.advanceExternalCallback(1)).toThrow(/boundary/);tx.rollback();expect(f.env.drainGunOutputs()).toEqual([]);}
  }finally{f.clear();}}
 });
 it('copies output fields once and rejects caught reentrant drain while arming',()=>{
  const f=fixture();try{let reads=0;const raw={kind:'sound' as const,weapon:'rifle' as const,get sound(){reads++;return 'gunfire' as const;},channel:6 as const};f.arm([output(raw),{kind:'weapon-finish'}]);expect(reads).toBe(1);f.consume().prepareCommit()();f.env.drainGunOutputs();expect(reads).toBe(1);}finally{f.clear();}
  const bad=fixture();try{const raw={get kind(){try{bad.env.drainGunOutputs();}catch{}return 'sound' as const;},weapon:'rifle' as const,sound:'gunfire' as const,channel:6 as const};expect(()=>bad.arm([output(raw)])).toThrow(/failed|changed/);expect(()=>bad.env.begin()).toThrow();}finally{bad.clear();}
 });
 it('rejects dead/no-goody output and output count overflow without publishing a partial queue',()=>{
  const f=fixture(1);try{expect(()=>f.arm([output()],false)).toThrow();f.arm([output(),output(),{kind:'weapon-finish'}]);const tx=f.controller.begin();expect(()=>tx.advanceExternalCallback(1)).toThrow(/budget/);tx.rollback();expect(f.env.drainGunOutputs()).toEqual([]);expect(f.local.freeze().prefix).toEqual(seed);}finally{f.clear();}
  const dead=fixture();try{dead.target.alive=false;dead.arm([output(),{kind:'weapon-finish'}]);const tx=dead.controller.begin();expect(()=>tx.advanceExternalCallback(1)).toThrow('Unsupported CURRENT local weapon source-presence transition');tx.rollback();expect(dead.env.drainGunOutputs()).toEqual([]);expect(dead.local.freeze().prefix).toEqual(seed);}finally{dead.clear();}
 });
});
