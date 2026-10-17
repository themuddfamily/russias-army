import type {Vec3} from './protocol';
import {createOriginalProjectile,type OriginalProjectileState} from './originalExplosives';
import {cloneOriginalAngularBody} from './originalAngularBody';
import {originalAsciiNamesEqual} from './originalNameComparison';
import {sameReceiverScenePrefix,validateReceiverScenePrefix,type ReceiverScenePrefix} from './originalReceiverPrefix';
import type {OriginalSoloObserver,OriginalSoloLaunch,OriginalSoloLaunchCommand,OriginalSoloEvent,OriginalSoloProjectile} from './originalSoloObserverWorld';

export interface OriginalSoloLaunchBatchOptions {
 readonly worlds:ReadonlyMap<string,OriginalSoloObserver>;readonly launches:Map<string,OriginalSoloLaunch>;
 readonly receipts:Map<string,Map<string,number>>;readonly sequence:number;readonly callback:number;readonly time:number;
 readonly deliverLaunch?:(recipient:OriginalSoloObserver,launch:OriginalSoloLaunch)=>boolean;
}
export interface OriginalSoloLaunchReservation {readonly launch:OriginalSoloLaunch;readonly prototype:Readonly<OriginalProjectileState>}
export type OriginalSoloReservedLaunchAdmission=Readonly<{ok:true;reservation:OriginalSoloLaunchReservation}>|Readonly<{ok:false;reason:'projectile-cap'}>;
export interface OriginalSoloIncomingLaunch {readonly reservation:OriginalSoloLaunchReservation;readonly prototype:Readonly<OriginalProjectileState>}
export interface OriginalSoloLaunchSpawnPublication {readonly world:OriginalSoloObserver;readonly event:Extract<OriginalSoloEvent,{kind:'spawned'}>}
type Command=Omit<OriginalSoloLaunchCommand,'ownerId'>;
interface Request {owner:OriginalSoloObserver;prefix:ReceiverScenePrefix;ordinal:number;command:Command;admission:OriginalSoloReservedLaunchAdmission}
interface WorldCapture {world:OriginalSoloObserver;id:string;name:string;life:number;alive:boolean;projectiles:Map<string,OriginalSoloProjectile>;entries:readonly (readonly [string,OriginalSoloProjectile])[]}
const MAX_REQUESTS=64,MAX_WORLDS=8,MAX_CATALOG=512,MAX_TEXT=65536;
const sizeGetter=Object.getOwnPropertyDescriptor(Map.prototype,'size')!.get!;
const size=(map:ReadonlyMap<unknown,unknown>):number=>sizeGetter.call(map) as number;
const entries=<K,V>(map:ReadonlyMap<K,V>):[K,V][]=>Array.from(Map.prototype.entries.call(map) as IterableIterator<[K,V]>);
const vec=(raw:Readonly<Vec3>):Readonly<Vec3>=>{
 if(!raw)throw Error('Missing launch vector');const x=raw.x,y=raw.y,z=raw.z;
 if(![x,y,z].every(Number.isFinite))throw Error('Invalid launch vector');return Object.freeze({x,y,z});
};
const equalVec=(a:Readonly<Vec3>,b:Readonly<Vec3>)=>Object.is(a.x,b.x)&&Object.is(a.y,b.y)&&Object.is(a.z,b.z);
function command(raw:Command):Command {
 if(!raw)throw Error('Missing launch command');const weapon=raw.weapon,eye=vec(raw.eye),direction=vec(raw.direction),rotation=raw.sourceRotation;
 if(weapon!=='launcher'&&weapon!=='rpg'||Math.hypot(direction.x,direction.y,direction.z)===0)throw Error('Invalid launch weapon/direction');
 return Object.freeze({weapon,eye,direction,...(rotation!==undefined?{sourceRotation:vec(rotation)}:{})});
}
function freezePrototype(state:OriginalProjectileState):Readonly<OriginalProjectileState> {
 // Only constructor-owned bounded state is traversed; there are no caller
 // getters, callback hooks or retained scene resources in this object graph.
 const seen=new Set<object>();
 const freeze=(value:unknown):void=>{if(!value||typeof value!=='object'||seen.has(value))return;seen.add(value);for(const child of Object.values(value))freeze(child);Object.freeze(value);};
 freeze(state);return state;
}
function physicalCopy(p:Readonly<OriginalProjectileState>):OriginalProjectileState {
 return {weapon:p.weapon,shooterId:p.shooterId,position:{...p.position},velocity:{...p.velocity},direction:{...p.direction},remainingCallbacks:p.remainingCallbacks,hit:p.hit,
  ...(p.sourceRotation?{sourceRotation:p.sourceRotation}:{}),...(p.convex?{convex:p.convex}:{}),...(p.angular?{angular:cloneOriginalAngularBody(p.angular)}:{})};
}
function sameEntries<K,V>(map:ReadonlyMap<K,V>,prior:readonly (readonly [K,V])[]):boolean {
 if(size(map)!==prior.length)return false;
 const now=entries(map);return now.length===prior.length&&now.every(([key,value],i)=>key===prior[i][0]&&value===prior[i][1]);
}

