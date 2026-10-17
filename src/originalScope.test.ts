import {describe,expect,it} from 'vitest';
import {createOriginalScope,openOriginalScope,stepOriginalScope} from './originalScope';
describe('recovered numerical sniper actor',()=>{
  it('starts at 35 and takes exactly 36 callbacks to reach 8 with multiplicative mouse scaling',()=>{
    const state=createOriginalScope();expect(openOriginalScope(state,true,false,true)).toBe(true);
    expect(state).toEqual({active:true,fov:35,mouseDelta:.5,ptog:'open',zoomonce:0});
    for(let i=0;i<36;i++)stepOriginalScope(state,true,false,true);
    expect(state.fov).toBe(8);expect(state.mouseDelta).toBeCloseTo(.5*.93**36,14);
    stepOriginalScope(state,true,false,true);expect(state.fov).toBe(8);expect(state.mouseDelta).toBeCloseTo(.5*.93**36,14);
  });
  it('latches an early release until Shift is held and released below the threshold',()=>{
    const state=createOriginalScope();openOriginalScope(state,true,false,true);
    for(let i=0;i<40;i++)stepOriginalScope(state,true,false,false);
    expect(state.active).toBe(true);expect(state.ptog).toBe('open');expect(state.zoomonce).toBe(0);
    expect(openOriginalScope(state,true,false,true)).toBe(false);
    stepOriginalScope(state,true,false,true);expect(state.ptog).toBe('zoomed');
    stepOriginalScope(state,true,false,false);expect(state.active).toBe(false);expect(state.fov).toBe(50);expect(state.mouseDelta).toBe(.5);expect(state.zoomonce).toBe(1);
    expect(openOriginalScope(state,true,false,true)).toBe(true);
  });
  it('arms release only on a held callback strictly below 30',()=>{
    const state=createOriginalScope();openOriginalScope(state,true,false,true);
    for(let i=0;i<6;i++)stepOriginalScope(state,true,false,true);
    expect(state.fov).toBe(30.5);expect(state.ptog).toBe('open');
    stepOriginalScope(state,true,false,true);expect(state.fov).toBe(29.75);expect(state.ptog).toBe('zoomed');
    stepOriginalScope(state,true,false,false);expect(state.active).toBe(false);
  });
  it.each([[false,false],[true,true]])('closes for dragunov=%s typing=%s, even before the release threshold',(dragunov,typing)=>{
    const state=createOriginalScope();openOriginalScope(state,true,false,true);stepOriginalScope(state,dragunov,typing,true);
    expect(state.active).toBe(false);expect(state.fov).toBe(50);expect(state.mouseDelta).toBe(.5);expect(state.zoomonce).toBe(1);
  });
  it('does not create an actor while typing or with another weapon',()=>{
    const state=createOriginalScope();expect(openOriginalScope(state,true,true,true)).toBe(false);expect(openOriginalScope(state,false,false,true)).toBe(false);expect(openOriginalScope(state,true,false,false)).toBe(false);
  });
});
