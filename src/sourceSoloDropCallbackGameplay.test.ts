import * as THREE from 'three';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {Game} from './game';
import {installOriginalSoloLegacyFixture} from './originalSoloLegacy.fixture';
import {WeaponState} from './weapons';
import {originalPickupFeedback} from '../shared/originalFeedbackText';
import type {WeaponId} from '../shared/protocol';
import {SoldierMaterialLibrary} from './soldierMaterials';
import {createOriginalSoldierResources,type OriginalSoldierAssets} from './originalSoldier';
import {createOriginalWeapons,ORIGINAL_WEAPON_TEXTURES,type OriginalWeaponGeometryData} from './originalWeapons';
import {registerOriginalMapRuntime,type OriginalMapRuntime} from '../shared/originalMapRuntime';
import {OriginalBarrelWorld} from '../shared/originalBarrelWorld';
import {OriginalDoorWorld,type OriginalDoorTracks} from '../shared/originalDoorWorld';
import {ORIGINAL_DROP_AMMO,ORIGINAL_PICKUP_SCORE,originalDropPosition} from '../shared/originalPickupRules';
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
 // coordinator run. DOM/audio sinks are inert; imported dropped gun creation and pickup are real.
 // Elevated spawns isolate contacts from the map; this is not a map traversal
 // or WebGL acceptance test.
 const game=Object.assign(Object.create(Game.prototype),{
  mapId:map,mode:'solo',phase:'playing',archivalWinter:false,playerAlive:true,health:100,hits:0,kills:0,score:0,deaths:0,
  elapsed:1,yaw:0,pitch:0,recoil:0,weaponSwayX:0,weaponSwayY:0,keys:new Set(),controlsPreset:'legacy',chatOpen:false,arrowMovement:false,
  originalActorDispatchGeneration:0,originalProjectileContactCount:0,combatEffectsFrozen:false,originalPlayerContacts:[],originalBlasts:[],projectiles:[],enemies:[],soloBotShots:[],
  camera,velocity:new THREE.Vector3(),scene,remotePlayers:new Map(),localCallsign:'Local goody',soldierMaterialLibrary:library,originalSoldierResources:resources,originalWeapons:weapons,
  weaponDrops:[],worldWeaponMaterials:new Map(),weaponState:{current:'rifle',unarmed:false,addReserve:vi.fn()},reload:vi.fn(),appendChat:vi.fn(),syncWeaponPresentation:vi.fn(),arena:{runtime,barrelWorld:barrels,doorWorld:doors,spawnPoints:Array.from({length:8},(_,i)=>new THREE.Vector3(1000+i*20,1000-1.72,1000)),syncBarrels:vi.fn()},
  playOriginalCombatSound:vi.fn(),playPlayerHurtSound:vi.fn(),showOriginalHurt:vi.fn(),spawnImpact:vi.fn(),surfaceNormalAt:()=>new THREE.Vector3(0,1,0),showHitmarker:vi.fn(),updateHud:vi.fn(),setMessage:vi.fn(),addKillFeed:vi.fn(),spawnExplosion:vi.fn(),
 }) as any;
 installOriginalSoloLegacyFixture(game);
 game.spawnEnemies();const worlds=game.ensureSoloWorlds() as OriginalSoloObserverWorlds;
 return {game,worlds,dispose(){game.clearWeaponDrops();game.clearEnemies();weapons.dispose();resources.dispose();library.dispose();gi.dispose();for(const texture of textures.values())texture.dispose();}};
}
// Actual source physics → goody/mirror → actor callbacks; elevated actors
// isolate this pickup lifecycle from map contacts and native rendering timing.
function callback(s:ReturnType<typeof fixture>){
 s.game.elapsed+=1/30;s.game.beginSoloCallback();s.game.updateOriginalPlayerCallback(true);s.game.completeSoloGoody();s.game.updateOriginalExplosives(true);
}
function noBarrels(s:ReturnType<typeof fixture>){for(const world of s.worlds.worlds.values())world.barrels.applySnapshots([]);}
afterEach(()=>vi.restoreAllMocks());

