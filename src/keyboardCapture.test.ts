import { describe, expect, it } from 'vitest';
import { isBrowserShortcut,isSprintActive,isSprintHeld, type KeyboardShortcutState } from './keyboardCapture';

function key(code: string, overrides: Partial<KeyboardShortcutState> = {}): KeyboardShortcutState {
  return { code, ctrlKey: false, metaKey: false, altKey: false, ...overrides };
}

describe('isBrowserShortcut', () => {
  it.each([
    key('KeyW', { ctrlKey: true }),
    key('KeyW', { metaKey: true }),
    key('ArrowLeft', { altKey: true }),
    key('F1'),
    key('F12'),
    key('BrowserBack'),
    key('BrowserRefresh'),
  ])('classifies browser-owned key combinations', (event) => {
    expect(isBrowserShortcut(event)).toBe(true);
  });

  it.each([
    key('KeyW'),
    key('KeyR'),
    key('Digit6'),
    key('F13'),
    key('Escape'),
  ])('leaves ordinary game input alone', (event) => {
    expect(isBrowserShortcut(event)).toBe(false);
  });
});

describe('isSprintHeld',()=>{
  it.each(['ShiftLeft','ShiftRight'])('accepts %s as the sprint modifier',(code)=>{
    expect(isSprintHeld(new Set([code]))).toBe(true);
  });

  it('ignores unrelated held keys',()=>expect(isSprintHeld(new Set(['KeyW']))).toBe(false));
});

describe('isSprintActive',()=>{
  it.each(['ShiftLeft','ShiftRight'])('sprints on movement with %s',(shift)=>{
    expect(isSprintActive(new Set([shift,'KeyW']),false)).toBe(true);
  });

  it('does not penalize aim, stationary input, or cancelled movement',()=>{
    expect(isSprintActive(new Set(['ShiftLeft','KeyW']),true)).toBe(false);
    expect(isSprintActive(new Set(['ShiftLeft']),false)).toBe(false);
    expect(isSprintActive(new Set(['ShiftLeft','KeyW','KeyS']),false)).toBe(false);
  });
});
