import type {Vec3} from '../../../../../shared/protocol';
import type {OriginalConvexPolytope} from '../../../../../shared/originalConvexSweep';

export interface OriginalContactPatch {witnessA:Vec3;witnessB:Vec3;area:number;pairs:Array<{witnessA:Vec3;witnessB:Vec3}>}
interface Point2 {x:number;y:number}
const dot=(a:Vec3,b:Vec3)=>a.x*b.x+a.y*b.y+a.z*b.z;
const sub=(a:Vec3,b:Vec3):Vec3=>({x:a.x-b.x,y:a.y-b.y,z:a.z-b.z});
const cross=(a:Vec3,b:Vec3):Vec3=>({x:a.y*b.z-a.z*b.y,y:a.z*b.x-a.x*b.z,z:a.x*b.y-a.y*b.x});
const finite=(v:Vec3)=>[v.x,v.y,v.z].every(Number.isFinite);
const scaleOf=(points:readonly Vec3[])=>{
 let scale=1e-150;
 for(let index=0,count=points.length;index<count;index++){
  if(!(index in points))continue;
  const v=points[index];scale=Math.max(scale,Math.abs(v.x),Math.abs(v.y),Math.abs(v.z));
 }
 return scale;
};
const ROUND_OFF=128*Number.EPSILON;
function frame(normal:Vec3,pivots:readonly Vec3[]) {
 if(!finite(normal)||!pivots.every(finite)||Math.abs(Math.hypot(normal.x,normal.y,normal.z)-1)>1e-12)throw Error('Invalid original contact patch');
 const absolute=[Math.abs(normal.x),Math.abs(normal.y),Math.abs(normal.z)],index=absolute.indexOf(Math.min(...absolute));
 const seed={x:index===0?1:0,y:index===1?1:0,z:index===2?1:0},raw=cross(seed,normal),length=Math.hypot(raw.x,raw.y,raw.z);
 const u={x:raw.x/length,y:raw.y/length,z:raw.z/length},v=cross(normal,u);
 return {u,v};
}
function support(shape:OriginalConvexPolytope,normal:Vec3,minimum:boolean):{vertices:Vec3[];height:number}|null {
 if(shape.vertices.length===0||!shape.vertices.every(finite))throw Error('Invalid original contact patch');
 const heights=shape.vertices.map(vertex=>dot(vertex,normal)),height=minimum?Math.min(...heights):Math.max(...heights),epsilon=ROUND_OFF*scaleOf(shape.vertices);
 const vertices=shape.vertices.filter((_,index)=>Math.abs(heights[index]-height)<=epsilon).map(vertex=>({...vertex}));
 return vertices.length>=3?{vertices,height}:null;
}
const turn=(a:Point2,b:Point2,c:Point2)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
function hull(points:readonly Point2[],epsilon:number,areaEpsilon:number):Point2[] {
 const sorted=points.map(point=>({...point})).sort((a,b)=>a.x-b.x||a.y-b.y),unique:Point2[]=[];
 for(const point of sorted){const last=unique.at(-1);if(!last||Math.hypot(point.x-last.x,point.y-last.y)>epsilon)unique.push(point);}
 if(unique.length<3)return [];
 const half=(list:readonly Point2[])=>{const result:Point2[]=[];for(const point of list){while(result.length>=2&&turn(result[result.length-2],result[result.length-1],point)<=areaEpsilon)result.pop();result.push(point);}return result;};
 const lower=half(unique),upper=half([...unique].reverse());lower.pop();upper.pop();const result=[...lower,...upper];return result.length>=3?result:[];
}
function intersection(a:readonly Point2[],b:readonly Point2[],areaEpsilon:number):Point2[] {
 let polygon=a.map(point=>({...point}));
 for(let index=0;index<b.length&&polygon.length;index++){
  const start=b[index],end=b[(index+1)%b.length],input=polygon;polygon=[];
  let previous=input[input.length-1],previousDistance=turn(start,end,previous),previousInside=previousDistance>=-areaEpsilon;
  for(const current of input){
   const distance=turn(start,end,current),inside=distance>=-areaEpsilon;
   if(inside!==previousInside){const denominator=previousDistance-distance;if(denominator!==0){const fraction=Math.max(0,Math.min(1,previousDistance/denominator));polygon.push({x:previous.x+(current.x-previous.x)*fraction,y:previous.y+(current.y-previous.y)*fraction});}}
   if(inside)polygon.push({...current});previous=current;previousDistance=distance;previousInside=inside;
  }
 }
 return polygon;
}
function patch(verticesA:readonly Vec3[],verticesB:readonly Vec3[],origin:Vec3,normal:Vec3,heightA:number,heightB:number,u:Vec3,v:Vec3,planeB?:{normal:Vec3;point:Vec3}):OriginalContactPatch|null {
 const project=(point:Vec3):Point2=>({x:dot(point,u),y:dot(point,v)}),a=verticesA.map(project),b=verticesB.map(project);
 const points=[...a,...b],scale=Math.max(1e-150,...points.flatMap(point=>[Math.abs(point.x),Math.abs(point.y)])),epsilon=ROUND_OFF*scale;
 const extent=Math.max(1e-150,Math.max(...points.map(point=>point.x))-Math.min(...points.map(point=>point.x)),Math.max(...points.map(point=>point.y))-Math.min(...points.map(point=>point.y))),areaEpsilon=epsilon*extent;
 const hullA=hull(a,epsilon,areaEpsilon),hullB=hull(b,epsilon,areaEpsilon);if(!hullA.length||!hullB.length)return null;
 const polygon=hull(intersection(hullA,hullB,areaEpsilon),epsilon,areaEpsilon);if(polygon.length<3)return null;
 // Integrate triangles around an actual polygon vertex to avoid cancellation
 // from an off-axis physical pivot. No arbitrary support vertex supplies torque.
 const anchor=polygon[0];let twiceArea=0,x=0,y=0;
 for(let index=1;index+1<polygon.length;index++){const p=polygon[index],q=polygon[index+1],area=turn(anchor,p,q);twiceArea+=area;x+=area*((p.x-anchor.x)+(q.x-anchor.x));y+=area*((p.y-anchor.y)+(q.y-anchor.y));}
 if(twiceArea<=areaEpsilon)return null;
 const centroid={x:anchor.x+x/(3*twiceArea),y:anchor.y+y/(3*twiceArea)};
 const surfacePair=(point:Point2)=>{
  const tangent={x:u.x*point.x+v.x*point.y,y:u.y*point.x+v.y*point.y,z:u.z*point.x+v.z*point.y};
  const fixedHeight=planeB?dot(planeB.normal,sub(planeB.point,tangent))/dot(planeB.normal,normal):heightB;
  const restore=(height:number):Vec3=>({x:origin.x+tangent.x+normal.x*height,y:origin.y+tangent.y+normal.y*height,z:origin.z+tangent.z+normal.z*height});
  return {witnessA:restore(heightA),witnessB:restore(fixedHeight)};
 };
 return {...surfacePair(centroid),area:twiceArea/2,pairs:polygon.map(surfacePair)};
}

