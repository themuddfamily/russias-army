import {advanceOriginalReceiverGunCallback,type ReceiverGunCallbackInput,type ReceiverGunCallbackResult,type ReceiverGunSemanticIntent} from './originalReceiverGunCallback';
import {captureOriginalReceiverGunOutputs,receiverGunOutputTextChars} from './originalReceiverGunOutput';
import type {ReceiverLoadoutCheckpoint} from './originalReceiverLoadoutWorld';
import type {ReceiverCurrentEnvironmentCommand} from './originalReceiverCurrentEnvironment';
import {copyReceiverLocalHitscanAction,type ReceiverLocalHitscanAction} from './originalReceiverLocalHitscan';
import type {ReceiverProjectileWorldBirth} from './originalReceiverProjectileWorld';
import type {OriginalSoloReservedLaunchAdmission} from './originalSoloLaunchBatch';
import {sameReceiverScenePrefix} from './originalReceiverPrefix';
import {ORIGINAL_WEAPON_SLOT_ORDER} from './originalPickupRules';

type Fire=Extract<ReceiverGunSemanticIntent,{kind:'fire'}>;
export interface OriginalSoloGunFireCapture {readonly intentIndex:number;readonly fire:Fire;readonly checkpoint:ReceiverLoadoutCheckpoint;readonly precedingCommands:readonly ReceiverCurrentEnvironmentCommand[]}
export interface OriginalSoloGunHitscanCapture extends OriginalSoloGunFireCapture {readonly rayIndex:number;readonly coordinates:readonly [number,number]}
export interface OriginalSoloGunCallbackProgramOptions {
 readonly shiftHeld:boolean;readonly random3:readonly number[];readonly sendReport:boolean;
 readonly sourceScopeEnabled?:boolean;
 readonly maxCommands:number;readonly maxModels:number;readonly maxTextChars:number;
 readonly captureHitscan?:(request:OriginalSoloGunHitscanCapture)=>ReceiverLocalHitscanAction;
 readonly captureLaunch?:(request:OriginalSoloGunFireCapture)=>Readonly<{admission:OriginalSoloReservedLaunchAdmission;birth?:ReceiverProjectileWorldBirth}>;
}
export interface OriginalSoloGunCallbackProgram {
 readonly callbackCommands:readonly ReceiverCurrentEnvironmentCommand[];
 readonly gunPhase:ReceiverGunCallbackResult;
 /** Issuer identities are retained; their physical prototypes are never cloned. */
 readonly launchAdmissions:readonly OriginalSoloReservedLaunchAdmission[];
}
function checkpointCopy(raw:ReceiverLoadoutCheckpoint):ReceiverLoadoutCheckpoint {
 if(!raw)throw Error('Missing Solo gun loadout checkpoint');
 const p=raw.prefix,c=raw.counter,rawAmmo=raw.ammo,rawReserve=raw.reserve,rawOwned=raw.owned;
 if(!p||!c||!rawAmmo||!rawReserve||!rawOwned)throw Error('Invalid Solo gun loadout checkpoint shape');
 const kind=p.kind,sceneGeneration=p.sceneGeneration,callback=p.callback;
 const prefix=Object.freeze(kind==='receipt'?{kind,sceneGeneration,callback,tick:p.tick}:{kind,sceneGeneration,callback});
 const ammo={} as Record<typeof ORIGINAL_WEAPON_SLOT_ORDER[number],number>,reserve={...ammo},owned={} as Record<typeof ORIGINAL_WEAPON_SLOT_ORDER[number],boolean>;
 for(const weapon of ORIGINAL_WEAPON_SLOT_ORDER){ammo[weapon]=rawAmmo[weapon];reserve[weapon]=rawReserve[weapon];owned[weapon]=rawOwned[weapon];}
 return Object.freeze({prefix,map:raw.map,selected:raw.selected,refillTarget:raw.refillTarget,score:raw.score,goldScore:raw.goldScore,counter:Object.freeze({waitgun:c.waitgun,poldwaitgun:c.poldwaitgun}),ammo:Object.freeze(ammo),reserve:Object.freeze(reserve),owned:Object.freeze(owned)});
}
/** Translate one recovered gun/choosegun callback without performing queries,
 * transport, RNG, audio or bank mutation. Resource/reservation hooks capture
 * their explicit inputs at the fire intent. In particular, RPG temporary refill
 * and the saved old weapon remain observable before the later ammo overwrite.
 */
