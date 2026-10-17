import type {ReceiverTransientCheckpoint} from './originalReceiverTransientCheckpoint';
import type {ReceiverShotModel} from './originalReceiverShotModels';
import type {WeaponId} from './protocol';
import type {OriginalRemotePosition} from './originalRemoteMovement';
import {sameReceiverScenePrefix,validateReceiverScenePrefix,type ReceiverScenePrefix,type ReceiverExternalSceneSource} from './originalReceiverPrefix';
import {createOriginalReceiverActorRegistrySnapshot,type ReceiverActorRegistrySnapshot} from './originalReceiverActorRegistry';
import {copyReceiverPickupHistory,sameReceiverPickupHistory,type ReceiverPickupHistory,type ReceiverPickupHistorySource,type ReceiverPickupHistoryTransaction} from './originalReceiverPickupHistory';
import type {ReceiverPickupOutputDescriptor,ReceiverPickupOutputChunk} from './originalReceiverPickupOutput';

/** Receiver-local model identity, not Havok bodies or the bullet-filtered scene.
 * Geometry queries are pure over detached ledger snapshots. The backend must
 * disclose missing scene membership; this layer never substitutes a floor ray.
 */
export interface ReceiverModelRotation {x:number;y:number;z:number;w:number}
export interface ReceiverModelPose {position:OriginalRemotePosition;yaw:number;phase:number;scale:number;
  /** Full world orientation. Required for nonplanar retained/bone transforms.
   * Absence denotes an explicitly planar yaw-only geometry adapter. */
  rotation?:ReceiverModelRotation}

export interface ReceiverModelEntry {
  handle:string;name:string;resource:string;group:'soldiers'|'gsmokes'|'scene';
  /** Local camera-owned weapons are external resources, distinct from the
   * receiver's recyclable baddy gun ledger. */
  kind:'gi'|'gun'|'local-weapon'|'fixed'|'door'|'barrel'|'projectile'|'sky'|'transient';
  inWorld:boolean;pose:ReceiverModelPose;geometryProvenance:string;
  /** External imported/private geometry may require a full affine matrix.
   * This matrix transforms its resource-local vertices directly to world. */
  worldMatrix?:readonly number[];
}
export interface ReceiverQueryResult {
  hit:null|{position:Readonly<OriginalRemotePosition>;handle:string;geometryProvenance:string};
  /** Includes every admitted non-bullet-filtered model, or lists missing classes. */
  coverage:{complete:boolean;missing:readonly string[];provenance:string};
}
/** An actual detach operand, valid only inside its issuing backend hook. */
export interface ReceiverDropYawRequest {
  readonly actorId:string;readonly callback:number;readonly prefix:ReceiverScenePrefix;
}
const dropYawRequests=new WeakMap<object,object>();
export function isReceiverDropYawRequest(request:unknown,owner:object):request is ReceiverDropYawRequest {
  return typeof request==='object'&&request!==null&&typeof owner==='object'&&owner!==null&&dropYawRequests.get(request)===owner;
}
export interface ReceiverModelBackend {
  /** Clone pose/phase are resource/native lifecycle inputs, not received target. */
  cloneGI(name:string):{pose:ReceiverModelPose;geometryProvenance:string};
  sphere(model:Readonly<ReceiverModelEntry>):{bspWorld:number;provenance:'declared-resource'|'native-measured'};
  /** Unbounded downward detailed ray. No default distance limit is admissible. */
  nearestDetailedDownward(origin:Readonly<OriginalRemotePosition>,models:readonly Readonly<ReceiverModelEntry>[],callback:number,sceneGeneration:number,prefix?:ReceiverScenePrefix,actors?:ReceiverActorRegistrySnapshot):ReceiverQueryResult;
  /** Resolve bone23 from the previous GI pose, including source self rotations
   * (0,170,10) and translation (0,-3,0). Must not mutate a renderer or ledger. */
  heldGunPose(gi:Readonly<ReceiverModelEntry>,weapon:WeaponId):ReceiverModelPose;
  cloneGun(name:string,weapon:WeaponId):{pose:ReceiverModelPose;geometryProvenance:string};
  /** Membership after parent=gsmokes follows that parent hierarchy. A live
   * smokes parent restores membership regardless of the prior gun bit; an
   * offworld parent does not. Resolve at the current receipt prefix. */
  reparentGunMembership(inWorld:boolean):boolean;
  /** Source random(36)*10 expressed in caller's yaw convention. Pure input-keyed
   * adapter; do not advance external RNG state inside a rollbackable operation. */
  dropYaw(actorId:string,callback:number,request?:ReceiverDropYawRequest):number;
}
export interface ReceiverModelWorldOptions {
  eyeHeight:number;sourceScale:number;goodyBspWorld:number;sceneGeneration:number;
  /** Transport budget: exhaustion requires explicit resynchronization. Never eviction. */
  maxModels:number;maxPickups:number;
  requireCompleteCoverage?:boolean;
  /** Exact native gmodinc checkpoint. Model and recyclable-shader creation
   * share this sequence; a fresh source generation starts at zero. */
  initialCloneCounter?:number;
  /** Bound ownership labels independently of geometry budgets. */
  maxRegistryTextChars?:number;
  /** Opt-in transaction-local identity publication, never retained history. */
  lifecycleJournal?:Readonly<{maxEntries:number;maxTextChars:number}>;
  /** Opaque per-life capture-cache identity; no request is issued by default. */
  dropRequestOwner?:object;
}
export interface ReceiverBaddyBirthRequest {actorId:string;targetFeet:Readonly<OriginalRemotePosition>;targetYaw:number;callback:number;weapon?:WeaponId}
export interface ReceiverBaddyBirthState {
  currentFeet:Readonly<OriginalRemotePosition>;targetFeet:Readonly<OriginalRemotePosition>;
  bspWorld:number;sphereProvenance:'declared-resource'|'native-measured';giHandle:string;gunHandle:string;
  queryCoverage:ReceiverQueryResult['coverage'];
}
export interface ReceiverActorPose {position:Readonly<OriginalRemotePosition>;yaw:number;motionTime:number;weapon?:WeaponId}
interface Binding {gi:string;gun:string;bsp:number;weapon:WeaponId;oldWeapon?:WeaponId;sourcePositionWorld:OriginalRemotePosition}
export interface ReceiverPickup {id:number;handle:string;weapon:WeaponId;position:Readonly<OriginalRemotePosition>}
/** Detached single-record read, authenticated by its issuing staged model owner.
 * The fixed historical pickup position is independent of a recycled gun pose. */
