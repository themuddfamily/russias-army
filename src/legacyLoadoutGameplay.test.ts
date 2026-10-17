import * as THREE from 'three';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {Game} from './game';
import {WeaponState,type WeaponId} from './weapons';
import {getLegacySpawnLoadout} from '../shared/legacyLoadout';
import {getLegacyMap,type LegacyMapId} from '../shared/legacyMaps';
import {readFileSync} from 'node:fs';
import {getOriginalMapRuntime,registerOriginalMapRuntime} from '../shared/originalMapRuntime';
import type {OriginalMapAssets,OriginalMapData} from './originalMapAssets';

let maps:OriginalMapAssets|undefined;
function originalMaps():OriginalMapAssets {
  if(maps)return maps;
  maps=Object.fromEntries((['barrack','woodlands'] as const).map(map=>{
    const edition=map==='woodlands'?'woodland':'barrack';
    const data=JSON.parse(readFileSync(`public/assets/original-scenes/${edition}/scene.json`,'utf8')) as OriginalMapData;
    registerOriginalMapRuntime(map,data);
    const textures=Object.fromEntries(Object.keys(data.textures).map(name=>[name,new THREE.Texture()]));
    return [map,{data,textures,doorTracks:map==='barrack'?JSON.parse(readFileSync('public/assets/original-scenes/barrack/doors.json','utf8')):{version:1,doors:[]}}];
  })) as OriginalMapAssets;
  return maps;
}

interface LoadoutHarness {
  weaponState:WeaponState;mapId:LegacyMapId;phase:string;weaponModels:Map<WeaponId,THREE.Group>;
  restartState():void;selectMap(map:LegacyMapId):void;
  legacyArena?:{dispose():void};
}
const context={fillStyle:'',strokeStyle:'',lineWidth:1,fillRect(){},beginPath(){},moveTo(){},lineTo(){},quadraticCurveTo(){},closePath(){},stroke(){},ellipse(){},fill(){},createRadialGradient(){return {addColorStop(){}};}};
const clients:LoadoutHarness[]=[];
function client(map:LegacyMapId|'winter'):LoadoutHarness {
  const nodes=new Map<string,{value:string;classList:{add:ReturnType<typeof vi.fn>;remove:ReturnType<typeof vi.fn>;toggle:ReturnType<typeof vi.fn>};focus:ReturnType<typeof vi.fn>;blur:ReturnType<typeof vi.fn>;replaceChildren:ReturnType<typeof vi.fn>}>();
  vi.stubGlobal('document',{body:{dataset:{}},getElementById:(id:string)=>{if(!nodes.has(id))nodes.set(id,{value:'',classList:{add:vi.fn(),remove:vi.fn(),toggle:vi.fn()},focus:vi.fn(),blur:vi.fn(),replaceChildren:vi.fn()});return nodes.get(id);},
    createElement:(tag:string)=>{if(tag!=='canvas')throw new Error(tag);return {width:0,height:0,getContext:()=>({...context})};}});
  const game=Object.create(Game.prototype) as LoadoutHarness;
  const mapId=map==='winter'?'barrack':map;
  Object.assign(game,{weaponState:new WeaponState(map),mapId,archivalWinter:map==='winter',phase:'menu',mode:'solo',controlsPreset:'legacy',
    originalMaps:map==='winter'?undefined:originalMaps(),
    arena:{spawnPoints:getLegacyMap(mapId).spawnPoints.map(p=>new THREE.Vector3(...p)),pickups:[]},scene:new THREE.Scene(),
    camera:new THREE.PerspectiveCamera(),velocity:new THREE.Vector3(),keys:new Set<string>(),rightMouseAiming:false,chatOpen:false,
    pendingCollections:new Map(),combatImpactMarks:{clear:vi.fn()},atmosphere:{setMap:vi.fn()},snowTracks:{clear:vi.fn(),resetActor:vi.fn()},
    weaponModels:new Map((['pistol','shotgun','rifle','launcher','rpg','sniper'] as const).map(id=>[id,new THREE.Group()])),weaponMetadata:new Map(),
    viewRecoilPosition:new THREE.Vector3(),viewRecoilRotation:new THREE.Vector3(),elapsed:5,audio:{play:vi.fn()},
    clearEnemies:vi.fn(),spawnEnemies:vi.fn(),clearNetworkDrops:vi.fn(),clearRemotePlayers:vi.fn(),clearNetworkProjectiles:vi.fn(),clearWeaponDrops:vi.fn(),
    resetCombatPresentation:vi.fn(),updateHud:vi.fn(),setMessage:vi.fn(),projectiles:[],originalBlasts:[],originalFlashes:[],originalProjectileAccumulator:0,originalProjectileContactCount:0,casings:[],
  });
  clients.push(game);return game;
}
function expectSourceLoadout(game:LoadoutHarness,map:LegacyMapId){
  const expected=getLegacySpawnLoadout(map)!;
  expect(game.weaponState.ammo).toEqual(expected.ammo);expect(game.weaponState.reserve).toEqual(expected.reserve);
  expect(game.weaponState.current).toBe(expected.equipped);
  expect([...game.weaponModels].filter(([,model])=>model.visible).map(([id])=>id)).toEqual(['launcher']);
}
afterEach(()=>{for(const game of clients.splice(0))game.legacyArena?.dispose();vi.unstubAllGlobals();});

