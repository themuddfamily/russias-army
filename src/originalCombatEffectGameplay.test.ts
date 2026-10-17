import * as THREE from 'three';
import {describe,it,expect,vi} from 'vitest';
import {Game} from './game';
import {WEAPONS,WeaponState,type WeaponId} from './weapons';
import {ORIGINAL_MAP_SCALE as S} from '../shared/originalMapProfile';
import {createOriginalProjectile} from '../shared/originalExplosives';
import {OriginalCombatEffectPresentation,createOriginalCombatEffectResources} from './originalCombatEffectPresentation';

function client(map='woodlands',weapon:WeaponId='pistol'):any {
  const g=Object.create(Game.prototype);
  const camera=new THREE.PerspectiveCamera();camera.position.set(2,3,4);
  const damage=vi.fn(()=>'hurt'),mesh=new THREE.Object3D();
  const enemy={alive:true,damage,hitMeshes:[mesh]};mesh.userData.enemy=enemy;
  Object.assign(g,{mapId:map,archivalWinter:false,mode:'solo',phase:'playing',playerAlive:true,
    camera,weaponState:new WeaponState(map),keys:new Set(),controlsPreset:'legacy',aiming:false,arrowMovement:false,
    elapsed:1,hits:0,enemies:[enemy],remotePlayers:new Map(),scene:new THREE.Scene(),
    raycaster:{set:vi.fn(),intersectObjects:vi.fn(()=>[{object:mesh,distance:10,point:new THREE.Vector3(2,3,-6)}])},
    distanceToWorld:vi.fn(()=>100),raycastWorld:vi.fn(()=>({distance:100,normal:{x:0,y:1,z:0}})),surfaceNormalAt:vi.fn(()=>new THREE.Vector3(0,1,0)),showHitmarker:vi.fn(),registerKill:vi.fn(),
    playOriginalCombatSound:vi.fn(),audio:{play:vi.fn()},updateHud:vi.fn(),
    originalCombatEffectPresentation:{spawnMiss:vi.fn(),spawnBlood:vi.fn(),spawnPuff:vi.fn(),step:vi.fn(),clear:vi.fn()},
    originalExplosionPresentation:{step:vi.fn(),clear:vi.fn()},
    combatEffects:{emitImpact:vi.fn(),emitTracer:vi.fn()},combatImpactMarks:{emitBullet:vi.fn()},triggerImpactLight:vi.fn(),
    projectiles:[],originalBlasts:[],combatEffectsFrozen:false,spawnExplosion:vi.fn(),takeDamage:vi.fn(),
    sweepOriginalProjectile:vi.fn(()=>null),sweepOriginalConvex:vi.fn(()=>null),network:{clientId:'local'},networkProjectiles:new Map(),pendingNetworkProjectileShots:new Map(),
    handledNetworkShots:new Set(),handledNetworkProjectileSpawns:new Set(),handledNetworkExplosions:new Set(),handledNetworkRG6Boosts:new Set(),
    handledNetworkDamageEvents:new Set(),handledNetworkEliminations:new Set(),creditedExplosiveShots:new Set(),
    networkEffectCounts:{predictions:0,adoptions:0,projectileSpawns:0,explosions:0,damageEvents:0,eliminations:0},
    createProjectileMesh:vi.fn(()=>new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshBasicMaterial()))});
  g.weaponState.select(weapon);return g;
}
const assertNoAuthoredEffects=(g:any)=>{
  expect(g.combatEffects.emitImpact).not.toHaveBeenCalled();expect(g.combatEffects.emitTracer).not.toHaveBeenCalled();
  expect(g.combatImpactMarks.emitBullet).not.toHaveBeenCalled();expect(g.triggerImpactLight).not.toHaveBeenCalled();
};

