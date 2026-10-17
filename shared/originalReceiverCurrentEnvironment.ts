import type {Vec3,WeaponId} from './protocol';
import {copyReceiverGunOutput,receiverGunOutputTextChars,type ReceiverGunOutput} from './originalReceiverGunOutput';
import type {ReceiverActorRegistrySnapshot} from './originalReceiverActorRegistry';
import {copyReceiverLocalHitscanAction,stageReceiverLocalHitscan,type ReceiverLocalHitscanAction,type ReceiverLocalHitscanOutcome,type ReceiverLocalHitscanQuery,type ReceiverLocalHitscanSceneCapture} from './originalReceiverLocalHitscan';
import {applyOriginalPlayerDamage,createOriginalPlayerHealth,type OriginalPlayerHealthState} from './originalPlayerHealth';
import {OriginalBarrelWorld} from './originalBarrelWorld';
import {OriginalDoorWorld} from './originalDoorWorld';
import {OriginalReceiverLocalWeaponWorld,type ReceiverLocalWeaponWorldTransaction} from './originalReceiverLocalWeaponWorld';
import type {ReceiverLocalWeaponCapture} from './originalReceiverLocalWeaponInventory';
import {OriginalReceiverWeaponReportWorld,copyReceiverWeaponReportPayload,type ReceiverWeaponReportPayload,type ReceiverWeaponReportTransaction} from './originalReceiverWeaponReportWorld';
import {OriginalReceiverProjectileWorld,type ReceiverProjectileWorldTransaction,type ReceiverProjectileWorldBirth,type ReceiverProjectileWorldModel,type ReceiverProjectileCloneAllocator} from './originalReceiverProjectileWorld';
import type {ReceiverProjectileInventoryCapture} from './originalReceiverProjectileInventory';
import {OriginalReceiverLoadoutWorld,collectOriginalReceiverAmmoPickup,type ReceiverLoadoutCheckpoint,type ReceiverLoadoutTransaction,type ReceiverLoadoutIntent} from './originalReceiverLoadoutWorld';
import type {ReceiverSceneEnvironment,ReceiverSceneEnvironmentTransaction,ReceiverStagedTransientInventoryCapture} from './originalReceiverSceneController';
import type {OriginalReceiverTransientBirth,OriginalReceiverTransientGoody} from './originalReceiverTransientWorld';
import type {ReceiverModelEntry,ReceiverModelPose,ReceiverSceneTransaction,ReceiverModelTransition} from './originalReceiverModelWorld';
import type {ReceiverPickupOutputChunk,ReceiverPickupOutputDescriptor} from './originalReceiverPickupOutput';
import {sameReceiverScenePrefix,validateReceiverScenePrefix,type ReceiverScenePrefix,type ReceiverExternalSceneSnapshot} from './originalReceiverPrefix';

export type ReceiverCurrentEnvironmentCommand=
 |Readonly<{kind:'door-open';name:string;atSeconds:number}>
 |Readonly<{kind:'barrel-hurt';id:string;birthId:string}>
 |Readonly<{kind:'transient-birth';event:OriginalReceiverTransientBirth}>
 |Readonly<{kind:'weapon-whichgun';weapon:WeaponId|null}>
 |Readonly<{kind:'weapon-equip';weapon:WeaponId}>
 |Readonly<{kind:'weapon-reload'|'weapon-fire'}>
 |Readonly<{kind:'local-hitscan';action:ReceiverLocalHitscanAction}>
 |Readonly<{kind:'weapon-report-send'}>
 |Readonly<{kind:'gun-output';output:ReceiverGunOutput}>
 |Readonly<{kind:'weapon-rocket';loadedRocket:boolean}>
 |Readonly<{kind:'weapon-finish'}>
 |Readonly<{kind:'loadout-capture';checkpoint:ReceiverLoadoutCheckpoint}>
 |Readonly<{kind:'ammo-pickup';pickupId:number}>
 |Readonly<{kind:'projectile-birth';birth:ReceiverProjectileWorldBirth}>
 |Readonly<{kind:'projectile-pose';launchId:string;model:ReceiverProjectileWorldModel}>
 |Readonly<{kind:'projectile-capture-model';handle:string;model:ReceiverProjectileWorldModel}>
 |Readonly<{kind:'projectile-retire';launchId:string;event:Extract<OriginalReceiverTransientBirth,{kind:'bang'}>}>;
export interface ReceiverCurrentEnvironmentArm {
 readonly physicalCallback:number;readonly goody:OriginalReceiverTransientGoody|null;
 readonly frames:readonly Readonly<{prefix:ReceiverScenePrefix;commands:readonly ReceiverCurrentEnvironmentCommand[];
  readonly localWeapon?:Readonly<{cameraWorldMatrix:readonly number[];velocityWorld:Readonly<Vec3>}>}>[];
}
export interface ReceiverCurrentEnvironmentState {
 readonly health:Readonly<OriginalPlayerHealthState>;readonly alive:boolean;
 readonly barrels:Pick<OriginalBarrelWorld,'getModelMatrix'|'snapshots'|'bodies'>;readonly doors?:OriginalDoorWorld;
 readonly localWeapons?:ReceiverLocalWeaponCapture;
 readonly projectiles?:ReceiverProjectileInventoryCapture;
 readonly loadout?:ReceiverLoadoutCheckpoint;
 /** Owned stage FX only; templates/unresolved classes are factory evidence. */
 readonly transients?:ReceiverStagedTransientInventoryCapture;
}
export interface ReceiverCurrentLoadoutPublication {
 readonly prefix:ReceiverScenePrefix;
 readonly intent:Extract<ReceiverLoadoutIntent,{kind:'reload-sound'|'feedback'}>;
}
/** Detached bounded data for a private pickup-window spool. The model permit
 * remains private to CURRENT and is never handed to the persistence writer. */
export interface ReceiverCurrentPickupWindowBatch {
 readonly prefix:Extract<ReceiverScenePrefix,{kind:'callback'}>;
 readonly sequence:number;readonly firstOrdinal:number;
 readonly transitions:readonly ReceiverModelTransition[];
 readonly loadoutIntents:readonly ReceiverCurrentLoadoutPublication[];
}
export type ReceiverCurrentPickupWindowFlush=(write:(batch:ReceiverCurrentPickupWindowBatch)=>Promise<void>)=>Promise<void>;
type ReceiverCurrentPickupModels=Pick<ReceiverSceneTransaction,'readPickup'|'collectPickup'> &
 Partial<Pick<ReceiverSceneTransaction,'preparePickupWindowDrain'|'preparePickupOutputTailDrain'|'finishPickupWindowDrain'|'freezePickupOutputDescriptor'>>;
export interface ReceiverCurrentWeaponReportPublication {
 readonly prefix:Extract<ReceiverScenePrefix,{kind:'callback'}>;
 readonly report:ReceiverWeaponReportPayload;
}
export interface ReceiverCurrentGunOutputPublication {
 readonly prefix:Extract<ReceiverScenePrefix,{kind:'callback'}>;
 /** Index within the admitted frame, not native actor/global ordering. */
 readonly commandIndex:number;readonly output:ReceiverGunOutput;
}
export interface ReceiverCurrentHurtOutcome {
 readonly kind:'hurt';readonly effectId:string;readonly prefix:ReceiverScenePrefix;readonly position:Readonly<Vec3>;
 readonly attackerName:string|null;readonly amount:5;readonly health:number;readonly dead:boolean;
}
export interface ReceiverCurrentEnvironmentOptions {
 readonly sceneGeneration:number;readonly sourceScale:number;
 /** Declared copy navigation boundary, not proof of native Director scheduling.
  * Canonical death commits normally; captured goody remains through this delivery. */
 readonly terminalGoodyPolicy?:'retain-until-current-commit';
 readonly target:{health:OriginalPlayerHealthState;alive:boolean};
 readonly barrels:OriginalBarrelWorld;readonly doors?:OriginalDoorWorld;
 /** Borrowed private participant. Caller must not mutate or release it during
  * a joint transaction; the environment owns only its rollbackable stage. */
 readonly localWeaponWorld?:OriginalReceiverLocalWeaponWorld;
 /** Borrowed private bank; caller retains release ownership and must not mutate
  * it during the joint stage. Constructor functions must be pure and stable
  * across rollback retries; only their named references are captured at arm. */
 readonly projectileWorld?:OriginalReceiverProjectileWorld;
 /** Borrowed loadout stage; requires the local model bank. Explicit source map
  * and model presence remain the producer's captured policy. */
 readonly loadoutWorld?:OriginalReceiverLoadoutWorld;
 /** Trusted page coordinator. Runs after captured gun commands, before old FX
  * or actor advancement, under the same private bank/prefix. */
 readonly pickupContinuationAt?:(prefix:Extract<ReceiverScenePrefix,{kind:'callback'}>,collectPickup:(id:number)=>boolean,flush:ReceiverCurrentPickupWindowFlush)=>Promise<void>;
 /** Complete prefix-bound geometry query. No fallback to world-only geometry. */
 readonly localHitscan?:ReceiverLocalHitscanQuery;
 /** Private source shots/hurts accumulator. Send cadence is an explicit command;
  * no initial pingserver value or transport acknowledgement is inferred. */
 readonly weaponReportWorld?:OriginalReceiverWeaponReportWorld;
 /** Pure CURRENT inventory capture. Must retain independent missing evidence;
  * this participant never supplies implicit FX or claims native completeness. */
 readonly snapshotAt:(prefix:ReceiverScenePrefix,state:ReceiverCurrentEnvironmentState,actors?:ReceiverActorRegistrySnapshot)=>ReceiverExternalSceneSnapshot;
 readonly maxCommands:number;readonly maxOutcomes:number;readonly maxModels:number;readonly maxTextChars:number;
}
const weapons:readonly WeaponId[]=['pistol','shotgun','rifle','launcher','rpg','sniper'];
const finite=(p:Readonly<Vec3>|undefined):boolean=>!!p&&[p.x,p.y,p.z].every(Number.isFinite);
const point=(p:Readonly<Vec3>):Readonly<Vec3>=>Object.freeze({x:p.x,y:p.y,z:p.z});
const prefixCopy=(p:ReceiverScenePrefix):ReceiverScenePrefix=>Object.freeze(p.kind==='receipt'
 ?{kind:'receipt',sceneGeneration:p.sceneGeneration,callback:p.callback,tick:p.tick}
 :{kind:'callback',sceneGeneration:p.sceneGeneration,callback:p.callback});
