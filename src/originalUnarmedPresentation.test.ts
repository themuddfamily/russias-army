import * as THREE from 'three';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {Game} from './game';
import {WeaponState,type WeaponId} from './weapons';
import {OriginalWeaponPresentation} from './originalWeaponPresentation';
import type {LoadoutMessage} from '../shared/protocol';

afterEach(()=>vi.unstubAllGlobals());
const ids:WeaponId[]=['pistol','shotgun','rifle','launcher','rpg','sniper'];
interface Harness {
  elapsed:number;firing:boolean;keys:Set<string>;weaponState:WeaponState;weaponModels:Map<WeaponId,THREE.Group>;
  network:{reload:ReturnType<typeof vi.fn>};weaponDrops:unknown[];score:number;
  velocity:THREE.Vector3;originalWeaponPresentation:OriginalWeaponPresentation;
  updateOriginalWeaponPresentation(dt:number):void;
  updateSourceWeaponInput():void;applyNetworkLoadout(loadout:LoadoutMessage):void;
  updateWeaponDrops(dt:number):void;appendChat:ReturnType<typeof vi.fn>;
}
function client(map:string,mode='solo'):Harness {
  const game=Object.create(Game.prototype) as Harness;
  const models=new Map(ids.map(id=>[id,new THREE.Group()]));
  for(const [id,model] of models)model.visible=id==='launcher';
  Object.assign(game,{mapId:map,archivalWinter:false,mode,phase:'playing',playerAlive:true,chatOpen:false,
    elapsed:0,weaponState:new WeaponState(map),sourceDisplayedWeapon:'launcher',weaponModels:models,weaponMetadata:new Map(),
    originalWeaponPresentation:new OriginalWeaponPresentation('launcher'),originalWeapons:{models,setLoaded:vi.fn()},velocity:new THREE.Vector3(),keys:new Set(),firing:false,
    aiming:false,rightMouseAiming:false,controlsPreset:'legacy',arrowMovement:false,
    camera:new THREE.PerspectiveCamera(),viewCamera:new THREE.PerspectiveCamera(),viewProjection:new THREE.Group(),
    el:()=>({classList:{toggle:vi.fn()},style:{setProperty:vi.fn()}}),publishNetworkTransform:vi.fn(),pitch:0,yaw:0,recoil:0,nextSourceReloadPoll:-Infinity,
    viewRecoilPosition:new THREE.Vector3(),viewRecoilRotation:new THREE.Vector3(),
    legacyRifleRefillStartedAt:-10,autoReloadAt:Infinity,authoritativeLoadoutUpdates:0,
    arena:{pickups:[],runtime:{scale:1}},weaponDrops:[],scene:new THREE.Scene(),score:0,
    network:{clientId:'local',reload:vi.fn(()=>true),connected:false},
    updateHud:vi.fn(),setMessage:vi.fn(),appendChat:vi.fn(),audio:{play:vi.fn()}});
  return game;
}
function exhaust(game:Harness):void {for(const id of ids){game.weaponState.ammo[id]=0;game.weaponState.reserve[id]=0;}}
function visible(game:Harness):WeaponId[] {return ids.filter(id=>game.weaponModels.get(id)!.visible);}
function packet(game:Harness,time:number,unarmed:boolean):LoadoutMessage {
  return {type:'loadout',playerId:'local',serverTime:time,equipped:'launcher',unarmed,reload:null,
    weapons:Object.fromEntries(ids.map(id=>[id,{ammo:game.weaponState.ammo[id],reserve:game.weaponState.reserve[id]}])) as LoadoutMessage['weapons']};
}
for(const map of ['barrack','woodlands'])describe(`${map} actual Game source VOID model refresh`,()=>{
  it.each(['solo','online'])('%s removes every model after the empty held-fire sort, then restores a same-slot pickup',mode=>{
    const game=client(map,mode);exhaust(game);game.firing=true;game.updateSourceWeaponInput();
    expect(game.weaponState.unarmed).toBe(true);expect(visible(game)).toEqual([]);
    if(mode==='online')expect(game.network.reload).toHaveBeenCalledWith('launcher',true);
    // Source pickup chooses its weapon before sortweapons/reload. Online
    // transports that selection with the same cached enum, so equality alone
    // must not prevent the model from returning.
    if(mode==='online'){
      const loadout=packet(game,2,false);loadout.weapons.launcher={ammo:6,reserve:6};game.applyNetworkLoadout(loadout);
      expect(game.weaponState.ammo.launcher).toBe(6);
      game.applyNetworkLoadout(packet(game,1,true)); // stale packet cannot erase restoration
      expect(game.weaponState.unarmed).toBe(false);
    }else{
      game.firing=false;const group=new THREE.Group();game.weaponDrops=[{group,weapon:'launcher',expiresAt:null,baseY:0}];
      game.updateWeaponDrops(1/30);expect(game.appendChat).toHaveBeenCalledExactlyOnceWith('','Ammo for the rg6.','feedback');expect(game.weaponDrops).toHaveLength(0);expect(game.weaponState.ammo.launcher).toBe(6);
    }
    expect(visible(game)).toEqual(['launcher']);
  });
  it.each(['solo','online'])('%s retains the model for the distinct direct-R empty return',mode=>{
    const game=client(map,mode);exhaust(game);game.keys.add('KeyR');game.updateSourceWeaponInput();
    expect(game.weaponState.unarmed).toBe(true);expect(visible(game)).toEqual(['launcher']);
    if(mode==='online'){
      expect(game.network.reload).toHaveBeenCalledWith('launcher');
      const loadout=packet(game,1,true);loadout.sourceDisplayedWeapon='launcher';game.applyNetworkLoadout(loadout);
      expect(visible(game)).toEqual(['launcher']); // unarmed alone cannot identify a sort call
    }
  });
  it.each([false,true])('online empty RPG firing=%s sends only the required post-reload sort intent',firing=>{
    const game=client(map,'online');game.weaponState.select('rpg');exhaust(game);
    for(const [id,model] of game.weaponModels)model.visible=id==='rpg';
    Object.assign(game,{sourceDisplayedWeapon:'rpg'});game.originalWeaponPresentation.equip('rpg');
    game.firing=firing;game.updateSourceWeaponInput();expect(game.weaponState.unarmed).toBe(true);
    if(firing){expect(game.network.reload).toHaveBeenCalledExactlyOnceWith('rpg',true);expect(visible(game)).toEqual([]);}
    else{expect(game.network.reload).not.toHaveBeenCalled();expect(visible(game)).toEqual(['rpg']);}
  });
  it('keeps direct-R HUD selection with the retained model and clears it on a source sort',()=>{
    const game=client(map,'online');exhaust(game);game.keys.add('KeyR');game.updateSourceWeaponInput();
    const active=new Set<WeaponId>();
    const rows=new Map(ids.map(id=>[id,{classList:{toggle:(_name:string,on:boolean)=>on?active.add(id):active.delete(id)},querySelector:()=>({textContent:''})}]));
    const elements=new Map<string,unknown>();
    vi.stubGlobal('document',{getElementById:(id:string)=>{if(!elements.has(id))elements.set(id,{tagName:'SPAN',style:{},dataset:{}});return elements.get(id);},
      querySelector:(selector:string)=>rows.get(selector.match(/"(.*?)"/)![1] as WeaponId)});
    Object.assign(game,{health:100,armor:0,grenades:0,kills:0,networkFragLimit:10,getStandings:()=>[{name:'local',frags:0}]});
    const updateHud=Reflect.get(Game.prototype,'updateHud') as ()=>void;
    updateHud.call(game);expect([...active]).toEqual(['launcher']);
    const sorted=packet(game,1,true);sorted.sourceDisplayedWeapon=null;game.applyNetworkLoadout(sorted);
    updateHud.call(game);expect([...active]).toEqual([]);expect(visible(game)).toEqual([]);
  });
  it('applies an unpredicted authority sort and ignores an older model refresh',()=>{
    const game=client(map,'online');exhaust(game);
    const hidden=packet(game,3,true);hidden.sourceDisplayedWeapon=null;game.applyNetworkLoadout(hidden);
    expect(game.weaponState.unarmed).toBe(true);expect(visible(game)).toEqual([]);
    const stale=packet(game,2,true);stale.sourceDisplayedWeapon='launcher';game.applyNetworkLoadout(stale);
    expect(visible(game)).toEqual([]);
    const restored=packet(game,4,false);restored.sourceDisplayedWeapon='launcher';restored.weapons.launcher={ammo:6,reserve:0};
    game.applyNetworkLoadout(restored);expect(visible(game)).toEqual(['launcher']);
  });
  it('retains a received direct-R stale model while armed fallback selects its recovered first usable slot',()=>{
    const game=client(map,'online');exhaust(game);
    const retained=packet(game,1,true);retained.sourceDisplayedWeapon='launcher';game.applyNetworkLoadout(retained);
    expect(visible(game)).toEqual(['launcher']);
    const armed=packet(game,2,false);armed.equipped='pistol';armed.sourceDisplayedWeapon='pistol';armed.weapons.pistol={ammo:0,reserve:4};
    game.applyNetworkLoadout(armed);expect(visible(game)).toEqual(['pistol']);
    expect(game.originalWeaponPresentation.weapon).toBe('pistol');expect(game.weaponState.ammo.pistol).toBe(0);
  });
  it('direct-R selects an armed fallback through checkweapon without transferring that fallback ammunition',()=>{
    const game=client(map);exhaust(game);game.weaponState.reserve.pistol=4;game.keys.add('KeyR');game.updateSourceWeaponInput();
    expect(game.weaponState.current).toBe('pistol');expect(visible(game)).toEqual(['pistol']);
    expect(game.weaponState.ammo.pistol).toBe(0);expect(game.weaponState.reserve.pistol).toBe(4);
  });
  it('advances ticker while VOID freezes both interpolation and the stale direct-R model pose',()=>{
    const game=client(map);exhaust(game);game.keys.add('KeyR');game.updateSourceWeaponInput();
    const model=game.weaponModels.get('launcher')!,presentation=game.originalWeaponPresentation;
    model.position.set(.1,.2,.3);presentation.sourcePosition.set(-8,-15,4);game.velocity.set(1,2,3);
    const pose=model.position.clone(),sourcePose=presentation.sourcePosition.clone(),ticker=presentation.ticker;
    game.updateOriginalWeaponPresentation(1/30);
    expect(presentation.ticker).toBeGreaterThan(ticker);expect(model.position.toArray()).toEqual(pose.toArray());
    expect(presentation.sourcePosition.toArray()).toEqual(sourcePose.toArray());expect(visible(game)).toEqual(['launcher']);
  });
  it('keeps an empty-fire hide through a matching authority packet and restores a newly usable numeric selection',()=>{
    const game=client(map,'online');exhaust(game);game.firing=true;game.updateSourceWeaponInput();
    game.applyNetworkLoadout(packet(game,1,true));expect(visible(game)).toEqual([]);
    game.firing=false;game.weaponState.addReserve('launcher',6);game.keys.add('Digit4');game.elapsed=1/30;game.updateSourceWeaponInput();
    expect(game.weaponState.unarmed).toBe(false);expect(visible(game)).toEqual(['launcher']);
  });
});