describe('actual Game source combat effect routing',()=>{
  for(const map of ['barrack','woodlands'])for(const weapon of ['pistol','shotgun','rifle','sniper'] as const){
    const rays=weapon==='shotgun'?2:1;
    it(`${map} ${weapon} creates ${rays} coincident blood planes 25 source units behind its ray`,()=>{
      const g=client(map,weapon);g.hitscan(WEAPONS[weapon]);
      const blood=g.originalCombatEffectPresentation.spawnBlood;
      expect(blood).toHaveBeenCalledTimes(rays);
      const direction=g.raycaster.set.mock.calls[0][1] as THREE.Vector3;
      const expected=new THREE.Vector3(2,3,-6).addScaledVector(direction,-25*S);
      for(const [point,eye] of blood.mock.calls){expect(point.distanceTo(expected)).toBeLessThan(1e-12);expect(eye).toEqual(g.camera.position);}
      expect(g.raycaster.intersectObjects).toHaveBeenCalledOnce();expect(g.originalCombatEffectPresentation.spawnMiss).not.toHaveBeenCalled();
      assertNoAuthoredEffects(g);
    });
    it(`${map} ${weapon} creates ${rays} coincident miss planes at the world intersection`,()=>{
      const g=client(map,weapon);g.raycaster.intersectObjects.mockReturnValue([]);g.raycastWorld.mockReturnValue({distance:10,normal:{x:0,y:1,z:0}});
      g.hitscan(WEAPONS[weapon]);
      const miss=g.originalCombatEffectPresentation.spawnMiss;
      expect(miss).toHaveBeenCalledTimes(rays);
      for(const [point,normal,shotgun] of miss.mock.calls){expect(point.toArray()).toEqual([2,3,-6]);expect(normal.toArray()).toEqual([0,1,0]);expect(shotgun).toBe(weapon==='shotgun');}
      expect(g.originalCombatEffectPresentation.spawnBlood).not.toHaveBeenCalled();assertNoAuthoredEffects(g);
    });
  }
  it('routes direct source impact requests and remote tracers without authored particles, lights or marks',()=>{
    const g=client();g.spawnImpact(new THREE.Vector3(1,2,3),new THREE.Vector3(0,1,0),10,2,true,'stone');
    expect(g.originalCombatEffectPresentation.spawnMiss).toHaveBeenCalledOnce();
    g.spawnImpact(new THREE.Vector3(1,2,3),new THREE.Vector3(0,1,0),10,2,false,'flesh');
    expect(g.originalCombatEffectPresentation.spawnBlood).toHaveBeenCalledOnce();
    g.spawnNetworkTracer({x:0,y:0,z:0},{x:1,y:0,z:0},100);assertNoAuthoredEffects(g);
  });
  it.each(['rpg','launcher'] as const)('spawns solo %s puffs only on actual RPG callbacks including terminal',weapon=>{
    const g=client();g.enemies=[];const source=createOriginalProjectile(weapon,{x:100,y:100,z:100},{x:1,y:0,z:0},'local');
    source.remainingCallbacks=2;
    const mesh=new THREE.Mesh(),projectile={source,mesh,velocity:new THREE.Vector3()};g.scene.add(mesh);g.projectiles.push(projectile);
    g.updateOriginalExplosives(true);
    if(weapon==='rpg'){
      expect(g.projectiles).toHaveLength(1);expect(g.originalCombatEffectPresentation.spawnPuff).toHaveBeenCalledTimes(1);
      g.updateOriginalExplosives(true);
      expect(g.originalCombatEffectPresentation.spawnPuff).toHaveBeenCalledTimes(2);
    }else expect(g.originalCombatEffectPresentation.spawnPuff).not.toHaveBeenCalled();
    expect(g.projectiles).toHaveLength(0);expect(g.spawnExplosion).toHaveBeenCalledOnce();expect(mesh.parent).toBeNull();
    g.updateOriginalExplosives(true);expect(g.originalCombatEffectPresentation.spawnPuff).toHaveBeenCalledTimes(weapon==='rpg'?2:0);
    assertNoAuthoredEffects(g);
  });
});

