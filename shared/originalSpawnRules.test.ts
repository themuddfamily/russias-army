import {describe,expect,it} from 'vitest';
import {originalSpawnIndex} from './originalSpawnRules';
describe('uniform source spawn index',()=>{
 it('maps each equal-width random interval to the paired zero-based start',()=>{
  for(let index=0;index<6;index++){
   expect(originalSpawnIndex(6,index/6)).toBe(index);
   expect(originalSpawnIndex(6,(index+.5)/6)).toBe(index);
  }
  expect(originalSpawnIndex(6,1-Number.EPSILON)).toBe(5);
 });
 it('rejects invalid counts and random fractions outside the source adapter domain',()=>{
  expect(originalSpawnIndex(6,0)).toBe(0);expect(originalSpawnIndex(1,.99)).toBe(0);
  for(const count of [0,-1,1.5,Infinity,NaN])expect(()=>originalSpawnIndex(count,.5)).toThrow(RangeError);
  for(const draw of [-.1,1,2,NaN,Infinity,-Infinity])expect(()=>originalSpawnIndex(6,draw)).toThrow(RangeError);
 });
});
