import * as THREE from 'three';
import {describe,expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {Game} from './game';
import {installOriginalSoloLegacyFixture} from './originalSoloLegacy.fixture';
import {isOriginalSoloBotShotCapture} from './originalSoloBotShotCapture';
import {SoldierMaterialLibrary} from './soldierMaterials';
import {createOriginalSoldierResources,type OriginalSoldierAssets} from './originalSoldier';
import {createOriginalWeapons,ORIGINAL_WEAPON_TEXTURES,type OriginalWeaponGeometryData} from './originalWeapons';
import {registerOriginalMapRuntime,type OriginalMapRuntime} from '../shared/originalMapRuntime';
import {OriginalBarrelWorld} from '../shared/originalBarrelWorld';
import {OriginalDoorWorld,type OriginalDoorTracks} from '../shared/originalDoorWorld';
import {createOriginalBlast} from '../shared/originalExplosives';
import {originalPlayerEye,ORIGINAL_PLAYER_EYE_OFFSET,ORIGINAL_PLAYER_RADIUS} from '../shared/originalPlayerPhysics';
import type {OriginalSoloObserverWorlds} from '../shared/originalSoloObserverWorld';

const read=(path:string)=>JSON.parse(readFileSync(`public/assets/${path}`,'utf8'));
const runtimes=new Map<'barrack'|'woodlands',OriginalMapRuntime>();
function mapRuntime(map:'barrack'|'woodlands'){
 let runtime=runtimes.get(map);if(!runtime){runtime=registerOriginalMapRuntime(map,read(`original-scenes/${map==='woodlands'?'woodland':map}/scene.json`));runtimes.set(map,runtime);}return runtime;
}
function fixture(map:'barrack'|'woodlands'){
 const library=new SoldierMaterialLibrary({presentation:'legacy',tier:'low'}),gi=new THREE.Texture();
 const textures=new Map(ORIGINAL_WEAPON_TEXTURES.map(name=>[name,new THREE.Texture()]));
 const weaponAssets={geometry:read('original-weapons/geometry.json') as OriginalWeaponGeometryData,textures};
 const resources=createOriginalSoldierResources({geometry:read('original-soldier/geometry.json') as OriginalSoldierAssets['geometry'],rigMotion:read('original-soldier/rig-motion.json') as OriginalSoldierAssets['rigMotion'],texture:gi},weaponAssets);
 const weapons=createOriginalWeapons(weaponAssets),runtime=mapRuntime(map),barrels=new OriginalBarrelWorld(runtime),doors=new OriginalDoorWorld(runtime.data,runtime.scale,map==='barrack'?read('original-scenes/barrack/doors.json') as OriginalDoorTracks:{version:1,doors:[]});
 const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera();camera.position.set(1000,1000,1000);
 // Real Enemy construction, Game control/health/scoring/projectile handlers and
 // coordinator run. DOM/audio and dropped-item presentation sinks (including the admitted human detach sink) are inert.
 // Elevated spawns isolate contacts from the map; this is not a map traversal
 // or WebGL acceptance test.
 const game=Object.assign(Object.create(Game.prototype),{
  mapId:map,mode:'solo',phase:'playing',archivalWinter:false,playerAlive:true,health:100,hits:0,kills:0,score:0,deaths:0,
  elapsed:1,yaw:0,pitch:0,recoil:0,weaponSwayX:0,weaponSwayY:0,keys:new Set(),controlsPreset:'legacy',chatOpen:false,arrowMovement:false,
  originalActorDispatchGeneration:0,originalProjectileContactCount:0,combatEffectsFrozen:false,originalPlayerContacts:[],originalBlasts:[],projectiles:[],enemies:[],soloBotShots:[],weaponDrops:[],
  camera,velocity:new THREE.Vector3(),scene,remotePlayers:new Map(),localCallsign:'Local goody',soldierMaterialLibrary:library,originalSoldierResources:resources,originalWeapons:weapons,
  weaponState:{current:'rifle'},arena:{runtime,barrelWorld:barrels,doorWorld:doors,spawnPoints:Array.from({length:8},(_,i)=>new THREE.Vector3(1000+i*20,1000-1.72,1000)),syncBarrels:vi.fn()},
  playOriginalCombatSound:vi.fn(),playPlayerHurtSound:vi.fn(),showHitmarker:vi.fn(),updateHud:vi.fn(),setMessage:vi.fn(),addKillFeed:vi.fn(),dropWeapon:vi.fn(),dropSourceSoloWeapon:vi.fn(),spawnExplosion:vi.fn(),
 }) as any;
 installOriginalSoloLegacyFixture(game);
 game.spawnEnemies();const worlds=game.ensureSoloWorlds() as OriginalSoloObserverWorlds;
 return {game,worlds,dispose(){game.clearEnemies();weapons.dispose();resources.dispose();library.dispose();gi.dispose();for(const texture of textures.values())texture.dispose();}};
}
// Run the actual callback chain. Tests concerned with damage lifetime remove
// unrelated distant barrels explicitly; private contact coverage is separate.
function actorCallback(s:ReturnType<typeof fixture>){
 s.game.elapsed+=1/30;
 const human=s.worlds.worlds.get('player')!;
 s.game.updateOriginalPlayerCallback(true);s.game.completeSoloGoody();s.game.updateOriginalExplosives(true);
 expect(s.game.health).toBe(human.health.canonical);
}

describe('actual solo Game uses observer-local source worlds',()=>{
 for(const map of ['barrack','woodlands'] as const){
  it(`${map}: retains existing momentum once at human world birth`,()=>{
   const s=fixture(map);try{
    s.game.disposeSoloWorlds();s.game.velocity.set(3,0,0);
    const worlds=s.game.ensureSoloWorlds() as OriginalSoloObserverWorlds,human=worlds.worlds.get('player')!;
    for(const world of worlds.worlds.values())world.barrels.applySnapshots([]);
    const body=human.body,eye={...originalPlayerEye(body)};
    expect(body.velocity).toEqual({x:2,y:0,z:0});
    s.game.updateOriginalPlayerCallback(true);s.game.completeSoloGoody();s.game.updateOriginalExplosives(true);
    expect(human.body).toBe(body);expect(s.game.camera.position.x).toBeCloseTo(eye.x+.1,10);expect(body.velocity.x).toBe(2);
   }finally{s.dispose();}
  });
  it(`${map}: binds the human scene and gives all seven bots independent physical state`,()=>{
   const s=fixture(map);try{
    expect(s.worlds.worlds.size).toBe(8);
    const human=s.worlds.worlds.get('player')!;
    expect(human.barrels).toBe(s.game.arena.barrelWorld);expect(human.doors).toBe(s.game.arena.doorWorld);
    for(const enemy of s.game.enemies){const world=s.worlds.worlds.get(enemy.id)!;
     expect(world.body).not.toBe(human.body);expect(world.health).not.toBe(human.health);expect(world.barrels).not.toBe(human.barrels);expect(world.doors).not.toBe(human.doors);
     expect(world.projectiles).not.toBe(human.projectiles);expect(world.blasts).not.toBe(human.blasts);
    }
   }finally{s.dispose();}
  });
  it(`${map}: a bot's private blast bypasses authored spawn invulnerability without hurting the human`,()=>{
   const s=fixture(map);try{
    const enemy=s.game.enemies[0],world=s.worlds.worlds.get(enemy.id)!;enemy.invulnerableUntil=100;
    for(const w of s.worlds.worlds.values())w.barrels.applySnapshots([]);
    const admission=s.worlds.launch({ownerId:'player',weapon:'launcher',eye:s.game.camera.position,direction:{x:0,y:1,z:0}},s.game.elapsed);expect(admission.ok).toBe(true);if(!admission.ok)throw Error('Expected launch');
    const {launch}=admission;
    // Only this recipient has detonated; sibling projectile copies stay live.
    world.projectiles.delete(launch.id);world.blasts.set(launch.id,{launch,state:createOriginalBlast(originalPlayerEye(world.body),launch.ownerId,launch.weapon)});
    for(let i=0;i<16;i++)actorCallback(s);
    expect(enemy.health).toBe(20);expect(s.game.health).toBe(100);expect(s.game.hits).toBe(16);expect(s.game.kills).toBe(0);
    expect(world.blasts.size).toBe(0);expect(s.game.originalBlasts).toEqual([]);expect(s.game.spawnExplosion).not.toHaveBeenCalled();
   }finally{s.dispose();}
  });
  it(`${map}: bot launcher and RPG shots create source actors despite a failed hitscan roll`,()=>{
   const s=fixture(map);const random=vi.spyOn(Math,'random').mockReturnValue(.999);try{
    for(const w of s.worlds.worlds.values())w.barrels.applySnapshots([]);
    const bots=[s.game.enemies[3],s.game.enemies[5]];
    for(const enemy of bots){enemy.sourceTargets.set('player',s.game.camera.position.clone());s.game.combatantShoot(enemy,null,new THREE.Vector3(),999);}
    expect(s.game.health).toBe(100);expect(s.game.soloBotShots).toHaveLength(2);
    const queued=[...s.game.soloBotShots];expect(queued.every(isOriginalSoloBotShotCapture)).toBe(true);expect(queued.map((shot:any)=>shot.ownerId)).toEqual(bots.map(enemy=>enemy.id));
    for(const shot of queued){expect(Object.isFrozen(shot)).toBe(true);expect(Object.isFrozen(shot.aimDirection)).toBe(true);expect(shot.authoredDamage).toBe(999);expect(shot.chanceRoll).toBe(.999);expect(shot.chance).toBeLessThan(shot.chanceRoll);expect(shot.targetLife).toBe(s.worlds.worlds.get('player')!.lifeGeneration);}
    actorCallback(s);
    for(const enemy of bots){const local=[...s.worlds.worlds.get(enemy.id)!.projectiles.values()].find(p=>p.launch.ownerId===enemy.id)!;
     expect(local).toBeDefined();expect(local.state.weapon).toBe(enemy.weapon);expect(local.state.remainingCallbacks).toBe(enemy.weapon==='rpg'?200:60);
     expect(new THREE.Vector3().copy(local.launch.direction).distanceTo(queued.find((shot:any)=>shot.ownerId===enemy.id).aimDirection)).toBeLessThan(1e-12);
     expect([...s.worlds.worlds.get('player')!.projectiles.values()].some(p=>p.launch.id===local.launch.id)).toBe(true);
    }
    expect(s.game.projectiles).toHaveLength(2);
   }finally{random.mockRestore();s.dispose();}
  });
  it(`${map}: commits source health once and routes one elimination through actual scoring`,()=>{
   const s=fixture(map);try{
    const enemy=s.game.enemies[0],human=s.worlds.worlds.get('player')!,world=s.worlds.worlds.get(enemy.id)!;
    const flick=world.health.flick;
    // Exercise the actual human callback and its bound persistent body once.
    for(const w of s.worlds.worlds.values())w.barrels.applySnapshots([]);
    s.game.updateOriginalPlayerCallback(true);s.game.completeSoloGoody();s.game.updateOriginalExplosives(true);
    expect(world.health.flick).toBe(-flick);expect(human.health.flick).toBe(-flick);
    expect(s.game.damageSoloEnemy(enemy,110)).toBe('killed');
    expect(s.game.damageSoloEnemy(enemy,110)).toBe('ignored');
    expect(enemy.alive).toBe(false);expect(enemy.deaths).toBe(1);expect(s.game.kills).toBe(1);expect(s.game.score).toBe(30);
    // This spy is the scoring bookkeeping hook, not a displayed item birth.
    expect(s.game.dropWeapon).toHaveBeenCalledTimes(1);expect(s.game.dropSourceSoloWeapon).not.toHaveBeenCalled();expect(s.worlds.worlds.has(enemy.id)).toBe(false);
    actorCallback(s);expect(s.game.dropSourceSoloWeapon).toHaveBeenCalledTimes(1);
    s.game.syncSoloMirrors();expect(s.game.dropSourceSoloWeapon).toHaveBeenCalledTimes(1);
    enemy.respawn(new THREE.Vector3(1100,1000-1.72,1000),s.game.elapsed);s.game.registerSoloEnemy(enemy);
    const replay=s.worlds.worlds.get(enemy.id)!;expect(replay.lifeGeneration).toBe(world.lifeGeneration+1);expect(replay.health.canonical).toBe(100);expect(replay.projectiles.size).toBe(0);
   }finally{s.dispose();}
  });
  it(`${map}: human contacts change only the human projectile copy and retain real callback diagnostics`,()=>{
   const s=fixture(map);try{
    const human=s.worlds.worlds.get('player')!,bot=s.worlds.worlds.get(s.game.enemies[0].id)!;
    for(const w of s.worlds.worlds.values())w.barrels.applySnapshots([]);
    const center={...human.body.position},admission=s.worlds.launch({ownerId:'player',weapon:'launcher',eye:s.game.camera.position,direction:{x:-1,y:0,z:0}},s.game.elapsed);if(!admission.ok)throw Error('Expected launch');
    const local=human.projectiles.get(admission.launch.id)!.state,remote=bot.projectiles.get(admission.launch.id)!.state;
    const extent=-Math.min(...local.convex!.vertices.map(v=>v.x));
    local.position={x:center.x+ORIGINAL_PLAYER_RADIUS+extent+.08,y:center.y,z:center.z};local.velocity={x:-10,y:0,z:0};remote.position={...local.position};remote.velocity={...local.velocity};
    s.game.sourceCallbackCapture={records:[],capacity:1,contactCapacity:100,droppedCallbacks:0,droppedContacts:0};s.game.sourceCallbackCaptureContactCount=0;
    s.game.updateOriginalPlayerCallback(true);s.game.completeSoloGoody();s.game.updateOriginalExplosives(true);
    expect(local.velocity.x).not.toBe(remote.velocity.x);expect(human.body.velocity.x).not.toBe(0);expect(bot.body.velocity.x).toBe(0);
    expect(s.game.sourceCallbackCapture.records[0].contacts.some((c:any)=>c.bodyA.id==='player'||c.bodyB.id==='player')).toBe(true);
    expect(s.game.camera.position.y).toBeCloseTo(human.body.position.y+ORIGINAL_PLAYER_EYE_OFFSET,12);
   }finally{s.dispose();}
  });
 }
});
