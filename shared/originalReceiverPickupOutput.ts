import type {WeaponId} from './protocol';
import type {ReceiverScenePrefix} from './originalReceiverPrefix';
import {validateReceiverScenePrefix} from './originalReceiverPrefix';
import type {ReceiverModelTransition} from './originalReceiverModelWorld';
import {copyReceiverModelTransitions,type ReceiverModelTransitionCopyOptions} from './originalReceiverModelTransitions';
import type {ReceiverCurrentLoadoutPublication} from './originalReceiverCurrentEnvironment';

/** Metadata for an issuer-owned output stream sealed with its pickup root.
 * Structural equality alone does not authorize reading or publication. */
export interface ReceiverPickupOutputDescriptor {
 readonly observer:string;readonly lifeGeneration:number;readonly prefix:ReceiverScenePrefix;
 readonly rootKey:string;readonly rootVersion:number;readonly chunkCount:number;readonly transitionCount:number;readonly loadoutCount:number;
}

/** One detached page of committed pickup-window presentation data. Ownership,
 * inter-page continuity and publication are checked by the issuing store. */
export interface ReceiverPickupOutputChunk {
 readonly prefix:ReceiverScenePrefix;readonly sequence:number;readonly firstOrdinal:number;
 readonly transitions:readonly ReceiverModelTransition[];
 readonly loadoutIntents:readonly ReceiverCurrentLoadoutPublication[];
}
const weapons:readonly WeaponId[]=['pistol','shotgun','rifle','launcher','rpg','sniper'];
const sounds:Readonly<Record<WeaponId,'repistol'|'reak47'|'rerg6'>>={pistol:'repistol',shotgun:'repistol',rifle:'reak47',sniper:'reak47',launcher:'rerg6',rpg:'rerg6'};
function copyPrefix(raw:ReceiverScenePrefix):ReceiverScenePrefix {
 if(!raw)throw Error('Missing pickup output prefix');
 const kind=raw.kind,sceneGeneration=raw.sceneGeneration,callback=raw.callback;
 if(kind!=='callback'&&kind!=='receipt')throw Error('Invalid pickup output prefix kind');
 const prefix:ReceiverScenePrefix=kind==='receipt'?{kind,sceneGeneration,callback,tick:raw.tick}:{kind,sceneGeneration,callback};
 validateReceiverScenePrefix(prefix);return Object.freeze(prefix);
}
export function copyReceiverPickupOutputChunk(raw:ReceiverPickupOutputChunk,options:ReceiverModelTransitionCopyOptions):ReceiverPickupOutputChunk {
 if(!raw||!options)throw Error('Invalid pickup output chunk');
 const sceneGeneration=options.sceneGeneration,minCallback=options.minCallback,maxCallback=options.maxCallback,receiptTick=options.receiptTick,maxEntries=options.maxEntries,maxTextChars=options.maxTextChars;
 const rawPrefix=raw.prefix,sequence=raw.sequence,firstOrdinal=raw.firstOrdinal,rawTransitions=raw.transitions,rawIntents=raw.loadoutIntents;
 if(!Number.isSafeInteger(sequence)||sequence<1||!Number.isSafeInteger(firstOrdinal)||firstOrdinal<1)throw Error('Invalid pickup output chunk counters');
 const prefix=copyPrefix(rawPrefix);
 if(prefix.sceneGeneration!==sceneGeneration||prefix.callback!==maxCallback||prefix.kind==='receipt'&&(prefix.callback!==minCallback||prefix.tick!==receiptTick))throw Error('Foreign pickup output envelope prefix');
 const transitions=copyReceiverModelTransitions(rawTransitions,{sceneGeneration,minCallback,maxCallback,receiptTick,maxEntries,maxTextChars,firstOrdinal});
 if(!Array.isArray(rawIntents))throw Error('Pickup output intent count budget exceeded');
 const intentCount=rawIntents.length;if(!Number.isSafeInteger(intentCount)||intentCount<0||intentCount>256)throw Error('Pickup output intent count budget exceeded');
 const loadoutIntents:ReceiverCurrentLoadoutPublication[]=[];let text=0,previousOutputCallback=minCallback;
 for(let i=0;i<intentCount;i++){
  const value:ReceiverCurrentLoadoutPublication=rawIntents[i];if(!value)throw Error('Missing pickup output intent');
  const rawOutputPrefix=value.prefix,rawIntent=value.intent,outputPrefix=copyPrefix(rawOutputPrefix);
  if(outputPrefix.sceneGeneration!==sceneGeneration||outputPrefix.callback<previousOutputCallback||(outputPrefix.kind==='callback'?outputPrefix.callback!==maxCallback||outputPrefix.callback<=minCallback:outputPrefix.callback!==minCallback||outputPrefix.tick!==receiptTick))throw Error('Foreign or replayed pickup output intent prefix');
  previousOutputCallback=outputPrefix.callback;
  if(!rawIntent)throw Error('Missing pickup output intent payload');
  const kind=rawIntent.kind;let intent:ReceiverCurrentLoadoutPublication['intent'];
  if(kind==='feedback'){
   const message=rawIntent.message;if(typeof message!=='string')throw Error('Invalid pickup feedback');
   text+=kind.length+message.length;intent=Object.freeze({kind,message});
  }else if(kind==='reload-sound'){
   const weapon=rawIntent.weapon,sound=rawIntent.sound,channel=rawIntent.channel;
   if(!weapons.includes(weapon)||sounds[weapon]!==sound||channel!==6)throw Error('Invalid pickup reload sound');
   text+=kind.length+weapon.length+sound.length;intent=Object.freeze({kind,weapon,sound,channel});
  }else throw Error('Invalid pickup output intent kind');
  if(!Number.isSafeInteger(text)||text>maxTextChars)throw Error('Pickup output text budget exceeded');
  loadoutIntents.push(Object.freeze({prefix:outputPrefix,intent}));
 }
 const result:ReceiverPickupOutputChunk=Object.freeze({prefix,sequence,firstOrdinal,transitions,loadoutIntents:Object.freeze(loadoutIntents)});
 // Includes JSON escaping, numeric fields and known-field structure; neither
 // source extras nor source toJSON hooks can influence this owned copy.
 if(JSON.stringify(result).length>Math.min(maxTextChars,65536))throw Error('Pickup output serialized budget exceeded');
 return result;
}
