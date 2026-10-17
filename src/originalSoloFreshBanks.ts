import type {Vec3,WeaponId} from '../shared/protocol';
import type {OriginalWeaponCounterMap} from '../shared/originalWeaponCounter';
import {ORIGINAL_RECEIVER_LOCAL_WEAPON_RESOURCES,type ReceiverLocalWeaponHandle} from '../shared/originalReceiverLocalWeaponInventory';
import {validateReceiverScenePrefix,type ReceiverScenePrefix} from '../shared/originalReceiverPrefix';
import {OriginalReceiverLocalWeaponWorld} from '../shared/originalReceiverLocalWeaponWorld';
import {OriginalReceiverProjectileWorld} from '../shared/originalReceiverProjectileWorld';
import {OriginalReceiverWeaponReportWorld} from '../shared/originalReceiverWeaponReportWorld';
import {createOriginalSoloFreshLoadoutWorld} from '../shared/originalSoloFreshLoadout';
import type {OriginalReceiverLoadoutWorld} from '../shared/originalReceiverLoadoutWorld';
import type {OriginalWeaponCollection} from './originalWeapons';
import {captureOriginalSoloLocalWeaponSeed,createOriginalSoloLocalWeaponBinding} from './originalSoloLocalWeaponBinding';
import {captureOriginalSoloProjectileSeed} from './originalSoloProjectileBinding';

export interface OriginalSoloFreshBanksOptions {
 readonly map:OriginalWeaponCounterMap;readonly sceneGeneration:number;
 readonly score:number;readonly goldScore:number;
 /** Physical motion conversion, supplied by the receiver runtime. Raw geometry
  * still uses ORIGINAL_WEAPON_UNIT_SCALE once; renderToWorld and camera WORLD
  * define the declared space mapping. No native unit coherence is inferred. */
 readonly sourceScale:number;
 readonly renderToWorld:readonly number[];
 readonly cameraHandle:string;readonly cameraWorldMatrix:readonly number[];
 /** Explicit copy policy: recovered weaponry.new does not establish gunpos. */
 readonly initialGunPositionSource:Readonly<Vec3>;readonly initialLoadedRocket:boolean;
 readonly membership:Readonly<Record<ReceiverLocalWeaponHandle,boolean>>;
 readonly ancestry:Readonly<Record<ReceiverLocalWeaponHandle,readonly string[]>>;
 readonly followOffworldParents:boolean;readonly parentRestoresMembership:boolean;
 /** Caller-attested shader identities and clone ancestry, not native defaults. */
 readonly grenadeMaterialHandle:string;readonly grenadeAncestry:readonly string[];readonly rocketMaterialHandle:string;
 readonly maxCommands:number;readonly maxTextChars:number;
 readonly maxProjectileModels:number;readonly maxProjectileActors:number;readonly maxReportNames:number;
}
export interface OriginalSoloFreshBanks {
 readonly localWeaponWorld:OriginalReceiverLocalWeaponWorld;
 readonly projectileWorld:OriginalReceiverProjectileWorld;
 readonly loadoutWorld:OriginalReceiverLoadoutWorld;
 readonly weaponReportWorld:OriginalReceiverWeaponReportWorld;
 /** Idempotent, attempts every private bank even when one release throws. */
 release():void;
}
export interface OriginalSoloFreshBotBanksOptions extends Omit<OriginalSoloFreshBanksOptions,'score'|'goldScore'|'maxReportNames'> {
 /** Exact registered authored AI selection, independent of human gun/ammo. */
 readonly weapon:WeaponId;
}
export interface OriginalSoloFreshBotBanks {
 readonly localWeaponWorld:OriginalReceiverLocalWeaponWorld;
 readonly projectileWorld:OriginalReceiverProjectileWorld;
 /** Idempotent, attempts both private banks without disposing borrowed assets. */
 release():void;
}
const positiveInteger=(n:number)=>Number.isSafeInteger(n)&&n>0;
function cleanup(banks:readonly {release():void}[]):unknown[] {
 const errors:unknown[]=[];
 for(let i=banks.length-1;i>=0;i--)try{banks[i].release();}catch(error){errors.push(error);}
 return errors;
}
type BorrowedSeedOptions=Pick<OriginalSoloFreshBanksOptions,'renderToWorld'|'cameraHandle'|'cameraWorldMatrix'|'initialGunPositionSource'|'initialLoadedRocket'|'membership'|'ancestry'|'followOffworldParents'|'parentRestoresMembership'|'grenadeMaterialHandle'|'grenadeAncestry'|'maxTextChars'>;
function captureBorrowedSeeds(collection:OriginalWeaponCollection,prefix:ReceiverScenePrefix,weapon:WeaponId,o:BorrowedSeedOptions){
 if(!collection||!(collection.resources instanceof Map))throw Error('Missing fresh Solo borrowed resources');
 const grenade=collection.resources.get('rg6grenade');
 for(const resource of Object.values(ORIGINAL_RECEIVER_LOCAL_WEAPON_RESOURCES))
  if(grenade!==undefined&&grenade===collection.resources.get(resource))throw Error('Grenade template aliases local weapon resource');
 const bindModels=createOriginalSoloLocalWeaponBinding({followOffworldParents:o.followOffworldParents,parentRestoresMembership:o.parentRestoresMembership,maxTextChars:o.maxTextChars});
 const localSeed=captureOriginalSoloLocalWeaponSeed(collection,{prefix,cameraHandle:o.cameraHandle,cameraWorldMatrix:o.cameraWorldMatrix,renderToWorld:o.renderToWorld,
  selectedWeapon:weapon,loadedRocket:o.initialLoadedRocket,motion:{weapon,ticker:1,gunPositionSource:o.initialGunPositionSource},membership:o.membership,ancestry:o.ancestry,maxTextChars:o.maxTextChars});
 const projectileSeed=captureOriginalSoloProjectileSeed(collection,{prefix,renderToWorld:o.renderToWorld,grenadeMaterialHandle:o.grenadeMaterialHandle,grenadeAncestry:o.grenadeAncestry,maxTextChars:o.maxTextChars});
 return {bindModels,localSeed,projectileSeed};
}
/** Constructs a fresh callback-zero private life from actual borrowed resources.
 * It never updates/disposes those resources, binds a selection, advances motion,
 * creates bodies or publishes callbacks. WORLD matrices must already be current.
 * It is not an arbitrary mid-life renderer handoff or a complete scene factory. */
