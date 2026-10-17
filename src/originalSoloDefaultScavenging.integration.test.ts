// Retained legacy inline CPU characterization; excludes normal paged default startup.
import {describe,expect,it,vi} from 'vitest';
import {startup,prepare,cycle} from './originalSoloDefaultStartup.fixture';
import {originalPlayerEye} from '../shared/originalPlayerPhysics';

const maps=['barrack','woodlands'] as const;

// Actual legacy inline CPU Game factory, decoded complete maps and coordinator death
// receipts create the dropped gun. Moving the persistent human body is an
// explicit test checkpoint; the external solver is skipped, not substituted
// with fake pickup, bank, callback program or publication data.
describe('legacy inline CPU Solo source dropped-gun scavenging',()=>{
 it.each(maps)('%s collects the actual RPG drop once after a failed joint publication',map=>{
  const f=startup(map);let failure:{mockRestore():void}|undefined;
  try{
   const worlds=f.game.ensureSoloWorlds(),human=worlds.worlds.get('player')!;
   const dead=worlds.register({id:'drop-owner',name:'Drop Owner',eye:{x:1100,y:1000,z:0}});dead.weapon='rpg';
   const survivor=worlds.register({id:'survivor',name:'Survivor',eye:{x:1500,y:1000,z:0}});survivor.weapon='launcher';
   cycle(f.game,worlds,0);
   expect(human.modelState!.actors.map((actor:any)=>actor.actorId)).toEqual(['drop-owner','survivor']);
   worlds.dispose('drop-owner');cycle(f.game,worlds,1/30);
   expect(worlds.worlds.has('drop-owner')).toBe(false);expect(human.modelState!.actors.map((actor:any)=>actor.actorId)).toEqual(['survivor']);
   expect(human.modelState!.pickups).toHaveLength(1);
   const pickup=human.modelState!.pickups[0];expect(pickup.weapon).toBe('rpg');
   const drop=f.game.soloReceiverPickupBindings[0].model,modelOwner=f.game.soloReceiverModels.presentation;
   expect(drop).toBe(modelOwner.readGun(pickup.handle));expect(drop.parent).toBe(f.scene);expect(drop.visible).toBe(true);
   f.game.camera.position.copy(pickup.position);f.game.checkpointSoloHumanBody();
   const eye=originalPlayerEye(human.body);for(const axis of ['x','y','z'] as const)expect(eye[axis]).toBeCloseTo(pickup.position[axis],12);
   const before=human.loadout!,registry=human.modelState,local=human.localWeapons,phase=human.gunPhase;
   f.game.playOriginalCombatSound.mockClear();f.game.appendChat.mockClear();
   prepare(f.game,worlds,2/30);
   failure=vi.spyOn(survivor.mirror,'prepareSynchronousDelivery').mockImplementationOnce(()=>{throw Error('scavenging late peer');});
   expect(()=>worlds.completeGoody(2/30)).toThrow('scavenging late peer');failure.mockRestore();failure=undefined;
   expect(human.loadout).toBe(before);expect(human.modelState).toBe(registry);expect(human.localWeapons).toBe(local);expect(human.gunPhase).toBe(phase);
   expect(f.game.soloReceiverPickupBindings[0].model).toBe(drop);expect(drop.visible).toBe(true);
   expect(f.game.playOriginalCombatSound).not.toHaveBeenCalled();expect(f.game.appendChat).not.toHaveBeenCalled();
   // Retry consumes the captured goody/pickup operation; live renderer movement
   // after failed preparation cannot erase the already captured collection.
   f.game.camera.position.x+=100;
   worlds.completeGoody(2/30);f.game.completeSoloActors();
   expect(human.loadout!.selected).toBe('launcher');expect(human.loadout!.reserve.rpg).toBe(before.reserve.rpg+12);
   expect(human.loadout!.ammo).toEqual(before.ammo);expect(human.loadout!.reserve.launcher).toBe(before.reserve.launcher);
   expect(human.loadout!.score).toBe(before.score+5);expect(human.loadout!.goldScore).toBeCloseTo(before.goldScore+5/7.2956438,12);
   expect(human.modelState!.pickups).toEqual([]);expect(f.game.soloReceiverPickupBindings).toEqual([]);expect(drop.visible).toBe(false);
   expect(modelOwner.readGun(pickup.handle)).toBe(drop);expect(human.modelState!.models.find((model:any)=>model.handle===pickup.handle)!.inWorld).toBe(false);
   expect(f.game.playOriginalCombatSound).toHaveBeenCalledExactlyOnceWith('rerg6',undefined,6);
   expect(f.game.appendChat).toHaveBeenCalledExactlyOnceWith('','Ammo for the rpg.','feedback');
   const collected=human.loadout!,reloadCounter=collected.counter;
   if(map==='woodlands')expect(reloadCounter.waitgun).toBe(30);else expect(reloadCounter.poldwaitgun).toBe(reloadCounter.waitgun+20);
   // The next real callback preserves the collected quantity/score and cannot
   // redispatch the removed source pickup actor's feedback or reload audio.
   cycle(f.game,worlds,3/30);
   expect(human.loadout!.reserve.rpg).toBe(collected.reserve.rpg);expect(human.loadout!.score).toBe(collected.score);
   expect(f.game.playOriginalCombatSound).toHaveBeenCalledOnce();expect(f.game.appendChat).toHaveBeenCalledOnce();
  }finally{failure?.mockRestore();f.dispose();}
 });

 it.each(maps)('%s applies held numeric selection and held reload through the actual legacy inline program',map=>{
  const f=startup(map);
  try{
   const worlds=f.game.ensureSoloWorlds(),human=worlds.worlds.get('player')!;
   cycle(f.game,worlds,0);f.game.keys.add('Digit6');cycle(f.game,worlds,1/30);f.game.keys.delete('Digit6');
   expect(human.loadout!.selected).toBe('sniper');expect(human.localWeapons!.selectedWeapon).toBe('sniper');
   expect(human.loadout!.ammo.sniper).toBe(30);expect(human.loadout!.refillTarget).toBe(28);
   f.game.playOriginalCombatSound.mockClear();f.game.keys.add('KeyR');cycle(f.game,worlds,2/30);
   expect(human.loadout!.selected).toBe('sniper');expect(human.loadout!.ammo.sniper).toBe(28);expect(human.loadout!.reserve.sniper).toBe(14);
   expect(f.game.playOriginalCombatSound).toHaveBeenCalledExactlyOnceWith('reak47',undefined,6);
   cycle(f.game,worlds,3/30);expect(human.loadout!.ammo.sniper).toBe(28);expect(human.loadout!.reserve.sniper).toBe(14);
   expect(f.game.playOriginalCombatSound).toHaveBeenCalledTimes(2);
  }finally{f.dispose();}
 });
});
