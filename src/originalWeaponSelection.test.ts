import {describe,it,expect} from 'vitest';
import {WeaponState} from './weapons';
import {getOriginalHitscan} from '../shared/originalHitscan';
import {ORIGINAL_WEAPON_SLOT_ORDER} from '../shared/originalPickupRules';
function empty(state:WeaponState){for(const id of ORIGINAL_WEAPON_SLOT_ORDER){state.ammo[id]=0;state.reserve[id]=0;}}
for(const map of ['woodlands','barrack'])describe(`${map} source weapon eligibility and fire counters`,()=>{
 it('rejects a depleted numeric slot and accepts a reserve-only slot',()=>{
  const state=new WeaponState(map);state.ammo.pistol=0;state.reserve.pistol=0;state.select('pistol');expect(state.current).toBe('launcher');
  state.reserve.pistol=1;state.select('pistol');expect(state.current).toBe('pistol');expect(state.ammo.pistol).toBe(0);
 });
 it('selects the first eligible source slot without loading or restarting the wait',()=>{
  const state=new WeaponState(map);empty(state);state.reserve.pistol=4;state.ammo.shotgun=3;
  state.reloadEnd=12;expect(state.startReload(5)).toBe(false);expect(state.current).toBe('pistol');expect(state.ammo.pistol).toBe(0);expect(state.reserve.pistol).toBe(4);expect(state.reloading).toBe(false);expect(state.reloadEnd).toBe(12);
 });
 it('becomes unarmed when all stores are empty and can select a newly usable slot',()=>{
  const state=new WeaponState(map);empty(state);expect(state.startReload(1)).toBe(false);expect(state.unarmed).toBe(true);expect(state.fire(100)).toBe(false);expect(state.reloading).toBe(false);
  state.addReserve('sniper',5);state.select('sniper');expect(state.unarmed).toBe(false);expect(state.current).toBe('sniper');expect(state.startReload(101)).toBe(true);expect(state.ammo.sniper).toBe(5);expect(state.reserve.sniper).toBe(0);
  state.reset();expect(state.unarmed).toBe(false);
 });
 it.each(['pistol','shotgun','rifle','sniper'] as const)('gates %s at the recovered edition callback interval',id=>{
  const state=new WeaponState(map);state.select(id);const interval=getOriginalHitscan(map,id)!.intervalSeconds;
  for(let frame=60;frame>0;frame--)state.stepSourceCounter(10-frame/30);
  expect(state.fire(10)).toBe(true);expect(state.fire(10+interval-1e-6)).toBe(false);expect(state.fire(10+interval)).toBe(true);expect(state.ammo[id]).toBe((id==='pistol'?8:id==='shotgun'?6:id==='rifle'?28:30)-2);
 });
});
it('retains archival depleted-slot selection and cadence',()=>{const state=new WeaponState('winter');state.ammo.pistol=0;state.reserve.pistol=0;state.select('pistol');expect(state.current).toBe('pistol');state.select('rifle');expect(state.fire(1)).toBe(true);expect(state.fire(1.095)).toBe(true);});