function snapshot(visual:any,remainingCallbacks:number,projectileId='authority',shotId='shot'):any {
  return {projectileId,shotId,weapon:visual.weapon,attackerId:'local',position:{...visual.source.position},velocity:{...visual.source.velocity},
    direction:{...visual.source.direction},remainingCallbacks,expiresAt:10000};
}
function explosion(projectileId='authority',shotId='shot'):any {
  return {type:'explosion',serverTime:1000,data:{projectileId,shotId,weapon:'rpg',position:{x:100,y:100,z:100},radius:250*S,remainingCallbacks:16}};
}
describe('actual Game source network puff prediction and lifecycle',()=>{
  it('deduplicates render replay, keeps the callback cursor during adoption, and presents authority terminal once',()=>{
    const g=client();g.predictNetworkProjectile('shot','rpg',new THREE.Vector3(100,100,100),new THREE.Vector3(1,0,0));
    const visual=g.networkProjectiles.get('pending:shot');visual.predictedSeconds=3/30;
    g.renderNetworkProjectilePrediction(visual);g.renderNetworkProjectilePrediction(visual);
    expect(g.originalCombatEffectPresentation.spawnPuff).toHaveBeenCalledTimes(3);expect(visual.puffRemainingCallbacks).toBe(197);
    g.reconcileNetworkProjectile(snapshot(visual,197),1000);
    expect(g.networkProjectiles.get('authority')).toBe(visual);expect(g.networkEffectCounts.adoptions).toBe(1);
    expect(g.pendingNetworkProjectileShots.size).toBe(0);expect(g.originalCombatEffectPresentation.spawnPuff).toHaveBeenCalledTimes(3);
    visual.predictedSeconds=1/30;g.renderNetworkProjectilePrediction(visual);g.renderNetworkProjectilePrediction(visual);
    expect(g.originalCombatEffectPresentation.spawnPuff).toHaveBeenCalledTimes(4);
    g.handleNetworkEvent(explosion());g.handleNetworkEvent(explosion());
    expect(g.originalCombatEffectPresentation.spawnPuff).toHaveBeenCalledTimes(5);expect(g.spawnExplosion).toHaveBeenCalledOnce();expect(g.networkProjectiles.size).toBe(0);
    g.reconcileNetworkProjectile(snapshot(visual,195),1100);expect(g.networkProjectiles.size).toBe(0);
  });
  it('does not duplicate the predicted terminal puff when its authority explosion arrives',()=>{
    const g=client();g.predictNetworkProjectile('shot','rpg',new THREE.Vector3(100,100,100),new THREE.Vector3(1,0,0));
    const visual=g.networkProjectiles.get('pending:shot');visual.source.remainingCallbacks=1;visual.predictedSeconds=1/30;
    g.renderNetworkProjectilePrediction(visual);g.renderNetworkProjectilePrediction(visual);
    expect(visual.puffTerminal).toBe(true);expect(g.originalCombatEffectPresentation.spawnPuff).toHaveBeenCalledOnce();
    // This checkpoint precedes the predicted callback at remaining=0; it does
    // not prove the projectile survived the predicted terminal callback.
    g.reconcileNetworkProjectile(snapshot(visual,1),1000);g.handleNetworkEvent(explosion());g.handleNetworkEvent(explosion());
    expect(g.originalCombatEffectPresentation.spawnPuff).toHaveBeenCalledOnce();expect(g.networkProjectiles.size).toBe(0);
  });
  it('re-arms terminal presentation when an active authority snapshot contradicts predicted detonation',()=>{
    const g=client();g.predictNetworkProjectile('shot','rpg',new THREE.Vector3(100,100,100),new THREE.Vector3(1,0,0));
    const visual=g.networkProjectiles.get('pending:shot');visual.source.hit=true;visual.predictedSeconds=1/30;
    g.renderNetworkProjectilePrediction(visual);expect(visual.puffTerminal).toBe(true);
    expect(visual.puffRemainingCallbacks).toBe(199);
    // A surviving checkpoint beyond the predicted collision actually disproves it.
    g.reconcileNetworkProjectile(snapshot(visual,198),1000);expect(visual.puffTerminal).toBe(false);
    g.handleNetworkEvent(explosion());g.handleNetworkEvent(explosion());
    expect(g.originalCombatEffectPresentation.spawnPuff).toHaveBeenCalledTimes(2);expect(g.spawnExplosion).toHaveBeenCalledOnce();
  });
  it('presents terminal puff for an unadopted pending shot when authority explosion arrives first',()=>{
    const g=client();g.predictNetworkProjectile('shot','rpg',new THREE.Vector3(100,100,100),new THREE.Vector3(1,0,0));
    g.handleNetworkEvent(explosion());g.handleNetworkEvent(explosion());
    expect(g.originalCombatEffectPresentation.spawnPuff).toHaveBeenCalledOnce();expect(g.networkProjectiles.size).toBe(0);expect(g.pendingNetworkProjectileShots.size).toBe(0);
  });
  it('keeps RG6 prediction puff-free and clears effect actors with projectile/session cleanup',()=>{
    const g=client();g.predictNetworkProjectile('shot','launcher',new THREE.Vector3(100,100,100),new THREE.Vector3(1,0,0));
    const visual=g.networkProjectiles.get('pending:shot');visual.predictedSeconds=3/30;g.renderNetworkProjectilePrediction(visual);
    expect(g.originalCombatEffectPresentation.spawnPuff).not.toHaveBeenCalled();
    g.clearNetworkProjectiles();expect(g.originalCombatEffectPresentation.clear).toHaveBeenCalledOnce();
    expect(g.originalExplosionPresentation.clear).toHaveBeenCalledOnce();expect(g.networkProjectiles.size).toBe(0);expect(g.pendingNetworkProjectileShots.size).toBe(0);expect(visual.mesh.parent).toBeNull();
  });
});


