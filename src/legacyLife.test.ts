import * as THREE from 'three';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {Game} from './game';
import {WeaponState} from './weapons';
import {readFileSync} from 'node:fs';
import {SoldierMaterialLibrary} from './soldierMaterials';
import {createOriginalSoldierResources,type OriginalSoldierAssets} from './originalSoldier';
import {ORIGINAL_WEAPON_TEXTURES,type OriginalWeaponGeometryData} from './originalWeapons';
import type {NetworkGameEvent,NetworkPlayer,NetworkSnapshot} from './network';

interface LifeHarness {
  phase:string;mode:string;archivalWinter:boolean;playerAlive:boolean;health:number;deaths:number;kills:number;elapsed:number;playerRespawnAt:number;score:number;
  network?:{clientId:string;dispose:ReturnType<typeof vi.fn>};latestNetworkSnapshot?:NetworkSnapshot;needsAuthoritativeSpawn:boolean;
  keys:Set<string>;firing:boolean;aiming:boolean;chatOpen:boolean;weaponState:WeaponState;
  killPlayer(attacker?:unknown):void;registerKill(headshot:boolean,victim:unknown):void;registerBotKill(attacker:unknown,victim:unknown):void;
  updatePlayerRespawn():void;updateNetworkRespawn():void;applyNetworkSnapshot(snapshot:NetworkSnapshot):void;
  handleNetworkEvent(event:NetworkGameEvent):void;returnToMenu():void;
  endRound(won:boolean,winnerName?:string):void;
  switchWeapon:ReturnType<typeof vi.fn>;spawnEnemies:ReturnType<typeof vi.fn>;updateHud:ReturnType<typeof vi.fn>;
}
function player(alive=true):NetworkPlayer {
  return {id:'local',name:'COMRADE',health:alive?100:0,maxHealth:100,armor:0,frags:13,deaths:alive?0:1,alive,respawnAt:null,
    transform:{position:{x:0,y:0,z:35},velocity:{x:0,y:0,z:0},yaw:0,pitch:0,grounded:true,weapon:'rifle'}};
}
function snapshot(alive=true):NetworkSnapshot {
  return {map:'barrack',room:'ROOM',tick:1,serverTime:1000,fragLimit:12,state:'playing',winnerId:null,players:[player(alive)],projectiles:[]};
}
function harness(archivalWinter=false,online=false){
  const elements=new Map<string,{value:string;textContent:string;innerHTML:string;classList:{add(v:string):void;remove(v:string):void;toggle(v:string,on:boolean):void;contains(v:string):boolean};blur:ReturnType<typeof vi.fn>}>();
  const element=(id:string)=>{
    if(!elements.has(id)){
      const classes=new Set(['hidden']);
      elements.set(id,{value:'',textContent:'',innerHTML:'',blur:vi.fn(),classList:{add:v=>classes.add(v),remove:v=>classes.delete(v),toggle:(v,on)=>{if(on)classes.add(v);else classes.delete(v);},contains:v=>classes.has(v)}});
    }
    return elements.get(id)!;
  };
  const exitPointerLock=vi.fn();
  vi.stubGlobal('document',{getElementById:element,exitPointerLock,pointerLockElement:null,fullscreenElement:null,documentElement:{dataset:{}}});
  vi.stubGlobal('navigator',{});
  const game=Object.create(Game.prototype) as LifeHarness;
  const dispose=vi.fn();
  Object.assign(game,{phase:'playing',mode:online?'online':'solo',archivalWinter,mapId:'barrack',localCallsign:'COMRADE',
    playerAlive:true,health:100,armor:0,deaths:0,kills:13,shots:10,hits:5,score:0,elapsed:30,startTime:10,playerRespawnAt:0,
    keys:new Set(['KeyW','ShiftLeft']),firing:true,aiming:true,rightMouseAiming:true,chatOpen:true,
    velocity:new THREE.Vector3(1,2,3),camera:new THREE.PerspectiveCamera(),weaponState:new WeaponState(),
    immersiveCaptureGeneration:0,keyboardCaptureAttempt:0,authoritativeLoadoutUpdates:0,
    network:online?{clientId:'local',dispose}:undefined,latestNetworkSnapshot:online?snapshot():undefined,needsAuthoritativeSpawn:false,
    remotePlayers:new Map(),enemies:[],audio:{play:vi.fn(),playOriginalHurt:vi.fn()},snowTracks:{clear:vi.fn(),resetActor:vi.fn()},
    clearRemotePlayers:vi.fn(),clearNetworkProjectiles:vi.fn(),clearNetworkDrops:vi.fn(),
    reconcileNetworkItems:vi.fn(),reconcileNetworkProjectiles:vi.fn(),updateNetworkStatus:vi.fn(),
    handledNetworkDamageEvents:new Set(),handledNetworkEliminations:new Set(),networkEffectCounts:{damageEvents:0,eliminations:0},
    showNetworkDamage:vi.fn(),addKillFeed:vi.fn(),dropWeapon:vi.fn(),updateHud:vi.fn(),setMessage:vi.fn(),
    safestPlayerSpawn:()=>new THREE.Vector3(2,0,35),switchWeapon:vi.fn(),spawnEnemies:vi.fn(),resetCombatPresentation:vi.fn(),
    setMode:vi.fn(),
  });
  return {game,element,dispose,exitPointerLock};
}
const source={kind:'hitscan',weapon:'rifle',zone:'body',shotId:'shot-1',position:{x:0,y:1,z:35}} as const;
function killed():NetworkGameEvent{return {type:'killed',serverTime:1000,data:{killerId:'attacker',victimId:'local',killerFrags:1,victimDeaths:1,source}};}
// Imported GI/weapon resources exercise actual Enemy removal. DOM, network
// disposal and the menu UI stay injected; no renderer or actor scheduler runs.
const readAsset=(path:string)=>JSON.parse(readFileSync(new URL('../public/assets/'+path,import.meta.url),'utf8'));
const soldierGeometry=readAsset('original-soldier/geometry.json') as OriginalSoldierAssets['geometry'];
const rigMotion=readAsset('original-soldier/rig-motion.json') as OriginalSoldierAssets['rigMotion'];
const weaponGeometry=readAsset('original-weapons/geometry.json') as OriginalWeaponGeometryData;
function actualEnemies(game:LifeHarness){
  const gi=new THREE.Texture(),textures=new Map(ORIGINAL_WEAPON_TEXTURES.map(name=>[name,new THREE.Texture()]));
  const resources=createOriginalSoldierResources({geometry:soldierGeometry,rigMotion,texture:gi},{geometry:weaponGeometry,textures});
  const library=new SoldierMaterialLibrary({presentation:'modern',tier:'low'}),scene=new THREE.Scene();
  const g=game as any;
  Object.assign(g,{scene,soldierMaterialLibrary:library,originalSoldierResources:resources,arena:{spawnPoints:[new THREE.Vector3(),new THREE.Vector3(2,0,3)]}});
  g.spawnEnemies=vi.fn((Game.prototype as any).spawnEnemies.bind(g));g.spawnEnemies();
  const enemy=g.enemies[0],rig=enemy.sourceRig,dispose=vi.spyOn(enemy,'dispose');g.spawnEnemies.mockClear();
  return {enemy,rig,dispose,scene,clear(){g.clearEnemies();resources.dispose();library.dispose();gi.dispose();for(const texture of textures.values())texture.dispose();}};
}
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});

