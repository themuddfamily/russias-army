import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {transpileModule,ModuleKind,ScriptTarget} from 'typescript';
import * as contactKernel from './originalConvexContact';
import * as sweepKernel from './originalConvexSweep';
import * as distanceKernel from './originalContactDistance';
import type {OriginalConvexPolytope} from './originalConvexSweep';
import type {Vec3} from './protocol';

// Restore the previous allocation-based plane predicate as an independent
// public-query oracle. Other distance/SAT policies stay identical so exact
// output and externally observable coordinate-read order can be compared.
function previousKernel():typeof distanceKernel {
 const source=readFileSync(new URL('./originalContactDistance.ts',import.meta.url),'utf8');
 const predicate=/const interior=\(point:Vec3\)=>triangles\.every\(\(\[a,b,c\]\)=>\{[\s\S]*?\n \}\);/;
 if(!predicate.test(source))throw Error('Interior predicate oracle seam missing');
 const previous=source.replace(predicate,`const interior=(point:Vec3)=>triangles.every(([a,b,c])=>{
  const normal=cross(sub(b,a),sub(c,a));
  return dot(sub(point,a),normal)<=0;
 });`);
 const exports={} as typeof distanceKernel;
 const compiled=transpileModule(previous,{compilerOptions:{module:ModuleKind.CommonJS,target:ScriptTarget.ES2022}}).outputText;
 new Function('require','exports',compiled)((name:string)=>{
  if(name==='./originalConvexContact')return contactKernel;
  if(name==='./originalConvexSweep')return sweepKernel;
  throw Error(`Unexpected reference import ${name}`);
 },exports);
 return exports;
}
const v=(x=0,y=0,z=0):Vec3=>({x,y,z});
function fixture(movingReads:boolean){
 const reads:string[]=[];
 const coordinates=[v(-1,-1,-1),v(1,-1,-1),v(-1,1,-1),v(1,1,-1),v(-1,-1,1),v(1,-1,1),v(-1,1,1),v(1,1,1),v(-0,0,-0),v(-3,.125,.25)];
 const vertices=coordinates.map((point,index)=>{
  const descriptors=Object.fromEntries((['x','y','z'] as const).map(axis=>[axis,{get(){
   reads.push(`${index}.${axis}`);
   return point[axis]+(movingReads&&axis==='x'?reads.length*1e-12:0);
  }}]));
  return Object.defineProperties({},descriptors) as Vec3;
 });
 const shape:OriginalConvexPolytope={vertices,faceNormals:[v(1),v(-1),v(0,1),v(0,-1),v(0,0,1),v(0,0,-1)],edgeDirections:[v(1),v(0,1),v(0,0,1)],faces:[[0,2,1],[1,2,3],[4,5,6],[5,7,6],[0,4,2],[2,4,6],[1,3,5],[3,7,5],[0,1,4],[1,5,4],[2,6,3],[3,6,7]]};
 return {shape,reads};
}
describe('contact feature plane allocation preserves public behavior',()=>{
 const previous=previousKernel();
 for(const movingReads of [false,true])for(const query of ['triangle','pair'] as const){
  it(`${query} preserves exact contacts and ${movingReads?'changing':'stable'} coordinate accessor order with interior/exterior extra vertices`,()=>{
   const actual=fixture(movingReads),expected=fixture(movingReads);
   const run=(kernel:typeof distanceKernel,shape:OriginalConvexPolytope)=>query==='triangle'
    ?kernel.sweepOriginalConvexTriangleDistance(shape,v(-4),v(4),[v(0,-10,-10),v(0,10,-10),v(0,0,10)],.02)
    :kernel.sweepOriginalConvexPairDistance(shape,v(-5),v(-1),shape,v(),v(),.02);
   expect(run(distanceKernel,actual.shape)).toEqual(run(previous,expected.shape));
   expect(actual.reads).toEqual(expected.reads);
   expect(actual.reads.length).toBeGreaterThan(100);
  });
 }
});
