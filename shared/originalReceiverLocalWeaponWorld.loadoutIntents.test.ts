import {describe,expect,it} from 'vitest';
import {OriginalReceiverLocalWeaponWorld,type ReceiverLocalWeaponWorldCheckpoint,type ReceiverLocalWeaponBindingOperation,type ReceiverLocalWeaponWorldOptions,type ReceiverLocalWeaponWorldTransaction} from './originalReceiverLocalWeaponWorld';
import {ORIGINAL_RECEIVER_LOCAL_WEAPON_RESOURCES,type ReceiverLocalWeaponModelCapture} from './originalReceiverLocalWeaponInventory';
import {OriginalReceiverLoadoutWorld,type ReceiverLoadoutIntent} from './originalReceiverLoadoutWorld';
import {ORIGINAL_WEAPON_SLOT_ORDER} from './originalPickupRules';
import type {WeaponId} from './protocol';
import type {ReceiverScenePrefix} from './originalReceiverPrefix';

const scale=.02,I=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
const matrix=(x=0)=>{const m=[...I];m[12]=x;return m;};
const receipt=(tick=0):ReceiverScenePrefix=>({kind:'receipt',sceneGeneration:4,callback:0,tick});
const callback=(n=1):ReceiverScenePrefix=>({kind:'callback',sceneGeneration:4,callback:n});
const resource:Record<WeaponId,string>={pistol:'pistol',shotgun:'spas12',rifle:'ak47',launcher:'rg6',rpg:'rpg',sniper:'dragunov'};
const seed=():ReceiverLocalWeaponWorldCheckpoint=>({prefix:receipt(),cameraHandle:'private-camera',cameraWorldMatrix:matrix(),selectedWeapon:'rifle',loadedRocket:false,motion:{weapon:'rifle',ticker:10,gunPositionSource:{x:9,y:8,z:7}},models:Object.entries(ORIGINAL_RECEIVER_LOCAL_WEAPON_RESOURCES).map(([handle,res])=>({handle:handle as ReceiverLocalWeaponModelCapture['handle'],resource:res,worldMatrix:matrix(100),inWorld:handle==='ak47',groupAncestry:['declared-parent']}))});
const gun=(state:ReceiverLocalWeaponWorldCheckpoint,handle='ak47')=>state.models.find(m=>m.handle===handle)!;
// Explicit CPU policy: selection applies a declared quarter-turn and membership
// without moving a model; final position writes are separate. This is not a
// reconstruction of native parent setters, missing models, or VOID policy.
function binding(op:ReceiverLocalWeaponBindingOperation,state:ReceiverLocalWeaponWorldCheckpoint){
 let models=state.models;
 if(op.kind==='whichgun')models=models.map(m=>{if(m.handle==='rocket')return m;const selected=op.weapon!==null&&m.handle===resource[op.weapon],world=[...m.worldMatrix];if(selected){world[0]=0;world[2]=-1;world[8]=1;world[10]=0;}return {...m,inWorld:selected,worldMatrix:world};});
 if(op.kind==='position')models=models.map(m=>{if(m.handle!==resource[op.weapon])return m;const world=[...m.worldMatrix];world[12]=state.cameraWorldMatrix[12]+op.positionSource.x*scale;world[13]=op.positionSource.y*scale;world[14]=op.positionSource.z*scale;return {...m,worldMatrix:world};});
 return {models,loadedRocket:state.loadedRocket};
}
function fixture(extra:Partial<ReceiverLocalWeaponWorldOptions>={}){const operations:ReceiverLocalWeaponBindingOperation[]=[],previous:ReceiverLocalWeaponWorldCheckpoint[]=[];const world=new OriginalReceiverLocalWeaponWorld(seed(),{sourceScale:scale,maxCommands:32,maxTextChars:8192,bindModels:(op,state)=>{operations.push(op);previous.push(state);return binding(op,state);},...extra});return {world,operations,previous};}
const finish=(tx:ReceiverLocalWeaponWorldTransaction)=>{tx.beginCallback(callback(),matrix(20));tx.fire();tx.finishCallback(40);};
type AppliedIntent=Parameters<ReceiverLocalWeaponWorldTransaction['applyLoadoutIntent']>[1];

