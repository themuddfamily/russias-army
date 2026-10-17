import { describe, expect, it } from 'vitest';
import { WEAPONS, WeaponState } from './weapons';
import {weaponReloadDuration} from '../shared/legacyReload';

describe('WeaponState', () => {
  it('uses documented broad identities without changing the rifle and RPG combat contracts', () => {
    expect(WEAPONS.rifle).toMatchObject({
      id: 'rifle', name: 'AK-47', magazine: 30, reserve: 150, damage: 34,
      headMultiplier: 2.2, fireRate: .095, reloadTime: 1.75, spread: .009,
      recoil: .018, automatic: true, range: 150,
    });
    expect(WEAPONS.rpg).toMatchObject({
      id: 'rpg', name: 'RPG-7', magazine: 1, reserve: 5, damage: 150,
      headMultiplier: 1, fireRate: 1.1, reloadTime: 2.8, spread: .004,
      recoil: .07, automatic: false, range: 100,
    });
  });

  it('enforces fire rate and consumes ammunition', () => {
    const state = new WeaponState();
    expect(state.fire(1)).toBe(true);
    expect(state.ammo.rifle).toBe(29);
    expect(state.fire(1.01)).toBe(false);
    expect(state.fire(1.1)).toBe(true);
  });

  it('reloads only after the weapon reload time', () => {
    const state = new WeaponState();
    state.fire(1);
    expect(state.startReload(2)).toBe(true);
    expect(state.update(3)).toBe(false);
    expect(state.update(4)).toBe(true);
    expect(state.ammo.rifle).toBe(30);
    expect(state.reserve.rifle).toBe(149);
  });

  it('prevents reloads with a full magazine', () => {
    const state = new WeaponState();
    expect(state.startReload(0)).toBe(false);
  });

  it('completes the preserved Woodland AK transfer from 12/140 to 28/124', () => {
    const state = new WeaponState();
    state.map = 'woodlands';
    state.ammo.rifle = 12;
    state.reserve.rifle = 140;
    expect(state.startReload(2)).toBe(true);
    expect(state.ammo.rifle).toBe(28);expect(state.reserve.rifle).toBe(124);
    expect(state.update(2 + 1 - .001)).toBe(false);
    expect(state.ammo.rifle).toBe(28);
    expect(state.reserve.rifle).toBe(124);
    expect(state.update(2 + 1)).toBe(true);
    expect(state.ammo.rifle).toBe(28);
    expect(state.reserve.rifle).toBe(124);
    expect(state.startReload(5)).toBe(true);
    expect(state.ammo.rifle).toBe(28);expect(state.reserve.rifle).toBe(124);expect(state.reloading).toBe(true);
  });

  it.each([undefined, 'winter'])('retains the archival AK refill target for %s', (map) => {
    const state = new WeaponState();
    state.map = map;
    state.ammo.rifle = 12;
    state.reserve.rifle = 140;
    expect(state.startReload(0)).toBe(true);
    expect(state.update(WEAPONS.rifle.reloadTime)).toBe(true);
    expect(state.ammo.rifle).toBe(30);
    expect(state.reserve.rifle).toBe(122);
  });

  it('never transfers ammunition backwards when context changes during an archival deferred reload', () => {
    const state = new WeaponState();
    state.ammo.rifle = 29;
    expect(state.startReload(0)).toBe(true);
    state.map = 'woodlands';
    expect(state.update(WEAPONS.rifle.reloadTime)).toBe(true);
    expect(state.ammo.rifle).toBe(29);
    expect(state.reserve.rifle).toBe(150);
  });

  it.each(['barrack','woodlands'])('spawns and resets %s from preserved goody chambers/reserves with RG6 selected', (map) => {
    const expectedAmmo={pistol:8,shotgun:6,rifle:28,launcher:6,rpg:1,sniper:30};
    const expectedReserve={pistol:54,shotgun:24,rifle:140,launcher:18,rpg:12,sniper:12};
    const state=new WeaponState(map);
    expect(state.current).toBe('launcher');expect(state.ammo).toEqual(expectedAmmo);expect(state.reserve).toEqual(expectedReserve);
    state.fire(1);state.select('rifle');state.ammo.rifle=12;state.reserve.rifle=0;state.startReload(2);
    state.reset();expect(state.map).toBe(map);expect(state.current).toBe('launcher');
    expect(state.ammo).toEqual(expectedAmmo);expect(state.reserve).toEqual(expectedReserve);
    expect(state.reloading).toBe(false);expect(state.lastShot).toBe(-10);
  });

  it('keeps the source distinction between thirty starting Dragunov rounds and its twenty-eight-round refill',()=>{
    const state=new WeaponState('woodlands');state.select('sniper');
    expect(state.ammo.sniper).toBe(30);expect(state.startReload(0)).toBe(true);
    expect(state.ammo.sniper).toBe(28);expect(state.reserve.sniper).toBe(14);
    expect(state.update(state.reloadEnd)).toBe(true);
    state.ammo.sniper=20;expect(state.startReload(1)).toBe(true);expect(state.update(1+WEAPONS.sniper.reloadTime)).toBe(true);
    expect(state.ammo.sniper).toBe(28);expect(state.reserve.sniper).toBe(6);
  });

  it.each(['barrack','woodlands'])('transfers %s reserves immediately while preserving waits and ammunition through a selected-slot change',map=>{
    const state=new WeaponState(map);state.select('rifle');state.ammo.rifle=12;
    expect(state.startReload(0,true)).toBe(true);expect(state.ammo.rifle).toBe(28);expect(state.reserve.rifle).toBe(124);
    expect(state.fire(.5)).toBe(false);
    const before=state.originalCounterState!;expect(state.select('pistol')).toBe(true);expect(state.current).toBe('pistol');
    expect(state.originalCounterState!.waitgun).toBe(before.waitgun);expect(state.originalCounterState!.poldwaitgun).toBe(before.poldwaitgun);
    expect(state.startReload(.5,true)).toBe(true);expect(state.reserve.rifle).toBe(124);expect(state.reserve.pistol).toBe(54);
    expect(state.reloadEnd).toBeCloseTo(.5+weaponReloadDuration(map,'pistol',WEAPONS.pistol.reloadTime));
    expect(state.update(state.reloadEnd-.001)).toBe(false);
    expect(state.update(state.reloadEnd)).toBe(true);expect(state.ammo.rifle).toBe(28);expect(state.reserve.rifle).toBe(124);
    expect(state.update(10)).toBe(false);expect(state.reserve.rifle).toBe(124);expect(state.fire(10)).toBe(true);
  });

  it.each(['barrack','woodlands'])('preserves %s full-chamber locks, surplus refunds and loaded no-reserve reloads',map=>{
    const state=new WeaponState(map);state.select('sniper');
    expect(state.startReload(0)).toBe(true);expect(state.ammo.sniper).toBe(28);expect(state.reserve.sniper).toBe(14);
    expect(state.ammo.sniper+state.reserve.sniper).toBe(42);
    expect(state.startReload(.25)).toBe(true);expect(state.reserve.sniper).toBe(14);
    expect(state.fire(.5)).toBe(false);expect(state.update(state.reloadEnd)).toBe(true);
    state.ammo.sniper=12;state.reserve.sniper=0;
    expect(state.startReload(10)).toBe(true);expect(state.ammo.sniper).toBe(12);expect(state.reserve.sniper).toBe(0);
    expect(state.fire(10.1)).toBe(false);expect(state.update(state.reloadEnd)).toBe(true);
    state.ammo.sniper=0;expect(state.startReload(20)).toBe(false);expect(state.reloading).toBe(false);
  });

  it('resets all mutable round state', () => {
    const state = new WeaponState();
    state.fire(1);
    state.select('sniper');
    state.reset();
    expect(state.current).toBe('rifle');
    expect(state.ammo).toEqual({ pistol: 8, shotgun: 8, rifle: 30, launcher: 6, rpg: 1, sniper: 10 });
    expect(state.reserve).toEqual({ pistol: 64, shotgun: 40, rifle: 150, launcher: 18, rpg: 5, sniper: 40 });
  });

  it('adds only positive whole reserve rounds to the selected weapon',()=>{
    const state=new WeaponState();expect(state.addReserve('shotgun',7.8)).toBe(7);expect(state.reserve.shotgun).toBe(47);
    expect(state.addReserve('shotgun',-4)).toBe(0);expect(state.reserve.shotgun).toBe(47);
  });
});