function poseCopy(p:Readonly<ReceiverModelPose>,full=false):ReceiverModelPose {
 const q=p?.rotation;
 if(!p||!finite(p.position)||![p.yaw,p.phase,p.scale].every(Number.isFinite)||p.phase<0||p.scale<=0
  ||full&&!q||q&&(![q.x,q.y,q.z,q.w].every(Number.isFinite)||Math.abs(Math.hypot(q.x,q.y,q.z,q.w)-1)>1e-6))throw Error('Invalid CURRENT model pose');
 return Object.freeze({position:point(p.position),yaw:p.yaw,phase:p.phase,scale:p.scale,...(q?{rotation:Object.freeze({x:q.x,y:q.y,z:q.z,w:q.w})}:{})});
}

/** A bounded CURRENT-prefix participant, not a physical replay engine. Physics,
 * goody controls and health flick are already completed by the caller. Commands
 * are explicit admitted source events; barrel contact/impulse is not a trigger.
 * dispatchAt synchronously emits each birth before later commands. A barrel's
 * physical body is removed first, its render matrix survives during birth, then
 * its rendered model is deleted. Legacy array-returning methods batch commands
 * before birth processing and do not reproduce that ordering. This explicit
 * command dispatcher does not establish native global actorList/Havok timing.
 * Prepared publication invokes no user callbacks. Targets must be plain mutable
 * state whose assignments cannot throw. Caller MUST NOT advance live health or
 * physical state from arm to begin, or write raw health/body refs from prepare
 * until commit/rollback; the existing public-reference API cannot enforce this. No production
 * caller is enabled by constructing this participant; inventory gaps survive. */
