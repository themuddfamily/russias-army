import {describe,it,expect} from 'vitest';
import {applyOriginalSoloBotIntent,sourceRotationForSoloDirection} from './originalSoloWorlds';
import {createOriginalPlayerBody,ORIGINAL_PLAYER_DERIVATIVE_FACTOR} from '../shared/originalPlayerPhysics';
import {originalProjectileRotationMatchesDirection} from '../shared/originalProjectileOrientation';

describe('authored bot intent on a source goody body',()=>{
  it.each([1.25,2.65])('converges to authored grounded speed %s without translating the body',speed=>{
    const body=createOriginalPlayerBody('bot',{x:2,y:3,z:4});
    const initial={...body.position};
    for(let i=0;i<100;i++){body.supported=true;applyOriginalSoloBotIntent(body,{direction:{x:3,y:7,z:4},speed});}
    expect(Math.hypot(body.velocity.x,body.velocity.z)*ORIGINAL_PLAYER_DERIVATIVE_FACTOR).toBeCloseTo(speed,10);
    expect(body.velocity.x/body.velocity.z).toBeCloseTo(.75,10);
    expect(body.position).toEqual(initial);
    expect(body.supported).toBe(false);
  });
  it('retains a sideways contact impulse and vertical velocity',()=>{
    const body=createOriginalPlayerBody('bot',{x:0,y:2,z:0},{x:8,y:3,z:0});body.supported=true;
    expect(applyOriginalSoloBotIntent(body,{direction:{x:0,y:0,z:1},speed:2.65})).toEqual({grounded:true,jumped:false});
    expect(body.velocity.x).toBe(6);expect(body.velocity.y).toBe(3);expect(body.velocity.z).toBeCloseTo(2.65/6,12);
  });
  it('does not push or drag an airborne body',()=>{
    const body=createOriginalPlayerBody('bot',{x:0,y:2,z:0},{x:8,y:-3,z:4});
    expect(applyOriginalSoloBotIntent(body,{direction:{x:1,y:0,z:0},speed:2.65})).toEqual({grounded:false,jumped:false});
    expect(body.velocity).toEqual({x:8,y:-3,z:4});
  });
  it('applies source drag while idle or supplied a vertical-only intent',()=>{
    const body=createOriginalPlayerBody('bot',{x:0,y:2,z:0},{x:4,y:1,z:8});body.supported=true;
    applyOriginalSoloBotIntent(body,{direction:{x:0,y:1,z:0},speed:2.65});
    expect(body.velocity).toEqual({x:3,y:1,z:6});
  });
  it('rejects invalid controls before consuming the ground latch',()=>{
    const body=createOriginalPlayerBody('bot',{x:0,y:2,z:0});body.supported=true;
    expect(()=>applyOriginalSoloBotIntent(body,{direction:{x:1,y:0,z:0},speed:-1})).toThrow();expect(body.supported).toBe(true);
  });
});

describe('bot source launch basis',()=>{
  it.each([{x:0,y:0,z:1},{x:0,y:0,z:-1},{x:3,y:2,z:4},{x:-3,y:-2,z:-4},{x:0,y:1,z:0}])('matches authored aim %j',direction=>{
    expect(originalProjectileRotationMatchesDirection(sourceRotationForSoloDirection(direction),direction)).toBe(true);
  });
  it('rejects directionless and nonfinite launches',()=>{
    expect(()=>sourceRotationForSoloDirection({x:0,y:0,z:0})).toThrow();
    expect(()=>sourceRotationForSoloDirection({x:Infinity,y:0,z:1})).toThrow();
  });
});