describe('explicit loadout presentation writes in the private local weapon bank',()=>{
 it('allows selection after physical finish to bind orientation/membership without a second position write or ticker advance',()=>{
  const f=fixture(),tx=f.world.begin();finish(tx);const completed=tx.freeze(),oldPistol=gun(completed,'pistol').worldMatrix;tx.applyLoadoutIntent(callback(),{kind:'whichgun',weapon:'pistol'});const staged=tx.freeze();expect(f.operations.map(op=>op.kind)).toEqual(['camera','position','whichgun']);expect(staged.motion.ticker).toBe(completed.motion.ticker);expect(staged.motion.gunPositionSource).toEqual(completed.motion.gunPositionSource);expect(gun(staged,'pistol').worldMatrix.slice(12,15)).toEqual(oldPistol.slice(12,15));expect(gun(staged,'pistol').worldMatrix).not.toEqual(oldPistol);expect(gun(staged,'pistol').inWorld).toBe(true);expect(gun(staged).inWorld).toBe(false);tx.commit();expect(f.world.freeze().selectedWeapon).toBe('pistol');
 });
 it('assigns reload motion after finish while retaining all WORLD matrices until a subsequent physical callback',()=>{
  const f=fixture(),tx=f.world.begin();finish(tx);const completed=tx.freeze();tx.applyLoadoutIntent(callback(),{kind:'reload-pose',weapon:'rifle'});expect(tx.freeze().motion.gunPositionSource).toEqual({x:-12,y:-20,z:5});expect(tx.freeze().motion.ticker).toBe(completed.motion.ticker);expect(tx.freeze().models).toEqual(completed.models);expect(f.operations.map(op=>op.kind)).toEqual(['camera','position']);tx.commit();const saved=f.world.freeze(),next=f.world.begin();next.beginCallback(callback(2),matrix(20));next.finishCallback(0);next.commit();expect(gun(f.world.freeze()).worldMatrix).not.toEqual(gun(saved).worldMatrix);expect(saved.models).toEqual(completed.models);
 });
 it('routes actual ordered source whichgun→reload-pose→whichgun after finish while retaining sound and feedback as separate intents',()=>{
  const f=fixture(),local=f.world.begin();finish(local);const completed=local.freeze(),counts=Object.fromEntries(ORIGINAL_WEAPON_SLOT_ORDER.map(w=>[w,0])) as Record<WeaponId,number>,owned=Object.fromEntries(ORIGINAL_WEAPON_SLOT_ORDER.map(w=>[w,true])) as Record<WeaponId,boolean>;
  const loadout=new OriginalReceiverLoadoutWorld({prefix:callback(),map:'barrack',selected:'rifle',owned,ammo:{...counts,rifle:1},reserve:counts,refillTarget:28,counter:{waitgun:4,poldwaitgun:1},score:0,goldScore:0},{maxCommands:8,maxTextChars:4096,weaponModelPresent:owned}),ammo=loadout.begin(),seen:ReceiverLoadoutIntent[]=[];
  ammo.getGun('rifle',intent=>{seen.push(intent);if(intent.kind==='whichgun'||intent.kind==='reload-pose')local.applyLoadoutIntent(callback(),intent);});expect(seen.map(i=>i.kind)).toEqual(['whichgun','reload-pose','reload-sound','whichgun','feedback']);expect(f.operations.map(op=>op.kind)).toEqual(['camera','position','whichgun','whichgun']);expect(f.previous[2].motion.gunPositionSource).toEqual(completed.motion.gunPositionSource);expect(f.previous[3].motion.gunPositionSource).toEqual({x:-12,y:-20,z:5});expect(gun(local.freeze()).worldMatrix.slice(12,15)).toEqual(gun(completed).worldMatrix.slice(12,15));expect(local.freeze().motion.ticker).toBe(completed.motion.ticker);const a=ammo.prepareCommit(),b=local.prepareCommit();a();b();expect(loadout.freeze()).toMatchObject({ammo:{rifle:28},reserve:{rifle:23}});
 });
 it('admits receipt-only post-intents at the exact key without camera or motion aging',()=>{
  const f=fixture(),before=f.world.freeze(),tx=f.world.begin();tx.applyReceipt(receipt(1));tx.applyLoadoutIntent(receipt(1),{kind:'whichgun',weapon:'pistol'});tx.applyLoadoutIntent(receipt(1),{kind:'reload-pose',weapon:'pistol'});const capture=tx.snapshotAt(receipt(1));expect(capture.selectedWeapon).toBe('pistol');expect(tx.freeze().motion.ticker).toBe(before.motion.ticker);expect(gun(tx.freeze(),'pistol').worldMatrix.slice(12,15)).toEqual(gun(before,'pistol').worldMatrix.slice(12,15));expect(f.operations.map(op=>op.kind)).toEqual(['whichgun']);tx.commit();const next=f.world.begin();next.applyReceipt(receipt(2));next.commit();expect(f.world.freeze().motion.ticker).toBe(before.motion.ticker);
 });
 it('supports ordered writes inside an open callback and preserves unchanged ordinary equip/reload behavior',()=>{
  const a=fixture(),b=fixture(),explicit=a.world.begin(),normal=b.world.begin();explicit.beginCallback(callback(),matrix(20));normal.beginCallback(callback(),matrix(20));explicit.applyLoadoutIntent(callback(),{kind:'whichgun',weapon:'pistol'});explicit.applyLoadoutIntent(callback(),{kind:'reload-pose',weapon:'pistol'});normal.equip('pistol');normal.reload();explicit.finishCallback(0);normal.finishCallback(0);explicit.commit();normal.commit();expect(a.world.freeze()).toEqual(b.world.freeze());expect(a.operations.map(op=>op.kind)).toEqual(['camera','whichgun','position']);
  const outside=fixture(),tx=outside.world.begin();expect(()=>tx.reload()).toThrow('callback not begun');tx.rollback();expect(outside.operations).toEqual([]);
 });
 it('poisons wrong-prefix and wrong-selected-weapon writes and permits an identical literal retry after rollback',()=>{
  for(const fault of ['prefix','weapon']){const f=fixture(),before=f.world.freeze(),tx=f.world.begin();finish(tx);expect(()=>tx.applyLoadoutIntent(fault==='prefix'?receipt():callback(),{kind:'reload-pose',weapon:fault==='weapon'?'pistol':'rifle'})).toThrow();expect(()=>tx.prepareCommit()).toThrow();tx.rollback();expect(f.world.freeze()).toBe(before);const retry=f.world.begin();finish(retry);retry.applyLoadoutIntent(callback(),{kind:'reload-pose',weapon:'rifle'});retry.commit();expect(f.world.freeze().motion.gunPositionSource).toEqual({x:-12,y:-20,z:5});}
 });
 it('rejects sound and feedback at runtime rather than invoking model binding or changing motion',()=>{
  const unsupported:ReceiverLoadoutIntent[]=[{kind:'reload-sound',weapon:'rifle',sound:'reak47',channel:6},{kind:'feedback',message:'test feedback'}];for(const intent of unsupported){const f=fixture(),before=f.world.freeze(),tx=f.world.begin();expect(()=>tx.applyLoadoutIntent(receipt(),intent as AppliedIntent)).toThrow('loadout intent');expect(()=>tx.prepareCommit()).toThrow();tx.rollback();expect(f.world.freeze()).toBe(before);expect(f.operations).toEqual([]);}
 });
 it('poisons caught binder and input-getter mutation reentry without publishing post-finish state',()=>{
  let stage:ReceiverLocalWeaponWorldTransaction|undefined;const f=fixture({bindModels:(op,state)=>{if(op.kind==='whichgun'){try{stage!.reload();}catch{/* Catching recursive mutation does not make returned captures safe. */}}return binding(op,state);}}),before=f.world.freeze();stage=f.world.begin();finish(stage);expect(()=>stage!.applyLoadoutIntent(callback(),{kind:'whichgun',weapon:'pistol'})).toThrow();expect(()=>stage!.prepareCommit()).toThrow();stage.rollback();expect(f.world.freeze()).toBe(before);
  const other=fixture(),original=other.world.freeze(),tx=other.world.begin();let reads=0;const intent={kind:'whichgun' as const,get weapon(){reads++;try{tx.prepareCommit();}catch{/* Input decoding cannot seal a write. */}return 'pistol' as const;}};expect(()=>tx.applyLoadoutIntent(receipt(),intent)).toThrow();expect(reads).toBe(1);expect(()=>tx.prepareCommit()).toThrow();tx.rollback();expect(other.world.freeze()).toBe(original);expect(other.operations).toEqual([]);
 });
 it('keeps returned binding captures inside the guard through copying, then accepts a clean literal retry',()=>{
  let stage:ReceiverLocalWeaponWorldTransaction|undefined,attack=true;const f=fixture({bindModels:(op,state)=>{const answer=binding(op,state);if(attack&&op.kind==='whichgun'){const models=answer.models.map(m=>{if(m.handle!=='pistol')return m;const changed={...m};Object.defineProperty(changed,'worldMatrix',{get:()=>{try{stage!.prepareCommit();}catch{/* Returning a capture does not end the binding guard. */}return m.worldMatrix;}});return changed;});return {...answer,models};}return answer;}}),before=f.world.freeze();stage=f.world.begin();finish(stage);expect(()=>stage!.applyLoadoutIntent(callback(),{kind:'whichgun',weapon:'pistol'})).toThrow();expect(()=>stage!.prepareCommit()).toThrow();stage.rollback();expect(f.world.freeze()).toBe(before);attack=false;stage=f.world.begin();finish(stage);stage.applyLoadoutIntent(callback(),{kind:'whichgun',weapon:'pistol'});stage.commit();expect(f.world.freeze().selectedWeapon).toBe('pistol');
  let modelReads=0,loadedReads=0;const stable=fixture({bindModels:(op,state)=>{const answer=binding(op,state);return {get models(){return ++modelReads===1?answer.models:[];},get loadedRocket(){return ++loadedReads===1?false:true;}};}}),tx=stable.world.begin();tx.applyLoadoutIntent(receipt(),{kind:'whichgun',weapon:'pistol'});tx.commit();expect([modelReads,loadedReads]).toEqual([1,1]);expect(stable.world.freeze()).toMatchObject({selectedWeapon:'pistol',loadedRocket:false});expect(stable.world.freeze().models).toHaveLength(7);
 });
});