export class OriginalReceiverCurrentEnvironment implements ReceiverSceneEnvironment {
 private readonly options:ReceiverCurrentEnvironmentOptions;
 private armed?:ReceiverCurrentEnvironmentArm;
 private arming=false;
 private armFailed=false;
 private receiptAppended=false;
 private receiptAppendFailed=false;
 private active=false;
 private outcomes:readonly ReceiverCurrentHurtOutcome[]=Object.freeze([]);
 private loadoutIntents:readonly ReceiverCurrentLoadoutPublication[]=Object.freeze([]);
 private undrained=false;
 private localHitscanOutcomes:readonly ReceiverLocalHitscanOutcome[]=Object.freeze([]);
 private weaponReports:readonly ReceiverCurrentWeaponReportPublication[]=Object.freeze([]);
 private gunOutputs:readonly ReceiverCurrentGunOutputPublication[]=Object.freeze([]);
 private lastPhysicalCallback=0;
 private lastReceiptTick?:number;
 constructor(options:ReceiverCurrentEnvironmentOptions){
  const terminalGoodyPolicy=options.terminalGoodyPolicy;
  const pickupContinuationAt=options.pickupContinuationAt;
  if(terminalGoodyPolicy!==undefined&&terminalGoodyPolicy!=='retain-until-current-commit')throw Error('Invalid CURRENT terminal goody policy');
  if(!Number.isSafeInteger(options.sceneGeneration)||options.sceneGeneration<0||!Number.isFinite(options.sourceScale)||options.sourceScale<=0
   ||![options.maxCommands,options.maxOutcomes,options.maxModels,options.maxTextChars].every(n=>Number.isSafeInteger(n)&&n>0)
   ||!(options.barrels instanceof OriginalBarrelWorld)||options.sourceScale!==options.barrels.sourceScale
   ||options.doors!==undefined&&(!(options.doors instanceof OriginalDoorWorld)||options.doors.scale!==options.sourceScale)
   ||!options.target||typeof options.target.alive!=='boolean'||typeof options.snapshotAt!=='function')throw Error('Invalid CURRENT environment options');
  createOriginalPlayerHealth(options.target.health.canonical,options.target.health.flick);
  if(!Number.isFinite(250*options.sourceScale))throw Error('CURRENT radius overflow');
  if(options.localWeaponWorld!==undefined){
   if(!(options.localWeaponWorld instanceof OriginalReceiverLocalWeaponWorld)||options.localWeaponWorld.sourceScale!==options.sourceScale)throw Error('Invalid CURRENT local weapon binding');
   const prefix=options.localWeaponWorld.freeze().prefix;
   if(prefix.sceneGeneration!==options.sceneGeneration||prefix.callback!==0)throw Error('Invalid CURRENT local weapon initial clock');
   // A captured receipt checkpoint has already consumed that tick; an initial
   // callback0 checkpoint permits the first receipt0 without invented replay.
   if(prefix.kind==='receipt')this.lastReceiptTick=prefix.tick;
  }
  if(options.projectileWorld!==undefined){
   if(!(options.projectileWorld instanceof OriginalReceiverProjectileWorld))throw Error('Invalid CURRENT projectile binding');
   const initial=options.projectileWorld.freeze(),prefix=initial.prefix;
   if(prefix.sceneGeneration!==options.sceneGeneration||prefix.callback!==0||options.localWeaponWorld&&!sameReceiverScenePrefix(prefix,options.localWeaponWorld.freeze().prefix))throw Error('Invalid CURRENT projectile initial clock');
   if(initial.models.length+1>options.maxModels)throw Error('CURRENT projectile model budget exceeded');
   if(prefix.kind==='receipt')this.lastReceiptTick=prefix.tick;
  }
  if(options.loadoutWorld!==undefined){
   if(!(options.loadoutWorld instanceof OriginalReceiverLoadoutWorld)||!options.localWeaponWorld)throw Error('Invalid CURRENT loadout binding');
   const initial=options.loadoutWorld.freeze();
   const presence=options.loadoutWorld.freezeWeaponModelPresence();
   if(weapons.some(weapon=>!presence[weapon]))throw Error('Unsupported CURRENT missing-model loadout pose');
   if(initial.prefix.sceneGeneration!==options.sceneGeneration||initial.prefix.callback!==0||!sameReceiverScenePrefix(initial.prefix,options.localWeaponWorld.freeze().prefix)||options.projectileWorld&&!sameReceiverScenePrefix(initial.prefix,options.projectileWorld.freeze().prefix))throw Error('Invalid CURRENT loadout initial clock');
   if(initial.selected!==options.localWeaponWorld.freeze().selectedWeapon)throw Error('Unsupported CURRENT loadout selection');
  }
  if(pickupContinuationAt!==undefined&&(typeof pickupContinuationAt!=='function'||!options.loadoutWorld))throw Error('Invalid CURRENT pickup continuation');
  if(options.localHitscan!==undefined&&typeof options.localHitscan?.nearestBullet!=='function')throw Error('Invalid CURRENT local hitscan query');
  if(options.weaponReportWorld!==undefined){
   if(!(options.weaponReportWorld instanceof OriginalReceiverWeaponReportWorld))throw Error('Invalid CURRENT weapon report binding');
   const prefix=options.weaponReportWorld.freeze().prefix;
   if(prefix.sceneGeneration!==options.sceneGeneration||prefix.callback!==0
    ||options.localWeaponWorld&&!sameReceiverScenePrefix(prefix,options.localWeaponWorld.freeze().prefix)
    ||options.projectileWorld&&!sameReceiverScenePrefix(prefix,options.projectileWorld.freeze().prefix)
    ||options.loadoutWorld&&!sameReceiverScenePrefix(prefix,options.loadoutWorld.freeze().prefix))throw Error('Invalid CURRENT weapon report initial clock');
   if(prefix.kind==='receipt')this.lastReceiptTick=prefix.tick;
  }
  const localHitscan=options.localHitscan?Object.freeze({nearestBullet:options.localHitscan.nearestBullet.bind(options.localHitscan)}):undefined;
  this.options=Object.freeze({sceneGeneration:options.sceneGeneration,sourceScale:options.sourceScale,terminalGoodyPolicy,target:options.target,barrels:options.barrels,doors:options.doors,localWeaponWorld:options.localWeaponWorld,projectileWorld:options.projectileWorld,loadoutWorld:options.loadoutWorld,pickupContinuationAt,weaponReportWorld:options.weaponReportWorld,localHitscan,snapshotAt:options.snapshotAt,maxCommands:options.maxCommands,maxOutcomes:options.maxOutcomes,maxModels:options.maxModels,maxTextChars:options.maxTextChars});
 }
 arm(input:ReceiverCurrentEnvironmentArm):void {
  if(this.arming){this.armFailed=true;throw Error('Recursive CURRENT arm');}
  if(this.active||this.armed||this.undrained)throw Error('CURRENT environment active, armed or outcomes undrained');
  this.arming=true;this.armFailed=false;
  try{const captured=this.copyArm(input);if(this.armed)throw Error('CURRENT arm changed');this.armed=captured;this.receiptAppended=false;this.receiptAppendFailed=false;}finally{this.arming=false;this.armFailed=false;}
 }
 /** Finalize incoming model receipts without reevaluating cached gun/input
  * callbacks. Failure poisons this arm; it must never execute without receipts. */
 appendReceiptCommands(prefix:ReceiverScenePrefix,commands:readonly ReceiverCurrentEnvironmentCommand[]):void {
  if(this.arming){this.armFailed=true;throw Error('Recursive CURRENT receipt append');}
  if(this.active||!this.armed||this.undrained||this.receiptAppended||this.receiptAppendFailed)throw Error('CURRENT receipt append unavailable');
  const previous=this.armed;this.arming=true;this.armFailed=false;
  try{
   const capturedPrefix=prefixCopy(prefix),frame=previous.frames.find(entry=>entry.prefix.kind==='receipt');
   if(capturedPrefix.kind!=='receipt'||!frame||!sameReceiverScenePrefix(frame.prefix,capturedPrefix)||!Array.isArray(commands))throw Error('Foreign CURRENT receipt append');
   const count=commands.length,oldCount=previous.frames.reduce((sum,entry)=>sum+entry.commands.length,0);
   if(!Number.isSafeInteger(count)||count<0||oldCount+count>this.options.maxCommands)throw Error('CURRENT appended command budget exceeded');
   const incoming:ReceiverCurrentEnvironmentCommand[]=[];
   for(let index=0;index<count;index++){
    const raw:ReceiverCurrentEnvironmentCommand=commands[index];if(!raw)throw Error('Missing CURRENT appended command');const kind=raw.kind;
    if(kind==='projectile-birth'){
     const birth=raw.birth;if(!birth)throw Error('Missing CURRENT appended birth');
     incoming.push(Object.freeze({kind,birth:Object.freeze({launchId:birth.launchId,weapon:birth.weapon,cloneFresh:birth.cloneFresh,resetModel:birth.resetModel,onRecycled:birth.onRecycled})}));
    }else if(kind==='projectile-pose')incoming.push(Object.freeze({kind,launchId:raw.launchId,model:raw.model}));
    else if(kind==='projectile-capture-model')incoming.push(Object.freeze({kind,handle:raw.handle,model:raw.model}));
    else throw Error('Unsupported CURRENT appended command');
   }
   const combined=this.copyArm({physicalCallback:previous.physicalCallback,goody:previous.goody,frames:previous.frames.map(entry=>entry===frame?{...entry,commands:[...entry.commands,...incoming]}:entry)});
   if(this.armed!==previous||this.armFailed)throw Error('CURRENT receipt append changed');
   this.armed=Object.freeze({...previous,frames:Object.freeze(previous.frames.map((entry,index)=>entry===frame?combined.frames[index]:entry))});this.receiptAppended=true;
  }catch(error){this.receiptAppendFailed=true;throw error;}finally{this.arming=false;this.armFailed=false;}
 }
 private copyArm(input:ReceiverCurrentEnvironmentArm):ReceiverCurrentEnvironmentArm {
  const o=this.options;
  if(!input||!Number.isSafeInteger(input.physicalCallback)||input.physicalCallback<0||!Array.isArray(input.frames)||input.frames.length<1||input.frames.length>2)throw Error('Invalid CURRENT frame bounds');
  const n=input.physicalCallback,frames:ReceiverCurrentEnvironmentArm['frames']=input.frames;
  for(const frame of frames){validateReceiverScenePrefix(frame.prefix);if(frame.prefix.sceneGeneration!==o.sceneGeneration||!Array.isArray(frame.commands))throw Error('CURRENT frame generation mismatch');
   if(frame.localWeapon!==undefined&&(!o.localWeaponWorld||frame.prefix.kind!=='callback'))throw Error('Unexpected CURRENT local weapon frame');
   if(o.localWeaponWorld&&frame.prefix.kind==='callback'&&input.goody===null){if(frame.localWeapon!==undefined)throw Error('Unexpected CURRENT null-goody camera input');}
   else if(o.localWeaponWorld&&frame.prefix.kind==='callback'){
    const local=frame.localWeapon,m=local?.cameraWorldMatrix;
    if(!local||!Array.isArray(m)||m.length!==16||!m.every(Number.isFinite)||m[3]!==0||m[7]!==0||m[11]!==0||m[15]!==1||!finite(local.velocityWorld)||!Number.isFinite(Math.hypot(local.velocityWorld.x,local.velocityWorld.y,local.velocityWorld.z)/o.sourceScale))throw Error('Invalid CURRENT local weapon camera or velocity');
   }
  }
  if(frames.length===2){if(frames[0].prefix.kind!=='receipt'||frames[0].prefix.callback!==n-1||frames[1].prefix.kind!=='callback'||frames[1].prefix.callback!==n||n!==this.lastPhysicalCallback+1)throw Error('Invalid CURRENT receipt/callback order');}
  else if(frames[0].prefix.callback!==n||(frames[0].prefix.kind==='callback'?n!==this.lastPhysicalCallback+1:n!==this.lastPhysicalCallback))throw Error('Invalid CURRENT single frame or callback skip');
  const receipt=frames.find(frame=>frame.prefix.kind==='receipt')?.prefix;
  if(receipt?.kind==='receipt'&&this.lastReceiptTick!==undefined&&receipt.tick<=this.lastReceiptTick)throw Error('CURRENT receipt replay');
  let commandCount=0,text=0;
  const addText=(value:string)=>{if(typeof value!=='string'||!value)throw Error('Invalid CURRENT text');text+=value.length;if(!Number.isSafeInteger(text)||text>o.maxTextChars)throw Error('CURRENT text budget exceeded');return value;};
  const birthCopy=(event:OriginalReceiverTransientBirth):OriginalReceiverTransientBirth=>{
   if(!event)throw Error('Invalid CURRENT transient event');const id=addText(event.id);
   if(event.kind==='muzzle'){
    if(!['pistol','shotgun','rifle','sniper'].includes(event.weapon))throw Error('Invalid CURRENT muzzle weapon');
    return Object.freeze({kind:'muzzle',id,weapon:event.weapon,gunPose:poseCopy(event.gunPose,true)});
   }
   if(!finite(event.position))throw Error('Invalid CURRENT transient position');const position=point(event.position);
   if(event.kind==='puff'){
    if(!Number.isSafeInteger(event.angleSourceDegrees)||event.angleSourceDegrees<10||event.angleSourceDegrees>360||event.angleSourceDegrees%10!==0)throw Error('Invalid CURRENT puff angle');
    return Object.freeze({kind:'puff',id,position,angleSourceDegrees:event.angleSourceDegrees});
   }
   if(event.kind==='bang'){
    if(event.type==='barrel'){if(event.attackerName!=null)throw Error('Invalid CURRENT barrel attribution');return Object.freeze({kind:'bang',id,position,type:'barrel',attackerName:null});}
    if(!['rocket','grenade'].includes(event.type)||typeof event.attackerName!=='string')throw Error('Invalid CURRENT bang');
    // Empty received names retain legacy named-branch compatibility.
    text+=event.attackerName.length;if(text>o.maxTextChars)throw Error('CURRENT text budget exceeded');
    return Object.freeze({kind:'bang',id,position,type:event.type,attackerName:event.attackerName});
   }
   if(event.kind==='miss'){if(!finite(event.normal))throw Error('Invalid CURRENT miss normal');return Object.freeze({kind:'miss',id,position,normal:point(event.normal)});}
   if(event.kind==='blood')return Object.freeze({kind:'blood',id,position});
   throw Error('Invalid CURRENT transient kind');
  };
  const projectileCopy=(m:ReceiverProjectileWorldModel):ReceiverProjectileWorldModel=>{
   if(!m||!Array.isArray(m.worldMatrix)||m.worldMatrix.length!==16||!m.worldMatrix.every(Number.isFinite)||m.worldMatrix[3]!==0||m.worldMatrix[7]!==0||m.worldMatrix[11]!==0||m.worldMatrix[15]!==1||typeof m.inWorld!=='boolean'||!['rg6grenade','rpgrocket'].includes(m.resource)||!Array.isArray(m.groupAncestry)||m.groupAncestry.length>o.maxModels)throw Error('Invalid CURRENT projectile capture');
   const handle=addText(m.handle),materialHandle=addText(m.materialHandle),resource=m.resource;addText(resource);
   const groups=m.groupAncestry.map((g:string)=>addText(g));
   return Object.freeze({handle,resource,materialHandle,inWorld:m.inWorld,worldMatrix:Object.freeze([...m.worldMatrix]),groupAncestry:Object.freeze(groups)});
  };
  const loadoutCopy=(raw:ReceiverLoadoutCheckpoint,prefix:ReceiverScenePrefix):ReceiverLoadoutCheckpoint=>{
   if(!raw)throw Error('Invalid CURRENT loadout capture');
   const rawPrefix=raw.prefix,map=raw.map,selected=raw.selected,refillTarget=raw.refillTarget,score=raw.score,goldScore=raw.goldScore,counter=raw.counter,owned=raw.owned,ammo=raw.ammo,reserve=raw.reserve;
   if(!rawPrefix||!counter||!owned||!ammo||!reserve)throw Error('Invalid CURRENT loadout capture');
   const kind=rawPrefix.kind,sceneGeneration=rawPrefix.sceneGeneration,callback=rawPrefix.callback;
   if(kind!=='callback'&&kind!=='receipt')throw Error('Invalid CURRENT loadout capture prefix');
   const capturedPrefix:ReceiverScenePrefix=kind==='receipt'?{kind,sceneGeneration,callback,tick:rawPrefix.tick}:{kind,sceneGeneration,callback};
   validateReceiverScenePrefix(capturedPrefix);
   const waitgun=counter.waitgun,poldwaitgun=counter.poldwaitgun;
   if(!sameReceiverScenePrefix(prefix,capturedPrefix)||!['barrack','woodlands'].includes(map)||selected!==null&&!weapons.includes(selected)||!Number.isSafeInteger(refillTarget)||refillTarget<1||!Number.isSafeInteger(score)||!Number.isFinite(goldScore)||![waitgun,poldwaitgun].every(Number.isSafeInteger))throw Error('Invalid CURRENT loadout capture');
   addText(map);if(selected!==null)addText(selected);
   const capturedOwned={} as Record<WeaponId,boolean>,capturedAmmo={} as Record<WeaponId,number>,capturedReserve={} as Record<WeaponId,number>;
   for(const weapon of weapons){const has=owned[weapon],chamber=ammo[weapon],stock=reserve[weapon];if(typeof has!=='boolean'||![chamber,stock].every(n=>Number.isSafeInteger(n)&&n>=0)||!has&&stock!==0)throw Error('Invalid CURRENT loadout counts');capturedOwned[weapon]=has;capturedAmmo[weapon]=chamber;capturedReserve[weapon]=stock;}
   return Object.freeze({prefix:Object.freeze(capturedPrefix),map,selected,refillTarget,score,goldScore,counter:Object.freeze({waitgun,poldwaitgun}),owned:Object.freeze(capturedOwned),ammo:Object.freeze(capturedAmmo),reserve:Object.freeze(capturedReserve)});
  };
  let goody:OriginalReceiverTransientGoody|null=null;
  if(input.goody){const g=input.goody;if(!Number.isFinite(g.bspWorld)||g.bspWorld<=0||!finite(g.modelPosition)||!finite(g.eyePosition)||g.weapon!==null&&!weapons.includes(g.weapon))throw Error('Invalid CURRENT goody');
   goody=Object.freeze({bspWorld:g.bspWorld,modelPosition:point(g.modelPosition),eyePosition:point(g.eyePosition),weapon:g.weapon});
  }else if(input.goody!==null)throw Error('Invalid CURRENT goody');
  for(const frame of frames){commandCount+=frame.commands.length;if(!Number.isSafeInteger(commandCount)||commandCount>o.maxCommands)throw Error('CURRENT command budget exceeded');}
  const copied=Object.freeze(frames.map(frame=>Object.freeze({prefix:prefixCopy(frame.prefix),...(frame.localWeapon?{localWeapon:Object.freeze({cameraWorldMatrix:Object.freeze([...frame.localWeapon.cameraWorldMatrix]),velocityWorld:point(frame.localWeapon.velocityWorld)})}:{}),commands:Object.freeze(frame.commands.map(command=>{
   if(command.kind==='door-open'){if(!Number.isFinite(command.atSeconds)||command.atSeconds<0)throw Error('Invalid CURRENT door epoch');return Object.freeze({kind:'door-open' as const,name:addText(command.name),atSeconds:command.atSeconds});}
   if(command.kind==='barrel-hurt')return Object.freeze({kind:'barrel-hurt' as const,id:addText(command.id),birthId:addText(command.birthId)});
   if(command.kind==='transient-birth')return Object.freeze({kind:'transient-birth' as const,event:birthCopy(command.event)});
   if(command.kind==='weapon-report-send'){
    if(!o.weaponReportWorld||!goody||frame.prefix.kind!=='callback')throw Error('Unexpected CURRENT weapon report send');
    return Object.freeze({kind:'weapon-report-send' as const});
   }
   if(command.kind==='gun-output'){
    if(!o.localWeaponWorld||!o.loadoutWorld||!goody||frame.prefix.kind!=='callback')throw Error('Unexpected CURRENT gun output');
    const output=copyReceiverGunOutput(command.output,Math.min(o.maxTextChars,65536));text+=receiverGunOutputTextChars(output);
    if(text>o.maxTextChars)throw Error('CURRENT gun output text budget exceeded');
    return Object.freeze({kind:'gun-output' as const,output});
   }
   if(command.kind==='local-hitscan'){
    if(!o.localHitscan||!o.localWeaponWorld||!goody||frame.prefix.kind!=='callback')throw Error('Unexpected CURRENT local hitscan');
    const action=copyReceiverLocalHitscanAction(command.action,o.maxModels,o.maxTextChars);
    if(!sameReceiverScenePrefix(action.prefix,frame.prefix))throw Error('CURRENT local hitscan prefix mismatch');
    text+=action.effectId.length+action.muzzleId.length+Object.keys(action.actorNames).reduce((sum,key)=>sum+key.length+(typeof action.actorNames[key]==='string'?(action.actorNames[key] as string).length:0),0);
    if(text>o.maxTextChars)throw Error('CURRENT command text budget exceeded');
    return Object.freeze({kind:'local-hitscan' as const,action});
   }
   if(command.kind==='loadout-capture'){
    if(!o.loadoutWorld)throw Error('Unexpected CURRENT loadout capture');return Object.freeze({kind:'loadout-capture' as const,checkpoint:loadoutCopy(command.checkpoint,frame.prefix)});
   }
   if(command.kind==='ammo-pickup'){
    const pickupId=command.pickupId;if(!o.loadoutWorld||frame.prefix.kind!=='callback'||!Number.isSafeInteger(pickupId)||pickupId<0)throw Error('Invalid CURRENT ammo pickup');return Object.freeze({kind:'ammo-pickup' as const,pickupId});
   }
   if(command.kind==='weapon-finish'){
    if(!o.localWeaponWorld||!goody||frame.prefix.kind!=='callback')throw Error('Invalid CURRENT weapon finish');return Object.freeze({kind:'weapon-finish' as const});
   }
   if(command.kind==='projectile-birth'){
    if(!o.projectileWorld||!command.birth)throw Error('Unexpected CURRENT projectile birth');
    const b=command.birth,launchId=addText(b.launchId),weapon=b.weapon,cloneFresh=b.cloneFresh,resetModel=b.resetModel,onRecycled=b.onRecycled;
    if(!['launcher','rpg'].includes(weapon)||typeof cloneFresh!=='function'||typeof resetModel!=='function'||onRecycled!==undefined&&typeof onRecycled!=='function')throw Error('Invalid CURRENT projectile constructor');
    return Object.freeze({kind:'projectile-birth' as const,birth:Object.freeze({launchId,weapon,cloneFresh,resetModel,...(onRecycled?{onRecycled}:{})})});
   }
   if(command.kind==='projectile-pose'){
    if(!o.projectileWorld)throw Error('Unexpected CURRENT projectile pose');return Object.freeze({kind:'projectile-pose' as const,launchId:addText(command.launchId),model:projectileCopy(command.model)});
   }
   if(command.kind==='projectile-capture-model'){
    if(!o.projectileWorld)throw Error('Unexpected CURRENT projectile model');return Object.freeze({kind:'projectile-capture-model' as const,handle:addText(command.handle),model:projectileCopy(command.model)});
   }
   if(command.kind==='projectile-retire'){
    if(!o.projectileWorld||command.event.kind!=='bang'||command.event.type==='barrel')throw Error('Invalid CURRENT projectile retirement');
    const event=birthCopy(command.event) as Extract<OriginalReceiverTransientBirth,{kind:'bang'}>;
    return Object.freeze({kind:'projectile-retire' as const,launchId:addText(command.launchId),event});
   }
   if(command.kind==='weapon-whichgun'||command.kind==='weapon-equip'){
    if(!o.localWeaponWorld||!goody||frame.prefix.kind!=='callback'||(command.kind==='weapon-whichgun'&&command.weapon===null?false:!weapons.includes(command.weapon as WeaponId)))throw Error('Invalid CURRENT local weapon command');
    return command.kind==='weapon-whichgun'?Object.freeze({kind:'weapon-whichgun' as const,weapon:command.weapon}):Object.freeze({kind:'weapon-equip' as const,weapon:command.weapon});
   }
   if(command.kind==='weapon-reload'||command.kind==='weapon-fire'){
    if(!o.localWeaponWorld||!goody||frame.prefix.kind!=='callback')throw Error('Unexpected CURRENT local weapon command');return Object.freeze({kind:command.kind});
   }
   if(command.kind==='weapon-rocket'){
    if(!o.localWeaponWorld||!goody||frame.prefix.kind!=='callback'||typeof command.loadedRocket!=='boolean')throw Error('Invalid CURRENT local rocket command');return Object.freeze({kind:'weapon-rocket' as const,loadedRocket:command.loadedRocket});
   }
   throw Error('Invalid CURRENT command kind');
  }))})));
  for(const frame of copied){
   let gunStarted=false,sent=false,finished=false,scopeFrameSeen=false;
   for(const command of frame.commands){
    if(command.kind==='gun-output'&&finished)throw Error('CURRENT gun output after finish');
    if(command.kind==='gun-output'){
     if(scopeFrameSeen)throw Error('CURRENT gun output after scope frame');
     if(command.output.kind==='scope-frame')scopeFrameSeen=true;
    }
    if(command.kind==='weapon-finish')finished=true;
    if(command.kind==='weapon-report-send'){
     if(gunStarted||sent)throw Error('CURRENT weapon report must precede gun commands once');sent=true;
    }else if(command.kind.startsWith('weapon-')||command.kind==='gun-output'||command.kind==='loadout-capture'||command.kind==='local-hitscan'||command.kind==='projectile-birth')gunStarted=true;
   }
  }
  if(this.armFailed||this.active||this.undrained)throw Error('CURRENT arm failed or changed');
  return Object.freeze({physicalCallback:n,goody,frames:copied});
 }
 drainOutcomes():readonly ReceiverCurrentHurtOutcome[] {
  if(this.arming){this.armFailed=true;throw Error('CURRENT drain during arm');}
  if(this.active)throw Error('CURRENT environment transaction active');
  const values=this.outcomes;this.outcomes=Object.freeze([]);this.undrained=this.loadoutIntents.length>0||this.localHitscanOutcomes.length>0||this.weaponReports.length>0||this.gunOutputs.length>0;return values;
 }
 drainLoadoutIntents():readonly ReceiverCurrentLoadoutPublication[] {
  if(this.arming){this.armFailed=true;throw Error('CURRENT drain during arm');}
  if(this.active)throw Error('CURRENT environment transaction active');
  const values=this.loadoutIntents;this.loadoutIntents=Object.freeze([]);this.undrained=this.outcomes.length>0||this.localHitscanOutcomes.length>0||this.weaponReports.length>0||this.gunOutputs.length>0;return values;
 }
 drainLocalHitscanOutcomes():readonly ReceiverLocalHitscanOutcome[] {
  if(this.arming){this.armFailed=true;throw Error('CURRENT drain during arm');}
  if(this.active)throw Error('CURRENT environment transaction active');
  const values=this.localHitscanOutcomes;this.localHitscanOutcomes=Object.freeze([]);this.undrained=this.outcomes.length>0||this.loadoutIntents.length>0||this.weaponReports.length>0||this.gunOutputs.length>0;return values;
 }
 drainWeaponReports():readonly ReceiverCurrentWeaponReportPublication[] {
  if(this.arming){this.armFailed=true;throw Error('CURRENT drain during arm');}
  if(this.active)throw Error('CURRENT environment transaction active');
  const values=this.weaponReports;this.weaponReports=Object.freeze([]);this.undrained=this.outcomes.length>0||this.loadoutIntents.length>0||this.localHitscanOutcomes.length>0||this.gunOutputs.length>0;return values;
 }
 drainGunOutputs():readonly ReceiverCurrentGunOutputPublication[] {
  if(this.arming){this.armFailed=true;throw Error('CURRENT drain during arm');}
  if(this.active)throw Error('CURRENT environment transaction active');
  const values=this.gunOutputs;this.gunOutputs=Object.freeze([]);this.undrained=this.outcomes.length>0||this.loadoutIntents.length>0||this.localHitscanOutcomes.length>0||this.weaponReports.length>0;return values;
 }
 begin(allocator?:ReceiverProjectileCloneAllocator,models?:ReceiverCurrentPickupModels):ReceiverSceneEnvironmentTransaction {
  if(this.arming){this.armFailed=true;throw Error('CURRENT begin during arm');}
  if(this.active||!this.armed||this.undrained||this.receiptAppendFailed)throw Error('CURRENT environment unavailable');
  const o=this.options,input=this.armed,target=o.target,healthIdentity=target.health;
  if(o.loadoutWorld&&(!models||typeof models.readPickup!=='function'||typeof models.collectPickup!=='function'))throw Error('CURRENT loadout requires staged model owner');
  const baseline=createOriginalPlayerHealth(healthIdentity.canonical,healthIdentity.flick),health=createOriginalPlayerHealth(baseline.canonical,baseline.flick),baseAlive=target.alive;
  if(typeof baseAlive!=='boolean')throw Error('Invalid CURRENT alive state');
  // Presence and health are separate under the declared commit boundary. A
  // captured delivery may finish after death; this never admits a new life/frame.
  const retainGoody=baseAlive&&o.terminalGoodyPolicy==='retain-until-current-commit';
  const goodyPresent=()=>input.goody!==null&&(alive||retainGoody);
  const barrels=o.barrels.fork(),doors=o.doors?.fork();let alive=baseAlive;
  // No owner flag is changed if an externally active/released bank rejects.
  let localWeapons:ReceiverLocalWeaponWorldTransaction|undefined,projectiles:ReceiverProjectileWorldTransaction|undefined,loadout:ReceiverLoadoutTransaction|undefined,reports:ReceiverWeaponReportTransaction|undefined;
  const pickupDrainOwner=models&&typeof models.preparePickupWindowDrain==='function'&&typeof models.finishPickupWindowDrain==='function'?models as ReceiverSceneTransaction:undefined;
  try{localWeapons=o.localWeaponWorld?.begin(pickupDrainOwner);projectiles=o.projectileWorld?.begin(allocator);loadout=o.loadoutWorld?.begin(pickupDrainOwner);reports=o.weaponReportWorld?.begin();}catch(error){localWeapons?.rollback();projectiles?.rollback();loadout?.rollback();reports?.rollback();throw error;}
  let open=true,failed=false,prepared=false,executing=false,index=0,current:ReceiverScenePrefix|undefined,outcomeText=0;
  let continuationActive=false,collecting=false,flushing=false,streamedPickupOutputs=false;
  let streamedLoadoutCount=0,streamedPublication:ReceiverPickupOutputDescriptor|undefined;
  let flushWork:Promise<void>|undefined;
  let pendingRender:{id:string;matrix:readonly number[]}|undefined;
  let shotGoody:OriginalReceiverTransientGoody|undefined;
  const renderBarrels:ReceiverCurrentEnvironmentState['barrels']=Object.freeze({
   get bodies(){return barrels.bodies;},snapshots:()=>barrels.snapshots(),
   getModelMatrix:(id:string)=>pendingRender?.id===id?[...pendingRender.matrix]:barrels.getModelMatrix(id),
  });
  const pending:ReceiverCurrentHurtOutcome[]=[];
  const pendingLoadout:ReceiverCurrentLoadoutPublication[]=[];let loadoutText=0;
  const pendingHitscan:ReceiverLocalHitscanOutcome[]=[];
  const pendingReports:ReceiverCurrentWeaponReportPublication[]=[];
  const pendingGunOutputs:ReceiverCurrentGunOutputPublication[]=[];let gunOutputText=0;
  let barrelAdoption:ReturnType<OriginalBarrelWorld['prepareAdopt']>|undefined,doorAdoption:ReturnType<OriginalDoorWorld['prepareAdopt']>|undefined;
  this.active=true;
  const check=()=>{if(!open||failed||prepared)throw Error('CURRENT environment transaction closed or failed');};
  const guarded=<T>(operation:()=>T,mutatesPrefix=false):T=>{check();try{if(flushing)throw Error('CURRENT pickup persistence forbids transaction reentry');if(mutatesPrefix&&executing)throw Error('Recursive CURRENT dispatch or prepare');return operation();}catch(error){failed=true;throw error;}};
  const executeCommands=(frame:ReceiverCurrentEnvironmentArm['frames'][number],emitBirth:(event:OriginalReceiverTransientBirth)=>void,ordered:boolean,captureScene?:()=>ReceiverLocalHitscanSceneCapture):((id:number)=>boolean)=>{
   if(!ordered&&frame.commands.some(command=>command.kind==='projectile-retire'))throw Error('CURRENT projectile retirement requires ordered dispatch');
   if(!ordered&&frame.commands.some(command=>command.kind==='ammo-pickup'))throw Error('CURRENT ammo pickup requires ordered dispatch');
   if(!ordered&&frame.commands.some(command=>command.kind==='local-hitscan'))throw Error('CURRENT local hitscan requires ordered dispatch');
   if(localWeapons&&input.goody&&frame.prefix.kind==='callback'&&!goodyPresent())throw Error('Unsupported CURRENT local weapon source-presence transition');
   if(localWeapons){if(frame.prefix.kind==='receipt')localWeapons.applyReceipt(frame.prefix);else if(goodyPresent())localWeapons.beginCallback(frame.prefix,frame.localWeapon!.cameraWorldMatrix);else localWeapons.skipCallback(frame.prefix);}
   if(projectiles){if(frame.prefix.kind==='receipt')projectiles.applyReceipt(frame.prefix);else projectiles.advanceCallback(frame.prefix);}
   if(loadout){if(frame.prefix.kind==='receipt')loadout.applyReceipt(frame.prefix);else loadout.advanceCallback(frame.prefix);}
   reports?.admitPrefix(frame.prefix);
   let weaponFinished=false;
   const finishWeapon=()=>{if(weaponFinished||!localWeapons||!input.goody||frame.prefix.kind!=='callback'||!goodyPresent())throw Error('Invalid CURRENT weapon finish');localWeapons.finishPhysicalCallback(frame.localWeapon!.velocityWorld);weaponFinished=true;};
   const loadoutIntent=(intent:ReceiverLoadoutIntent)=>{
    if(!goodyPresent())throw Error('Unsupported CURRENT loadout source-presence transition');
    if(intent.kind==='whichgun'||intent.kind==='reload-pose'){
     localWeapons!.applyLoadoutIntent(frame.prefix,intent);return;
    }
    if(pendingLoadout.length>=o.maxOutcomes)throw Error('CURRENT loadout intent budget exceeded');
    loadoutText+=intent.kind.length+(intent.kind==='feedback'?intent.message.length:intent.weapon.length+intent.sound.length);
    if(!Number.isSafeInteger(loadoutText)||loadoutText>o.maxTextChars)throw Error('CURRENT loadout intent text budget exceeded');
    pendingLoadout.push(Object.freeze({prefix:frame.prefix,intent}));
   };
   for(let commandIndex=0;commandIndex<frame.commands.length;commandIndex++){
    const command=frame.commands[commandIndex];
    if(weaponFinished&&['weapon-whichgun','weapon-equip','weapon-reload','weapon-fire','weapon-rocket','weapon-finish','local-hitscan','gun-output'].includes(command.kind))throw Error('CURRENT weapon command after finish');
    if(command.kind==='door-open'){if(!doors||command.atSeconds>doors.updatedAtSeconds||!doors.open(command.name,command.atSeconds))throw Error('Absent or repeated CURRENT door command');}
    else if(command.kind==='barrel-hurt'){
     const snapshots=barrels.snapshots(),body=snapshots.find(value=>value.id===command.id);
     if(!body)throw Error('Absent or repeated CURRENT barrel hurt');
     const matrix=ordered?barrels.getModelMatrix(command.id):undefined;
     if(ordered&&(!matrix||matrix.length!==16||!matrix.every(Number.isFinite)||matrix[3]!==0||matrix[7]!==0||matrix[11]!==0||matrix[15]!==1))throw Error('Invalid CURRENT retained barrel matrix');
     const render=matrix?{id:command.id,matrix:Object.freeze([...matrix])}:undefined;
     const event:OriginalReceiverTransientBirth=Object.freeze({kind:'bang',id:command.birthId,position:point(body.position),type:'barrel',attackerName:null});
     barrels.applySnapshots(snapshots.filter(value=>value.id!==command.id));
     pendingRender=render;
     try{emitBirth(event);}finally{pendingRender=undefined;}
    }else if(command.kind==='transient-birth')emitBirth(command.event);
    else if(command.kind==='weapon-report-send'){
     if(!goodyPresent()||frame.prefix.kind!=='callback'||pendingReports.length>=o.maxOutcomes)throw Error('Invalid CURRENT weapon report boundary');
     // Whole-map inventory limits can exceed the report wire format caps.
     // The report bank independently enforces its private name/text limits.
     const report=copyReceiverWeaponReportPayload(reports!.send(),Math.min(o.maxModels,256),Math.min(o.maxTextChars,65536));
     pendingReports.push(Object.freeze({prefix:frame.prefix,report}));
    }
    else if(command.kind==='gun-output'){
     if(!goodyPresent()||!localWeapons||!loadout||frame.prefix.kind!=='callback'||command.output.kind!=='scope-frame'&&loadout.freeze().selected===null)throw Error('Invalid CURRENT gun output boundary');
     if(pendingGunOutputs.length>=o.maxOutcomes)throw Error('CURRENT gun output count budget exceeded');
     gunOutputText+=receiverGunOutputTextChars(command.output);if(gunOutputText>o.maxTextChars)throw Error('CURRENT gun output text budget exceeded');
     pendingGunOutputs.push(Object.freeze({prefix:frame.prefix,commandIndex,output:command.output}));
    }
    else if(command.kind==='weapon-finish')finishWeapon();
    else if(command.kind==='loadout-capture')loadout!.capture(command.checkpoint);
    else if(command.kind==='ammo-pickup')collectOriginalReceiverAmmoPickup(models!,loadout!,{pickupId:command.pickupId,goody:goodyPresent()?input.goody:null},loadoutIntent);
    else if(command.kind==='weapon-whichgun')localWeapons!.whichGun(command.weapon);
    else if(command.kind==='weapon-equip')localWeapons!.equip(command.weapon);
    else if(command.kind==='weapon-reload')localWeapons!.reload();
    else if(command.kind==='weapon-fire')localWeapons!.fire();
    else if(command.kind==='local-hitscan'){
     if(!goodyPresent()||!input.goody||frame.prefix.kind!=='callback'||!captureScene||!o.localHitscan||localWeapons!.freeze().selectedWeapon!==command.action.weapon)throw Error('Invalid CURRENT local hitscan boundary');
     if(pendingHitscan.length>=o.maxOutcomes)throw Error('CURRENT local hitscan outcome budget exceeded');
     shotGoody=Object.freeze({bspWorld:command.action.bspWorld,modelPosition:input.goody.modelPosition,eyePosition:command.action.origin,weapon:command.action.weapon});
     try{const outcome=stageReceiverLocalHitscan(command.action,captureScene(),o.localHitscan,o.sourceScale,emitBirth);reports?.record(outcome);pendingHitscan.push(outcome);}finally{shotGoody=undefined;}
    }
    else if(command.kind==='weapon-rocket')localWeapons!.refreshRocket(command.loadedRocket);
    else if(command.kind==='projectile-birth')projectiles!.birth(command.birth);
    else if(command.kind==='projectile-pose')projectiles!.capturePose(command.launchId,command.model);
    else if(command.kind==='projectile-capture-model')projectiles!.captureModel(command.handle,command.model);
    else if(command.kind==='projectile-retire'){
     const actor=projectiles!.freeze().actors.find(a=>a.launchId===command.launchId);
     if(!actor||command.event.type!==(actor.weapon==='launcher'?'grenade':'rocket'))throw Error('CURRENT projectile retirement family mismatch');
     projectiles!.retire(command.launchId,model=>{
      if(command.event.type!==(model.resource==='rg6grenade'?'grenade':'rocket'))throw Error('CURRENT projectile retirement resource mismatch');
      emitBirth(command.event);
     });
    }
    if(!open||failed)throw Error('CURRENT dispatch failed or closed');
    if(localWeapons&&input.goody&&frame.prefix.kind==='callback'&&!goodyPresent())throw Error('Unsupported CURRENT local weapon source-presence transition');
   }
   if(localWeapons&&input.goody&&frame.prefix.kind==='callback'){
    // Without the declared navigation boundary, source-presence transitions
    // still reject. The opt-in retains the complete callback, never a partial
    // camera/ticker update or an implicit null-goody skip.
    if(!goodyPresent())throw Error('Unsupported CURRENT local weapon source-presence transition');
    if(!weaponFinished)finishWeapon();
   }
   return id=>guarded(()=>{
    if(!executing||!continuationActive||collecting||flushing||current!==frame.prefix||frame.prefix.kind!=='callback'||!models||!loadout)throw Error('CURRENT pickup continuation unavailable');
    collecting=true;try{return collectOriginalReceiverAmmoPickup(models,loadout,{pickupId:id,goody:goodyPresent()?input.goody:null},loadoutIntent);}finally{collecting=false;}
   });
  };
  /** Compatibility projection only: the caller processes collected births after
   * all commands, so there is no observable birth-time retained render window. */
  const consume=(kind:'receipt'|'callback',callback:number,tick?:number):readonly OriginalReceiverTransientBirth[]=>{
   const frame=input.frames[index];
   if(!frame||frame.prefix.kind!==kind||frame.prefix.callback!==callback||kind==='receipt'&&(frame.prefix.kind!=='receipt'||frame.prefix.tick!==tick))throw Error('CURRENT prefix order mismatch');
   if(frame.prefix.kind==='callback'&&o.pickupContinuationAt)throw Error('CURRENT pickup continuation requires async dispatch');
   current=frame.prefix;index++;const births:OriginalReceiverTransientBirth[]=[];
   executeCommands(frame,event=>births.push(event),false);return Object.freeze(births);
  };
  const rollback=()=>{if(!open)return;doorAdoption?.rollback();barrelAdoption?.rollback();localWeapons?.rollback();projectiles?.rollback();loadout?.rollback();reports?.rollback();open=false;if(!flushing&&!flushWork)this.active=false;};
  const trackFlush=(work:Promise<void>):Promise<void>=>{
   if(!flushWork&&flushing){flushWork=work;const settle=()=>{if(flushWork===work)flushWork=undefined;if(!open&&!flushing&&!flushWork)this.active=false;};void work.then(settle,settle);}
   return work;
  };
  return {
   preparePickupOutputPublication:descriptor=>guarded(()=>{
    if(!streamedPickupOutputs||executing||continuationActive||collecting||flushing||flushWork||index!==input.frames.length
     ||pendingLoadout.length||loadoutText||!current||!sameReceiverScenePrefix(descriptor.prefix,current)
     ||descriptor.loadoutCount!==streamedLoadoutCount||models?.freezePickupOutputDescriptor?.()!==descriptor)throw Error('CURRENT streamed pickup publication mismatch');
    streamedPublication=descriptor;
   },true),
   flushPickupOutputTail:write=>{
    const work=(async()=>{
     let ownsFlush=false;
     try{
      check();
      if(index!==input.frames.length||!current||executing||continuationActive||collecting||flushing||pendingRender||typeof write!=='function'
       ||!pickupDrainOwner||!models?.preparePickupOutputTailDrain||!models.finishPickupWindowDrain
       ||!loadout&&(pendingLoadout.length!==0||loadoutText!==0))throw Error('CURRENT pickup output tail flush unavailable');
      const prefix=current;flushing=true;ownsFlush=true;
      const token=models.preparePickupOutputTailDrain(),intents=Object.freeze([...pendingLoadout]),text=loadoutText;
      if(!sameReceiverScenePrefix(token.prefix,prefix))throw Error('CURRENT pickup output tail prefix mismatch');
      const batch:ReceiverPickupOutputChunk=Object.freeze({prefix:token.prefix,sequence:token.sequence,firstOrdinal:token.firstOrdinal,transitions:token.transitions,loadoutIntents:intents});
      await write(batch);check();
      if(index!==input.frames.length||current!==prefix||executing||continuationActive||collecting||pendingRender||pendingLoadout.length!==intents.length||loadoutText!==text
       ||pendingLoadout.some((value,i)=>value!==intents[i]))throw Error('CURRENT pickup output tail flush changed');
      loadout?.finishPickupWindowDrain(token);localWeapons?.finishPickupWindowDrain(token);models.finishPickupWindowDrain(token);
      check();streamedLoadoutCount+=intents.length;if(!Number.isSafeInteger(streamedLoadoutCount))throw Error('CURRENT streamed loadout count overflow');pendingLoadout.length=0;loadoutText=0;streamedPickupOutputs=true;
     }catch(error){failed=true;throw error;}finally{if(ownsFlush)flushing=false;}
    })();
    return trackFlush(work);
   },
   applyReceipt:(tick,callback)=>guarded(()=>consume('receipt',callback,tick),true),
   advanceCallback:callback=>guarded(()=>consume('callback',callback),true),
   dispatchAt:(prefix,emitBirth,captureScene)=>guarded(()=>{
    const frame=input.frames[index];
    if(!frame||!sameReceiverScenePrefix(frame.prefix,prefix)||typeof emitBirth!=='function')throw Error('CURRENT ordered prefix mismatch');
    if(frame.prefix.kind==='callback'&&o.pickupContinuationAt)throw Error('CURRENT pickup continuation requires async dispatch');
    current=frame.prefix;index++;executing=true;
    try{executeCommands(frame,emitBirth,true,captureScene);}finally{pendingRender=undefined;executing=false;}
   },true),
   dispatchAtAsync:async(prefix,emitBirth,captureScene)=>{
    const frame=guarded(()=>{const entry=input.frames[index];
     if(!entry||!sameReceiverScenePrefix(entry.prefix,prefix)||typeof emitBirth!=='function')throw Error('CURRENT ordered prefix mismatch');
     current=entry.prefix;index++;executing=true;return entry;
    },true);
    try{
     const collect=executeCommands(frame,emitBirth,true,captureScene);
     if(frame.prefix.kind==='callback'&&o.pickupContinuationAt){
      continuationActive=true;
      const performFlush:ReceiverCurrentPickupWindowFlush=async write=>{
       let ownsFlush=false;
       try{
        check();
        if(!continuationActive||!executing||current!==frame.prefix||collecting||flushing||typeof write!=='function'
         ||!pickupDrainOwner||!models?.preparePickupWindowDrain||!models.finishPickupWindowDrain||!loadout||!localWeapons)throw Error('CURRENT pickup window flush unavailable');
        flushing=true;ownsFlush=true;
        const token=models.preparePickupWindowDrain(),intents=Object.freeze([...pendingLoadout]),text=loadoutText;
        const batch:ReceiverCurrentPickupWindowBatch=Object.freeze({prefix:token.prefix,sequence:token.sequence,firstOrdinal:token.firstOrdinal,transitions:token.transitions,loadoutIntents:intents});
        await write(batch);check();
        if(!continuationActive||!executing||current!==frame.prefix||collecting||pendingLoadout.length!==intents.length||loadoutText!==text
         ||pendingLoadout.some((value,i)=>value!==intents[i]))throw Error('CURRENT pickup window flush changed');
        // Every bank authenticates against the same still-live model permit.
        // The model finishes last, invalidating it for all later consumers.
        loadout.finishPickupWindowDrain(token);localWeapons.finishPickupWindowDrain(token);models.finishPickupWindowDrain(token);
        check();streamedLoadoutCount+=intents.length;if(!Number.isSafeInteger(streamedLoadoutCount))throw Error('CURRENT streamed loadout count overflow');pendingLoadout.length=0;loadoutText=0;streamedPickupOutputs=true;
       }catch(error){failed=true;throw error;}finally{if(ownsFlush)flushing=false;}
      };
      const flush:ReceiverCurrentPickupWindowFlush=write=>{
       return trackFlush(performFlush(write));
      };
      let continuationFailed=false,continuationError:unknown;
      try{await o.pickupContinuationAt(frame.prefix,collect,flush);}catch(error){failed=true;continuationFailed=true;continuationError=error;}
      finally{
       // Even a trusted continuation that drops its promise cannot release the
       // private callback until its started persistence operation has drained.
       const pendingFlush=flushWork;
       if(pendingFlush)try{await pendingFlush;}catch(error){if(!continuationFailed){continuationFailed=true;continuationError=error;}}
       continuationActive=false;
      }
      if(continuationFailed)throw continuationError;
     }
     check();
    }catch(error){failed=true;throw error;}
    finally{pendingRender=undefined;executing=false;if(!open&&!flushing&&!flushWork)this.active=false;}
   },
   goodyContext:()=>guarded(()=>{
    if(shotGoody)return shotGoody;
    if(!goodyPresent()||!input.goody)return null;
    if(!loadout)return input.goody;
    // weaponry.stepFrame keeps a present goody while its weapon is VOID.
    // choosegun/ticker and independent FX still run at this boundary.
    const weapon=loadout.freeze().selected;
    return Object.freeze({...input.goody,weapon});
   }),
   snapshotAt:(prefix,actors,transients)=>guarded(()=>{
    if(!current||!sameReceiverScenePrefix(current,prefix))throw Error('CURRENT snapshot prefix mismatch');
    if(transients){
     const capturedPrefix=transients.prefix,models=transients.models,handles=transients.expectedHandles,width=transients.planeWidthWorld;
     if(!capturedPrefix||!sameReceiverScenePrefix(current,capturedPrefix)||!Object.isFrozen(transients)||!Array.isArray(models)||!Object.isFrozen(models)||models.length>o.maxModels
      ||!Array.isArray(handles)||!Object.isFrozen(handles)||handles.length!==models.length||width!==null&&(!Number.isFinite(width)||width<=0))throw Error('Invalid CURRENT staged transient inventory');
     const seen=new Set<string>();let text=0;
     for(let i=0;i<models.length;i++){
      const model=models[i],handle=handles[i];
      if(!model||!Object.isFrozen(model)||model.kind!=='transient'||model.group!=='gsmokes'||typeof handle!=='string'||!handle||handle!==model.handle||seen.has(handle))throw Error('Invalid CURRENT staged transient handles');
      seen.add(handle);text+=handle.length;
     }
     if(!Number.isSafeInteger(text)||text>o.maxTextChars)throw Error('CURRENT staged transient text budget exceeded');
    }
    const state:ReceiverCurrentEnvironmentState=Object.freeze({health:Object.freeze({...health}),alive,barrels:renderBarrels,...(doors?{doors}:{}),...(localWeapons?{localWeapons:localWeapons.snapshotAt(current)}:{}),...(projectiles?{projectiles:projectiles.snapshotAt(current)}:{}),...(loadout?{loadout:loadout.freeze()}: {}),...(transients?{transients}:{})});
    const snapshot=o.snapshotAt(current,state,actors);
    if(!snapshot||!sameReceiverScenePrefix(current,snapshot.prefix)||!Array.isArray(snapshot.models)||snapshot.models.length>o.maxModels||!Array.isArray(snapshot.missing)||snapshot.missing.length>o.maxModels
     ||typeof snapshot.provenance!=='string'||!snapshot.provenance)throw Error('Invalid CURRENT inventory snapshot');
    let text=snapshot.provenance.length;const handles=new Set<string>();
    for(const missing of snapshot.missing){if(typeof missing!=='string')throw Error('Invalid CURRENT missing evidence');text+=missing.length;}
    for(const model of snapshot.models){if(!model||typeof model.handle!=='string'||!model.handle||typeof model.name!=='string'||typeof model.resource!=='string'||typeof model.geometryProvenance!=='string'||!model.geometryProvenance||typeof model.inWorld!=='boolean')throw Error('Invalid CURRENT inventory model');
     if(!['local-weapon','fixed','door','barrel','projectile','sky','transient'].includes(model.kind)||!['soldiers','gsmokes','scene'].includes(model.group)||handles.has(model.handle.toLowerCase()))throw Error('Invalid CURRENT external model ownership');handles.add(model.handle.toLowerCase());
     text+=model.handle.length+model.name.length+model.resource.length+model.geometryProvenance.length;
    }
    if(!Number.isSafeInteger(text)||text>o.maxTextChars)throw Error('CURRENT inventory text budget exceeded');
    const models=Object.freeze(snapshot.models.map((model:ReceiverModelEntry)=>{
     const matrix=model.worldMatrix;
     if(matrix&&(!Array.isArray(matrix)||matrix.length!==16||!matrix.every(Number.isFinite)||matrix[3]!==0||matrix[7]!==0||matrix[11]!==0||matrix[15]!==1))throw Error('Invalid CURRENT inventory matrix');
     const value:ReceiverModelEntry=Object.freeze({handle:model.handle,name:model.name,resource:model.resource,kind:model.kind,group:model.group,inWorld:model.inWorld,geometryProvenance:model.geometryProvenance,pose:poseCopy(model.pose),...(matrix?{worldMatrix:Object.freeze([...matrix])}:{})});return value;
    }));
    return Object.freeze({prefix:current,models,missing:Object.freeze([...snapshot.missing]),provenance:snapshot.provenance});
   }),
   stageEffects:(effects,prefix)=>guarded(()=>{
    if(!current||!sameReceiverScenePrefix(current,prefix)||!Array.isArray(effects)||effects.length>o.maxOutcomes)throw Error('Invalid CURRENT effect prefix or bounds');
    let effectText=0;
    for(const effect of effects){
     if(!effect||!finite(effect.position))throw Error('Invalid CURRENT effect position');
     if(effect.kind==='sound'){if(effect.sound!=='boomnew')throw Error('Invalid CURRENT sound');continue;}
     if(effect.kind!=='bang-hurt'||typeof effect.effectId!=='string'||!effect.effectId||effect.amount!==5||effect.radiusSource!==250||effect.attackerName!==null&&typeof effect.attackerName!=='string')throw Error('Invalid CURRENT hurt effect');
     effectText+=effect.effectId.length+(effect.attackerName?.length??0);if(effectText>o.maxTextChars)throw Error('CURRENT effect text budget exceeded');
    }
    // Validate the whole effect batch before applying any staged health change.
    for(const effect of effects){
     if(effect.kind!=='bang-hurt')continue;
     if(!alive||!input.goody)continue;
     const p=input.goody.eyePosition,distance=Math.hypot(p.x-effect.position.x,p.y-effect.position.y,p.z-effect.position.z);
     if(!(distance<effect.radiusSource*o.sourceScale))continue;
     if(pending.length>=o.maxOutcomes)throw Error('CURRENT outcome budget exceeded');
     outcomeText+=effect.effectId.length+(effect.attackerName?.length??0);if(outcomeText>o.maxTextChars)throw Error('CURRENT outcome text budget exceeded');
     const result=applyOriginalPlayerDamage(health,effect.amount);if(result.dead)alive=false;
     pending.push(Object.freeze({kind:'hurt',effectId:effect.effectId,prefix:current,position:point(effect.position),attackerName:effect.attackerName,amount:effect.amount,health:result.health,dead:result.dead}));
    }
   }),
   prepareCommit:()=>guarded(()=>{
    if(executing||pendingRender||flushing)throw Error('CURRENT dispatch still executing');
    if(streamedPickupOutputs&&(!streamedPublication||pendingLoadout.length||loadoutText||streamedPublication.loadoutCount!==streamedLoadoutCount
     ||!current||!sameReceiverScenePrefix(streamedPublication.prefix,current)||models?.freezePickupOutputDescriptor?.()!==streamedPublication))throw Error('CURRENT streamed pickup outputs require streamed publication');
    if(index!==input.frames.length)throw Error('CURRENT frames remain unconsumed');
    if(target.health!==healthIdentity||target.health.canonical!==baseline.canonical||target.health.flick!==baseline.flick||target.alive!==baseAlive)throw Error('Stale CURRENT health owner');
    if(loadout&&loadout.freeze().selected!==localWeapons!.freeze().selectedWeapon)throw Error('Unsupported CURRENT loadout selection');
    const outcomes=Object.freeze([...pending]);let receiptTick=this.lastReceiptTick;for(const frame of input.frames)if(frame.prefix.kind==='receipt')receiptTick=frame.prefix.tick;
    const loadoutIntents=Object.freeze([...pendingLoadout]);
    const localHitscanOutcomes=Object.freeze([...pendingHitscan]);
    const weaponReports=Object.freeze([...pendingReports]);
    const gunOutputs=Object.freeze([...pendingGunOutputs]);
    let publishWeapons:(()=>void)|undefined,publishProjectiles:(()=>void)|undefined,publishLoadout:(()=>void)|undefined,publishReports:(()=>void)|undefined;
    try{barrelAdoption=o.barrels.prepareAdopt(barrels);if(doors)doorAdoption=o.doors!.prepareAdopt(doors);publishWeapons=localWeapons?.prepareCommit();publishProjectiles=projectiles?.prepareCommit();publishLoadout=loadout?.prepareCommit();publishReports=reports?.prepareCommit();}catch(error){doorAdoption?.rollback();barrelAdoption?.rollback();localWeapons?.rollback();projectiles?.rollback();loadout?.rollback();reports?.rollback();throw error;}
    prepared=true;
    return ()=>{if(!open||!prepared)return;barrelAdoption!.commit();doorAdoption?.commit();publishWeapons?.();publishProjectiles?.();publishLoadout?.();publishReports?.();healthIdentity.canonical=health.canonical;healthIdentity.flick=health.flick;target.alive=alive;
     this.outcomes=outcomes;this.loadoutIntents=loadoutIntents;this.localHitscanOutcomes=localHitscanOutcomes;this.weaponReports=weaponReports;this.gunOutputs=gunOutputs;this.undrained=outcomes.length>0||loadoutIntents.length>0||localHitscanOutcomes.length>0||weaponReports.length>0||gunOutputs.length>0;this.lastPhysicalCallback=input.physicalCallback;
     this.lastReceiptTick=receiptTick;
     this.armed=undefined;this.active=false;open=false;
    };
   },true),
   rollback,
  };
 }
}