describe('source loadouts in actual Game reset and map selection',()=>{
  it.each(['barrack','woodlands'] as const)('starts and replays %s with source ammunition and RG6 presentation',map=>{
    const game=client(map);game.restartState();expectSourceLoadout(game,map);
    expect((game as any).spawnEnemies).toHaveBeenCalledOnce();
    game.weaponState.fire(1);game.weaponState.select('rifle');game.weaponState.ammo.rifle=0;
    expect(game.weaponState.startReload(2)).toBe(true);
    game.restartState();expectSourceLoadout(game,map);expect(game.weaponState.update(100)).toBe(false);
    expect((game as any).spawnEnemies).toHaveBeenCalledTimes(2);
  });
  it.each(['barrack','woodlands'] as const)('clears all physical source input during %s replay even when talk was preserving it',map=>{
    const game=client(map) as any;game.arena.runtime=getOriginalMapRuntime(map);game.arena.spawnPoints=game.arena.runtime.spawnPoints.map((p:{x:number;y:number;z:number})=>new THREE.Vector3(p.x,p.y,p.z));game.phase='playing';game.chatOpen=true;game.weaponState.setOriginalTyping(true);
    game.keys=new Set(['KeyW','Space','ControlLeft']);game.firing=true;game.rightMouseAiming=true;game.aiming=true;game.originalMouseDelta={x:30,y:-12};
    game.restartState();
    expect(game.chatOpen).toBe(false);expect(game.keys.size).toBe(0);expect(game.firing).toBe(false);expect(game.rightMouseAiming).toBe(false);expect(game.aiming).toBe(false);expect(game.originalMouseDelta).toEqual({x:0,y:0});
    game.closeChat(false);expect(game.firing).toBe(false);expect(game.rightMouseAiming).toBe(false);expect(game.keys.size).toBe(0);expect(game.originalMouseDelta).toEqual({x:0,y:0});
  });
  it.each(['barrack','woodlands'] as const)('clears all physical source input at a fresh %s authoritative spawn and does not restore it on delayed talk closure',map=>{
    for(const resetLoadout of [false,true]){
      const game=client(map) as any;game.arena.runtime={};game.mode='online';game.phase='playing';game.chatOpen=true;game.weaponState.setOriginalTyping(true);
      Object.assign(game,{publishNetworkTransform:vi.fn(),keys:new Set(['KeyW','Space','ControlRight']),firing:true,rightMouseAiming:true,aiming:true,originalMouseDelta:{x:30,y:-12}});
      game.applyAuthoritativeSpawn({alive:true,health:100,armor:0,transform:{position:{x:2,y:0,z:3},velocity:{x:0,y:0,z:0},yaw:0,pitch:0,grounded:true,weapon:'launcher'}},resetLoadout);
      expect(game.keys.size).toBe(0);expect(game.firing).toBe(false);expect(game.rightMouseAiming).toBe(false);expect(game.aiming).toBe(false);expect(game.originalMouseDelta).toEqual({x:0,y:0});
      expect(game.chatOpen).toBe(true);game.closeChat(false);
      expect(game.firing).toBe(false);expect(game.rightMouseAiming).toBe(false);expect(game.keys.size).toBe(0);expect(game.originalMouseDelta).toEqual({x:0,y:0});
    }
  });
  it('updates map context and resets the loadout/viewmodel when changing the selected map',()=>{
    const game=client('barrack');game.restartState();game.weaponState.ammo.launcher=0;expect(game.weaponState.startReload(1)).toBe(true);
    game.selectMap('woodlands');expect(game.mapId).toBe('woodlands');expect(game.weaponState.map).toBe('woodlands');expectSourceLoadout(game,'woodlands');expect(game.weaponState.update(100)).toBe(false);
    game.weaponState.ammo.sniper=0;game.selectMap('barrack');expectSourceLoadout(game,'barrack');
  });
  for(const map of ['barrack','woodlands'] as const){
    it(`${map}: menu map selection leaves solo and online actor lists unpopulated`,()=>{
      const destination=map==='barrack'?'woodlands':'barrack';
      for(const mode of ['solo','online'] as const){
        const game=client(map) as any;game.mode=mode;game.refreshRooms=vi.fn();
        game.selectMap(destination);
        expect(game.mapId).toBe(destination);expect(game.phase).toBe('menu');expectSourceLoadout(game,destination);
        expect(game.clearEnemies).toHaveBeenCalledOnce();expect(game.spawnEnemies).not.toHaveBeenCalled();
        if(mode==='online')expect(game.refreshRooms).toHaveBeenCalledOnce();else expect(game.refreshRooms).not.toHaveBeenCalled();
      }
    });
    it(`${map}: active solo map changes retain actor creation in both playing and paused states`,()=>{
      const destination=map==='barrack'?'woodlands':'barrack';
      for(const phase of ['playing','paused'] as const){
        const game=client(map) as any;game.phase=phase;
        game.selectMap(destination);
        expect(game.phase).toBe(phase);expect(game.mapId).toBe(destination);expectSourceLoadout(game,destination);
        expect(game.clearEnemies).toHaveBeenCalledOnce();expect(game.spawnEnemies).toHaveBeenCalledOnce();
      }
    });
  }
  it('preserves Winter replay ammunition/equipped rifle and ignores default-map selection',()=>{
    const game=client('winter');game.restartState();
    expect(game.weaponState.current).toBe('rifle');expect(game.weaponState.ammo.rifle).toBe(30);expect(game.weaponState.reserve.rifle).toBe(150);
    expect([...game.weaponModels].filter(([,model])=>model.visible).map(([id])=>id)).toEqual(['rifle']);
    game.selectMap('woodlands');expect(game.weaponState.map).toBe('winter');expect(game.legacyArena).toBeUndefined();
  });
});
