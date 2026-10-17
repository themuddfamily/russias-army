import type {ReceiverTransientCheckpoint} from './originalReceiverTransientCheckpoint';
import type {ReceiverShotModel} from './originalReceiverShotModels';
import type {WeaponId} from './protocol';
import type {ReceiverActorRegistrySnapshot} from './originalReceiverActorRegistry';
import type {ReceiverPickupOutputDescriptor} from './originalReceiverPickupOutput';
import {assertReceiverPickupOutputDescriptorRegistry} from './originalReceiverPickupOutputDescriptor';
import type {ReceiverSceneWorld,ReceiverSceneTransaction,ReceiverQueryResult,ReceiverModelTransition} from './originalReceiverModelWorld';
import {createOriginalRemoteMovement,receiveOriginalRemoteMovement,stepOriginalRemoteMovement,type OriginalRemoteMovement,type OriginalRemotePosition} from './originalRemoteMovement';
import {advanceOriginalRemoteSoldierPhase,OriginalRemoteSoldierPhaseError} from './originalRemoteSoldierPhase';
import {isOriginalRemoteShotReport,receiveOriginalRemoteShots,stepOriginalRemoteShots,type OriginalRemoteShots} from './originalRemoteShots';

/** Viewer-specific authority mirror of acknowledged presentation callbacks.
 * Coordinates and poses originate exclusively in snapshots the authority sent.
 * Client input describes receipt/callback ordering, never positions or angles.
 * The caller excludes the viewer from targets and records every full snapshot.
 */
export interface OriginalRemoteViewTarget {
  id:string;position:OriginalRemotePosition;yaw:number;motionTime:number;alive:boolean;
  /** Optional trusted metadata from the actually sent actor packet. */
  weapon?:WeaponId;
  /** Trusted positive-ray report attached to this publication, not trigger count. */
  sourceShots?:number;
  /** Trusted lifecycle reset, e.g. respawn or a new scene generation. */
  reset?:boolean;
}
export interface OriginalRemoteViewSnapshot {tick:number;sentAt:number;targets:readonly OriginalRemoteViewTarget[];firePlayerId?:string;deathPlayerId?:string}
export interface OriginalRemoteViewTrace {receipts:readonly {tick:number;callbacks:number}[];callbacks:number}
export interface OriginalRemoteViewPose {
  readonly id:string;readonly position:Readonly<OriginalRemotePosition>;readonly yaw:number;
  readonly motionTime:number;readonly alive:boolean;readonly steps:number;
  /** Explicit staged coverage when a receiver-model birth adapter is injected. */
  readonly birthCoverage?:Readonly<ReceiverQueryResult['coverage']>;
}
/** Viewer-local detached GI, still a ray blocker but never a damage target. */
export interface OriginalRemoteViewCorpse {
  readonly ownerId:string;readonly sequence:number;
  readonly position:Readonly<OriginalRemotePosition>;readonly yaw:number;
  readonly motionTime:number;readonly deathBon:number;
}
export interface OriginalRemoteViewLimits {
  maxPendingSnapshots:number;maxSnapshotAgeMs:number;clockJitterCallbacks:number;
  maxCallbackLagMs:number;maxCallbacksPerAcceptance:number;
}
export interface OriginalRemoteViewTimeout {
  readonly id:string;readonly position:Readonly<OriginalRemotePosition>;readonly yaw:number;
  readonly weapon?:WeaponId;readonly callback:number;
}
/** Native die metadata after the first callback following a known dead packet. */
export type OriginalRemoteViewDeath=OriginalRemoteViewTimeout;
export interface OriginalRemoteViewShot {readonly id:string;readonly weapon:WeaponId;readonly callback:number;readonly position:Readonly<OriginalRemotePosition>}
export type OriginalRemoteViewCallbackEvent=Readonly<{kind:'shot';shot:OriginalRemoteViewShot}|{kind:'death'|'timeout';transition:OriginalRemoteViewTimeout}>;
/** Ordered receipt/callback lifecycle intents; opt-in avoids changing legacy
 * result shapes. Corpse identity is supplied at die, never inferred from a
 * later final-state snapshot. These arrays are transaction-local, not history. */
