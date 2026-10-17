import {describe,it,expect,vi} from 'vitest';
import {presentationFixture} from './originalSoloLoadedScenePresentation.fixture';

// Actual decoded maps, loaded render/query buffers, complete CURRENT factory,
// joint coordinator and Game presentation consumers. Renderer construction and
// audio sinks are CPU fixtures; the installed shader policy is not native proof.
describe('Game startup resources through complete configured scenes',()=>{
 it.each(['barrack','woodlands'] as const)('%s retains fresh barrel shaders through joint rollback and real FX adoption',map=>{
  const f=presentationFixture(map,{gameStartupResources:true});let failure:{mockRestore():void}|undefined;
  const material=f.planeOwner.planeMaterial,disposed=vi.spyOn(material,'dispose');
  const texture=material.map!,textureDisposed=vi.spyOn(texture,'dispose'),repeat=texture.repeat.clone(),offset=texture.offset.clone();
  try{
   f.barrelBirths.push(...[1,2].map(n=>({kind:'transient-birth' as const,event:{kind:'bang' as const,id:`startup-barrel-${n}`,type:'barrel' as const,position:{x:1000+n*10,y:1000,z:0}}})));
   f.prepare(0);failure=vi.spyOn(f.b.mirror,'prepareSynchronousDelivery').mockImplementationOnce(()=>{throw Error('startup late peer');});
   expect(()=>f.worlds.completeGoody(0)).toThrow('startup late peer');failure.mockRestore();failure=undefined;
   expect(f.player.transientState).toBeUndefined();expect(f.game.soloReceiverTransients).toBeUndefined();expect(f.events).toEqual([]);
   expect(disposed).not.toHaveBeenCalled();expect(texture.repeat).toEqual(repeat);expect(texture.offset).toEqual(offset);
   f.worlds.completeGoody(0);f.barrelBirths.length=0;
   const state=f.player.transientState!,actors=state.actors.filter(a=>a.id.startsWith('startup-barrel-'));
   expect(actors).toHaveLength(2);expect(f.game.soloReceiverTransients.presentation.freeze()).toBe(state);
   const shaders=actors.map(a=>state.shaders.find(shader=>shader.handle===state.models.find(m=>m.handle===a.handle)!.shaderHandle)!);
   expect(new Set(shaders.map(s=>s.handle)).size).toBe(2);
   for(const shader of shaders){expect(shader).toMatchObject({texture:'bangrocket',emissiveWhite:true,nearFiltering:true,renderFormat:'rgba8888'});}
   expect(texture.repeat).toEqual(repeat);expect(texture.offset).toEqual(offset);expect(textureDisposed).not.toHaveBeenCalled();
   f.game.completeSoloActors();f.prepare(1/30);f.worlds.completeGoody(1/30);f.game.completeSoloActors();
   expect(f.player.transientState!.actors.filter(a=>a.id.startsWith('startup-barrel-'))).toHaveLength(2);
   expect(disposed).not.toHaveBeenCalled();
   f.game.disposeSoloWorlds(false);f.worlds.clear();f.factory.release();f.startupResources!.release();f.startupResources!.release();
   expect(disposed).toHaveBeenCalledOnce();expect(textureDisposed).not.toHaveBeenCalled();
   expect(()=>f.startupResources!.resources).toThrow('released');
  }finally{failure?.mockRestore();disposed.mockRestore();textureDisposed.mockRestore();f.dispose();}
 });
});
