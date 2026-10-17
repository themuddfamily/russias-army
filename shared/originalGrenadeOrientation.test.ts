import {describe,it,expect} from 'vitest';
import {originalGrenadeBasisFromDirection as basis} from './originalGrenadeOrientation';
const dot=(a:{x:number;y:number;z:number},b:typeof a)=>a.x*b.x+a.y*b.y+a.z*b.z;
describe('source grenade pointAt followed by world Euler Z adjustment',()=>{
 it('keeps the main grenade axis horizontal when firing down rather than aiming its X axis at the floor',()=>{
  const a=-85*Math.PI/180,b=basis({x:0,y:Math.sin(a),z:-Math.cos(a)});
  expect(b.x).toEqual({x:-0,y:0,z:1});expect(b.y.x).toBeCloseTo(-Math.sin(a),12);expect(b.y.y).toBeCloseTo(Math.cos(a),12);expect(b.z.y).toBeCloseTo(-Math.sin(a),12);
 });
 it('retains right-handed orthonormal columns for yaw/pitch quadrants and parallel-up fixture headings',()=>{
  for(const d of [{x:1,y:2,z:3},{x:-2,y:-3,z:1},{x:0,y:-1,z:0},{x:0,y:1,z:0}]){
   const b=basis(d);for(const c of [b.x,b.y,b.z])expect(dot(c,c)).toBeCloseTo(1,12);
   expect(dot(b.x,b.y)).toBeCloseTo(0,12);expect(dot(b.x,b.z)).toBeCloseTo(0,12);expect(dot(b.y,b.z)).toBeCloseTo(0,12);
   expect(b.x.y*b.y.z-b.x.z*b.y.y).toBeCloseTo(b.z.x,12);expect(b.x.z*b.y.x-b.x.x*b.y.z).toBeCloseTo(b.z.y,12);expect(b.x.x*b.y.y-b.x.y*b.y.x).toBeCloseTo(b.z.z,12);
  }
 });
 it('rejects invalid or zero directions rather than producing invalid contacts',()=>{
  for(const d of [{x:0,y:0,z:0},{x:NaN,y:0,z:1}])expect(()=>basis(d)).toThrow('Invalid original grenade direction');
 });
});
