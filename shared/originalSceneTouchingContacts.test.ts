import {describe,expect,it} from 'vitest';
import {createOriginalSceneGeometry,type OriginalSceneMesh,type OriginalSceneNode} from './originalSceneGeometry';
import type {OriginalConvexPolytope} from './originalConvexSweep';
const I=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
function geometry(planes:{name:string;points:number[][]}[]){
 const nodes:OriginalSceneNode[]=planes.map(p=>({name:p.name,parent:'World',resource:p.name,matrix:I,visibility:1,shader:'default'}));
 const meshes:OriginalSceneMesh[]=planes.map(p=>({resource:p.name,part:0,positions:p.points.map(([x,y,z])=>[x,-z,y]),faces:[[0,1,2],[0,2,3]],normals:[],tex_coords:[]}));
 return createOriginalSceneGeometry({nodes,meshes},{scale:1,cellSize:1,includeModel:()=>true});
}
const floor=(y=0,name='floor')=>({name,points:[[-3,y,-3],[3,y,-3],[3,y,3],[-3,y,3]]});
const wall={name:'wall',points:[[0,-3,-3],[0,3,-3],[0,3,3],[0,-3,3]]};
const axis=[{x:1,y:0,z:0},{x:0,y:1,z:0},{x:0,y:0,z:1}];
const cube:OriginalConvexPolytope={vertices:[-.5,.5].flatMap(x=>[-.5,.5].flatMap(y=>[-.5,.5].map(z=>({x,y,z})))),faceNormals:axis.flatMap(v=>[v,{x:-v.x,y:-v.y,z:-v.z}]),edgeDirections:axis,
 faces:[[0,1,3,2],[4,6,7,5],[0,4,5,1],[2,3,7,6],[0,2,6,4],[1,5,7,3]].flatMap(([a,b,c,d])=>[[a,b,c],[a,c,d]])};
describe('stationary source scene touching contacts',()=>{
 it('retains sphere floor and wall together without a velocity gate',()=>{
  const g=geometry([floor(),wall]),p={x:.51,y:.51,z:0};const hits=g.contactsSphere(p,.5,.02);
  expect(hits.some(h=>h.model==='floor'&&h.normal.y>.99&&Math.abs(h.gap-.01)<1e-12)).toBe(true);
  expect(hits.some(h=>h.model==='wall'&&h.normal.x>.99&&Math.abs(h.gap-.01)<1e-12)).toBe(true);
  for(const h of hits){expect(h.position).toEqual(p);expect(h.fraction).toBe(0);expect(h.penetrationDepth).toBe(0);}
 });
 it('merges only coplanar convex patches while retaining floor plus wall',()=>{
  const g=geometry([floor(),wall]),hits=g.contactsConvex({x:.51,y:.51,z:0},cube,.02);
  expect(hits).toHaveLength(2);expect(hits.map(h=>h.model).sort()).toEqual(['floor','wall']);
  for(const h of hits){expect(h.gap).toBeCloseTo(.01,12);expect(h.penetrationDepth).toBe(0);expect(h.witnessPairs!.length).toBeGreaterThanOrEqual(4);}
 });
 it('does not merge distinct parallel planes with the same normal and model',()=>{
  const base=floor(),raised=floor(.005,'floor');
  const g=createOriginalSceneGeometry({nodes:[{name:'floor',resource:'floor',parent:'World',matrix:I,visibility:1,shader:'default'}],meshes:[
   {resource:'floor',part:0,positions:[...base.points,...raised.points].map(([x,y,z])=>[x,-z,y]),faces:[[0,1,2],[0,2,3],[4,5,6],[4,6,7]],normals:[],tex_coords:[]},
  ]},{scale:1});
  const hits=g.contactsConvex({x:0,y:.51,z:0},cube,.02);expect(hits).toHaveLength(2);
  expect(hits.every(h=>h.normal.y>.99)).toBe(true);expect(hits.map(h=>h.gap).sort((a,b)=>a-b)).toEqual([expect.closeTo(.005,12),expect.closeTo(.01,12)]);
 });
 it('retains actual finite surface witnesses for a positive skin gap and physical overlap',()=>{
  const g=geometry([floor()]);
  for(const [height,gap,depth] of [[.51,.01,0],[.49,-.01,.01]]){
   const h=g.contactsConvex({x:0,y:height,z:0},cube,.02)[0];expect(h.gap).toBeCloseTo(gap,12);expect(h.penetrationDepth).toBeCloseTo(depth,12);
   for(const pair of h.witnessPairs!){expect(pair.witnessA.y).toBeCloseTo(gap,12);expect(pair.witnessB.y).toBe(0);}
  }
 });
 it('retains unresolved edge SAT overlaps rather than inventing surface witnesses',()=>{
  const g=geometry([wall]),rotate=(v:{x:number;y:number;z:number})=>({x:(v.x-v.z)/Math.sqrt(2),y:v.y,z:(v.x+v.z)/Math.sqrt(2)});
  const turned={...cube,vertices:cube.vertices.map(rotate),faceNormals:cube.faceNormals.map(rotate),edgeDirections:cube.edgeDirections.map(rotate)};
  const hits=g.contactsConvex({x:.6,y:2,z:0},turned,0);
  expect(hits.length).toBeGreaterThan(0);expect(hits.some(h=>h.witnessA===undefined&&h.penetrationDepth>0)).toBe(true);
 });
 it('returns detached contacts, witnesses and normals across queries',()=>{
  const g=geometry([floor()]),p={x:0,y:.51,z:0};const first=g.contactsConvex(p,cube,.02),expected=g.contactsConvex(p,cube,.02);
  first[0].normal.y=88;first[0].position.y=88;first[0].witnessA!.y=88;first[0].witnessPairs![0].witnessB.y=88;
  expect(g.contactsConvex(p,cube,.02)).toEqual(expected);expect(p.y).toBe(.51);
  const sphere=g.contactsSphere(p,.5,.02);sphere[0].witnessB!.y=88;expect(g.contactsSphere(p,.5,.02)[0].witnessB!.y).toBe(0);
 });
 it('preserves full offset hulls and returns no disjoint candidates',()=>{
  const g=geometry([floor(),wall]);expect(g.contactsConvex({x:2,y:2,z:0},cube,.02)).toEqual([]);expect(g.contactsSphere({x:2,y:2,z:0},.5,.02)).toEqual([]);
  const offset={...cube,vertices:cube.vertices.map(v=>({...v,x:v.x+2}))};
  expect(g.contactsConvex({x:-1.49,y:2,z:0},offset,.02).some(h=>h.model==='wall'&&h.gap<.02)).toBe(true);
  expect(g.contactsConvex({x:-1.49,y:2,z:0},cube,.02)).toEqual([]);
 });
});
