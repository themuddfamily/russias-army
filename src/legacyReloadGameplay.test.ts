import {afterEach,describe,expect,it,vi} from 'vitest';
import {Game} from './game';
import {WeaponState,type WeaponId} from './weapons';
import type {LoadoutMessage} from './network';
import {weaponReloadDuration} from '../shared/legacyReload';

interface ReloadHarness {
  elapsed:number;weaponState:WeaponState;mode:string;
  legacyRifleRefillStartedAt:number;
  network:{clientId:string;reload:ReturnType<typeof vi.fn>};
  reload(sourceCallback?:boolean):void;applyNetworkLoadout(loadout:LoadoutMessage):void;switchWeapon(weapon:WeaponId):void;tryFire():void;updateWeaponReload():void;
  updateHud:ReturnType<typeof vi.fn>;
}
function client(map='woodlands',online=false):ReloadHarness {
  const game=Object.create(Game.prototype) as ReloadHarness;
  const weaponState=new WeaponState(map);weaponState.select('rifle');weaponState.ammo.rifle=12;weaponState.reserve.rifle=140;
  Object.assign(game,{weaponState,archivalWinter:map==='winter',elapsed:5,mode:online?'online':'solo',playerAlive:true,
    network:{clientId:'local',reload:vi.fn(()=>true)},autoReloadAt:Infinity,authoritativeLoadoutUpdates:0,legacyRifleRefillStartedAt:-10,
    keys:new Set(),rightMouseAiming:false,controlsPreset:'legacy',
    updateHud:vi.fn(),setMessage:vi.fn(),audio:{play:vi.fn()},syncWeaponPresentation:vi.fn(),publishNetworkTransform:vi.fn()});
  return game;
}
function authoritative(game:ReloadHarness,ammo:number,reserve:number,reloading:boolean):LoadoutMessage {
  const weapons=Object.fromEntries(Object.keys(game.weaponState.ammo).map(id=>[id,{ammo:game.weaponState.ammo[id as WeaponId],reserve:game.weaponState.reserve[id as WeaponId]}])) as LoadoutMessage['weapons'];
  weapons.rifle={ammo,reserve};
  return {type:'loadout',playerId:'local',serverTime:1000,equipped:'rifle',
    weapons,
    reload:reloading?{weapon:'rifle',completesAt:2000}:null,
  };
}
afterEach(()=>vi.unstubAllGlobals());
describe('actual client immediate source reload flow',()=>{
  it.each(['barrack','woodlands'])('starts %s AK lowering at acceptance and does not restart after server acceptance or lockout expiry',map=>{
    const game=client(map,true);game.reload(true);const startedAt=game.legacyRifleRefillStartedAt;
    expect(startedAt).toBe(5);
    const duration=weaponReloadDuration(map,'rifle',1.75);game.elapsed=5+.1;
    game.applyNetworkLoadout({...authoritative(game,28,124,true),reload:{weapon:'rifle',completesAt:1000+(duration-.1)*1000}});
    expect(game.legacyRifleRefillStartedAt).toBe(startedAt);
    game.elapsed=5+duration;game.updateWeaponReload();expect(game.weaponState.reloading).toBe(false);
    expect(game.legacyRifleRefillStartedAt).toBe(startedAt);
    game.applyNetworkLoadout(authoritative(game,28,124,false));expect(game.legacyRifleRefillStartedAt).toBe(startedAt);
  });
  it('resumes a reconnect reload from authoritative remaining time instead of starting its animation again',()=>{
    const game=client('woodlands',true);game.elapsed=10;
    game.applyNetworkLoadout({...authoritative(game,28,124,true),reload:{weapon:'rifle',completesAt:1400}});
    expect(game.legacyRifleRefillStartedAt).toBeCloseTo(9.4);expect(game.weaponState.reloadEnd).toBeCloseTo(10.4);
    game.elapsed=10.1;game.applyNetworkLoadout({...authoritative(game,28,124,true),reload:{weapon:'rifle',completesAt:1300}});
    expect(game.legacyRifleRefillStartedAt).toBeCloseTo(9.4);
  });
  it('restores all thirty source Dragunov rounds when an online shot cannot be queued',()=>{
    const game=client('woodlands',true);game.weaponState.select('sniper');
    Object.assign(game,{phase:'playing',needsAuthoritativeSpawn:false,onlineWeaponReadyAt:0,recoil:0,shots:0,
      network:{clientId:'local',connected:true},triggerViewModelFire:vi.fn(),spawnMuzzleParticles:vi.fn(),spawnCasing:vi.fn(),hitscan:()=>false,
      muzzleLight:{intensity:0},worldMuzzleLight:{intensity:0}});
    expect(game.weaponState.ammo.sniper).toBe(30);game.tryFire();
    expect(game.weaponState.ammo.sniper).toBe(30);expect(game.weaponState.reserve.sniper).toBe(12);expect(game.updateHud).toHaveBeenCalledOnce();
  });
  it.each(['barrack','woodlands'])('updates %s HUD balances immediately and permits selection during its source wait',map=>{
    const game=client(map);game.reload(true);
    expect(game.weaponState.ammo.rifle).toBe(28);expect(game.weaponState.reserve.rifle).toBe(124);expect(game.updateHud).toHaveBeenCalledOnce();
    expect(game.weaponState.reloadEnd).toBe(5+weaponReloadDuration(map,'rifle',1.75));
    game.switchWeapon('pistol');expect(game.weaponState.current).toBe('pistol');expect(game.weaponState.reloading).toBe(true);expect(game.weaponState.fire(5.2)).toBe(false);
    expect(game.weaponState.update(game.weaponState.reloadEnd-.001)).toBe(false);
    expect(game.weaponState.update(game.weaponState.reloadEnd)).toBe(true);
    expect(game.weaponState.ammo.rifle).toBe(28);expect(game.weaponState.reserve.rifle).toBe(124);
  });
  it('rolls back immediate optimistic balances when the online request cannot be sent',()=>{
    const game=client('woodlands',true);game.network.reload.mockReturnValue(false);game.reload();
    expect(game.network.reload).toHaveBeenCalledWith('rifle');expect(game.weaponState.reloading).toBe(false);expect(game.weaponState.reloadEnd).toBe(0);
    expect(game.weaponState.ammo.rifle).toBe(12);expect(game.weaponState.reserve.rifle).toBe(140);
    expect(game.legacyRifleRefillStartedAt).toBe(-10);
    expect(game.weaponState.update(100)).toBe(false);
  });
  it('reconciles immediate authoritative ammunition while retaining the server reload lock and never transferring twice',()=>{
    const game=client('woodlands',true);game.reload();
    game.applyNetworkLoadout(authoritative(game,28,124,true));
    expect(game.weaponState.reloading).toBe(true);expect(game.weaponState.ammo.rifle).toBe(28);expect(game.weaponState.reserve.rifle).toBe(124);
    expect(game.weaponState.fire(5.2)).toBe(false);expect(game.weaponState.update(5.999)).toBe(false);
    expect(game.weaponState.update(6)).toBe(true);expect(game.weaponState.ammo.rifle).toBe(28);expect(game.weaponState.reserve.rifle).toBe(124);
    game.applyNetworkLoadout(authoritative(game,28,124,false));expect(game.weaponState.reloading).toBe(false);
    expect(game.weaponState.update(100)).toBe(false);expect(game.weaponState.reserve.rifle).toBe(124);
  });
  it('restores rejected authoritative balances and cannot apply a stale local completion later',()=>{
    const game=client('woodlands',true);game.reload();game.applyNetworkLoadout(authoritative(game,12,140,false));
    expect(game.weaponState.reloading).toBe(false);expect(game.weaponState.ammo.rifle).toBe(12);expect(game.weaponState.reserve.rifle).toBe(140);
    expect(game.legacyRifleRefillStartedAt).toBe(-10);
    expect(game.weaponState.update(100)).toBe(false);expect(game.weaponState.ammo.rifle).toBe(12);
  });
  it('retains deferred Winter transfer and its existing timer',()=>{
    const game=client('winter');game.reload();expect(game.weaponState.ammo.rifle).toBe(12);expect(game.weaponState.reserve.rifle).toBe(140);
    expect(game.weaponState.reloadEnd).toBe(6.75);expect(game.weaponState.update(6.749)).toBe(false);
    expect(game.weaponState.update(6.75)).toBe(true);expect(game.weaponState.ammo.rifle).toBe(30);expect(game.weaponState.reserve.rifle).toBe(122);
  });
});