export type OriginalRemoteViewModelEvent=Readonly<
 {kind:'shot';shot:OriginalRemoteViewShot}
 |{kind:'death'|'timeout';transition:OriginalRemoteViewTimeout;corpseSequence:number}
 |{kind:'birth';id:string;callback:number;position:Readonly<OriginalRemotePosition>;yaw:number;weapon?:WeaponId}
 |{kind:'corpse-retired';sequence:number;callback:number}
>;
export type OriginalRemoteViewResult={ok:true;transientState?:ReceiverTransientCheckpoint;modelState?:ReceiverActorRegistrySnapshot;pickupOutput?:ReceiverPickupOutputDescriptor;modelTransitions?:readonly ReceiverModelTransition[];shotModels?:readonly ReceiverShotModel[];modelEvents?:readonly OriginalRemoteViewModelEvent[];events?:readonly OriginalRemoteViewCallbackEvent[];shots?:readonly OriginalRemoteViewShot[];timeouts?:readonly OriginalRemoteViewTimeout[];deaths?:readonly OriginalRemoteViewDeath[];transitions?:readonly OriginalRemoteViewTimeout[]}|{ok:false;reason:string};
interface Actor extends OriginalRemoteShots {movement:OriginalRemoteMovement;motionTime:number;alive:boolean;weapon?:WeaponId;birthCoverage?:Readonly<ReceiverQueryResult['coverage']>}
interface Corpse {ownerId:string;sequence:number;position:OriginalRemotePosition;yaw:number;motionTime:number;deathBon:number}
const defaults:OriginalRemoteViewLimits={maxPendingSnapshots:64,maxSnapshotAgeMs:1000,clockJitterCallbacks:2,maxCallbackLagMs:1000,maxCallbacksPerAcceptance:4096};
const integer=(value:number)=>Number.isSafeInteger(value)&&value>=0;
const finite=(value:number)=>Number.isFinite(value);
type Rejection=Extract<OriginalRemoteViewResult,{ok:false}>;
export type OriginalRemoteViewDelivery=Rejection|{ok:true;result:Extract<OriginalRemoteViewResult,{ok:true}>;nextPoses:readonly OriginalRemoteViewPose[];commit():void;rollback():void};
const fail=(reason:string):Rejection=>({ok:false,reason});

/** An epoch is established by a trusted welcome/reset and shared with the client.
 * Clock/receipt limits are explicit network adapters, not recovered game rules.
 * Missing/stale receipts and saturated queues require explicit resynchronization
 * by constructing a new mirror; no snapshot or movement history is substituted.
 * Server acknowledgements cannot prove the actual client display, but restrict
 * every admissible pose to the recovered recurrence over real sent snapshots.
 * Integration must replace per-actor render accumulators with ONE shared global
 * integer 30 Hz callback clock, including consistent packet-before/after-step
 * ordering. The existing RemotePlayer accumulator resets at actor creation and
 * therefore cannot directly consume this global trace. Transported phase stays
 * at the latest received authority phase between packets. Source-callback mode
 * instead starts bon at zero and advances from each movement callback's retained
 * speed; packet motionTime remains validated transport metadata. The reset flag comes
 * only from stored authority data, never from a client receipt. Transport must
 * validate the trace object's structural shape before passing it to accept().
 * The renderer anchors its global callback clock at welcome receipt. Its
 * unknown delivery offset is bounded by maxCallbackLagMs against the trusted
 * sent epoch, including the receipt-before-send check. This is a transport
 * budget, not proof of native timing. Phase events share the ordered receipt
 * stream. Transported fire changes phase only; source-callback fire receipts
 * are inert and positive where reports feed scalar misses/aiming. Consumption
 * precedes gun refresh and movement; publication timing and complete positive
 * ray membership remain the caller's qualified transport reconstruction.
 * A known death marks lives zero without
 * replacing the latest where target, weapon or phase. Its next callback still
 * steps movement, then removes the actor and emits detached die metadata.
 * A full snapshot omitting a living actor is absence of a source where packet:
 * retain its recurrence until the exact -450 callback removes the active actor.
 * Accepted timeout events carry only detached, trusted last-packet metadata.
 * An omitted pending death remains until that callback, as dead precedes leave.
 * Unknown already-dead actors create neither an actor nor a historical pickup.
 * Detached corpses have independent identities and persist for76 fade callbacks
 * as ray blockers. They are outside freeze() and cannot authorize damage hits.
 */