describe('source RPG saved-bullet shot ordering',()=>{
  for(const map of ['barrack','woodlands'])for(const [ammo,reserve,remainingReserve] of [[1,12,12],[1,0,0],[3,4,6]]){
    it(`${map} shoots saved chamber ${ammo}/${reserve} and retains the firing reload counter`,()=>{
      const state=new WeaponState(map);state.select('rpg');state.ammo.rpg=ammo;state.reserve.rpg=reserve;
      state.applyOriginalCounter({waitgun:map==='barrack'?73:0,poldwaitgun:map==='barrack'?63:17,ready:true},10);
      expect(state.fire(10)).toBe(true);
      expect(state.ammo.rpg).toBe(ammo-1);expect(state.reserve.rpg).toBe(remainingReserve);
      expect(state.reloading).toBe(true);expect(state.originalCounterState).toEqual(map==='barrack'?{waitgun:63,poldwaitgun:83,ready:false}:{waitgun:10,poldwaitgun:17,ready:false});
      expect(state.reloadEnd).toBeCloseTo(10+(map==='barrack'?31:10)/30);
      for(let frame=1;frame<(map==='barrack'?31:10);frame++)expect(state.stepSourceCounter(10+frame/30)).toBe(false);
      expect(state.stepSourceCounter(10+(map==='barrack'?31:10)/30)).toBe(true);
    });
  }
  it('preserves the Winter shot without any firing-time reload',()=>{
    const state=new WeaponState('winter');state.select('rpg');expect(state.fire(10)).toBe(true);
    expect(state.ammo.rpg).toBe(0);expect(state.reserve.rpg).toBe(5);expect(state.reloading).toBe(false);
  });
});
