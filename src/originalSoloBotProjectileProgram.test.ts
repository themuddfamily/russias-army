import * as THREE from 'three';
import {describe,expect,it,vi} from 'vitest';
import {captureOriginalSoloBotShot,type OriginalSoloBotShotCapture,type OriginalSoloBotShotCaptureInput} from '../shared/originalSoloBotShotCapture';
import {createOriginalProjectile,createOriginalBlast} from '../shared/originalExplosives';
import {createOriginalPlayerBody,originalPlayerEye} from '../shared/originalPlayerPhysics';
import {OriginalReceiverProjectileWorld,type ReceiverProjectileWorldCheckpoint} from '../shared/originalReceiverProjectileWorld';
import type {OriginalSoloReceiverCurrentContext,OriginalSoloProjectile} from '../shared/originalSoloObserverWorld';
import type {OriginalSoloLaunchReservation,OriginalSoloReservedLaunchAdmission} from '../shared/originalSoloLaunchBatch';
import type {OriginalSoloAdmittedBang} from '../shared/originalSoloCurrentSceneProducer';
import {createOriginalSoloProjectileBirth} from './originalSoloProjectileBinding';
import {captureOriginalSoloBotProjectileProgram as capture} from './originalSoloBotProjectileProgram';

const mapping=new THREE.Matrix4().makeTranslation(11,12,13).toArray();
const receipt={kind:'receipt' as const,sceneGeneration:1,callback:0,tick:0},callback={kind:'callback' as const,sceneGeneration:1,callback:1},prefixes={receipt,callback};
function shot(sequence=1,extra:Partial<OriginalSoloBotShotCaptureInput>={}):OriginalSoloBotShotCapture{return captureOriginalSoloBotShot({ownerId:'bot',ownerLife:1,sequence,capturedAt:0,weapon:'launcher',targetId:'player',targetLife:1,sourceShotOrigin:{x:1,y:2,z:3},aimDirection:{x:0,y:0,z:-1},targetDistance:3,authoredDamage:5,chanceRoll:.99,...extra},{maxTextChars:8192});}
function fixture(){
 const seed:ReceiverProjectileWorldCheckpoint={prefix:receipt,template:{handle:'grenade',resource:'rg6grenade',worldMatrix:new THREE.Matrix4().toArray(),inWorld:false,materialHandle:'grenade-shader',groupAncestry:[]},models:[],actors:[],catalog:[],fifo:{launcher:[],rpg:[]}};
 const bank=new OriginalReceiverProjectileWorld(seed,{maxModels:32,maxActors:8,maxCommands:64,maxTextChars:8192,rocketMaterialHandle:'rocket-shader'});
 const body=createOriginalPlayerBody('bot',{x:10,y:20,z:30}),projectiles=new Map<string,OriginalSoloProjectile>();
 const reserve=vi.fn((command:{weapon:'launcher'|'rpg';eye:{x:number;y:number;z:number};direction:{x:number;y:number;z:number};sourceRotation?:{x:number;y:number;z:number}},ordinal:number):OriginalSoloReservedLaunchAdmission=>{
  const launch=Object.freeze({id:`launch-${ordinal}`,sequence:ordinal+1,ownerId:'bot',ownerLife:1,ownerName:'Bot',weapon:command.weapon,eye:command.eye,direction:command.direction,...(command.sourceRotation?{sourceRotation:command.sourceRotation}:{}),birthCallback:1,time:1});
  return Object.freeze({ok:true as const,reservation:Object.freeze({launch,prototype:Object.freeze(createOriginalProjectile(command.weapon,command.eye,command.direction,'bot',command.sourceRotation))})});
 });
 const context={id:'bot',lifeGeneration:1,time:1,deliveryKind:'where',phase:'physics',afterGoody:true,alive:true,order:{receiptCallbacks:0,callbacks:1},receiptTick:0,body,projectiles,reserveLaunch:reserve} as unknown as OriginalSoloReceiverCurrentContext;
 const captureBirth=vi.fn((reservation:OriginalSoloLaunchReservation)=>createOriginalSoloProjectileBirth({launchId:reservation.launch.id,weapon:reservation.launch.weapon,freshModel:reservation.launch.weapon==='launcher'?bank.freeze().template:{...bank.freeze().template,handle:'rocket',resource:'rpgrocket',materialHandle:'rocket-shader'},pose:{launchId:reservation.launch.id,weapon:reservation.launch.weapon,position:reservation.prototype.position,direction:reservation.prototype.direction,...(reservation.prototype.sourceRotation?{sourceRotation:reservation.prototype.sourceRotation}:{}),renderToWorld:mapping,orientationPolicy:'copy-source-basis-unit-reset'},rocketMaterialHandle:'rocket-shader',maxTextChars:8192}));
 const options={renderToWorld:mapping,maxActors:8,maxShots:8,maxCommands:64,maxTextChars:8192,captureBirth};
 return {context,bank,body,projectiles,reserve,captureBirth,options};
}
describe('authored bot projectile callback capture',()=>{
 it('uses post-goody eye, issued aim and stable ordinals without a human gun or chance gate',()=>{
  const f=fixture(),a=shot(3),b=shot(8,{weapon:'rpg',aimDirection:{x:1,y:0,z:0}}),program=capture(f.context,prefixes,f.bank.freeze(),[],[a,b],f.options);
  expect(f.reserve.mock.calls.map(([command,ordinal])=>({eye:command.eye,direction:command.direction,rotation:command.sourceRotation,ordinal}))).toEqual([{eye:originalPlayerEye(f.body),direction:a.aimDirection,rotation:undefined,ordinal:0},{eye:originalPlayerEye(f.body),direction:b.aimDirection,rotation:{x:0,y:0,z:-90},ordinal:1}]);
  expect(program.callbackCommands!.map(command=>command.kind)).toEqual(['projectile-birth','projectile-birth']);expect(program.receiptCommands).toEqual([]);
  expect(program.botLaunchAdmissions.map(row=>row.shot)).toEqual([a,b]);expect(program.botLaunchAdmissions[0].admission).toBe(f.reserve.mock.results[0].value);
  expect(Object.isFrozen(program)).toBe(true);expect(Object.isFrozen(program.callbackCommands)).toBe(true);expect(Object.isFrozen(program.botLaunchAdmissions[0])).toBe(true);
  expect(f.bank.freeze().actors).toEqual([]);expect(a.sourceShotOrigin).toEqual({x:1,y:2,z:3});
 });
 it('captures actual constructor prototype matrices and returns only known birth fields',()=>{
  const f=fixture(),original=f.captureBirth;
  const program=capture(f.context,prefixes,f.bank.freeze(),[],[shot()],{...f.options,captureBirth:reservation=>({...original(reservation),ignored:'not captured'})}),command=program.callbackCommands![0];if(command.kind!=='projectile-birth')throw Error('Missing birth');
  expect(Object.keys(command.birth).sort()).toEqual(['cloneFresh','launchId','resetModel','weapon']);expect(Object.isFrozen(command.birth)).toBe(true);
  const tx=f.bank.begin({allocateCloneName:()=> 'unit-projectile'});tx.advanceCallback(callback);tx.birth(command.birth);const checkpoint=tx.freeze(),prototype=f.reserve.mock.results[0].value;
  if(!prototype.ok)throw Error('Missing prototype');const matrix=checkpoint.models[0].worldMatrix;
  expect(matrix[12]).toBeCloseTo(prototype.reservation.prototype.position.x+11);expect(matrix[13]).toBeCloseTo(prototype.reservation.prototype.position.y+12);expect(matrix[14]).toBeCloseTo(prototype.reservation.prototype.position.z+13);tx.rollback();
 });
 it('retains projectile-cap admissions without a model birth',()=>{
  const f=fixture();f.reserve.mockReturnValue(Object.freeze({ok:false,reason:'projectile-cap'}));const program=capture(f.context,prefixes,f.bank.freeze(),[],[shot()],f.options);
  expect(program.botLaunchAdmissions[0].admission).toEqual({ok:false,reason:'projectile-cap'});expect(program.callbackCommands).toEqual([]);expect(f.captureBirth).not.toHaveBeenCalled();
 });
 it('preflights every shot before reserving even when the first row is valid',()=>{
  for(const invalid of [shot(2,{ownerId:'foreign'}),shot(2,{ownerLife:2}),shot(2,{capturedAt:2}),shot(2,{weapon:'rifle'}),shot(1),shot(2,{weapon:'rpg',aimDirection:{x:0,y:0,z:0},targetDistance:0})]){
   const f=fixture();expect(()=>capture(f.context,prefixes,f.bank.freeze(),[],[shot(),invalid],f.options)).toThrow();expect(f.reserve).not.toHaveBeenCalled();
  }
 });
 it('does not inspect forged capture getters and rejects shot/text/command caps before reservation',()=>{
  const f=fixture(),forged={get ownerId(){throw Error('must not inspect');}} as unknown as OriginalSoloBotShotCapture;
  expect(()=>capture(f.context,prefixes,f.bank.freeze(),[],[forged],f.options)).toThrow(/Unissued/);
  expect(()=>capture(f.context,prefixes,f.bank.freeze(),[],[shot(),shot(2)],{...f.options,maxShots:1})).toThrow(/shot budget/);
  expect(()=>capture(f.context,prefixes,f.bank.freeze(),[],[shot(),shot(2)],{...f.options,maxCommands:1})).toThrow(/combined command/);
  expect(()=>capture(f.context,prefixes,f.bank.freeze(),[],[shot()],{...f.options,maxTextChars:3})).toThrow(/text budget/);expect(f.reserve).not.toHaveBeenCalled();
 });
 it('rejects foreign prefixes, invalid mappings and missing live reservations before constructor hooks',()=>{
  const f=fixture();for(const bad of [{...prefixes,callback:{...callback,sceneGeneration:2}},{...prefixes,receipt:{...receipt,tick:1}},{...prefixes,callback:undefined}])expect(()=>capture(f.context,bad,f.bank.freeze(),[],[shot()],f.options)).toThrow();
  expect(()=>capture(f.context,prefixes,f.bank.freeze(),[],[shot()],{...f.options,renderToWorld:new THREE.Matrix4().makeScale(0,1,1).toArray()})).toThrow(/mapping/);
  expect(()=>capture(f.context,prefixes,f.bank.freeze(),[],[shot()],{...f.options,renderToWorld:new THREE.Matrix4().makeScale(1e308,1e308,1e308).toArray()})).toThrow(/mapping/);
  expect(()=>capture({...f.context,reserveLaunch:undefined},prefixes,f.bank.freeze(),[],[shot()],f.options)).toThrow(/live launch/);expect(f.reserve).not.toHaveBeenCalled();expect(f.captureBirth).not.toHaveBeenCalled();
 });
 it('bounds the intrinsic physical map before iteration and bypasses overridden map accessors',()=>{
  const f=fixture(),iterate=vi.fn(()=>{throw Error('must not iterate');});
  Object.defineProperty(f.projectiles,'values',{get:iterate});Object.defineProperty(f.projectiles,'size',{get:iterate});
  for(let i=0;i<9;i++)f.projectiles.set(`excess-${i}`,undefined as unknown as OriginalSoloProjectile);
  expect(()=>capture(f.context,prefixes,f.bank.freeze(),[],[shot()],f.options)).toThrow(/physical actor budget/);
  expect(iterate).not.toHaveBeenCalled();expect(f.reserve).not.toHaveBeenCalled();expect(f.captureBirth).not.toHaveBeenCalled();
  f.projectiles.clear();expect(capture(f.context,prefixes,f.bank.freeze(),[],[],f.options).receiptCommands).toEqual([]);expect(iterate).not.toHaveBeenCalled();
 });
 it('requires exact successful birth identity/family and valid capture hooks',()=>{
  for(const patch of [{launchId:'foreign'},{weapon:'rpg' as const},{cloneFresh:undefined}]){const f=fixture(),birth=f.captureBirth;f.options.captureBirth=vi.fn(reservation=>({...birth(reservation),...patch})) as typeof birth;expect(()=>capture(f.context,prefixes,f.bank.freeze(),[],[shot()],f.options)).toThrow(/exact bot/);}
 });
 it('returns a receipt-only death program without reading a body or reserving',()=>{
  const f=fixture(),dead={...f.context,deliveryKind:'death' as const,body:undefined as never};const program=capture(dead,{receipt},f.bank.freeze(),[],[],f.options);
  expect(program).toEqual({receiptCommands:[],botLaunchAdmissions:[]});expect(()=>capture(dead,{receipt},f.bank.freeze(),[],[shot()],f.options)).toThrow(/death receipt/);expect(f.reserve).not.toHaveBeenCalled();
 });
 it('reuses continuing and terminal ownership capture, including terminal command room before new reservations',()=>{
  const f=fixture(),program=capture(f.context,prefixes,f.bank.freeze(),[],[shot()],f.options),birth=program.callbackCommands![0];if(birth.kind!=='projectile-birth')throw Error();const tx=f.bank.begin({allocateCloneName:()=> 'unit-projectile'});tx.advanceCallback(callback);tx.birth(birth.birth);tx.commit();
  const admission=program.botLaunchAdmissions[0].admission;if(!admission.ok)throw Error();const row={launch:admission.reservation.launch,state:{...admission.reservation.prototype,position:{...admission.reservation.prototype.position,x:27}}};f.projectiles.set(row.launch.id,row);
  const nextContext={...f.context,order:{receiptCallbacks:1,callbacks:2},receiptTick:1},nextPrefixes={receipt:{...receipt,callback:1,tick:1},callback:{...callback,callback:2}};
  const continuing=capture(nextContext,nextPrefixes,f.bank.freeze(),[],[],f.options);expect(continuing.receiptCommands[0].kind).toBe('projectile-pose');
  f.projectiles.clear();const blast={launch:row.launch,state:createOriginalBlast(row.state.position,'bot','launcher')};const bang:OriginalSoloAdmittedBang={blast,effectId:'bang',birthPrefix:nextPrefixes.receipt,event:{kind:'bang',id:'bang',position:row.state.position,type:'grenade',attackerName:'Bot'},terminalProjectilePose:{id:row.launch.id,weapon:'launcher',position:row.state.position,direction:row.state.direction,...(row.state.angular?{orientation:row.state.angular.orientation}:{})}};
  f.reserve.mockClear();expect(()=>capture(nextContext,nextPrefixes,f.bank.freeze(),[bang],[shot(2)],{...f.options,maxCommands:2})).toThrow(/combined command/);expect(f.reserve).not.toHaveBeenCalled();
  expect(capture(nextContext,nextPrefixes,f.bank.freeze(),[bang],[],f.options).receiptCommands.map(command=>command.kind)).toEqual(['projectile-pose','admitted-projectile-retire']);
 });
});