export class OriginalRemoteView {
  private readonly limits:OriginalRemoteViewLimits;
  private pending:OriginalRemoteViewSnapshot[]=[];
  private actors=new Map<string,Actor>();
  private corpses=new Map<number,Corpse>();
  private corpseSequence=0;
  private callbacks=0;
  private lastSentTick=-1;
  private lastSentAt:number;
  private lastAcceptedAt:number;
  private acceptanceActive=false;
  private checkpoint(){return {actors:this.actors,corpses:this.corpses,callbacks:this.callbacks,corpseSequence:this.corpseSequence,pending:this.pending,lastSentTick:this.lastSentTick,lastSentAt:this.lastSentAt,lastAcceptedAt:this.lastAcceptedAt};}
  private restore(state:ReturnType<OriginalRemoteView['checkpoint']>):void {this.actors=state.actors;this.corpses=state.corpses;this.callbacks=state.callbacks;this.corpseSequence=state.corpseSequence;this.pending=state.pending;this.lastSentTick=state.lastSentTick;this.lastSentAt=state.lastSentAt;this.lastAcceptedAt=state.lastAcceptedAt;}
  constructor(private readonly epoch:number,limits:Partial<OriginalRemoteViewLimits>={},private readonly phaseMode:'transported'|'source-callback'='transported',private readonly modelWorld?:ReceiverSceneWorld,private readonly emitModelEvents=false){
    this.limits={...defaults,...limits};
    if(typeof emitModelEvents!=='boolean'||!['transported','source-callback'].includes(phaseMode)||!finite(epoch)||epoch<0||Object.values(this.limits).some(v=>!finite(v)||v<0)
      ||!integer(this.limits.maxPendingSnapshots)||this.limits.maxPendingSnapshots<1
      ||!integer(this.limits.clockJitterCallbacks)||!integer(this.limits.maxCallbacksPerAcceptance))throw Error('Invalid source view limits/epoch');
    if(modelWorld&&phaseMode!=='source-callback')throw Error('Receiver scene requires source callback mode');
    this.lastSentAt=epoch;this.lastAcceptedAt=epoch;
  }
  /** Call only after the associated snapshot was actually sent to this viewer. */
  recordSent(snapshot:OriginalRemoteViewSnapshot):OriginalRemoteViewResult {
    if(this.acceptanceActive)return fail('acceptance_active');
    if(!integer(snapshot.tick)||snapshot.tick<=this.lastSentTick||!finite(snapshot.sentAt)||snapshot.sentAt<this.lastSentAt)return fail('invalid_sent_order');
    if(this.pending.length>=this.limits.maxPendingSnapshots)return fail('snapshot_queue_full');
    if(snapshot.firePlayerId!==undefined&&(typeof snapshot.firePlayerId!=='string'||snapshot.firePlayerId.length<1||snapshot.firePlayerId.length>128||snapshot.targets.length!==0))return fail('invalid_fire_target');
    if(snapshot.deathPlayerId!==undefined&&(typeof snapshot.deathPlayerId!=='string'||snapshot.deathPlayerId.length<1||snapshot.deathPlayerId.length>128||snapshot.targets.length!==0||snapshot.firePlayerId!==undefined))return fail('invalid_death_target');
    const ids=new Set<string>();
    for(const target of snapshot.targets){
      if(typeof target.id!=='string'||!target.id.length||ids.has(target.id)||typeof target.alive!=='boolean'
        ||![target.position.x,target.position.y,target.position.z,target.yaw,target.motionTime].every(finite)
        ||target.motionTime<0||(target.reset!==undefined&&typeof target.reset!=='boolean')
        ||!isOriginalRemoteShotReport(target.sourceShots)
        ||(target.weapon!==undefined&&!['pistol','shotgun','rifle','launcher','rpg','sniper'].includes(target.weapon)))return fail('invalid_sent_target');
      ids.add(target.id);
    }
    this.pending.push({tick:snapshot.tick,sentAt:snapshot.sentAt,targets:snapshot.targets.map(target=>({...target,position:{x:target.position.x,y:target.position.y,z:target.position.z}})),...(snapshot.firePlayerId===undefined?{}:{firePlayerId:snapshot.firePlayerId}),...(snapshot.deathPlayerId===undefined?{}:{deathPlayerId:snapshot.deathPlayerId})});
    this.lastSentTick=snapshot.tick;this.lastSentAt=snapshot.sentAt;return {ok:true};
  }
  /** Synchronous in-process delivery stages its unsent queue entry as well as
   * acceptance. Online callers continue recordSent after actual transmission. */
  prepareSynchronousDelivery(snapshot:OriginalRemoteViewSnapshot,order:{receiptCallbacks:number;callbacks:number},now:number):OriginalRemoteViewDelivery {
    if(this.acceptanceActive)return fail('acceptance_active');
    const prior=this.checkpoint();this.pending=[...this.pending];
    try{
      const sent=this.recordSent(snapshot);
      if(!sent.ok){this.restore(prior);return sent;}
      const stage=this.prepareAcceptance({callbacks:order.callbacks,receipts:[{tick:snapshot.tick,callbacks:order.receiptCallbacks}]},now);
      this.restore(prior);return stage;
    }catch(error){this.restore(prior);throw error;}
  }
  /** One private replay across external pickup windows. Live reads remain at
   * the committed checkpoint; cancellation drains awaited work before admitting
   * another receipt/life. The returned stage still requires cohort publication. */
  async prepareAsynchronousDelivery(snapshot:OriginalRemoteViewSnapshot,order:{receiptCallbacks:number;callbacks:number},now:number,
    finalize?:(scene:ReceiverSceneTransaction)=>Promise<void>,signal?:AbortSignal):Promise<OriginalRemoteViewDelivery> {
    if(this.acceptanceActive)return fail('acceptance_active');
    const fork=new OriginalRemoteView(this.epoch,this.limits,this.phaseMode,this.modelWorld,this.emitModelEvents),prior=this.checkpoint();
    fork.restore({...prior,pending:[...prior.pending],actors:new Map([...prior.actors].map(([id,actor])=>[id,{...actor,movement:{...actor.movement,
      position:{...actor.movement.position},target:{...actor.movement.target},speed:{...actor.movement.speed}}}])),
      corpses:new Map([...prior.corpses].map(([id,corpse])=>[id,{...corpse,position:{...corpse.position}}]))});
    const sent=fork.recordSent(snapshot);if(!sent.ok)return sent;
    const trace={callbacks:order.callbacks,receipts:[{tick:snapshot.tick,callbacks:order.receiptCallbacks}]};
    const invalid=fork.validateTrace(trace,now);if(invalid)return invalid;
    const abortCheck=()=>{if(signal?.aborted)throw signal.reason??new Error('Receiver asynchronous delivery aborted');};
    abortCheck();this.acceptanceActive=true;
    let scene:ReceiverSceneTransaction|undefined,sceneRolledBack=false,open=true,settled=false;
    let abortRollbackError:unknown;
    const rollbackScene=()=>{if(scene&&!sceneRolledBack){sceneRolledBack=true;scene.rollback();}};
    const release=()=>{open=false;this.acceptanceActive=false;signal?.removeEventListener('abort',onAbort);};
    const onAbort=()=>{try{rollbackScene();}catch(error){abortRollbackError=error;}if(settled)release();};
    signal?.addEventListener('abort',onAbort,{once:true});
    try{
      abortCheck();scene=this.modelWorld?.begin();abortCheck();
      const timeouts:OriginalRemoteViewTimeout[]=[],deaths:OriginalRemoteViewDeath[]=[],transitions:OriginalRemoteViewTimeout[]=[],shots:OriginalRemoteViewShot[]=[],events:OriginalRemoteViewCallbackEvent[]=[],modelEvents:OriginalRemoteViewModelEvent[]|undefined=this.emitModelEvents?[]:undefined;
      const advance=async(callbacks:number)=>{
        for(let index=fork.callbacks;index<callbacks;index++){
          abortCheck();
          if(scene?.advanceExternalCallbackAsync)await scene.advanceExternalCallbackAsync(index+1);
          else scene?.advanceExternalCallback(index+1);
          abortCheck();fork.advanceActors(index+1,timeouts,deaths,transitions,shots,events,scene,modelEvents);fork.callbacks=index+1;
        }
      };
      for(let index=0;index<trace.receipts.length;index++){
        await advance(trace.receipts[index].callbacks);abortCheck();fork.apply(fork.pending[index],scene,modelEvents);abortCheck();
      }
      await advance(trace.callbacks);abortCheck();
      fork.pending=fork.pending.slice(trace.receipts.length);fork.lastAcceptedAt=now;
      if(finalize){if(!scene)throw Error('Receiver asynchronous finalization requires a scene');await finalize(scene);abortCheck();}
      const next=fork.checkpoint(),nextPoses=fork.freeze();
      const pickupOutput=scene?.freezePickupOutputDescriptor?.();
      const journalReader=scene?.freezeModelTransitions,modelTransitions=pickupOutput===undefined?journalReader?.call(scene):undefined;
      let modelState=pickupOutput!==undefined||journalReader?scene!.freezeActorRegistry():undefined;
      if(pickupOutput!==undefined&&!scene?.preparedActorRegistry)throw Error('Streamed pickup output requires prepared actor registry');
      const shotModels=scene?.freezeShotModels?.(),transientState=scene?.freezeTransientState?.();
      if(pickupOutput!==undefined)scene?.preparePickupOutputPublication?.(pickupOutput);
      const publishScene=scene?.prepareCommit();
      if((pickupOutput!==undefined||journalReader)&&scene?.preparedActorRegistry)modelState=scene.preparedActorRegistry();
      if(pickupOutput!==undefined)assertReceiverPickupOutputDescriptorRegistry(pickupOutput,modelState!,{callback:trace.callbacks,receiptTick:snapshot.tick});
      abortCheck();
      const result:Extract<OriginalRemoteViewResult,{ok:true}>=Object.freeze({ok:true,...(transientState!==undefined?{transientState}:{}),...(modelState!==undefined?{modelState}:{}),...(pickupOutput!==undefined?{pickupOutput}:{}),...(modelTransitions!==undefined?{modelTransitions}:{}),...(shotModels!==undefined?{shotModels}:{}),...(modelEvents?.length?{modelEvents:Object.freeze(modelEvents)}:{}),...(events.length?{events:Object.freeze(events)}:{}),...(shots.length?{shots:Object.freeze(shots)}:{}),...(timeouts.length?{timeouts:Object.freeze(timeouts)}:{}),...(deaths.length?{deaths:Object.freeze(deaths)}:{}),...(timeouts.length&&deaths.length?{transitions:Object.freeze(transitions)}:{})});
      settled=true;
      return {ok:true,result,nextPoses,
        commit:()=>{if(!open||!this.acceptanceActive)throw Error('Receiver delivery stage closed');abortCheck();publishScene?.();this.restore(next);release();},
        rollback:()=>{if(open){try{rollbackScene();}finally{release();}}},
      };
    }catch(error){
      try{rollbackScene();}finally{settled=true;release();}
      const failure=signal?.aborted?(signal.reason??new Error('Receiver asynchronous delivery aborted')):error;
      if(abortRollbackError!==undefined)throw new AggregateError([failure,abortRollbackError],'Receiver asynchronous cancellation rollback failed');
      if(this.phaseMode==='source-callback'&&failure instanceof OriginalRemoteSoldierPhaseError)return fail('source_phase_overflow');
      throw failure;
    }
  }
  /** Validate the complete transaction before changing actors, queue or clocks. */
  accept(trace:OriginalRemoteViewTrace,now:number):OriginalRemoteViewResult {
    const stage=this.prepareAcceptance(trace,now);if(!stage.ok)return stage;
    try{stage.commit();return stage.result;}catch(error){stage.rollback();throw error;}
  }
  private validateTrace(trace:OriginalRemoteViewTrace,now:number):Rejection|undefined {
    if(this.acceptanceActive)return fail('acceptance_active');
    if(!finite(now)||now<this.lastAcceptedAt)return fail('invalid_trusted_time');
    if(!integer(trace.callbacks)||trace.callbacks<this.callbacks)return fail('invalid_callback_order');
    const elapsedCallbacks=Math.floor((now-this.epoch)*30/1000+1e-8);
    const oldestCallbacks=Math.floor(Math.max(0,now-this.epoch-this.limits.maxCallbackLagMs)*30/1000+1e-8);
    if(trace.callbacks>elapsedCallbacks+this.limits.clockJitterCallbacks)return fail('future_callbacks');
    if(trace.callbacks<oldestCallbacks-this.limits.clockJitterCallbacks)return fail('stale_callbacks');
    if(trace.callbacks-this.callbacks>this.limits.maxCallbacksPerAcceptance)return fail('callback_budget');
    if(trace.receipts.length>this.pending.length)return fail('unknown_snapshot');
    let cursor=this.callbacks;
    for(let index=0;index<trace.receipts.length;index++){
      const receipt=trace.receipts[index],snapshot=this.pending[index];
      if(!integer(receipt.tick)||receipt.tick!==snapshot.tick)return fail('invalid_receipt_order');
      if(!integer(receipt.callbacks)||receipt.callbacks<cursor||receipt.callbacks>trace.callbacks)return fail('invalid_callback_order');
      if(snapshot.sentAt>now)return fail('future_snapshot');
      if(now-snapshot.sentAt>this.limits.maxSnapshotAgeMs)return fail('stale_snapshot');
      const earliest=Math.floor(Math.max(0,snapshot.sentAt-this.epoch-this.limits.maxCallbackLagMs)*30/1000+1e-8)-this.limits.clockJitterCallbacks;
      if(receipt.callbacks<earliest)return fail('receipt_before_send');
      cursor=receipt.callbacks;
    }
    // A stale pending head cannot be skipped by submitting an empty receipt list.
    if(this.pending[trace.receipts.length]&&now-this.pending[trace.receipts.length].sentAt>this.limits.maxSnapshotAgeMs)return fail('stale_snapshot');
    return undefined;
  }
  private prepareAcceptance(trace:OriginalRemoteViewTrace,now:number):OriginalRemoteViewDelivery {
    const invalid=this.validateTrace(trace,now);if(invalid)return invalid;
    const timeouts:OriginalRemoteViewTimeout[]=[],deaths:OriginalRemoteViewDeath[]=[],transitions:OriginalRemoteViewTimeout[]=[],shots:OriginalRemoteViewShot[]=[],events:OriginalRemoteViewCallbackEvent[]=[],modelEvents:OriginalRemoteViewModelEvent[]|undefined=this.emitModelEvents?[]:undefined;
    const prior=this.checkpoint();
    this.actors=new Map([...prior.actors].map(([id,actor])=>[id,{...actor,movement:{...actor.movement,
      position:{...actor.movement.position},target:{...actor.movement.target},speed:{...actor.movement.speed}}}]));
    this.corpses=new Map([...prior.corpses].map(([sequence,corpse])=>[sequence,{...corpse,position:{...corpse.position}}]));
    this.acceptanceActive=true;
    let scene:ReceiverSceneTransaction|undefined;
    try{
      scene=this.modelWorld?.begin();
      for(let index=0;index<trace.receipts.length;index++){
        this.advance(trace.receipts[index].callbacks,timeouts,deaths,transitions,shots,events,scene,modelEvents);this.apply(this.pending[index],scene,modelEvents);
      }
      this.advance(trace.callbacks,timeouts,deaths,transitions,shots,events,scene,modelEvents);
      this.pending=this.pending.slice(trace.receipts.length);this.lastAcceptedAt=now;
      const next=this.checkpoint(),nextPoses=this.freeze();
      // Optional stage-local identity journal: capture once after mutation and
      // before sealing. It becomes accepted only through this delivery commit.
      if(scene?.freezePickupOutputDescriptor?.()!==undefined)throw Error('Streamed pickup output requires asynchronous delivery');
      const journalReader=scene?.freezeModelTransitions;
      const modelTransitions=journalReader?.call(scene);
      let modelState=journalReader?scene!.freezeActorRegistry():undefined;
      const shotReader=scene?.freezeShotModels;
      const shotModels=shotReader?.call(scene);
      const transientReader=scene?.freezeTransientState;
      const transientState=transientReader?.call(scene);
      const publishScene=scene?.prepareCommit();
      if(journalReader&&scene?.preparedActorRegistry)modelState=scene.preparedActorRegistry();
      const result:Extract<OriginalRemoteViewResult,{ok:true}>=Object.freeze({ok:true,...(transientState!==undefined?{transientState}:{}),...(modelState!==undefined?{modelState}:{}),...(modelTransitions!==undefined?{modelTransitions}:{}),...(shotModels!==undefined?{shotModels}:{}),...(modelEvents?.length?{modelEvents:Object.freeze(modelEvents)}:{}),...(events.length?{events:Object.freeze(events)}:{}),...(shots.length?{shots:Object.freeze(shots)}:{}),...(timeouts.length?{timeouts:Object.freeze(timeouts)}:{}),...(deaths.length?{deaths:Object.freeze(deaths)}:{}),
        ...(timeouts.length&&deaths.length?{transitions:Object.freeze(transitions)}:{})});
      this.restore(prior);this.acceptanceActive=true;let open=true;
      return {ok:true,result,nextPoses,
        commit:()=>{if(!open||!this.acceptanceActive)throw Error('Receiver delivery stage closed');publishScene?.();this.restore(next);open=false;this.acceptanceActive=false;},
        rollback:()=>{if(open){scene?.rollback();open=false;this.acceptanceActive=false;}},
      };
    }catch(error){
      scene?.rollback();this.restore(prior);this.acceptanceActive=false;
      if(this.phaseMode==='source-callback'&&error instanceof OriginalRemoteSoldierPhaseError)return fail('source_phase_overflow');
      throw error;
    }
  }
  /** Detached, immutable poses; use all living entries for nearest-target checks. */
  sourceWeaponOf(id:string):WeaponId|undefined {return this.actors.get(id)?.weapon;}
  freeze():readonly OriginalRemoteViewPose[] {
    return Object.freeze([...this.actors].map(([id,actor])=>Object.freeze({id,position:Object.freeze({...actor.movement.position}),yaw:actor.movement.yaw,motionTime:actor.motionTime,alive:actor.alive,steps:actor.movement.steps,...(actor.birthCoverage?{birthCoverage:actor.birthCoverage}:{})})));
  }
  /** Detached immutable blockers; old owner ids never confer damage eligibility. */
  freezeCorpses():readonly OriginalRemoteViewCorpse[] {
    return Object.freeze([...this.corpses.values()].map(corpse=>Object.freeze({...corpse,position:Object.freeze({...corpse.position})})));
  }
  debugState():{epoch:number;callbacks:number;pendingTicks:number[];pendingSentAt:number[];lastAcceptedAt:number}{return {epoch:this.epoch,callbacks:this.callbacks,pendingTicks:this.pending.map(s=>s.tick),pendingSentAt:this.pending.map(s=>s.sentAt),lastAcceptedAt:this.lastAcceptedAt};}
  private advance(callbacks:number,timeouts:OriginalRemoteViewTimeout[],deaths:OriginalRemoteViewDeath[],transitions:OriginalRemoteViewTimeout[],shots:OriginalRemoteViewShot[],events:OriginalRemoteViewCallbackEvent[],scene?:ReceiverSceneTransaction,modelEvents?:OriginalRemoteViewModelEvent[]):void {
    for(let index=this.callbacks;index<callbacks;index++){
      scene?.advanceExternalCallback(index+1);
      this.advanceActors(index+1,timeouts,deaths,transitions,shots,events,scene,modelEvents);
    }
    this.callbacks=callbacks;
  }
  private advanceActors(callback:number,timeouts:OriginalRemoteViewTimeout[],deaths:OriginalRemoteViewDeath[],transitions:OriginalRemoteViewTimeout[],shots:OriginalRemoteViewShot[],events:OriginalRemoteViewCallbackEvent[],scene?:ReceiverSceneTransaction,modelEvents?:OriginalRemoteViewModelEvent[]):void {
      // Native fade actors present before this callback advance once. A GI
      // detached below begins at die's3000 and first fades on the next callback.
      scene?.advanceCorpses();
      for(const [sequence,corpse] of this.corpses){
        corpse.deathBon+=8;corpse.motionTime=2400+corpse.deathBon;
        if(corpse.deathBon>600){this.corpses.delete(sequence);modelEvents?.push(Object.freeze({kind:'corpse-retired',sequence,callback}));}
      }
      for(const [id,actor] of this.actors){
        if(scene?.actorCallbackEnabled?.(id,callback)===false)continue;
        if(this.phaseMode==='source-callback'&&stepOriginalRemoteShots(actor,actor.weapon??'rifle')){
          actor.motionTime=2000;
          const weapon=actor.weapon??'rifle';
          if(['pistol','shotgun','rifle','sniper'].includes(weapon)){const shot=Object.freeze({id,weapon,callback,position:Object.freeze({...actor.movement.position})});shots.push(shot);events.push(Object.freeze({kind:'shot',shot}));modelEvents?.push(Object.freeze({kind:'shot',shot}));}
          scene?.shot?.(id,{position:actor.movement.position,yaw:actor.movement.yaw,motionTime:actor.motionTime,weapon:actor.weapon},callback);
        }
        scene?.beforeCallback(id,{position:actor.movement.position,yaw:actor.movement.yaw,motionTime:actor.motionTime,weapon:actor.weapon});
        const timeout=stepOriginalRemoteMovement(actor.movement);
        if(this.phaseMode==='source-callback')actor.motionTime=advanceOriginalRemoteSoldierPhase(actor.motionTime,actor.movement.speed);
        scene?.afterCallback(id,{position:actor.movement.position,yaw:actor.movement.yaw,motionTime:actor.motionTime,weapon:actor.weapon});
        if(timeout||!actor.alive){
          const metadata=Object.freeze({id,position:Object.freeze({...actor.movement.position}),yaw:actor.movement.yaw,
            ...(actor.weapon===undefined?{}:{weapon:actor.weapon}),callback});
          // Source -450 overwrites zero lives with -1 and gives disconnected
          // feedback before the single die invocation: never emit two pickups.
          if(timeout)timeouts.push(metadata);else deaths.push(metadata);
          // Preserve callback and actor insertion order across transition reasons.
          transitions.push(metadata);events.push(Object.freeze({kind:timeout?'timeout':'death',transition:metadata}));
          scene?.detach(id,{position:actor.movement.position,yaw:actor.movement.yaw,motionTime:actor.motionTime,weapon:actor.weapon},callback);
          const sequence=++this.corpseSequence;
          modelEvents?.push(Object.freeze({kind:timeout?'timeout':'death',transition:metadata,corpseSequence:sequence}));
          this.corpses.set(sequence,{ownerId:id,sequence,position:{...metadata.position},yaw:metadata.yaw,motionTime:3000,deathBon:0});
          this.actors.delete(id);
        }
      }
  }
  private apply(snapshot:OriginalRemoteViewSnapshot,scene?:ReceiverSceneTransaction,modelEvents?:OriginalRemoteViewModelEvent[]):void {
    scene?.applyExternalReceipt(snapshot.tick,this.callbacks);
    if(snapshot.firePlayerId!==undefined){
      const actor=this.actors.get(snapshot.firePlayerId);
      if(this.phaseMode==='transported'&&actor?.alive)actor.motionTime=2000;
      return;
    }
    if(snapshot.deathPlayerId!==undefined){
      const actor=this.actors.get(snapshot.deathPlayerId);
      if(actor?.alive)actor.alive=false;
      return;
    }
    for(const target of snapshot.targets){
      const previous=this.actors.get(target.id);
      // A dead snapshot carries no native where update. Repeated dead packets
      // cannot replace the pending actor's pose, weapon or callback recurrence.
      if(!target.alive){if(previous?.alive)previous.alive=false;continue;}
      if(!previous||target.reset){
        const birth=scene?.birth({actorId:target.id,targetFeet:target.position,targetYaw:target.yaw+Math.PI,callback:this.callbacks,weapon:target.weapon});
        const actor:Actor={movement:createOriginalRemoteMovement(target.position,target.yaw+Math.PI,birth?.currentFeet),motionTime:this.phaseMode==='source-callback'?0:target.motionTime,alive:target.alive,misses:0,aiming:0,...(birth?{birthCoverage:birth.queryCoverage}:{}),
          ...(this.phaseMode==='source-callback'?{weapon:target.weapon??'rifle'}:target.weapon===undefined?{}:{weapon:target.weapon})};
        if(this.phaseMode==='source-callback')receiveOriginalRemoteShots(actor,target.sourceShots);
        this.actors.set(target.id,actor);
        modelEvents?.push(Object.freeze({kind:'birth',id:target.id,callback:this.callbacks,position:Object.freeze({...actor.movement.position}),yaw:actor.movement.yaw,...(actor.weapon===undefined?{}:{weapon:actor.weapon})}));
      }else{
        receiveOriginalRemoteMovement(previous.movement,target.position,target.yaw+Math.PI);
        // A genuine where updates newstuff/weapon, but cannot revive lives0.
        if(this.phaseMode==='transported')previous.motionTime=target.motionTime;
        if(this.phaseMode==='source-callback')receiveOriginalRemoteShots(previous,target.sourceShots);
        if(target.weapon!==undefined)previous.weapon=target.weapon;
      }
    }
  }
}
