import {describe,expect,it,vi} from 'vitest';
import {OriginalReceiverLoadoutWorld,collectOriginalReceiverAmmoPickup,type ReceiverLoadoutCheckpoint,type ReceiverLoadoutIntent,type ReceiverLoadoutIntentEmitter} from './originalReceiverLoadoutWorld';
import {OriginalReceiverModelWorld,type ReceiverModelBackend,type ReceiverModelPose,isReceiverPickupOperand} from './originalReceiverModelWorld';
import {ORIGINAL_WEAPON_SLOT_ORDER} from './originalPickupRules';
import type {WeaponId} from './protocol';
import type {ReceiverScenePrefix} from './originalReceiverPrefix';

const prefix=(tick=0):ReceiverScenePrefix=>({kind:'receipt',sceneGeneration:4,callback:0,tick});
const counts=(n=0):Record<WeaponId,number>=>Object.fromEntries(ORIGINAL_WEAPON_SLOT_ORDER.map(w=>[w,n])) as Record<WeaponId,number>;
const owned=(value=true):Record<WeaponId,boolean>=>Object.fromEntries(ORIGINAL_WEAPON_SLOT_ORDER.map(w=>[w,value])) as Record<WeaponId,boolean>;
function checkpoint(changes:Partial<ReceiverLoadoutCheckpoint>={}):ReceiverLoadoutCheckpoint{return {prefix:prefix(),map:'barrack',selected:'rifle',owned:owned(),ammo:counts(),reserve:counts(),refillTarget:28,counter:{waitgun:7,poldwaitgun:3},score:10,goldScore:123.5,...changes};}
function bank(seed=checkpoint(),changes:Partial<ConstructorParameters<typeof OriginalReceiverLoadoutWorld>[1]>={}){return new OriginalReceiverLoadoutWorld(seed,{maxCommands:32,maxTextChars:4096,weaponModelPresent:owned(),...changes});}
function recorder(){const events:{intent:ReceiverLoadoutIntent;state:ReceiverLoadoutCheckpoint}[]=[];const emit:ReceiverLoadoutIntentEmitter=(intent,state)=>events.push({intent,state});return {events,emit};}
// Declared CPU lifecycle oracle: this isolates actual retained model ownership
// from native geometry, grounding, physical travel and global actor ordering.
function aliasedPickup(){
 const pose:ReceiverModelPose={position:{x:0,y:20,z:0},yaw:0,phase:77,scale:1};
 const backend:ReceiverModelBackend={cloneGI:()=>({pose,geometryProvenance:'declared-GI'}),cloneGun:()=>({pose,geometryProvenance:'declared-gun'}),heldGunPose:gi=>gi.pose,sphere:()=>({bspWorld:2,provenance:'declared-resource'}),reparentGunMembership:()=>true,dropYaw:()=>0,nearestDetailedDownward:()=>({hit:null,coverage:{complete:true,missing:[],provenance:'declared-empty-CPU-oracle'}})};
 const world=new OriginalReceiverModelWorld(backend,{eyeHeight:1,sourceScale:.02,goodyBspWorld:2,sceneGeneration:4,maxModels:64,maxPickups:16},{snapshotAt:p=>({prefix:p,models:[],missing:[],provenance:'declared-empty-CPU-oracle'})});
 const birth=(id:string)=>({actorId:id,targetFeet:{x:0,y:10,z:0},targetYaw:0,callback:0});
 const actor={position:{x:0,y:10,z:0},yaw:0,motionTime:100,weapon:'rifle' as const};
 let tx=world.begin();tx.applyExternalReceipt(0,0);const original=tx.birth(birth('old'));tx.beforeCallback('old',actor);tx.detach('old',actor,0);tx.commit();const pickup=world.freezePickups()[0];
 tx=world.begin();for(let i=0;i<76;i++)tx.advanceCorpses();const reused=tx.birth(birth('new'));tx.beforeCallback('new',{...actor,position:{x:100,y:10,z:0}});tx.afterCallback('new',{...actor,position:{x:100,y:10,z:0}});tx.beforeCallback('new',{...actor,position:{x:100,y:10,z:0}});tx.commit();
 return {world,pickup,original,reused,goody:{eyePosition:{...pickup.position},bspWorld:1}};
}

