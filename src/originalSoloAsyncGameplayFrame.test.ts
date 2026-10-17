import {describe,expect,it,vi} from 'vitest';
import {Game} from './game';

function gate(){let resolve!:()=>void,reject!:(error:unknown)=>void;const promise=new Promise<void>((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};}
/** Actual Game method paths with declared coordinator IO. This does not prove
 * IndexedDB publication, native physics, rendering or full default startup. */
function fixture(){
 const writes:ReturnType<typeof gate>[]=[],secondStarted=gate();
 const human={yaw:0,weapon:'launcher'},worlds={worlds:new Map([['player',human]]),callbackPhase:'physics',currentAwaiting:false,
  completeExternalGoody:vi.fn(),goody:vi.fn(),completeGoody:vi.fn(),
  completeGoodyAsync:vi.fn((_time:number,_cohort:unknown)=>{
   const write=gate();writes.push(write);if(writes.length===2)secondStarted.resolve();worlds.currentAwaiting=true;
   return write.promise.then(()=>{worlds.currentAwaiting=false;worlds.callbackPhase='goody';},error=>{worlds.currentAwaiting=false;throw error;});
  }),cancelAndDrainCurrent:vi.fn(async()=>{worlds.currentAwaiting=false;}),freeze:vi.fn()};
 const pending={worlds,generation:7,time:4.25,activeProjectiles:Object.freeze([]),stage:'delivery'} as any;
 const mirrorTimes:number[]=[],presentationTimes:number[]=[];
 const game=Object.assign(Object.create(Game.prototype),{soloWorlds:worlds,soloLoadedSceneFactory:{},
  soloCurrentCohortAt:vi.fn(()=>({})),soloPendingGameplayFrame:pending,
  originalActorDispatchGeneration:7,phase:'playing',playerAlive:true,archivalWinter:false,
  mode:'solo',elapsed:pending.time,yaw:.5,weaponState:{current:'launcher'},enemies:[],nextSourceReloadPoll:4.25,
  originalActorDispatchActive:(generation:number)=>game.phase==='playing'&&generation===game.originalActorDispatchGeneration,
  syncSoloMirrors:vi.fn(()=>mirrorTimes.push(game.elapsed)),advanceSourceWeaponPresentation:vi.fn(()=>presentationTimes.push(game.elapsed)),
  updateOriginalExplosives:vi.fn(()=>{worlds.callbackPhase='idle';}),finishSoloActors:vi.fn(),updateAuthoredProjectiles:vi.fn(),
  advanceCommittedSoloGunScope:vi.fn(()=>false),advanceSourceScope:vi.fn(),flushOriginalReconciliation:vi.fn(),
  advanceOriginalMuzzleFlashes:vi.fn(),updateOriginalPlayerCallback:vi.fn(),beginSoloCallback:vi.fn(),
  isSourceSolo:vi.fn(()=>true),collectPickups:vi.fn()}) as any;
 return {game,worlds,pending,writes,secondStarted,human,mirrorTimes,presentationTimes};
}
async function settle(pending:any){const work=pending.deliveryWork;if(work)await work.catch(()=>{});await Promise.resolve();}

describe('Game retains a frame across asynchronous CURRENT delivery',()=>{
 it('holds CURRENT without collecting goody or capturing another frame',async()=>{
  const f=fixture();f.game.completeSoloGoody();
  expect(f.worlds.completeExternalGoody).toHaveBeenCalledTimes(1);expect(f.worlds.completeGoodyAsync).toHaveBeenCalledTimes(1);
  expect(f.game.soloPendingGameplayFrame).toBe(f.pending);expect(f.pending.stage).toBe('delivery');
  f.game.resumeSoloGameplayFrame();f.game.completeSoloGoody();
  expect(f.worlds.completeExternalGoody).toHaveBeenCalledTimes(1);expect(f.worlds.completeGoodyAsync).toHaveBeenCalledTimes(1);
  expect(f.game.syncSoloMirrors).not.toHaveBeenCalled();expect(f.game.advanceSourceWeaponPresentation).not.toHaveBeenCalled();
  f.writes[0].resolve();await settle(f.pending);
 });
 it('resumes mirrors and presentation once at the captured callback time',async()=>{
  const f=fixture();f.game.completeSoloGoody();f.game.elapsed=20;
  f.writes[0].resolve();await settle(f.pending);f.game.resumeSoloGameplayFrame();f.game.resumeSoloGameplayFrame();
  expect(f.mirrorTimes).toEqual([4.25]);expect(f.presentationTimes).toEqual([4.25]);
  expect(f.game.elapsed).toBe(20);expect(f.game.soloPendingGameplayFrame).toBeUndefined();
  expect(f.worlds.completeGoodyAsync).toHaveBeenCalledTimes(1);expect(f.worlds.completeGoody).not.toHaveBeenCalled();
  expect(f.game.updateOriginalExplosives).toHaveBeenCalledTimes(1);expect(f.game.advanceSourceScope).toHaveBeenCalledTimes(1);
 });
 it('retains a failed preparation and retries the same frame without repeating goody or physics',async()=>{
  const f=fixture(),error=new Error('declared prepublication failure');f.game.completeSoloGoody();
  f.writes[0].reject(error);await settle(f.pending);
  expect(f.game.soloPendingGameplayFrame).toBe(f.pending);expect(f.pending.stage).toBe('delivery');
  expect(f.game.syncSoloMirrors).not.toHaveBeenCalled();
  const before=vi.fn(),after=vi.fn();f.game.updateSourceWeaponInput(before,after);f.game.advanceGameplayFrame(1);
  expect(before).not.toHaveBeenCalled();expect(after).not.toHaveBeenCalled();expect(f.game.advanceOriginalMuzzleFlashes).not.toHaveBeenCalled();
  expect(f.game.updateOriginalPlayerCallback).not.toHaveBeenCalled();expect(f.game.nextSourceReloadPoll).toBe(4.25);
  expect(f.game.soloCurrentError).toBe(error);f.game.resumeSoloGameplayFrame();
  expect(f.worlds.completeGoodyAsync).toHaveBeenCalledTimes(1);
  const retry=f.game.retrySoloCurrentAsync();await f.secondStarted.promise;expect(f.worlds.completeGoodyAsync).toHaveBeenCalledTimes(2);
  expect(f.worlds.completeExternalGoody).toHaveBeenCalledTimes(1);expect(f.game.updateOriginalPlayerCallback).not.toHaveBeenCalled();
  expect(f.game.soloPendingGameplayFrame).toBe(f.pending);
  f.writes[1].resolve();await retry;f.game.resumeSoloGameplayFrame();
  expect(f.mirrorTimes).toEqual([4.25]);expect(f.game.updateOriginalExplosives).toHaveBeenCalledTimes(1);
 });
 it('drains committed cleanup instead of replaying the published CURRENT',async()=>{
  const f=fixture();f.game.completeSoloGoody();f.worlds.callbackPhase='goody';
  f.writes[0].reject(new Error('declared postpublication dispatch failure'));await settle(f.pending);
  await f.game.retrySoloCurrentAsync();f.game.resumeSoloGameplayFrame();
  expect(f.worlds.cancelAndDrainCurrent).toHaveBeenCalledTimes(1);
  expect(f.worlds.completeGoodyAsync).toHaveBeenCalledTimes(1);expect(f.worlds.completeGoody).not.toHaveBeenCalled();
  expect(f.worlds.completeExternalGoody).toHaveBeenCalledTimes(1);expect(f.mirrorTimes).toEqual([4.25]);
 });
 it('suppresses presentation from a finished write when teardown owns the frame',async()=>{
  const f=fixture();f.game.completeSoloGoody();f.game.soloTeardown={worlds:f.worlds,preservePresentation:false};
  f.writes[0].resolve();await settle(f.pending);f.game.resumeSoloGameplayFrame();
  expect(f.game.syncSoloMirrors).not.toHaveBeenCalled();expect(f.game.advanceSourceWeaponPresentation).not.toHaveBeenCalled();
  expect(f.game.updateOriginalExplosives).not.toHaveBeenCalled();expect(f.game.soloPendingGameplayFrame).toBe(f.pending);
 });
 it('blocks the next gun poll and body admission without changing clocks',async()=>{
  const f=fixture(),before=vi.fn(),after=vi.fn();f.game.completeSoloGoody();
  f.game.updateSourceWeaponInput(before,after);f.game.advanceGameplayFrame(1);
  expect(f.game.elapsed).toBe(4.25);expect(f.game.nextSourceReloadPoll).toBe(4.25);
  expect(before).not.toHaveBeenCalled();expect(after).not.toHaveBeenCalled();expect(f.game.advanceOriginalMuzzleFlashes).not.toHaveBeenCalled();
  expect(f.game.updateOriginalPlayerCallback).not.toHaveBeenCalled();expect(f.game.flushOriginalReconciliation).not.toHaveBeenCalled();
  f.writes[0].resolve();await settle(f.pending);
 });
 it('coalesces retry requests onto live delivery without draining or capturing another cohort',async()=>{
  const f=fixture();f.game.completeSoloGoody();const first=f.game.retrySoloCurrentAsync(),second=f.game.retrySoloCurrentAsync();
  expect(f.worlds.completeGoodyAsync).toHaveBeenCalledTimes(1);expect(f.game.soloCurrentCohortAt).toHaveBeenCalledTimes(1);
  expect(f.worlds.cancelAndDrainCurrent).not.toHaveBeenCalled();
  f.writes[0].resolve();await Promise.all([first,second]);
  expect(f.mirrorTimes).toEqual([4.25]);expect(f.worlds.completeExternalGoody).toHaveBeenCalledTimes(1);
 });
 it('does not repeat a partially applied mirror callback after presentation throws',async()=>{
  const f=fixture(),error=new Error('declared mirror sink failure');let advances=0;
  f.game.syncSoloMirrors.mockImplementation(()=>{advances++;throw error;});
  f.game.completeSoloGoody();f.writes[0].resolve();await settle(f.pending);
  expect(f.game.soloCurrentError).toBe(error);expect(advances).toBe(1);expect(f.pending.stage).toBe('presentation');
  f.game.resumeSoloGameplayFrame();expect(f.game.advanceSourceWeaponPresentation).not.toHaveBeenCalled();
  await f.game.retrySoloCurrentAsync();f.game.resumeSoloGameplayFrame();
  expect(advances).toBe(1);expect(f.game.syncSoloMirrors).toHaveBeenCalledTimes(1);
  expect(f.worlds.completeGoodyAsync).toHaveBeenCalledTimes(1);expect(f.worlds.cancelAndDrainCurrent).toHaveBeenCalledTimes(1);
  expect(f.presentationTimes).toEqual([4.25]);expect(f.game.updateOriginalExplosives).toHaveBeenCalledTimes(1);
  expect(f.game.soloPendingGameplayFrame).toBeUndefined();
 });
 it.each(['paused','generation','dead'])('rejects retry for %s before creating a cohort or draining ownership',async change=>{
  const f=fixture(),error=new Error('declared preparation failure');f.game.completeSoloGoody();f.writes[0].reject(error);await settle(f.pending);
  if(change==='paused')f.game.phase='paused';else if(change==='generation')f.game.originalActorDispatchGeneration=8;else f.game.playerAlive=false;
  await expect(f.game.retrySoloCurrentAsync()).rejects.toThrow();
  expect(f.game.soloCurrentError).toBe(error);expect(f.game.soloPendingGameplayFrame).toBe(f.pending);
  expect(f.game.soloCurrentCohortAt).toHaveBeenCalledTimes(1);expect(f.worlds.completeGoodyAsync).toHaveBeenCalledTimes(1);
  expect(f.worlds.cancelAndDrainCurrent).not.toHaveBeenCalled();expect(f.game.syncSoloMirrors).not.toHaveBeenCalled();
 });
 it('rechecks generation after an awaited retry drain before creating another cohort',async()=>{
  const f=fixture(),drain=gate();f.game.completeSoloGoody();f.writes[0].reject(new Error('declared preparation failure'));await settle(f.pending);
  f.worlds.cancelAndDrainCurrent.mockImplementationOnce(()=>drain.promise);
  const retry=f.game.retrySoloCurrentAsync();f.game.originalActorDispatchGeneration=8;drain.resolve();
  await expect(retry).rejects.toThrow();
  expect(f.game.soloCurrentCohortAt).toHaveBeenCalledTimes(1);expect(f.worlds.completeGoodyAsync).toHaveBeenCalledTimes(1);
  expect(f.game.soloPendingGameplayFrame).toBe(f.pending);expect(f.game.syncSoloMirrors).not.toHaveBeenCalled();
 });
 it('holds pause before freezing the coordinator or changing captured callback clocks',async()=>{
  const f=fixture(),freeze=vi.fn();f.worlds.freeze=freeze;
  f.game.completeSoloGoody();f.game.pause();
  expect(f.game.phase).toBe('playing');expect(f.game.elapsed).toBe(4.25);expect(freeze).not.toHaveBeenCalled();
  f.writes[0].reject(new Error('declared preparation failure'));await settle(f.pending);f.game.pause();
  expect(f.game.phase).toBe('playing');expect(f.game.elapsed).toBe(4.25);expect(freeze).not.toHaveBeenCalled();
 });
});