export function createOriginalSoloFreshBanks(collection:OriginalWeaponCollection,options:OriginalSoloFreshBanksOptions):OriginalSoloFreshBanks {
 if(!options)throw Error('Missing fresh Solo bank options');
 const {map,sceneGeneration,score,goldScore,sourceScale,renderToWorld,cameraHandle,cameraWorldMatrix,
  initialGunPositionSource,initialLoadedRocket,membership,ancestry,followOffworldParents,parentRestoresMembership,
  grenadeMaterialHandle,grenadeAncestry,rocketMaterialHandle,maxCommands,maxTextChars,maxProjectileModels,maxProjectileActors,maxReportNames}=options;
 const prefix=Object.freeze({kind:'callback' as const,sceneGeneration,callback:0});validateReceiverScenePrefix(prefix);
 if((map!=='barrack'&&map!=='woodlands')||!Number.isSafeInteger(score)||!Number.isFinite(goldScore)
  ||!Number.isFinite(sourceScale)||sourceScale<=0||![maxCommands,maxTextChars,maxProjectileModels,maxProjectileActors,maxReportNames].every(positiveInteger)
  ||maxTextChars>65536||maxReportNames>256||typeof rocketMaterialHandle!=='string'||!rocketMaterialHandle.length
  ||rocketMaterialHandle.trim()!==rocketMaterialHandle||rocketMaterialHandle.length>maxTextChars)throw Error('Invalid fresh Solo bank options');
 // All captures and policy/configuration checks precede acquiring private owners.
 const {bindModels,localSeed,projectileSeed}=captureBorrowedSeeds(collection,prefix,'launcher',{cameraHandle,cameraWorldMatrix,renderToWorld,initialGunPositionSource,initialLoadedRocket,membership,ancestry,followOffworldParents,parentRestoresMembership,grenadeMaterialHandle,grenadeAncestry,maxTextChars});
 const acquired:{release():void}[]=[];
 try {
  const localWeaponWorld=new OriginalReceiverLocalWeaponWorld(localSeed,{sourceScale,maxCommands,maxTextChars,bindModels});acquired.push(localWeaponWorld);
  const projectileWorld=new OriginalReceiverProjectileWorld(projectileSeed,{maxModels:maxProjectileModels,maxActors:maxProjectileActors,maxCommands,maxTextChars,rocketMaterialHandle});acquired.push(projectileWorld);
  // All six actual templates were independently validated by the local capture.
  const loadoutWorld=createOriginalSoloFreshLoadoutWorld({map,sceneGeneration,score,goldScore,maxCommands,maxTextChars,
   weaponModelPresent:{pistol:true,shotgun:true,rifle:true,launcher:true,rpg:true,sniper:true}});acquired.push(loadoutWorld);
  const weaponReportWorld=new OriginalReceiverWeaponReportWorld({prefix,shots:0,hurts:[]},{maxNames:maxReportNames,maxCommands,maxTextChars});acquired.push(weaponReportWorld);
  let released=false;
  return Object.freeze({localWeaponWorld,projectileWorld,loadoutWorld,weaponReportWorld,release:()=>{
   if(released)return;released=true;const errors=cleanup(acquired);
   if(errors.length)throw new AggregateError(errors,'Fresh Solo bank release failed');
  }});
 } catch(error) {
  const errors=cleanup(acquired);
  if(errors.length)throw new AggregateError([error,...errors],'Fresh Solo bank construction and cleanup failed',{cause:error});
  throw error;
 }
}