describe('actual client single-life Legacy flow',()=>{
  for(const mapId of ['barrack','woodlands'] as const)it(`selects ${mapId} recovered result art on actual death`,()=>{
    const {game,element}=harness();const setEdition=vi.fn();
    const start=vi.fn();Object.assign(game,{mapId,originalResultUi:{setEdition,start}});
    game.killPlayer();
    expect(setEdition).toHaveBeenCalledExactlyOnceWith(mapId);
    expect(start).toHaveBeenCalledExactlyOnceWith(game.elapsed);
    expect(element('result').classList.contains('source-result')).toBe(true);
    expect(element('result-kicker').textContent).toContain('Our commiserations, Comrade');
  });
  for(const mapId of ['barrack','woodlands'] as const)it(`${mapId}: restores both recovered invitation paragraphs without enabling historical GO`,()=>{
    const {game,element}=harness();
    Object.assign(game,{mapId,localCallsign:'<b>COMRADE & CO</b>',score:275});
    const go=Object.assign(element('original-result-submit'),{disabled:true});
    game.endRound(false,'<img src=x>');
    expect(element('result-kicker').textContent).toBe('Our commiserations, Comrade <b>COMRADE & CO</b>, you are now pieces of Russian history, thanks to <img src=x>...');
    expect(element('result-kicker').innerHTML).toBe('');
    expect(element('result-stats').textContent).toBe('Would you like to submit your score of 275 points?\n\nClick go to see if you are worthy of Kremlin fame.');
    expect(element('result-stats').innerHTML).toBe('');
    expect(go.disabled).toBe(true);
  });
  it('preserves the actual callsign and attacker on a damaged-first online death',()=>{
    const {game,element}=harness(false,true);game.kills=0;
    game.latestNetworkSnapshot={...snapshot(),players:[{...player(),frags:0},{...player(),id:'survivor',name:'SURVIVOR',frags:0}]};
    game.handleNetworkEvent({type:'damaged',serverTime:1000,data:{attackerId:'survivor',targetId:'local',damage:105,health:0,lethal:true,source}});
    expect(game.deaths).toBe(1);
    expect(element('result-kicker').textContent).toBe('Our commiserations, Comrade COMRADE, you are now pieces of Russian history, thanks to SURVIVOR...');
    expect(element('result-stats').textContent).toBe('Would you like to submit your score of 0 points?\n\nClick go to see if you are worthy of Kremlin fame.');
    expect(element('result-stats').innerHTML).toBe('');
  });
  it('uses actual source points and the callsign for self damage without HTML interpolation',()=>{
    const {game,element}=harness(false,true);game.score=410;
    game.latestNetworkSnapshot={...snapshot(),players:[{...player(),name:'<img src=x>'}]};
    game.handleNetworkEvent({type:'damaged',serverTime:1000,data:{attackerId:'local',targetId:'local',damage:105,health:0,lethal:true,source}});
    expect(element('result-kicker').textContent).toBe('Our commiserations, Comrade <img src=x>, you are now pieces of Russian history, thanks to <img src=x>...');
    expect(element('result-kicker').innerHTML).toBe('');
    expect(element('result-stats').textContent).toBe('Would you like to submit your score of 410 points?\n\nClick go to see if you are worthy of Kremlin fame.');
  });
  it('preserves named killed-first delivery and honest unknown snapshot-only attribution',()=>{
    const named=harness(false,true);
    named.game.latestNetworkSnapshot={...snapshot(),players:[player(),{...player(),id:'attacker',name:'VOLKOV'}]};
    named.game.handleNetworkEvent(killed());
    expect(named.element('result-kicker').textContent).toContain('thanks to VOLKOV...');
    const reconnect=harness(false,true);reconnect.game.applyNetworkSnapshot(snapshot(false));
    expect(reconnect.element('result-kicker').textContent).toContain('thanks to UNKNOWN...');
  });
  it('ends a default life immediately, closes chat/input and never respawns on a timer',()=>{
    const {game,element,exitPointerLock}=harness();game.killPlayer();
    expect(game.phase).toBe('lost');expect(game.playerAlive).toBe(false);expect(game.deaths).toBe(1);expect(game.playerRespawnAt).toBe(0);
    expect(game.keys.size).toBe(0);expect(game.firing).toBe(false);expect(game.aiming).toBe(false);expect(game.chatOpen).toBe(false);
    expect(element('result').classList.contains('hidden')).toBe(false);expect(element('result-title').textContent).toBe('GAME OVER');
    expect(element('result-kicker').textContent).not.toContain('frag');expect(element('respawn-overlay').classList.contains('active')).toBe(false);
    expect(element('result-stats').textContent).toBe('Would you like to submit your score of 0 points?\n\nClick go to see if you are worthy of Kremlin fame.');expect(exitPointerLock).toHaveBeenCalledOnce();
    game.elapsed=100;game.updatePlayerRespawn();game.killPlayer();
    expect(game.playerAlive).toBe(false);expect(game.deaths).toBe(1);expect(game.switchWeapon).not.toHaveBeenCalled();
  });
  it('keeps archived Winter timed respawns and frag-limit rules',()=>{
    const {game,element}=harness(true);game.killPlayer();
    expect(game.phase).toBe('playing');expect(game.playerRespawnAt).toBeCloseTo(31.3);expect(element('respawn-overlay').classList.contains('active')).toBe(true);
    game.elapsed=31;game.updatePlayerRespawn();expect(game.playerAlive).toBe(false);
    game.elapsed=32;game.updatePlayerRespawn();expect(game.playerAlive).toBe(true);expect(game.health).toBe(100);expect(game.switchWeapon).toHaveBeenCalledWith('rifle');
    game.registerKill(false,{deaths:0,name:'BOT',group:{position:{x:0,y:0,z:0}}});expect(game.phase).toBe('won');
  });
  it('lets player and bot frags exceed twelve while the default local life continues',()=>{
    const {game}=harness();game.registerKill(false,{deaths:0,name:'BOT',group:{position:{x:0,y:0,z:0}}});expect(game.kills).toBe(14);expect(game.phase).toBe('playing');
    const attacker={frags:12,name:'BOT A'};game.registerBotKill(attacker,{deaths:0,name:'BOT B',group:{position:{x:0,y:0,z:0}}});
    expect(attacker.frags).toBe(13);expect(game.phase).toBe('playing');
  });
  it('renders the source death message before intentionally leaving and ignores late killed/snapshot/respawn messages',()=>{
    const {game,element,dispose}=harness(false,true);
    game.handleNetworkEvent({type:'damaged',serverTime:1000,data:{attackerId:'attacker',targetId:'local',damage:105,health:0,lethal:true,source}});
    expect(game.phase).toBe('lost');expect(game.deaths).toBe(1);expect(game.network).toBeUndefined();expect(dispose).toHaveBeenCalledOnce();
    const stats=element('result-stats').textContent;expect(stats).toBe('Would you like to submit your score of 0 points?\n\nClick go to see if you are worthy of Kremlin fame.');
    game.handleNetworkEvent(killed());game.applyNetworkSnapshot(snapshot(false));game.applyNetworkSnapshot(snapshot(true));
    game.handleNetworkEvent({type:'respawn',serverTime:3000,data:{playerId:'local',position:{x:2,y:0,z:35},health:100}});
    game.updateNetworkRespawn();expect(game.phase).toBe('lost');expect(game.playerAlive).toBe(false);expect(game.deaths).toBe(1);
    expect(dispose).toHaveBeenCalledOnce();expect(element('result-stats').textContent).toBe(stats);
  });
  it('handles a dead first/reconnect snapshot and killed-first delivery without requiring a prior alive snapshot',()=>{
    for(const first of ['snapshot','killed'] as const){
      const {game,dispose}=harness(false,true);game.needsAuthoritativeSpawn=true;
      if(first==='snapshot')game.applyNetworkSnapshot(snapshot(false));else game.handleNetworkEvent(killed());
      expect(game.phase).toBe('lost');expect(game.playerAlive).toBe(false);expect(game.deaths).toBe(1);expect(dispose).toHaveBeenCalledOnce();
    }
  });
  it('ignores room-wide winner conditions for a living default player',()=>{
    const {game}=harness(false,true);
    game.applyNetworkSnapshot({...snapshot(),state:'finished',winnerId:'local'});
    game.handleNetworkEvent({type:'winner',serverTime:1000,data:{playerId:'local',name:'COMRADE',frags:13}});
    expect(game.phase).toBe('playing');expect(game.playerAlive).toBe(true);
  });
  it('returns REPLAY to entry with results hidden rather than silently starting another life',()=>{
    const {game,element}=harness();game.killPlayer();game.returnToMenu();
    expect(game.phase).toBe('menu');expect(game.playerAlive).toBe(false);
    expect(element('result').classList.contains('hidden')).toBe(true);expect(element('menu').classList.contains('hidden')).toBe(false);
    expect(element('callsign').value).toBe('COMRADE');
    expect(game.spawnEnemies).not.toHaveBeenCalled();expect(game.switchWeapon).not.toHaveBeenCalled();
  });
  for(const mapId of ['barrack','woodlands'] as const)for(const mode of ['solo','online'] as const)
    it(`${mapId} ${mode}: REPLAY disposes the existing GI and leaves entry without replacement actors`,()=>{
      const {game,element,dispose:disconnect}=harness(false,mode==='online');Object.assign(game,{mapId});
      const actors=actualEnemies(game);try{
        expect(actors.rig).toBeDefined();expect(actors.enemy.group.parent).toBe(actors.scene);
        game.endRound(false,'VOLKOV');game.returnToMenu();
        expect(game.phase).toBe('menu');expect(element('callsign').value).toBe('COMRADE');
        expect(element('result').classList.contains('hidden')).toBe(true);
        expect(actors.dispose).toHaveBeenCalledOnce();expect(actors.enemy.group.parent).toBeNull();
        expect((game as any).enemies).toHaveLength(0);expect(actors.enemy.hitMeshes).toHaveLength(0);
        expect(game.spawnEnemies).not.toHaveBeenCalled();expect(game.switchWeapon).not.toHaveBeenCalled();
        if(mode==='online')expect(disconnect).toHaveBeenCalledOnce();
      }finally{actors.clear();}
    });
  it('keeps Winter menu population after clearing the previous actors',()=>{
    const {game}=harness(true);game.returnToMenu();
    expect(game.phase).toBe('menu');expect(game.spawnEnemies).toHaveBeenCalledOnce();
  });
});
