import {describe,expect,it} from 'vitest';
import {rg6JumpBlastEligible,rg6JumpLaunchEligible,rg6JumpVelocity,RG6_JUMP_MAX_SPEED} from './rg6Jump';

describe('documented RG6 jump eligibility with authored tolerances',()=>{
  it('requires the downward RG6 shot and both simultaneous movement intents',()=>{
    const downward={x:0,y:-1,z:0},intent={forward:true,jump:true};
    expect(rg6JumpLaunchEligible('launcher',downward,intent)).toBe(true);
    expect(rg6JumpLaunchEligible('rpg',downward,intent)).toBe(false);
    expect(rg6JumpLaunchEligible('launcher',{x:0,y:-.5,z:.8},intent)).toBe(false);
    expect(rg6JumpLaunchEligible('launcher',downward,{forward:false,jump:true})).toBe(false);
    expect(rg6JumpLaunchEligible('launcher',downward,{forward:true,jump:false})).toBe(false);
    expect(rg6JumpLaunchEligible('launcher',downward)).toBe(false);
    expect(rg6JumpLaunchEligible('launcher',{x:0,y:0,z:0},intent)).toBe(false);
  });
  it('limits the impulse to a nearby blast below the feet',()=>{
    const feet={x:0,y:1,z:0};
    expect(rg6JumpBlastEligible(feet,{x:.1,y:0,z:.2})).toBe(true);
    expect(rg6JumpBlastEligible(feet,{x:4,y:0,z:0})).toBe(false);
    expect(rg6JumpBlastEligible(feet,{x:0,y:3,z:0})).toBe(false);
    expect(rg6JumpBlastEligible(feet,{x:0,y:-5,z:0})).toBe(false);
  });
  it('renews ascent and permits successive impulses within a finite cap',()=>{
    const first=rg6JumpVelocity(-2),second=rg6JumpVelocity(first);
    expect(first).toBeGreaterThan(0);expect(second).toBeGreaterThan(first);
    expect(rg6JumpVelocity(second)).toBe(RG6_JUMP_MAX_SPEED);
  });
});
