import {describe,expect,it} from 'vitest';
import {createOriginalSceneGeometry,type OriginalSceneData} from './originalSceneGeometry';
const identity=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
function geometry(points:number[][]){const data:OriginalSceneData={nodes:[{name:'triangle',parent:'World',resource:'triangle',matrix:identity,visibility:1,shader:'default'}],meshes:[{resource:'triangle',part:0,positions:points.map(([x,y,z])=>[x,-z,y]),faces:[[0,1,2]],normals:[],tex_coords:[]}]};return createOriginalSceneGeometry(data,{scale:1,cellSize:.25});}
const floor=()=>geometry([[0,0,0],[2,0,0],[0,0,2]]);
describe('sphere point-distance triangle features',()=>{
 it('retains face-interior continuous contact at the original sphere center',()=>{
  const hit=floor().sweepSphere({x:.5,y:1,z:.5},{x:.5,y:-1,z:.5},.2)!;expect(hit).not.toBeNull();expect(hit.position.y).toBeCloseTo(.2,5);expect(hit.fraction).toBeCloseTo(.4,5);expect(hit.normal).toEqual({x:0,y:1,z:0});
 });
 it('retains an edge contact when the projected face point is outside the triangle',()=>{
  const hit=floor().sweepSphere({x:.5,y:1,z:-.12},{x:.5,y:-1,z:-.12},.2)!;expect(hit).not.toBeNull();expect(hit.position.y).toBeCloseTo(.16,5);expect(hit.normal.x).toBeCloseTo(0,10);expect(hit.normal.y).toBeCloseTo(.8,5);expect(hit.normal.z).toBeCloseTo(-.6,5);
 });
 it('retains a vertex contact outside both adjacent edges',()=>{
  const hit=floor().sweepSphere({x:-.1,y:1,z:-.1},{x:-.1,y:-1,z:-.1},.2)!;expect(hit).not.toBeNull();expect(hit.position.y).toBeCloseTo(Math.sqrt(.02),5);expect(hit.normal.x).toBeCloseTo(-.5,5);expect(hit.normal.y).toBeCloseTo(Math.SQRT1_2,5);expect(hit.normal.z).toBeCloseTo(-.5,5);
 });
 it('preserves the oblique face normal and center offset',()=>{
  const scene=geometry([[-2,-2,-2],[2,2,-2],[0,0,2]]),n={x:-Math.SQRT1_2,y:Math.SQRT1_2,z:0};const hit=scene.sweepSphere({x:n.x,y:n.y,z:0},{x:-n.x,y:-n.y,z:0},.25)!;expect(hit).not.toBeNull();expect(hit.position.x).toBeCloseTo(n.x*.25,5);expect(hit.position.y).toBeCloseTo(n.y*.25,5);expect(hit.normal.x).toBeCloseTo(n.x,10);expect(hit.normal.y).toBeCloseTo(n.y,10);
 });
 it('does not turn tangent edge grazing or separating face contact into a collision',()=>{
  const scene=floor();expect(scene.sweepSphere({x:.2,y:0,z:-.2},{x:1.2,y:0,z:-.2},.2)).toBeNull();expect(scene.sweepSphere({x:.5,y:.2,z:.5},{x:.5,y:1,z:.5},.2)).toBeNull();
 });
});
