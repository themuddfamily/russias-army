import * as THREE from 'three';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {Game} from './game';
import {installOriginalSoloLegacyFixture} from './originalSoloLegacy.fixture';
import {readFileSync} from 'node:fs';
import {registerOriginalMapRuntime} from '../shared/originalMapRuntime';
import {OriginalBarrelWorld} from '../shared/originalBarrelWorld';
import {WeaponState} from './weapons';
import {createOriginalBlast} from '../shared/originalExplosives';
import {createOriginalPlayerHealth} from '../shared/originalPlayerHealth';

// Prototype harnesses exercise actual Game dispatch and result transition.
// Cancelling within the current Director actor iteration remains an adapter;
// recovered endgame resetactors establishes no subsequent registered callbacks.
const runtime=registerOriginalMapRuntime('barrack',JSON.parse(readFileSync('public/assets/original-scenes/barrack/scene.json','utf8')));
function client(){
 const elements=new Map<string,any>();
 const element=(id:string)=>{
  if(!elements.has(id)){
   const classes=new Set<string>();
   elements.set(id,{textContent:'',innerHTML:'',value:'',blur:vi.fn(),replaceChildren:vi.fn(),
    classList:{add:(v:string)=>classes.add(v),remove:(v:string)=>classes.delete(v),toggle:(v:string,on:boolean)=>on?classes.add(v):classes.delete(v),contains:(v:string)=>classes.has(v)}});
  }
  return elements.get(id);
 };
 vi.stubGlobal('document',{getElementById:element,exitPointerLock:vi.fn(),pointerLockElement:null,fullscreenElement:null,documentElement:{dataset:{}}});
 vi.stubGlobal('navigator',{});
 const game=Object.create(Game.prototype) as any;
 const camera=new THREE.PerspectiveCamera();camera.position.set(1000,1000,1000);
 Object.assign(game,{archivalWinter:false,mapId:'barrack',mode:'solo',phase:'playing',playerAlive:true,
  health:1,sourceHealth:createOriginalPlayerHealth(1,-2),deaths:0,score:0,elapsed:.2,startTime:0,
  camera,velocity:new THREE.Vector3(),yaw:0,pitch:0,keys:new Set(),chatOpen:false,firing:false,aiming:false,
  weaponState:new WeaponState('barrack'),nextSourceReloadPoll:0,originalActorDispatchGeneration:0,
  originalProjectileAccumulator:0,projectiles:[],originalBlasts:[],enemies:[],remotePlayers:new Map(),
  scene:new THREE.Scene(),localCallsign:'Local goody',arena:{runtime,barrelWorld:new OriginalBarrelWorld(runtime),spawnPoints:[new THREE.Vector3()],pickups:[]},
  audio:{play:vi.fn(),playOriginalHurt:vi.fn()},originalResultUi:{setEdition:vi.fn(),start:vi.fn()},
  closeChat:vi.fn(()=>{game.chatOpen=false;}),syncOriginalNormalUi:vi.fn(),updateHud:vi.fn(),
  advanceOriginalMuzzleFlashes:vi.fn(),openSourceScope:vi.fn(()=>false),advanceSourceScope:vi.fn(),updateWeaponReload:vi.fn(),
  spawnExplosion:vi.fn(),orientProjectileMesh:vi.fn(),playOriginalCombatSound:vi.fn(),
  updateAuthoredProjectiles:vi.fn(),updateOriginalPlayerCallback:vi.fn(),createProjectileMesh:()=>new THREE.Mesh(),
  immersiveCaptureGeneration:0,keyboardCaptureAttempt:0});
 installOriginalSoloLegacyFixture(game);game.arena.barrelWorld.applySnapshots([]);
 return {game,element};
}
function projectile(game:any){
 game.launchExplosive('launcher');const record=game.projectiles.at(-1);record.source.remainingCallbacks=2;return record;
}
/** Explicit already-received blast checkpoint; authority lives in the human
 * observer, while its diagnostic/presentation array retains insertion order. */