/** Finite intersecting supporting faces, reduced to their area centroid. This
 * single patch is a reconstruction, not a recovered native contact manifold.
 * Non-face/empty/edge-only intersections retain the caller's nearest-feature fallback. */
export function originalConvexPairPatch(shapeA:OriginalConvexPolytope,pivotA:Vec3,shapeB:OriginalConvexPolytope,pivotB:Vec3,normalBToA:Vec3):OriginalContactPatch|null {
 const {u,v}=frame(normalBToA,[pivotA,pivotB]),a=support(shapeA,normalBToA,true),b=support(shapeB,normalBToA,false);if(!a||!b)return null;
 const relative=sub(pivotB,pivotA),verticesB=b.vertices.map(vertex=>({x:vertex.x+relative.x,y:vertex.y+relative.y,z:vertex.z+relative.z}));
 return patch(a.vertices,verticesB,pivotA,normalBToA,a.height,b.height+dot(relative,normalBToA),u,v);
}

/** The fixed side is the finite supplied triangle, never its infinite plane. */
export function originalConvexTrianglePatch(shape:OriginalConvexPolytope,pivot:Vec3,triangle:readonly [Vec3,Vec3,Vec3],normalFixedToA:Vec3):OriginalContactPatch|null {
 const {u,v}=frame(normalFixedToA,[pivot,...triangle]),a=support(shape,normalFixedToA,true);
 const relative=triangle.map(vertex=>sub(vertex,pivot)),heights=relative.map(vertex=>dot(vertex,normalFixedToA)),height=heights[0],epsilon=ROUND_OFF*scaleOf(relative);
 if(a&&heights.every(value=>Math.abs(value-height)<=epsilon))return patch(a.vertices,relative,pivot,normalFixedToA,a.height,height,u,v);
 // A roundoff-level angle between independently reconstructed face normals
 // can select a single support corner. Use an actual hull face only when its
 // unit-dot alignment differs by at most16EPS; do not flatten either surface.
 const rawTriangleNormal=cross(sub(relative[1],relative[0]),sub(relative[2],relative[0])),triangleLength=Math.hypot(rawTriangleNormal.x,rawTriangleNormal.y,rawTriangleNormal.z);
 if(triangleLength===0)return null;
 const triangleNormal={x:rawTriangleNormal.x/triangleLength,y:rawTriangleNormal.y/triangleLength,z:rawTriangleNormal.z/triangleLength};
 const contactLength=Math.hypot(normalFixedToA.x,normalFixedToA.y,normalFixedToA.z),contactNormal={x:normalFixedToA.x/contactLength,y:normalFixedToA.y/contactLength,z:normalFixedToA.z/contactLength};
 for(const outward of shape.faceNormals){
  if(!finite(outward))throw Error('Invalid original contact patch');
  const length=Math.hypot(outward.x,outward.y,outward.z);if(length===0)continue;
  const inward={x:-outward.x/length,y:-outward.y/length,z:-outward.z/length};
  if(dot(inward,contactNormal)<1-16*Number.EPSILON||Math.abs(dot(inward,triangleNormal))<1-16*Number.EPSILON)continue;
  const face=support(shape,inward,true);if(!face)continue;
  const basis=frame(inward,[pivot]);
  return patch(face.vertices,relative,pivot,inward,face.height,0,basis.u,basis.v,{normal:triangleNormal,point:relative[0]});
 }
 return null;
}
