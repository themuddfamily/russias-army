import {copyReceiverShotModels,type ReceiverShotModel} from './originalReceiverShotModels';
import type {WeaponId,Vec3} from './protocol';
import type {ReceiverActorRegistrySnapshot} from './originalReceiverActorRegistry';
import type {ReceiverLocalHitscanSceneCapture} from './originalReceiverLocalHitscan';
import {OriginalReceiverModelWorld,type ReceiverModelEntry,type ReceiverModelBackend,type ReceiverModelWorldOptions,type ReceiverSceneWorld,type ReceiverSceneTransaction} from './originalReceiverModelWorld';
import {OriginalReceiverTransientWorld,type OriginalReceiverTransientBackend,type OriginalReceiverTransientOptions,type OriginalReceiverTransientTransaction,type OriginalReceiverTransientBirth,type OriginalReceiverTransientEffect,type OriginalReceiverTransientGoody} from './originalReceiverTransientWorld';
import {sameReceiverScenePrefix,validateReceiverScenePrefix,type ReceiverScenePrefix,type ReceiverExternalSceneSnapshot} from './originalReceiverPrefix';
import type {ReceiverTransientCheckpoint} from './originalReceiverTransientCheckpoint';
import type {ReceiverPickupHistorySource} from './originalReceiverPickupHistory';
import type {ReceiverPickupOutputChunk,ReceiverPickupOutputDescriptor} from './originalReceiverPickupOutput';

export interface ReceiverSceneEnvironmentTransaction {
  /** Trusted private physical/local-event replay at this exact prefix. Returned
   * births preserve source event order; they are not client mesh submissions. */
  advanceCallback(callback:number):readonly OriginalReceiverTransientBirth[];
  applyReceipt(tick:number,callback:number):readonly OriginalReceiverTransientBirth[];
  /** Incremental source commands. The emitter completes each constructor and
   * its private effects before the environment applies the next command.
   * Legacy array providers retain their explicitly grouped scheduling. */
  dispatchAt?(prefix:ReceiverScenePrefix,emitBirth:(event:OriginalReceiverTransientBirth)=>void,captureScene?:()=>ReceiverLocalHitscanSceneCapture):void;
  dispatchAtAsync?(prefix:ReceiverScenePrefix,emitBirth:(event:OriginalReceiverTransientBirth)=>void,captureScene?:()=>ReceiverLocalHitscanSceneCapture):Promise<void>;
  /** Persist the remaining actor/loadout journal after all CURRENT replay. */
  flushPickupOutputTail?(write:(chunk:ReceiverPickupOutputChunk)=>Promise<void>):Promise<void>;
  preparePickupOutputPublication?(descriptor:ReceiverPickupOutputDescriptor):void;
  /** Remaining external inventory, independently covering every source class.
   * The controller adds its own FX; duplicate handles are errors. */
  snapshotAt(prefix:ReceiverScenePrefix,actors?:ReceiverActorRegistrySnapshot,transients?:ReceiverStagedTransientInventoryCapture):ReceiverExternalSceneSnapshot;
  goodyContext():OriginalReceiverTransientGoody|null;
  /** Private staged health/proximity only; no public audio/renderer/network IO. */
  stageEffects(effects:readonly OriginalReceiverTransientEffect[],prefix:ReceiverScenePrefix):void;
  /** Must seal mutation and return an assignment-only, nonthrowing publisher.
   * Rollback must also release a prepared but unpublished stage. */
  prepareCommit():()=>void;
  /** Release without throwing, including after prepare succeeds. */
  rollback():void;
}

/** Actual owned stage pool, including offworld entries. Templates and missing
 * resource evidence remain independent factory inputs; this is not coverage. */
export interface ReceiverStagedTransientInventoryCapture {
 readonly prefix:ReceiverScenePrefix;
 readonly models:readonly Readonly<ReceiverModelEntry>[];
 readonly expectedHandles:readonly string[];
 readonly planeWidthWorld:number|null;
}

