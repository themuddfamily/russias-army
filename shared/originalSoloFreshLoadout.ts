import {getLegacySpawnLoadout,LEGACY_RELOAD_TARGETS} from './legacyLoadout';
import {OriginalReceiverLoadoutWorld,type ReceiverLoadoutOptions} from './originalReceiverLoadoutWorld';
import {validateReceiverScenePrefix} from './originalReceiverPrefix';
import {ORIGINAL_WEAPON_SLOT_ORDER} from './originalPickupRules';
import {OriginalWeaponCounter,type OriginalWeaponCounterMap} from './originalWeaponCounter';
import type {WeaponId} from './protocol';

export interface OriginalSoloFreshLoadoutOptions extends ReceiverLoadoutOptions {
 readonly map:OriginalWeaponCounterMap;readonly sceneGeneration:number;
 /** Explicit session policy. goody.new does not establish the global scores;
  * do not infer goldScore from score or silently reset a continuing session. */
 readonly score:number;readonly goldScore:number;
}

/** Fresh goody.new / weaponry.new only. This is not an arbitrary renderer
 * handoff: that renderer does not expose source ownership or stale chamber
 * targets. The selected RG6 must exist for whichgun's initial target to be
 * established. Local gunpos and native parent membership are separate inputs.
 * All validation precedes allocating the private loadout owner. */
export function createOriginalSoloFreshLoadoutWorld(options:OriginalSoloFreshLoadoutOptions):OriginalReceiverLoadoutWorld {
 if(!options)throw Error('Missing fresh Solo loadout options');
 const {map,sceneGeneration,score,goldScore,maxCommands,maxTextChars,weaponModelPresent}=options;
 if(map!=='barrack'&&map!=='woodlands')throw Error('Invalid fresh Solo loadout map');
 const prefix=Object.freeze({kind:'callback' as const,sceneGeneration,callback:0});
 validateReceiverScenePrefix(prefix);
 if(!Number.isSafeInteger(score)||!Number.isFinite(goldScore)
  ||![maxCommands,maxTextChars].every(n=>Number.isSafeInteger(n)&&n>0)||!weaponModelPresent)throw Error('Invalid fresh Solo loadout options');
 const present={} as Record<WeaponId,boolean>,owned={} as Record<WeaponId,boolean>;
 for(const weapon of ORIGINAL_WEAPON_SLOT_ORDER){
  const exists=weaponModelPresent[weapon];
  if(typeof exists!=='boolean')throw Error('Invalid fresh Solo loadout model presence');
  present[weapon]=exists;owned[weapon]=true;
 }
 if(!present.launcher)throw Error('Fresh Solo whichgun requires the launcher model');
 const spawn=getLegacySpawnLoadout(map)!;
 const counter=new OriginalWeaponCounter(map,spawn.equipped);
 return new OriginalReceiverLoadoutWorld({prefix,map,selected:spawn.equipped,owned,
  ammo:spawn.ammo,reserve:spawn.reserve,refillTarget:LEGACY_RELOAD_TARGETS[spawn.equipped],counter:counter.state,score,goldScore},
 {maxCommands,maxTextChars,weaponModelPresent:present});
}
