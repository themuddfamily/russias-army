import * as THREE from 'three';
import {readFileSync} from 'node:fs';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {Game} from './game';
import {RemotePlayer} from './remotePlayer';
import {createOriginalSoldierResources,type OriginalSoldierAssets} from './originalSoldier';
import {createOriginalWeapons,ORIGINAL_WEAPON_TEXTURES,type OriginalWeaponGeometryData} from './originalWeapons';
import {OriginalWeaponPresentation} from './originalWeaponPresentation';
import {WeaponState} from './weapons';
import {ORIGINAL_WEAPON_WAIT} from '../shared/originalWeaponCounter';

const read=(path:string)=>JSON.parse(readFileSync(new URL('../public/assets/'+path,import.meta.url),'utf8'));
const weaponGeometry=read('original-weapons/geometry.json') as OriginalWeaponGeometryData;
const soldierGeometry=read('original-soldier/geometry.json') as OriginalSoldierAssets['geometry'];
const rigMotion=read('original-soldier/rig-motion.json') as OriginalSoldierAssets['rigMotion'];

// Real registered RemotePlayer/GI, local weapons, Game firing/receipt paths.
// Transport acceptance, nearest intersection, audio/FX/UI are explicit sinks;
// these cases do not claim actual networking, native mixing or renderer timing.
function fixture(map:'barrack'|'woodlands',weapon:'pistol'|'shotgun'){
 const gi=new THREE.Texture(),textures=new Map(ORIGINAL_WEAPON_TEXTURES.map(name=>[name,new THREE.Texture()]));
 const assets={geometry:weaponGeometry,textures};
 const resources=createOriginalSoldierResources({geometry:soldierGeometry,rigMotion,texture:gi},assets);
 const collection=createOriginalWeapons(assets,{muzzlePool:resources.muzzleModels});
 const remote=new RemotePlayer('target','TARGET',undefined,resources,true),scene=new THREE.Scene(),view=new THREE.Scene(),camera=new THREE.PerspectiveCamera();
 remote.group.position.set(6,0,2);scene.add(remote.group);camera.position.set(3,4,5);
 for(const model of collection.models.values())view.add(model);
 const state=new WeaponState(map);state.select(weapon);state.ammo[weapon]=10;state.reserve[weapon]=30;
 const order:string[]=[],game=Object.assign(Object.create(Game.prototype),{mapId:map,archivalWinter:false,mode:'online',phase:'playing',playerAlive:true,
  scene,camera,enemies:[],remotePlayers:new Map([['target',remote]]),sourceTimeoutCorpses:new Set(),
  originalWeapons:collection,originalWeaponPresentation:new OriginalWeaponPresentation(weapon),originalFlashes:[],enhancedRendering:true,
  elapsed:10,pitch:0,yaw:0,recoil:0,shots:0,hits:0,kills:0,score:37,weaponState:state,
  keys:new Set(),controlsPreset:'legacy',aiming:false,arrowMovement:false,chatOpen:false,needsAuthoritativeSpawn:false,onlineWeaponReadyAt:0,
  network:{connected:true,clientId:'local',shoot:vi.fn(()=> 'shot'),hit:vi.fn()},
  raycaster:{set:vi.fn(),intersectObjects:vi.fn(()=>[{distance:8,point:new THREE.Vector3(3,4,-3),object:remote.hitMeshes[0]}]),far:0},
  raycastWorld:vi.fn(()=>null),spawnTracer:vi.fn(),audio:{play:vi.fn()},
  playOriginalCombatSound:vi.fn((name:string)=>{if(name==='hurt')order.push('hurt');}),
  originalCombatEffectPresentation:{spawnBlood:vi.fn(()=>order.push('blood')),spawnMiss:vi.fn(()=>order.push('miss')),clear:vi.fn()},
  showHitmarker:vi.fn(),updateHud:vi.fn(),setMessage:vi.fn(),spawnMuzzleParticles:vi.fn(),spawnCasing:vi.fn(),
  muzzleLight:{intensity:0},worldMuzzleLight:{intensity:0},
  networkProjectiles:new Map(),pendingNetworkProjectileShots:new Map(),networkExplosionIds:new Set(),
  handledNetworkShots:new Set(),handledNetworkProjectileSpawns:new Set(),handledNetworkExplosions:new Set(),handledNetworkRG6Boosts:new Set(),
  handledNetworkDamageEvents:new Set(),handledNetworkEliminations:new Set(),creditedExplosiveShots:new Set(),
  networkEffectCounts:{predictions:0,adoptions:0,projectileSpawns:0,explosions:0,damageEvents:0,eliminations:0}}) as any;
 const spawn=game.spawnOriginalMuzzleFlash.bind(game);
 vi.spyOn(game,'spawnOriginalMuzzleFlash').mockImplementation((...args:unknown[])=>{order.push('flash');return spawn(...args);});
 const ready=()=>state.applyOriginalCounter({waitgun:map==='woodlands'?0:ORIGINAL_WEAPON_WAIT[weapon],poldwaitgun:0,ready:true},game.elapsed);
 ready();
 const receipt=(shotId='shot',targetId='target',attackerId='local',kind:'hitscan'|'explosion'='hitscan',serverTime=1000)=>({type:'damaged',serverTime,
  data:{attackerId,targetId,damage:weapon==='shotgun'?36:12,health:64,lethal:false,
   source:kind==='hitscan'?{kind,weapon,shotId,zone:'body',position:{x:3,y:4,z:-3}}:
    {kind,weapon:'launcher',shotId,projectileId:'blast-'+shotId,position:{x:3,y:4,z:-3}}}});
 return {game,state,remote,collection,order,ready,receipt,dispose(){game.clearOriginalMuzzleFlashes();remote.dispose();collection.dispose();resources.dispose();gi.dispose();for(const texture of textures.values())texture.dispose();}};
}
const hurts=(game:any)=>game.playOriginalCombatSound.mock.calls.filter((call:unknown[])=>call[0]==='hurt');
afterEach(()=>vi.restoreAllMocks());

