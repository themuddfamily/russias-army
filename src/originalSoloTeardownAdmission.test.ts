import {describe,expect,it,vi} from 'vitest';
import {Game} from './game';

function gate(){let resolve!:()=>void;const promise=new Promise<void>(done=>{resolve=done;});return {promise,resolve};}
function fixture(){
 const drain=gate(),clear=gate(),order:string[]=[];
 const worlds={currentAwaiting:true,worlds:new Map(),cancelAndDrainCurrent:vi.fn(()=>{order.push('drain');return drain.promise;}),
  clearAsync:vi.fn(()=>{order.push('clear-async');return clear.promise;}),clear:vi.fn(),resume:vi.fn()};
 const capture={actorStage:'pending'},pending={actorObservation:{record:capture}};
 const enemy={group:{},releaseCommittedSourceRig:vi.fn(),dispose:vi.fn(()=>order.push('enemy'))};
 const game=Object.assign(Object.create(Game.prototype),{soloWorlds:worlds,soloPendingGameplayFrame:pending,
  sourceCallbackCaptureCurrent:capture,soloHumanCallbackInput:{captured:true},enemies:[enemy],scene:{remove:vi.fn()},
  soloLoadedSceneFactory:{release:vi.fn(()=>order.push('factory'))},soloStartupResources:{release:vi.fn(()=>order.push('startup'))},
  soloReceiverTransients:{frozen:false,presentation:{dispose:vi.fn(()=>order.push('transients'))}},
  soloReceiverModels:{frozen:false,presentation:{dispose:vi.fn(()=>order.push('models'))}},
  soloLocalWeaponPresentation:{frozen:false,adapter:{release:vi.fn(()=>order.push('local'))}},
  soloProjectilePresentation:{frozen:false,adapter:{dispose:vi.fn(()=>order.push('projectiles'))}},
  soloCorpses:new Map(),soloDetachedFlashes:[],projectiles:[],originalBlasts:[],
  isSourceSolo:vi.fn(()=>true),playerAlive:true,phase:'playing',archivalWinter:false,
  flushOriginalReconciliation:vi.fn(),collectPickups:vi.fn(),advanceOriginalMuzzleFlashes:vi.fn(),nextSourceReloadPoll:3,elapsed:10}) as any;
 return {game,worlds,drain,clear,order,capture,pending,enemy};
}

