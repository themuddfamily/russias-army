import type {WeaponId} from './protocol';
import {ORIGINAL_AMMO_HUD_SLOTS} from './originalAmmoHudText';

/** Recovered goody.feedback() and keytalk()/keywalk(), shared by both editions.
 * RETURN is a logical line separator. Browser wrapping must not consume slots.
 */
export const ORIGINAL_FEEDBACK_RETURN='\r';
export const ORIGINAL_FEEDBACK_MAX_LINES=5;
export const ORIGINAL_FEEDBACK_COLORS=Object.freeze({newest:'#ffff00',older:'#00ff00'});
export const ORIGINAL_TALK_PREFIX='>> ';
export const ORIGINAL_TALK_MAX_CHARACTERS=40;
export const ORIGINAL_TALK_BACKSPACE_MIN_CHARACTERS=2;
export const ORIGINAL_TALK_COLOR='#ff0000';

/** Native RETURN only: normalization of browser LF belongs at the UI boundary. */
export function originalFeedbackLines(text:string):string[] {
  return text.split(ORIGINAL_FEEDBACK_RETURN);
}

/** news=0 requests a texture refresh without changing text or playing feedback.
 * Empty strings, whitespace and the textual value "0" remain actual messages.
 */
export function originalFeedbackText(previous:string,news:string|0):string {
  if(news===0)return previous;
  return originalFeedbackLines(news+ORIGINAL_FEEDBACK_RETURN+previous)
    .slice(0,ORIGINAL_FEEDBACK_MAX_LINES).join(ORIGINAL_FEEDBACK_RETURN);
}

/** MUS gamein() prefixes the full submitted talk member, including ">> ". */
export function originalTalkFeedbackText(sender:string,payload:string):string {
  return sender+': '+payload;
}

/** pickups.getgun(): all six source inventory properties exist, even at zero. */
export function originalPickupFeedback(weapon:WeaponId):string {
  const name=ORIGINAL_AMMO_HUD_SLOTS.find(slot=>slot.weapon===weapon)!.name;
  return `Ammo for the ${name}.`;
}