describe('actual SPAS hits use one shared source blood shader',()=>{
  it.each(['barrack','woodlands'])('%s two blood actors advance shared atlas once per actor and preserve birth epoch',map=>{
    const g=client(map,'shotgun'),resources=createOriginalCombatEffectResources({decal:new THREE.Texture(),decalspas:new THREE.Texture(),spatter:new THREE.Texture(),pufft:new THREE.Texture()});
    const effects=new OriginalCombatEffectPresentation(resources,g.scene);g.originalCombatEffectPresentation=effects;
    try{
      g.hitscan(WEAPONS.shotgun);const [a,b]=effects.list();expect(effects.getStats().blood).toBe(2);
      expect(a.mesh.material.map).toBe(b.mesh.material.map);
      effects.step(g.camera.position,g.elapsed);expect(a.mesh.material.map!.offset.x).toBeCloseTo(-1/3); // Newly born actors skip the historical callback.
      effects.step(g.camera.position,g.elapsed+1/30);
      for(const blood of [a,b]){expect(blood.mesh.material.map!.offset.x).toBeCloseTo(1/3);expect(blood.mesh.material.map!.offset.y).toBeCloseTo(1/3);expect('remainingCallbacks' in blood.state&&blood.state.remainingCallbacks).toBe(4);}
      effects.step(g.camera.position,g.elapsed+2/30);expect(a.mesh.material.map!.offset.x).toBeCloseTo(0);expect(a.mesh.material.map!.offset.y).toBeCloseTo(0);
      effects.step(g.camera.position,g.elapsed+3/30);expect(effects.size).toBe(0);expect(g.enemies[0].damage).toHaveBeenCalledOnce();
    }finally{effects.dispose();resources.dispose();}
  });
});


describe('source practice bots follow the installed source effect policy',()=>{
  it.each(['barrack','woodlands'])('%s keeps source fire/miss presentation without invented tracer batches',map=>{
    const g=client(map);g.tracerSequence=1;const random=vi.spyOn(Math,'random').mockReturnValue(.99);
    try{g.distanceToWorld.mockReturnValue(10);g.combatantShoot({weapon:'pistol'},null,new THREE.Vector3(0,2,0),12);
      expect(g.tracerSequence).toBe(2);expect(g.playOriginalCombatSound).toHaveBeenCalledWith('gunfire',expect.any(THREE.Vector3));
      expect(g.originalCombatEffectPresentation.spawnMiss).toHaveBeenCalledOnce();assertNoAuthoredEffects(g);
    }finally{random.mockRestore();}
  });
  it('retains archived Winter bot tracers and procedural shot audio',()=>{
    const g=client();g.archivalWinter=true;g.tracerSequence=1;g.spawnImpact=vi.fn();const random=vi.spyOn(Math,'random').mockReturnValue(.99);
    try{g.distanceToWorld.mockReturnValue(10);g.combatantShoot({weapon:'pistol'},null,new THREE.Vector3(0,2,0),12);
      expect(g.combatEffects.emitTracer).toHaveBeenCalledOnce();expect(g.audio.play).toHaveBeenCalledWith('shot',.35);expect(g.playOriginalCombatSound).not.toHaveBeenCalled();
    }finally{random.mockRestore();}
  });
});
