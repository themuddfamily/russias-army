import type {WeaponId} from './protocol';
import type {ReceiverLoadoutCheckpoint} from './originalReceiverLoadoutWorld';
import {validateReceiverScenePrefix,type ReceiverScenePrefix} from './originalReceiverPrefix';
import {OriginalWeaponCounter} from './originalWeaponCounter';
import {LEGACY_RELOAD_TARGETS} from './legacyLoadout';
import {ORIGINAL_WEAPON_SLOT_ORDER,originalReloadTransfer} from './originalPickupRules';

export interface ReceiverGunHeldInput {
 readonly typing:boolean;readonly reload:boolean;readonly fire:boolean;
 /** Physical levels in source slots 1..6; the first held slot wins. */
 readonly digits:readonly [boolean,boolean,boolean,boolean,boolean,boolean];
}
export interface ReceiverGunCallbackInput {
 readonly prefix:ReceiverScenePrefix;
 readonly held:ReceiverGunHeldInput;
 /** Actual model existence, independent of ownership/membership/ammunition. */
 readonly weaponModelPresent:Readonly<Record<WeaponId,boolean>>;
}
export type ReceiverGunSemanticIntent=
 |Readonly<{kind:'rocket-remove'}>
 |Readonly<{kind:'rocket-parent';weapon:'rpg';phase:'gun'|'whichgun'}>
 |Readonly<{kind:'counter';reason:'woodland-decrement'|'readiness'|'reload'|'shot';waitgun:number;poldwaitgun:number}>
 |Readonly<{kind:'sortweapons';weapon:WeaponId|null;modelPresent:boolean;refillTarget:number}>
 |Readonly<{kind:'load-pose';weapon:WeaponId}>
 /** Count-transfer observation only; pose, sound and counter are separate. */
 |Readonly<{kind:'reload';weapon:WeaponId;ammoBefore:number;reserveBefore:number;ammoAfter:number;reserveAfter:number}>
 |Readonly<{kind:'reload-sound';weapon:WeaponId;sound:'repistol'|'reak47'|'rerg6';channel:6}>
 |Readonly<{kind:'fire-sound';weapon:WeaponId;sound:'gunfire'|'spas12wav'|'resniper';channel:6}>
 |Readonly<{kind:'scope-poll';weapon:'sniper'}>
 |Readonly<{kind:'recoil-pose';weapon:WeaponId}>
 |Readonly<{kind:'fire';weapon:WeaponId;action:'hitscan'|'grenade-constructor'|'rocket-constructor';savedAmmo:number;temporaryAmmo:number;temporaryReserve:number;rayCoordinates:readonly (readonly [number,number])[]}>
 |Readonly<{kind:'pitch-kick';degrees:1|2|6}>
 |Readonly<{kind:'yaw-kick-request';sourceRandom:Readonly<{minimum:1;maximum:3;subtract:2;multiplier:.5}>}>
 |Readonly<{kind:'ammo-overwrite';weapon:WeaponId;savedAmmo:number;ammo:number}>;
export interface ReceiverGunSavedPhase {
 readonly weapon:WeaponId;readonly bullets:number;readonly ready:boolean;
 readonly counter:Readonly<{waitgun:number;poldwaitgun:number}>;
}
export interface ReceiverGunCallbackResult {
 readonly checkpoint:ReceiverLoadoutCheckpoint;
 /** Gate belongs to gun's saved weapon, before choosegun. It is not permission
  * to fire the final selected weapon without its next callback. */
 readonly gunPhase:ReceiverGunSavedPhase|null;
 readonly intents:readonly ReceiverGunSemanticIntent[];
}
const INTENT_CAP=64;
const slots=ORIGINAL_WEAPON_SLOT_ORDER;
const isWeapon=(value:unknown):value is WeaponId=>slots.includes(value as WeaponId);
const reloadSounds:Readonly<Record<WeaponId,'repistol'|'reak47'|'rerg6'>>={pistol:'repistol',shotgun:'repistol',rifle:'reak47',launcher:'rerg6',rpg:'rerg6',sniper:'reak47'};
const copyPrefix=(raw:ReceiverScenePrefix):ReceiverScenePrefix=>{
 if(!raw)throw Error('Missing source gun prefix');
 const kind=raw.kind,sceneGeneration=raw.sceneGeneration,callback=raw.callback;
 const copied=kind==='receipt'?{kind,sceneGeneration,callback,tick:raw.tick}:{kind,sceneGeneration,callback};
 validateReceiverScenePrefix(copied);return copied;
};

/** One pure source gun then choosegun callback. No admission, ray result,
 * audio, RNG, scope actor or world mutation is performed. scope-poll requires
 * caller-owned Shift/zoomonce state; yaw-kick-request requires an explicit
 * random(3) result. Pitch intents are source degrees, not a copy aim transform.
 * Missing-property continuation after reload selects VOID is not specified by
 * this checkpoint contract and throws; callers must not publish that stage.
 * Constructor/new effects and sounds remain external ordered consumers.
 */
