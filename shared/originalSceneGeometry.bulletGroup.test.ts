import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {createOriginalSceneGeometry,originalNodeWorldMatrices,sourcePointToWorld,type OriginalSceneData,type OriginalSceneMesh,type OriginalSceneNode} from './originalSceneGeometry';

const I=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
const node=(name:string,resource=name,parent='World'):OriginalSceneNode=>({name,resource,parent,matrix:I,visibility:1,shader:'default'});
const mesh=(resource:string,points:number[][],faces:number[][]):OriginalSceneMesh=>({resource,part:0,positions:points.map(([x,y,z])=>[x,-z,y]),faces,normals:[],tex_coords:[]});
const wall=(resource:string,z:number)=>mesh(resource,[[-2,0,z],[2,0,z],[2,3,z],[-2,3,z]],[[0,1,2],[0,2,3]]);
const origin={x:0,y:1,z:0},direction={x:0,y:0,z:1};
const excludes=(name:string)=>(candidate:string)=>candidate.toLowerCase()===name.toLowerCase();

describe('original bullet query group membership',()=>{
 it('skips a nearest excluded model before shortening the ray to its hit',()=>{
  const geometry=createOriginalSceneGeometry({nodes:[node('TREE'),node('wall')],meshes:[wall('TREE',1),wall('wall',2)]},{scale:1,cellSize:.5});
  expect(geometry.raycast(origin,direction,4)).toMatchObject({id:'TREE',distance:1});
  expect(geometry.raycast(origin,direction,4,{excludeModel:excludes('tree')})).toMatchObject({id:'wall',distance:2});
  expect(geometry.raycast(origin,direction,1.5,{excludeModel:excludes('tree')})).toBeNull();
 });

 it('excludes retained group descendants while keeping a similarly named sibling',()=>{
  const geometry=createOriginalSceneGeometry({nodes:[node('IgnoredGroup',''),node('Nested','', 'IGNOREDGROUP'),node('leaf','leaf','nEsTeD'),node('IgnoredGroupSibling')],meshes:[wall('leaf',1),wall('IgnoredGroupSibling',2)]},{scale:1,cellSize:.5});
  expect(geometry.raycast(origin,direction,4)).toMatchObject({id:'leaf',distance:1});
  expect(geometry.raycast(origin,direction,4,{excludeModel:excludes('ignoredgroup')})).toMatchObject({id:'IgnoredGroupSibling',distance:2});
  expect(geometry.raycast(origin,direction,4,{excludeModel:excludes('nested')})).toMatchObject({id:'IgnoredGroupSibling',distance:2});
 });

 it('returns no hit when every intersected model belongs to the excluded group',()=>{
  const geometry=createOriginalSceneGeometry({nodes:[node('smokes',''),node('leaf','leaf','smokes')],meshes:[wall('leaf',1)]},{scale:1});
  expect(geometry.raycast(origin,direction,4,{excludeModel:excludes('smokes')})).toBeNull();
  expect(geometry.raycast(origin,direction,4)).toMatchObject({id:'leaf'});
 });

 it('keeps invisible nonexcluded geometry eligible',()=>{
  const geometry=createOriginalSceneGeometry({nodes:[{...node('leaf'),visibility:0}],meshes:[wall('leaf',1)]},{scale:1});
  expect(geometry.raycast(origin,direction,4,{excludeModel:excludes('other')})).toMatchObject({id:'leaf'});
 });

 it('does not remove excluded ray geometry from support, sweeps or fixed pages',()=>{
  const roof=mesh('leaf',[[-2,2,-2],[2,2,-2],[2,2,2],[-2,2,2]],[[0,2,1],[0,3,2]]);
  const geometry=createOriginalSceneGeometry({nodes:[node('leaf')],meshes:[roof]},{scale:1,cellSize:.5});
  const from={x:0,y:3,z:0},to={x:0,y:1,z:0},down={x:0,y:-1,z:0};
  const support=geometry.supportHeightAt(0,0,4),sweep=geometry.sweepSphere(from,to,.1),page=geometry.fixedTrianglePage(0);
  expect(support).toBe(2);expect(sweep).not.toBeNull();expect(page.total).toBe(2);
  expect(geometry.raycast(from,down,3,{excludeModel:excludes('leaf')})).toBeNull();
  expect(geometry.supportHeightAt(0,0,4)).toBe(support);
  expect(geometry.sweepSphere(from,to,.1)).toEqual(sweep);
  expect(geometry.fixedTrianglePage(0)).toEqual(page);expect(geometry.triangleCount).toBe(2);
 });

 it('retains construction-time ancestry rather than reading later caller mutations',()=>{
  const leaf=node('leaf','leaf','smokes'),group=node('smokes','');
  const geometry=createOriginalSceneGeometry({nodes:[group,leaf],meshes:[wall('leaf',1)]},{scale:1});
  group.name='changed';leaf.parent='World';
  expect(geometry.raycast(origin,direction,4,{excludeModel:excludes('smokes')})).toBeNull();
 });

 for(const map of ['woodland-level2','barrack-level1'])it(`${map} retains a real outerfencing triangle for ordinary rays but omits it from an excluded bullet query`,()=>{
  const data=JSON.parse(readFileSync(new URL(`../docs/research-evidence/2026-09-30/w3d-decoded/${map}/geometry.json`,import.meta.url),'utf8')) as OriginalSceneData;
  const sourceNode=data.nodes.find(entry=>entry.name.toLowerCase()==='outerfencing')!;
  expect(sourceNode).toBeDefined();
  const geometry=createOriginalSceneGeometry(data,{scale:1,includeModel:excludes('outerfencing')});
  const sourceMesh=data.meshes.find(entry=>entry.resource.toLowerCase()===sourceNode.resource.toLowerCase())!;
  const matrix=originalNodeWorldMatrices(data).get(sourceNode.name.toLowerCase())!;
  const world=(index:number)=>{
   const p=sourceMesh.positions[index];return sourcePointToWorld([matrix[0]*p[0]+matrix[4]*p[1]+matrix[8]*p[2]+matrix[12],matrix[1]*p[0]+matrix[5]*p[1]+matrix[9]*p[2]+matrix[13],matrix[2]*p[0]+matrix[6]*p[1]+matrix[10]*p[2]+matrix[14]],1);
  };
  let found=false;
  for(const face of sourceMesh.faces){
   const [a,b,c]=face.map(world),u={x:b.x-a.x,y:b.y-a.y,z:b.z-a.z},v={x:c.x-a.x,y:c.y-a.y,z:c.z-a.z};
   const n={x:u.y*v.z-u.z*v.y,y:u.z*v.x-u.x*v.z,z:u.x*v.y-u.y*v.x},length=Math.hypot(n.x,n.y,n.z);
   if(length<=1e-9)continue;
   const d={x:-n.x/length,y:-n.y/length,z:-n.z/length};
   const o={x:(a.x+b.x+c.x)/3-d.x*.01,y:(a.y+b.y+c.y)/3-d.y*.01,z:(a.z+b.z+c.z)/3-d.z*.01};
   const hit=geometry.raycast(o,d,.02);if(!hit)continue;
   expect(hit.id.toLowerCase()).toBe('outerfencing');
   expect(geometry.raycast(o,d,.02,{excludeModel:excludes('outerfencing')})).toBeNull();found=true;break;
  }
  expect(found).toBe(true);
 });
});
