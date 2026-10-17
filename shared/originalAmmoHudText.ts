import type {WeaponId} from './protocol';

/** Both recovered ParentScript 6 - weaponry.ls sortweapons() handlers.
 * Names and slot order are source data; native font metrics are not inferred.
 */
export const ORIGINAL_AMMO_HUD_SLOTS = Object.freeze([
  Object.freeze({weapon:'pistol',slot:1,name:'pistol'}),
  Object.freeze({weapon:'shotgun',slot:2,name:'spas12'}),
  Object.freeze({weapon:'rifle',slot:3,name:'ak47'}),
  Object.freeze({weapon:'launcher',slot:4,name:'rg6'}),
  Object.freeze({weapon:'rpg',slot:5,name:'rpg'}),
  Object.freeze({weapon:'sniper',slot:6,name:'dragunov'}),
] as const);

export const ORIGINAL_AMMO_HUD_COLORS = Object.freeze({selected:'#ffff00',other:'#ff0000'});

/** The inclusive loop from addstring.length through 12 produces 13 characters. */
export function originalAmmoHudPrefix(weapon:WeaponId):string {
  const entry=ORIGINAL_AMMO_HUD_SLOTS.find(entry=>entry.weapon===weapon)!;
  return `${entry.slot}: ${entry.name}`.padEnd(13,' ');
}

/** Show the live source values directly, including uncapped or negative values. */
export function originalAmmoHudCounts(chamber:number,reserve:number):string {
  return `${chamber} / ${reserve}`;
}

export function originalAmmoHudText(weapon:WeaponId,chamber:number,reserve:number):string {
  return originalAmmoHudPrefix(weapon)+originalAmmoHudCounts(chamber,reserve);
}
