import type {WeaponId,Vec3} from './protocol';
import {LEGACY_RELOAD_TARGETS} from './legacyLoadout';
import {OriginalWeaponCounter,type OriginalWeaponCounterMap,type OriginalWeaponCounterState} from './originalWeaponCounter';
import {ORIGINAL_DROP_AMMO,ORIGINAL_WEAPON_SLOT_ORDER,originalReloadTransfer} from './originalPickupRules';
import {sameReceiverScenePrefix,validateReceiverScenePrefix,type ReceiverScenePrefix} from './originalReceiverPrefix';
import {assertReceiverPickupOutputDrain,isReceiverPickupOperand,type ReceiverPickupOutputDrain,type ReceiverSceneTransaction} from './originalReceiverModelWorld';

export interface ReceiverLoadoutCheckpoint {
 readonly prefix:ReceiverScenePrefix;readonly map:OriginalWeaponCounterMap;
 readonly selected:WeaponId|null;readonly owned:Readonly<Record<WeaponId,boolean>>;
 readonly ammo:Readonly<Record<WeaponId,number>>;readonly reserve:Readonly<Record<WeaponId,number>>;
 readonly refillTarget:number;readonly counter:OriginalWeaponCounterState;
 readonly score:number;readonly goldScore:number;
}
export interface ReceiverLoadoutOptions {
 readonly maxCommands:number;readonly maxTextChars:number;
 /** Explicit gmem.model presence; whichgun keeps a stale chamber target when
  * the selected model is absent. Never inferred from ammo/property ownership. */
 readonly weaponModelPresent:Readonly<Record<WeaponId,boolean>>;
}
export type ReceiverLoadoutIntent=
 |Readonly<{kind:'whichgun';weapon:WeaponId|null}>
 |Readonly<{kind:'reload-pose';weapon:WeaponId}>
 |Readonly<{kind:'reload-sound';weapon:WeaponId;sound:'repistol'|'reak47'|'rerg6';channel:6}>
 |Readonly<{kind:'feedback';message:string}>;
export type ReceiverLoadoutIntentEmitter=(intent:ReceiverLoadoutIntent,state:ReceiverLoadoutCheckpoint)=>void;
export interface ReceiverLoadoutTransaction {
 applyReceipt(prefix:ReceiverScenePrefix):void;advanceCallback(prefix:ReceiverScenePrefix):void;
 /** Explicit current gun outcome capture, without simulating firing or ageing. */
 capture(checkpoint:ReceiverLoadoutCheckpoint):void;
 getGun(weapon:WeaponId,emit:ReceiverLoadoutIntentEmitter):Readonly<{reloadSucceeded:boolean;selected:WeaponId|null}>;
 reload(emit:ReceiverLoadoutIntentEmitter):boolean;addScore(amount:number):void;
 /** A model-issued flush resets accounting only, after private spool persistence. */
 finishPickupWindowDrain(token:ReceiverPickupOutputDrain):void;
 freeze():ReceiverLoadoutCheckpoint;prepareCommit():()=>void;commit():void;rollback():void;
}
const sourceName:Readonly<Record<WeaponId,string>>={pistol:'pistol',shotgun:'spas12',rifle:'ak47',launcher:'rg6',rpg:'rpg',sniper:'dragunov'};
const reloadSound:Readonly<Record<WeaponId,'repistol'|'reak47'|'rerg6'>>={pistol:'repistol',shotgun:'repistol',rifle:'reak47',launcher:'rerg6',rpg:'rerg6',sniper:'reak47'};
const transactionPoison=new WeakMap<ReceiverLoadoutTransaction,()=>void>();
const transactionDecode=new WeakMap<ReceiverLoadoutTransaction,<T>(operation:()=>T)=>T>();
const validWeapon=(w:unknown):w is WeaponId=>ORIGINAL_WEAPON_SLOT_ORDER.includes(w as WeaponId);
const prefixCopy=(p:ReceiverScenePrefix):ReceiverScenePrefix=>{
 if(!p)throw Error('Invalid loadout prefix');const kind=p.kind,sceneGeneration=p.sceneGeneration,callback=p.callback;
 if(kind!=='receipt'&&kind!=='callback')throw Error('Invalid loadout prefix kind');
 const copied:ReceiverScenePrefix=Object.freeze(kind==='receipt'?{kind,sceneGeneration,callback,tick:p.tick}:{kind,sceneGeneration,callback});validateReceiverScenePrefix(copied);return copied;
};

