import type {OriginalSoloProjectile} from '../shared/originalSoloObserverWorld';
import type {OriginalSoloAdmittedBang,OriginalSoloProjectileReceiptCommand} from '../shared/originalSoloCurrentSceneProducer';
import type {ReceiverProjectileWorldCheckpoint} from '../shared/originalReceiverProjectileWorld';
import {captureOriginalSoloProjectilePose} from './originalSoloProjectileBinding';

export interface OriginalSoloProjectileProgramOptions {
 readonly renderToWorld:readonly number[];
 readonly maxActors:number;readonly maxCommands:number;readonly maxTextChars:number;
}
/** Captured receipt adapter: continuing poses in committed actor order, then
 * admitted bangs in their supplied order. This does not simulate callbacks or
 * infer a retirement from a missing body. New constructors belong to the
 * separate reserved-launch/incoming paths, not this continuing-owner capture.
 * Cross-actor native actorList timing remains an explicit qualification. */
export function captureOriginalSoloProjectileReceiptProgram(
 previous:ReceiverProjectileWorldCheckpoint,physical:readonly OriginalSoloProjectile[],
 admittedBangs:readonly OriginalSoloAdmittedBang[],options:OriginalSoloProjectileProgramOptions,
):readonly OriginalSoloProjectileReceiptCommand[] {
 if(!options||![options.maxActors,options.maxCommands,options.maxTextChars].every(Number.isSafeInteger)||options.maxActors<1||options.maxActors>10000||options.maxCommands<1||options.maxCommands>256||options.maxTextChars<1||options.maxTextChars>65536)throw Error('Invalid projectile receipt bounds');
 if(!previous||!Array.isArray(previous.actors)||previous.actors.length>options.maxActors||!Array.isArray(previous.models)||previous.models.length>10000||!Array.isArray(physical)||physical.length>options.maxActors||!Array.isArray(admittedBangs)||admittedBangs.length>options.maxActors)throw Error('Projectile receipt actor budget exceeded');
 // Exact command count is checked before decoding state or pose algebra.
 if(physical.length+admittedBangs.length>options.maxCommands)throw Error('Projectile receipt command budget exceeded');
 let text=0;
 const add=(value:string)=>{if(typeof value!=='string'||!value||value.trim()!==value)throw Error('Invalid projectile receipt identity');text+=value.length;if(text>options.maxTextChars)throw Error('Projectile receipt text budget exceeded');};
 const actors=new Map<string,ReceiverProjectileWorldCheckpoint['actors'][number]>(),handles=new Set<string>();
 for(const actor of previous.actors){if(!actor||actors.has(actor.launchId)||handles.has(actor.handle)||!['launcher','rpg'].includes(actor.weapon))throw Error('Invalid committed projectile actor');add(actor.launchId);add(actor.handle);actors.set(actor.launchId,actor);handles.add(actor.handle);}
 const models=new Map<string,ReceiverProjectileWorldCheckpoint['models'][number]>();
 for(const model of previous.models){if(!model||models.has(model.handle)||!Array.isArray(model.groupAncestry)||model.groupAncestry.length>options.maxTextChars)throw Error('Invalid retained projectile model');add(model.handle);add(model.resource);add(model.materialHandle);for(const group of model.groupAncestry)add(group);models.set(model.handle,model);}
 const bodies=new Map<string,OriginalSoloProjectile>();
 for(const row of physical){if(!row?.launch||!row.state)throw Error('Invalid physical projectile');add(row.launch.id);const actor=actors.get(row.launch.id);if(!actor||bodies.has(row.launch.id)||row.launch.weapon!==actor.weapon||row.state.weapon!==actor.weapon)throw Error('Unowned or repeated physical projectile');bodies.set(row.launch.id,row);}
 const retired=new Map<string,OriginalSoloAdmittedBang>();
 for(const bang of admittedBangs){if(!bang?.blast?.launch||!bang.blast.state)throw Error('Invalid admitted projectile bang');add(bang.blast.launch.id);add(bang.effectId);const id=bang.blast.launch.id;if(retired.has(id)||bodies.has(id)||bang.blast.state.weapon!==bang.blast.launch.weapon)throw Error('Repeated or live projectile retirement');const actor=actors.get(id);if(actor&&actor.weapon!==bang.blast.launch.weapon)throw Error('Projectile retirement family mismatch');retired.set(id,bang);}
 for(const actor of actors.values()){const retained=models.get(actor.handle);if(!retained||!retained.inWorld||retained.resource!==(actor.weapon==='launcher'?'rg6grenade':'rpgrocket'))throw Error('Missing committed projectile model');if(!bodies.has(actor.launchId)&&!retired.has(actor.launchId))throw Error('Missing physical projectile without admitted retirement');}
 const terminalCount=admittedBangs.filter(bang=>actors.has(bang.blast.launch.id)).length;
 if(physical.length+admittedBangs.length+terminalCount>options.maxCommands)throw Error('Projectile receipt command budget exceeded');
 const commands:OriginalSoloProjectileReceiptCommand[]=[];
 for(const actor of actors.values()){
  const row=bodies.get(actor.launchId);if(!row)continue;
  const state=row.state;
  const pose=captureOriginalSoloProjectilePose(models.get(actor.handle)!,{launchId:actor.launchId,weapon:actor.weapon,position:state.position,direction:state.direction,...(state.sourceRotation?{sourceRotation:state.sourceRotation}:{}),...(state.angular?{orientation:state.angular.orientation}:{}),renderToWorld:options.renderToWorld,orientationPolicy:'copy-source-basis-unit-reset'},options.maxTextChars);
  commands.push(Object.freeze({kind:'projectile-pose',launchId:pose.launchId,model:pose.model}));
 }
 for(const bang of admittedBangs){
  const id=bang.blast.launch.id,actor=actors.get(id);
  if(actor){
   const terminal=bang.terminalProjectilePose;
   if(!terminal||terminal.id!==id||terminal.weapon!==actor.weapon||terminal.position.x!==bang.blast.state.position.x||terminal.position.y!==bang.blast.state.position.y||terminal.position.z!==bang.blast.state.position.z)throw Error('Missing or mismatched terminal projectile pose');
   const pose=captureOriginalSoloProjectilePose(models.get(actor.handle)!,{...terminal,launchId:id,renderToWorld:options.renderToWorld,orientationPolicy:'copy-source-basis-unit-reset'},options.maxTextChars);
   commands.push(Object.freeze({kind:'projectile-pose',launchId:id,model:pose.model}));
   commands.push(Object.freeze({kind:'admitted-projectile-retire',launchId:id,blast:bang.blast}));
  }else commands.push(Object.freeze({kind:'admitted-bang',blast:bang.blast}));
 }
 return Object.freeze(commands);
}
