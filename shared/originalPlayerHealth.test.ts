import {describe,expect,it} from 'vitest';
import {applyOriginalPlayerDamage,applyOriginalPlayerHealthDelta,createOriginalPlayerHealth,stepOriginalPlayerHealth} from './originalPlayerHealth';

describe('preserved goody health arithmetic',()=>{
  it('starts with canonical100 and flick+2, preserving canonical through callbacks',()=>{
    const state=createOriginalPlayerHealth();
    expect(state).toEqual({canonical:100,flick:2});
    stepOriginalPlayerHealth(state);expect(state).toEqual({canonical:100,flick:-2});
    stepOriginalPlayerHealth(state);expect(state).toEqual({canonical:100,flick:2});
  });
  it('applies direct damage with no armor or immunity argument',()=>{
    const state=createOriginalPlayerHealth();
    expect(applyOriginalPlayerDamage(state,12)).toEqual({health:88,dead:false});
    expect(state.canonical).toBe(88);
  });
  it.each([[-4,false],[-4.125,true],[0,false]] as const)('positive phase canonical%s has dead=%s', (health,dead)=>{
    const state=createOriginalPlayerHealth();
    expect(applyOriginalPlayerHealthDelta(state,health-100)).toEqual({health,dead});
    expect(state.canonical).toBe(health);
  });
  it.each([[4,false],[3.875,true],[0,true]] as const)('negative phase canonical%s has dead=%s', (health,dead)=>{
    const state=createOriginalPlayerHealth(100,-2);
    expect(applyOriginalPlayerHealthDelta(state,health-100)).toEqual({health,dead});
    expect(state.canonical).toBe(health);
  });
  it('never automatically kills on phase flip; the next setlives uses the new phase',()=>{
    const state=createOriginalPlayerHealth();
    expect(applyOriginalPlayerDamage(state,100)).toEqual({health:0,dead:false});
    expect(stepOriginalPlayerHealth(state)).toBeUndefined();
    expect(state).toEqual({canonical:0,flick:-2});
    expect(applyOriginalPlayerHealthDelta(state,0)).toEqual({health:0,dead:true});
  });
  it('adds the source health pickup20 without a100cap',()=>{
    const state=createOriginalPlayerHealth();
    expect(applyOriginalPlayerHealthDelta(state,20)).toEqual({health:120,dead:false});
    expect(state.canonical).toBe(120);
  });
  it('preserves goody-before-blast phase and mutation order across16callbacks',()=>{
    const state=createOriginalPlayerHealth();
    const mutations=[];
    for(let callback=1;callback<=16;callback++){
      stepOriginalPlayerHealth(state);
      mutations.push({...applyOriginalPlayerDamage(state,5),flick:state.flick});
    }
    expect(mutations).toEqual(Array.from({length:16},(_,i)=>({health:95-5*i,dead:false,flick:i%2===0?-2:2})));
    expect(state).toEqual({canonical:20,flick:2});
  });
  it('makes blast death depend on its phase rather than a generic zero boundary',()=>{
    const state=createOriginalPlayerHealth(80);
    let mutation;
    for(let callback=1;callback<=16;callback++){
      stepOriginalPlayerHealth(state);mutation=applyOriginalPlayerDamage(state,5);
    }
    expect(mutation).toEqual({health:0,dead:false});
    stepOriginalPlayerHealth(state);
    expect(applyOriginalPlayerDamage(state,5)).toEqual({health:-5,dead:true});
  });
  it('keeps mutations signed and uncapped after the death result',()=>{
    const state=createOriginalPlayerHealth();
    expect(applyOriginalPlayerDamage(state,200)).toEqual({health:-100,dead:true});
    expect(state.canonical).toBe(-100);
  });
  it.each([NaN,Infinity,-Infinity])('rejects nonfinite constructor values and mutations: %s',value=>{
    expect(()=>createOriginalPlayerHealth(value)).toThrow();
    const state=createOriginalPlayerHealth();
    expect(()=>applyOriginalPlayerHealthDelta(state,value)).toThrow();
    expect(()=>applyOriginalPlayerDamage(state,value)).toThrow();
    expect(state).toEqual({canonical:100,flick:2});
  });
  it('validates exact flick values and rejects arithmetic overflow without mutation',()=>{
    expect(()=>createOriginalPlayerHealth(100,0 as 2)).toThrow();
    const state=createOriginalPlayerHealth(Number.MAX_VALUE);
    expect(()=>applyOriginalPlayerHealthDelta(state,Number.MAX_VALUE)).toThrow();
    expect(state.canonical).toBe(Number.MAX_VALUE);
    state.flick=1 as 2;
    expect(()=>stepOriginalPlayerHealth(state)).toThrow();
    expect(()=>applyOriginalPlayerHealthDelta(state,1)).toThrow();
  });
});
