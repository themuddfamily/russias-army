import {describe,it,expect} from 'vitest';
import assert from 'node:assert/strict';
import {originalConvexPairPatch,originalConvexTrianglePatch} from './originalContactPatch';
import {originalConvexPairPatch as beforePair,originalConvexTrianglePatch as beforeTriangle} from '../artifacts/fidelity-review/2026-10-02/current/contact-island-integration/originalContactPatch-before-support-metadata';
import {originalConvexIsImmutable,type OriginalConvexPolytope} from './originalConvexSweep';
import {createOriginalProjectile} from './originalExplosives';
import {originalAngularConvex} from './originalAngularBody';
import type {Vec3} from './protocol';
const at=(x=0,y=0,z=0):Vec3=>({x,y,z});
const unit=(v:Vec3)=>{const d=Math.hypot(v.x,v.y,v.z);return at(v.x/d,v.y/d,v.z/d);};
const box=():OriginalConvexPolytope=>({vertices:[-1,1].flatMap(x=>[-1,1].flatMap(y=>[-1,1].map(z=>at(x,y,z)))),faceNormals:[at(0,-1)],edgeDirections:[at(1)]});
function freeze(shape:OriginalConvexPolytope):OriginalConvexPolytope {
 const frozen=Object.freeze({...shape,vertices:Object.freeze(shape.vertices.map(v=>Object.freeze({...v}))),faceNormals:Object.freeze(shape.faceNormals.map(v=>Object.freeze({...v}))),edgeDirections:Object.freeze(shape.edgeDirections.map(v=>Object.freeze({...v})))});
 expect(originalConvexIsImmutable(frozen)).toBe(true);return frozen;
}
describe('immutable contact support metadata',()=>{
 it('exactly preserves recovered oriented grenade and RPG patch results, including warmed support and signed zero',()=>{
  let finitePatches=0;
  for(let index=0;index<60;index++){
   const projectile=createOriginalProjectile(index%2?'launcher':'rpg',at(),at(0,0,-1),'player'),axis=unit(at(1,index%7+1,index%5-2)),angle=index*.17,s=Math.sin(angle/2);
   projectile.angular!.orientation={x:axis.x*s,y:axis.y*s,z:axis.z*s,w:Math.cos(angle/2)};
   const shape=originalAngularConvex(projectile.angular!),pivot=at(index%3*1e4,-index*.01,index%2?-0:0);
   expect(originalConvexIsImmutable(shape)).toBe(true);
   const normals=[at(-0,1,0),at(0,1,-0),unit(at(1,2,3)),...shape.faceNormals.slice(0,4).map(v=>unit(at(-v.x,-v.y,-v.z)))];
   for(const normal of normals){
    const triangle:[Vec3,Vec3,Vec3]=[at(-3,0,-3),at(3,0,-3),at(0,0,3)];
    const expectedPair=beforePair(shape,pivot,shape,pivot,normal),expectedTriangle=beforeTriangle(shape,pivot,triangle,normal);
    if(expectedPair)finitePatches++;
    for(let warm=0;warm<2;warm++){
     assert.deepStrictEqual(originalConvexPairPatch(shape,pivot,shape,pivot,normal),expectedPair);
     assert.deepStrictEqual(originalConvexTrianglePatch(shape,pivot,triangle,normal),expectedTriangle);
    }
   }
  }
  expect(finitePatches).toBeGreaterThan(20);
 });
 it('keeps mutable vector and accessor property-read order equal to the uncached implementation',()=>{
  function fixture(){const reads:string[]=[],shape=box();shape.vertices.forEach((v,i)=>{const x=v.x;Object.defineProperty(v,'x',{get:()=>{reads.push('x'+i);return x;},enumerable:true});});return {shape,reads};}
  const before=fixture(),current=fixture();
  for(let warm=0;warm<3;warm++)assert.deepStrictEqual(originalConvexPairPatch(current.shape,at(0,2),current.shape,at(),at(0,1)),beforePair(before.shape,at(0,2),before.shape,at(),at(0,1)));
  expect(current.reads).toEqual(before.reads);
  const mutable=box();originalConvexPairPatch(mutable,at(0,2),mutable,at(),at(0,1));mutable.vertices[0].x=NaN;
  expect(()=>originalConvexPairPatch(mutable,at(0,2),mutable,at(),at(0,1))).toThrow('Invalid original contact patch');
 });
 it('does not cache invalid immutable vertices or expose cached support points',()=>{
  const invalid=freeze({...box(),vertices:[at(NaN,0,0)]});
  for(let warm=0;warm<2;warm++)expect(()=>originalConvexPairPatch(invalid,at(),invalid,at(),at(0,1))).toThrow('Invalid original contact patch');
  const shape=freeze(box()),expected=beforePair(shape,at(0,2),shape,at(),at(-0,1,-0)),result=originalConvexPairPatch(shape,at(0,2),shape,at(),at(-0,1,-0))!;
  result.witnessA.x=999;result.pairs[0].witnessB.z=999;
  assert.deepStrictEqual(originalConvexPairPatch(shape,at(0,2),shape,at(),at(-0,1,-0)),expected);
 });
});
