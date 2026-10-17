import {describe,it,expect} from 'vitest';
import {captureOriginalSoloBotShot,sourceRotationForSoloDirection,type OriginalSoloBotShotCaptureInput} from './originalSoloBotShotCapture';
import {isOriginalSoloBotShotCapture as isBrowserCapture} from '../src/originalSoloBotShotCapture';
import {validateOriginalSoloBotProjectileAdmissions,type OriginalSoloBotProjectileAdmissionOptions,type OriginalSoloBotProjectileAdmission} from './originalSoloBotProjectileAdmissions';
import type {OriginalSoloReservedLaunchAdmission} from './originalSoloLaunchBatch';
import type {OriginalSoloReceiverCurrentContext} from './originalSoloObserverWorld';
import type {ReceiverCurrentEnvironmentCommand} from './originalReceiverCurrentEnvironment';
import {createOriginalPlayerBody,originalPlayerEye} from './originalPlayerPhysics';

const body=createOriginalPlayerBody('bot',{x:3,y:4,z:5});
const context={id:'bot',name:'Bot',lifeGeneration:7,time:10,deliveryKind:'where',afterGoody:true,alive:true,mirrorCallback:0,order:{receiptCallbacks:0,callbacks:1},body,reserveLaunch:()=>{throw Error('must not reserve');}} as unknown as OriginalSoloReceiverCurrentContext;
const baseOptions:OriginalSoloBotProjectileAdmissionOptions={context,callback:{kind:'callback',sceneGeneration:7,callback:1},callbackCommands:[],committedSequence:0,maxAdmissions:64,maxTextChars:65536};
const input:OriginalSoloBotShotCaptureInput={ownerId:'bot',ownerLife:7,sequence:1,capturedAt:5,weapon:'launcher',targetId:'target',targetLife:99,sourceShotOrigin:{x:20,y:30,z:40},aimDirection:{x:.6,y:0,z:.8},targetDistance:12,authoredDamage:11.25,chanceRoll:.99};
const shot=(changes:Partial<OriginalSoloBotShotCaptureInput>={})=>captureOriginalSoloBotShot({...input,...changes},{maxTextChars:65536});
function admitted(s=shot(),changes:Record<string,unknown>={}):OriginalSoloBotProjectileAdmission {
 // Batch authority is independently checked by the coordinator. These frozen
 // rows exercise the authored operand validator without reserving constructors.
 const launch=Object.freeze({id:`launch-${s.sequence}`,ownerId:'bot',ownerLife:7,ownerName:'Bot',weapon:s.weapon,eye:Object.freeze(originalPlayerEye(body)),direction:s.aimDirection,...(s.weapon==='rpg'?{sourceRotation:Object.freeze(sourceRotationForSoloDirection(s.aimDirection))}:{}),...changes});
 const admission=Object.freeze({ok:true,reservation:Object.freeze({launch,prototype:Object.freeze({})})}) as unknown as OriginalSoloReservedLaunchAdmission;
 return {shot:s,admission};
}
function birth(row:OriginalSoloBotProjectileAdmission):ReceiverCurrentEnvironmentCommand {
 if(!row.admission.ok)throw Error('fixture cap rejection');
 return {kind:'projectile-birth',birth:{launchId:row.admission.reservation.launch.id,weapon:row.admission.reservation.launch.weapon,cloneFresh:()=>{throw Error('must not clone');},resetModel:()=>{throw Error('must not reset');}}};
}
const validate=(rows:readonly OriginalSoloBotProjectileAdmission[],changes:Partial<OriginalSoloBotProjectileAdmissionOptions>={})=>validateOriginalSoloBotProjectileAdmissions(rows,{...baseOptions,callbackCommands:rows.filter(r=>r.admission.ok).map(birth),...changes});

