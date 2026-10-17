import {captureOriginalSoloGunCallbackProgram,type OriginalSoloGunCallbackProgramOptions,type OriginalSoloGunFireCapture,type OriginalSoloGunHitscanCapture} from '../shared/originalSoloGunCallbackProgram';
import type {ReceiverLoadoutCheckpoint} from '../shared/originalReceiverLoadoutWorld';
import type {OriginalReceiverLocalWeaponWorld,ReceiverLocalWeaponWorldCheckpoint} from '../shared/originalReceiverLocalWeaponWorld';
import {sameReceiverScenePrefix,validateReceiverScenePrefix} from '../shared/originalReceiverPrefix';
import type {OriginalSoloHumanCallbackInput} from './originalSoloHumanCallbackInput';

export interface OriginalSoloHumanGunProgramOptions {
 readonly localWeaponWorld:OriginalReceiverLocalWeaponWorld;
 readonly random3:readonly number[];readonly sendReport:boolean;
 readonly maxCommands:number;readonly maxModels:number;readonly maxTextChars:number;
 readonly captureHitscan?:(request:OriginalSoloGunHitscanCapture,preview:ReceiverLocalWeaponWorldCheckpoint)=>ReturnType<NonNullable<OriginalSoloGunCallbackProgramOptions['captureHitscan']>>;
 readonly captureLaunch?:(request:OriginalSoloGunFireCapture,preview:ReceiverLocalWeaponWorldCheckpoint)=>ReturnType<NonNullable<OriginalSoloGunCallbackProgramOptions['captureLaunch']>>;
}
/** Capture the actual intermediate local bank pose at each ordered source fire
 * hook. The preview is rolled back before any external hook and never finishes
 * motion, reserves transport, fires a query or writes renderer state. Source aim
 * and shot origin remain explicit caller inputs, independent of gun pose. */
export function captureOriginalSoloHumanGunProgram(previousLoadout:ReceiverLoadoutCheckpoint,input:OriginalSoloHumanCallbackInput,options:OriginalSoloHumanGunProgramOptions) {
 if(!previousLoadout||!input||!options||!options.localWeaponWorld)throw Error('Missing human gun program input');
 const bank=options.localWeaponWorld,initial=bank.freeze(),prefix=input.prefix;
 validateReceiverScenePrefix(prefix);
 if(prefix.kind!=='callback'||!sameReceiverScenePrefix(previousLoadout.prefix,initial.prefix)||prefix.sceneGeneration!==initial.prefix.sceneGeneration||prefix.callback!==initial.prefix.callback+1||previousLoadout.selected!==initial.selectedWeapon)throw Error('Human gun program previous/current bank mismatch');
 const captureHitscan=options.captureHitscan,captureLaunch=options.captureLaunch;
 if(captureHitscan!==undefined&&typeof captureHitscan!=='function'||captureLaunch!==undefined&&typeof captureLaunch!=='function')throw Error('Invalid human gun capture hook');
 const check=()=>{if(bank.freeze()!==initial)throw Error('Human gun bank changed during capture');};
 const preview=(request:OriginalSoloGunFireCapture):ReceiverLocalWeaponWorldCheckpoint=>{
  check();const tx=bank.begin();
  try{
   tx.beginCallback(prefix,input.cameraWorldMatrix);
   for(const command of request.precedingCommands){
    switch(command.kind){
     case 'weapon-whichgun':tx.whichGun(command.weapon);break;
     case 'weapon-reload':tx.reload();break;
     case 'weapon-fire':tx.fire();break;
     case 'weapon-rocket':tx.refreshRocket(command.loadedRocket);break;
     default:break;
    }
   }
   return tx.freeze();
  }finally{tx.rollback();}
 };
 const program=captureOriginalSoloGunCallbackProgram(previousLoadout,{prefix,held:input.held,weaponModelPresent:input.weaponModelPresent},{
  random3:options.random3,shiftHeld:input.shiftHeld,sourceScopeEnabled:input.sourceScopeEnabled,sendReport:options.sendReport,maxCommands:options.maxCommands,maxModels:options.maxModels,maxTextChars:options.maxTextChars,
  ...(captureHitscan?{captureHitscan:(request:OriginalSoloGunHitscanCapture)=>{const staged=preview(request);check();const action=captureHitscan(request,staged);check();return action;}}:{}),
  ...(captureLaunch?{captureLaunch:(request:OriginalSoloGunFireCapture)=>{const staged=preview(request);check();const admission=captureLaunch(request,staged);check();return admission;}}:{}),
 });
 check();return program;
}
