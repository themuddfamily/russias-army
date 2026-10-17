import {describe,it,expect,vi} from 'vitest';
import * as THREE from 'three';
import {presentationFixture} from './originalSoloLoadedScenePresentation.fixture';
import {originalPlayerEye} from '../shared/originalPlayerPhysics';

const cycle=(f:ReturnType<typeof presentationFixture>,time:number)=>{f.prepare(time);f.worlds.completeGoody(time);f.game.completeSoloActors();};
function ready(f:ReturnType<typeof presentationFixture>,weapon:'shotgun'|'launcher'|'rpg'){
 f.game.keys.add(weapon==='shotgun'?'Digit2':weapon==='launcher'?'Digit4':'Digit5');cycle(f,0);f.game.keys.clear();
 for(let n=1;n<=45;n++)cycle(f,n/30);
 f.game.deaths=0;f.game.velocity=new THREE.Vector3();f.game.shots=11;f.game.hits=4;
}

// Complete decoded maps, all real banks, sealed launch batch and Game's actual
// consumers/killPlayer/teardown. Receipt bang timing and the final UI sink are
// explicit CPU seams. This does not establish native Director frame scheduling.
describe('declared retained-goody terminal delivery through complete Solo scenes',()=>{
 it.each([
  ['barrack','shotgun'],['woodlands','shotgun'],['barrack','launcher'],['woodlands','launcher'],['barrack','rpg'],['woodlands','rpg'],
 ] as const)('%s %s preserves full gun and launch commit before Game ends the life', (map,weapon)=>{
  const f=presentationFixture(map,{gameStartupResources:true,terminalGoodyPolicy:'retain-until-current-commit'});let failure:{mockRestore():void}|undefined;
  try{
   ready(f,weapon);const banks=f.owners.get('player')!.banks;if(!('loadoutWorld' in banks))throw Error('Missing human banks');
   const prior=banks.loadoutWorld.freeze(),oldLocal=banks.localWeaponWorld.freeze(),oldProjectiles=banks.projectileWorld.freeze(),oldFX=f.player.transientState,oldCallback=f.player.callback;
   let committed:undefined|{loadout:ReturnType<typeof banks.loadoutWorld.freeze>;local:ReturnType<typeof banks.localWeaponWorld.freeze>;projectiles:ReturnType<typeof banks.projectileWorld.freeze>;gunPhase:typeof f.player.gunPhase;physicalIds:string[];peerIds:string[][];events:string[]};
   f.game.endRound=vi.fn(()=>{
    committed={loadout:banks.loadoutWorld.freeze(),local:banks.localWeaponWorld.freeze(),projectiles:banks.projectileWorld.freeze(),gunPhase:f.player.gunPhase,physicalIds:[...f.player.projectiles.keys()],peerIds:[...f.worlds.worlds.values()].filter(w=>w.id!=='player').map(w=>[...w.projectiles.keys()]),events:f.events.slice(begin).filter(e=>e.recipientId==='player').map(e=>e.kind)};
    expect(f.player.alive).toBe(false);expect(f.player.callback).toBe(oldCallback+1);
    expect(f.game.soloReceiverTransients.presentation.freeze()).toBe(f.player.transientState);
    f.game.phase='ended';f.game.disposeSoloWorlds(true);
   });
   f.game.firing=true;const begin=f.events.length,time=46/30;
   f.barrelBirths.push({kind:'transient-birth',event:{kind:'bang',id:'declared-terminal-receipt',type:'barrel',position:originalPlayerEye(f.player.body)}});
   f.prepare(time);f.player.health.canonical=0;
   failure=vi.spyOn(f.b.mirror,'prepareSynchronousDelivery').mockImplementationOnce(()=>{throw Error('terminal late peer');});
   expect(()=>f.worlds.completeGoody(time)).toThrow('terminal late peer');failure.mockRestore();failure=undefined;
   expect(f.player.alive).toBe(true);expect(f.player.health.canonical).toBe(0);expect(f.player.callback).toBe(oldCallback);expect(f.player.projectiles.size).toBe(0);expect(f.events).toHaveLength(begin);
   expect(banks.loadoutWorld.freeze()).toEqual(prior);expect(banks.localWeaponWorld.freeze()).toEqual(oldLocal);expect(banks.projectileWorld.freeze()).toEqual(oldProjectiles);expect(f.player.transientState).toBe(oldFX);expect(f.game.endRound).not.toHaveBeenCalled();
   const samples=f.humanReads.random3,reads=f.humanReads.programs,shots=[...f.humanShots],program=f.programs.get('player')!.at(-1);
   f.game.firing=false;f.worlds.completeGoody(time);
   expect(f.game.endRound).toHaveBeenCalledOnce();expect(committed).toBeDefined();expect(committed!.loadout.ammo[weapon]).toBe(prior.ammo[weapon]-1);
   expect(committed!.local.prefix.callback).toBe(oldCallback+1);expect(committed!.gunPhase?.prefix.callback).toBe(oldCallback+1);
   expect(f.humanReads.random3).toBe(samples);expect(f.humanReads.programs).toBe(reads);expect(f.humanShots).toEqual(shots);expect(f.programs.get('player')!.at(-1)).toBe(program);
   if(weapon==='shotgun'){
    expect(shots).toHaveLength(2);expect(committed!.physicalIds).toEqual([]);
   }else{
    expect(committed!.physicalIds).toHaveLength(1);expect(committed!.projectiles.actors.map(a=>a.launchId)).toEqual(committed!.physicalIds);
    for(const ids of committed!.peerIds)expect(ids).toEqual(committed!.physicalIds);
   }
   const kinds=committed!.events;for(const kind of ['loadout-state','gun-phase-state','gun-output','dead'])expect(kinds.indexOf(kind)).toBeGreaterThanOrEqual(0);
   expect(kinds.indexOf('loadout-state')).toBeLessThan(kinds.indexOf('dead'));expect(kinds.indexOf('gun-phase-state')).toBeLessThan(kinds.indexOf('dead'));expect(kinds.indexOf('gun-output')).toBeLessThan(kinds.indexOf('dead'));
   expect(f.game.shots).toBe(11);expect(f.game.hits).toBe(4);expect(f.game.deaths).toBe(1);expect(f.game.playerAlive).toBe(false);expect(f.game.soloWorlds).toBeUndefined();expect(f.worlds.worlds.size).toBe(0);
   expect(f.game.soloReceiverTransients.frozen).toBe(true);expect(f.player.health.canonical).toBe(-5);
  }finally{failure?.mockRestore();f.dispose();}
 });
});