describe('authenticated individual pickup lookup',()=>{
 it('collects the fixed logical position without constructing a registry and preserves intent/reward order',()=>{
  const f=aliasedPickup(),models=f.world.begin(),loadout=bank(checkpoint({ammo:{...counts(),rifle:2}})),tx=loadout.begin(),r=recorder();
  vi.spyOn(models,'freezeActorRegistry').mockImplementation(()=>{throw Error('Whole registry forbidden');});
  const operand=models.readPickup(f.pickup.id);
  expect(isReceiverPickupOperand(operand)).toBe(true);expect(isReceiverPickupOperand({...operand})).toBe(false);
  expect(operand.pickup?.position).toEqual({x:0,y:10,z:0});
  expect([operand,operand.prefix,operand.pickup,operand.pickup?.position].every(Object.isFrozen)).toBe(true);
  const emit:ReceiverLoadoutIntentEmitter=(intent,state)=>{expect(models.readPickup(f.pickup.id).pickup).not.toBeNull();expect(state.score).toBe(10);r.emit(intent,state);};
  expect(collectOriginalReceiverAmmoPickup(models,tx,{pickupId:f.pickup.id,goody:f.goody},emit)).toBe(true);
  expect(r.events.map(e=>e.intent.kind)).toEqual(['whichgun','reload-pose','reload-sound','whichgun','feedback']);
  expect(models.collectPickup(operand)).toBe(false);
  models.prepareCommit()();tx.prepareCommit()();
  expect(loadout.freeze()).toMatchObject({ammo:{rifle:28},reserve:{rifle:24},score:15});expect(f.world.freezePickups()).toEqual([]);
 });
 it('keeps missing zero IDs harmless but checks their exact prefix',()=>{
  const f=aliasedPickup(),models=f.world.begin(),loadout=bank(),tx=loadout.begin();
  expect(models.readPickup(0)).toEqual({prefix:prefix(),pickup:null});
  expect(collectOriginalReceiverAmmoPickup(models,tx,{pickupId:0,goody:f.goody},()=>{})).toBe(false);
  tx.applyReceipt(prefix(1));
  expect(()=>collectOriginalReceiverAmmoPickup(models,tx,{pickupId:0,goody:f.goody},()=>{})).toThrow('prefix mismatch');
  expect(()=>tx.prepareCommit()).toThrow();models.rollback();tx.rollback();
 });
 it('rejects foreign transaction operands and stale prefix operands',()=>{
  const f=aliasedPickup(),first=f.world.begin(),operand=first.readPickup(f.pickup.id);first.rollback();
  const second=f.world.begin();expect(()=>second.collectPickup(operand)).toThrow('Unauthenticated');
  const own=second.readPickup(f.pickup.id);second.applyExternalReceipt(1,0);
  expect(()=>second.collectPickup(own)).toThrow('Stale receiver pickup operand prefix');second.rollback();
 });
 it('rejects forged lookup capsules before rewarding and poisons the loadout',()=>{
  const f=aliasedPickup(),models=f.world.begin(),tx=bank().begin(),operand=models.readPickup(f.pickup.id);
  const forged={readPickup:()=>({...operand}),collectPickup:models.collectPickup};
  expect(()=>collectOriginalReceiverAmmoPickup(forged,tx,{pickupId:f.pickup.id,goody:f.goody},()=>{})).toThrow('authenticated');
  expect(()=>tx.prepareCommit()).toThrow();expect(f.world.freezePickups()).toHaveLength(1);models.rollback();tx.rollback();
 });
 it('collects at the admitted callback prefix before external geometry refresh',()=>{
  const f=aliasedPickup(),models=f.world.begin(),loadout=bank(),tx=loadout.begin(),next={kind:'callback' as const,sceneGeneration:4,callback:1};
  models.admitExternalPrefix!(next);tx.advanceCallback(next);
  expect(collectOriginalReceiverAmmoPickup(models,tx,{pickupId:f.pickup.id,goody:f.goody},()=>{})).toBe(true);
  models.advanceExternalCallback(1);models.prepareCommit()();tx.prepareCommit()();expect(loadout.freeze().score).toBe(15);
 });
 it('rejects lookup after preparation or rollback',()=>{
  const f=aliasedPickup(),models=f.world.begin();models.prepareCommit();expect(()=>models.readPickup(f.pickup.id)).toThrow();models.rollback();expect(()=>models.readPickup(0)).toThrow();
 });
 it('rolls back rewards when authenticated collection loses its issuing owner, then retries once',()=>{
  const f=aliasedPickup(),first=f.world.begin(),operand=first.readPickup(f.pickup.id);first.rollback();
  let models=f.world.begin();const loadout=bank(),before=loadout.freeze();let tx=loadout.begin();
  expect(()=>collectOriginalReceiverAmmoPickup({readPickup:()=>operand,collectPickup:models.collectPickup},tx,{pickupId:f.pickup.id,goody:f.goody},()=>{})).toThrow('Unauthenticated');
  expect(()=>tx.prepareCommit()).toThrow();models.rollback();tx.rollback();expect(loadout.freeze()).toEqual(before);
  models=f.world.begin();tx=loadout.begin();expect(collectOriginalReceiverAmmoPickup(models,tx,{pickupId:f.pickup.id,goody:f.goody},()=>{})).toBe(true);models.prepareCommit()();tx.prepareCommit()();expect(loadout.freeze().score).toBe(15);
 });
});
