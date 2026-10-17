import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {createOriginalSceneGeometry} from './originalSceneGeometry';
import {sweepOriginalConvexTriangle,type OriginalConvexPolytope} from './originalConvexSweep';
import {sweepOriginalConvexTriangleDistance} from './originalContactDistance';
import {originalGrenadeConvex} from './originalGrenadeShape';
import {originalGrenadeBasisFromDirection} from './originalGrenadeOrientation';
import {originalRpgConvex,originalRpgBasisFromDirection} from './originalRpgShape';
import {createOriginalBarrelConvex} from './originalBarrelShape';
import {ORIGINAL_MAP_SCALE as S} from './originalMapProfile';
import type {Vec3} from './protocol';
const at=(x=0,y=0,z=0):Vec3=>({x,y,z});
// Broad-phase parity concerns existing collision timing/normal/depth/pivot.
// Actual manifold witnesses are independently checked by patch/physics tests.
const collisionFields=(hit:ReturnType<typeof sweepOriginalConvexTriangle>)=>hit?{fraction:hit.fraction,position:hit.position,normal:hit.normal,initialOverlap:hit.initialOverlap,penetrationDepth:hit.penetrationDepth}:null;
const points=[at(-2,0,-2),at(2,0,-2),at(2,0,2),at(-2,0,2)],faces=[[0,2,1],[0,3,2]];
const triangles=faces.map(face=>face.map(i=>points[i]) as [Vec3,Vec3,Vec3]);
const geometry=()=>createOriginalSceneGeometry({nodes:[{name:'floor',parent:'World',resource:'floor',matrix:[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],visibility:1,shader:'fixture'}],meshes:[{resource:'floor',part:0,positions:points.map(p=>[p.x,-p.z,p.y]),faces,normals:[],tex_coords:[]}]},{scale:1,cellSize:.5});
function exhaustive(shape:OriginalConvexPolytope,from:Vec3,to:Vec3,tolerance:number){
 let best:ReturnType<typeof sweepOriginalConvexTriangle>=null;
 const travel=at(to.x-from.x,to.y-from.y,to.z-from.z);
 for(const face of triangles){
  const hit=tolerance?sweepOriginalConvexTriangleDistance(shape,from,to,face,tolerance):sweepOriginalConvexTriangle(shape,from,to,face);
  if(hit&&!(tolerance>0&&hit.fraction<=1e-12&&(travel.x**2+travel.y**2+travel.z**2)>0&&(travel.x*hit.normal.x+travel.y*hit.normal.y+travel.z*hit.normal.z)>=-1e-15)&&(!best||hit.fraction<best.fraction))best=hit;
 }
 return best;
}
describe('convex world bounds retain finite contacts',()=>{
 it('matches all-triangle enumeration for the three full recovered hulls and finite edges',()=>{
  const data=JSON.parse(readFileSync(new URL('../public/assets/original-scenes/barrack/scene.json',import.meta.url),'utf8'));
  const barrel=createOriginalBarrelConvex(data.meshes.find((m:any)=>m.resource==='barrel').positions.map((p:number[])=>at(p[0]*S,p[2]*S,-p[1]*S)));
  for(const shape of [barrel,originalGrenadeConvex(originalGrenadeBasisFromDirection(at(.2,-1,.1))),originalRpgConvex(originalRpgBasisFromDirection(at(.1,.3,-1)))]){
   const g=geometry();
   for(const tolerance of [0,S])for(const x of [-3,-2.2,-1.9,0,1.9,2.2,3])for(const z of [-2.2,0,2.2]){
    const from=at(x,.7,z),to=at(x+.04,-.1,z-.03);
    expect(collisionFields(g.sweepConvex(from,to,shape,tolerance))).toEqual(collisionFields(exhaustive(shape,from,to,tolerance)));
   }
  }
 });
 it('revalidates changed mutable hull points instead of retaining old bounds',()=>{
  const source=originalGrenadeConvex(originalGrenadeBasisFromDirection(at(0,-1,0)));
  const shape={...source,vertices:source.vertices.map(v=>({...v}))},g=geometry(),from=at(0,.7),to=at(0,-.1);
  const hit=g.sweepConvex(from,to,shape,S);expect(hit).not.toBeNull();
  expect(collisionFields(hit)).toEqual(collisionFields(exhaustive(shape,from,to,S)));
  for(const v of shape.vertices)v.x+=10;
  expect(g.sweepConvex(from,to,shape,S)).toBeNull();
  shape.vertices[0].x=NaN;expect(()=>g.sweepConvex(from,to,shape,S)).toThrow('Invalid original convex movement');
 });
});
