import type {WeaponId} from './protocol';
import type {ReceiverGunCallbackResult} from './originalReceiverGunCallback';

export type ReceiverGunOutput=
 |Readonly<{kind:'sound';weapon:WeaponId;sound:'repistol'|'reak47'|'rerg6'|'gunfire'|'spas12wav'|'resniper';channel:6}>
 |Readonly<{kind:'scope-poll';weapon:'sniper';typing:boolean;shiftHeld:boolean;sourceScopeEnabled?:boolean}>
 |Readonly<{kind:'scope-frame';weapon:WeaponId|null;typing:boolean;shiftHeld:boolean;sourceScopeEnabled?:boolean}>
 |Readonly<{kind:'look-kick';axis:'pitch'|'yaw';degrees:1|2|6|-.5|0|.5}>;
export interface ReceiverGunOutputCapture {readonly intentIndex:number;readonly output:ReceiverGunOutput}
const weapons:readonly WeaponId[]=['pistol','shotgun','rifle','launcher','rpg','sniper'];
const soundPairs:Readonly<Record<WeaponId,readonly string[]>>={
 pistol:['repistol','gunfire'],shotgun:['repistol','spas12wav'],rifle:['reak47','gunfire'],
 launcher:['rerg6'],rpg:['rerg6'],sniper:['reak47','resniper'],
};
const otherKinds:readonly string[]=['rocket-remove','rocket-parent','counter','sortweapons','load-pose','reload','recoil-pose','fire','ammo-overwrite'];
const isWeapon=(value:unknown):value is WeaponId=>weapons.includes(value as WeaponId);
function captureScopePolicy(input:{readonly sourceScopeEnabled?:boolean}):boolean {
 const raw=input.sourceScopeEnabled,value=raw===undefined&&!('sourceScopeEnabled' in input)?true:raw;
 if(typeof value!=='boolean')throw Error('Invalid source scope-enabled policy');
 return value;
}
/** Counts only copied schema text; no caller-owned property enumeration. */
export function receiverGunOutputTextChars(output:ReceiverGunOutput):number {
 return output.kind.length+(output.kind==='look-kick'?output.axis.length:
  (output.weapon?.length??0)+(output.kind==='sound'?output.sound.length:0));
}
/** Detached known-field presentation schema. This carries no fire permission,
 * health, counter, geometry or transport action. Degrees remain source degrees. */
export function copyReceiverGunOutput(raw:ReceiverGunOutput,maxTextChars=65536):ReceiverGunOutput {
 if(!Number.isSafeInteger(maxTextChars)||maxTextChars<1||maxTextChars>65536||!raw)throw Error('Invalid gun output text budget/input');
 const kind=raw.kind;
 let output:ReceiverGunOutput;
 if(kind==='sound'){
  const weapon=raw.weapon,sound=raw.sound,channel=raw.channel;
  if(!isWeapon(weapon)||!soundPairs[weapon].includes(sound)||channel!==6)throw Error('Invalid source gun sound');
  output=Object.freeze({kind,weapon,sound,channel});
 }else if(kind==='scope-poll'||kind==='scope-frame'){
  const weapon=raw.weapon,typing=raw.typing,shiftHeld=raw.shiftHeld;
  const sourceScopeEnabled=captureScopePolicy(raw);
  if(typeof typing!=='boolean'||typeof shiftHeld!=='boolean'
   ||(kind==='scope-poll'?weapon!=='sniper':weapon!==null&&!isWeapon(weapon)))throw Error('Invalid source gun scope output');
  output=kind==='scope-poll'?Object.freeze({kind,weapon:'sniper',typing,shiftHeld,sourceScopeEnabled}):Object.freeze({kind,weapon,typing,shiftHeld,sourceScopeEnabled});
 }else if(kind==='look-kick'){
  const axis=raw.axis,degrees=raw.degrees;
  if(axis==='pitch'?![1,2,6].includes(degrees):axis!=='yaw'||![-.5,0,.5].includes(degrees))throw Error('Invalid source gun look kick');
  // Preserve signed zero if provided; no conversion or inferred random sample.
  output=Object.freeze({kind,axis,degrees});
 }else throw Error('Unknown source gun output');
 if(receiverGunOutputTextChars(output)>maxTextChars)throw Error('Source gun output text budget');
 return output;
}