function captureStagedTransients(fx:OriginalReceiverTransientTransaction,prefix:ReceiverScenePrefix):ReceiverStagedTransientInventoryCapture {
 const models=fx.freezeModels(),planeWidthWorld=fx.freezePlaneWidth();
 const capturedPrefix:ReceiverScenePrefix=Object.freeze(prefix.kind==='receipt'
  ?{kind:'receipt',sceneGeneration:prefix.sceneGeneration,callback:prefix.callback,tick:prefix.tick}
  :{kind:'callback',sceneGeneration:prefix.sceneGeneration,callback:prefix.callback});
 return Object.freeze({prefix:capturedPrefix,models,expectedHandles:Object.freeze(models.map(model=>model.handle)),planeWidthWorld});
}
export interface ReceiverSceneEnvironment {begin(allocator?:Pick<ReceiverSceneTransaction,'allocateCloneName'>,models?:Pick<ReceiverSceneTransaction,'readPickup'|'collectPickup'>):ReceiverSceneEnvironmentTransaction}
export interface ReceiverSceneControllerOptions {
  model:ReceiverModelWorldOptions;transient:OriginalReceiverTransientOptions;maxEffects:number;
  shotJournal?:Readonly<{maxEntries:number;maxTextChars:number}>;
  transientState?:boolean;
}
export type ReceiverScenePublication=OriginalReceiverTransientEffect|Readonly<{
  kind:'remote-shot';actorId:string;weapon:WeaponId;callback:number;position:Readonly<Vec3>;
}>;
interface Stage {
  environment:ReceiverSceneEnvironmentTransaction;fx:OriginalReceiverTransientTransaction;
  prefix?:ReceiverScenePrefix;
}
export interface ReceiverPhysicalPuffPreparation {
  readonly checkpoint:ReceiverTransientCheckpoint;
  commit():void;
  rollback():void;
}

/** Joint receiver acceptance, used directly by OriginalRemoteView. Owns GI/gun,
 * source FX, clone sequence and trusted environment stages. Queries rebuild
 * the exact external prefix after implicit FX births; no future-world fallback.
 * The scheduling adapter captures old FX, advances private environment and FX,
 * then lets the mirror advance fades/baddies. Native global actorList timing,
 * plane/orientation inputs and complete physical replay remain separate proof.
 */
