import { describe,expect,it } from 'vitest';
import { aimingHeld,legacyArrowTurn,movementAxes,sprintHeld } from './legacyControls';

describe('legacy control preset',()=>{
  it('uses either Shift to aim without increasing movement speed',()=>{
    for(const shift of ['ShiftLeft','ShiftRight']){
      const keys=new Set(['KeyW',shift]);
      expect(aimingHeld('legacy',keys,false,'sniper')).toBe(true);
      expect(sprintHeld('legacy',keys,true)).toBe(false);
      expect(sprintHeld('modern',keys,false)).toBe(true);
    }
  });
  it('limits Legacy aiming to the sniper while Modern retains all-weapon aiming',()=>{
    for(const weapon of ['pistol','shotgun','rifle','launcher','rpg'] as const){
      expect(aimingHeld('legacy',new Set(['ShiftLeft']),true,weapon)).toBe(false);
      expect(aimingHeld('modern',new Set(),true,weapon)).toBe(true);
    }
  });
  it('keeps arrow aliases optional and cancels opposite directions',()=>{
    expect(movementAxes(new Set(['ArrowUp']))).toEqual({forward:0,side:0});
    expect(movementAxes(new Set(['ArrowUp','KeyW']),true)).toEqual({forward:1,side:0});
    expect(movementAxes(new Set(['ArrowUp','KeyS','ArrowLeft','KeyD']),true)).toEqual({forward:0,side:0});
  });
  it('uses Legacy up/down for movement and lateral arrows for steering while retaining WASD',()=>{
    expect(movementAxes(new Set(['ArrowUp','ArrowRight']),true,'legacy')).toEqual({forward:1,side:0});
    expect(movementAxes(new Set(['ArrowDown','ArrowLeft']),true,'legacy')).toEqual({forward:-1,side:0});
    expect(movementAxes(new Set(['ArrowUp','KeyW','KeyD']),true,'legacy')).toEqual({forward:1,side:1});
    expect(movementAxes(new Set(['ArrowDown','KeyS','KeyA']),true,'legacy')).toEqual({forward:-1,side:-1});
    expect(movementAxes(new Set(['ArrowUp','KeyS','KeyA','KeyD']),true,'legacy')).toEqual({forward:0,side:0});
    expect(movementAxes(new Set(['ArrowUp','ArrowRight']),false,'legacy')).toEqual({forward:0,side:0});
  });
  it('converts the source five-degree turn into elapsed-time yaw with source Left priority',()=>{
    const left=new Set(['ArrowLeft']),right=new Set(['ArrowRight']);
    expect(legacyArrowTurn(left,true,1/30)).toBeCloseTo(5*Math.PI/180);
    expect(legacyArrowTurn(right,true,1/30)).toBeCloseTo(-5*Math.PI/180);
    expect(legacyArrowTurn(new Set(['ArrowLeft','ArrowRight']),true,1/30)).toBeCloseTo(5*Math.PI/180);
    expect(legacyArrowTurn(left,true,1)).toBeCloseTo(150*Math.PI/180);
    expect(legacyArrowTurn(left,true,1/120)*120).toBeCloseTo(legacyArrowTurn(left,true,1));
  });
  it('respects arrow opt-out and never steers in Modern or from WASD',()=>{
    expect(legacyArrowTurn(new Set(['ArrowLeft']),false,1)).toBe(0);
    expect(legacyArrowTurn(new Set(['ArrowRight']),true,1,'modern')).toBe(0);
    expect(legacyArrowTurn(new Set(['KeyA','KeyD','ArrowUp']),true,1)).toBe(0);
    expect(legacyArrowTurn(new Set(['ArrowLeft']),true,0)).toBe(0);
    expect(movementAxes(new Set(['ArrowRight']),true,'modern')).toEqual({forward:0,side:1});
  });
  it('uses enabled arrow axes for Modern sprint while preserving opt-out and axis cancellation',()=>{
    const arrows=new Set(['ArrowUp','ShiftLeft']);
    expect(sprintHeld('modern',arrows,false,true)).toBe(true);
    expect(sprintHeld('modern',arrows,false,false)).toBe(false);
    expect(sprintHeld('legacy',arrows,false,true)).toBe(false);
    expect(sprintHeld('modern',arrows,true,true)).toBe(false);
    expect(sprintHeld('modern',new Set(['ArrowUp','KeyS','ShiftLeft']),false,true)).toBe(false);
    expect(sprintHeld('modern',new Set(['ArrowUp','KeyS','ArrowRight','ShiftLeft']),false,true)).toBe(true);
  });
  it('allows right mouse aiming in both presets and prevents aimed sprinting',()=>{
    expect(aimingHeld('legacy',new Set(),true,'sniper')).toBe(true);
    expect(aimingHeld('modern',new Set(['ShiftLeft']),false,'rifle')).toBe(false);
    expect(sprintHeld('modern',new Set(['KeyW','ShiftLeft']),true)).toBe(false);
  });
});
