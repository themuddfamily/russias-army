import * as THREE from 'three';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {Game} from './game';
import {createOriginalCombatEffectResources,OriginalCombatEffectPresentation} from './originalCombatEffectPresentation';
import {createOriginalExplosionResources,OriginalExplosionPresentation} from './originalExplosionPresentation';

function fixture(mapId:'barrack'|'woodlands',phase='paused',mode='online',frozen=false){
  let now=0;
  vi.spyOn(performance,'now').mockImplementation(()=>now);
  const scene=new THREE.Scene();
  const combatResources=createOriginalCombatEffectResources({spatter:new THREE.Texture(),decal:new THREE.Texture(),decalspas:new THREE.Texture(),pufft:new THREE.Texture()});
  const explosionResources=createOriginalExplosionResources({grenade:new THREE.Texture(),rocket:new THREE.Texture()});
  const combat=new OriginalCombatEffectPresentation(combatResources,scene);
  const explosions=new OriginalExplosionPresentation(explosionResources,scene);
  const game=Object.assign(Object.create(Game.prototype),{mapId,phase,mode,combatEffectsFrozen:frozen,
    sourceRemoteViewEpoch:0,sourceRemoteViewCallbacks:0,sourceRemoteViewLocalStart:0,
    playerAlive:true,camera:new THREE.PerspectiveCamera(),sourceTimeoutCorpses:new Set(),remotePlayers:new Map(),
    originalCombatEffectPresentation:combat,originalExplosionPresentation:explosions});
  return {game,scene,combat,explosions,time(callbacks:number){now=callbacks*1000/30;game.advanceSourceRemoteView();},
    dispose(){combat.dispose();explosions.dispose();combatResources.dispose();explosionResources.dispose();}};
}

afterEach(()=>vi.restoreAllMocks());

describe('online source effects while local input is paused',()=>{
  for(const map of ['barrack','woodlands'] as const)it(`${map} expires incoming effects, reuses bounded FIFOs and disposes owned resources at teardown`,()=>{
    const s=fixture(map),materials=new Map<THREE.Material,number>(),textures=new Map<THREE.Texture,number>();
    const puffMeshes=new Set<THREE.Mesh>(),blastMeshes=new Set<THREE.Mesh>();
    const freePuffs:THREE.Mesh[]=[],freeBlasts:THREE.Mesh[]=[];
    const observe=(mesh:THREE.Mesh,seen:Set<THREE.Mesh>,free:THREE.Mesh[])=>{
      if(free.length)expect(mesh).toBe(free.shift());else expect(seen.has(mesh)).toBe(false);
      seen.add(mesh);
      const material=mesh.material as THREE.MeshBasicMaterial,texture=material.map!;
      if(!materials.has(material)){materials.set(material,0);material.addEventListener('dispose',()=>materials.set(material,materials.get(material)!+1));}
      if(!textures.has(texture)){textures.set(texture,0);texture.addEventListener('dispose',()=>textures.set(texture,textures.get(texture)!+1));}
    };
    const advance=(callback:number)=>{
      const puffs=s.combat.list(),blasts=s.explosions.list();s.time(callback);
      for(const puff of puffs)if(!s.combat.get(puff.id))freePuffs.push(puff.mesh);
      for(const blast of blasts)if(!s.explosions.get(blast.id))freeBlasts.push(blast.mesh);
    };
    try{
      for(let callback=0;callback<300;callback++){
        const puff=s.combat.spawnPuff({x:0,y:0,z:0},s.game.camera.position,()=>0,undefined,0,callback/30);
        observe(puff.mesh,puffMeshes,freePuffs);
        const blast=s.explosions.spawn(`blast-${callback}`,'rocket',{x:0,y:0,z:0},16,callback/30);
        observe(blast.mesh,blastMeshes,freeBlasts);
        advance(callback+1);
        expect(s.combat.size).toBeLessThanOrEqual(30);expect(s.explosions.size).toBeLessThanOrEqual(16);
        const puffPool=s.combat.planePool.stats(),blastPool=s.explosions.planePool.stats();
        expect(puffPool.allocated).toBeLessThanOrEqual(31);expect(blastPool.allocated).toBeLessThanOrEqual(17);
        expect(puffPool.active).toBe(s.combat.size);expect(blastPool.active).toBe(s.explosions.size);
        expect(puffPool.pooled).toBe(freePuffs.length);expect(blastPool.pooled).toBe(freeBlasts.length);
        expect(puffPool.shaders).toBe(puffPool.allocated);expect(blastPool.shaders).toBe(blastPool.allocated);
      }
      advance(332);
      expect(s.combat.size).toBe(0);expect(s.explosions.size).toBe(0);expect(s.scene.children).toHaveLength(0);
      expect(s.combat.planePool.stats().active).toBe(0);expect(s.explosions.planePool.stats().active).toBe(0);
      expect(s.combat.planePool.stats().pooled).toBe(puffMeshes.size);expect(s.explosions.planePool.stats().pooled).toBe(blastMeshes.size);
      expect(puffMeshes.size).toBeLessThan(300);expect(blastMeshes.size).toBeLessThan(300);
      for(const count of materials.values())expect(count).toBe(0);
      for(const count of textures.values())expect(count).toBe(0);
      s.dispose();
      for(const count of materials.values())expect(count).toBe(1);
      for(const count of textures.values())expect(count).toBe(1);
      expect(s.combat.planePool.stats().allocated).toBe(0);expect(s.explosions.planePool.stats().allocated).toBe(0);
      s.dispose();
      for(const count of materials.values())expect(count).toBe(1);
      for(const count of textures.values())expect(count).toBe(1);
    }finally{s.dispose();}
  });

  it.each<[string,string,boolean]>([['playing','online',false],['paused','solo',false],['paused','online',true]])('leaves %s / %s / frozen=%s to its existing callback owner',(phase,mode,frozen)=>{
    const s=fixture('woodlands',phase,mode,frozen);
    try{
      const puff=s.combat.spawnPuff({x:0,y:0,z:0},s.game.camera.position,()=>0);
      const step=vi.spyOn(s.combat,'step');
      s.time(40);
      expect(step).not.toHaveBeenCalled();expect(s.combat.get(puff.id)).toBe(puff);
    }finally{s.dispose();}
  });

  it('does not age a newborn effect on repeated receipts in the same callback',()=>{
    const s=fixture('barrack');
    try{
      s.time(1);
      const puff=s.combat.spawnPuff({x:0,y:0,z:0},s.game.camera.position,()=>0,undefined,0,1/30);
      const step=vi.spyOn(s.combat,'step');s.time(1);s.time(1);
      expect(step).not.toHaveBeenCalled();expect(puff.state.scale).toBe(.01);
      s.time(2);expect(step).toHaveBeenCalledTimes(1);expect(puff.state.scale).toBe(.12);
    }finally{s.dispose();}
  });
});
