import type {ReceiverGunSavedPhase} from './originalReceiverGunCallback';
import {validateReceiverScenePrefix,type ReceiverScenePrefix} from './originalReceiverPrefix';
import {ORIGINAL_WEAPON_SLOT_ORDER} from './originalPickupRules';

/** Saved gun gate before selection/pickups, not final-weapon canFire state. */
export interface ReceiverGunPhaseCheckpoint {
 readonly prefix:Extract<ReceiverScenePrefix,{kind:'callback'}>;
 readonly phase:ReceiverGunSavedPhase|null;
}

/** Copy only the bounded phase fields. No intent, geometry or permission replay. */
export function copyReceiverGunPhaseCheckpoint(raw:ReceiverGunPhaseCheckpoint):ReceiverGunPhaseCheckpoint {
 if(!raw)throw Error('Missing receiver gun phase');
 const sourcePrefix=raw.prefix,sourcePhase=raw.phase;
 if(!sourcePrefix)throw Error('Missing receiver gun phase prefix');
 const kind=sourcePrefix.kind,sceneGeneration=sourcePrefix.sceneGeneration,callback=sourcePrefix.callback;
 if(kind!=='callback')throw Error('Gun phase must belong to a callback');
 const prefix=Object.freeze({kind,sceneGeneration,callback});validateReceiverScenePrefix(prefix);
 if(sourcePhase===null)return Object.freeze({prefix,phase:null});
 if(!sourcePhase)throw Error('Missing receiver gun gate');
 const weapon=sourcePhase.weapon,bullets=sourcePhase.bullets,ready=sourcePhase.ready,sourceCounter=sourcePhase.counter;
 if(!sourceCounter)throw Error('Missing receiver gun gate counter');
 const waitgun=sourceCounter.waitgun,poldwaitgun=sourceCounter.poldwaitgun;
 if(!ORIGINAL_WEAPON_SLOT_ORDER.includes(weapon)||!Number.isSafeInteger(bullets)||bullets<0||typeof ready!=='boolean'||![waitgun,poldwaitgun].every(Number.isSafeInteger))throw Error('Invalid receiver gun gate');
 return Object.freeze({prefix,phase:Object.freeze({weapon,bullets,ready,counter:Object.freeze({waitgun,poldwaitgun})})});
}
