const BROWSER_NAVIGATION_KEYS = new Set([
  'BrowserBack', 'BrowserFavorites', 'BrowserForward', 'BrowserHome',
  'BrowserRefresh', 'BrowserSearch', 'BrowserStop',
]);

export interface KeyboardShortcutState {
  code: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
}

/**
 * Keys that should remain inside an active game session when the browser has
 * granted fullscreen keyboard capture.
 */
export function isBrowserShortcut(event: KeyboardShortcutState): boolean {
  return event.ctrlKey || event.metaKey || event.altKey ||
    /^F(?:[1-9]|1[0-2])$/.test(event.code) || BROWSER_NAVIGATION_KEYS.has(event.code);
}

/** Both physical Shift keys implement the advertised sprint control. */
export function isSprintHeld(keys:ReadonlySet<string>):boolean {
  return keys.has('ShiftLeft')||keys.has('ShiftRight');
}

/** Sprint affects movement and ballistics only while movement is actually requested. */
export function isSprintActive(keys:ReadonlySet<string>,aiming:boolean):boolean {
  if(aiming||!isSprintHeld(keys))return false;
  const forward=Number(keys.has('KeyW'))-Number(keys.has('KeyS'));
  const side=Number(keys.has('KeyD'))-Number(keys.has('KeyA'));
  return forward!==0||side!==0;
}