describe('authored bot projectile admissions',()=>{
 it.each(['launcher','rpg'] as const)('%s uses issued authored aim and current next-goody eye without human ammo or gun phase',weapon=>{
  const row=admitted(shot({weapon})),result=validate([row]);
  expect(isBrowserCapture(row.shot)).toBe(true);
  expect(result.shots[0]).toBe(row.shot);expect(result.admissions[0]).toBe(row.admission);expect(result.lastSequence).toBe(1);
  expect(row.shot.authoredDamage).toBe(11.25);expect(row.shot.chanceRoll).toBe(.99);expect(row.shot.targetLife).toBe(99);
  expect(Object.isFrozen(result)).toBe(true);expect(Object.isFrozen(result.shots)).toBe(true);expect(Object.isFrozen(result.admissions)).toBe(true);
 });
 it('preserves principal RPG pitch and yaw for vertical/backward authored directions',()=>{
  for(const aimDirection of [{x:0,y:1,z:0},{x:0,y:-1,z:0},{x:0,y:0,z:1},{x:0,y:0,z:-1}]){
   const row=admitted(shot({weapon:'rpg',aimDirection}));expect(validate([row]).lastSequence).toBe(1);
  }
  expect(sourceRotationForSoloDirection({x:0,y:1,z:0}).x).toBe(90);
  expect(sourceRotationForSoloDirection({x:0,y:0,z:1}).z).toBe(-180);
 });
 it('keeps cap-rejected issued shots in sequence order and advances the committed watermark',()=>{
  const rejected={shot:shot({sequence:3}),admission:Object.freeze({ok:false as const,reason:'projectile-cap' as const})},accepted=admitted(shot({sequence:5,weapon:'rpg'}));
  const result=validate([rejected,accepted],{committedSequence:2});expect(result.lastSequence).toBe(5);expect(result.shots).toEqual([rejected.shot,accepted.shot]);
  expect(validate([],{committedSequence:8}).lastSequence).toBe(8);
 });
 it('rejects structural copies and foreign, old, future, reordered or nonexplosive issued shots',()=>{
  const row=admitted();expect(()=>validate([{...row,shot:{...row.shot}}])).toThrow('Unissued');
  for(const changes of [{ownerId:'other'},{ownerLife:8},{weapon:'rifle' as const},{capturedAt:11}])expect(()=>validate([admitted(shot(changes))])).toThrow('shot');
  expect(()=>validate([row],{committedSequence:1})).toThrow('shot');
  expect(()=>validate([admitted(shot({sequence:3})),admitted(shot({sequence:2}))])).toThrow('shot');
 });
 it('requires exact active where callback life, prefix and observed order',()=>{
  const row=admitted();
  for(const changes of [{deliveryKind:'death'},{afterGoody:false},{alive:false},{lifeGeneration:8},{mirrorCallback:1},{time:NaN},{order:{receiptCallbacks:1,callbacks:1}},{reserveLaunch:undefined}]){
   expect(()=>validate([row],{context:{...context,...changes} as unknown as OriginalSoloReceiverCurrentContext})).toThrow('context');
  }
  expect(()=>validate([row],{callback:{kind:'receipt',sceneGeneration:7,callback:1,tick:0}})).toThrow('context');
  expect(()=>validate([row],{callback:{kind:'callback',sceneGeneration:7,callback:2}})).toThrow('context');
 });
 it('rejects stale eye, changed direction/family/owner and wrong RPG source rotation',()=>{
  for(const changes of [{eye:input.sourceShotOrigin},{eye:{x:3,y:4,z:NaN}},{direction:{x:1.2,y:0,z:1.6}},{direction:{x:-.6,y:0,z:.8}},{weapon:'rpg'},{ownerId:'other'},{ownerName:'Other'},{ownerLife:8},{sourceRotation:{x:0,y:0,z:0}}])expect(()=>validate([admitted(shot(),changes)])).toThrow();
  const rpg=shot({weapon:'rpg'}),rotation=sourceRotationForSoloDirection(rpg.aimDirection);
  expect(()=>validate([admitted(rpg,{sourceRotation:{...rotation,z:rotation.z+360}})])).toThrow('rotation');
  const zero=shot({aimDirection:{x:0,y:0,z:0},targetDistance:0});expect(()=>validate([admitted(zero)])).toThrow('direction');
 });
 it('rejects mutable admissions/reservations, invalid cap reasons and repeated reservation identity',()=>{
  const row=admitted();expect(()=>validate([{...row,admission:{...row.admission}}])).toThrow('admission');
  expect(()=>validate([{...row,admission:Object.freeze({ok:false,reason:'unknown'}) as unknown as OriginalSoloReservedLaunchAdmission}])).toThrow('rejection');
  expect(()=>validate([row,{shot:shot({sequence:2}),admission:row.admission}])).toThrow('repeated');
  expect(()=>validate([row,admitted(shot({sequence:2}),{id:'launch-1'})])).toThrow('reservation');
 });
 it('requires exactly one matching fresh birth per admitted launch and no other callback commands',()=>{
  const row=admitted(),second=admitted(shot({sequence:2}));
  expect(()=>validate([row],{callbackCommands:[]})).toThrow('Missing');
  expect(()=>validate([row,second],{callbackCommands:[birth(row),birth(row)]})).toThrow('repeated');
  expect(()=>validate([row],{callbackCommands:[birth(second)]})).toThrow('Foreign');
  for(const kind of ['weapon-fire','loadout-capture','local-hitscan','report-hurts','projectile-pose'])expect(()=>validate([row],{callbackCommands:[{kind} as unknown as ReceiverCurrentEnvironmentCommand]})).toThrow('command');
  const command=birth(row);expect(()=>validate([row],{callbackCommands:[{...command,birth:{...(command.kind==='projectile-birth'?command.birth:{}),cloneFresh:undefined}} as unknown as ReceiverCurrentEnvironmentCommand]})).toThrow('birth');
 });
 it('checks bounds/cardinality before walking row or command accessors',()=>{
  let reads=0;const rows=new Array(2);Object.defineProperty(rows,0,{get(){reads++;throw Error('read row');}});
  expect(()=>validateOriginalSoloBotProjectileAdmissions(rows,{...baseOptions,maxAdmissions:1})).toThrow('count');expect(reads).toBe(0);
  const commands=new Array(1);Object.defineProperty(commands,0,{get(){reads++;throw Error('read command');}});
  expect(()=>validateOriginalSoloBotProjectileAdmissions([],{...baseOptions,callbackCommands:commands})).toThrow('count');expect(reads).toBe(0);
  for(const maxAdmissions of [0,65,NaN])expect(()=>validateOriginalSoloBotProjectileAdmissions(rows,{...baseOptions,maxAdmissions})).toThrow('limits');
  for(const maxTextChars of [0,65537,NaN])expect(()=>validateOriginalSoloBotProjectileAdmissions(rows,{...baseOptions,maxTextChars})).toThrow('limits');
  expect(reads).toBe(0);expect(()=>validate([admitted()],{maxTextChars:10})).toThrow('text budget');
 });
 it('does not inspect unknown row fields or invoke reservation/constructor hooks',()=>{
  let reads=0;const row=admitted(),known={get shot(){reads++;return row.shot;},get admission(){reads++;return row.admission;},get unrelated(){throw Error('unknown field');}};
  expect(validateOriginalSoloBotProjectileAdmissions([known],{...baseOptions,callbackCommands:[birth(row)]}).lastSequence).toBe(1);expect(reads).toBe(2);
 });
});
