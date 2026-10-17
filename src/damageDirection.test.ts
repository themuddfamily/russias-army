import { describe,expect,it } from 'vitest';
import { damageIndicatorAngle } from './damageDirection';

describe('damageIndicatorAngle',()=>{
  it('points forward and backward using the camera forward convention',()=>{
    expect(damageIndicatorAngle(0,-10,0)).toBeCloseTo(0);
    expect(Math.abs(damageIndicatorAngle(0,10,0))).toBeCloseTo(Math.PI);
  });

  it('tracks the same source after the player turns',()=>{
    expect(damageIndicatorAngle(-10,0,Math.PI/2)).toBeCloseTo(0);
  });

  it('keeps lateral bearings on the corresponding side',()=>{
    expect(damageIndicatorAngle(10,0,0)).toBeCloseTo(Math.PI/2);
    expect(damageIndicatorAngle(-10,0,0)).toBeCloseTo(-Math.PI/2);
  });
});