describe('Game owns awaited Solo teardown',()=>{
 it('coalesces requests and retains frame, world and resources through both awaits',async()=>{
  const f=fixture(),work=f.game.disposeSoloWorlds();
  expect(f.game.disposeSoloWorlds()).toBe(work);expect(f.worlds.cancelAndDrainCurrent).toHaveBeenCalledTimes(1);
  expect(f.game.soloWorlds).toBe(f.worlds);expect(f.game.soloPendingGameplayFrame).toBe(f.pending);
  expect(f.order).toEqual(['drain']);f.drain.resolve();await Promise.resolve();
  expect(f.order).toEqual(['drain','clear-async']);expect(f.capture.actorStage).toBe('pending');
  f.clear.resolve();await work;
  expect(f.order).toEqual(['drain','clear-async','transients','models','local','projectiles','factory','startup']);
  expect(f.worlds.clear).not.toHaveBeenCalled();expect(f.game.soloWorlds).toBeUndefined();
  expect(f.game.soloPendingGameplayFrame).toBeUndefined();expect(f.capture.actorStage).toBe('cancelled-gameover');
 });
 it('keeps Enemy resources until world cleanup succeeds',async()=>{
  const f=fixture();f.game.clearEnemies();f.game.clearEnemies();
  const work=f.game.soloTeardown.work;expect(f.game.enemies).toEqual([f.enemy]);expect(f.enemy.dispose).not.toHaveBeenCalled();
  f.drain.resolve();f.clear.resolve();await work;
  expect(f.game.enemies).toEqual([]);expect(f.enemy.dispose).toHaveBeenCalledTimes(1);
  expect(f.order.indexOf('enemy')).toBeGreaterThan(f.order.indexOf('startup'));
 });
 it('records failed storage cleanup, retains admission and permits an explicit retry',async()=>{
  const f=fixture(),error=new Error('lease cleanup failed'),logging=vi.spyOn(console,'error').mockImplementation(()=>{});
  try{
   f.worlds.clearAsync.mockRejectedValueOnce(error);const first=f.game.disposeSoloWorlds();f.drain.resolve();
   await expect(first).rejects.toBe(error);
   expect(f.game.soloTeardownFailure).toBe(error);expect(f.game.soloWorlds).toBe(f.worlds);
   expect(f.game.soloPendingGameplayFrame).toBe(f.pending);expect(f.order).toEqual(['drain']);
   f.worlds.currentAwaiting=false;f.game.updateSourceWeaponInput();f.game.advanceGameplayFrame(1);f.game.advancePlayingPopulation(1);
   expect(f.game.advanceOriginalMuzzleFlashes).not.toHaveBeenCalled();expect(f.game.flushOriginalReconciliation).not.toHaveBeenCalled();expect(f.game.collectPickups).not.toHaveBeenCalled();
   const retry=f.game.disposeSoloWorlds();f.clear.resolve();await retry;
   expect(f.game.soloTeardown).toBeUndefined();expect(f.game.soloTeardownFailure).toBeUndefined();
   expect(f.game.soloWorlds).toBeUndefined();expect(f.game.soloLoadedSceneFactory).toBeUndefined();
  }finally{logging.mockRestore();}
 });
 it('retries a failed resource release without releasing already completed owners again',async()=>{
  const f=fixture(),release=f.game.soloLoadedSceneFactory.release,error=new Error('factory close'),logging=vi.spyOn(console,'error').mockImplementation(()=>{});
  try{
   release.mockImplementationOnce(()=>{throw error;});const first=f.game.disposeSoloWorlds();f.drain.resolve();f.clear.resolve();
   await expect(first).rejects.toThrow('Solo presentation teardown failed');
   expect(f.game.soloLoadedSceneFactory).toBeDefined();expect(f.game.soloStartupResources).toBeUndefined();
   expect(f.game.soloWorlds).toBe(f.worlds);expect(f.game.soloPendingGameplayFrame).toBe(f.pending);
   await f.game.disposeSoloWorlds();expect(release).toHaveBeenCalledTimes(2);
   expect(f.order.filter(value=>value==='transients')).toHaveLength(1);expect(f.order.filter(value=>value==='startup')).toHaveLength(1);
  }finally{logging.mockRestore();}
 });
 it('freezes preserved presentation only after drain and clear complete',async()=>{
  const f=fixture(),models=f.game.soloReceiverModels,startup=f.game.soloStartupResources,work=f.game.disposeSoloWorlds(true);
  expect(models.frozen).toBe(false);f.drain.resolve();await Promise.resolve();expect(models.frozen).toBe(false);
  f.clear.resolve();await work;expect(models.frozen).toBe(true);expect(models.presentation.dispose).not.toHaveBeenCalled();
  expect(f.game.soloStartupResources).toBe(startup);expect(startup.release).not.toHaveBeenCalled();
 });
 it('parks round startup before any reset and resumes its one coalesced request',async()=>{
  const f=fixture();f.game.beginRound();f.game.beginRound();
  expect(f.game.soloTeardownActions.size).toBe(1);expect(f.game.ensureSoloWorlds()).toBeUndefined();
  expect(f.game.isSourceSolo).not.toHaveBeenCalled();
  const resumed=vi.fn();f.game.beginRound=resumed;const work=f.game.soloTeardown.work;
  f.drain.resolve();f.clear.resolve();await work;expect(resumed).toHaveBeenCalledTimes(1);
 });
 it('keeps idle default teardown synchronous',()=>{
  const f=fixture();f.worlds.currentAwaiting=false;
  expect(f.game.disposeSoloWorlds()).toBeUndefined();expect(f.worlds.clear).toHaveBeenCalledTimes(1);
  expect(f.worlds.cancelAndDrainCurrent).not.toHaveBeenCalled();expect(f.game.soloWorlds).toBeUndefined();
 });
 it('uses awaited clear even for idle worlds when asynchronous teardown is explicitly requested',async()=>{
  const f=fixture();f.worlds.currentAwaiting=false;const work=f.game.disposeSoloWorldsAsync();
  expect(f.game.soloWorlds).toBe(f.worlds);expect(f.worlds.clear).not.toHaveBeenCalled();
  f.drain.resolve();f.clear.resolve();await work;
  expect(f.worlds.clearAsync).toHaveBeenCalledTimes(1);expect(f.worlds.clear).not.toHaveBeenCalled();
  expect(f.game.soloWorlds).toBeUndefined();
 });
 it.each(['storage','teardown'])('holds paused resume clocks and camera while %s is pending',kind=>{
  const f=fixture(),up=vi.fn(),projection=vi.fn(),viewProjection=vi.fn(),shift=vi.fn(),resume=vi.fn();
  f.game.phase='paused';f.game.registeredReferenceAspect=1.7;f.game.pauseStarted=2;
  f.game.camera={aspect:1.7,up:{set:up},updateProjectionMatrix:projection};
  f.game.viewCamera={aspect:1.7,updateProjectionMatrix:viewProjection};f.game.shiftDeadlines=shift;
  f.worlds.resume=resume;
  if(kind==='teardown'){f.worlds.currentAwaiting=false;f.game.soloTeardown={worlds:f.worlds,preservePresentation:false};}
  f.game.resume();
  expect(f.game.phase).toBe('paused');expect(f.game.elapsed).toBe(10);expect(f.game.pauseStarted).toBe(2);
  expect(f.game.registeredReferenceAspect).toBe(1.7);expect(f.game.camera.aspect).toBe(1.7);expect(f.game.viewCamera.aspect).toBe(1.7);
  for(const operation of [up,projection,viewProjection,shift,resume])expect(operation).not.toHaveBeenCalled();
 });
});