export interface ReceiverPickupOperand {readonly prefix:ReceiverScenePrefix;readonly pickup:Readonly<ReceiverPickup>|null}
const pickupOperandOwners=new WeakMap<object,object>();
const pickupOperandEpochs=new WeakMap<object,object>();
export function isReceiverPickupOperand(value:unknown):value is ReceiverPickupOperand {
  return typeof value==='object'&&value!==null&&pickupOperandOwners.has(value);
}
export type ReceiverModelTransition=Readonly<{ordinal:number;prefix:ReceiverScenePrefix}&(
 {kind:'birth';actorId:string;giHandle:string;gunHandle:string;reused:boolean}
 |{kind:'gun-bound';actorId:string;giHandle:string;gunHandle:string;previousGunHandle:string;weapon:WeaponId}
 |{kind:'detach';actorId:string;giHandle:string;gunHandle:string;pickup:Readonly<ReceiverPickup>;fadeId:number;fadePositionWorld:Readonly<OriginalRemotePosition>}
 |{kind:'pickup-collected';pickup:Readonly<ReceiverPickup>}
 |{kind:'corpse-retired';fadeId:number;giHandle:string;terminalPose:Readonly<ReceiverModelPose>}
)>;
type TransitionPayload=ReceiverModelTransition extends infer T?T extends ReceiverModelTransition?Omit<T,'ordinal'|'prefix'>:never:never;
interface Fade {handle:string;bon:number;bsp:number;target:OriginalRemotePosition}
interface State {models:Map<string,ReceiverModelEntry>;giHandles:Set<string>;gunCatalog:Map<string,{gi:string;weapon:WeaponId}>;actors:Map<string,Binding>;fifo:string[];pickups:Map<number,ReceiverPickup>;pickupHistory?:ReceiverPickupHistory;pickupAliases?:Map<string,number>;fades:Map<number,Fade>;nextClone:number;nextPickup:number;nextFade:number;prefix?:ReceiverScenePrefix;lastReceiptTick?:number}
const copyPoint=(p:Readonly<OriginalRemotePosition>):OriginalRemotePosition=>({x:p.x,y:p.y,z:p.z});
const copyRotation=(q:ReceiverModelRotation):ReceiverModelRotation=>({x:q.x,y:q.y,z:q.z,w:q.w});
const copyPose=(pose:ReceiverModelPose):ReceiverModelPose=>({position:copyPoint(pose.position),yaw:pose.yaw,phase:pose.phase,scale:pose.scale,...(pose.rotation?{rotation:copyRotation(pose.rotation)}:{})});
const freezePose=(pose:ReceiverModelPose)=>{
  const detached=copyPose(pose);Object.freeze(detached.position);
  if(detached.rotation)Object.freeze(detached.rotation);
  return Object.freeze(detached);
};
const yawRotation=(yaw:number):ReceiverModelRotation=>({x:0,y:Math.sin(yaw/2),z:0,w:Math.cos(yaw/2)});
const copyModel=(model:ReceiverModelEntry):ReceiverModelEntry=>({handle:model.handle,name:model.name,resource:model.resource,group:model.group,kind:model.kind,inWorld:model.inWorld,geometryProvenance:model.geometryProvenance,pose:copyPose(model.pose),...(model.worldMatrix?{worldMatrix:[...model.worldMatrix]}:{})});
const freezeModel=(model:ReceiverModelEntry):Readonly<ReceiverModelEntry>=>Object.freeze({...copyModel(model),pose:freezePose(model.pose),...(model.worldMatrix?{worldMatrix:Object.freeze([...model.worldMatrix])}:{})});
const weaponResource:Record<WeaponId,string>={pistol:'pistol',shotgun:'spas12',rifle:'ak47',launcher:'rg6',rpg:'rpg',sniper:'dragunov'};
const finitePoint=(p:Readonly<OriginalRemotePosition>)=>[p.x,p.y,p.z].every(Number.isFinite);
function validatePose(p:ReceiverModelPose):void {if(!finitePoint(p.position)||![p.yaw,p.phase,p.scale].every(Number.isFinite)||p.scale<=0||(p.rotation&&(![p.rotation.x,p.rotation.y,p.rotation.z,p.rotation.w].every(Number.isFinite)||Math.abs(Math.hypot(p.rotation.x,p.rotation.y,p.rotation.z,p.rotation.w)-1)>1e-6)))throw Error('Invalid receiver model pose');}
function replaceExternalModels(s:State,models:readonly ReceiverModelEntry[],maxModels:number):void {
  if(models.length>maxModels)throw Error('Receiver scene budget requires resynchronization');
  const ids=new Set<string>();
  for(const model of models){
    if(model.kind==='gi'||model.kind==='gun'||!model.handle||ids.has(model.handle)||!model.geometryProvenance)throw Error('Invalid external model');
    ids.add(model.handle);validatePose(model.pose);
    if(model.worldMatrix&&(model.worldMatrix.length!==16||!model.worldMatrix.every(Number.isFinite)||model.worldMatrix[3]!==0||model.worldMatrix[7]!==0||model.worldMatrix[11]!==0||model.worldMatrix[15]!==1))throw Error('Invalid receiver external affine matrix');
    const prior=s.models.get(model.handle);if(prior&&(prior.kind==='gi'||prior.kind==='gun'))throw Error('Receiver handle collision');
  }
  const owned=[...s.models.values()].filter(model=>model.kind==='gi'||model.kind==='gun').length;
  if(owned+models.length>maxModels)throw Error('Receiver scene budget requires resynchronization');
  for(const [id,model] of s.models)if(model.kind!=='gi'&&model.kind!=='gun'&&!ids.has(id))s.models.delete(id);
  for(const model of models)s.models.set(model.handle,copyModel(model));
}
function cloneState(s:State):State {return {...s,...(s.pickupHistory?{pickupHistory:copyReceiverPickupHistory(s.pickupHistory)}:{}),...(s.pickupAliases?{pickupAliases:new Map(s.pickupAliases)}:{}),models:new Map([...s.models].map(([k,v])=>[k,copyModel(v)])),giHandles:new Set(s.giHandles),gunCatalog:new Map([...s.gunCatalog].map(([k,v])=>[k,{...v}])),actors:new Map([...s.actors].map(([k,v])=>[k,{...v,sourcePositionWorld:copyPoint(v.sourcePositionWorld)}])),fifo:[...s.fifo],pickups:new Map([...s.pickups].map(([k,v])=>[k,{...v,position:{...v.position}}])),fades:new Map([...s.fades].map(([k,v])=>[k,{...v,target:{...v.target}}]))};}
function fresh(nextClone=0):State{return {models:new Map(),giHandles:new Set(),gunCatalog:new Map(),actors:new Map(),fifo:[],pickups:new Map(),fades:new Map(),nextClone,nextPickup:0,nextFade:0};}
function pickupAliasCount(s:State):number {
 if(!s.pickupHistory||!s.pickupAliases||s.pickupAliases.size>s.gunCatalog.size)throw Error('Receiver pickup alias catalog mismatch');
 let total=0;for(const [handle,count] of s.pickupAliases){
  if(!s.gunCatalog.has(handle)||!Number.isSafeInteger(count)||count<1)throw Error('Receiver pickup alias membership mismatch');
  total+=count;if(!Number.isSafeInteger(total))throw Error('Receiver pickup alias count overflow');
 }
 return total;
}
function actorRegistry(s:State,options:Readonly<ReceiverModelWorldOptions>,callback:number,prefix?:ReceiverScenePrefix,constructingGI?:string,includePickupAliases=false):ReceiverActorRegistrySnapshot {
 // Private creation catalogs and lifecycle collections are bounded before any
 // detached arrays are materialized. Models never define their own coverage.
 if(s.models.size>options.maxModels||s.giHandles.size>options.maxModels||s.gunCatalog.size>options.maxModels||s.actors.size>options.maxModels||s.fades.size>options.maxModels||s.fifo.length>options.maxModels||s.pickups.size>options.maxPickups)throw Error('Receiver actor registry budget exceeded');
 if(includePickupAliases&&s.pickupHistory&&pickupAliasCount(s)!==s.pickupHistory.root.count)throw Error('Receiver pickup alias root count mismatch');
 return createOriginalReceiverActorRegistrySnapshot({sceneGeneration:options.sceneGeneration,callback,...(prefix?{prefix}:{}),...(constructingGI?{constructingGI}:{}),
  giHandles:[...s.giHandles],gunCatalog:[...s.gunCatalog].map(([handle,v])=>({handle,gi:v.gi,weapon:v.weapon})),models:[...s.models.values()].filter(v=>v.kind==='gi'||v.kind==='gun'),
  actors:[...s.actors].map(([actorId,v])=>({actorId,gi:v.gi,gun:v.gun,bsp:v.bsp,weapon:v.weapon,sourcePositionWorld:v.sourcePositionWorld,...(v.oldWeapon?{oldWeapon:v.oldWeapon}:{})})),
  fades:[...s.fades].map(([id,v])=>({id,handle:v.handle,bon:v.bon,bsp:v.bsp,target:v.target})),fifo:s.fifo,pickups:[...s.pickups.values()],...(s.pickupHistory?{pickupHistory:s.pickupHistory}:{}),...(includePickupAliases&&s.pickupAliases?{pickupAliases:[...s.pickupAliases].map(([handle,count])=>({handle,count}))}:{})},
  {maxModels:options.maxModels,maxPickups:options.maxPickups,maxTextChars:options.maxRegistryTextChars??131072});
}
export type ReceiverCloneIncrement='before'|'after';
/** Private model-issued checkpoint for one bounded pickup output flush. */
export interface ReceiverPickupOutputDrain {
  readonly prefix:ReceiverScenePrefix;
  readonly sequence:number;
  readonly firstOrdinal:number;
  readonly transitions:readonly ReceiverModelTransition[];
}
export interface ReceiverPickupWindowDrain extends ReceiverPickupOutputDrain {
  readonly prefix:Extract<ReceiverScenePrefix,{kind:'callback'}>;
}
const pickupWindowDrains=new WeakMap<object,{owner:ReceiverSceneTransaction;validate:()=>void}>();
/** Authentication includes the issuing model transaction and its live epoch. */
export function assertReceiverPickupOutputDrain(token:ReceiverPickupOutputDrain,owner:ReceiverSceneTransaction,prefix:ReceiverScenePrefix):void {
  const known=token&&typeof token==='object'?pickupWindowDrains.get(token):undefined;
  if(!known||known.owner!==owner)throw Error('Unauthenticated receiver pickup window drain');
  validateReceiverScenePrefix(prefix);
  if(!sameReceiverScenePrefix(token.prefix,prefix))throw Error('Receiver pickup window drain prefix mismatch');
  known.validate();
}
export function assertReceiverPickupWindowDrain(token:ReceiverPickupWindowDrain,owner:ReceiverSceneTransaction,prefix:ReceiverScenePrefix):void {
  assertReceiverPickupOutputDrain(token,owner,prefix);
  if(token.prefix.kind!=='callback')throw Error('Receiver pickup window drain requires callback prefix');
}
export interface ReceiverSceneWorld {begin():ReceiverSceneTransaction}
export interface ReceiverSceneTransaction {
  /** Source model clones increment before naming; recyclable shaders name the
   * current counter then increment. Called by the same staged scene owner. */
  allocateCloneName(prefix:string,increment?:ReceiverCloneIncrement):string;
  freezeModels():readonly Readonly<ReceiverModelEntry>[];
  freezeModelTransitions?():readonly ReceiverModelTransition[];
  freezePickupOutputDescriptor?():ReceiverPickupOutputDescriptor|undefined;
  /** Select explicit streamed publication after authentic root/output sealing. */
  preparePickupOutputPublication?(descriptor:ReceiverPickupOutputDescriptor):void;
  preparePickupWindowDrain?():ReceiverPickupWindowDrain;
  preparePickupOutputTailDrain?():ReceiverPickupOutputDrain;
  finishPickupWindowDrain?(token:ReceiverPickupOutputDrain):void;
  flushPickupOutputTail?(write:(chunk:ReceiverPickupOutputChunk)=>Promise<void>):Promise<void>;
  freezeShotModels?():readonly ReceiverShotModel[];
  freezeTransientState?():ReceiverTransientCheckpoint|undefined;
  freezePrefix():ReceiverScenePrefix|undefined;
  /** Admit an exact owned-state label before inline external commands. Queries
   * and preparation require the matching full external refresh afterward. */
  admitExternalPrefix?(prefix:ReceiverScenePrefix):void;
  freezeActorRegistry():ReceiverActorRegistrySnapshot;
  getActorModels(actorId:string):{gi:Readonly<ReceiverModelEntry>;gun:Readonly<ReceiverModelEntry>};
  /** Refresh the exact external prefix after an implicit same-callback birth. */
  refreshExternalModels():void;
  /** Optional source-goody guard and pre-refresh shot lifecycle integration. */
  actorCallbackEnabled?(actorId:string,callback:number):boolean;
  shot?(actorId:string,pose:ReceiverActorPose,callback:number):void;
  advanceExternalCallback(callback:number):void;
  /** Awaitable private dispatch; caller must keep the callback parked. */
  advanceExternalCallbackAsync?(callback:number):Promise<void>;
  applyExternalReceipt(tick:number,callback:number):void;
  birth(request:ReceiverBaddyBirthRequest):ReceiverBaddyBirthState;
  /** BEFORE movement and animation: weapon replacement and old-bone gun pose. */
  beforeCallback(actorId:string,pose:ReceiverActorPose):void;
  afterCallback(actorId:string,pose:ReceiverActorPose):void;
  detach(actorId:string,pose:ReceiverActorPose,callback:number):void;
  /** Only fade actors present before this callback advance. */
  advanceCorpses():void;
  /** No actor/model registry is constructed for an individual ammo lookup. */
  readPickup(id:number):ReceiverPickupOperand;
  collectPickup(id:number|ReceiverPickupOperand):boolean;
  /** Prepare all participants before calling any assignment-only publisher. */
  prepareCommit():()=>void;
  /** Final immutable registry, available only after successful preparation. */
  preparedActorRegistry?():ReceiverActorRegistrySnapshot;
  commit():void;rollback():void;
}
export class OriginalReceiverModelWorld {
  private state:State=fresh();
  private active=false;
  constructor(private readonly backend:ReceiverModelBackend,readonly options:Readonly<ReceiverModelWorldOptions>,private readonly externalSource?:ReceiverExternalSceneSource,private readonly pickupSource?:ReceiverPickupHistorySource){
    const dropRequestOwner=options.dropRequestOwner;
    if(dropRequestOwner!==undefined&&(typeof dropRequestOwner!=='object'||dropRequestOwner===null))throw Error('Invalid receiver drop request owner');
    if(![options.eyeHeight,options.sourceScale,options.goodyBspWorld].every(Number.isFinite)||options.eyeHeight<0||options.sourceScale<=0||options.goodyBspWorld<0
      ||![options.sceneGeneration,options.maxModels,options.maxPickups].every(n=>Number.isSafeInteger(n)&&n>=0)||options.maxModels<1||options.maxPickups<1
      ||!Number.isSafeInteger(options.initialCloneCounter??0)||(options.initialCloneCounter??0)<0
      ||!Number.isSafeInteger(options.maxRegistryTextChars??131072)||(options.maxRegistryTextChars??131072)<1)throw Error('Invalid receiver scene options');
    const rawJournal=options.lifecycleJournal;
    const lifecycleJournal=rawJournal===undefined?undefined:Object.freeze({maxEntries:rawJournal.maxEntries,maxTextChars:rawJournal.maxTextChars});
    if(lifecycleJournal&&(!Number.isSafeInteger(lifecycleJournal.maxEntries)||lifecycleJournal.maxEntries<1||!Number.isSafeInteger(lifecycleJournal.maxTextChars)||lifecycleJournal.maxTextChars<1))throw Error('Invalid receiver lifecycle journal options');
    this.options=Object.freeze({...(lifecycleJournal?{lifecycleJournal}:{}),...(dropRequestOwner!==undefined?{dropRequestOwner}:{}),eyeHeight:options.eyeHeight,sourceScale:options.sourceScale,goodyBspWorld:options.goodyBspWorld,
      sceneGeneration:options.sceneGeneration,maxModels:options.maxModels,maxPickups:options.maxPickups,
      requireCompleteCoverage:options.requireCompleteCoverage,initialCloneCounter:options.initialCloneCounter??0,maxRegistryTextChars:options.maxRegistryTextChars??131072});
    this.state=fresh(this.options.initialCloneCounter);
    if(pickupSource){const history=copyReceiverPickupHistory(pickupSource.history);if(history.root.count!==0||history.root.highWaterId!==0)throw Error('Fresh receiver requires empty pickup history');this.state.pickupHistory=history;this.state.pickupAliases=new Map();}
  }
  /** Imported/private models carry stable handles and current receiver poses.
   * Calls during a view transaction are rejected to avoid future-pose leakage. */
  setExternalModels(models:readonly ReceiverModelEntry[]):void {
    if(this.active)throw Error('Receiver scene transaction active');
    if(this.externalSource)throw Error('Receiver external models require an exact provider prefix');
    const next=cloneState(this.state);replaceExternalModels(next,models,this.options.maxModels);this.state=next;
  }
  reset():void {if(this.active)throw Error('Receiver scene transaction active');if(this.pickupSource)throw Error('Paged receiver reset requires a fresh life source');this.state=fresh(this.options.initialCloneCounter??0);}
  freezeModels():readonly Readonly<ReceiverModelEntry>[] {return Object.freeze([...this.state.models.values()].map(freezeModel));}
  freezePrefix():ReceiverScenePrefix|undefined {return this.state.prefix;}
  freezeActorRegistry():ReceiverActorRegistrySnapshot {return actorRegistry(this.state,this.options,this.state.prefix?.callback??0,this.state.prefix,undefined,true);}
  freezePickups():readonly Readonly<ReceiverPickup>[] {if(this.state.pickupHistory)throw Error('Paged receiver pickups require an authenticated window');return Object.freeze([...this.state.pickups.values()].map(p=>Object.freeze({...p,position:Object.freeze({...p.position})})));}
  debugState():{fifo:readonly string[];actorHandles:readonly {actorId:string;gi:string;gun:string}[];fades:readonly {handle:string;bon:number;target:Readonly<OriginalRemotePosition>}[]}{return {fifo:[...this.state.fifo],actorHandles:[...this.state.actors].map(([actorId,v])=>({actorId,gi:v.gi,gun:v.gun})),fades:[...this.state.fades.values()].map(v=>({...v,target:{...v.target}}))};}
  begin(metadataOnly=false):ReceiverSceneTransaction {
    if(this.active)throw Error('Receiver scene transaction active');
    let pickupPort:ReceiverPickupHistoryTransaction|undefined;
    if(this.pickupSource){
      if(!this.state.pickupHistory||!sameReceiverPickupHistory(copyReceiverPickupHistory(this.pickupSource.history),this.state.pickupHistory))throw Error('Receiver pickup source history mismatch');
      pickupPort=this.pickupSource.begin(metadataOnly);
      try{if(!sameReceiverPickupHistory(copyReceiverPickupHistory(pickupPort.baseHistory),this.state.pickupHistory))throw Error('Receiver pickup transaction history mismatch');}
      catch(error){pickupPort.rollback();throw error;}
    }
    this.active=true;
    const s=cloneState(this.state),o=this.options,b=this.backend,pickupOwner={};
    let open=true,prepared=false,preparedRegistry:ReceiverActorRegistrySnapshot|undefined,constructingGI:string|undefined,pendingExternalPrefix:ReceiverScenePrefix|undefined,admitting=false,admissionFailed=false,journalFailed=false;
    let activeDropRequest:ReceiverDropYawRequest|undefined,dropRequestFailed=false;
    let pickupFailed=false,pickupAdds=0,pickupRemoves=0;
    const transitions:ReceiverModelTransition[]=[];let journalText=0,journalOrdinal=0,drainSequence=0,streamedJournal=false;
    let validatedPickupOutput:ReceiverPickupOutputDescriptor|undefined;
    let transaction:ReceiverSceneTransaction,pendingDrain:ReceiverPickupOutputDrain|undefined;
    const read=()=>{
      if(activeDropRequest){dropYawRequests.delete(activeDropRequest);dropRequestFailed=true;throw Error('Recursive receiver drop request operation');}
      if(!open||prepared||admissionFailed||journalFailed||dropRequestFailed||pickupFailed)throw Error('Receiver scene transaction closed');
    };
    const check=()=>{if(admitting){admissionFailed=true;throw Error('Recursive receiver prefix admission');}read();};
    const copyPrefix=(raw:ReceiverScenePrefix):ReceiverScenePrefix=>{
      if(!raw)throw Error('Invalid receiver scene prefix');
      const kind=raw.kind,sceneGeneration=raw.sceneGeneration,callback=raw.callback;
      if(kind!=='callback'&&kind!=='receipt')throw Error('Invalid receiver scene prefix');
      const prefix:ReceiverScenePrefix=kind==='receipt'?{kind,sceneGeneration,callback,tick:raw.tick}:{kind,sceneGeneration,callback};
      validateReceiverScenePrefix(prefix);return Object.freeze(prefix);
    };
    const frozenPickup=(pickup:ReceiverPickup):Readonly<ReceiverPickup>=>Object.freeze({id:pickup.id,handle:pickup.handle,weapon:pickup.weapon,position:Object.freeze(copyPoint(pickup.position))});
    const paged=<T>(operation:(port:ReceiverPickupHistoryTransaction)=>T):T=>{
      try{if(!pickupPort||!s.prefix)throw Error('Receiver pickup prefix unavailable');pickupPort.assertPrefix(copyPrefix(s.prefix));return operation(pickupPort);}
      catch(error){pickupFailed=true;throw error;}
    };
    const checkedPagedPickup=(raw:Readonly<ReceiverPickup>,id?:number):Readonly<ReceiverPickup>=>{
      // Snapshot scalar inputs before validation. A page row must join the
      // receiver's creation catalog, not merely name some in-world model.
      const pickup=frozenPickup(raw),catalog=s.gunCatalog.get(pickup.handle),model=s.models.get(pickup.handle);
      if(!Number.isSafeInteger(pickup.id)||pickup.id<1||id!==undefined&&(pickup.id!==id||pickup.id>s.nextPickup)||typeof pickup.handle!=='string'||!pickup.handle
        ||!Object.prototype.hasOwnProperty.call(weaponResource,pickup.weapon)||!finitePoint(pickup.position)
        ||!catalog||catalog.weapon!==pickup.weapon||!model||model.kind!=='gun'||model.resource!==weaponResource[pickup.weapon])throw Error('Invalid receiver paged pickup catalog record');
      return pickup;
    };
    // Budget retained known string values, including discriminants/prefix kind;
    // property names and numeric scalars are not text payload. Nested copies
    // are constructed only after enabled-journal preflight succeeds.
    const appendTransition=(event:TransitionPayload)=>{
      if(!o.lifecycleJournal)return;
      try{
        if(!s.prefix)throw Error('Receiver lifecycle journal requires actual prefix');
        if(transitions.length>=o.lifecycleJournal.maxEntries)throw Error('Receiver lifecycle journal entry budget exceeded');
        let text=event.kind.length+s.prefix.kind.length;
        if('actorId' in event)text+=event.actorId.length;
        if('giHandle' in event)text+=event.giHandle.length;
        if('gunHandle' in event)text+=event.gunHandle.length;
        if(event.kind==='gun-bound')text+=event.previousGunHandle.length+event.weapon.length;
        if(event.kind==='detach'||event.kind==='pickup-collected')text+=event.pickup.handle.length+event.pickup.weapon.length;
        const nextText=journalText+text;if(!Number.isSafeInteger(nextText)||nextText>o.lifecycleJournal.maxTextChars)throw Error('Receiver lifecycle journal text budget exceeded');
        const prefix=copyPrefix(s.prefix);
        const detached=event.kind==='detach'?{...event,pickup:frozenPickup(event.pickup),fadePositionWorld:Object.freeze(copyPoint(event.fadePositionWorld))}:event.kind==='pickup-collected'?{...event,pickup:frozenPickup(event.pickup)}:event.kind==='corpse-retired'?{...event,terminalPose:freezePose(event.terminalPose)}:event;
        if(!Number.isSafeInteger(journalOrdinal+1))throw Error('Receiver lifecycle journal ordinal overflow');
        transitions.push(Object.freeze({...detached,ordinal:++journalOrdinal,prefix}) as ReceiverModelTransition);journalText=nextText;
      }catch(error){journalFailed=true;throw error;}
    };
    const requireJournalCallback=(callback:number)=>{
      if(!o.lifecycleJournal)return;
      if(!s.prefix||s.prefix.callback!==callback){journalFailed=true;throw Error('Receiver lifecycle journal callback prefix mismatch');}
    };
    const admitExternalPrefix=(raw:ReceiverScenePrefix)=>{
      check();admitting=true;
      try{
        const prefix=copyPrefix(raw),previous=s.prefix;
        if(!open||prepared||admissionFailed||journalFailed)throw Error('Receiver prefix admission failed or closed');
        if(pendingExternalPrefix)throw Error('Receiver external prefix refresh pending');
        if(prefix.sceneGeneration!==o.sceneGeneration||previous&&(prefix.kind==='callback'?prefix.callback!==previous.callback+1:prefix.callback!==previous.callback)
          ||prefix.kind==='receipt'&&s.lastReceiptTick!==undefined&&prefix.tick<=s.lastReceiptTick)throw Error('Receiver external prefix replay or mismatch');
        s.prefix=prefix;pendingExternalPrefix=prefix;
      }catch(error){admissionFailed=true;throw error;}finally{admitting=false;}
    };
    const allocateCloneName=(prefix:string,increment:ReceiverCloneIncrement='before'):string=>{
      check();
      if(typeof prefix!=='string'||!/^\w[\w-]{0,127}$/.test(prefix)||!['before','after'].includes(increment))throw Error('Invalid receiver clone name request');
      const next=s.nextClone+1;if(!Number.isSafeInteger(next))throw Error('Receiver clone counter requires resynchronization');
      const name=`${prefix}${increment==='before'?next:s.nextClone}`;s.nextClone=next;return name;
    };
    const entries=()=>Object.freeze([...s.models.values()].map(freezeModel));
    const prepareCommit=()=>{
      check();if(pendingDrain)throw Error('Receiver pickup window drain pending');if(pendingExternalPrefix)throw Error('Receiver external prefix refresh pending');
      let publishPickup:(()=>void)|undefined;
      let preparedHistory:ReceiverPickupHistory|undefined;
      if(pickupPort){
        const history=paged(port=>copyReceiverPickupHistory(port.prepareHistory())),base=s.pickupHistory!;
        const expectedCount=base.root.count+pickupAdds-pickupRemoves;
        if(history.observer!==base.observer||history.lifeGeneration!==base.lifeGeneration||!Number.isSafeInteger(expectedCount)||expectedCount<0
          ||history.root.count!==expectedCount||history.root.highWaterId!==s.nextPickup
          ||!sameReceiverPickupHistory(history,base)&&(history.root.version!==base.root.version+1||history.root.key===base.root.key)){
          pickupFailed=true;throw Error('Receiver sealed pickup history mismatch');
        }
        preparedHistory=history;
      }
      // Constructor queries precede actor binding, so enforce the complete
      // retained catalog/reference/text budget again before publication.
      preparedRegistry=actorRegistry(preparedHistory?{...s,pickupHistory:preparedHistory}:s,o,s.prefix?.callback??0,s.prefix,undefined,true);
      if(validatedPickupOutput){
        const previous=validatedPickupOutput,descriptor=transaction.freezePickupOutputDescriptor!();
        if(descriptor!==previous){journalFailed=true;throw Error('Receiver sealed pickup output changed after validation');}
      }
      if(pickupPort)publishPickup=paged(port=>{const publish=port.preparePublish();if(typeof publish!=='function')throw Error('Invalid receiver pickup publisher');return publish;});
      if(preparedHistory)s.pickupHistory=preparedHistory;
      prepared=true;
      return ()=>{if(!open||!prepared)throw Error('Receiver scene publication closed');publishPickup?.();this.state=s;open=false;this.active=false;};
    };
    const external=(prefix:ReceiverScenePrefix)=>{
      check();const frozen=copyPrefix(prefix);
      if(pendingExternalPrefix&&!sameReceiverScenePrefix(pendingExternalPrefix,frozen))throw Error('Receiver external admitted prefix mismatch');
      // Legacy direct calls without a provider retain their historical no-op
      // behavior. Explicit admission still needs this matching completion.
      if(!this.externalSource){
        if(pendingExternalPrefix){if(frozen.kind==='receipt')s.lastReceiptTick=frozen.tick;pendingExternalPrefix=undefined;}
        return;
      }
      const snapshot=this.externalSource.snapshotAt(frozen,actorRegistry(s,o,frozen.callback,frozen,constructingGI));
      if(!snapshot||!sameReceiverScenePrefix(snapshot.prefix,frozen)||!snapshot.provenance||!Array.isArray(snapshot.missing))throw Error('Receiver external prefix mismatch');
      if(snapshot.missing.length)throw Error('Incomplete receiver external scene');
      replaceExternalModels(s,snapshot.models,o.maxModels);
      s.prefix=frozen;if(frozen.kind==='receipt')s.lastReceiptTick=frozen.tick;pendingExternalPrefix=undefined;
    };
    const add=(model:ReceiverModelEntry)=>{validatePose(model.pose);if(s.models.has(model.handle))throw Error('Receiver model identity collision');if(s.models.size>=o.maxModels)throw Error('Receiver scene budget requires resynchronization');s.models.set(model.handle,model);};
    const query=(origin:OriginalRemotePosition,callback:number)=>{
      if(pendingExternalPrefix)throw Error('Receiver external prefix refresh pending');
      if(this.externalSource&&(!s.prefix||s.prefix.callback!==callback))throw Error('Receiver external prefix unavailable');
      if(!finitePoint(origin))throw Error('Invalid receiver ray origin');
      const registry=actorRegistry(s,o,callback,s.prefix,constructingGI),owned=new Map(registry.models.map(model=>[model.handle,model]));
      const queryModels=Object.freeze([...s.models.values()].map(model=>owned.get(model.handle)??freezeModel(model)));
      const answer=b.nearestDetailedDownward(Object.freeze(copyPoint(origin)),queryModels,callback,o.sceneGeneration,s.prefix,registry);
      if(!answer.coverage||!Array.isArray(answer.coverage.missing)||!answer.coverage.provenance||typeof answer.coverage.complete!=='boolean'||(answer.coverage.complete&&answer.coverage.missing.length))throw Error('Invalid receiver query coverage');
      if(o.requireCompleteCoverage!==false&&!answer.coverage.complete)throw Error('Incomplete receiver scene query');
      if(answer.hit){const model=s.models.get(answer.hit.handle);if(!model?.inWorld||!finitePoint(answer.hit.position)||answer.hit.position.y>origin.y||Math.abs(answer.hit.position.x-origin.x)>1e-8||Math.abs(answer.hit.position.z-origin.z)>1e-8||!answer.hit.geometryProvenance)throw Error('Invalid receiver detailed hit');}
      return answer;
    };
    const gun=(gi:ReceiverModelEntry,weapon:WeaponId)=>{
      const resource=weaponResource[weapon],handle=`gun:${resource}:${gi.name}`,existing=s.models.get(handle);
      if(existing){existing.inWorld=b.reparentGunMembership(existing.inWorld);return handle;}
      const cloned=b.cloneGun(handle,weapon);add({handle,name:`${resource}${gi.name}`,resource,kind:'gun',group:'gsmokes',inWorld:true,pose:copyPose(cloned.pose),geometryProvenance:cloned.geometryProvenance});s.gunCatalog.set(handle,{gi:gi.handle,weapon});return handle;
    };
    const preparePickupDrain=(callbackOnly:boolean):ReceiverPickupOutputDrain=>{
      check();
      if(!pickupPort||metadataOnly||!s.prefix||(callbackOnly&&s.prefix.kind!=='callback')||pendingDrain)throw Error('Receiver pickup window drain unavailable');
      if(!Number.isSafeInteger(drainSequence+1)||!Number.isSafeInteger(journalOrdinal+1))throw Error('Receiver pickup window drain counter overflow');
      const prefix=copyPrefix(s.prefix),epoch=paged(port=>port.operandEpoch());
      if(!epoch||typeof epoch!=='object')throw Error('Invalid receiver pickup window epoch');
      const ordinal=journalOrdinal,text=journalText,snapshot=Object.freeze([...transitions]);
      const token:ReceiverPickupOutputDrain=Object.freeze({prefix,sequence:++drainSequence,firstOrdinal:snapshot[0]?.ordinal??ordinal+1,transitions:snapshot});
      pendingDrain=token;
      pickupWindowDrains.set(token,{owner:transaction,validate:()=>{
        const unchanged=()=>{
          check();
          if(pendingDrain!==token||!s.prefix||!sameReceiverScenePrefix(s.prefix,prefix)||journalOrdinal!==ordinal||journalText!==text
            ||transitions.length!==snapshot.length||transitions.some((event,index)=>event!==snapshot[index]))throw Error('Receiver pickup window drain changed');
        };
        unchanged();
        paged(port=>port.validateEpoch(epoch));
        // A configured history port is a callout: caught reentry must not
        // authenticate a journal that changed during epoch validation.
        unchanged();
      }});
      return token;
    };
    transaction={
      allocateCloneName,
      freezeModels:()=>{read();return entries();},
      ...(o.lifecycleJournal?{freezeModelTransitions:()=>{read();if(streamedJournal)throw Error('Receiver streamed lifecycle journal requires streamed delivery');return Object.freeze([...transitions]);}}:{}),
      freezePickupOutputDescriptor:()=>{
        check();if(!streamedJournal)return undefined;
        try{
          const unchanged=()=>{
            check();if(pendingDrain||transitions.length||journalText||!s.prefix||metadataOnly||!pickupPort)throw Error('Receiver streamed pickup output is not fully drained');
          };
          unchanged();
          const sequence=drainSequence,ordinal=journalOrdinal,prefix=copyPrefix(s.prefix!);
          const history=paged(port=>copyReceiverPickupHistory(port.prepareHistory()));
          const descriptor=paged(port=>port.prepareOutput?.());
          if(!descriptor)throw Error('Receiver sealed pickup output missing');
          const output={observer:descriptor.observer,lifeGeneration:descriptor.lifeGeneration,rootKey:descriptor.rootKey,rootVersion:descriptor.rootVersion,
            chunkCount:descriptor.chunkCount,transitionCount:descriptor.transitionCount,loadoutCount:descriptor.loadoutCount,prefix:copyPrefix(descriptor.prefix)};
          // The configured source is a callout. Caught reentry cannot turn a
          // formerly drained journal into an authenticated output stream.
          unchanged();
          const base=s.pickupHistory!,expectedCount=base.root.count+pickupAdds-pickupRemoves;
          if(pickupAliasCount(s)!==history.root.count)throw Error('Receiver sealed pickup alias count mismatch');
          if(drainSequence!==sequence||journalOrdinal!==ordinal||!sameReceiverScenePrefix(s.prefix!,prefix)
            ||history.observer!==base.observer||history.lifeGeneration!==base.lifeGeneration
            ||!Number.isSafeInteger(expectedCount)||expectedCount<0||history.root.count!==expectedCount||history.root.highWaterId!==s.nextPickup
            ||history.root.version!==base.root.version+1||history.root.key===base.root.key
            ||output.observer!==history.observer||output.lifeGeneration!==history.lifeGeneration
            ||output.rootKey!==history.root.key||output.rootVersion!==history.root.version||!sameReceiverScenePrefix(output.prefix,prefix)
            ||output.chunkCount!==sequence||output.transitionCount!==ordinal
            ||!Number.isSafeInteger(output.loadoutCount)||output.loadoutCount<0)throw Error('Receiver sealed pickup output mismatch');
          validatedPickupOutput=descriptor;
          return descriptor;
        }catch(error){journalFailed=true;throw error;}
      },
      preparePickupWindowDrain:()=>preparePickupDrain(true) as ReceiverPickupWindowDrain,
      preparePickupOutputTailDrain:()=>preparePickupDrain(false),
      finishPickupWindowDrain:token=>{
        try{
          check();assertReceiverPickupOutputDrain(token,transaction,s.prefix!);
          transitions.length=0;journalText=0;streamedJournal=true;pendingDrain=undefined;pickupWindowDrains.delete(token);
        }catch(error){journalFailed=true;throw error;}
      },
      freezePrefix:()=>{read();return s.prefix;},
      admitExternalPrefix,
      freezeActorRegistry:()=>{read();return actorRegistry(s,o,s.prefix?.callback??0,s.prefix,constructingGI);},
      readPickup:id=>{
        check();
        if(!Number.isSafeInteger(id)||id<0)throw Error('Invalid receiver pickup id');
        if(!s.prefix)throw Error('Receiver pickup prefix unavailable');
        const prefix=copyPrefix(s.prefix);
        if(prefix.sceneGeneration!==o.sceneGeneration)throw Error('Receiver pickup prefix mismatch');
        const pickup=pickupPort?paged(port=>{const row=port.readPickup(id);return row===null?null:checkedPagedPickup(row,id);}):s.pickups.get(id);
        if(!pickup){const operand=Object.freeze({prefix,pickup:null});pickupOperandOwners.set(operand,pickupOwner);if(pickupPort)pickupOperandEpochs.set(operand,paged(port=>{const token=port.operandEpoch();if(!token||typeof token!=='object')throw Error('Invalid receiver pickup epoch');return token;}));return operand;}
        if(pickup.id!==id||typeof pickup.handle!=='string'||!pickup.handle||!Object.prototype.hasOwnProperty.call(weaponResource,pickup.weapon)||!finitePoint(pickup.position))throw Error('Invalid receiver pickup record');
        const operand=Object.freeze({prefix,pickup:frozenPickup(pickup)});pickupOperandOwners.set(operand,pickupOwner);if(pickupPort)pickupOperandEpochs.set(operand,paged(port=>{const token=port.operandEpoch();if(!token||typeof token!=='object')throw Error('Invalid receiver pickup epoch');return token;}));return operand;
      },
      getActorModels:actorId=>{check();const actor=s.actors.get(actorId);if(!actor)throw Error('Unknown receiver actor');return {gi:freezeModel(s.models.get(actor.gi)!),gun:freezeModel(s.models.get(actor.gun)!)};},
      refreshExternalModels:()=>{check();if(!s.prefix)throw Error('Receiver external prefix unavailable');external(s.prefix);},
      advanceExternalCallback:callback=>external({kind:'callback',callback,sceneGeneration:o.sceneGeneration}),
      applyExternalReceipt:(tick,callback)=>external({kind:'receipt',tick,callback,sceneGeneration:o.sceneGeneration}),
      birth:request=>{
        check();if(pendingExternalPrefix)throw Error('Receiver external prefix refresh pending');
        if(typeof request.actorId!=='string'||!request.actorId||request.actorId.length>(o.maxRegistryTextChars??131072)||!finitePoint(request.targetFeet)||!Number.isFinite(request.targetYaw)||!Number.isSafeInteger(request.callback)||request.callback<0)throw Error('Invalid receiver birth');
        requireJournalCallback(request.callback);
        if(s.actors.has(request.actorId))throw Error('Receiver actor reset requires scene resynchronization');
        const reused=s.fifo.shift();let gi:ReceiverModelEntry;
        if(reused){gi=s.models.get(reused)!;gi.inWorld=true;}
        else{const name=allocateCloneName('baddy'),cloned=b.cloneGI(name);gi={handle:`gi:${name}`,name,resource:'GI',kind:'gi',group:'soldiers',inWorld:true,pose:copyPose(cloned.pose),geometryProvenance:cloned.geometryProvenance};add(gi);s.giHandles.add(gi.handle);}
        gi.pose.scale=.045;
        const sphere=b.sphere(Object.freeze({...copyModel(gi),pose:freezePose(gi.pose)}));
        if(!Number.isFinite(sphere.bspWorld)||sphere.bspWorld<=0||!['declared-resource','native-measured'].includes(sphere.provenance))throw Error('Invalid receiver model sphere');
        const target=copyPoint(request.targetFeet),origin={...target,y:target.y+o.eyeHeight};
        let answer:ReceiverQueryResult;constructingGI=gi.handle;
        try{answer=query(origin,request.callback);}finally{constructingGI=undefined;}
        const current=answer.hit?{...copyPoint(answer.hit.position),y:answer.hit.position.y+sphere.bspWorld-o.eyeHeight}:copyPoint(target);
        if(!finitePoint(current))throw Error('Receiver birth position overflow');
        gi.pose.position={x:current.x+4*o.sourceScale,y:current.y+o.eyeHeight+75*o.sourceScale,z:current.z};validatePose(gi.pose);
        // Source constructor uses RPG regardless of subsequent where metadata.
        const weapon:WeaponId='rpg',handle=gun(gi,weapon);
        const sourcePositionWorld={...current,y:current.y+o.eyeHeight};
        if(!finitePoint(sourcePositionWorld))throw Error('Receiver logical actor position overflow');
        s.actors.set(request.actorId,{gi:gi.handle,gun:handle,bsp:sphere.bspWorld,weapon,sourcePositionWorld});
        appendTransition({kind:'birth',actorId:request.actorId,giHandle:gi.handle,gunHandle:handle,reused:reused!==undefined});
        return Object.freeze({currentFeet:Object.freeze(current),targetFeet:Object.freeze(target),bspWorld:sphere.bspWorld,sphereProvenance:sphere.provenance,giHandle:gi.handle,gunHandle:handle,queryCoverage:Object.freeze({...answer.coverage,missing:Object.freeze([...answer.coverage.missing])})});
      },
      beforeCallback:(actorId,pose)=>{check();const binding=s.actors.get(actorId);if(!binding)throw Error('Unknown receiver actor');const sourcePositionWorld={...copyPoint(pose.position),y:pose.position.y+o.eyeHeight};if(!finitePoint(sourcePositionWorld))throw Error('Invalid receiver logical actor position');binding.sourcePositionWorld=sourcePositionWorld;const gi=s.models.get(binding.gi)!,previousGunHandle=binding.gun;binding.weapon=pose.weapon??binding.weapon;
        const rebound=binding.weapon!==binding.oldWeapon;
        if(binding.weapon!==binding.oldWeapon){s.models.get(binding.gun)!.inWorld=false;binding.oldWeapon=binding.weapon;binding.gun=gun(gi,binding.weapon);}
        const held=b.heldGunPose(Object.freeze({...copyModel(gi),pose:freezePose(gi.pose)}),binding.weapon);validatePose(held);s.models.get(binding.gun)!.pose=copyPose(held);
        if(rebound)appendTransition({kind:'gun-bound',actorId,giHandle:binding.gi,gunHandle:binding.gun,previousGunHandle,weapon:binding.weapon});
      },
      afterCallback:(actorId,pose)=>{check();const binding=s.actors.get(actorId);if(!binding)throw Error('Unknown receiver actor');const gi=s.models.get(binding.gi)!;
        const sourcePositionWorld={...copyPoint(pose.position),y:pose.position.y+o.eyeHeight};if(!finitePoint(sourcePositionWorld))throw Error('Invalid receiver logical actor position');binding.sourcePositionWorld=sourcePositionWorld;
        const next={...gi.pose,position:{...copyPoint(pose.position),y:pose.position.y+o.eyeHeight-o.goodyBspWorld*.6},yaw:pose.yaw,rotation:yawRotation(pose.yaw),phase:pose.motionTime};validatePose(next);gi.pose=next;
      },
      detach:(actorId,pose,callback)=>{check();requireJournalCallback(callback);if(pendingExternalPrefix)throw Error('Receiver external prefix refresh pending');const binding=s.actors.get(actorId);if(!binding)throw Error('Unknown receiver actor');if(!pickupPort&&s.pickups.size>=o.maxPickups)throw Error('Receiver pickup budget requires resynchronization');
        const gi=s.models.get(binding.gi)!,g=s.models.get(binding.gun)!;const drop={...copyPoint(pose.position),y:pose.position.y+o.eyeHeight-binding.bsp/2};
        if(!finitePoint(drop))throw Error('Invalid receiver drop pose');
        let yaw:number;
        if(o.dropRequestOwner!==undefined){
          if(!s.prefix||s.prefix.callback!==callback)throw Error('Receiver drop request callback prefix mismatch');
          const request=Object.freeze({actorId,callback,prefix:copyPrefix(s.prefix)});dropYawRequests.set(request,o.dropRequestOwner);activeDropRequest=request;
          try{yaw=b.dropYaw(actorId,callback,request);if(dropRequestFailed||!open)throw Error('Receiver drop request operation rejected');}
          catch(error){dropRequestFailed=true;throw error;}
          finally{dropYawRequests.delete(request);activeDropRequest=undefined;}
        }else yaw=b.dropYaw(actorId,callback);
        if(!Number.isFinite(yaw))throw Error('Invalid receiver drop pose');g.pose={...g.pose,position:drop,yaw,rotation:yawRotation(yaw)};
        let detachedPickup:Readonly<ReceiverPickup>;
        if(pickupPort){
          const aliases=s.pickupAliases!,aliasCount=(aliases.get(g.handle)??0)+1;
          if(!Number.isSafeInteger(aliasCount)||aliasCount<1)throw Error('Receiver pickup alias count overflow');
          detachedPickup=paged(port=>{const row=checkedPagedPickup(port.append({handle:g.handle,weapon:binding.weapon,position:Object.freeze({...drop})}));
            if(row.id!==s.nextPickup+1||row.handle!==g.handle||row.weapon!==binding.weapon||row.position.x!==drop.x||row.position.y!==drop.y||row.position.z!==drop.z)throw Error('Receiver pickup append identity mismatch');return row;});
          aliases.set(g.handle,aliasCount);s.nextPickup=detachedPickup.id;pickupAdds++;
        }else{const id=++s.nextPickup;detachedPickup={id,handle:g.handle,weapon:binding.weapon,position:{...drop}};s.pickups.set(id,detachedPickup);}
        gi.pose.phase=3000;
        const fadeSphere=b.sphere(Object.freeze({...copyModel(gi),pose:freezePose(gi.pose)}));
        if(!Number.isFinite(fadeSphere.bspWorld)||fadeSphere.bspWorld<=0||!['declared-resource','native-measured'].includes(fadeSphere.provenance))throw Error('Invalid receiver fade sphere');
        gi.inWorld=false;
        const eye={...copyPoint(pose.position),y:pose.position.y+o.eyeHeight},answer=query(eye,callback);
        const tar=answer.hit?{...copyPoint(answer.hit.position),y:answer.hit.position.y+fadeSphere.bspWorld}:{...eye};
        if(!finitePoint(tar))throw Error('Receiver fade target overflow');
        gi.pose.position=eye;validatePose(gi.pose);gi.inWorld=true;const fadeId=++s.nextFade;s.fades.set(fadeId,{handle:gi.handle,bon:0,bsp:fadeSphere.bspWorld,target:tar});s.actors.delete(actorId);
        appendTransition({kind:'detach',actorId,giHandle:gi.handle,gunHandle:g.handle,pickup:detachedPickup,fadeId,fadePositionWorld:eye});
      },
      advanceCorpses:()=>{check();for(const [id,fade] of s.fades){fade.bon+=8;const gi=s.models.get(fade.handle)!;gi.pose.position.y-=fade.bsp/300*8;gi.pose.phase=2400+fade.bon;validatePose(gi.pose);
        if(fade.bon>600){gi.inWorld=false;s.fifo.push(gi.handle);s.fades.delete(id);appendTransition({kind:'corpse-retired',fadeId:id,giHandle:gi.handle,terminalPose:gi.pose});}}
      },
      collectPickup:input=>{
        check();let id:number;
        if(typeof input==='number')id=input;
        else {
          if(!isReceiverPickupOperand(input)||pickupOperandOwners.get(input)!==pickupOwner)throw Error('Unauthenticated receiver pickup operand');
          if(!s.prefix||!sameReceiverScenePrefix(input.prefix,s.prefix))throw Error('Stale receiver pickup operand prefix');
          if(pickupPort)paged(port=>{const token=pickupOperandEpochs.get(input);if(!token)throw Error('Unauthenticated receiver pickup epoch');port.validateEpoch(token);});
          if(!input.pickup)return false;
          id=input.pickup.id;
          const current=pickupPort?paged(port=>{const row=port.readPickup(id);return row===null?null:checkedPagedPickup(row,id);}):s.pickups.get(id);
          if(current&&(current.handle!==input.pickup.handle||current.weapon!==input.pickup.weapon||current.position.x!==input.pickup.position.x||current.position.y!==input.pickup.position.y||current.position.z!==input.pickup.position.z))throw Error('Stale receiver pickup operand');
        }
        const pickup=pickupPort?paged(port=>{if(!Number.isSafeInteger(id)||id<0)throw Error('Invalid receiver pickup id');const row=port.readPickup(id);return row===null?null:checkedPagedPickup(row,id);}):s.pickups.get(id);
        if(!pickup)return false;
        if(pickupPort){
          const aliases=s.pickupAliases!,count=aliases.get(pickup.handle);
          if(!Number.isSafeInteger(count)||count!<1)throw Error('Receiver pickup alias membership missing');
          paged(port=>port.remove(pickup));if(count===1)aliases.delete(pickup.handle);else aliases.set(pickup.handle,count!-1);
          pickupRemoves++;s.models.get(pickup.handle)!.inWorld=false;
        }
        else{s.models.get(pickup.handle)!.inWorld=false;s.pickups.delete(id);}
        appendTransition({kind:'pickup-collected',pickup});return true;
      },
      prepareCommit,
      preparedActorRegistry:()=>{if(!open||!prepared||!preparedRegistry)throw Error('Receiver prepared registry unavailable');return preparedRegistry;},
      commit:()=>{prepareCommit()();},
      rollback:()=>{if(activeDropRequest){dropYawRequests.delete(activeDropRequest);dropRequestFailed=true;}if(open){open=false;this.active=false;pickupPort?.rollback();}},
    };
    return transaction;
  }
}
