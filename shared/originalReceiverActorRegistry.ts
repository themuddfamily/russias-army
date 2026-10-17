import type {WeaponId} from './protocol';
import type {ReceiverModelEntry,ReceiverModelPose} from './originalReceiverModelWorld';
import type {OriginalRemotePosition} from './originalRemoteMovement';
import {validateReceiverScenePrefix,type ReceiverScenePrefix} from './originalReceiverPrefix';
import {copyReceiverPickupHistory,type ReceiverPickupHistory} from './originalReceiverPickupHistory';

export interface ReceiverActorRegistryGun {readonly handle:string;readonly gi:string;readonly weapon:WeaponId}
export interface ReceiverActorRegistryBinding {
 readonly actorId:string;readonly gi:string;readonly gun:string;readonly bsp:number;readonly weapon:WeaponId;readonly oldWeapon?:WeaponId;
 /** Recovered baddy.pos in world units, captured independently of the displayed
  * GI offsets. This is the operation-time spatial hurt/sound operand. */
 readonly sourcePositionWorld:Readonly<OriginalRemotePosition>;
}
export interface ReceiverActorRegistryFade {readonly id:number;readonly handle:string;readonly bon:number;readonly bsp:number;readonly target:Readonly<OriginalRemotePosition>}
export interface ReceiverActorRegistryPickup {readonly id:number;readonly handle:string;readonly weapon:WeaponId;readonly position:Readonly<OriginalRemotePosition>}
export interface ReceiverActorRegistryPickupAlias {readonly handle:string;readonly count:number}
export interface ReceiverActorRegistryInput {
 readonly sceneGeneration:number;readonly callback:number;readonly prefix?:ReceiverScenePrefix;
 /** Independent model-creation catalogs, including retained offworld guns. */
 readonly giHandles:readonly string[];readonly gunCatalog:readonly ReceiverActorRegistryGun[];
 readonly models:readonly Readonly<ReceiverModelEntry>[];readonly actors:readonly ReceiverActorRegistryBinding[];
 readonly fades:readonly ReceiverActorRegistryFade[];readonly fifo:readonly string[];
 readonly pickups:readonly ReceiverActorRegistryPickup[];readonly constructingGI?:string;
 /** Paged mode: pickups is empty, not a complete empty logical history. */
 readonly pickupHistory?:ReceiverPickupHistory;
 /** Committed paged pickup actor membership per mutable gun alias. Omitted
  * during speculative query snapshots whose root is still the old history. */
 readonly pickupAliases?:readonly ReceiverActorRegistryPickupAlias[];
}
export interface ReceiverActorRegistrySnapshot extends ReceiverActorRegistryInput {readonly expectedHandles:readonly string[]}
export interface ReceiverActorRegistryLimits {readonly maxModels:number;readonly maxPickups:number;readonly maxTextChars:number}
const snapshots=new WeakSet<object>();
const textSizes=new WeakMap<object,number>();
const resources:Record<WeaponId,string>={pistol:'pistol',shotgun:'spas12',rifle:'ak47',launcher:'rg6',rpg:'rpg',sniper:'dragunov'};
const weapon=(value:WeaponId)=>typeof value==='string'&&Object.prototype.hasOwnProperty.call(resources,value);
const point=(p:Readonly<OriginalRemotePosition>)=>Object.freeze({x:p.x,y:p.y,z:p.z});
const finitePoint=(p:Readonly<OriginalRemotePosition>|undefined)=>!!p&&[p.x,p.y,p.z].every(Number.isFinite);
function limitsValid(l:ReceiverActorRegistryLimits):void {if(!l||![l.maxModels,l.maxPickups,l.maxTextChars].every(v=>Number.isSafeInteger(v)&&v>0))throw Error('Invalid actor registry budgets');}

/** Detaches one exact query-local ledger audit. Catalogs prove creation
 * ownership, not geometry coverage, native membership or external completeness.
 * Gun references can legally alias old pickups and currently held bindings. */
