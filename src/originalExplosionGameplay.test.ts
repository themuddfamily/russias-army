import * as THREE from 'three';
import {describe,it,expect,vi} from 'vitest';
import {Game} from './game';
import {createOriginalExplosionResources,OriginalExplosionPresentation} from './originalExplosionPresentation';
function harness(){
 const resources=createOriginalExplosionResources({grenade:new THREE.Texture(),rocket:new THREE.Texture()});
 const scene=new THREE.Scene(),presentation=new OriginalExplosionPresentation(resources,scene),game=Object.create(Game.prototype) as any;
 Object.assign(game,{archivalWinter:false,originalExplosionPresentation:presentation,originalExplosionSequence:0,triggerBlastLight:vi.fn(),combatEffects:{emitExplosion:vi.fn()},leaveExplosionScorch:vi.fn()});
 return {game,presentation,resources,scene};
}
describe('actual Game source explosion routing',()=>{
 it('routes an RPG blast to its recovered rocket atlas without authored light, particles or scorch',()=>{
  const {game,presentation,resources}=harness();try{
   game.spawnExplosion(new THREE.Vector3(1,2,3),99,'rpg','authority-blast',12);
   const b=presentation.get('authority-blast')!;expect(b.kind).toBe('rocket');expect(b.frame).toBe(4);expect(b.mesh.scale.x).toBe(8);expect(b.position.toArray()).toEqual([1,2,3]);
   expect(game.triggerBlastLight).not.toHaveBeenCalled();expect(game.combatEffects.emitExplosion).not.toHaveBeenCalled();expect(game.leaveExplosionScorch).not.toHaveBeenCalled();
  }finally{presentation.dispose();resources.dispose();}
 });
 it('keeps separate local grenade blast ages and retires each after its remaining callbacks',()=>{
  const {game,presentation,resources}=harness();try{
   game.spawnExplosion(new THREE.Vector3(),4);presentation.step({x:1,y:2,z:3});game.spawnExplosion(new THREE.Vector3(3,2,1),4);
   expect(presentation.list().map(b=>[b.id,b.kind,b.remainingCallbacks])).toEqual([['local-blast-1','grenade',15],['local-blast-2','grenade',16]]);
   for(let i=0;i<15;i++)presentation.step({x:1,y:2,z:3});expect(presentation.size).toBe(1);presentation.step({x:1,y:2,z:3});expect(presentation.size).toBe(0);
  }finally{presentation.dispose();resources.dispose();}
 });
 it('retains Winter authored explosion routing',()=>{
  const {game,presentation,resources}=harness();try{
   game.archivalWinter=true;game.enhancedRendering=false;game.spawnExplosion(new THREE.Vector3(1,2,3),4,'rpg');expect(presentation.size).toBe(0);
   expect(game.triggerBlastLight).toHaveBeenCalledOnce();expect(game.combatEffects.emitExplosion).toHaveBeenCalledOnce();expect(game.leaveExplosionScorch).toHaveBeenCalledOnce();
  }finally{presentation.dispose();resources.dispose();}
 });
});
