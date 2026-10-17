import * as THREE from 'three';
import {readFileSync} from 'node:fs';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {Game} from './game';
import {SoldierMaterialLibrary} from './soldierMaterials';
import {createOriginalSoldierResources,type OriginalSoldierAssets} from './originalSoldier';
import {createOriginalWeapons,ORIGINAL_WEAPON_TEXTURES,type OriginalWeaponGeometryData} from './originalWeapons';
import {OriginalWeaponPresentation} from './originalWeaponPresentation';
import {WeaponState} from './weapons';
import {ORIGINAL_WEAPON_WAIT} from '../shared/originalWeaponCounter';

const read=(path:string)=>JSON.parse(readFileSync(new URL('../public/assets/'+path,import.meta.url),'utf8'));
const weaponGeometry=read('original-weapons/geometry.json') as OriginalWeaponGeometryData;
const soldierGeometry=read('original-soldier/geometry.json') as OriginalSoldierAssets['geometry'];
const rigMotion=read('original-soldier/rig-motion.json') as OriginalSoldierAssets['rigMotion'];

// Actual Enemy, ammunition, Game trigger/hitscan and muzzle leases. Nearest-hit
// selection and FX/audio/UI are injected; no renderer or native mixer is run.
function fixture(map:'barrack'|'woodlands',weapon:'pistol'|'shotgun'){
 const library=new SoldierMaterialLibrary({presentation:'modern',tier:'low'}),gi=new THREE.Texture();
 const textures=new Map(ORIGINAL_WEAPON_TEXTURES.map(name=>[name,new THREE.Texture()]));
 const assets={geometry:weaponGeometry,textures};
 const resources=createOriginalSoldierResources({geometry:soldierGeometry,rigMotion,texture:gi},assets);
 const collection=createOriginalWeapons(assets,{muzzlePool:resources.muzzleModels});
 const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(),view=new THREE.Scene();camera.position.set(3,4,5);
 for(const model of collection.models.values())view.add(model);
 const state=new WeaponState(map);state.select(weapon);state.ammo[weapon]=10;state.reserve[weapon]=30;
 const order:string[]=[],presentation=new OriginalWeaponPresentation(weapon);
 const game=Object.assign(Object.create(Game.prototype),{mapId:map,archivalWinter:false,mode:'solo',phase:'playing',playerAlive:true,
  scene,camera,enemies:[],soldierMaterialLibrary:library,originalSoldierResources:resources,
  arena:{spawnPoints:[new THREE.Vector3(),new THREE.Vector3(6,0,2)]},weaponState:state,
  originalWeapons:collection,originalWeaponPresentation:presentation,originalFlashes:[],enhancedRendering:true,
  elapsed:10,pitch:0,yaw:0,recoil:0,shots:0,hits:0,kills:0,score:37,keys:new Set(),controlsPreset:'legacy',aiming:false,arrowMovement:false,chatOpen:false,
  raycaster:{set:vi.fn(),intersectObjects:vi.fn(),far:0},raycastWorld:vi.fn(()=>null),spawnTracer:vi.fn(),
  audio:{play:vi.fn()},playOriginalCombatSound:vi.fn((name:string)=>{if(name==='hurt')order.push('hurt');}),
  originalCombatEffectPresentation:{spawnBlood:vi.fn(()=>order.push('blood')),spawnMiss:vi.fn(()=>order.push('miss'))},
  showHitmarker:vi.fn(),registerKill:vi.fn(),updateHud:vi.fn(),setMessage:vi.fn(),spawnMuzzleParticles:vi.fn(),spawnCasing:vi.fn(),
  muzzleLight:{intensity:0},worldMuzzleLight:{intensity:0}}) as any;
 game.spawnEnemies();const enemy=game.enemies[0],target=enemy.hitMeshes[0] as THREE.Mesh;
 game.raycaster.intersectObjects.mockReturnValue([{distance:8,point:new THREE.Vector3(3,4,-3),object:target,face:{normal:new THREE.Vector3(0,0,1)}}]);
 const spawn=game.spawnOriginalMuzzleFlash.bind(game);
 vi.spyOn(game,'spawnOriginalMuzzleFlash').mockImplementation((...args:unknown[])=>{order.push('flash');return spawn(...args);});
 state.applyOriginalCounter({waitgun:map==='woodlands'?0:ORIGINAL_WEAPON_WAIT[weapon],poldwaitgun:0,ready:true},10);
 return {game,state,enemy,target,collection,order,presentation,dispose(){game.clearOriginalMuzzleFlashes();game.clearEnemies();collection.dispose();resources.dispose();library.dispose();gi.dispose();for(const texture of textures.values())texture.dispose();}};
}
afterEach(()=>vi.restoreAllMocks());