describe('actual source solo human drop callback lifecycle',()=>{
 for(const map of ['barrack','woodlands'] as const){
  it(`${map}: private death waits for accepted human detach and uses immutable final packet weapon and refreshed eye`,()=>{
   const s=fixture(map);try{
    noBarrels(s);const enemy=s.game.enemies[0],world=s.worlds.worlds.get(enemy.id)!;
    enemy.weapon='sniper';world.body.velocity={x:3,y:0,z:0};callback(s);callback(s);
    const human=s.worlds.worlds.get('player')!,before=human.mirror.freeze().find(p=>p.id===enemy.id)!;
    expect(s.game.damageSoloEnemy(enemy,110)).toBe('killed');expect(s.game.weaponDrops).toHaveLength(0);
    const pending=human.mirror.freeze().find(p=>p.id===enemy.id)!;expect(pending.alive).toBe(false);expect(pending.position).toEqual(before.position);
    // Neither mutable owner presentation nor a later local loadout is the
    // transmitted baddy metadata that die is required to use.
    enemy.group.position.set(-800,-900,-1000);enemy.weapon='pistol';
    for(let i=0;i<3;i++)s.game.syncSoloMirrors();expect(s.game.weaponDrops).toHaveLength(0);
    callback(s);const corpse=human.mirror.freezeCorpses().find(c=>c.ownerId===enemy.id)!;
    expect(corpse).toBeDefined();expect(corpse.position.x).toBeGreaterThan(before.position.x);
    expect(s.game.weaponDrops).toHaveLength(1);const drop=s.game.weaponDrops[0];
    expect(drop.weapon).toBe('sniper');expect(drop.group.name).toBe('original-drop-sniper');expect(drop.group.parent).toBe(s.game.scene);expect(drop.group.children).toHaveLength(1);
    expect(drop.group.position.toArray()).toEqual(Object.values(originalDropPosition({...corpse.position,y:corpse.position.y+1.72},s.game.arena.runtime.scale)));
    expect(drop.expiresAt).toBeNull();const birth=drop.group.position.clone();
    s.game.syncSoloMirrors();s.game.syncSoloMirrors();callback(s);expect(s.game.weaponDrops).toHaveLength(1);expect(drop.group.position).toEqual(birth);
   }finally{s.dispose();}
  });
  it(`${map}: replay same actor ID gets a distinct callback drop without duplicating its earlier life`,()=>{
   const s=fixture(map);try{
    noBarrels(s);const enemy=s.game.enemies[0];callback(s);expect(s.game.damageSoloEnemy(enemy,110)).toBe('killed');callback(s);
    expect(s.game.weaponDrops).toHaveLength(1);const first=s.game.weaponDrops[0];
    enemy.respawn(new THREE.Vector3(1200,1000-1.72,1040),s.game.elapsed,true);enemy.weapon='rpg';s.game.registerSoloEnemy(enemy);callback(s);
    expect(s.game.weaponDrops).toHaveLength(1);expect(s.game.damageSoloEnemy(enemy,110)).toBe('killed');expect(s.game.weaponDrops).toHaveLength(1);callback(s);
    expect(s.game.weaponDrops).toHaveLength(2);expect(s.game.weaponDrops[0]).toBe(first);expect(s.game.weaponDrops[1].weapon).toBe('rpg');expect(s.game.weaponDrops[1].group.position.distanceTo(first.group.position)).toBeGreaterThan(100);
    callback(s);s.game.syncSoloMirrors();expect(s.game.weaponDrops).toHaveLength(2);
   }finally{s.dispose();}
  });
  it(`${map}: omitted where packets produce exactly one drop at the accepted -450 timeout callback`,()=>{
   const s=fixture(map);try{
    noBarrels(s);const enemy=s.game.enemies[0];for(const bot of s.game.enemies)bot.weapon='pistol';enemy.weapon='launcher';callback(s);
    // Explicit packet-absence seam: withdraw producers without sending a dead
    // packet. The actual human mirror/coordinator remains and owns its timeout.
    for(const id of [...s.worlds.worlds.keys()])if(id!=='player')s.worlds.worlds.delete(id);
    const steps=s.worlds.remotePoses('player').find(p=>p.id===enemy.id)!.steps;
    for(let i=0;i<steps+449;i++)callback(s);
    expect(s.game.weaponDrops).toHaveLength(0);expect(s.worlds.remotePoses('player').some(p=>p.id===enemy.id)).toBe(true);
    callback(s);expect(s.worlds.remotePoses('player').some(p=>p.id===enemy.id)).toBe(false);
    const drops=s.game.weaponDrops.filter((d:any)=>d.weapon==='launcher');expect(drops).toHaveLength(1);
    expect(drops[0].group.name).toBe('original-drop-launcher');expect(drops[0].group.parent).toBe(s.game.scene);
    const count=s.game.weaponDrops.length;callback(s);s.game.syncSoloMirrors();expect(s.game.weaponDrops).toHaveLength(count);
   }finally{s.dispose();}
  });
  it(`${map}: pickup uses the next captured source callback and collects its admitted gun only once`,()=>{
   const s=fixture(map);try{
    noBarrels(s);const enemy=s.game.enemies[0],human=s.worlds.worlds.get('player')!;
    enemy.weapon='sniper';callback(s);expect(s.game.damageSoloEnemy(enemy,110)).toBe('killed');
    // Start an actual physics callback, then move the human body to the pending
    // baddy position before its detach/birth. This declared teleported fixture
    // isolates collection scheduling, not traversal or native callback order.
    s.game.elapsed+=1/30;s.game.beginSoloCallback();s.game.updateOriginalPlayerCallback(true);
    const pose=human.mirror.freeze().find(p=>p.id===enemy.id)!;
    human.body.position={...pose.position};human.body.velocity={x:0,y:0,z:0};
    s.game.camera.position.set(pose.position.x,pose.position.y+1.72,pose.position.z);
    s.game.completeSoloGoody();expect(s.game.weaponDrops).toHaveLength(1);const drop=s.game.weaponDrops[0];
    s.game.camera.position.copy(drop.group.position);s.game.velocity.set(0,0,0);s.game.checkpointSoloHumanBody();
    s.game.updateOriginalExplosives(true);expect(s.game.weaponDrops).toHaveLength(1);expect(s.game.weaponState.addReserve).not.toHaveBeenCalled();
    const score=s.game.score;callback(s);expect(s.game.weaponDrops).toHaveLength(0);expect(drop.group.parent).toBeNull();
    expect(s.game.weaponState.addReserve).toHaveBeenCalledExactlyOnceWith('sniper',ORIGINAL_DROP_AMMO.sniper);expect(s.game.reload).toHaveBeenCalledTimes(1);expect(s.game.appendChat).toHaveBeenCalledTimes(1);expect(s.game.score).toBe(score+ORIGINAL_PICKUP_SCORE);
    callback(s);expect(s.game.weaponState.addReserve).toHaveBeenCalledTimes(1);expect(s.game.score).toBe(score+ORIGINAL_PICKUP_SCORE);
   }finally{s.dispose();}
  });
  it(`${map}: captured older sniper precedes newer pistol and reloads the selected gun with real loadout arithmetic`,()=>{
   const s=fixture(map);try{
    const state=new WeaponState();state.map=map;for(const id of Object.keys(state.ammo) as WeaponId[]){state.ammo[id]=0;state.reserve[id]=0;}state.unarmed=true;s.game.weaponState=state;
    s.game.reload=(Game.prototype as any).reload;const reload=vi.spyOn(s.game,'reload'),reloadOrder:WeaponId[]=[],startReload=state.startReload;
    vi.spyOn(state,'startReload').mockImplementation((now,sourceCallback)=>{reloadOrder.push(state.current);return startReload.call(state,now,sourceCallback);});
    const olderRig=s.game.enemies[0].sourceRig,newerRig=s.game.enemies[1].sourceRig;olderRig.bindSourceWeapon('sniper');newerRig.bindSourceWeapon('pistol');
    s.game.dropSourceSoloWeapon('sniper',{x:1000,y:1000-1.72,z:1000},olderRig);s.game.dropSourceSoloWeapon('pistol',{x:1000,y:1000-1.72,z:1000},newerRig);
    const [older,newer]=s.game.weaponDrops;s.game.camera.position.copy(older.group.position);
    // Explicit placement isolates collection order from movement/contact timing.
    newer.group.position.copy(older.group.position);const removeOlder=vi.spyOn(olderRig,'removeSourceGun'),removeNewer=vi.spyOn(newerRig,'removeSourceGun');
    s.game.beginSoloCallback();const captured=s.game.soloPickupCapture;expect(captured).toEqual([older,newer]);s.game.updateWeaponDrops(1/30,captured);
    expect(state.current).toBe('sniper');expect(state.unarmed).toBe(false);expect([state.ammo.sniper,state.reserve.sniper,state.ammo.pistol,state.reserve.pistol]).toEqual([5,0,0,20]);
    expect(reload).toHaveBeenCalledTimes(2);expect(reloadOrder).toEqual(['sniper','sniper']);expect(s.game.score).toBe(2*ORIGINAL_PICKUP_SCORE);
    expect(s.game.appendChat.mock.calls).toEqual([['',originalPickupFeedback('sniper'),'feedback'],['',originalPickupFeedback('pistol'),'feedback']]);
    expect(removeOlder).toHaveBeenCalledExactlyOnceWith(older.sourceModel);expect(removeNewer).toHaveBeenCalledExactlyOnceWith(newer.sourceModel);expect(older.sourceModel.parent).toBeNull();expect(newer.sourceModel.parent).toBeNull();expect(s.game.weaponDrops).toHaveLength(0);
    s.game.updateWeaponDrops(1/30,captured);expect(reload).toHaveBeenCalledTimes(2);expect(s.game.score).toBe(10);expect(removeOlder).toHaveBeenCalledTimes(1);expect(removeNewer).toHaveBeenCalledTimes(1);
   }finally{s.dispose();}
  });
  it(`${map}: terminal unregister before the pending death callback creates no collectible`,()=>{
   const s=fixture(map);try{
    noBarrels(s);const enemy=s.game.enemies[0];callback(s);expect(s.game.damageSoloEnemy(enemy,110)).toBe('killed');expect(s.game.weaponDrops).toHaveLength(0);
    s.game.resetOriginalActorDispatch();s.game.syncSoloMirrors();expect(s.game.soloWorlds).toBeUndefined();expect(s.game.weaponDrops).toHaveLength(0);
   }finally{s.dispose();}
  });
 }
 it('captured subset order survives reordered backing inventory and skips removed, duplicate and newborn records',()=>{
  const s=fixture('woodlands');try{
   const make=(index:number,weapon:WeaponId)=>{const rig=s.game.enemies[index].sourceRig;rig.bindSourceWeapon(weapon);s.game.dropSourceSoloWeapon(weapon,{x:1000,y:1000-1.72,z:1000},rig);return s.game.weaponDrops.at(-1);};
   const first=make(0,'sniper'),second=make(1,'pistol'),removed=make(2,'shotgun');s.game.camera.position.copy(first.group.position);for(const drop of [second,removed])drop.group.position.copy(first.group.position);
   s.game.beginSoloCallback();const captured=s.game.soloPickupCapture;s.game.removeWeaponDrop(s.game.weaponDrops.indexOf(removed));const newborn=make(3,'rifle');newborn.group.position.copy(first.group.position);
   s.game.weaponDrops.splice(0,3,second,newborn,first);s.game.updateWeaponDrops(1/30,[captured[0],captured[2],captured[1],captured[0]]);
   expect(s.game.weaponState.addReserve.mock.calls).toEqual([['sniper',ORIGINAL_DROP_AMMO.sniper],['pistol',ORIGINAL_DROP_AMMO.pistol]]);expect(s.game.appendChat.mock.calls.map((call:any[])=>call[1])).toEqual([originalPickupFeedback('sniper'),originalPickupFeedback('pistol')]);expect(s.game.weaponDrops).toEqual([newborn]);expect(newborn.sourceModel.parent).toBe(newborn.group);expect(s.game.score).toBe(10);
  }finally{s.dispose();}
 });

});
