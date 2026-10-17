import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {advanceOriginalWeaponMotion,createOriginalWeaponMotion,loadOriginalWeaponMotion,ORIGINAL_WEAPON_POSES} from './originalWeaponMotion';
import type {WeaponId} from './protocol';

const coefficients=['barrack','woodland'].map(map=>{
 const source=readFileSync(`docs/research-evidence/2026-09-30/director-script-extraction/${map}/casts/parents/ParentScript 6 - weaponry.ls`,'utf8');
 const value=source.match(/gunpos = gunpos \+ \(\(guntarpos - gunpos\) \* ([\d.]+)\)/)?.[1];
 if(!value)throw Error(`Recovered ${map} recurrence missing`);
 return Number(value);
});
describe('literal recovered whole-gun callback recurrence',()=>{
 it('uses the same recovered coefficient in both editions',()=>expect(coefficients).toEqual([.1,.1]));
 for(const weapon of Object.keys(ORIGINAL_WEAPON_POSES) as WeaponId[]){
  it(`${weapon} preserves every component exactly across45 nominal load-return callbacks`,()=>{
   let state=loadOriginalWeaponMotion(createOriginalWeaponMotion({weapon,ticker:1,gunPositionSource:{x:0,y:0,z:0}}));
   let expected={...state.gunPositionSource},oldDerived={...expected};
   const rest=ORIGINAL_WEAPON_POSES[weapon].rest;let distinguishesDerived=false;
   for(let callback=0;callback<45;callback++){
    expected={x:expected.x+(rest[0]-expected.x)*coefficients[0],y:expected.y+(rest[1]-expected.y)*coefficients[0],z:expected.z+(rest[2]-expected.z)*coefficients[0]};
    oldDerived={x:oldDerived.x+(rest[0]-oldDerived.x)*(1-Math.pow(.9,1)),y:oldDerived.y+(rest[1]-oldDerived.y)*(1-Math.pow(.9,1)),z:oldDerived.z+(rest[2]-oldDerived.z)*(1-Math.pow(.9,1))};
    const next=advanceOriginalWeaponMotion(state,{frames:1,sourceSpeed:0});
    expect(next.state.gunPositionSource).toEqual(expected);expect(next.positionSource).toEqual(expected);expect(next.state.ticker).toBe(1);
    distinguishesDerived ||= (['x','y','z'] as const).some(axis=>!Object.is(expected[axis],oldDerived[axis]));state=next.state;
   }
   expect(distinguishesDerived).toBe(true);
  });
 }
 it.each([0,.5,2])('retains the elapsed-frame adapter for frames=%s',frames=>{
  const seed=createOriginalWeaponMotion({weapon:'rifle',ticker:1,gunPositionSource:{x:-12,y:-20,z:5}}),alpha=1-Math.pow(.9,frames);
  expect(advanceOriginalWeaponMotion(seed,{frames,sourceSpeed:0}).state.gunPositionSource).toEqual({x:-12+15*alpha,y:-20+10*alpha,z:5-3*alpha});
 });
});