export function createOriginalReceiverActorRegistrySnapshot(input:ReceiverActorRegistryInput,limits:ReceiverActorRegistryLimits):ReceiverActorRegistrySnapshot {
 limitsValid(limits);
 if(!input||![input.sceneGeneration,input.callback].every(v=>Number.isSafeInteger(v)&&v>=0))throw Error('Invalid actor registry clock');
 for(const values of [input.giHandles,input.gunCatalog,input.models,input.actors,input.fades,input.fifo])if(!Array.isArray(values)||values.length>limits.maxModels)throw Error('Actor registry model budget exceeded');
 if(!Array.isArray(input.pickups)||input.pickups.length>limits.maxPickups||input.giHandles.length+input.gunCatalog.length>limits.maxModels)throw Error('Actor registry catalog or pickup budget exceeded');
 const pickupHistory=input.pickupHistory===undefined?undefined:copyReceiverPickupHistory(input.pickupHistory);
 if(pickupHistory&&input.pickups.length)throw Error('Actor registry mixes paged and inline pickups');
 if(input.prefix){validateReceiverScenePrefix(input.prefix);if(input.prefix.sceneGeneration!==input.sceneGeneration||input.prefix.callback!==input.callback)throw Error('Actor registry prefix mismatch');}
 let text=0;
 const addText=(value:string)=>{if(typeof value!=='string'||!value)throw Error('Invalid actor registry text');text+=value.length;if(text>limits.maxTextChars)throw Error('Actor registry text budget exceeded');};
 if(pickupHistory){addText(pickupHistory.observer);addText(pickupHistory.root.key);}
 const gis=new Set<string>(),guns=new Map<string,ReceiverActorRegistryGun>(),models=new Map<string,Readonly<ReceiverModelEntry>>();
 for(const handle of input.giHandles){addText(handle);if(gis.has(handle))throw Error('Duplicate actor registry GI catalog');gis.add(handle);}
 for(const gun of input.gunCatalog){if(!gun||!weapon(gun.weapon))throw Error('Invalid actor registry gun catalog');addText(gun.handle);addText(gun.gi);if(!gis.has(gun.gi)||gis.has(gun.handle)||guns.has(gun.handle))throw Error('Actor registry gun catalog mismatch');guns.set(gun.handle,gun);}
 for(const model of input.models){
  if(!model||!['gi','gun'].includes(model.kind)||typeof model.inWorld!=='boolean')throw Error('Invalid actor registry model');
  for(const value of [model.handle,model.name,model.resource,model.geometryProvenance])addText(value);
  if(models.has(model.handle)||model.kind==='gi'&&(!gis.has(model.handle)||model.resource!=='GI'||model.group!=='soldiers')
   ||model.kind==='gun'&&(!guns.has(model.handle)||model.resource!==resources[guns.get(model.handle)!.weapon]||model.group!=='gsmokes'))throw Error('Actor registry model catalog mismatch');
  const p=model.pose,q=p?.rotation,m=model.worldMatrix;
  if(!p||!finitePoint(p.position)||![p.yaw,p.phase,p.scale].every(Number.isFinite)||p.phase<0||p.scale<=0
   ||q&&(![q.x,q.y,q.z,q.w].every(Number.isFinite)||Math.abs(Math.hypot(q.x,q.y,q.z,q.w)-1)>1e-6)
   ||m&&(!Array.isArray(m)||m.length!==16||!m.every(Number.isFinite)||m[3]!==0||m[7]!==0||m[11]!==0||m[15]!==1))throw Error('Invalid actor registry model pose');
  models.set(model.handle,model);
 }
 if(models.size!==gis.size+guns.size)throw Error('Missing actor registry catalog model');
 const roles=new Set<string>(),actorIds=new Set<string>(),fadeIds=new Set<number>(),pickupIds=new Set<number>();
 const role=(handle:string)=>{addText(handle);if(!gis.has(handle)||roles.has(handle))throw Error('Actor registry GI role mismatch');roles.add(handle);};
 for(const actor of input.actors){if(!actor||!weapon(actor.weapon)||actor.oldWeapon!==undefined&&!weapon(actor.oldWeapon)||!Number.isFinite(actor.bsp)||actor.bsp<=0||!finitePoint(actor.sourcePositionWorld))throw Error('Invalid actor registry binding');addText(actor.actorId);addText(actor.gun);role(actor.gi);if(actorIds.has(actor.actorId)||guns.get(actor.gun)?.gi!==actor.gi||guns.get(actor.gun)?.weapon!==actor.weapon)throw Error('Actor registry binding mismatch');actorIds.add(actor.actorId);}
 for(const fade of input.fades){if(!fade||!Number.isSafeInteger(fade.id)||fade.id<1||fadeIds.has(fade.id)||!Number.isSafeInteger(fade.bon)||fade.bon<0||!Number.isFinite(fade.bsp)||fade.bsp<=0||!finitePoint(fade.target))throw Error('Invalid actor registry fade');role(fade.handle);fadeIds.add(fade.id);}
 for(const handle of input.fifo){role(handle);if(models.get(handle)!.inWorld)throw Error('Actor registry FIFO model is in world');}
 if(input.constructingGI!==undefined)role(input.constructingGI);
 if(roles.size!==gis.size)throw Error('Missing actor registry GI role');
 for(const pickup of input.pickups){if(!pickup||!Number.isSafeInteger(pickup.id)||pickup.id<1||pickupIds.has(pickup.id)||!weapon(pickup.weapon)||!finitePoint(pickup.position))throw Error('Invalid actor registry pickup');addText(pickup.handle);if(guns.get(pickup.handle)?.weapon!==pickup.weapon)throw Error('Actor registry pickup mismatch');pickupIds.add(pickup.id);}
 let pickupAliases:readonly ReceiverActorRegistryPickupAlias[]|undefined;
 const rawPickupAliases=input.pickupAliases;
 if(rawPickupAliases!==undefined){
  if(!pickupHistory||!Array.isArray(rawPickupAliases))throw Error('Actor registry pickup alias budget or mode mismatch');
  const aliasLength=rawPickupAliases.length;
  if(!Number.isSafeInteger(aliasLength)||aliasLength<0||aliasLength>guns.size)throw Error('Actor registry pickup alias budget or mode mismatch');
  let count=0;const handles=new Set<string>(),aliases:ReceiverActorRegistryPickupAlias[]=[];
  for(let index=0;index<aliasLength;index++){
   const raw:ReceiverActorRegistryPickupAlias=rawPickupAliases[index];
   const handle=raw?.handle,quantity=raw?.count;addText(handle);
   if(!guns.has(handle)||handles.has(handle)||!Number.isSafeInteger(quantity)||quantity<1)throw Error('Actor registry pickup alias mismatch');
   count+=quantity;if(!Number.isSafeInteger(count))throw Error('Actor registry pickup alias count overflow');
   handles.add(handle);aliases.push(Object.freeze({handle,count:quantity}));
  }
  if(count!==pickupHistory.root.count)throw Error('Actor registry pickup alias root count mismatch');
  pickupAliases=Object.freeze(aliases);
 }
 // The independently expected catalog is also retained as its own array.
 for(const handle of gis)addText(handle);for(const handle of guns.keys())addText(handle);
 const frozenModels=Object.freeze(input.models.map((model:Readonly<ReceiverModelEntry>)=>{
  const p=model.pose,q=p.rotation;
  const pose:ReceiverModelPose=Object.freeze({position:point(p.position),yaw:p.yaw,phase:p.phase,scale:p.scale,...(q?{rotation:Object.freeze({x:q.x,y:q.y,z:q.z,w:q.w})}:{})});
  return Object.freeze({handle:model.handle,name:model.name,resource:model.resource,kind:model.kind,group:model.group,inWorld:model.inWorld,geometryProvenance:model.geometryProvenance,pose,...(model.worldMatrix?{worldMatrix:Object.freeze([...model.worldMatrix])}:{})});
 }));
 const prefix=input.prefix?Object.freeze(input.prefix.kind==='receipt'?{kind:'receipt' as const,sceneGeneration:input.sceneGeneration,callback:input.callback,tick:input.prefix.tick}:{kind:'callback' as const,sceneGeneration:input.sceneGeneration,callback:input.callback}):undefined;
 const result:ReceiverActorRegistrySnapshot=Object.freeze({sceneGeneration:input.sceneGeneration,callback:input.callback,...(prefix?{prefix}:{}),
  expectedHandles:Object.freeze([...gis,...guns.keys()]),giHandles:Object.freeze([...input.giHandles]),gunCatalog:Object.freeze(input.gunCatalog.map((g:ReceiverActorRegistryGun)=>Object.freeze({handle:g.handle,gi:g.gi,weapon:g.weapon}))),models:frozenModels,
  actors:Object.freeze(input.actors.map((a:ReceiverActorRegistryBinding)=>Object.freeze({actorId:a.actorId,gi:a.gi,gun:a.gun,bsp:a.bsp,weapon:a.weapon,sourcePositionWorld:point(a.sourcePositionWorld),...(a.oldWeapon!==undefined?{oldWeapon:a.oldWeapon}:{})}))),
  fades:Object.freeze(input.fades.map((f:ReceiverActorRegistryFade)=>Object.freeze({id:f.id,handle:f.handle,bon:f.bon,bsp:f.bsp,target:point(f.target)}))),fifo:Object.freeze([...input.fifo]),
  pickups:Object.freeze(input.pickups.map((p:ReceiverActorRegistryPickup)=>Object.freeze({id:p.id,handle:p.handle,weapon:p.weapon,position:point(p.position)}))),...(pickupHistory?{pickupHistory}:{}),...(pickupAliases?{pickupAliases}:{}),...(input.constructingGI!==undefined?{constructingGI:input.constructingGI}:{})});
 snapshots.add(result);textSizes.set(result,text);return result;
}
/** Only standard detached audits are admitted. Their catalog/roles were
 * validated before freezing; immutable scalar copies cannot become stale by
 * caller writes. Prefix equality alone does not prove query-local identity. */
export function validateOriginalReceiverActorRegistrySnapshot(snapshot:ReceiverActorRegistrySnapshot,limits:Partial<ReceiverActorRegistryLimits>={}):void {
 for(const value of [limits.maxModels,limits.maxPickups,limits.maxTextChars])if(value!==undefined&&(!Number.isSafeInteger(value)||value<=0))throw Error('Invalid actor registry budgets');
 if(!snapshot||!snapshots.has(snapshot))throw Error('Invalid detached actor registry snapshot');
 if(limits.maxModels!==undefined&&snapshot.expectedHandles.length>limits.maxModels||limits.maxPickups!==undefined&&snapshot.pickups.length>limits.maxPickups||limits.maxTextChars!==undefined&&(textSizes.get(snapshot)??Infinity)>limits.maxTextChars)throw Error('Actor registry snapshot budget exceeded');
}
