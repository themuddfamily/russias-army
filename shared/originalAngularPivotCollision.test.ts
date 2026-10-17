import {afterEach,describe,expect,it,vi} from 'vitest';
import * as contacts from './originalConvexContact';
import * as patches from './originalContactPatch';
import {createOriginalAngularBody} from './originalAngularBody';
import {stepOriginalPhysicsWorld,type OriginalMovableBody} from './originalPlayerPhysics';
import type {OriginalConvexPolytope} from './originalConvexSweep';
import type {Vec3} from './protocol';
const at=(x=0,y=0,z=0):Vec3=>({x,y,z});
function box(offset:Vec3):OriginalConvexPolytope {
 const vertices=[at(-1,-1,-1),at(1,-1,-1),at(-1,1,-1),at(1,1,-1),at(-1,-1,1),at(1,-1,1),at(-1,1,1),at(1,1,1)].map(v=>at(v.x+offset.x,v.y+offset.y,v.z+offset.z));
 return {vertices,faceNormals:[at(1),at(-1),at(0,1),at(0,-1),at(0,0,1),at(0,0,-1)],edgeDirections:[at(1),at(0,1),at(0,0,1)],faces:[[0,2,1],[1,2,3],[4,5,6],[5,7,6],[0,4,2],[2,4,6],[1,3,5],[3,7,5],[0,1,4],[1,5,4],[2,6,3],[3,6,7]]};
}
function body(id:string,offset:Vec3,position=at()):OriginalMovableBody {
 const convex=box(offset);return {id,position,velocity:at(),convex,angular:createOriginalAngularBody(convex,1),radius:Math.max(...convex.vertices.map(v=>Math.hypot(v.x,v.y,v.z))),mass:1,restitution:.2,friction:.1};
}
afterEach(()=>vi.restoreAllMocks());
describe('rotating offset-pivot collision paths',()=>{
 it('keeps a candidate reached by rotational pivot displacement despite equal COM velocities',()=>{
  const a=body('a',at(10)),b=body('b',at());a.angular!.angularVelocity=at(0,0,-30);
  b.position=at(0,a.radius+b.radius+.001,0);
  const sweep=vi.spyOn(contacts,'sweepOriginalConvexPair').mockReturnValue(null);
  const queries:Array<{from:Vec3;to:Vec3}>=[];
  stepOriginalPhysicsWorld([],[],{movableBodies:[a,b],sweep:()=>null,sweepConvex:(from,to)=>{queries.push({from:{...from},to:{...to}});return null;}});
  const first=queries[0],second=queries[1];
  const relativeTravel=Math.hypot((first.to.x-first.from.x)-(second.to.x-second.from.x),(first.to.y-first.from.y)-(second.to.y-second.from.y),(first.to.z-first.from.z)-(second.to.z-second.from.z));
  expect(relativeTravel).toBeGreaterThan(.001);expect(sweep).toHaveBeenCalled();
  expect(sweep.mock.calls[0][1]).toEqual(first.from);expect(sweep.mock.calls[0][2]).toEqual(first.to);
 });
 it('constructs finite face patches at the same interpolated pivot positions as the narrow-phase sweep',()=>{
  const a=body('a',at(0,3)),b=body('b',at(),at(0,1));a.angular!.angularVelocity=at(30);
  const sweep=vi.spyOn(contacts,'sweepOriginalConvexPair').mockReturnValue(null);
  sweep.mockReturnValueOnce({fraction:.5,normalBToA:at(0,1),penetrationDepth:0,initialOverlap:false});
  const patch=vi.spyOn(patches,'originalConvexPairPatch');
  stepOriginalPhysicsWorld([],[],{movableBodies:[a,b],sweep:()=>null,sweepConvex:()=>null});
  expect(patch).toHaveBeenCalled();
  const query=sweep.mock.calls[0],call=patch.mock.calls[0];
  const interpolate=(from:Vec3,to:Vec3)=>at(from.x+(to.x-from.x)*.5,from.y+(to.y-from.y)*.5,from.z+(to.z-from.z)*.5);
  expect(call[1]).toEqual(interpolate(query[1],query[2]));expect(call[3]).toEqual(interpolate(query[4],query[5]));
  // The rotating off-center model pivot moves in Z even though COMvelocity.z=0.
  expect(Math.abs(call[1].z-query[1].z)).toBeGreaterThan(.001);
  expect(patch.mock.results[0].value?.pairs.length).toBeGreaterThanOrEqual(3);
 });
});
