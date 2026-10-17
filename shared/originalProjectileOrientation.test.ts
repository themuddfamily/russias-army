import {describe,expect,it} from 'vitest';
import {isOriginalProjectileRotation,originalProjectileDirection,originalProjectileRotationMatchesDirection} from './originalProjectileOrientation';
import {originalRpgBasisFromSourceRotation} from './originalRpgShape';
describe('retained pre-recoil source projectile rotation',()=>{
 it.each([{x:0,y:0,z:0},{x:113,y:0,z:-2377},{x:90,y:0,z:81},{x:-91,y:0,z:151}])('retains launch branch and aligns full basis %j',rotation=>{
  const direction=originalProjectileDirection(rotation),basis=originalRpgBasisFromSourceRotation(rotation);expect(originalProjectileRotationMatchesDirection(rotation,direction)).toBe(true);expect(-basis.x.x).toBeCloseTo(direction.x,12);expect(-basis.x.y).toBeCloseTo(direction.y,12);expect(-basis.x.z).toBeCloseTo(direction.z,12);
 });
 it('does not equate identical ballistic direction with identical resource orientation',()=>{
  const first={x:113,y:0,z:27},alternate={x:67,y:0,z:207},direction=originalProjectileDirection(first);expect(originalProjectileRotationMatchesDirection(alternate,direction)).toBe(true);const a=originalRpgBasisFromSourceRotation(first),b=originalRpgBasisFromSourceRotation(alternate);expect(a.z.x).toBeCloseTo(-b.z.x,12);expect(a.z.y).toBeCloseTo(-b.z.y,12);expect(a.z.z).toBeCloseTo(-b.z.z,12);
 });
 it('preserves vertical yaw despite its disappearance from the direction',()=>{
  const a={x:90,y:0,z:0},b={x:90,y:0,z:90};expect(originalProjectileRotationMatchesDirection(a,originalProjectileDirection(b))).toBe(true);expect(originalRpgBasisFromSourceRotation(a).y).not.toEqual(originalRpgBasisFromSourceRotation(b).y);
 });
 it.each([null,[],{}, {x:0,y:1,z:0},{x:Infinity,y:0,z:0},{x:0,y:0,z:NaN}])('rejects malformed source rotation %j',value=>expect(isOriginalProjectileRotation(value)).toBe(false));
 it('rejects changed shot aim while accepting proportional finite direction',()=>{
  const rotation={x:10,y:0,z:20},direction=originalProjectileDirection(rotation);expect(originalProjectileRotationMatchesDirection(rotation,{x:direction.x*2,y:direction.y*2,z:direction.z*2})).toBe(true);expect(originalProjectileRotationMatchesDirection(rotation,{x:0,y:0,z:1})).toBe(false);expect(originalProjectileRotationMatchesDirection(rotation,{x:0,y:0,z:0})).toBe(false);
 });
});