/** Capture actual helper presentation intents in order, then a terminal scope
 * frame for deferred actor stepping. Other semantic intents need a separate
 * production consumer. Shift/chat and integer random(3) samples are explicit
 * already-captured inputs: this function never reads keys or invokes RNG.
 * At most64 intents plus one frame; this is not native actor timing evidence. */
export function captureOriginalReceiverGunOutputs(result:ReceiverGunCallbackResult,
 input:{readonly typing:boolean;readonly shiftHeld:boolean;readonly random3:readonly number[];readonly sourceScopeEnabled?:boolean},
):readonly ReceiverGunOutputCapture[] {
 if(!result||!input)throw Error('Missing source gun output capture');
 const intents=result.intents,typing=input.typing,shiftHeld=input.shiftHeld,random=input.random3;
 const sourceScopeEnabled=captureScopePolicy(input);
 if(!Array.isArray(intents)||!Array.isArray(random)||typeof typing!=='boolean'||typeof shiftHeld!=='boolean')throw Error('Invalid source gun output capture');
 const count=intents.length,randomCount=random.length;
 if(!Number.isSafeInteger(count)||count<0||count>64||!Number.isSafeInteger(randomCount)||randomCount<0||randomCount>64)throw Error('Source gun output count budget');
 const rows:ReceiverGunOutputCapture[]=[];
 let yawCount=0,text=0;
 const add=(intentIndex:number,raw:ReceiverGunOutput)=>{
  const output=copyReceiverGunOutput(raw);text+=receiverGunOutputTextChars(output);
  if(text>65536)throw Error('Source gun output aggregate text budget');
  rows.push(Object.freeze({intentIndex,output}));
 };
 // Capture indexed samples once, before any intent accessor can alter them.
 const samples:number[]=[];
 for(let index=0;index<randomCount;index++){
  const sample=random[index];if(!Number.isInteger(sample)||sample<1||sample>3)throw Error('Invalid source random(3) sample');samples.push(sample);
 }
 for(let index=0;index<count;index++){
  const intent=intents[index];if(!intent)throw Error('Missing source gun intent');
  const kind=intent.kind;
  if(kind==='reload-sound'||kind==='fire-sound'){
   const weapon=intent.weapon,sound=intent.sound,channel=intent.channel;
   if(kind==='reload-sound'?!['repistol','reak47','rerg6'].includes(sound):!['gunfire','spas12wav','resniper'].includes(sound))throw Error('Invalid source gun sound intent');
   add(index,{kind:'sound',weapon,sound,channel});
  }else if(kind==='scope-poll'){
   if(intent.weapon!=='sniper')throw Error('Invalid source scope poll intent');
   add(index,{kind,weapon:'sniper',typing,shiftHeld,sourceScopeEnabled});
  }else if(kind==='pitch-kick')add(index,{kind:'look-kick',axis:'pitch',degrees:intent.degrees});
  else if(kind==='yaw-kick-request'){
   const rule=intent.sourceRandom;if(!rule)throw Error('Missing source yaw rule');
   const minimum=rule.minimum,maximum=rule.maximum,subtract=rule.subtract,multiplier=rule.multiplier;
   if(minimum!==1||maximum!==3||subtract!==2||multiplier!==.5||yawCount>=randomCount)throw Error('Invalid source yaw rule/sample count');
   const degrees=(samples[yawCount++]-2)*.5 as -.5|0|.5;
   add(index,{kind:'look-kick',axis:'yaw',degrees});
  }else if(!otherKinds.includes(kind))throw Error('Unknown source gun intent');
 }
 if(yawCount!==randomCount)throw Error('Source random(3) sample count mismatch');
 const selected=result.checkpoint?.selected;
 if(selected!==null&&!isWeapon(selected))throw Error('Invalid final source scope weapon');
 add(count,{kind:'scope-frame',weapon:selected,typing,shiftHeld,sourceScopeEnabled});
 return Object.freeze(rows);
}
