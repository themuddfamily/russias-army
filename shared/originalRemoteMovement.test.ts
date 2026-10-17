import {describe,expect,it} from 'vitest';
import {createOriginalRemoteMovement,receiveOriginalRemoteMovement,stepOriginalRemoteMovement} from './originalRemoteMovement';
const point=(x=0,y=0,z=0)=>({x,y,z});
describe('source baddie packet recurrence',()=>{
  it('decrements before division, reaches position on callback nine and snaps on ten',()=>{
    const state=createOriginalRemoteMovement(point(),0);
    receiveOriginalRemoteMovement(state,point(9,18,-27),Math.PI);
    stepOriginalRemoteMovement(state);
    expect(state).toMatchObject({position:point(1,2,-3),speed:point(1,2,-3),steps:9});expect(state.yaw).toBeCloseTo(Math.PI*2/9);
    for(let i=0;i<8;i++)stepOriginalRemoteMovement(state);
    expect(state.position).toEqual(point(9,18,-27));expect(state.steps).toBe(1);
    stepOriginalRemoteMovement(state);expect(state.steps).toBe(0);expect(state.yaw).toBe(Math.PI);expect(state.speed).toEqual(point(1,2,-3));
  });
  it('uses raw angular difference through wrap and overshoots at the penultimate division',()=>{
    const state=createOriginalRemoteMovement(point(),Math.PI-.1);
    receiveOriginalRemoteMovement(state,point(),-Math.PI+.1);stepOriginalRemoteMovement(state);
    expect(state.yaw).toBeCloseTo(Math.PI-.1+(-2*Math.PI+.2)*2/9);
    const overshoot=createOriginalRemoteMovement(point(),0);overshoot.steps=3;overshoot.targetYaw=1;
    stepOriginalRemoteMovement(overshoot);expect(overshoot.yaw).toBe(1);
    // New packet can leave a nonzero angular error at the final denominator.
    overshoot.targetYaw=2;stepOriginalRemoteMovement(overshoot);expect(overshoot.yaw).toBe(3);
    stepOriginalRemoteMovement(overshoot);expect(overshoot.yaw).toBe(2);
  });
  it('interrupts a moving packet from the rendered position with a fresh ten callbacks',()=>{
    const state=createOriginalRemoteMovement(point(),0);receiveOriginalRemoteMovement(state,point(9),0);
    for(let i=0;i<3;i++)stepOriginalRemoteMovement(state);
    expect(state.position.x).toBe(3);receiveOriginalRemoteMovement(state,point(21),2);expect(state.steps).toBe(10);
    stepOriginalRemoteMovement(state);expect(state.position.x).toBe(5);expect(state.yaw).toBeCloseTo(4/9);
  });
  it('extends a new packet by every idle callback and retains the final displacement speed',()=>{
    const state=createOriginalRemoteMovement(point(),0);receiveOriginalRemoteMovement(state,point(9),0);
    for(let i=0;i<35;i++)stepOriginalRemoteMovement(state);
    expect(state).toMatchObject({position:point(9),steps:-25,speed:point(1)});
    receiveOriginalRemoteMovement(state,point(43),0);expect(state.steps).toBe(35);
    stepOriginalRemoteMovement(state);expect(state.position.x).toBe(10);expect(state.steps).toBe(34);
  });
  it('treats the zero boundary as ten callbacks and begins with source steps ten and speed zero',()=>{
    const state=createOriginalRemoteMovement(point(2,3,4),5);
    expect(state).toMatchObject({steps:10,speed:point(),position:point(2,3,4),yaw:5});
    for(let i=0;i<10;i++)stepOriginalRemoteMovement(state);
    receiveOriginalRemoteMovement(state,point(11,3,4),5);expect(state.steps).toBe(10);
  });
  it('reports disconnect exactly when initial ten callbacks reach minus450 on callback460',()=>{
    const state=createOriginalRemoteMovement(point(2,3,4),5);
    for(let callback=1;callback<=459;callback++)expect(stepOriginalRemoteMovement(state)).toBe(false);
    expect(state.steps).toBe(-449);expect(stepOriginalRemoteMovement(state)).toBe(true);
    expect(state).toMatchObject({steps:-450,position:point(2,3,4),yaw:5});
    expect(stepOriginalRemoteMovement(state)).toBe(false);expect(state.steps).toBe(-451);
  });
  it('a packet at minus449 extends catch-up to459 and cancels the immediately pending timeout',()=>{
    const state=createOriginalRemoteMovement(point(),0);
    for(let callback=0;callback<459;callback++)stepOriginalRemoteMovement(state);
    receiveOriginalRemoteMovement(state,point(9),1);expect(state.steps).toBe(459);
    for(let callback=1;callback<=908;callback++)expect(stepOriginalRemoteMovement(state)).toBe(false);
    expect(state.steps).toBe(-449);expect(stepOriginalRemoteMovement(state)).toBe(true);
    expect(state).toMatchObject({steps:-450,position:point(9),yaw:1});
  });

});