/** Captured private source loadout, not a gun-input or actor scheduler. Prefix
 * changes never tick cooldowns, motion, health or physics. Ordered intents mark
 * sort/whichgun and load assignment points; a caller owns explicit model binding
 * and deferred presentation. No automatic local-bank callback is invented.
 * Raw foreign writes during prepared publication are forbidden. */
export class OriginalReceiverLoadoutWorld {
 private state:ReceiverLoadoutCheckpoint|undefined;private active=false;private released=false;
 private rollbackActive:(()=>void)|undefined;private lastReceiptTick:number|undefined;
 private readonly options:ReceiverLoadoutOptions;
 constructor(checkpoint:ReceiverLoadoutCheckpoint,options:ReceiverLoadoutOptions){
  if(!options)throw Error('Invalid loadout world options');const maxCommands=options.maxCommands,maxTextChars=options.maxTextChars,weaponModelPresent=options.weaponModelPresent;
  if(![maxCommands,maxTextChars].every(v=>Number.isSafeInteger(v)&&v>0)||!weaponModelPresent)throw Error('Invalid loadout world options');
  const present={} as Record<WeaponId,boolean>;
  for(const weapon of ORIGINAL_WEAPON_SLOT_ORDER){const value=weaponModelPresent[weapon];if(typeof value!=='boolean')throw Error('Invalid loadout model presence');present[weapon]=value;}
  this.options=Object.freeze({maxCommands,maxTextChars,weaponModelPresent:Object.freeze(present)});
  this.state=this.copy(checkpoint);this.lastReceiptTick=this.state.prefix.kind==='receipt'?this.state.prefix.tick:undefined;
 }
 private copy(c:ReceiverLoadoutCheckpoint):ReceiverLoadoutCheckpoint {
  if(!c)throw Error('Invalid loadout checkpoint');const prefix=prefixCopy(c.prefix),map=c.map,selected=c.selected,refillTarget=c.refillTarget,score=c.score,goldScore=c.goldScore,rawCounter=c.counter,rawOwned=c.owned,rawAmmo=c.ammo,rawReserve=c.reserve;
  if(!rawCounter)throw Error('Invalid loadout checkpoint counter');const waitgun=rawCounter.waitgun,poldwaitgun=rawCounter.poldwaitgun;
  if(!['barrack','woodlands'].includes(map)||selected!==null&&!validWeapon(selected)||!rawOwned||!rawAmmo||!rawReserve
   ||!Number.isSafeInteger(refillTarget)||refillTarget<1||!Number.isSafeInteger(score)||!Number.isFinite(goldScore)
   ||![waitgun,poldwaitgun].every(Number.isSafeInteger))throw Error('Invalid loadout checkpoint scalars');
  const owned={} as Record<WeaponId,boolean>,ammo={} as Record<WeaponId,number>,reserve={} as Record<WeaponId,number>;
  for(const weapon of ORIGINAL_WEAPON_SLOT_ORDER){const has=rawOwned[weapon],chamber=rawAmmo[weapon],stock=rawReserve[weapon];
   if(typeof has!=='boolean'||![chamber,stock].every(n=>Number.isSafeInteger(n)&&n>=0)||!has&&stock!==0)throw Error('Invalid loadout counts or absent property');owned[weapon]=has;ammo[weapon]=chamber;reserve[weapon]=stock;
  }
  return Object.freeze({prefix,map,selected,owned:Object.freeze(owned),ammo:Object.freeze(ammo),reserve:Object.freeze(reserve),refillTarget,counter:Object.freeze({waitgun,poldwaitgun}),score,goldScore});
 }
 freeze():ReceiverLoadoutCheckpoint {if(this.released||!this.state)throw Error('Loadout world released');return this.state;}
 /** Explicit captured model presence for adapters; immutable and never inferred
  * from weapon ownership, selection, membership or ammo. */
 freezeWeaponModelPresence():Readonly<Record<WeaponId,boolean>> {this.freeze();return this.options.weaponModelPresent;}
 release():void {if(this.released)return;this.released=true;try{this.rollbackActive?.();}finally{this.rollbackActive=undefined;this.active=false;this.state=undefined;this.lastReceiptTick=undefined;}}
 begin(pickupDrainOwner?:ReceiverSceneTransaction):ReceiverLoadoutTransaction {
  const initial=this.freeze();if(this.active)throw Error('Loadout transaction active');this.active=true;
  let state=initial,tick=this.lastReceiptTick,count=0,text=0,open=true,failed=false,sealed=false,emitting=false,running=false,publisher:(()=>void)|undefined;
  const drainedTokens=new WeakSet<ReceiverPickupOutputDrain>();
  const read=()=>{if(!open||failed||this.released)throw Error('Loadout transaction closed or failed');return state;};
  const check=()=>{if(emitting||running){failed=true;throw Error('Recursive loadout mutation or intent');}read();if(sealed)throw Error('Loadout transaction prepared');};
  const guarded=<T>(operation:()=>T):T=>{check();running=true;try{if(++count>this.options.maxCommands)throw Error('Loadout command budget exceeded');const result=operation();read();return result;}catch(error){failed=true;throw error;}finally{running=false;}};
  const replace=(changes:Partial<ReceiverLoadoutCheckpoint>)=>{state=this.copy({...state,...changes});};
  const emit=(sink:ReceiverLoadoutIntentEmitter,intent:ReceiverLoadoutIntent)=>{
   if(typeof sink!=='function')throw Error('Invalid loadout intent emitter');
   text+=intent.kind.length+(intent.kind==='feedback'?intent.message.length:intent.weapon?.length??0)+(intent.kind==='reload-sound'?intent.sound.length:0);
   if(!Number.isSafeInteger(text)||text>this.options.maxTextChars)throw Error('Loadout intent text budget exceeded');
   emitting=true;try{sink(Object.freeze(intent),state);}finally{emitting=false;}read();
  };
  const whichGun=(sink:ReceiverLoadoutIntentEmitter)=>{
   const selected=state.selected;if(selected!==null&&this.options.weaponModelPresent[selected])replace({refillTarget:LEGACY_RELOAD_TARGETS[selected]});
   emit(sink,{kind:'whichgun',weapon:selected});
  };
  const reload=(sink:ReceiverLoadoutIntentEmitter):boolean=>{
   const selected=state.selected;if(selected===null)throw Error('Source reload requires a selected weapon');
   const transfer=originalReloadTransfer(state.ammo[selected],state.reserve[selected],state.refillTarget);
   if(!transfer.canReload){
    replace({selected:null});
    for(const weapon of ORIGINAL_WEAPON_SLOT_ORDER)if(state.reserve[weapon]>0||state.ammo[weapon]>0){replace({selected:weapon});whichGun(sink);emit(sink,{kind:'reload-pose',weapon});break;}
    // No usable slot: source leaves the old rendered gun and chamber target;
    // it does not call whichgun(VOID), play reload audio or lock the counter.
    return false;
   }
   replace({ammo:{...state.ammo,[selected]:transfer.ammo},reserve:{...state.reserve,[selected]:transfer.reserve}});
   emit(sink,{kind:'reload-pose',weapon:selected});emit(sink,{kind:'reload-sound',weapon:selected,sound:reloadSound[selected],channel:6});
   const counter=new OriginalWeaponCounter(state.map);counter.restore(state.counter);counter.reload();replace({counter:counter.state});whichGun(sink);return true;
  };
  const rollback=()=>{if(emitting||running)failed=true;if(!open)return;open=false;this.active=false;this.rollbackActive=undefined;};
  const prepare=()=>{check();state=this.copy(state);const nextTick=tick;sealed=true;publisher=()=>{if(!open)return;this.state=state;this.lastReceiptTick=nextTick;open=false;this.active=false;this.rollbackActive=undefined;};return publisher;};
  this.rollbackActive=rollback;
  const transaction:ReceiverLoadoutTransaction={
   applyReceipt:raw=>guarded(()=>{const p=prefixCopy(raw);if(p.kind!=='receipt'||p.sceneGeneration!==state.prefix.sceneGeneration||p.callback!==state.prefix.callback||tick!==undefined&&p.tick<=tick)throw Error('Loadout receipt replay or mismatch');replace({prefix:p});tick=p.tick;}),
   advanceCallback:raw=>guarded(()=>{const p=prefixCopy(raw);if(p.kind!=='callback'||p.sceneGeneration!==state.prefix.sceneGeneration||p.callback!==state.prefix.callback+1)throw Error('Loadout callback skip or mismatch');replace({prefix:p});}),
   capture:c=>guarded(()=>{const copied=this.copy(c);if(copied.map!==state.map||!sameReceiverScenePrefix(copied.prefix,state.prefix))throw Error('Loadout capture prefix or map mismatch');state=copied;}),
   reload:sink=>guarded(()=>reload(sink)),
   getGun:(weapon,sink)=>guarded(()=>{
    if(!validWeapon(weapon)||typeof sink!=='function')throw Error('Invalid source ammo pickup');const isNew=!state.owned[weapon],quantity=ORIGINAL_DROP_AMMO[weapon];
    const stock=isNew?quantity:state.reserve[weapon]+quantity;if(!Number.isSafeInteger(stock))throw Error('Loadout ammo overflow');
    replace({owned:{...state.owned,[weapon]:true},reserve:{...state.reserve,[weapon]:stock},selected:isNew||state.selected===null?weapon:state.selected});
    whichGun(sink);const reloadSucceeded=reload(sink);
    emit(sink,{kind:'feedback',message:isNew?`You have the ${sourceName[weapon]}!`:`Ammo for the ${sourceName[weapon]}.`});
    return Object.freeze({reloadSucceeded,selected:state.selected});
   }),
   addScore:amount=>guarded(()=>{if(!Number.isSafeInteger(amount))throw Error('Invalid source score delta');const score=amount===0?0:state.score+amount,goldScore=amount===0?0:state.goldScore+amount/7.2956438;if(!Number.isSafeInteger(score)||!Number.isFinite(goldScore))throw Error('Loadout score overflow');replace({score,goldScore});}),
   finishPickupWindowDrain:token=>{
    check();running=true;
    try{
     if(!pickupDrainOwner)throw Error('Loadout pickup drain owner missing');
     const prefix=state.prefix;assertReceiverPickupOutputDrain(token,pickupDrainOwner,prefix);
     read();if(!sameReceiverScenePrefix(state.prefix,prefix))throw Error('Loadout pickup drain state changed');
     if(drainedTokens.has(token))throw Error('Loadout pickup drain already consumed');
     drainedTokens.add(token);count=0;text=0;
    }catch(error){failed=true;throw error;}finally{running=false;}
   },
   freeze:read,
   prepareCommit:()=>{if(publisher){if(emitting||running){failed=true;throw Error('Recursive loadout prepare');}return publisher;}return prepare();},
   commit:()=>{if(!open)return;(publisher??prepare())();},rollback,
  };
  transactionPoison.set(transaction,()=>{failed=true;});
  transactionDecode.set(transaction,<T>(operation:()=>T):T=>{check();running=true;try{const result=operation();read();return result;}catch(error){failed=true;throw error;}finally{running=false;}});
  return transaction;
 }
}