function blast(game:any,position:THREE.Vector3,owner='player'){
 const worlds=game.ensureSoloWorlds(),admission=worlds.launch({ownerId:'player',weapon:'launcher',eye:position,direction:{x:1,y:0,z:0}},game.elapsed);
 if(!admission.ok)throw Error(admission.reason);
 const human=worlds.worlds.get('player'),record=game.projectiles.find((p:any)=>p.soloId===admission.launch.id);
 record.mesh.removeFromParent();game.projectiles.splice(game.projectiles.indexOf(record),1);human.projectiles.delete(admission.launch.id);
 const state=createOriginalBlast(position,owner,'launcher');human.blasts.set(admission.launch.id,{launch:admission.launch,state});game.originalBlasts.push(state);return state;
}
/** These cancellation tests enter the actor phase after an explicitly skipped
 * physics/goody fixture. Real physics and human controls have separate tests. */
function actors(game:any){
 const worlds=game.ensureSoloWorlds();worlds.physics(game.elapsed,{skipIds:new Set(['player'])});worlds.completeExternalGoody('player');worlds.completeGoody(game.elapsed);
 game.playOriginalCombatSound.mockClear();game.updateOriginalExplosives(true);
}
afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks();});

describe('source actor registration cancellation at actual gameover',()=>{
 it('retains fatal damage and presentation handles but cancels later blast/projectile callbacks',()=>{
  const {game,element}=client(),p=projectile(game);
  const untouched=blast(game,game.camera.position.clone().add(new THREE.Vector3(100,0,0)),'other'),fatal=blast(game,game.camera.position.clone());
  const capture={actorStage:'pending',afterActors:null,endedAt:null};game.sourceCallbackCaptureCurrent=capture;
  actors(game);
  expect(game.phase).toBe('lost');expect(game.playerAlive).toBe(false);expect(game.health).toBe(0);expect(game.deaths).toBe(1);
  expect(element('result-title').textContent).toBe('GAME OVER');
  expect(fatal.remainingCallbacks).toBe(15);expect(untouched.remainingCallbacks).toBe(16);expect(p.source.remainingCallbacks).toBe(2);
  expect(game.originalBlasts).toEqual([untouched,fatal]);expect(game.projectiles).toEqual([p]);expect(p.mesh.parent).toBe(game.scene);
  expect(game.spawnExplosion).not.toHaveBeenCalled();expect(game.playOriginalCombatSound).not.toHaveBeenCalled();
  expect(game.audio.playOriginalHurt).toHaveBeenCalledOnce();expect(capture.actorStage).toBe('cancelled-gameover');
  const frozen={projectile:structuredClone(p.source),blasts:structuredClone(game.originalBlasts)};
  game.updateOriginalExplosives(true);game.updateProjectiles(.2);
  expect(p.source).toEqual(frozen.projectile);expect(game.originalBlasts).toEqual(frozen.blasts);
 });

 for(const boundary of ['beforeGun','afterGun'] as const)it(`cancels queued nominal callbacks when death occurs in ${boundary}`,()=>{
  const {game}=client();const before=vi.fn(),after=vi.fn();
  if(boundary==='beforeGun')before.mockImplementation(()=>game.killPlayer());else after.mockImplementation(()=>game.killPlayer());
  const counter=vi.spyOn(game.weaponState,'stepSourceCounter');
  game.updateSourceWeaponInput(before,after);
  expect(before).toHaveBeenCalledOnce();expect(after).toHaveBeenCalledTimes(boundary==='beforeGun'?0:1);
  expect(counter).toHaveBeenCalledTimes(boundary==='beforeGun'?0:1);expect(game.elapsed).toBe(.2);
  expect(game.originalActorDispatchGeneration).toBe(1);expect(game.phase).toBe('lost');
 });

 it('restores frame time even when a callback throws',()=>{
  const {game}=client();expect(()=>game.updateSourceWeaponInput(()=>{throw Error('callback failure');})).toThrow('callback failure');
  expect(game.elapsed).toBe(.2);
 });

 it('does not let reentrant new-life registration revive the old dispatch token',()=>{
  const {game}=client(),old=projectile(game);let replacement:any;
  const oldCapture={actorStage:'pending',afterActors:null,endedAt:null};
  const replacementCapture={actorStage:'pending',afterActors:null,endedAt:null};
  const readState=vi.spyOn(game,'captureSourceCallbackState');
  game.sourceCallbackCaptureCurrent=oldCapture;
  blast(game,game.camera.position.clone());
  game.originalResultUi.start.mockImplementation(()=>{
   game.resetOriginalActorDispatch();game.phase='playing';game.playerAlive=true;game.health=100;
   game.sourceHealth=createOriginalPlayerHealth();game.projectiles=[];game.originalBlasts=[];replacement=projectile(game);
   game.sourceCallbackCaptureCurrent=replacementCapture;
  });
  actors(game);
  expect(game.originalActorDispatchGeneration).toBe(2);expect(game.phase).toBe('playing');
  expect(old.source.remainingCallbacks).toBe(2);expect(replacement.source.remainingCallbacks).toBe(2);
  expect(game.projectiles).toEqual([replacement]);expect(game.originalBlasts).toEqual([]);expect(game.spawnExplosion).not.toHaveBeenCalled();
  expect(oldCapture.actorStage).toBe('cancelled-gameover');expect(oldCapture.endedAt).not.toBeNull();
  expect(oldCapture.afterActors).toMatchObject({stateUnavailable:expect.any(String),dispatchGeneration:0});
  expect(oldCapture.afterActors).not.toHaveProperty('state');expect(readState).not.toHaveBeenCalled();
  expect(replacementCapture).toEqual({actorStage:'pending',afterActors:null,endedAt:null});
 });

 for(const boundary of ['beforeGun','afterGun'] as const)it(`preserves a reentrant new life's clock when registration changes in ${boundary}`,()=>{
  const {game}=client();const before=vi.fn(),after=vi.fn();
  const newLife=()=>{game.killPlayer();game.resetOriginalActorDispatch();game.phase='playing';game.playerAlive=true;
   game.elapsed=42;game.nextSourceReloadPoll=43;};
  if(boundary==='beforeGun')before.mockImplementation(newLife);else after.mockImplementation(newLife);
  game.updateSourceWeaponInput(before,after);
  expect(before).toHaveBeenCalledOnce();expect(after).toHaveBeenCalledTimes(boundary==='beforeGun'?0:1);
  expect(game.originalActorDispatchGeneration).toBe(2);expect(game.phase).toBe('playing');
  expect(game.elapsed).toBe(42);expect(game.nextSourceReloadPoll).toBe(43);
  expect(game.advanceSourceScope).not.toHaveBeenCalled();
 });

 it('stops source accumulator catch-up after the first callback ends the life',()=>{
  const {game}=client();game.updateOriginalExplosives=vi.fn(()=>game.killPlayer());
  game.updateProjectiles(.2);
  expect(game.updateOriginalExplosives).toHaveBeenCalledOnce();expect(game.updateAuthoredProjectiles).not.toHaveBeenCalled();
  expect(game.phase).toBe('lost');
 });

 it('stops the dead-player source accumulator after one transition callback',()=>{
  const {game}=client();game.playerAlive=false;
  game.updateOriginalPlayerCallback=vi.fn(()=>game.endRound(false));game.updateOriginalExplosives=vi.fn();
  game.advanceGameplayFrame(.2);
  expect(game.updateOriginalPlayerCallback).toHaveBeenCalledOnce();expect(game.updateOriginalExplosives).not.toHaveBeenCalled();
  expect(game.updateAuthoredProjectiles).not.toHaveBeenCalled();expect(game.phase).toBe('lost');
 });

 it('suspends ordinary paused dispatch without invalidating its registration generation',()=>{
  const {game}=client(),before=vi.fn(),after=vi.fn();game.elapsed=0;game.phase='paused';
  game.updateSourceWeaponInput(before,after);expect(before).not.toHaveBeenCalled();expect(game.originalActorDispatchGeneration).toBe(0);
  game.phase='playing';game.updateSourceWeaponInput(before,after);
  expect(before).toHaveBeenCalledOnce();expect(after).toHaveBeenCalledOnce();expect(game.originalActorDispatchGeneration).toBe(0);
 });
});