export function captureOriginalSoloGunCallbackProgram(previous:ReceiverLoadoutCheckpoint,input:ReceiverGunCallbackInput,options:OriginalSoloGunCallbackProgramOptions):OriginalSoloGunCallbackProgram {
 if(!previous||!input||!options)throw Error('Missing Solo gun callback program input');
 const maxCommands=options.maxCommands,maxModels=options.maxModels,maxTextChars=options.maxTextChars,sendReport=options.sendReport,shiftHeld=options.shiftHeld,captureHitscan=options.captureHitscan,captureLaunch=options.captureLaunch;
 const rawScopeEnabled=options.sourceScopeEnabled,sourceScopeEnabled=rawScopeEnabled===undefined&&!('sourceScopeEnabled' in options)?true:rawScopeEnabled;
 if(!Number.isSafeInteger(maxCommands)||maxCommands<1||maxCommands>256||!Number.isSafeInteger(maxModels)||maxModels<1||maxModels>10000||!Number.isSafeInteger(maxTextChars)||maxTextChars<1||maxTextChars>65536||typeof sendReport!=='boolean'||typeof shiftHeld!=='boolean'||typeof sourceScopeEnabled!=='boolean'||captureHitscan!==undefined&&typeof captureHitscan!=='function'||captureLaunch!==undefined&&typeof captureLaunch!=='function')throw Error('Invalid Solo gun callback program options');
 const before=checkpointCopy(previous),h=input.held,p=input.prefix,rawPresence=input.weaponModelPresent;
 const rawDigits=h?.digits;
 if(!h||!p||!Array.isArray(rawDigits)||rawDigits.length!==6||!rawPresence)throw Error('Invalid Solo gun captured input');
 const typing=h.typing,reload=h.reload,fire=h.fire,kind=p.kind,sceneGeneration=p.sceneGeneration,callback=p.callback;
 const digits=Object.freeze([rawDigits[0],rawDigits[1],rawDigits[2],rawDigits[3],rawDigits[4],rawDigits[5]]) as ReceiverGunCallbackInput['held']['digits'];
 const presence={} as Record<typeof ORIGINAL_WEAPON_SLOT_ORDER[number],boolean>;
 for(const weapon of ORIGINAL_WEAPON_SLOT_ORDER)presence[weapon]=rawPresence[weapon];
 const captured:ReceiverGunCallbackInput={prefix:Object.freeze(kind==='receipt'?{kind,sceneGeneration,callback,tick:p.tick}:{kind,sceneGeneration,callback}),held:Object.freeze({typing,reload,fire,digits}),weaponModelPresent:Object.freeze(presence)};
 const gunPhase=advanceOriginalReceiverGunCallback(before,captured);
 const outputs=captureOriginalReceiverGunOutputs(gunPhase,{typing:captured.held.typing,shiftHeld,random3:options.random3,sourceScopeEnabled});
 // Worst case includes each successful owner birth; no hook is called until all
 // deterministic command growth and missing-hook failures have been checked.
 let commandBound=(sendReport?1:0)+2+outputs.length;
 for(const intent of gunPhase.intents){
  if(intent.kind==='counter'||intent.kind==='reload'||intent.kind==='ammo-overwrite')commandBound++;
  else if(intent.kind==='sortweapons')commandBound+=2;
  else if(intent.kind==='load-pose'||intent.kind==='recoil-pose'||intent.kind==='rocket-remove'||intent.kind==='rocket-parent')commandBound++;
  else if(intent.kind==='fire'){
   if(intent.action==='hitscan'){if(!captureHitscan)throw Error('Missing Solo gun hitscan capture');commandBound+=intent.rayCoordinates.length;}
   else{if(!captureLaunch)throw Error('Missing Solo gun launch capture');commandBound++;}
  }
 }
 if(commandBound>maxCommands)throw Error('Solo gun callback command budget exceeded');
 // Preflight all deterministic schema text before reservation/resource hooks.
 // Fresh action identities and launch IDs are bounded when those hooks return.
 const slotText=ORIGINAL_WEAPON_SLOT_ORDER.reduce((sum,w)=>sum+w.length*3,0);
 let selectedForText=before.selected;
 const checkpointText=()=>before.map.length+(selectedForText?.length??0)+slotText+'callback'.length+'loadout-capture'.length;
 let deterministicText=(sendReport?'weapon-report-send'.length:0)+'weapon-finish'.length;
 for(const row of outputs)deterministicText+='gun-output'.length+receiverGunOutputTextChars(row.output);
 for(const intent of gunPhase.intents){
  if(intent.kind==='counter'||intent.kind==='reload'||intent.kind==='ammo-overwrite')deterministicText+=checkpointText();
  else if(intent.kind==='sortweapons'){selectedForText=intent.weapon;deterministicText+=checkpointText()+'weapon-whichgun'.length+(intent.weapon?.length??0);}
  else if(intent.kind==='load-pose')deterministicText+='weapon-reload'.length;
  else if(intent.kind==='recoil-pose')deterministicText+='weapon-fire'.length;
  else if(intent.kind==='rocket-remove'||intent.kind==='rocket-parent')deterministicText+='weapon-rocket'.length;
  else if(intent.kind==='fire'&&intent.action==='hitscan')deterministicText+=intent.rayCoordinates.length*('local-hitscan'.length+intent.weapon.length+'callback'.length);
 }
 selectedForText=gunPhase.checkpoint.selected;deterministicText+=checkpointText();
 if(deterministicText>maxTextChars)throw Error('Solo gun callback text budget exceeded');

 let state=checkpointCopy({...before,prefix:gunPhase.checkpoint.prefix}),text=0;
 const commands:ReceiverCurrentEnvironmentCommand[]=[],admissions:OriginalSoloReservedLaunchAdmission[]=[];
 const addText=(amount:number)=>{text+=amount;if(!Number.isSafeInteger(text)||text>maxTextChars)throw Error('Solo gun callback text budget exceeded');};
 const push=(command:ReceiverCurrentEnvironmentCommand)=>{if(commands.length>=maxCommands)throw Error('Solo gun callback command budget exceeded');addText(command.kind.length+(command.kind==='weapon-whichgun'?(command.weapon?.length??0):0));commands.push(Object.freeze(command));};
 const capture=(changes:Partial<ReceiverLoadoutCheckpoint>)=>{
  state=checkpointCopy({...state,...changes});
  addText(state.map.length+(state.selected?.length??0)+ORIGINAL_WEAPON_SLOT_ORDER.reduce((sum,w)=>sum+w.length*3,0)+state.prefix.kind.length);
  push({kind:'loadout-capture',checkpoint:state});
 };
 if(sendReport)push({kind:'weapon-report-send'});
 let outputIndex=0;
 for(let intentIndex=0;intentIndex<gunPhase.intents.length;intentIndex++){
  const intent=gunPhase.intents[intentIndex];
  while(outputs[outputIndex]?.intentIndex===intentIndex){const output=outputs[outputIndex++].output;addText(receiverGunOutputTextChars(output));push({kind:'gun-output',output});}
  if(intent.kind==='counter')capture({counter:{waitgun:intent.waitgun,poldwaitgun:intent.poldwaitgun}});
  else if(intent.kind==='reload'){
   if(state.selected!==intent.weapon||state.ammo[intent.weapon]!==intent.ammoBefore||state.reserve[intent.weapon]!==intent.reserveBefore)throw Error('Solo gun reload checkpoint mismatch');
   capture({ammo:{...state.ammo,[intent.weapon]:intent.ammoAfter},reserve:{...state.reserve,[intent.weapon]:intent.reserveAfter}});
  }else if(intent.kind==='sortweapons'){
   capture({selected:intent.weapon,refillTarget:intent.refillTarget});push({kind:'weapon-whichgun',weapon:intent.weapon});
  }else if(intent.kind==='load-pose'){
   if(state.selected!==intent.weapon)throw Error('Solo gun load pose selection mismatch');push({kind:'weapon-reload'});
  }else if(intent.kind==='recoil-pose'){
   if(state.selected!==intent.weapon)throw Error('Solo gun recoil selection mismatch');push({kind:'weapon-fire'});
  }else if(intent.kind==='rocket-remove'||intent.kind==='rocket-parent')push({kind:'weapon-rocket',loadedRocket:intent.kind==='rocket-parent'});
  else if(intent.kind==='ammo-overwrite')capture({ammo:{...state.ammo,[intent.weapon]:intent.ammo}});
  else if(intent.kind==='fire'){
   if(state.selected!==intent.weapon||state.ammo[intent.weapon]!==intent.temporaryAmmo||state.reserve[intent.weapon]!==intent.temporaryReserve)throw Error('Solo gun fire checkpoint mismatch');
   if(intent.action==='hitscan'){
    for(let rayIndex=0;rayIndex<intent.rayCoordinates.length;rayIndex++){
     const request=Object.freeze({intentIndex,rayIndex,coordinates:intent.rayCoordinates[rayIndex],fire:intent,checkpoint:state,precedingCommands:Object.freeze(commands.slice())});
     const action=copyReceiverLocalHitscanAction(captureHitscan!(request),maxModels,maxTextChars);
     if(action.weapon!==intent.weapon||!sameReceiverScenePrefix(action.prefix,state.prefix))throw Error('Foreign Solo gun hitscan capture');
     addText(action.effectId.length+action.muzzleId.length+action.weapon.length+action.prefix.kind.length+Object.keys(action.actorNames).reduce((n,key)=>n+key.length+(typeof action.actorNames[key]==='string'?(action.actorNames[key] as string).length:0),0));
     push({kind:'local-hitscan',action});
    }
   }else{
    const raw=captureLaunch!(Object.freeze({intentIndex,fire:intent,checkpoint:state,precedingCommands:Object.freeze(commands.slice())}));
    if(!raw)throw Error('Missing Solo gun launch admission');
    const admission=raw.admission,b=raw.birth;
    if(!admission||!Object.isFrozen(admission))throw Error('Missing or mutable Solo gun launch admission');
    const admitted=admission.ok;
    if(admitted===true){
     const launch=admission.reservation?.launch;
     if(!launch||launch.weapon!==intent.weapon||!b)throw Error('Invalid Solo gun admitted constructor');
     const launchId=b.launchId,weapon=b.weapon,cloneFresh=b.cloneFresh,resetModel=b.resetModel,onRecycled=b.onRecycled;
     if(launchId!==launch.id||weapon!==intent.weapon||typeof cloneFresh!=='function'||typeof resetModel!=='function'||onRecycled!==undefined&&typeof onRecycled!=='function')throw Error('Foreign Solo gun projectile birth');
     addText(launchId.length+weapon.length);push({kind:'projectile-birth',birth:Object.freeze({launchId,weapon,cloneFresh,resetModel,...(onRecycled!==undefined?{onRecycled}:{})})});
    }else if(admitted!==false||admission.reason!=='projectile-cap'||b!==undefined)throw Error('Invalid Solo gun rejected constructor');
    admissions.push(admission);
   }
  }
 }
 const final=gunPhase.checkpoint;
 if(state.map!==final.map||state.selected!==final.selected||state.refillTarget!==final.refillTarget||state.score!==final.score||state.goldScore!==final.goldScore||state.counter.waitgun!==final.counter.waitgun||state.counter.poldwaitgun!==final.counter.poldwaitgun||ORIGINAL_WEAPON_SLOT_ORDER.some(w=>state.ammo[w]!==final.ammo[w]||state.reserve[w]!==final.reserve[w]||state.owned[w]!==final.owned[w]))throw Error('Solo gun final checkpoint mismatch');
 addText(final.map.length+(final.selected?.length??0)+ORIGINAL_WEAPON_SLOT_ORDER.reduce((sum,w)=>sum+w.length*3,0)+final.prefix.kind.length);
 push({kind:'loadout-capture',checkpoint:final});
 while(outputIndex<outputs.length){const row=outputs[outputIndex++];if(row.intentIndex!==gunPhase.intents.length||row.output.kind!=='scope-frame')throw Error('Invalid Solo gun terminal output');addText(receiverGunOutputTextChars(row.output));push({kind:'gun-output',output:row.output});}
 push({kind:'weapon-finish'});
 return Object.freeze({callbackCommands:Object.freeze(commands),gunPhase,launchAdmissions:Object.freeze(admissions)});
}
