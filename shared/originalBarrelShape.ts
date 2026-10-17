import type {Vec3} from './protocol';
import type {OriginalConvexPolytope} from './originalConvexSweep';

const sub=(a:Vec3,b:Vec3):Vec3=>({x:a.x-b.x,y:a.y-b.y,z:a.z-b.z});
const dot=(a:Vec3,b:Vec3)=>a.x*b.x+a.y*b.y+a.z*b.z;
const cross=(a:Vec3,b:Vec3):Vec3=>({x:a.y*b.z-a.z*b.y,y:a.z*b.x-a.x*b.z,z:a.x*b.y-a.y*b.x});
const size=(v:Vec3)=>Math.hypot(v.x,v.y,v.z);
const unit=(v:Vec3):Vec3=>{const n=size(v);return {x:v.x/n,y:v.y/n,z:v.z/n};};
interface Plane {normal:Vec3;indices:number[];anchor:number}

/** Construct the convex envelope of the retained barrel points once at setup.
 * Render triangles need not be convex: independently quantized upper/lower
 * rings can choose a side diagonal lying inside the actual point envelope.
 * No coordinates are inflated or recentered. This deterministic geometric
 * adapter does not establish Havok's native hull, inertia or angular response. */
export function createOriginalBarrelConvex(input:readonly Vec3[]):OriginalConvexPolytope {
 if(!input||input.some(v=>!v||![v.x,v.y,v.z].every(Number.isFinite)))throw Error('Invalid original barrel point cloud');
 const seen=new Set<string>(),vertices:Vec3[]=[];
 for(const v of input){const key=[v.x,v.y,v.z].join(',');if(!seen.has(key)){seen.add(key);vertices.push({...v});}}
 if(vertices.length<4)throw Error('Original barrel hull requires four noncoplanar points');
 const ranges=(['x','y','z'] as const).map(axis=>Math.max(...vertices.map(v=>v[axis]))-Math.min(...vertices.map(v=>v[axis])));
 const extent=Math.max(...ranges),epsilon=extent*1e-12;
 if(!Number.isFinite(extent)||extent===0)throw Error('Invalid original barrel point extent');
 const planes=new Map<string,Plane>();
 for(let a=0;a<vertices.length-2;a++)for(let b=a+1;b<vertices.length-1;b++)for(let c=b+1;c<vertices.length;c++){
  const raw=cross(sub(vertices[b],vertices[a]),sub(vertices[c],vertices[a]));
  if(size(raw)<=extent*extent*1e-14)continue;
  let normal=unit(raw),distances=vertices.map(v=>dot(normal,sub(v,vertices[a])));
  const low=Math.min(...distances),high=Math.max(...distances);
  if(low>=-epsilon&&high<=epsilon)continue; // Entire cloud is planar here.
  if(high>epsilon&&low< -epsilon)continue;
  if(low>=-epsilon){normal={x:-normal.x,y:-normal.y,z:-normal.z};distances=distances.map(d=>-d);}
  const indices=distances.flatMap((d,i)=>Math.abs(d)<=epsilon?[i]:[]),key=indices.join(',');
  if(!planes.has(key))planes.set(key,{normal,indices,anchor:a});
 }
 if(planes.size<4)throw Error('Original barrel hull requires four noncoplanar points');
 const faces:[number,number,number][]=[];
 for(const plane of planes.values()){
  const origin=vertices[plane.anchor],first=plane.indices.find(i=>i!==plane.anchor)!;
  const u=unit(sub(vertices[first],origin)),v=cross(plane.normal,u);
  const points=plane.indices.map(index=>{const p=sub(vertices[index],origin);return {index,x:dot(p,u),y:dot(p,v)};}).sort((a,b)=>a.x-b.x||a.y-b.y||a.index-b.index);
  type Point=typeof points[number];
  const turn=(a:Point,b:Point,c:Point)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
  const chain=(values:Point[])=>{const out:Point[]=[];for(const p of values){while(out.length>=2&&turn(out[out.length-2],out[out.length-1],p)<=extent*epsilon)out.pop();out.push(p);}return out;};
  const lower=chain(points),upper=chain([...points].reverse()),polygon=[...lower.slice(0,-1),...upper.slice(0,-1)].map(p=>p.index);
  if(polygon.length<3)throw Error('Degenerate original barrel hull polygon');
  // Start at the lowest retained index for deterministic coplanar diagonals.
  const start=polygon.indexOf(Math.min(...polygon)),ordered=[...polygon.slice(start),...polygon.slice(0,start)];
  for(let i=1;i<ordered.length-1;i++)faces.push([ordered[0],ordered[i],ordered[i+1]]);
 }
 faces.sort((a,b)=>a[0]-b[0]||a[1]-b[1]||a[2]-b[2]);
 const normals:Vec3[]=[],edges=new Map<string,{a:number;b:number;count:number;winding:number}>();
 for(const [a,b,c] of faces){
  const raw=cross(sub(vertices[b],vertices[a]),sub(vertices[c],vertices[a]));
  if(size(raw)<=extent*extent*1e-14)throw Error('Degenerate original barrel hull face');
  const normal=unit(raw);
  if(vertices.some(p=>dot(normal,sub(p,vertices[a]))>epsilon*4))throw Error('Invalid original barrel supporting plane');
  normals.push(normal);
  for(const [i,j] of [[a,b],[b,c],[c,a]]){const lo=Math.min(i,j),hi=Math.max(i,j),key=`${lo}:${hi}`,edge=edges.get(key)??{a:lo,b:hi,count:0,winding:0};edge.count++;edge.winding+=i<j?1:-1;edges.set(key,edge);}
 }
 if([...edges.values()].some(e=>e.count!==2||e.winding!==0))throw Error('Original barrel convex hull is not closed');
 const directions=[...edges.values()].sort((a,b)=>a.a-b.a||a.b-b.b).map(e=>unit(sub(vertices[e.b],vertices[e.a])));
 const freezeVectors=(values:Vec3[])=>Object.freeze(values.map(v=>Object.freeze(v)));
 return Object.freeze({vertices:freezeVectors(vertices),faces:Object.freeze(faces.map(f=>Object.freeze(f))),faceNormals:freezeVectors(normals),edgeDirections:freezeVectors(directions)});
}