/** Staged Solo transport/physics admission, not native MUS scheduling. Cap8,
 * fixed RPG offset, normalized direction and delayed actor capture retain the
 * existing Solo adapters. No live catalog is changed until publication.
 * validate() watches exact worlds and structural Map entries; the coordinator
 * must not mutate existing physical state between capture and joint commit.
 * rollback retains issued admissions and sealed transport decisions for retry.
 */
export class OriginalSoloLaunchBatch {
 private readonly options:OriginalSoloLaunchBatchOptions;
 private readonly worlds:readonly WorldCapture[];
 private readonly launchEntries:readonly (readonly [string,OriginalSoloLaunch])[];
 private readonly receiptEntries:readonly (readonly [string,Map<string,number>])[];
 private readonly receiptRows:readonly {map:Map<string,number>;entries:readonly (readonly [string,number])[]}[];
 private readonly requests:Request[]=[];
 private sequence:number;private sealed=false;private running=false;private failed=false;private committed=false;private version=0;
 private incomingRows=new Map<OriginalSoloObserver,readonly OriginalSoloIncomingLaunch[]>();
 private records:readonly {world:OriginalSoloObserver;projectiles:Map<string,OriginalSoloProjectile>;reservation:OriginalSoloLaunchReservation;record:OriginalSoloProjectile}[]=[];
 private receiptWrites:readonly {launch:OriginalSoloLaunch;map:Map<string,number>}[]=[];
 private publications:readonly OriginalSoloLaunchSpawnPublication[]=Object.freeze([]);
 private claims:readonly OriginalSoloReservedLaunchAdmission[]=Object.freeze([]);
 constructor(raw:OriginalSoloLaunchBatchOptions){
  if(!raw)throw Error('Missing launch batch options');
  const worlds=raw.worlds,launches=raw.launches,receipts=raw.receipts,sequence=raw.sequence,callback=raw.callback,time=raw.time,deliverLaunch=raw.deliverLaunch;
  if(!(worlds instanceof Map)||!(launches instanceof Map)||!(receipts instanceof Map)||!Number.isSafeInteger(sequence)||sequence<0||!Number.isSafeInteger(callback)||callback<0||!Number.isFinite(time)||time<0||deliverLaunch!==undefined&&typeof deliverLaunch!=='function')throw Error('Invalid launch batch options');
  if(size(worlds)>MAX_WORLDS||size(launches)>MAX_CATALOG||size(receipts)>MAX_CATALOG)throw Error('Launch batch catalog budget exceeded');
  const captured=entries(worlds);
  let text=0;
  this.worlds=Object.freeze(captured.map(([id,world])=>{
   const name=world.name,life=world.lifeGeneration,alive=world.alive,projectiles=world.projectiles;
   if(id!==world.id||typeof id!=='string'||!id||typeof name!=='string'||!Number.isSafeInteger(life)||life<1||typeof alive!=='boolean'||!(projectiles instanceof Map))throw Error('Invalid launch batch world');
   if(size(projectiles)>MAX_CATALOG)throw Error('Launch batch projectile budget exceeded');const rows=entries(projectiles);
   text+=id.length+name.length+rows.reduce((sum,[key])=>sum+key.length,0);if(text>MAX_TEXT)throw Error('Launch batch text budget exceeded');
   return Object.freeze({world,id,name,life,alive,projectiles,entries:Object.freeze(rows)});
  }));
  this.launchEntries=Object.freeze(entries(launches));this.receiptEntries=Object.freeze(entries(receipts));
  this.receiptRows=Object.freeze(this.receiptEntries.map(([key,map])=>{if(!(map instanceof Map)||size(map)>MAX_WORLDS)throw Error('Invalid launch receipt map');const rows=entries(map);text+=key.length+rows.reduce((sum,[id])=>sum+id.length,0);if(text>MAX_TEXT)throw Error('Launch batch text budget exceeded');return {map,entries:Object.freeze(rows)};}));
  for(const [key] of this.launchEntries){text+=key.length;if(text>MAX_TEXT)throw Error('Launch batch text budget exceeded');}
  this.options=Object.freeze({worlds,launches,receipts,sequence,callback,time,...(deliverLaunch?{deliverLaunch}:{})});this.sequence=sequence;
 }
 private check():void {if(this.running)this.failed=true;if(this.committed||this.failed||this.running)throw Error('Launch batch closed or reentrant');}
 validate():void {
  this.check();const o=this.options;
  if(!sameEntries(o.worlds,this.worlds.map(c=>[c.id,c.world] as const))||!sameEntries(o.launches,this.launchEntries)||!sameEntries(o.receipts,this.receiptEntries)||this.receiptRows.some(row=>!sameEntries(row.map,row.entries)))throw Error('Changed launch batch catalogs');
  for(const c of this.worlds)if(c.world.id!==c.id||c.world.name!==c.name||c.world.lifeGeneration!==c.life||c.world.alive!==c.alive||c.world.projectiles!==c.projectiles||!sameEntries(c.projectiles,c.entries))throw Error('Changed launch batch world');
 }
 reserve(owner:OriginalSoloObserver,prefix:ReceiverScenePrefix,ordinal:number,raw:Command):OriginalSoloReservedLaunchAdmission {
  this.validate();let capturedPrefix:ReceiverScenePrefix,input:Command;
  this.running=true;
  try{
   if(!prefix)throw Error('Missing launch reservation prefix');
   const kind=prefix.kind,sceneGeneration=prefix.sceneGeneration,callback=prefix.callback;
   capturedPrefix=Object.freeze(kind==='receipt'?{kind,sceneGeneration,callback,tick:prefix.tick}:{kind,sceneGeneration,callback});
   validateReceiverScenePrefix(capturedPrefix);input=command(raw);
  }finally{this.running=false;}
  // Even a getter which catches a nested API rejection cannot clear poison.
  this.validate();
  const c=this.worlds.find(row=>row.world===owner);
  if(!c||!c.alive||capturedPrefix.kind!=='callback'||capturedPrefix.sceneGeneration!==c.life||capturedPrefix.callback!==owner.callback+1||!Number.isSafeInteger(ordinal)||ordinal<0)throw Error('Invalid launch reservation owner/prefix');
  const prior=this.requests.find(row=>row.owner===owner&&row.ordinal===ordinal);
  if(prior){const a=prior.command;if(!sameReceiverScenePrefix(prior.prefix,capturedPrefix)||a.weapon!==input.weapon||!equalVec(a.eye,input.eye)||!equalVec(a.direction,input.direction)||!!a.sourceRotation!==!!input.sourceRotation||a.sourceRotation&&input.sourceRotation&&!equalVec(a.sourceRotation,input.sourceRotation))throw Error('Changed repeated launch reservation');return prior.admission;}
  if(this.sealed||this.requests.length>=MAX_REQUESTS)throw Error('Launch reservation count/seal exceeded');
  let live=this.launchEntries.filter(([,launch])=>launch.ownerId===c.id&&this.worlds.some(w=>w.entries.some(([id])=>id===launch.id))).length;
  live+=this.requests.filter(row=>row.owner.id===c.id&&row.admission.ok).length;
  let admission:OriginalSoloReservedLaunchAdmission;
  if(live>=8)admission=Object.freeze({ok:false,reason:'projectile-cap'});
  else{
   if(!Number.isSafeInteger(this.sequence+1))throw Error('Launch sequence overflow');
   const prototype=freezePrototype(createOriginalProjectile(input.weapon,input.eye,input.direction,c.id,input.sourceRotation));
   const next=this.sequence+1,id=`solo-projectile-${next}`;
   if(this.options.launches.has(id)||this.options.receipts.has(id)||this.worlds.some(w=>w.projectiles.has(id)))throw Error('Launch id collision');
   const sourceRotation=input.sourceRotation??prototype.sourceRotation;
   const launch:OriginalSoloLaunch=Object.freeze({id,sequence:next,ownerId:c.id,ownerLife:c.life,ownerName:c.name,weapon:input.weapon,eye:input.eye,direction:prototype.direction,...(sourceRotation?{sourceRotation}:{}),birthCallback:this.options.callback,time:this.options.time});
   admission=Object.freeze({ok:true,reservation:Object.freeze({launch,prototype})});this.sequence=next;
  }
  this.requests.push({owner,prefix:capturedPrefix,ordinal,command:input,admission});return admission;
 }
 validateClaim(owner:OriginalSoloObserver,prefix:ReceiverScenePrefix,admission:OriginalSoloReservedLaunchAdmission):void {
  this.validate();if(!this.requests.some(row=>row.owner===owner&&row.admission===admission&&sameReceiverScenePrefix(row.prefix,prefix)))throw Error('Foreign launch reservation claim');
 }
 seal(rawClaims:readonly OriginalSoloReservedLaunchAdmission[]):void {
  this.validate();if(!Array.isArray(rawClaims))throw Error('Invalid launch claims');const count=rawClaims.length;
  if(!Number.isSafeInteger(count)||count>MAX_REQUESTS||count!==this.requests.length)throw Error('Unclaimed launch reservations');
  const claims:OriginalSoloReservedLaunchAdmission[]=[],seen=new Set<OriginalSoloReservedLaunchAdmission>();
  this.running=true;
  try{for(let i=0;i<count;i++){const claim:OriginalSoloReservedLaunchAdmission=rawClaims[i];if(seen.has(claim)||!this.requests.some(row=>row.admission===claim))throw Error('Foreign or duplicate launch claim');seen.add(claim);claims.push(claim);}}
  catch(error){this.failed=true;throw error;}finally{this.running=false;}
  this.validate();if(this.sealed){if(claims.some((claim,i)=>claim!==this.claims[i]))throw Error('Changed sealed launch claims');return;}
  const successful=this.requests.filter(request=>request.admission.ok);
  if(this.launchEntries.length+successful.length>MAX_CATALOG||this.receiptEntries.length+successful.length>MAX_CATALOG)throw Error('Final launch batch catalog budget exceeded');
  // Conservatively count every name-eligible recipient before invoking a
  // transport hook or cloning a physical body. A hook may reject delivery,
  // but cannot be used to escape the bounded allocation preflight.
  for(const c of this.worlds)if(c.alive){
   const candidates=successful.filter(request=>request.admission.ok&&(request.owner===c.world||!originalAsciiNamesEqual(c.name,request.admission.reservation.launch.ownerName))).length;
   if(c.entries.length+candidates>MAX_CATALOG)throw Error('Final launch recipient projectile budget exceeded');
  }
  const records:{world:OriginalSoloObserver;projectiles:Map<string,OriginalSoloProjectile>;reservation:OriginalSoloLaunchReservation;record:OriginalSoloProjectile}[]=[],writes:{launch:OriginalSoloLaunch;map:Map<string,number>}[]=[],publications:OriginalSoloLaunchSpawnPublication[]=[];
  const incoming=new Map<OriginalSoloObserver,OriginalSoloIncomingLaunch[]>();for(const c of this.worlds)incoming.set(c.world,[]);
  this.running=true;
  try{
   for(const request of this.requests){if(!request.admission.ok)continue;const reservation=request.admission.reservation,launch=reservation.launch,receipt=new Map<string,number>();writes.push({launch,map:receipt});
    for(const c of this.worlds){if(!c.alive)continue;const own=c.world===request.owner;if(!own&&(originalAsciiNamesEqual(c.name,launch.ownerName)||this.options.deliverLaunch?.(c.world,launch)===false))continue;
     const state=physicalCopy(reservation.prototype),record={launch,state};records.push({world:c.world,projectiles:c.projectiles,reservation,record});receipt.set(c.id,c.life);
     publications.push(Object.freeze({world:c.world,event:Object.freeze({kind:'spawned',recipientId:c.id,lifeGeneration:c.life,time:launch.time,launch,state})}));
     if(!own)incoming.get(c.world)!.push(Object.freeze({reservation,prototype:reservation.prototype}));
    }
   }
  }catch(error){this.failed=true;throw error;}finally{this.running=false;}
  try{this.validate();}catch(error){this.failed=true;throw error;}
  this.records=Object.freeze(records);this.receiptWrites=Object.freeze(writes);this.publications=Object.freeze(publications);
  this.incomingRows=new Map([...incoming].map(([world,rows])=>[world,Object.freeze(rows)]));this.claims=Object.freeze(claims);this.sealed=true;
 }
 incoming(world:OriginalSoloObserver):readonly OriginalSoloIncomingLaunch[] {this.validate();if(!this.sealed||!this.incomingRows.has(world))throw Error('Unsealed or foreign launch incoming read');return this.incomingRows.get(world)!;}
 get nextSequence():number {if(this.running)this.failed=true;if(this.running||this.failed)throw Error('Failed or reentrant launch sequence read');return this.sequence;}
 get spawnEvents():readonly OriginalSoloLaunchSpawnPublication[] {if(!this.committed)this.validate();if(!this.sealed)throw Error('Unsealed launch spawn events');return this.publications;}
 prepareCommit():()=>void {
  this.validate();if(!this.sealed)throw Error('Unsealed launch publication');const version=this.version,records=this.records,writes=this.receiptWrites,o=this.options;
  return()=>{if(this.committed||this.failed||version!==this.version)return;
   for(const {launch,map} of writes){Map.prototype.set.call(o.launches,launch.id,launch);Map.prototype.set.call(o.receipts,launch.id,map);}
   for(const {projectiles,record} of records)Map.prototype.set.call(projectiles,record.launch.id,record);
   this.committed=true;
  };
 }
 rollback():void {if(this.running){this.failed=true;throw Error('Reentrant launch rollback');}if(this.committed)return;this.version++;}
}
