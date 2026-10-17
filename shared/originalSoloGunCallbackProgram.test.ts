import {describe,it,expect} from 'vitest';
import {captureOriginalSoloGunCallbackProgram,type OriginalSoloGunCallbackProgramOptions,type OriginalSoloGunHitscanCapture,type OriginalSoloGunFireCapture} from './originalSoloGunCallbackProgram';
import type {ReceiverLoadoutCheckpoint} from './originalReceiverLoadoutWorld';
import type {ReceiverGunCallbackInput} from './originalReceiverGunCallback';
import type {ReceiverLocalHitscanAction} from './originalReceiverLocalHitscan';
import type {WeaponId} from './protocol';
const weapons:readonly WeaponId[]=['pistol','shotgun','rifle','launcher','rpg','sniper'];
const present=Object.fromEntries(weapons.map(w=>[w,true])) as Record<WeaponId,boolean>;
const targets={pistol:8,shotgun:6,rifle:28,launcher:6,rpg:1,sniper:28};
const waits={pistol:8,shotgun:15,rifle:2,launcher:10,rpg:10,sniper:50};
function seed(map:'barrack'|'woodlands',selected:WeaponId='rifle'):ReceiverLoadoutCheckpoint{return {prefix:{kind:'callback',sceneGeneration:3,callback:0},map,selected,owned:{...present},ammo:{pistol:8,shotgun:6,rifle:28,launcher:6,rpg:1,sniper:28},reserve:{pistol:54,shotgun:24,rifle:140,launcher:18,rpg:12,sniper:12},refillTarget:targets[selected],counter:{waitgun:map==='barrack'?waits[selected]:0,poldwaitgun:0},score:0,goldScore:0};}
function input(held:Partial<ReceiverGunCallbackInput['held']>={}):ReceiverGunCallbackInput{return {prefix:{kind:'callback',sceneGeneration:3,callback:1},held:{typing:false,reload:false,fire:true,digits:[false,false,false,false,false,false],...held},weaponModelPresent:present};}
function action(r:OriginalSoloGunHitscanCapture):ReceiverLocalHitscanAction{return {prefix:r.checkpoint.prefix as ReceiverLocalHitscanAction['prefix'],weapon:r.fire.weapon as ReceiverLocalHitscanAction['weapon'],sourceRotation:{x:0,y:0,z:0},origin:{x:0,y:1,z:0},bspWorld:1,actorNames:{},effectId:`effect-${r.rayIndex}`,muzzleId:`muzzle-${r.rayIndex}`,gunPose:{position:{x:0,y:0,z:0},rotation:{x:0,y:0,z:0,w:1},yaw:0,phase:0,scale:1}};}
const options:OriginalSoloGunCallbackProgramOptions={shiftHeld:false,random3:[2],sendReport:false,maxCommands:128,maxModels:64,maxTextChars:65536,captureHitscan:action,captureLaunch:()=>({admission:Object.freeze({ok:false,reason:'projectile-cap'})})};
describe('source ordered Solo gun callback program',()=>{
 it.each([true,false])('carries captured scope policy %s through poll and frame',sourceScopeEnabled=>{
  const result=captureOriginalSoloGunCallbackProgram(seed('woodlands','sniper'),input({fire:false}),{...options,random3:[],sourceScopeEnabled});
  const scope=result.callbackCommands.filter(c=>c.kind==='gun-output'&&(c.output.kind==='scope-poll'||c.output.kind==='scope-frame'));
  expect(scope).toHaveLength(2);for(const c of scope)expect(c.kind==='gun-output'&&c.output).toMatchObject({sourceScopeEnabled});
 });
 it('captures one scope-policy getter before hooks and retains it across final selection',()=>{
  let reads=0,value=false;const result=captureOriginalSoloGunCallbackProgram(seed('woodlands','sniper'),input({digits:[true,false,false,false,false,false]}),{...options,get sourceScopeEnabled(){reads++;return value;},captureHitscan:r=>{value=true;return action(r);}});
  expect(reads).toBe(1);const scope=result.callbackCommands.filter(c=>c.kind==='gun-output'&&(c.output.kind==='scope-poll'||c.output.kind==='scope-frame'));
  expect(scope).toHaveLength(2);for(const c of scope)expect(c.kind==='gun-output'&&c.output).toMatchObject({sourceScopeEnabled:false});
 });
 it.each([undefined,null,0,'false'])('rejects malformed scope policy %s before fire hooks',sourceScopeEnabled=>{
  let called=0;expect(()=>captureOriginalSoloGunCallbackProgram(seed('woodlands'),input(),{...options,sourceScopeEnabled,captureHitscan:(r:OriginalSoloGunHitscanCapture)=>{called++;return action(r);}} as unknown as OriginalSoloGunCallbackProgramOptions)).toThrow('options');expect(called).toBe(0);
 });
 for(const map of ['barrack','woodlands'] as const){
  it(`${map} AK ray sees old weapon/count and audio follows shot before numeric selection`,()=>{
   const calls:OriginalSoloGunHitscanCapture[]=[];
   const result=captureOriginalSoloGunCallbackProgram(seed(map),input({digits:[true,false,false,false,false,false]}),{...options,captureHitscan:r=>{calls.push(r);return action(r);}});
   const commands=result.callbackCommands,ray=commands.findIndex(c=>c.kind==='local-hitscan'),sound=commands.findIndex(c=>c.kind==='gun-output'&&c.output.kind==='sound');
   expect(calls).toHaveLength(1);expect(calls[0].checkpoint.selected).toBe('rifle');expect(calls[0].checkpoint.ammo.rifle).toBe(28);
   expect(ray).toBeLessThan(sound);expect(sound).toBeLessThan(commands.findIndex(c=>c.kind==='weapon-whichgun'&&c.weapon==='pistol'));
   expect(result.gunPhase.checkpoint.ammo.rifle).toBe(27);expect(result.gunPhase.checkpoint.selected).toBe('pistol');
   const captures=commands.filter(c=>c.kind==='loadout-capture');expect(captures.at(-1)?.checkpoint).toBe(result.gunPhase.checkpoint);
   expect(captures.filter(c=>c.checkpoint===result.gunPhase.checkpoint)).toHaveLength(1);
   expect(commands.at(-2)).toMatchObject({kind:'gun-output',output:{kind:'scope-frame',weapon:'pistol'}});expect(commands.at(-1)).toEqual({kind:'weapon-finish'});
   expect(Object.isFrozen(result)).toBe(true);expect(Object.isFrozen(calls[0].checkpoint.ammo)).toBe(true);
  });
  it(`${map} RPG reservation observes temporary refill after recoil and before saved ammo overwrite`,()=>{
   const before={...seed(map,'rpg'),refillTarget:3};const captures:OriginalSoloGunFireCapture[]=[];
   const result=captureOriginalSoloGunCallbackProgram(before,input(),{...options,captureLaunch:r=>{captures.push(r);return {admission:Object.freeze({ok:false,reason:'projectile-cap'})};}});
   expect(captures).toHaveLength(1);expect(captures[0].checkpoint).toMatchObject({selected:'rpg',ammo:{rpg:3},reserve:{rpg:10},refillTarget:1});
   const commands=result.callbackCommands,recoil=commands.findIndex(c=>c.kind==='weapon-fire'),reload=commands.findIndex(c=>c.kind==='loadout-capture'&&c.checkpoint.ammo.rpg===3);
   expect(recoil).toBeLessThan(reload);expect(result.gunPhase.checkpoint.ammo.rpg).toBe(0);expect(result.gunPhase.checkpoint.reserve.rpg).toBe(10);
   expect(commands.some(c=>c.kind==='projectile-birth')).toBe(false);expect(result.launchAdmissions).toEqual([{ok:false,reason:'projectile-cap'}]);
  });
  it(`${map} SPAS captures two literal rays at same predebit checkpoint before look kicks`,()=>{
   const requests:OriginalSoloGunHitscanCapture[]=[];
   const result=captureOriginalSoloGunCallbackProgram(seed(map,'shotgun'),input(),{...options,captureHitscan:r=>{requests.push(r);return action(r);}});
   expect(requests.map(r=>r.coordinates)).toEqual([[310,190],[330,210]]);expect(requests[0].checkpoint).toBe(requests[1].checkpoint);
   expect(requests[0].checkpoint.ammo.shotgun).toBe(6);expect(result.gunPhase.checkpoint.ammo.shotgun).toBe(5);
   const commands=result.callbackCommands;expect(commands.map((c,i)=>c.kind==='local-hitscan'?i:-1).reduce((a,b)=>Math.max(a,b),-1)).toBeLessThan(commands.findIndex(c=>c.kind==='gun-output'&&c.output.kind==='look-kick'));
  });
  it(`${map} held reload publishes transferred counts before pose and blocks held fire`,()=>{
   const s=seed(map),before={...s,ammo:{...s.ammo,rifle:2}};
   const result=captureOriginalSoloGunCallbackProgram(before,input({reload:true}),{...options,random3:[]});
   expect(result.callbackCommands.some(c=>c.kind==='local-hitscan')).toBe(false);
   expect(result.callbackCommands.find(c=>c.kind==='loadout-capture')).toMatchObject(map==='barrack'?{checkpoint:{ammo:{rifle:28},reserve:{rifle:114}}}:{checkpoint:{counter:{waitgun:-1}}});
   expect(result.gunPhase.checkpoint.ammo.rifle).toBe(28);expect(result.gunPhase.gunPhase?.ready).toBe(false);
  });
  it(`${map} empty held reload switches to first available before its ray`,()=>{
   const s=seed(map,'launcher'),before={...s,ammo:{...s.ammo,launcher:0},reserve:{...s.reserve,launcher:0}};let observed:OriginalSoloGunHitscanCapture|undefined;
   const result=captureOriginalSoloGunCallbackProgram(before,input({reload:true}),{...options,captureHitscan:r=>{observed=r;return action(r);}});
   expect(observed?.checkpoint.selected).toBe('pistol');expect(observed?.checkpoint.ammo.pistol).toBe(8);expect(result.gunPhase.checkpoint.ammo.pistol).toBe(7);
  });
 }
 it('preflights command growth and missing hooks without invoking resource hooks',()=>{
  let called=0;expect(()=>captureOriginalSoloGunCallbackProgram(seed('woodlands','shotgun'),input(),{...options,maxCommands:2,captureHitscan:r=>{called++;return action(r);}})).toThrow(/command budget/);expect(called).toBe(0);
  expect(()=>captureOriginalSoloGunCallbackProgram(seed('woodlands'),input(),{...options,maxTextChars:10,captureHitscan:r=>{called++;return action(r);}})).toThrow(/text budget/);expect(called).toBe(0);
  expect(()=>captureOriginalSoloGunCallbackProgram(seed('woodlands'),input(),{...options,captureHitscan:undefined})).toThrow(/Missing Solo gun hitscan/);
 });
 it('reads each boundary container alias once and detaches the original counts before hooks',()=>{
  const before=seed('woodlands'),rawAmmo=before.ammo,i=input(),held=i.held,digits=held.digits,presence=i.weaponModelPresent;let ammoReads=0,digitReads=0,presenceReads=0;
  Object.defineProperty(before,'ammo',{get(){ammoReads++;return rawAmmo;}});
  Object.defineProperty(held,'digits',{get(){digitReads++;return digits;}});
  Object.defineProperty(i,'weaponModelPresent',{get(){presenceReads++;return presence;}});
  const result=captureOriginalSoloGunCallbackProgram(before,i,{...options,captureHitscan:r=>{(rawAmmo as Record<WeaponId,number>).rifle=900;return action(r);}});
  expect([ammoReads,digitReads,presenceReads]).toEqual([1,1,1]);expect(result.gunPhase.checkpoint.ammo.rifle).toBe(27);
 });
 it('captures send-report first and never enumerates unknown action properties',()=>{
  const result=captureOriginalSoloGunCallbackProgram(seed('woodlands'),input(),{...options,sendReport:true,captureHitscan:r=>{const a=action(r);Object.defineProperty(a,'unknown',{enumerable:true,get(){throw Error('unknown read');}});return a;}});
  expect(result.callbackCommands[0]).toEqual({kind:'weapon-report-send'});
  const c=result.callbackCommands.find(c=>c.kind==='local-hitscan');expect(c?.kind==='local-hitscan'&&Object.hasOwn(c.action,'unknown')).toBe(false);
 });
 it('rejects mismatched hitscan weapon/prefix and requires success birth matching issuer',()=>{
  expect(()=>captureOriginalSoloGunCallbackProgram(seed('woodlands'),input(),{...options,captureHitscan:r=>({...action(r),weapon:'pistol'})})).toThrow(/Foreign Solo gun hitscan/);
  expect(()=>captureOriginalSoloGunCallbackProgram(seed('woodlands','launcher'),input(),{...options,captureLaunch:()=>({admission:Object.freeze({ok:true,reservation:{} as never})})})).toThrow(/admitted constructor/);
 });
 it('loaded RPG with no reserve constructs and consumes saved ammo without invented fallback',()=>{
  const s=seed('woodlands','rpg'),before={...s,reserve:{...s.reserve,rpg:0}};let observed:OriginalSoloGunFireCapture|undefined;
  const result=captureOriginalSoloGunCallbackProgram(before,input(),{...options,captureLaunch:r=>{observed=r;return {admission:Object.freeze({ok:false,reason:'projectile-cap'})};}});
  expect(observed?.checkpoint).toMatchObject({selected:'rpg',ammo:{rpg:1},reserve:{rpg:0}});
  expect(result.gunPhase.checkpoint.selected).toBe('rpg');expect(result.gunPhase.checkpoint.ammo.rpg).toBe(0);
 });
 it('empty RPG can fall back before constructor gate and emits no launch from saved zero bullets',()=>{
  const s=seed('woodlands','rpg'),before={...s,ammo:{...s.ammo,rpg:0},reserve:{...s.reserve,rpg:0}};
  const result=captureOriginalSoloGunCallbackProgram(before,input(),{...options,random3:[],captureLaunch:undefined});
  expect(result.launchAdmissions).toEqual([]);expect(result.gunPhase.checkpoint.selected).toBe('pistol');expect(result.gunPhase.checkpoint.ammo.pistol).toBe(8);
 });
 it('retains a successful issuer identity and detaches only known birth fields',()=>{
  const cloneFresh=()=>{throw Error('clone must not execute during capture');},resetModel=()=>{throw Error('reset must not execute during capture');};
  const admission=Object.freeze({ok:true as const,reservation:{launch:{id:'launch-one',weapon:'launcher'}}}) as unknown as import('./originalSoloLaunchBatch').OriginalSoloReservedLaunchAdmission;
  const birth={launchId:'launch-one',weapon:'launcher' as const,cloneFresh,resetModel};
  Object.defineProperty(birth,'unknown',{enumerable:true,get(){throw Error('unknown birth read');}});
  const result=captureOriginalSoloGunCallbackProgram(seed('woodlands','launcher'),input(),{...options,captureLaunch:()=>({admission,birth})});
  expect(result.launchAdmissions[0]).toBe(admission);const command=result.callbackCommands.find(c=>c.kind==='projectile-birth');
  expect(command?.kind==='projectile-birth'&&command.birth.cloneFresh).toBe(cloneFresh);
  expect(command?.kind==='projectile-birth'&&Object.hasOwn(command.birth,'unknown')).toBe(false);
  expect(result.gunPhase.checkpoint.ammo.launcher).toBe(5);
 });
 it('chat still emits captured terminal scope frame without hooks, reload or random sample',()=>{
  const result=captureOriginalSoloGunCallbackProgram(seed('woodlands','sniper'),input({typing:true}),{...options,random3:[],shiftHeld:true,captureHitscan:undefined});
  expect(result.callbackCommands.at(-2)).toEqual({kind:'gun-output',output:{kind:'scope-frame',weapon:'sniper',typing:true,shiftHeld:true,sourceScopeEnabled:true}});
  expect(result.gunPhase.checkpoint.counter.waitgun).toBe(-1);
 });
});
