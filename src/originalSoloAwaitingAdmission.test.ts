import * as THREE from 'three';
import {describe,expect,it,vi} from 'vitest';
import {Game} from './game';
import {getLegacyMap} from '../shared/legacyMaps';

/** CPU prototype fixture exercises Game's actual admission methods. Rendering
 * and browser construction are excluded; animate calls this population method. */
function fixture(){
 const enemies=[{id:'alive',alive:true,update:vi.fn(),respawn:vi.fn()},
  {id:'dead',alive:false,deathTime:0,update:vi.fn(),respawn:vi.fn()}];
 const worlds={currentAwaiting:true,worlds:new Map(),register:vi.fn()};
 const game=Object.assign(Object.create(Game.prototype),{soloWorlds:worlds,mode:'solo',archivalWinter:false,
  phase:'playing',playerAlive:true,elapsed:10,nextSourceReloadPoll:3,originalActorDispatchGeneration:0,
  arena:{runtime:{}},camera:{position:new THREE.Vector3()},enemies,
  originalActorDispatchActive:vi.fn(()=>true),advanceOriginalMuzzleFlashes:vi.fn(),
  flushOriginalReconciliation:vi.fn(),resumeSoloGameplayFrame:vi.fn(),updateOriginalPlayerCallback:vi.fn(),
  collectPickups:vi.fn(),updatePlayerRespawn:vi.fn(),updateWeaponDrops:vi.fn(),
  isSourceSolo:vi.fn(()=>true),soloEnemyDecisionContext:vi.fn(),
  chooseCombatTarget:vi.fn(()=>({position:new THREE.Vector3()})),combatantShoot:vi.fn(),
  safestEnemySpawn:vi.fn(()=>new THREE.Vector3()),snowTracks:{resetActor:vi.fn()}}) as any;
 return {game,worlds,enemies};
}

describe('Game admissions while a Solo CURRENT cohort awaits storage',()=>{
 it('does not change gun clocks, muzzle actors or captured input while awaiting',()=>{
  const {game}=fixture(),before=vi.fn(),after=vi.fn();
  game.updateSourceWeaponInput(before,after);
  expect(game.elapsed).toBe(10);expect(game.nextSourceReloadPoll).toBe(3);
  expect(game.advanceOriginalMuzzleFlashes).not.toHaveBeenCalled();
  expect(before).not.toHaveBeenCalled();expect(after).not.toHaveBeenCalled();
  expect(game.originalActorDispatchActive).not.toHaveBeenCalled();
 });
 it('rejects frame admission before reconciliation, pending-frame resume or body work',()=>{
  const {game}=fixture();game.advanceGameplayFrame(1);
  expect(game.flushOriginalReconciliation).not.toHaveBeenCalled();
  expect(game.resumeSoloGameplayFrame).not.toHaveBeenCalled();
  expect(game.updateOriginalPlayerCallback).not.toHaveBeenCalled();
  expect(game.elapsed).toBe(10);expect(game.nextSourceReloadPoll).toBe(3);
 });
 it('stops the gun loop when beforeGun admits an asynchronous cohort',()=>{
  const {game,worlds}=fixture();worlds.currentAwaiting=false;game.nextSourceReloadPoll=10;
  const before=vi.fn(()=>{worlds.currentAwaiting=true;}),after=vi.fn();
  game.updateSourceWeaponInput(before,after);
  expect(before).toHaveBeenCalledTimes(1);expect(game.advanceOriginalMuzzleFlashes).toHaveBeenCalledTimes(1);
  expect(after).not.toHaveBeenCalled();expect(game.resumeSoloGameplayFrame).not.toHaveBeenCalled();
  expect(game.nextSourceReloadPoll).toBe(10+1/30);expect(game.elapsed).toBe(10);
 });
 it('holds pickups, player respawn and Enemy work, then admits them when storage settles',()=>{
  const {game,worlds,enemies}=fixture();game.advancePlayingPopulation(1/30);
  game.playerAlive=false;game.advancePlayingPopulation(1/30);
  expect(game.collectPickups).not.toHaveBeenCalled();expect(game.updatePlayerRespawn).not.toHaveBeenCalled();
  expect(game.soloEnemyDecisionContext).not.toHaveBeenCalled();
  for(const enemy of enemies){expect(enemy.update).not.toHaveBeenCalled();expect(enemy.respawn).not.toHaveBeenCalled();}
  worlds.currentAwaiting=false;game.playerAlive=true;game.registerSoloEnemy=vi.fn();game.advancePlayingPopulation(1/30);
  expect(game.collectPickups).toHaveBeenCalledTimes(1);
  for(const enemy of enemies)expect(enemy.update).toHaveBeenCalledTimes(1);
  expect(enemies[1].respawn).toHaveBeenCalledTimes(1);expect(game.registerSoloEnemy).toHaveBeenCalledWith(enemies[1]);
  game.playerAlive=false;game.advancePlayingPopulation(1/30);expect(game.updatePlayerRespawn).toHaveBeenCalledTimes(1);
 });
 it('does not register or mutate an Enemy while storage awaits',()=>{
  const {game,worlds}=fixture(),clear=vi.fn(),enemy={id:'new',sourceTargets:{clear},combatTarget:'prior'};
  game.registerSoloEnemy(enemy);
  expect(worlds.register).not.toHaveBeenCalled();expect(clear).not.toHaveBeenCalled();expect(enemy.combatTarget).toBe('prior');
 });
 it('does not admit the next Enemy when the first Enemy turn starts awaiting',()=>{
  const {game,worlds,enemies}=fixture();worlds.currentAwaiting=false;
  enemies[0].update.mockImplementation(()=>{worlds.currentAwaiting=true;});
  game.advancePlayingPopulation(1/30);
  expect(enemies[0].update).toHaveBeenCalledTimes(1);
  expect(enemies[1].update).not.toHaveBeenCalled();expect(enemies[1].respawn).not.toHaveBeenCalled();
  expect(game.soloEnemyDecisionContext).toHaveBeenCalledTimes(1);
 });
 it.each(['collectPickups','updatePlayerRespawn'])('stops remaining population admissions when %s starts awaiting',method=>{
  const {game,worlds,enemies}=fixture();worlds.currentAwaiting=false;
  game.playerAlive=method==='collectPickups';game.isSourceSolo.mockReturnValue(false);
  game[method].mockImplementation(()=>{worlds.currentAwaiting=true;});
  game.advancePlayingPopulation(1/30);
  expect(game[method]).toHaveBeenCalledTimes(1);expect(game.updateWeaponDrops).not.toHaveBeenCalled();
  for(const enemy of enemies)expect(enemy.update).not.toHaveBeenCalled();
 });
 it('holds legacy pickup respawn while continuing its mesh presentation',()=>{
  const {game,worlds}=fixture(),spec=getLegacyMap('barrack').pickups[0],mesh=new THREE.Mesh();
  mesh.userData.pickupId=spec.id;mesh.visible=false;game.mapId='barrack';
  const pickup={active:false,respawnAt:0,mesh};game.arena.pickups=[pickup];
  game.updateLegacyPickups(10);expect(pickup.active).toBe(false);expect(mesh.visible).toBe(false);
  expect(mesh.rotation.y).toBe(6.5);
  worlds.currentAwaiting=false;game.updateLegacyPickups(10);expect(pickup.active).toBe(true);expect(mesh.visible).toBe(true);
 });
});