/** One explicitly admitted source ammo pickup invocation. No actorList order or
 * automatic overlap polling is inferred. The caller must jointly prepare and
 * publish both participants, rollback both on failure, and keep emitters pure.
 * The pickup's fixed position is independent of its held/reused model pose or
 * membership. Health/key/task/clue pickups require separate inventories. */
export function collectOriginalReceiverAmmoPickup(
 models:Pick<ReceiverSceneTransaction,'readPickup'|'collectPickup'>,
 loadout:ReceiverLoadoutTransaction,
 input:Readonly<{pickupId:number;goody:Readonly<{eyePosition:Readonly<Vec3>;bspWorld:number}>|null}>,
 emit:ReceiverLoadoutIntentEmitter,
):boolean {
 const poison=transactionPoison.get(loadout),decode=transactionDecode.get(loadout);if(!poison||!decode)throw Error('Source pickup requires a standard staged loadout');
 try{
 const operand=decode(()=>{
 if(!input)throw Error('Invalid source pickup invocation');const pickupId=input.pickupId,g=input.goody;
 if(!Number.isSafeInteger(pickupId)||pickupId<0)throw Error('Invalid source pickup invocation');
 if(g===null)return undefined;
 const eye=g?.eyePosition,bspWorld=g?.bspWorld,x=eye?.x,y=eye?.y,z=eye?.z;
 if(!g||![x,y,z,bspWorld].every(Number.isFinite)||bspWorld<=0)throw Error('Invalid source pickup goody');
 const state=loadout.freeze(),operand=models.readPickup(pickupId);
 if(!isReceiverPickupOperand(operand))throw Error('Source pickup requires an authenticated staged operand');
 if(!sameReceiverScenePrefix(operand.prefix,state.prefix))throw Error('Source pickup prefix mismatch');
 const pickup=operand.pickup;if(pickup===null)return undefined;
 if(pickup.id!==pickupId)throw Error('Source pickup operand id mismatch');
 const p=pickup.position;if(!(Math.hypot(x-p.x,y-p.y,z-p.z)<bspWorld))return undefined;
 return operand;
 });
 if(!operand)return false;
 const pickup=operand.pickup!;
 loadout.getGun(pickup.weapon,emit);
 if(!models.collectPickup(operand))throw Error('Source pickup disappeared during invocation');
 loadout.addScore(5);return true;
 }catch(error){poison();throw error;}
}
