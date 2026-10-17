import {afterEach,describe,expect,it,vi} from 'vitest';
import {captureOriginalSoloHumanGunProgram,type OriginalSoloHumanGunProgramOptions} from './originalSoloHumanGunProgram';
import {captureOriginalSoloHumanCallbackInput} from './originalSoloHumanCallbackInput';
import {OriginalReceiverLocalWeaponWorld,type ReceiverLocalWeaponWorldCheckpoint} from '../shared/originalReceiverLocalWeaponWorld';
import {ORIGINAL_RECEIVER_LOCAL_WEAPON_RESOURCES,type ReceiverLocalWeaponHandle} from '../shared/originalReceiverLocalWeaponInventory';
import type {ReceiverLoadoutCheckpoint} from '../shared/originalReceiverLoadoutWorld';
import type {WeaponId} from '../shared/protocol';
import type {OriginalSoloGunHitscanCapture,OriginalSoloGunFireCapture} from '../shared/originalSoloGunCallbackProgram';
import type {ReceiverLocalHitscanAction} from '../shared/originalReceiverLocalHitscan';
import {createOriginalSoloLocalWeaponBinding} from './originalSoloLocalWeaponBinding';
const present={pistol:true,shotgun:true,rifle:true,launcher:true,rpg:true,sniper:true};
const targets={pistol:8,shotgun:6,rifle:28,launcher:6,rpg:1,sniper:28},waits={pistol:8,shotgun:15,rifle:2,launcher:10,rpg:10,sniper:50};
const weaponHandles:Record<WeaponId,ReceiverLocalWeaponHandle>={pistol:'pistol',shotgun:'spas12',rifle:'ak47',launcher:'rg6',rpg:'rpg',sniper:'dragunov'};
const matrix=(x=0)=>[1,0,0,0,0,1,0,0,0,0,1,0,x,0,0,1];
const owners:OriginalReceiverLocalWeaponWorld[]=[];
afterEach(()=>{for(const owner of owners.splice(0))owner.release();vi.restoreAllMocks();});
function fixture(map:'barrack'|'woodlands'='woodlands',selected:WeaponId='rifle',keys:string[]=[],typing=false,failCamera=false){
 const previous:ReceiverLoadoutCheckpoint={prefix:{kind:'callback',sceneGeneration:3,callback:0},map,selected,refillTarget:targets[selected],score:0,goldScore:0,owned:{...present},ammo:{pistol:8,shotgun:6,rifle:28,launcher:6,rpg:1,sniper:28},reserve:{pistol:54,shotgun:24,rifle:140,launcher:18,rpg:12,sniper:12},counter:{waitgun:map==='barrack'?waits[selected]:0,poldwaitgun:0}};
 const binding=createOriginalSoloLocalWeaponBinding({followOffworldParents:true,parentRestoresMembership:true,maxTextChars:8192});
 // Offworld prototypes explicitly retain no parent; only the selected model
 // starts under this actual camera. No synthetic template parent is supplied.
 const world=new OriginalReceiverLocalWeaponWorld({prefix:previous.prefix,cameraHandle:'camera',cameraWorldMatrix:matrix(),selectedWeapon:selected,loadedRocket:true,motion:{weapon:selected,ticker:1,gunPositionSource:{x:-12,y:-20,z:5}},models:Object.entries(ORIGINAL_RECEIVER_LOCAL_WEAPON_RESOURCES).map(([handle,resource])=>({handle:handle as ReceiverLocalWeaponHandle,resource,worldMatrix:matrix(5),inWorld:handle===weaponHandles[selected],groupAncestry:handle===weaponHandles[selected]?['camera']:[]}))},{sourceScale:.02,maxCommands:128,maxTextChars:8192,bindModels:(operation,state)=>{if(failCamera&&operation.kind==='camera')throw Error('preview binding failed');return binding(operation,state);}});owners.push(world);
 const input=captureOriginalSoloHumanCallbackInput({prefix:{kind:'callback',sceneGeneration:3,callback:1},cameraWorldMatrix:matrix(3),velocityWorld:{x:0,y:0,z:0},pitchRadians:.1,yawRadians:.2,typing,firing:true,keys:new Set(keys),sourceScopeEnabled:false,weaponModelPresent:present});
 const options:OriginalSoloHumanGunProgramOptions={localWeaponWorld:world,random3:[2],sendReport:false,maxCommands:128,maxModels:64,maxTextChars:65536,captureHitscan:request=>action(request),captureLaunch:()=>({admission:Object.freeze({ok:false,reason:'projectile-cap'})})};
 return {previous,world,input,options};
}
function action(request:OriginalSoloGunHitscanCapture):ReceiverLocalHitscanAction {return {prefix:request.checkpoint.prefix as ReceiverLocalHitscanAction['prefix'],weapon:request.fire.weapon as ReceiverLocalHitscanAction['weapon'],sourceRotation:{x:0,y:0,z:0},origin:{x:0,y:1,z:0},bspWorld:1,actorNames:{},effectId:`effect-${request.rayIndex}`,muzzleId:`muzzle-${request.rayIndex}`,gunPose:{position:{x:0,y:0,z:0},yaw:0,phase:0,scale:1,rotation:{x:0,y:0,z:0,w:1}}};}
describe('human ordered gun program intermediate bank capture',()=>{
 it.each([true,false])('forwards actual captured human scope policy %s to poll and frame',sourceScopeEnabled=>{
  const f=fixture('woodlands','sniper'),program=captureOriginalSoloHumanGunProgram(f.previous,{...f.input,sourceScopeEnabled},f.options);
  const scope=program.callbackCommands.filter(c=>c.kind==='gun-output'&&(c.output.kind==='scope-poll'||c.output.kind==='scope-frame'));expect(scope).toHaveLength(2);
  for(const c of scope)expect(c.kind==='gun-output'&&c.output).toMatchObject({sourceScopeEnabled});
 });
 it('reads the captured human scope scalar once before external hooks',()=>{
  const f=fixture('woodlands','sniper');let reads=0;
  const program=captureOriginalSoloHumanGunProgram(f.previous,{...f.input,get sourceScopeEnabled(){reads++;return false;}},{...f.options,captureHitscan:r=>{expect(reads).toBe(1);return action(r);}});
  expect(reads).toBe(1);expect(program.callbackCommands.at(-2)).toMatchObject({kind:'gun-output',output:{kind:'scope-frame',sourceScopeEnabled:false}});
 });
 it('rejects malformed human scope policy before bank previews or fire hooks',()=>{
  const f=fixture(),begin=vi.spyOn(f.world,'begin'),hook=vi.fn(action);
  expect(()=>captureOriginalSoloHumanGunProgram(f.previous,{...f.input,sourceScopeEnabled:null as unknown as boolean},{...f.options,captureHitscan:hook})).toThrow('options');expect(begin).not.toHaveBeenCalled();expect(hook).not.toHaveBeenCalled();
 });
 for(const map of ['barrack','woodlands'] as const){
  it(`${map} freezes preceding commands at each SPAS ray, with no physical finish`,()=>{
   const f=fixture(map,'shotgun'),initial=f.world.freeze(),requests:OriginalSoloGunHitscanCapture[]=[],previews:ReceiverLocalWeaponWorldCheckpoint[]=[];
   const program=captureOriginalSoloHumanGunProgram(f.previous,f.input,{...f.options,captureHitscan:(request,preview)=>{requests.push(request);previews.push(preview);expect(f.world.freeze()).toBe(initial);const probe=f.world.begin();probe.rollback();return action(request);}});
   expect(requests).toHaveLength(2);expect(previews[0]).toEqual(previews[1]);expect(previews[0].motion.ticker).toBe(1);expect(previews[0].selectedWeapon).toBe('shotgun');
   expect(requests[0].precedingCommands.some(command=>command.kind==='local-hitscan')).toBe(false);expect(requests[1].precedingCommands.at(-1)?.kind).toBe('local-hitscan');
   expect(Object.isFrozen(requests[0].precedingCommands)).toBe(true);expect(Object.isFrozen(previews[0].models[0].worldMatrix)).toBe(true);expect(f.world.freeze()).toBe(initial);expect(program.callbackCommands.at(-1)?.kind).toBe('weapon-finish');
  });
  it(`${map} old rifle shot precedes selection and final physical pose`,()=>{
   const f=fixture(map,'rifle',['Digit1']),initial=f.world.freeze();let shot:ReceiverLocalWeaponWorldCheckpoint|undefined;
   const program=captureOriginalSoloHumanGunProgram(f.previous,f.input,{...f.options,captureHitscan:(request,preview)=>{shot=preview;return action(request);}});
   expect(shot?.selectedWeapon).toBe('rifle');expect(shot?.models.find(model=>model.handle==='ak47')?.worldMatrix[12]).toBe(8);expect(shot?.motion.gunPositionSource).not.toEqual(initial.motion.gunPositionSource);expect(f.world.freeze()).toBe(initial);
   const tx=f.world.begin();tx.beginCallback(f.input.prefix,f.input.cameraWorldMatrix);
   for(const command of program.callbackCommands){if(command.kind==='weapon-whichgun')tx.whichGun(command.weapon);else if(command.kind==='weapon-reload')tx.reload();else if(command.kind==='weapon-fire')tx.fire();else if(command.kind==='weapon-rocket')tx.refreshRocket(command.loadedRocket);else if(command.kind==='weapon-finish')tx.finishPhysicalCallback(f.input.velocityWorld);}
   expect(tx.freeze().selectedWeapon).toBe('pistol');expect(tx.freeze().motion.gunPositionSource).not.toEqual(shot?.motion.gunPositionSource);expect(tx.freeze().models.find(model=>model.handle==='pistol')?.worldMatrix).not.toEqual(shot?.models.find(model=>model.handle==='pistol')?.worldMatrix);tx.rollback();expect(f.world.freeze()).toBe(initial);
  });
  it(`${map} empty held reload previews actual fallback selection before firing`,()=>{
   const f=fixture(map,'launcher',['KeyR']),before={...f.previous,ammo:{...f.previous.ammo,launcher:0},reserve:{...f.previous.reserve,launcher:0}};let shot:ReceiverLocalWeaponWorldCheckpoint|undefined,request:OriginalSoloGunHitscanCapture|undefined;
   captureOriginalSoloHumanGunProgram(before,f.input,{...f.options,captureHitscan:(r,p)=>{request=r;shot=p;return action(r);}});
   expect(shot?.selectedWeapon).toBe('pistol');expect(request?.precedingCommands.some(command=>command.kind==='weapon-whichgun'&&command.weapon==='pistol')).toBe(true);expect(request?.precedingCommands.some(command=>command.kind==='weapon-reload')).toBe(true);expect(shot?.motion.ticker).toBe(1);
  });
  it(`${map} RPG launch sees source recoil state and temporary refill without committing it`,()=>{
   const f=fixture(map,'rpg'),before={...f.previous,refillTarget:3},initial=f.world.freeze();let seen:OriginalSoloGunFireCapture|undefined,shot:ReceiverLocalWeaponWorldCheckpoint|undefined;
   const result=captureOriginalSoloHumanGunProgram(before,f.input,{...f.options,captureLaunch:(request,preview)=>{seen=request;shot=preview;expect(f.world.freeze()).toBe(initial);return {admission:Object.freeze({ok:false,reason:'projectile-cap'})};}});
   expect(seen?.checkpoint.ammo.rpg).toBe(3);expect(seen?.precedingCommands.some(command=>command.kind==='weapon-fire')).toBe(true);expect(seen?.precedingCommands.findIndex(command=>command.kind==='weapon-fire')).toBeLessThan(seen?.precedingCommands.findIndex(command=>command.kind==='weapon-reload')!);expect(shot?.motion.gunPositionSource).toEqual({x:-12,y:-20,z:5});expect(shot?.motion.ticker).toBe(1);expect(result.gunPhase.checkpoint.ammo.rpg).toBe(0);expect(f.world.freeze()).toBe(initial);
  });
 }
 it.each(['commands','text','samples','missing-hook'])('preflights %s before any preview or external hook',failure=>{
  const f=fixture(),initial=f.world.freeze(),begin=vi.spyOn(f.world,'begin'),hook=vi.fn(action),options={...f.options,captureHitscan:hook};
  if(failure==='commands')options.maxCommands=2;else if(failure==='text')options.maxTextChars=10;else if(failure==='samples')options.random3=[];else options.captureHitscan=undefined!;
  expect(()=>captureOriginalSoloHumanGunProgram(f.previous,f.input,options)).toThrow();expect(hook).not.toHaveBeenCalled();expect(begin).not.toHaveBeenCalled();expect(f.world.freeze()).toBe(initial);
 });
 it('rolls back before throwing external hooks and supports identical retry',()=>{
  const f=fixture(),initial=f.world.freeze(),failure=Error('capture failed');let retained:ReceiverLocalWeaponWorldCheckpoint|undefined;
  expect(()=>captureOriginalSoloHumanGunProgram(f.previous,f.input,{...f.options,captureHitscan:(_request,preview)=>{retained=preview;const probe=f.world.begin();probe.rollback();throw failure;}})).toThrow(failure);expect(f.world.freeze()).toBe(initial);
  let retry:ReceiverLocalWeaponWorldCheckpoint|undefined;captureOriginalSoloHumanGunProgram(f.previous,f.input,{...f.options,captureHitscan:(r,p)=>{retry=p;return action(r);}});expect(retry).toEqual(retained);expect(f.world.freeze()).toBe(initial);
 });
 it('rolls back a failed actual preview binding without invoking external hooks',()=>{
  const f=fixture('woodlands','rifle',[],false,true),initial=f.world.freeze(),hook=vi.fn(action);expect(()=>captureOriginalSoloHumanGunProgram(f.previous,f.input,{...f.options,captureHitscan:hook})).toThrow('preview binding failed');expect(hook).not.toHaveBeenCalled();expect(f.world.freeze()).toBe(initial);const probe=f.world.begin();probe.rollback();
 });
 it('rejects stale prefix, different generation and selected bank/loadout mismatch before hooks',()=>{
  const f=fixture(),hook=vi.fn(action);for(const previous of [{...f.previous,prefix:{kind:'callback' as const,sceneGeneration:4,callback:0}},{...f.previous,selected:'pistol' as const}])expect(()=>captureOriginalSoloHumanGunProgram(previous,f.input,{...f.options,captureHitscan:hook})).toThrow('mismatch');
  expect(()=>captureOriginalSoloHumanGunProgram(f.previous,{...f.input,prefix:{...f.input.prefix,callback:2}},{...f.options,captureHitscan:hook})).toThrow('mismatch');expect(hook).not.toHaveBeenCalled();
 });
 it('rejects bank release or external commit during a fire hook',()=>{
  const released=fixture();expect(()=>captureOriginalSoloHumanGunProgram(released.previous,released.input,{...released.options,captureHitscan:r=>{released.world.release();return action(r);}})).toThrow('released');
  const changed=fixture();expect(()=>captureOriginalSoloHumanGunProgram(changed.previous,changed.input,{...changed.options,captureHitscan:r=>{const tx=changed.world.begin();tx.beginCallback(changed.input.prefix,changed.input.cameraWorldMatrix);tx.finishCallback(0);tx.commit();return action(r);}})).toThrow('changed during capture');
 });
 it('typing keeps source gating and produces no previews or hooks',()=>{
  const f=fixture('woodlands','rifle',[],true),begin=vi.spyOn(f.world,'begin'),hook=vi.fn(action);const result=captureOriginalSoloHumanGunProgram(f.previous,f.input,{...f.options,random3:[],captureHitscan:hook});expect(begin).not.toHaveBeenCalled();expect(hook).not.toHaveBeenCalled();expect(result.gunPhase.checkpoint.ammo.rifle).toBe(28);
 });
});