/** Fresh authored bot ownership, with no human loadout/report acquisition or
 * gun readiness/debit simulation. Registered selection is copied once. Camera,
 * membership, ancestry, motion seed and rocket state remain explicit caller
 * policies; selection never infers mesh visibility or native clone defaults. */
export function createOriginalSoloFreshBotBanks(collection:OriginalWeaponCollection,options:OriginalSoloFreshBotBanksOptions):OriginalSoloFreshBotBanks {
 if(!options)throw Error('Missing fresh Solo bot bank options');
 const {map,sceneGeneration,weapon,sourceScale,renderToWorld,cameraHandle,cameraWorldMatrix,initialGunPositionSource,initialLoadedRocket,
  membership,ancestry,followOffworldParents,parentRestoresMembership,grenadeMaterialHandle,grenadeAncestry,rocketMaterialHandle,maxCommands,maxTextChars,maxProjectileModels,maxProjectileActors}=options;
 const prefix=Object.freeze({kind:'callback' as const,sceneGeneration,callback:0});validateReceiverScenePrefix(prefix);
 if((map!=='barrack'&&map!=='woodlands')||!['pistol','shotgun','rifle','launcher','rpg','sniper'].includes(weapon)||!Number.isFinite(sourceScale)||sourceScale<=0
  ||![maxCommands,maxTextChars,maxProjectileModels,maxProjectileActors].every(positiveInteger)||maxCommands>256||maxTextChars>65536||maxProjectileModels>256||maxProjectileActors>256
  ||typeof rocketMaterialHandle!=='string'||!rocketMaterialHandle.length||rocketMaterialHandle.trim()!==rocketMaterialHandle||rocketMaterialHandle.length>maxTextChars)throw Error('Invalid fresh Solo bot bank options');
 const {bindModels,localSeed,projectileSeed}=captureBorrowedSeeds(collection,prefix,weapon,{cameraHandle,cameraWorldMatrix,renderToWorld,initialGunPositionSource,initialLoadedRocket,membership,ancestry,followOffworldParents,parentRestoresMembership,grenadeMaterialHandle,grenadeAncestry,maxTextChars});
 const template=projectileSeed.template;
 if(rocketMaterialHandle.length+template.handle.length+template.resource.length+template.materialHandle.length+template.groupAncestry.reduce((n,group)=>n+group.length,0)>maxTextChars)throw Error('Fresh Solo bot projectile text budget exceeded');
 const acquired:{release():void}[]=[];
 try{
  const localWeaponWorld=new OriginalReceiverLocalWeaponWorld(localSeed,{sourceScale,maxCommands,maxTextChars,bindModels});acquired.push(localWeaponWorld);
  const projectileWorld=new OriginalReceiverProjectileWorld(projectileSeed,{maxModels:maxProjectileModels,maxActors:maxProjectileActors,maxCommands,maxTextChars,rocketMaterialHandle});acquired.push(projectileWorld);
  let released=false;
  return Object.freeze({localWeaponWorld,projectileWorld,release:()=>{
   if(released)return;released=true;const errors=cleanup(acquired);
   if(errors.length)throw new AggregateError(errors,'Fresh Solo bot bank release failed');
  }});
 }catch(error){
  const errors=cleanup(acquired);
  if(errors.length)throw new AggregateError([error,...errors],'Fresh Solo bot bank construction and cleanup failed',{cause:error});
  throw error;
 }
}