export function advanceOriginalReceiverGunCallback(
 previous:ReceiverLoadoutCheckpoint,input:ReceiverGunCallbackInput,
):ReceiverGunCallbackResult {
 if(!previous||!input)throw Error('Missing source gun callback input');
 const rawHeld=input.held,rawPresence=input.weaponModelPresent;
 if(!rawHeld||!rawPresence)throw Error('Missing source gun held/model input');
 const before=copyPrefix(previous.prefix),prefix=copyPrefix(input.prefix);
 if(prefix.kind!=='callback'||prefix.sceneGeneration!==before.sceneGeneration||prefix.callback!==before.callback+1)throw Error('Source gun requires exactly next callback prefix');
 const map=previous.map,initialSelected=previous.selected,initialTarget=previous.refillTarget,score=previous.score,goldScore=previous.goldScore,rawCounter=previous.counter;
 if(!rawCounter)throw Error('Missing source gun counter');
 const waitgun=rawCounter.waitgun,poldwaitgun=rawCounter.poldwaitgun;
 const typing=rawHeld.typing,reloadHeld=rawHeld.reload,fireHeld=rawHeld.fire,rawDigits=rawHeld.digits;
 if(!Array.isArray(rawDigits)||rawDigits.length!==6)throw Error('Invalid source gun digit levels');
 const digits=[rawDigits[0],rawDigits[1],rawDigits[2],rawDigits[3],rawDigits[4],rawDigits[5]];
 const held={typing,reload:reloadHeld,fire:fireHeld,digits};
 if(!['barrack','woodlands'].includes(map)||initialSelected!==null&&!isWeapon(initialSelected)
  ||![waitgun,poldwaitgun].every(Number.isSafeInteger)
  ||!Number.isSafeInteger(initialTarget)||initialTarget<1
  ||!Number.isSafeInteger(score)||!Number.isFinite(goldScore)
  ||![typing,reloadHeld,fireHeld].every(v=>typeof v==='boolean')
  ||!digits.every(v=>typeof v==='boolean'))throw Error('Invalid source gun callback scalar input');
 const rawAmmo=previous.ammo,rawReserve=previous.reserve,rawOwned=previous.owned;
 const ammo={} as Record<WeaponId,number>,reserve={} as Record<WeaponId,number>,owned={} as Record<WeaponId,boolean>,present={} as Record<WeaponId,boolean>;
 for(const weapon of slots){
  const chamber=rawAmmo?.[weapon],stock=rawReserve?.[weapon],has=rawOwned?.[weapon],model=rawPresence[weapon];
  if(![chamber,stock].every(n=>Number.isSafeInteger(n)&&n>=0)||typeof has!=='boolean'||!has&&stock!==0||typeof model!=='boolean')throw Error('Invalid source gun slot input');
  ammo[weapon]=chamber;reserve[weapon]=stock;owned[weapon]=has;present[weapon]=model;
 }
 let selected=initialSelected,refillTarget=initialTarget;
 const counter=new OriginalWeaponCounter(map);counter.restore({waitgun,poldwaitgun});
 const intents:ReceiverGunSemanticIntent[]=[];
 const emit=(intent:ReceiverGunSemanticIntent)=>{if(intents.length>=INTENT_CAP)throw Error('Source gun intent cap');intents.push(Object.freeze(intent));};
 const counterIntent=(reason:Extract<ReceiverGunSemanticIntent,{kind:'counter'}>['reason'])=>emit({kind:'counter',reason,...counter.state});
 const sort=()=>{
  if(selected!==null&&present[selected])refillTarget=LEGACY_RELOAD_TARGETS[selected];
  emit({kind:'sortweapons',weapon:selected,modelPresent:selected!==null&&present[selected],refillTarget});
  if(selected==='rpg'&&present.rpg)emit({kind:'rocket-parent',weapon:'rpg',phase:'whichgun'});
 };
 const choose=(weapon:WeaponId)=>{
  if(ammo[weapon]===0&&reserve[weapon]===0)return false;
  selected=weapon;sort();emit({kind:'load-pose',weapon});return true;
 };
 const reload=()=>{
  if(selected===null)throw Error('Unsupported source reload of VOID');
  const weapon=selected,ammoBefore=ammo[weapon],reserveBefore=reserve[weapon];
  const transfer=originalReloadTransfer(ammoBefore,reserveBefore,refillTarget);
  if(!transfer.canReload){
   selected=null;for(const candidate of slots)if(choose(candidate))break;
   return false;
  }
  ammo[weapon]=transfer.ammo;reserve[weapon]=transfer.reserve;
  emit({kind:'reload',weapon,ammoBefore,reserveBefore,ammoAfter:transfer.ammo,reserveAfter:transfer.reserve});
  emit({kind:'load-pose',weapon});emit({kind:'reload-sound',weapon,sound:reloadSounds[weapon],channel:6});counter.reload();counterIntent('reload');sort();return true;
 };
 // Woodland decrements even with VOID or chat; Barrack does not.
 if(map==='woodlands'){counter.step(null,{inputEnabled:false});counterIntent('woodland-decrement');}
 let gunPhase:ReceiverGunSavedPhase|null=null;
 if(selected!==null){
  emit({kind:'rocket-remove'});
  if(selected==='rpg'&&ammo.rpg>0)emit({kind:'rocket-parent',weapon:'rpg',phase:'gun'});
  if(!held.typing){
   if(held.reload)reload();
   if(selected===null)throw Error('Unsupported recovered gun continuation after reload fallback to VOID');
   if(selected==='sniper')emit({kind:'scope-poll',weapon:'sniper'});
   const weapon=selected,bullets=ammo[weapon];
   const ready=map==='woodlands'?counter.state.waitgun<1:counter.step(weapon);
   if(map==='barrack')counterIntent('readiness');
   gunPhase=Object.freeze({weapon,bullets,ready,counter:Object.freeze(counter.state)});
   if(ready){
    if(selected==='rpg'&&bullets===0)reload();
    if(held.fire){
     if(bullets>0){
      if(selected===null)throw Error('Unsupported source fire of VOID');
      const firingWeapon=selected;emit({kind:'recoil-pose',weapon:firingWeapon});
      if(map==='barrack'){counter.shot(firingWeapon);counterIntent('shot');}
      // Woodland explosive constructors precede the waitgun=10 write;
      // hitscan branches assign their shot counter before the ray action.
      if(map==='woodlands'&&firingWeapon!=='rpg'&&firingWeapon!=='launcher'){counter.shot(firingWeapon);counterIntent('shot');}
      if(firingWeapon==='rpg')reload();
      const rayCoordinates=firingWeapon==='shotgun'
       ?Object.freeze([Object.freeze([310,190] as const),Object.freeze([330,210] as const)])
       :['pistol','rifle','sniper'].includes(firingWeapon)?Object.freeze([Object.freeze([320,200] as const)]):Object.freeze([]);
      if(firingWeapon==='pistol'||firingWeapon==='shotgun'||firingWeapon==='sniper')emit({kind:'fire-sound',weapon:firingWeapon,sound:firingWeapon==='shotgun'?'spas12wav':firingWeapon==='sniper'?'resniper':'gunfire',channel:6});
      emit({kind:'fire',weapon:firingWeapon,action:firingWeapon==='launcher'?'grenade-constructor':firingWeapon==='rpg'?'rocket-constructor':'hitscan',savedAmmo:bullets,temporaryAmmo:ammo[firingWeapon],temporaryReserve:reserve[firingWeapon],rayCoordinates});
      if(firingWeapon==='rifle')emit({kind:'fire-sound',weapon:firingWeapon,sound:'gunfire',channel:6});
      if(map==='woodlands'&&(firingWeapon==='rpg'||firingWeapon==='launcher')){counter.shot(firingWeapon);counterIntent('shot');}
      if(firingWeapon==='shotgun')emit({kind:'pitch-kick',degrees:6});
      if(firingWeapon==='sniper')emit({kind:'pitch-kick',degrees:2});
      emit({kind:'pitch-kick',degrees:1});emit({kind:'yaw-kick-request',sourceRandom:Object.freeze({minimum:1,maximum:3,subtract:2,multiplier:.5})});
      ammo[firingWeapon]=bullets-1;emit({kind:'ammo-overwrite',weapon:firingWeapon,savedAmmo:bullets,ammo:ammo[firingWeapon]});
     }else reload();
     sort();
    }
   }
  }
 }
 // choosegun is independent of gun readiness and also runs from initial VOID.
 if(!held.typing){const index=held.digits.findIndex(Boolean);if(index>=0)choose(slots[index]);}
 const nextCounter=counter.state;
 if(![nextCounter.waitgun,nextCounter.poldwaitgun].every(Number.isSafeInteger))throw Error('Source gun counter overflow');
 for(const weapon of slots)if(![ammo[weapon],reserve[weapon]].every(n=>Number.isSafeInteger(n)&&n>=0))throw Error('Source gun ammunition overflow');
 const checkpoint:ReceiverLoadoutCheckpoint=Object.freeze({prefix:Object.freeze(prefix),map,selected,owned:Object.freeze(owned),ammo:Object.freeze(ammo),reserve:Object.freeze(reserve),refillTarget,counter:Object.freeze(nextCounter),score,goldScore});
 return Object.freeze({checkpoint,gunPhase,intents:Object.freeze(intents)});
}