describe('online local baddy hurt prediction suppresses only its exact confirmed audio',()=>{
 for(const map of ['barrack','woodlands'] as const){
  for(const [weapon,rays] of [['pistol',1],['shotgun',2]] as const)it(`${map} ${weapon}: immediate per-ray hurt survives confirmation without duplicate sound or credit`,()=>{
   const f=fixture(map,weapon);try{
    // A synchronous transport hook changes the target after prediction has
    // selected its pose. Hurt must retain the earlier target position.
    f.game.network.hit.mockImplementation(()=>f.remote.group.position.set(30,40,50));
    f.game.tryFire();expect(f.order).toEqual(Array.from({length:rays},()=>['hurt','blood','flash']).flat());
    expect(f.game.originalFlashes).toHaveLength(rays);expect(f.collection.muzzleModels.stats().active).toBe(rays);
    expect(hurts(f.game)).toHaveLength(rays);for(const call of hurts(f.game))expect(call).toEqual(['hurt',{x:6,y:1.72,z:2}]);
    expect(f.game.hits).toBe(0);expect(f.remote.health).toBe(100);expect(f.game.score).toBe(37);expect(f.state.ammo[weapon]).toBe(9);
    expect(f.game.network.hit).toHaveBeenCalledExactlyOnceWith({shotId:'shot',targetId:'target'});
    const event=f.receipt();f.game.handleNetworkEvent(event);f.game.handleNetworkEvent(event);
    expect(hurts(f.game)).toHaveLength(rays);expect(f.game.hits).toBe(1);expect(f.game.networkEffectCounts.damageEvents).toBe(1);
    expect(f.game.showHitmarker).toHaveBeenCalledOnce();expect(f.game.originalCombatEffectPresentation.spawnBlood).toHaveBeenCalledTimes(rays);
   }finally{f.dispose();}
  });
  it(`${map}: exact identity keeps unmatched shot/target, third-party and explosion receipt audio`,()=>{
   const f=fixture(map,'shotgun');try{
    f.game.tryFire();expect(hurts(f.game)).toHaveLength(2);
    f.game.handleNetworkEvent(f.receipt('other-shot','target','local','hitscan',1001));expect(hurts(f.game)).toHaveLength(4);
    f.game.handleNetworkEvent(f.receipt('shot','other-target','local','hitscan',1002));expect(hurts(f.game)).toHaveLength(6);
    f.game.handleNetworkEvent(f.receipt('shot','target','third','hitscan',1003));expect(hurts(f.game)).toHaveLength(7);
    f.game.handleNetworkEvent(f.receipt('shot','target','local','explosion',1004));expect(hurts(f.game)).toHaveLength(8);
    f.game.handleNetworkEvent(f.receipt());expect(hurts(f.game)).toHaveLength(8);
    expect(f.game.networkEffectCounts.damageEvents).toBe(5);
   }finally{f.dispose();}
  });
  it(`${map}: a queued shot with no authoritative damage response retains presentation without credit`,()=>{
   const f=fixture(map,'shotgun');try{
    f.game.network.shoot.mockReturnValue('queued-but-rejected');f.game.tryFire();
    expect(f.order).toEqual(['hurt','blood','flash','hurt','blood','flash']);expect(hurts(f.game)).toHaveLength(2);
    expect(f.remote.health).toBe(100);expect(f.game.hits).toBe(0);expect(f.game.kills).toBe(0);expect(f.game.score).toBe(37);
    expect(f.game.networkEffectCounts.damageEvents).toBe(0);expect(f.state.ammo.shotgun).toBe(9);
    expect(f.game.predictedSourceHitHurts.has(JSON.stringify(['queued-but-rejected','target']))).toBe(true);
   }finally{f.dispose();}
  });
  it(`${map}: prediction identity history stays at256 and actual network clear removes it`,()=>{
   const f=fixture(map,'pistol');try{
    for(let i=0;i<257;i++){
     f.game.elapsed++;f.game.pendingSourceShot=undefined;f.state.ammo.pistol=10;f.ready();f.game.network.shoot.mockReturnValue('bounded-'+i);
     f.game.tryFire();f.game.clearOriginalMuzzleFlashes();
    }
    expect(f.game.predictedSourceHitHurts.size).toBe(256);expect(f.collection.muzzleModels.stats().allocated).toBe(1);
    expect(f.game.predictedSourceHitHurts.has(JSON.stringify(['bounded-0','target']))).toBe(false);
    expect(f.game.predictedSourceHitHurts.has(JSON.stringify(['bounded-256','target']))).toBe(true);
    f.game.clearNetworkProjectiles();expect(f.game.predictedSourceHitHurts.size).toBe(0);
    const before=hurts(f.game).length;f.game.handleNetworkEvent(f.receipt('bounded-256'));expect(hurts(f.game)).toHaveLength(before+1);
   }finally{f.dispose();}
  });
 }
});