describe('registered local baddy hurt audio is independent of canonical damage acceptance',()=>{
 for(const map of ['barrack','woodlands'] as const){
  for(const [weapon,rays,damageAmount,pitchDegrees] of [['pistol',1,12,1],['shotgun',2,36,7]] as const)it(`${map} ${weapon}: actual invulnerable Enemy retains hurt/blood/muzzle without hit or score credit`,()=>{
   const f=fixture(map,weapon);try{
    vi.spyOn(Math,'random').mockReturnValue(.5);f.enemy.invulnerableUntil=20;
    const health=f.enemy.health,damage=vi.spyOn(f.enemy,'damage'),fire=vi.spyOn(f.presentation,'fire');
    f.game.tryFire();
    expect(damage).toHaveBeenCalledExactlyOnceWith(damageAmount,10);expect(damage.mock.results[0].value).toBe('ignored');
    expect(f.order).toEqual(Array.from({length:rays},()=>['hurt','blood','flash']).flat());
    expect(f.enemy.health).toBe(health);expect(f.enemy.alive).toBe(true);expect(f.game.hits).toBe(0);expect(f.game.kills).toBe(0);expect(f.game.score).toBe(37);
    expect(f.game.showHitmarker).not.toHaveBeenCalled();expect(f.game.registerKill).not.toHaveBeenCalled();
    expect(f.game.originalFlashes).toHaveLength(rays);expect(f.collection.muzzleModels.stats().active).toBe(rays);
    expect(new Set(f.game.originalFlashes.map((entry:{mesh:THREE.Mesh})=>entry.mesh)).size).toBe(rays);
    expect(f.state.ammo[weapon]).toBe(9);expect(f.game.shots).toBe(1);expect(fire).toHaveBeenCalledOnce();
    const fireCalls=f.game.playOriginalCombatSound.mock.calls.filter((call:unknown[])=>call[0]!=='hurt');
    expect(fireCalls).toEqual([[weapon==='shotgun'?'spas12wav':'gunfire',undefined,6]]);
    expect(f.game.pitch).toBeCloseTo(pitchDegrees*Math.PI/180,12);expect(f.game.yaw).toBe(0);
   }finally{f.dispose();}
  });
  it(`${map}: an actual pending-dead Enemy remains a registered blood target while damage ignores it`,()=>{
   const f=fixture(map,'shotgun');try{
    // Receipt/presentation membership is an explicit seam: source detach has
    // not happened. The actual Enemy health path is forwarded, not stubbed.
    f.enemy.sourceDamagePresentation(0,true,0,10);
    const damage=vi.spyOn(f.enemy,'damage');
    Object.assign(f.game,{isSourceSolo:()=>true,soloRayTargets:()=>({meshes:[f.target],corpseMeshes:new Set()}),
     damageSoloEnemy:(enemy:any,amount:number)=>enemy.damage(amount,f.game.elapsed)});
    f.game.tryFire();
    expect(f.enemy.alive).toBe(false);expect(f.target.userData.enemy).toBe(f.enemy);expect(f.enemy.hitMeshes).toContain(f.target);
    expect(damage).toHaveBeenCalledExactlyOnceWith(36,10);expect(damage.mock.results[0].value).toBe('ignored');
    expect(f.order).toEqual(['hurt','blood','flash','hurt','blood','flash']);expect(f.enemy.health).toBe(0);
    expect(f.game.hits).toBe(0);expect(f.game.kills).toBe(0);expect(f.game.score).toBe(37);expect(f.game.registerKill).not.toHaveBeenCalled();
   }finally{f.dispose();}
  });
  it(`${map}: unowned and stale-owner metadata never emits local baddy hurt`,()=>{
   const f=fixture(map,'shotgun');try{
    const damage=vi.spyOn(f.enemy,'damage');
    for(const ownership of ['unowned','stale-owner']){
     f.order.length=0;f.game.elapsed++;f.state.applyOriginalCounter({waitgun:map==='woodlands'?0:ORIGINAL_WEAPON_WAIT.shotgun,poldwaitgun:0,ready:true},f.game.elapsed);
     if(ownership==='unowned')f.target.userData.enemy=undefined;else{f.target.userData.enemy=f.enemy;f.game.enemies=[];}
     f.game.tryFire();expect(f.order).toEqual(['miss','flash','miss','flash']);expect(f.game.originalFlashes).toHaveLength(2);f.game.clearOriginalMuzzleFlashes();
    }
    expect(damage).not.toHaveBeenCalled();expect(f.game.originalCombatEffectPresentation.spawnBlood).not.toHaveBeenCalled();
    expect(f.game.playOriginalCombatSound.mock.calls.filter((call:unknown[])=>call[0]==='hurt')).toEqual([]);
    expect(f.game.hits).toBe(0);expect(f.game.kills).toBe(0);expect(f.game.score).toBe(37);expect(f.state.ammo.shotgun).toBe(8);
    // Restore the real Enemy to the generation owner for ordinary cleanup.
    f.game.enemies=[f.enemy];
   }finally{if(!f.game.enemies.includes(f.enemy))f.game.enemies=[f.enemy];f.dispose();}
  });
 }
});
