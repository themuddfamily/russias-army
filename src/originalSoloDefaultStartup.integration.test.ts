// Retained legacy inline CPU characterization; excludes normal paged default startup.
import * as THREE from 'three';
import {describe,expect,it,vi} from 'vitest';
import {startup,prepare,cycle} from './originalSoloDefaultStartup.fixture';

const maps=['barrack','woodlands'] as const;
const ammo={pistol:8,shotgun:6,rifle:28,launcher:6,rpg:1,sniper:30};
const reserve={pistol:54,shotgun:24,rifle:140,launcher:18,rpg:12,sniper:12};

// Decoded packaged maps/meshes with borrowed CPU textures and DOM/audio mocks.
// Actual Game.ensureSoloWorlds constructs its coordinator, startup owner and
// legacy inline factory. Solver advancement is skipped; no native timing/raster claim.
describe('legacy inline CPU Game Solo startup',()=>{
 it.each(maps)('%s constructs its own complete factory and adopts the first publication',map=>{
  const f=startup(map);
  try{
   expect(f.game.soloWorlds).toBeUndefined();expect(f.game.soloLoadedSceneFactory).toBeUndefined();expect(f.game.soloStartupResources).toBeUndefined();
   const worlds=f.game.ensureSoloWorlds(),player=worlds.worlds.get('player')!;
   expect(worlds).not.toBe(f.worlds);expect(f.game.soloLoadedSceneFactory).not.toBe(f.factory);expect(f.game.soloStartupResources).toBeDefined();
   expect(f.game.ensureSoloWorlds()).toBe(worlds);
   cycle(f.game,worlds,0);
   expect(player.loadout!.selected).toBe('launcher');expect(player.loadout!.ammo).toEqual(ammo);expect(player.loadout!.reserve).toEqual(reserve);
   expect(Object.values(player.loadout!.owned)).toEqual(Array(6).fill(true));
   expect(f.game.weaponState.originalLoadoutCheckpoint).toEqual(player.loadout);expect(f.game.weaponState.current).toBe('launcher');
   expect(f.game.soloReceiverModels.presentation.freeze()).toBe(player.modelState);
   expect(f.game.soloReceiverTransients.presentation.freeze()).toBe(player.transientState);
   expect(f.game.soloLocalWeaponPresentation.adapter.freeze()).toEqual(player.localWeapons);
   expect(f.game.soloProjectilePresentation.adapter.freeze()).toEqual(player.projectileState);
   expect(f.game.soloLoadedSceneFactory.readAssembly('player',player.lifeGeneration)).toBeDefined();
   expect(f.collection.resources.get('rg6')!.visible).toBe(player.localWeapons!.models.find((m:any)=>m.handle==='rg6')!.inWorld);
  }finally{f.dispose();}
 });

 it.each(maps)('%s retains captured startup input and publishes only after a late-peer retry',map=>{
  const f=startup(map);let fail:{mockRestore():void}|undefined;
  try{
   const worlds=f.game.ensureSoloWorlds(),player=worlds.worlds.get('player')!,peer=worlds.register({id:'peer',name:'Authored Peer',eye:{x:1100,y:1000,z:0}});peer.weapon='launcher';
   const read=vi.spyOn(f.game,'readSoloHumanCallbackInput');prepare(f.game,worlds,0);
   fail=vi.spyOn(peer.mirror,'prepareSynchronousDelivery').mockImplementationOnce(()=>{throw Error('default startup late peer');});
   expect(()=>worlds.completeGoody(0)).toThrow('default startup late peer');fail.mockRestore();fail=undefined;
   const calls=read.mock.calls.length,input=f.game.soloHumanCallbackInput.input;
   expect(player.loadout).toBeUndefined();expect(f.game.soloReceiverModels).toBeUndefined();expect(f.game.soloReceiverTransients).toBeUndefined();
   f.game.keys.add('Digit1');worlds.completeGoody(0);
   expect(read.mock.calls).toHaveLength(calls);expect(f.game.soloHumanCallbackInput.input).toBe(input);
   expect(player.loadout!.selected).toBe('launcher');expect(player.loadout!.ammo).toEqual(ammo);expect(peer.loadout).toBeUndefined();
   expect(f.game.soloReceiverModels.presentation.freeze()).toBe(player.modelState);read.mockRestore();
  }finally{fail?.mockRestore();f.dispose();}
 });

 it.each(maps)('%s tears down presentations before startup ownership and can start a fresh complete scene',map=>{
  const f=startup(map);const geometryDispose=vi.spyOn(f.soldierResources.geometry,'dispose'),materialDispose=vi.spyOn(f.soldierResources.material,'dispose'),textureDispose=vi.spyOn(f.soldierResources.assets.texture,'dispose');
  const weaponDispose=vi.spyOn(f.collection.resources.get('rg6')!.geometry,'dispose');let planeDispose:{mockRestore():void}|undefined;
  try{
   const worlds=f.game.ensureSoloWorlds();cycle(f.game,worlds,0);
   const startupOwner=f.game.soloStartupResources,factory=f.game.soloLoadedSceneFactory;
   const modelRelease=vi.spyOn(f.game.soloReceiverModels.presentation,'dispose'),localRelease=vi.spyOn(f.game.soloLocalWeaponPresentation.adapter,'release');
   const plane=startupOwner.planeOwner.planeMaterial,originalDispose=plane.dispose;
   const startupDispose=vi.spyOn(plane,'dispose').mockImplementation(function(this:THREE.Material){expect(()=>factory.readAssembly('player',1)).toThrow('released');originalDispose.call(this);});planeDispose=startupDispose;
   f.game.disposeSoloWorlds(false);
   expect(modelRelease).toHaveBeenCalledOnce();expect(localRelease).toHaveBeenCalledOnce();expect(startupDispose).toHaveBeenCalledOnce();
   expect(modelRelease.mock.invocationCallOrder[0]).toBeLessThan(startupDispose.mock.invocationCallOrder[0]);expect(localRelease.mock.invocationCallOrder[0]).toBeLessThan(startupDispose.mock.invocationCallOrder[0]);
   expect(f.game.soloLoadedSceneFactory).toBeUndefined();expect(f.game.soloStartupResources).toBeUndefined();expect(()=>startupOwner.resources).toThrow('released');
   for(const spy of [geometryDispose,materialDispose,textureDispose,weaponDispose])expect(spy).not.toHaveBeenCalled();
   const next=f.game.ensureSoloWorlds();expect(next).not.toBe(worlds);expect(f.game.soloLoadedSceneFactory).not.toBe(factory);expect(Object.is(f.game.soloStartupResources,startupOwner)).toBe(false);
   cycle(f.game,next,1/30);const player=next.worlds.get('player')!;expect(player.loadout!.selected).toBe('launcher');expect(player.loadout!.ammo).toEqual(ammo);expect(player.loadout!.reserve).toEqual(reserve);
   for(const spy of [geometryDispose,materialDispose,textureDispose,weaponDispose])expect(spy).not.toHaveBeenCalled();
  }finally{planeDispose?.mockRestore();geometryDispose.mockRestore();materialDispose.mockRestore();textureDispose.mockRestore();weaponDispose.mockRestore();f.dispose();}
 });

 it.each(maps)('%s retains startup material through an endgame before first CURRENT publication',map=>{
  const f=startup(map);let materialDispose:{mockRestore():void}|undefined;
  try{
   const worlds=f.game.ensureSoloWorlds(),owner=f.game.soloStartupResources,factory=f.game.soloLoadedSceneFactory;
   const dispose=vi.spyOn(owner.planeOwner.planeMaterial,'dispose');materialDispose=dispose;
   expect(f.game.soloReceiverModels).toBeUndefined();f.game.disposeSoloWorlds(true);
   expect(worlds.worlds.size).toBe(0);expect(()=>factory.readAssembly('player',1)).toThrow('released');expect(f.game.soloLoadedSceneFactory).toBeUndefined();
   expect(f.game.soloStartupResources).toBe(owner);expect(owner.resources).toBeDefined();expect(dispose).not.toHaveBeenCalled();
   const next=f.game.ensureSoloWorlds();expect(next).not.toBe(worlds);expect(Object.is(f.game.soloStartupResources,owner)).toBe(false);
   expect(()=>owner.resources).toThrow('released');expect(dispose).toHaveBeenCalledOnce();cycle(f.game,next,1/30);
   expect(next.worlds.get('player')!.loadout!.ammo).toEqual(ammo);
  }finally{materialDispose?.mockRestore();f.dispose();}
 });

 it.each(maps)('%s freezes adopted presenters and releases their startup material only after reset',map=>{
  const f=startup(map);let materialDispose:{mockRestore():void}|undefined;
  try{
   const worlds=f.game.ensureSoloWorlds();cycle(f.game,worlds,0);
   const owner=f.game.soloStartupResources,factory=f.game.soloLoadedSceneFactory;
   const holders=[f.game.soloReceiverModels,f.game.soloReceiverTransients,f.game.soloLocalWeaponPresentation,f.game.soloProjectilePresentation];
   const presenters=[holders[0].presentation,holders[1].presentation,holders[2].adapter,holders[3].adapter],states=presenters.map(p=>p.freeze());
   const dispose=vi.spyOn(owner.planeOwner.planeMaterial,'dispose');materialDispose=dispose;
   const presenterReleases=[vi.spyOn(presenters[0],'dispose'),vi.spyOn(presenters[1],'dispose'),vi.spyOn(presenters[2],'release'),vi.spyOn(presenters[3],'dispose')];
   f.game.disposeSoloWorlds(true);
   expect(worlds.worlds.size).toBe(0);expect(f.game.soloWorlds).toBeUndefined();expect(f.game.soloLoadedSceneFactory).toBeUndefined();expect(()=>factory.readAssembly('player',1)).toThrow('released');
   expect(f.game.soloStartupResources).toBe(owner);for(const holder of holders)expect(holder.frozen).toBe(true);
   expect(presenters.map(p=>p.freeze())).toEqual(states);for(const spy of presenterReleases)expect(spy).not.toHaveBeenCalled();expect(owner.resources).toBeDefined();expect(dispose).not.toHaveBeenCalled();
   f.game.disposeSoloWorlds(false);
   for(const spy of presenterReleases){expect(spy).toHaveBeenCalledOnce();expect(spy.mock.invocationCallOrder[0]).toBeLessThan(dispose.mock.invocationCallOrder[0]);}
   expect(()=>owner.resources).toThrow('released');expect(dispose).toHaveBeenCalledOnce();expect(f.game.soloStartupResources).toBeUndefined();
   f.game.disposeSoloWorlds(false);expect(dispose).toHaveBeenCalledOnce();
  }finally{materialDispose?.mockRestore();f.dispose();}
 });

 it.each(maps)('%s fires a mature RG6 through the legacy inline CPU gun program and both actual projectile banks',map=>{
  const f=startup(map);
  try{
   const worlds=f.game.ensureSoloWorlds(),player=worlds.worlds.get('player')!,peer=worlds.register({id:'peer',name:'Authored Peer',eye:{x:1100,y:1000,z:0}});peer.weapon='launcher';
   for(let i=0;i<45;i++)cycle(f.game,worlds,i/30);
   expect(player.loadout!.ammo.launcher).toBe(6);expect(player.projectiles.size).toBe(0);
   f.game.firing=true;cycle(f.game,worlds,45/30);
   expect(player.loadout!.ammo.launcher).toBe(5);expect(player.projectiles.size).toBe(1);expect(peer.projectiles.size).toBe(1);
   const launch=[...player.projectiles.values()][0].launch;
   expect(launch.ownerId).toBe('player');expect(launch.weapon).toBe('launcher');expect([...peer.projectiles.values()][0].launch).toBe(launch);
   for(const world of [player,peer])expect(world.projectileState!.actors.map((actor:any)=>actor.launchId)).toEqual([launch.id]);
   const actor=player.projectileState!.actors[0],visual=f.game.soloProjectilePresentation.adapter.meshForHandle(actor.handle);
   expect(visual).toBeInstanceOf(THREE.Mesh);expect(visual.parent).toBe(f.scene);expect(visual.geometry).toBe(f.collection.resources.get('rg6grenade')!.geometry);
   expect(f.game.createProjectileMesh).not.toHaveBeenCalled();expect(f.game.orientProjectileMesh).not.toHaveBeenCalled();
   cycle(f.game,worlds,46/30);expect(player.loadout!.ammo.launcher).toBe(5);expect(player.projectiles.size).toBe(1);expect(peer.projectiles.size).toBe(1);
  }finally{f.dispose();}
 });
});