export class OriginalReceiverSceneController implements ReceiverSceneWorld {
  private readonly models:OriginalReceiverModelWorld;
  private readonly fx:OriginalReceiverTransientWorld;
  private readonly maxEffects:number;
  private readonly transientState:boolean;
  private readonly shotJournal?:Readonly<{maxEntries:number;maxTextChars:number}>;
  private active?:Stage;
  private physicalActive?:{failed:boolean};
  private publication:readonly ReceiverScenePublication[]=Object.freeze([]);
  private publicationVersion=0;
  constructor(backend:ReceiverModelBackend,fxBackend:OriginalReceiverTransientBackend,private readonly environment:ReceiverSceneEnvironment,options:ReceiverSceneControllerOptions,pickupHistorySource?:ReceiverPickupHistorySource){
    const maxEffects=options.maxEffects,rawJournal=options.shotJournal,transientState=options.transientState;
    if(transientState!==undefined&&typeof transientState!=='boolean')throw Error('Invalid receiver transient state option');this.transientState=transientState===true;
    if(rawJournal!==undefined){if(!rawJournal||typeof rawJournal!=='object')throw Error('Invalid receiver shot journal');const maxEntries=rawJournal.maxEntries,maxTextChars=rawJournal.maxTextChars;if(!Number.isSafeInteger(maxEntries)||maxEntries<1||maxEntries>256||!Number.isSafeInteger(maxTextChars)||maxTextChars<1||maxTextChars>65536)throw Error('Invalid receiver shot journal budgets');this.shotJournal=Object.freeze({maxEntries,maxTextChars});}
    if(!Number.isSafeInteger(maxEffects)||maxEffects<1)throw Error('Invalid joint receiver publication budget');
    this.maxEffects=maxEffects;this.fx=new OriginalReceiverTransientWorld(fxBackend,options.transient);
    this.models=new OriginalReceiverModelWorld(backend,options.model,{
      snapshotAt:(prefix,actors)=>{
        const stage=this.active;
        if(!stage?.prefix||!sameReceiverScenePrefix(stage.prefix,prefix))throw Error('Joint receiver external prefix unavailable');
        const transients=captureStagedTransients(stage.fx,prefix);
        const snapshot=stage.environment.snapshotAt(prefix,actors,transients);
        const limit=this.models.options.maxModels;
        if(!Array.isArray(snapshot.models)||snapshot.models.length>limit)throw Error('Joint receiver external model budget requires resynchronization');
        const fxModels=transients.models;
        if(snapshot.models.length+fxModels.length>limit)throw Error('Joint receiver combined model budget requires resynchronization');
        // Retain independently supplied missing-class evidence unchanged.
        return {prefix:snapshot.prefix,models:[...snapshot.models,...fxModels],missing:snapshot.missing,provenance:snapshot.provenance};
      },
    },pickupHistorySource);
  }
  freezeModels(){return this.models.freezeModels();}
  freezePickups(){return this.models.freezePickups();}
  freezeTransientModels(){return this.fx.freezeModels();}
  freezeShaders(){return this.fx.freezeShaders();}
  freezePublication(){return this.publication;}
  freezePublicationVersion(){return this.publicationVersion;}
  debugState(){return {models:this.models.debugState(),fx:this.fx.debugState(),prefix:this.models.freezePrefix(),publicationVersion:this.publicationVersion};}
  /** Append one explicitly captured physical-stage puff at the committed scene
   * prefix. This does not replay the environment or advance any actor clock.
   * The next ordinary CURRENT snapshot refreshes external query inventory. */
  preparePhysicalPuff(prefix:ReceiverScenePrefix,goody:OriginalReceiverTransientGoody,event:Extract<OriginalReceiverTransientBirth,{kind:'puff'}>):ReceiverPhysicalPuffPreparation {
    if(this.physicalActive){this.physicalActive.failed=true;throw Error('Joint receiver physical puff active');}
    if(this.active)throw Error('Joint receiver transaction active');
    const gate={failed:false};this.physicalActive=gate;
    let owned:ReceiverSceneTransaction|undefined,fx:OriginalReceiverTransientTransaction|undefined,open=true;
    const check=()=>{if(!open||gate.failed||this.physicalActive!==gate)throw Error('Joint receiver physical puff closed or failed');};
    const rollback=()=>{
      if(!open)return;open=false;
      const errors:unknown[]=[];
      try{fx?.rollback();}catch(error){errors.push(error);}
      try{owned?.rollback();}catch(error){errors.push(error);}
      if(this.physicalActive===gate)this.physicalActive=undefined;
      if(errors.length)throw new AggregateError(errors,'Joint receiver physical puff rollback failed');
    };
    try{
      // Detach the fixed schema before allocation, including getter operands.
      const kind=prefix.kind,sceneGeneration=prefix.sceneGeneration,callback=prefix.callback;
      const capturedPrefix:ReceiverScenePrefix=Object.freeze(kind==='receipt'?{kind,sceneGeneration,callback,tick:prefix.tick}:{kind,sceneGeneration,callback});
      validateReceiverScenePrefix(capturedPrefix);
      const current=this.models.freezePrefix(),version=this.publicationVersion,nextVersion=version+1;
      if(!current||!sameReceiverScenePrefix(current,capturedPrefix))throw Error('Joint receiver physical puff committed prefix mismatch');
      if(!Number.isSafeInteger(nextVersion))throw Error('Joint receiver publication sequence requires resynchronization');
      const maxTextChars=Math.min(this.fx.options.maxTextChars??65536,65536);
      const vector=(value:Readonly<Vec3>):Readonly<Vec3>=>{
        const x=value.x,y=value.y,z=value.z;
        if(![x,y,z].every(Number.isFinite))throw Error('Invalid physical puff position');
        return Object.freeze({x,y,z});
      };
      const eventKind=event.kind,id=event.id,angleSourceDegrees=event.angleSourceDegrees,position=vector(event.position);
      const bspWorld=goody.bspWorld,weapon=goody.weapon,modelPosition=vector(goody.modelPosition),eyePosition=vector(goody.eyePosition);
      if(eventKind!=='puff'||typeof id!=='string'||!id||id.trim()!==id||id.length+(weapon?.length??0)>maxTextChars
        ||!Number.isSafeInteger(angleSourceDegrees)||angleSourceDegrees<10||angleSourceDegrees>360||angleSourceDegrees%10!==0
        ||!Number.isFinite(bspWorld)||bspWorld<=0||weapon!==null&&!['rifle','pistol','shotgun','rpg','launcher','sniper'].includes(weapon))throw Error('Invalid physical puff operands');
      const capturedEvent=Object.freeze({kind:'puff' as const,id,angleSourceDegrees,position});
      const capturedGoody=Object.freeze({bspWorld,weapon,modelPosition,eyePosition});check();
      owned=this.models.begin(true);check();fx=this.fx.begin(owned.allocateCloneName);check();
      if(fx.birth(capturedEvent,capturedGoody).length)throw Error('Physical puff unexpectedly produced effects');check();
      const checkpoint=fx.freezeCheckpoint(capturedPrefix,{maxModels:Math.min(this.fx.options.maxModels,256),maxActors:Math.min(this.fx.options.maxActors,256),maxShaders:Math.min(this.fx.options.maxShaders,256),maxTextures:256,maxPoolEntries:256,maxTextChars});check();
      const publishFX=fx.prepareCommit();check();const publishModels=owned.prepareCommit();check();
      return Object.freeze({checkpoint,rollback,commit:()=>{
        try{
          check();const actual=this.models.freezePrefix();
          if(this.publicationVersion!==version||!actual||!sameReceiverScenePrefix(actual,capturedPrefix))throw Error('Joint receiver physical puff stale preparation');
          // Both publishers are sealed assignment-only owner operations.
          publishFX();publishModels();this.publicationVersion=nextVersion;
          open=false;this.physicalActive=undefined;
        }catch(error){try{rollback();}catch(cleanup){throw new AggregateError([error,cleanup],'Joint receiver physical puff commit failed');}throw error;}
      }});
    }catch(error){try{rollback();}catch(cleanup){throw new AggregateError([error,cleanup],'Joint receiver physical puff preparation failed');}throw error;}
  }
  begin():ReceiverSceneTransaction {
    if(this.physicalActive){this.physicalActive.failed=true;throw Error('Joint receiver physical puff active');}
    if(this.active)throw Error('Joint receiver transaction active');
    const owned=this.models.begin();let environment:ReceiverSceneEnvironmentTransaction|undefined,fx:OriginalReceiverTransientTransaction|undefined;
    try{environment=this.environment.begin(owned,owned);fx=this.fx.begin(owned.allocateCloneName);}catch(error){environment?.rollback();owned.rollback();throw error;}
    const stage:Stage={environment,fx};this.active=stage;
    const freezeModelTransitions=owned.freezeModelTransitions;
    const freezePickupOutputDescriptor=owned.freezePickupOutputDescriptor;
    let open=true,failed=false,prepared=false,awaiting=false,tailFlushing=false;
    const queued:ReceiverScenePublication[]=[];let shots:readonly ReceiverShotModel[]=Object.freeze([]);
    const check=()=>{if(!open||failed||prepared)throw Error('Joint receiver transaction closed or failed');if(awaiting){if(tailFlushing)failed=true;throw Error('Joint receiver transaction awaiting dispatch');}};
    const guarded=<T>(operation:()=>T):T=>{check();try{const result=operation();if(failed||!open)throw Error('Joint receiver transaction rejected');return result;}catch(error){failed=true;throw error;}};
    const prefix=()=>{if(!stage.prefix)throw Error('Joint receiver prefix unavailable');return stage.prefix;};
    const append=(events:readonly ReceiverScenePublication[])=>{
      if(queued.length+events.length>this.maxEffects)throw Error('Joint receiver publication budget requires resynchronization');
      for(const event of events)queued.push(Object.freeze({...event,position:Object.freeze({x:event.position.x,y:event.position.y,z:event.position.z})}));
    };
    const effects=(events:readonly OriginalReceiverTransientEffect[])=>{
      append(events);if(events.length)stage.environment.stageEffects(events,prefix());
    };
    const dispatchBirths=(legacy:()=>readonly OriginalReceiverTransientBirth[])=>{
      let count=0,accepting=true,emitting=false;
      const emit=(event:OriginalReceiverTransientBirth)=>{
        if(!accepting)throw Error('Joint receiver birth budget requires resynchronization');
        if(failed||emitting||++count>this.fx.options.maxActors){failed=true;throw Error('Joint receiver birth budget requires resynchronization');}
        emitting=true;
        try{effects(stage.fx.birth(event,stage.environment.goodyContext()));}
        catch(error){failed=true;throw error;}finally{emitting=false;}
      };
      try{
        if(stage.environment.dispatchAt)stage.environment.dispatchAt(prefix(),emit,()=>{
          if(!accepting||failed||!open)throw Error('Joint receiver inline query unavailable');
          const current=prefix(),actors=owned.freezeActorRegistry(),transients=captureStagedTransients(stage.fx,current),snapshot=stage.environment.snapshotAt(current,actors,transients);
          if(!sameReceiverScenePrefix(snapshot.prefix,current)||snapshot.missing.length)throw Error('Incomplete joint receiver inline scene');
          const models=Object.freeze([...actors.models,...snapshot.models,...transients.models]);
          if(models.length>this.models.options.maxModels)throw Error('Joint receiver inline model budget exceeded');
          const handles=new Set<string>();for(const model of models){const handle=model.handle.toLowerCase();if(handles.has(handle))throw Error('Joint receiver inline model collision');handles.add(handle);}
          return Object.freeze({prefix:current,models,actors});
        });
        else{
          const events=legacy();
          if(events.length>this.fx.options.maxActors)throw Error('Joint receiver birth budget requires resynchronization');
          for(const event of events)emit(event);
        }
        if(failed)throw Error('Joint receiver dispatch failed');
      }finally{accepting=false;}
    };
    const dispatchBirthsAsync=async():Promise<void>=>{
      if(!stage.environment.dispatchAtAsync){dispatchBirths(()=>stage.environment.advanceCallback(prefix().callback));return;}
      let count=0,accepting=true,emitting=false;
      const emit=(event:OriginalReceiverTransientBirth)=>{
        if(!accepting||!open||failed||emitting||++count>this.fx.options.maxActors){failed=true;throw Error('Joint receiver async birth unavailable');}
        emitting=true;try{effects(stage.fx.birth(event,stage.environment.goodyContext()));}catch(error){failed=true;throw error;}finally{emitting=false;}
      };
      const capture=()=>{
        if(!accepting||failed||!open)throw Error('Joint receiver async inline query unavailable');
        const current=prefix(),actors=owned.freezeActorRegistry(),transients=captureStagedTransients(stage.fx,current),snapshot=stage.environment.snapshotAt(current,actors,transients);
        if(!sameReceiverScenePrefix(snapshot.prefix,current)||snapshot.missing.length)throw Error('Incomplete joint receiver inline scene');
        const models=Object.freeze([...actors.models,...snapshot.models,...transients.models]);
        if(models.length>this.models.options.maxModels)throw Error('Joint receiver inline model budget exceeded');
        const handles=new Set<string>();for(const model of models){const handle=model.handle.toLowerCase();if(handles.has(handle))throw Error('Joint receiver inline model collision');handles.add(handle);}
        return Object.freeze({prefix:current,models,actors});
      };
      try{await stage.environment.dispatchAtAsync(prefix(),emit,capture);if(failed||!open)throw Error('Joint receiver async dispatch failed');}
      finally{accepting=false;}
    };
    const prepareCommit=()=>{
      check();
      const nextVersion=this.publicationVersion+1;
      if(!Number.isSafeInteger(nextVersion))throw Error('Joint receiver publication sequence requires resynchronization');
      const publication=Object.freeze([...queued]);
      // No state is published until EVERY prepare succeeds. Environment is a
      // trusted private stage: its publisher must not call user code or throw.
      const publishEnvironment=stage.environment.prepareCommit();
      const publishFX=stage.fx.prepareCommit();
      const publishModels=owned.prepareCommit();prepared=true;
      return ()=>{
        if(!open||!prepared||failed)throw Error('Joint receiver publication closed');
        publishEnvironment();publishFX();publishModels();
        this.publication=publication;this.publicationVersion=nextVersion;open=false;this.active=undefined;
      };
    };
    return {
      allocateCloneName:(name,increment)=>guarded(()=>owned.allocateCloneName(name,increment)),
      freezeModels:()=>{check();return owned.freezeModels();},
      freezePrefix:()=>{check();return owned.freezePrefix();},
      freezeActorRegistry:()=>{check();return owned.freezeActorRegistry();},
      readPickup:id=>guarded(()=>owned.readPickup(id)),
      ...(freezeModelTransitions?{freezeModelTransitions:()=>guarded(()=>freezeModelTransitions.call(owned))}:{}),
      ...(freezePickupOutputDescriptor?{freezePickupOutputDescriptor:()=>guarded(()=>freezePickupOutputDescriptor.call(owned))}:{}),
      ...(stage.environment.preparePickupOutputPublication?{preparePickupOutputPublication:(descriptor:ReceiverPickupOutputDescriptor)=>guarded(()=>{
        if(owned.freezePickupOutputDescriptor?.()!==descriptor)throw Error('Joint receiver streamed pickup descriptor mismatch');
        stage.environment.preparePickupOutputPublication!(descriptor);
      })}:{}),
      ...(stage.environment.flushPickupOutputTail?{flushPickupOutputTail:async(write:(chunk:ReceiverPickupOutputChunk)=>Promise<void>)=>{
        check();awaiting=true;tailFlushing=true;
        try{
          await stage.environment.flushPickupOutputTail!(write);
          if(!open||failed)throw Error('Joint receiver pickup tail cancelled or rejected');
        }catch(error){failed=true;throw error;}
        finally{tailFlushing=false;awaiting=false;if(!open&&this.active===stage)this.active=undefined;}
      }}:{}),
      ...(this.shotJournal?{freezeShotModels:()=>guarded(()=>copyReceiverShotModels(shots,{sceneGeneration:this.models.options.sceneGeneration,minCallback:0,maxCallback:stage.prefix?.callback??0,...this.shotJournal!}))}:{}),
      ...(this.transientState?{freezeTransientState:()=>guarded(()=>{const current=stage.prefix??owned.freezePrefix();if(!current){if(stage.fx.freezeModels().length)throw Error('Transient checkpoint prefix unavailable');return undefined;}return stage.fx.freezeCheckpoint(current,{maxModels:256,maxActors:256,maxShaders:256,maxTextures:256,maxPoolEntries:256,maxTextChars:65536});})}:{}),
      getActorModels:id=>{check();return owned.getActorModels(id);},
      refreshExternalModels:()=>guarded(()=>owned.refreshExternalModels()),
      advanceExternalCallback:callback=>guarded(()=>{
        // Newborn FX are immediately admitted to queries, but first advance on
        // the next callback in this explicit grouped scheduling adapter.
        const oldActors=stage.fx.freezeActorIds();
        stage.prefix=Object.freeze({kind:'callback',callback,sceneGeneration:this.models.options.sceneGeneration});
        owned.admitExternalPrefix!(stage.prefix);
        dispatchBirths(()=>stage.environment.advanceCallback(callback));
        for(const id of oldActors)effects(stage.fx.stepActor(id,stage.environment.goodyContext()));
        owned.advanceExternalCallback(callback);
      }),
      advanceExternalCallbackAsync:async callback=>{
        check();awaiting=true;
        try{
          const oldActors=stage.fx.freezeActorIds();
          stage.prefix=Object.freeze({kind:'callback',callback,sceneGeneration:this.models.options.sceneGeneration});
          owned.admitExternalPrefix!(stage.prefix);await dispatchBirthsAsync();
          if(!open||failed)throw Error('Joint receiver async callback cancelled');
          for(const id of oldActors)effects(stage.fx.stepActor(id,stage.environment.goodyContext()));
          owned.advanceExternalCallback(callback);
        }catch(error){failed=true;throw error;}
        finally{awaiting=false;if(!open&&this.active===stage)this.active=undefined;}
      },
      applyExternalReceipt:(tick,callback)=>guarded(()=>{
        stage.prefix=Object.freeze({kind:'receipt',tick,callback,sceneGeneration:this.models.options.sceneGeneration});
        owned.admitExternalPrefix!(stage.prefix);
        dispatchBirths(()=>stage.environment.applyReceipt(tick,callback));owned.applyExternalReceipt(tick,callback);
      }),
      actorCallbackEnabled:(_id,callback)=>guarded(()=>{if(prefix().callback!==callback)throw Error('Joint receiver actor callback mismatch');return stage.environment.goodyContext()!==null;}),
      shot:(id,pose,callback)=>guarded(()=>{
        if(prefix().callback!==callback)throw Error('Joint receiver shot callback mismatch');
        const weapon=pose.weapon??'rifle';if(failed||!open)throw Error('Joint receiver shot rejected');
        if(!['pistol','shotgun','rifle','sniper'].includes(weapon))return;
        const gun=owned.getActorModels(id).gun;
        if(this.shotJournal){if(shots.length>=this.shotJournal.maxEntries)throw Error('Receiver shot entry budget exceeded');shots=copyReceiverShotModels([...shots,{actorId:id,weapon,callback,prefix:prefix(),gunHandle:gun.handle,gun}],{sceneGeneration:this.models.options.sceneGeneration,minCallback:0,maxCallback:callback,...this.shotJournal});}
        if(failed||!open)throw Error('Joint receiver shot rejected');
        const rotation=gun.pose.rotation??{x:0,y:Math.sin(gun.pose.yaw/2),z:0,w:Math.cos(gun.pose.yaw/2)};
        effects(stage.fx.birth({kind:'muzzle',id:`remote-muzzle:${callback}:${id}`,weapon,gunPose:{...gun.pose,rotation}},stage.environment.goodyContext()));
        append([{kind:'remote-shot',actorId:id,weapon,callback,position:{x:pose.position.x,y:pose.position.y+this.models.options.eyeHeight,z:pose.position.z}}]);
        owned.refreshExternalModels();
      }),
      birth:request=>guarded(()=>owned.birth(request)),
      beforeCallback:(id,pose)=>guarded(()=>owned.beforeCallback(id,pose)),
      afterCallback:(id,pose)=>guarded(()=>owned.afterCallback(id,pose)),
      detach:(id,pose,callback)=>guarded(()=>owned.detach(id,pose,callback)),
      advanceCorpses:()=>guarded(()=>owned.advanceCorpses()),
      collectPickup:id=>guarded(()=>owned.collectPickup(id)),
      prepareCommit:()=>guarded(prepareCommit),
      preparedActorRegistry:()=>{if(!open||!prepared||failed)throw Error('Joint receiver prepared registry unavailable');return owned.preparedActorRegistry!();},
      commit:()=>{guarded(prepareCommit)();},
      rollback:()=>{if(open){stage.fx.rollback();stage.environment.rollback();owned.rollback();shots=Object.freeze([]);queued.length=0;open=false;if(!awaiting)this.active=undefined;}},
    };
  }
}
