import {originalConvexTrianglePatch} from './originalContactPatch';
import type {Vec3} from './protocol';
import type {ArenaRayHit,ArenaRaycastOptions} from './arenaCollision';
import {sweepOriginalConvexTriangleDistance} from './originalContactDistance';
import {originalConvexIsImmutable,sweepOriginalConvexTriangle,type OriginalConvexPolytope,type OriginalConvexSweepHit,type OriginalFixedConvexFeature} from './originalConvexSweep';

export interface OriginalSceneMesh {
  resource:string;
  part:number;
  positions:readonly (readonly number[])[];
  faces:readonly (readonly number[])[];
  normals:readonly (readonly number[])[];
  tex_coords:readonly (readonly (readonly number[])[])[];
}
export interface OriginalSceneNode {
  name:string;
  parent:string;
  resource:string;
  matrix:readonly number[];
  visibility:number;
  shader:string;
}
export interface OriginalSceneData {
  meshes:readonly OriginalSceneMesh[];
  nodes:readonly OriginalSceneNode[];
}
/** Stationary geometry contact, independent of response/notification policy.
 * Unresolved SAT edge/vertex overlaps honestly omit surface witnesses. */
export interface OriginalSceneTouchingContact {
  position:Vec3;fraction:0;normal:Vec3;penetrationDepth:number;gap:number;model?:string;
  witnessA?:Vec3;witnessB?:Vec3;
  witnessPairs?:Array<{witnessA:Vec3;witnessB:Vec3}>;
}
export interface OriginalSceneBounds {min:Vec3;max:Vec3}
export interface OriginalSceneGeometryOptions {
  /** Normalization chosen by the caller, not a recovered unit-to-meter value. */
  scale:number;
  cellSize?:number;
  /** Instance-local dynamic layers may select exact source models explicitly. */
  includeModel?:(name:string)=>boolean;
}
export interface OriginalFixedTriangleRevision {
  /** Instance identity only: no scene activation, dynamic-door or native revision claim. */
  readonly scope:'immutable-construction-subset';
}
export interface OriginalFixedTriangleEntry {
  /** Deterministic construction index, meaningful only with this instance's revision. */
  readonly id:string;
  readonly sourceIndex:number;
  readonly model:string;
  readonly triangle:readonly [Readonly<Vec3>,Readonly<Vec3>,Readonly<Vec3>];
}
export interface OriginalFixedTrianglePage {
  readonly revision:OriginalFixedTriangleRevision;
  readonly offset:number;
  readonly nextOffset:number;
  readonly total:number;
  readonly complete:boolean;
  readonly triangles:readonly OriginalFixedTriangleEntry[];
}
interface Triangle {convexFace:readonly [Vec3,Vec3,Vec3];a:Vec3;b:Vec3;c:Vec3;normal:Vec3;model:string;ground:boolean}
const IDENTITY=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
const EPSILON=1e-9;

/** Original geometry is Z-up. This proper rotation preserves handedness. */
export function sourcePointToWorld(point:readonly number[],scale:number):Vec3 {
  return {x:point[0]*scale,y:point[2]*scale,z:-point[1]*scale};
}

function multiply(a:readonly number[],b:readonly number[]):number[] {
  const out=new Array<number>(16).fill(0);
  for(let col=0;col<4;col++)for(let row=0;row<4;row++)for(let k=0;k<4;k++)out[col*4+row]+=a[k*4+row]*b[col*4+k];
  return out;
}
function pointTransform(m:readonly number[],p:readonly number[]):number[] {
  return [m[0]*p[0]+m[4]*p[1]+m[8]*p[2]+m[12],m[1]*p[0]+m[5]*p[1]+m[9]*p[2]+m[13],m[2]*p[0]+m[6]*p[1]+m[10]*p[2]+m[14]];
}

/** Column-major original node transforms, including stored parent hierarchy. */
export function originalNodeWorldMatrices(data:OriginalSceneData):ReadonlyMap<string,readonly number[]> {
  const nodes=new Map<string,OriginalSceneNode>();
  for(const node of data.nodes){
    const key=node.name.toLowerCase();if(nodes.has(key))throw new Error(`Duplicate original node: ${node.name}`);
    if(node.matrix.length!==16||!node.matrix.every(Number.isFinite))throw new Error(`Invalid original matrix: ${node.name}`);
    nodes.set(key,node);
  }
  const matrices=new Map<string,readonly number[]>(),visiting=new Set<string>();
  const resolve=(key:string):readonly number[]=>{
    const existing=matrices.get(key);if(existing)return existing;
    if(visiting.has(key))throw new Error(`Cyclic original parent: ${key}`);
    const node=nodes.get(key);if(!node)throw new Error(`Missing original parent: ${key}`);
    visiting.add(key);
    const parent=node.parent.toLowerCase();
    const matrix=multiply(parent===''||parent==='world'?IDENTITY:resolve(parent),node.matrix);
    matrices.set(key,matrix);visiting.delete(key);return matrix;
  };
  for(const key of nodes.keys())resolve(key);
  return matrices;
}

/** Recovered worldphysics.setupmodels eligibility; visibility is not a physics exclusion. */
export function isOriginalFixedModel(name:string):boolean {
  const lower=name.toLowerCase();return !['door','baddy','barrel'].some(word=>lower.includes(word));
}
function emptyBounds():OriginalSceneBounds{return {min:{x:Infinity,y:Infinity,z:Infinity},max:{x:-Infinity,y:-Infinity,z:-Infinity}};}
function extend(bounds:OriginalSceneBounds,p:Vec3):void {for(const axis of ['x','y','z'] as const){bounds.min[axis]=Math.min(bounds.min[axis],p[axis]);bounds.max[axis]=Math.max(bounds.max[axis],p[axis]);}}
function normal(a:Vec3,b:Vec3,c:Vec3):Vec3 {
  const ux=b.x-a.x,uy=b.y-a.y,uz=b.z-a.z,vx=c.x-a.x,vy=c.y-a.y,vz=c.z-a.z;
  const x=uy*vz-uz*vy,y=uz*vx-ux*vz,z=ux*vy-uy*vx,m=Math.hypot(x,y,z);
  return m>EPSILON?{x:x/m,y:y/m,z:z/m}:{x:0,y:0,z:0};
}
function rayTriangle(origin:Vec3,d:Vec3,t:Triangle):number|null {
  const e1={x:t.b.x-t.a.x,y:t.b.y-t.a.y,z:t.b.z-t.a.z},e2={x:t.c.x-t.a.x,y:t.c.y-t.a.y,z:t.c.z-t.a.z};
  const p={x:d.y*e2.z-d.z*e2.y,y:d.z*e2.x-d.x*e2.z,z:d.x*e2.y-d.y*e2.x};
  const det=e1.x*p.x+e1.y*p.y+e1.z*p.z;if(Math.abs(det)<EPSILON)return null;
  const inv=1/det,s={x:origin.x-t.a.x,y:origin.y-t.a.y,z:origin.z-t.a.z};
  const u=(s.x*p.x+s.y*p.y+s.z*p.z)*inv;if(u< -EPSILON||u>1+EPSILON)return null;
  const q={x:s.y*e1.z-s.z*e1.y,y:s.z*e1.x-s.x*e1.z,z:s.x*e1.y-s.y*e1.x};
  const v=(d.x*q.x+d.y*q.y+d.z*q.z)*inv;if(v< -EPSILON||u+v>1+EPSILON)return null;
  return (e2.x*q.x+e2.y*q.y+e2.z*q.z)*inv;
}

export interface OriginalPlayerMoveResult {
  position:Vec3;
  /** Projection of completed movement onto the requested displacement. */
  fraction:number;
  collided:boolean;
  normals:Vec3[];
}
interface ClosestPair {axis:Vec3;triangle:Vec3;distance:number}
const add=(a:Vec3,b:Vec3):Vec3=>({x:a.x+b.x,y:a.y+b.y,z:a.z+b.z});
const sub=(a:Vec3,b:Vec3):Vec3=>({x:a.x-b.x,y:a.y-b.y,z:a.z-b.z});
const scaled=(a:Vec3,s:number):Vec3=>({x:a.x*s,y:a.y*s,z:a.z*s});
const dot=(a:Vec3,b:Vec3):number=>a.x*b.x+a.y*b.y+a.z*b.z;
const squared=(a:Vec3):number=>dot(a,a);
function closestTrianglePoint(p:Vec3,t:Triangle):Vec3 {
  const ab=sub(t.b,t.a),ac=sub(t.c,t.a),ap=sub(p,t.a),d1=dot(ab,ap),d2=dot(ac,ap);
  if(d1<=0&&d2<=0)return t.a;
  const bp=sub(p,t.b),d3=dot(ab,bp),d4=dot(ac,bp);
  if(d3>=0&&d4<=d3)return t.b;
  const vc=d1*d4-d3*d2;
  if(vc<=0&&d1>=0&&d3<=0)return add(t.a,scaled(ab,d1/(d1-d3)));
  const cp=sub(p,t.c),d5=dot(ab,cp),d6=dot(ac,cp);
  if(d6>=0&&d5<=d6)return t.c;
  const vb=d5*d2-d1*d6;
  if(vb<=0&&d2>=0&&d6<=0)return add(t.a,scaled(ac,d2/(d2-d6)));
  const va=d3*d6-d5*d4;
  if(va<=0&&d4-d3>=0&&d5-d6>=0)return add(t.b,scaled(sub(t.c,t.b),(d4-d3)/((d4-d3)+(d5-d6))));
  const inv=1/(va+vb+vc);return add(t.a,add(scaled(ab,vb*inv),scaled(ac,vc*inv)));
}
function closestSegments(a:Vec3,b:Vec3,c:Vec3,d:Vec3):{first:Vec3;second:Vec3} {
  const u=sub(b,a),v=sub(d,c),w=sub(a,c),aa=dot(u,u),bb=dot(u,v),cc=dot(v,v),dd=dot(u,w),ee=dot(v,w);
  let s=0,t=0;
  if(aa<=EPSILON&&cc<=EPSILON)return {first:a,second:c};
  if(aa<=EPSILON)t=Math.max(0,Math.min(1,ee/cc));
  else if(cc<=EPSILON)s=Math.max(0,Math.min(1,-dd/aa));
  else{
    const den=aa*cc-bb*bb;s=den>EPSILON?Math.max(0,Math.min(1,(bb*ee-cc*dd)/den)):0;
    t=(bb*s+ee)/cc;
    if(t<0){t=0;s=Math.max(0,Math.min(1,-dd/aa));}
    else if(t>1){t=1;s=Math.max(0,Math.min(1,(bb-dd)/aa));}
  }
  return {first:add(a,scaled(u,s)),second:add(c,scaled(v,t))};
}
function closestCapsuleAxis(a:Vec3,b:Vec3,t:Triangle):ClosestPair {
  const axisVector=sub(b,a),length=Math.sqrt(squared(axisVector));
  // A sphere has coincident capsule-axis endpoints. The point/triangle query
  // already includes finite face, edge and vertex regions; repeating endpoint
  // and three degenerate segment queries adds no geometric information.
  if(a.x===b.x&&a.y===b.y&&a.z===b.z){
    const triangle=closestTrianglePoint(a,t);
    return {axis:a,triangle,distance:Math.sqrt(squared(sub(a,triangle)))};
  }
  if(length>EPSILON){
    const hit=rayTriangle(a,scaled(axisVector,1/length),t);
    if(hit!==null&&hit>=0&&hit<=length){const p=add(a,scaled(axisVector,hit/length));return {axis:p,triangle:p,distance:0};}
  }
  const triangleA=closestTrianglePoint(a,t),triangleB=closestTrianglePoint(b,t);
  let best:ClosestPair={axis:a,triangle:triangleA,distance:Math.sqrt(squared(sub(a,triangleA)))};
  const distanceB=Math.sqrt(squared(sub(b,triangleB)));if(distanceB<best.distance)best={axis:b,triangle:triangleB,distance:distanceB};
  for(const [c,d] of [[t.a,t.b],[t.b,t.c],[t.c,t.a]]){
    const pair=closestSegments(a,b,c,d),distance=Math.sqrt(squared(sub(pair.first,pair.second)));
    if(distance<best.distance)best={axis:pair.first,triangle:pair.second,distance};
  }
  return best;
}
function validCapsule(radius:number,height:number):boolean {
  return Number.isFinite(radius)&&Number.isFinite(height)&&radius>0&&height>=2*radius;
}
function capsuleAxis(feet:Vec3,radius:number,height:number):[Vec3,Vec3] {
  if(height===2*radius){const center={x:feet.x,y:feet.y+radius,z:feet.z};return [center,center];}
  return [{x:feet.x,y:feet.y+radius,z:feet.z},{x:feet.x,y:feet.y+height-radius,z:feet.z}];
}

/** Shared exact triangle geometry for original-map support and combat queries.
 * Whole-model bounds are used only for broad phase, never as blocking solids.
 */
export class OriginalSceneGeometry {
  private readonly fixedTriangleRevision:OriginalFixedTriangleRevision=Object.freeze({scope:'immutable-construction-subset'});
  readonly bounds:OriginalSceneBounds;
  readonly groundBounds:OriginalSceneBounds|null;
  readonly triangleCount:number;
  readonly cellSize:number;
  private readonly triangles:Triangle[]=[];
  private readonly grid=new Map<string,number[]>();
  private readonly modelAncestors=new Map<string,readonly string[]>();
  constructor(data:OriginalSceneData,options:OriginalSceneGeometryOptions){
    if(!Number.isFinite(options.scale)||options.scale<=0)throw new Error('Original scene scale must be finite and positive.');
    const matrices=originalNodeWorldMatrices(data),meshes=new Map<string,OriginalSceneMesh[]>();
    // The matrix resolver has already validated the complete parent hierarchy.
    // Retain each model's names once; ray-only group removal must not discard
    // those triangles from the shared movement/support construction.
    const nodes=new Map(data.nodes.map(node=>[node.name.toLowerCase(),node]));
    const ancestry=(node:OriginalSceneNode):readonly string[]=>{
      const retained=this.modelAncestors.get(node.name);if(retained)return retained;
      const parent=node.parent.toLowerCase();
      const names=Object.freeze([node.name,...(parent===''||parent==='world'?[]:ancestry(nodes.get(parent)!))]);
      this.modelAncestors.set(node.name,names);return names;
    };
    for(const node of data.nodes)ancestry(node);
    for(const mesh of data.meshes){const key=mesh.resource.toLowerCase(),parts=meshes.get(key)??[];parts.push(mesh);meshes.set(key,parts);}
    const bounds=emptyBounds(),groundBounds=emptyBounds();
    for(const node of data.nodes){
      if(!(options.includeModel??isOriginalFixedModel)(node.name))continue;
      const parts=meshes.get(node.resource.toLowerCase());if(!parts)continue; // Stored nonmesh groups/lights.
      const matrix=matrices.get(node.name.toLowerCase())!,ground=node.name.toLowerCase()==='floor';
      for(const mesh of parts){
        const positions=mesh.positions.map(p=>{
          if(p.length!==3||!p.every(Number.isFinite))throw new Error(`Invalid original position: ${node.name}`);
          return Object.freeze(sourcePointToWorld(pointTransform(matrix,p),options.scale));
        });
        for(const face of mesh.faces){
          if(face.length!==3||face.some(i=>!Number.isInteger(i)||i<0||i>=positions.length))throw new Error(`Invalid original face: ${node.name}`);
          const [a,b,c]=face.map(i=>positions[i]),n=normal(a,b,c);
          if(n.x===0&&n.y===0&&n.z===0)continue;
          this.triangles.push({a,b,c,convexFace:Object.freeze([a,b,c] as [Vec3,Vec3,Vec3]),normal:n,model:node.name,ground});
          for(const p of [a,b,c]){extend(bounds,p);if(ground)extend(groundBounds,p);}
        }
      }
    }
    if(!this.triangles.length)throw new Error('Original scene contains no fixed triangles.');
    this.bounds=bounds;this.groundBounds=Number.isFinite(groundBounds.min.x)?groundBounds:null;
    this.triangleCount=this.triangles.length;
    this.cellSize=options.cellSize??Math.max(.5,Math.max(bounds.max.x-bounds.min.x,bounds.max.z-bounds.min.z)/64);
    if(!Number.isFinite(this.cellSize)||this.cellSize<=0)throw new Error('Original grid cell size must be finite and positive.');
    for(const [index,t] of this.triangles.entries()){
      const minX=Math.floor(Math.min(t.a.x,t.b.x,t.c.x)/this.cellSize),maxX=Math.floor(Math.max(t.a.x,t.b.x,t.c.x)/this.cellSize);
      const minZ=Math.floor(Math.min(t.a.z,t.b.z,t.c.z)/this.cellSize),maxZ=Math.floor(Math.max(t.a.z,t.b.z,t.c.z)/this.cellSize);
      for(let x=minX;x<=maxX;x++)for(let z=minZ;z<=maxZ;z++){
        const key=`${x},${z}`,cell=this.grid.get(key)??[];cell.push(index);this.grid.set(key,cell);
      }
    }
  }
  /** Enumerate at most32 constructed nondegenerate triangles, without spatial
   * filtering. Eligibility is exactly the constructor's includeModel/default
   * predicate; invisible source models remain eligible. Custom dynamic-layer
   * instances describe their own construction subset, never all active layers.
   * Source indices refer to retained triangle order, not original mesh face IDs.
   * Fresh frozen copies expose no internal triangle or caller input references.
   * complete means nextOffset===total only. Full population coverage requires
   * contiguous pages beginning at0 with the same revision token and total;
   * a terminal empty page alone supplies no all-scene exclusion proof.
   */
  fixedTrianglePage(offset:number,limit=32):OriginalFixedTrianglePage {
    const total=this.triangles.length;
    if(!Number.isSafeInteger(offset)||offset<0||offset>total)throw new Error('Invalid fixed triangle page offset');
    if(!Number.isSafeInteger(limit)||limit<1||limit>32)throw new Error('Fixed triangle page limit must be an integer from1 to32');
    const nextOffset=Math.min(total,offset+limit);
    const triangles:OriginalFixedTriangleEntry[]=[];
    for(let sourceIndex=offset;sourceIndex<nextOffset;sourceIndex++){
      const source=this.triangles[sourceIndex];
      const triangle=Object.freeze([
        Object.freeze({...source.convexFace[0]}),Object.freeze({...source.convexFace[1]}),Object.freeze({...source.convexFace[2]}),
      ] as const);
      triangles.push(Object.freeze({id:`fixed-triangle:${sourceIndex}`,sourceIndex,model:source.model,triangle}));
    }
    return Object.freeze({revision:this.fixedTriangleRevision,offset,nextOffset,total,complete:nextOffset===total,triangles:Object.freeze(triangles)});
  }
  supportHeightAt(x:number,z:number,maxY=Infinity,groundOnly=false):number|undefined {
    if(!Number.isFinite(x)||!Number.isFinite(z)||Number.isNaN(maxY))return undefined;
    let best=-Infinity;
    for(const index of this.grid.get(`${Math.floor(x/this.cellSize)},${Math.floor(z/this.cellSize)}`)??[]){
      const t=this.triangles[index];
      // goody.hitobj resets jumping only for a contact normal above .5 Z-up.
      // Roof undersides and steep faces are blockers, never standing support.
      if(t.normal.y<=.5||(groundOnly&&!t.ground))continue;
      const {a,b,c}=t,den=(b.z-c.z)*(a.x-c.x)+(c.x-b.x)*(a.z-c.z);if(Math.abs(den)<EPSILON)continue;
      const u=((b.z-c.z)*(x-c.x)+(c.x-b.x)*(z-c.z))/den,v=((c.z-a.z)*(x-c.x)+(a.x-c.x)*(z-c.z))/den;
      if(u< -EPSILON||v< -EPSILON||u+v>1+EPSILON)continue;
      const y=u*a.y+v*b.y+(1-u-v)*c.y;if(y<=maxY+EPSILON)best=Math.max(best,y);
    }
    return Number.isFinite(best)?best:undefined;
  }
  private triangleCandidates(minX:number,maxX:number,minZ:number,maxZ:number):number[] {
    const indices=new Set<number>();
    for(let x=Math.floor(minX/this.cellSize);x<=Math.floor(maxX/this.cellSize);x++)
      for(let z=Math.floor(minZ/this.cellSize);z<=Math.floor(maxZ/this.cellSize);z++)
        for(const index of this.grid.get(`${x},${z}`)??[])indices.add(index);
    return [...indices];
  }
  /** Upright capsule; height=2*radius selects a sphere. Tangent contact is safe. */
  playerIntersects(feet:Vec3,radius:number,height:number):boolean {
    if(!validCapsule(radius,height)||![feet.x,feet.y,feet.z].every(Number.isFinite))throw new Error('Invalid original player capsule.');
    const [a,b]=capsuleAxis(feet,radius,height);
    for(const index of this.triangleCandidates(feet.x-radius,feet.x+radius,feet.z-radius,feet.z+radius)){
      const t=this.triangles[index];
      if(Math.max(t.a.y,t.b.y,t.c.y)<feet.y-EPSILON||Math.min(t.a.y,t.b.y,t.c.y)>feet.y+height+EPSILON)continue;
      if(closestCapsuleAxis(a,b,t).distance<radius-1e-7)return true;
    }
    return false;
  }
  /** Resolve initial overlap by contact-normal translation, not authored offsets.
   * Each correction is the penetration depth at the nearest capsule/triangle
   * contact. An impossible or nonconvergent placement fails explicitly.
   */
  resolvePlayerOverlap(feet:Vec3,radius:number,height:number):Vec3 {
    if(!validCapsule(radius,height)||![feet.x,feet.y,feet.z].every(Number.isFinite))throw new Error('Invalid original player placement.');
    let position={...feet};
    for(let iteration=0;iteration<64;iteration++){
      const [a,b]=capsuleAxis(position,radius,height);
      let deepest=0,correction:Vec3|null=null;
      for(const index of this.triangleCandidates(position.x-radius,position.x+radius,position.z-radius,position.z+radius)){
        const t=this.triangles[index];
        if(Math.max(t.a.y,t.b.y,t.c.y)<position.y-EPSILON||Math.min(t.a.y,t.b.y,t.c.y)>position.y+height+EPSILON)continue;
        const pair=closestCapsuleAxis(a,b,t);if(pair.distance>=radius-1e-7)continue;
        let penetration=radius-pair.distance,n:Vec3;
        if(pair.distance>EPSILON)n=scaled(sub(pair.axis,pair.triangle),1/pair.distance);
        else{
          const da=dot(sub(a,t.a),t.normal),db=dot(sub(b,t.a),t.normal);
          const positive=radius-Math.min(da,db),negative=radius+Math.max(da,db);
          const sign=positive<=negative?1:-1;n=scaled(t.normal,sign);penetration=Math.min(positive,negative);
        }
        if(penetration>deepest){deepest=penetration;correction=scaled(n,penetration+1e-7);}
      }
      if(!correction)return position;
      position=add(position,correction);
    }
    if(this.playerIntersects(position,radius,height))throw new Error('Original player overlap did not converge.');
    return position;
  }
  /** Feet height at which the rounded player base touches a walkable facet.
   * Unlike a center-only height query this includes normal clearance on slopes.
   */
  playerSupportHeightAt(x:number,z:number,maxY:number,radius:number,height:number,groundOnly=false):number|undefined {
    if(!validCapsule(radius,height)||![x,z].every(Number.isFinite)||Number.isNaN(maxY))throw new Error('Invalid original support query.');
    let best=-Infinity;
    const edgeSupport=(a:Vec3,b:Vec3):number|undefined=>{
      const dx=b.x-a.x,dz=b.z-a.z,dy=b.y-a.y,ox=x-a.x,oz=z-a.z,A=dx*dx+dz*dz;
      let u:number;
      if(A<=EPSILON)u=dy>=0?1:0;
      else{
        const middle=(ox*dx+oz*dz)/A;
        const perpendicularSquared=Math.max(0,ox*ox+oz*oz-(ox*dx+oz*dz)**2/A);
        const available=radius*radius-perpendicularSquared;if(available<0)return undefined;
        // Maximum of edgeY(u)+sqrt(radius²-horizontalDistance²), a concave
        // spherical support envelope. Clamping handles finite edge endpoints.
        u=Math.max(0,Math.min(1,middle+dy*Math.sqrt(available)/(Math.sqrt(A)*Math.sqrt(A+dy*dy))));
      }
      const horizontalSquared=(x-a.x-u*dx)**2+(z-a.z-u*dz)**2;
      const verticalSquared=radius*radius-horizontalSquared;
      if(verticalSquared<=.25*radius*radius)return undefined; // Contact normal must exceed .5 upward.
      return a.y+u*dy+Math.sqrt(verticalSquared)-radius;
    };
    for(const index of this.triangleCandidates(x-radius,x+radius,z-radius,z+radius)){
      const t=this.triangles[index],n=t.normal;if(groundOnly&&!t.ground)continue;
      if(n.y>.5){
        const planeY=t.a.y-(n.x*(x-t.a.x)+n.z*(z-t.a.z))/n.y;
        const feetY=planeY+radius*(1/n.y-1);
        if(feetY<=maxY+EPSILON){
          const center={x,y:feetY+radius,z},contact=sub(center,scaled(n,radius));
          if(squared(sub(contact,closestTrianglePoint(contact,t)))<=1e-12)best=Math.max(best,feetY);
        }
      }
      // Finite ramp/roof edges need rounded support where the face projection
      // has just left the facet. A downward-facing underside is never support.
      if(n.y< -EPSILON)continue;
      for(const [a,b] of [[t.a,t.b],[t.b,t.c],[t.c,t.a]]){
        const feetY=edgeSupport(a,b);
        if(feetY===undefined||feetY>maxY+EPSILON)continue;
        const center={x,y:feetY+radius,z},closest=closestTrianglePoint(center,t),difference=sub(center,closest),distance=Math.sqrt(squared(difference));
        // An internal triangulation edge cannot support through its own face.
        if(distance>=radius-1e-7 && difference.y/distance>.5 && feetY>best
          && !this.playerIntersects({x,y:feetY,z},radius,height))best=feetY;
      }
    }
    return Number.isFinite(best)?best:undefined;
  }
  /** Every stationary finite-triangle contact inside one total contact skin.
   * No closing-velocity gate or desired rest-gap rule is imposed. */
  contactsSphere(position:Vec3,radius:number,contactDistance=0):OriginalSceneTouchingContact[] {
    if(!Object.values(position).every(Number.isFinite)||!Number.isFinite(radius)||radius<=0||!Number.isFinite(contactDistance)||contactDistance<0)throw Error('Invalid original sphere contact query');
    const reach=radius+contactDistance,result:OriginalSceneTouchingContact[]=[];
    for(const index of this.triangleCandidates(position.x-reach,position.x+reach,position.z-reach,position.z+reach)){
      const triangle=this.triangles[index];
      if(Math.max(triangle.a.y,triangle.b.y,triangle.c.y)<position.y-reach||Math.min(triangle.a.y,triangle.b.y,triangle.c.y)>position.y+reach)continue;
      const witnessB=closestTrianglePoint(position,triangle),difference=sub(position,witnessB),distance=Math.sqrt(squared(difference));
      if(distance>reach+1e-12)continue;
      const n=distance>1e-12?scaled(difference,1/distance):scaled(triangle.normal,dot(sub(position,triangle.a),triangle.normal)>=0?1:-1);
      const witnessA=sub(position,scaled(n,radius));
      // Identical seam witnesses are redundant; distinct finite features remain.
      if(result.some(old=>old.model===triangle.model&&old.witnessB&&squared(sub(old.witnessB,witnessB))<=1e-24&&squared(sub(old.normal,n))<=1e-24))continue;
      result.push({position:{...position},fraction:0,normal:{...n},penetrationDepth:Math.max(0,radius-distance),gap:distance-radius,model:triangle.model,
        witnessA:{...witnessA},witnessB:{...witnessB},witnessPairs:[{witnessA:{...witnessA},witnessB:{...witnessB}}]});
    }
    return result;
  }

  /** Stationary complete-hull contacts, retaining all touching planes.
   * Only finite patches on the same geometric plane are merged. */
  contactsConvex(position:Vec3,shape:OriginalConvexPolytope,contactDistance=0):OriginalSceneTouchingContact[] {
    if(!Object.values(position).every(Number.isFinite)||!Number.isFinite(contactDistance)||contactDistance<0)throw Error('Invalid original convex contact query');
    const local=emptyBounds();for(const vertex of shape.vertices)extend(local,vertex);
    const bounds={min:add(local.min,position),max:add(local.max,position)};
    const result:OriginalSceneTouchingContact[]=[];
    const groups:Array<{contact:OriginalSceneTouchingContact;planeNormal:Vec3;planePoint:Vec3;area:number}>=[];
    const coordinateScale=Math.max(1,...Object.values(bounds.min).map(Math.abs),...Object.values(bounds.max).map(Math.abs));
    const roundoff=128*Number.EPSILON*coordinateScale;
    for(const index of this.triangleCandidates(bounds.min.x-contactDistance,bounds.max.x+contactDistance,bounds.min.z-contactDistance,bounds.max.z+contactDistance)){
      const triangle=this.triangles[index];
      if((['x','y','z'] as const).some(axis=>Math.max(triangle.a[axis],triangle.b[axis],triangle.c[axis])<bounds.min[axis]-contactDistance||Math.min(triangle.a[axis],triangle.b[axis],triangle.c[axis])>bounds.max[axis]+contactDistance))continue;
      const hit=sweepOriginalConvexTriangleDistance(shape,position,position,triangle.convexFace,contactDistance);if(!hit)continue;
      const patch=originalConvexTrianglePatch(shape,position,triangle.convexFace,hit.normal);
      const witnessA=patch?.witnessA??hit.witnessA,witnessB=patch?.witnessB??hit.witnessB;
      const contact:OriginalSceneTouchingContact={position:{...position},fraction:0,normal:{...hit.normal},penetrationDepth:Math.max(0,hit.penetrationDepth??0),
        gap:witnessA&&witnessB?dot(sub(witnessA,witnessB),hit.normal):-Math.max(0,hit.penetrationDepth??0),model:triangle.model,
        ...(witnessA&&witnessB?{witnessA:{...witnessA},witnessB:{...witnessB},witnessPairs:(patch?.pairs??[{witnessA,witnessB}]).map(pair=>({witnessA:{...pair.witnessA},witnessB:{...pair.witnessB}}))}:{}),};
      if(patch){
        const group=groups.find(old=>old.contact.model===triangle.model&&squared(sub(old.contact.normal,hit.normal))<=32*Number.EPSILON
          &&Math.abs(Math.abs(dot(old.planeNormal,triangle.normal))-1)<=16*Number.EPSILON
          &&triangle.convexFace.every(point=>Math.abs(dot(sub(point,old.planePoint),old.planeNormal))<=roundoff));
        if(group){
          const previous=group.contact,total=group.area+patch.area;
          previous.witnessA=scaled(add(scaled(previous.witnessA!,group.area),scaled(witnessA!,patch.area)),1/total);
          previous.witnessB=scaled(add(scaled(previous.witnessB!,group.area),scaled(witnessB!,patch.area)),1/total);
          for(const pair of contact.witnessPairs!)if(!previous.witnessPairs!.some(old=>squared(sub(old.witnessA,pair.witnessA))<=roundoff**2&&squared(sub(old.witnessB,pair.witnessB))<=roundoff**2))previous.witnessPairs!.push(pair);
          previous.gap=dot(sub(previous.witnessA,previous.witnessB),previous.normal);previous.penetrationDepth=Math.max(previous.penetrationDepth,contact.penetrationDepth);group.area=total;continue;
        }
        groups.push({contact,planeNormal:{...triangle.normal},planePoint:{...triangle.a},area:patch.area});
      }
      result.push(contact);
    }
    return result;
  }

  /** Sweep a sphere center against the actual concave triangles. The caller
   * supplies its physical radius; no ground-height or box approximation. */
  sweepSphere(from:Vec3,to:Vec3,radius:number,contactDistance=0):{position:Vec3;normal:Vec3;fraction:number;penetrationDepth?:number;witnessA?:Vec3;witnessB?:Vec3}|null {
    if(!Number.isFinite(radius)||radius<=0||!Number.isFinite(contactDistance)||contactDistance<0)throw new Error('Invalid sphere radius/contact distance');
    if(contactDistance>0)return this.sweepSphereContactDistance(from,to,radius,contactDistance);
    const feet={x:from.x,y:from.y-radius,z:from.z},delta=sub(to,from);
    const hit=this.sweepPlayer(feet,delta,radius,2*radius);
    if(!hit.normal)return null;
    return {position:add(from,scaled(delta,hit.fraction)),normal:hit.normal,fraction:hit.fraction};
  }
  /** Full fixed-orientation convex translation against recovered triangles.
   * Vertices retain their physical pivot; bounds are broad phase only. This
   * query serves both recovered projectile hulls; optional contact distance is
   * separate from physical overlap and does not resize the resource. */
  private readonly convexBounds=new WeakMap<OriginalConvexPolytope,ReturnType<typeof emptyBounds>>();
  // Stable per-construction callback identity, with no pose or skin history.
  private readonly fixedRefreshes=new WeakMap<Triangle,OriginalFixedConvexFeature['refresh']>();
  sweepConvex(from:Vec3,to:Vec3,shape:OriginalConvexPolytope,contactDistance=0,surfaceVelocity?:(point:Vec3)=>Vec3):OriginalConvexSweepHit|null {
    if(!Number.isFinite(contactDistance)||contactDistance<0)throw Error('Invalid original contact distance');
    if(![from.x,from.y,from.z,to.x,to.y,to.z].every(Number.isFinite))throw Error('Invalid original convex movement');
    const local=this.convexLocalBounds(shape);
    const bounds=emptyBounds();
    // Addition is monotone: the same exact extreme vertices supply these
    // bounds as the full translated point enumeration, without new points.
    for(const axis of ['x','y','z'] as const){
      bounds.min[axis]=Math.min(local.min[axis]+from[axis],local.min[axis]+to[axis]);
      bounds.max[axis]=Math.max(local.max[axis]+from[axis],local.max[axis]+to[axis]);
    }
    const candidates=this.triangleCandidates(bounds.min.x-contactDistance,bounds.max.x+contactDistance,bounds.min.z-contactDistance,bounds.max.z+contactDistance);
    let best:OriginalConvexSweepHit|null=null,selectedIndex=-1;
    for(const index of candidates){
      const triangle=this.triangles[index];
      if((['x','y','z'] as const).some(axis=>Math.max(triangle.a[axis],triangle.b[axis],triangle.c[axis])<bounds.min[axis]-contactDistance||Math.min(triangle.a[axis],triangle.b[axis],triangle.c[axis])>bounds.max[axis]+contactDistance))continue;
      let hit=contactDistance>0?sweepOriginalConvexTriangleDistance(shape,from,to,triangle.convexFace,contactDistance):sweepOriginalConvexTriangle(shape,from,to,triangle.convexFace);
      if(!hit)continue;
      if(contactDistance>0&&hit.fraction<=1e-12){
       const patch=surfaceVelocity?originalConvexTrianglePatch(shape,hit.position,triangle.convexFace,hit.normal):null;
       const separating=surfaceVelocity?(patch?patch.pairs.every(pair=>dot(surfaceVelocity(pair.witnessA),hit!.normal)>=-1e-15):dot(surfaceVelocity(hit.witnessA??hit.position),hit.normal)>=-1e-15):squared(sub(to,from))>0&&dot(sub(to,from),hit.normal)>=-1e-15;
       if(separating)continue;
      }
      if(!best||hit.fraction<best.fraction){best=hit;selectedIndex=index;}
    }
    if(!best)return null;
    const selected=this.triangles[selectedIndex];
    // The immutable triangle and closure belong to this construction snapshot;
    // a later door snapshot cannot reinterpret its local triangle index.
    let refresh=this.fixedRefreshes.get(selected);
    if(!refresh){
      refresh=(currentShape:OriginalConvexPolytope,position:Vec3,distance:number)=>this.refreshFixedConvexFeature(selected,currentShape,position,distance);
      this.fixedRefreshes.set(selected,refresh);
    }
    const fixedFeature:OriginalFixedConvexFeature=Object.freeze({revision:this.fixedTriangleRevision,sourceIndex:selectedIndex,model:selected.model,contactDistance,
      triangle:selected.convexFace,refresh});
    return {...this.convexImpactPatches(best,shape,local,candidates),fixedFeature};
  }

  private convexLocalBounds(shape:OriginalConvexPolytope):OriginalSceneBounds {
    let local=this.convexBounds.get(shape);
    if(!local){
      if(shape.vertices.length<4||!shape.vertices.every(v=>[v.x,v.y,v.z].every(Number.isFinite)))throw Error('Invalid original convex movement');
      local=emptyBounds();for(const vertex of shape.vertices)extend(local,vertex);
      if(originalConvexIsImmutable(shape))this.convexBounds.set(shape,local);
    }
    return local;
  }

  private refreshFixedConvexFeature(selected:Triangle,shape:OriginalConvexPolytope,position:Vec3,contactDistance:number):OriginalConvexSweepHit|null {
    if(!Number.isFinite(contactDistance)||contactDistance<0)throw Error('Invalid original contact distance');
    if(![position.x,position.y,position.z].every(Number.isFinite))throw Error('Invalid original convex movement');
    const local=this.convexLocalBounds(shape);
    // Direct stationary narrow phase preserves the selected finite triangle.
    // The translating sweep's separating-velocity filter does not apply here.
    const hit=contactDistance>0?sweepOriginalConvexTriangleDistance(shape,position,position,selected.convexFace,contactDistance)
      :sweepOriginalConvexTriangle(shape,position,position,selected.convexFace);
    if(!hit)return null;
    const candidates=this.triangleCandidates(local.min.x+position.x-contactDistance,local.max.x+position.x+contactDistance,
      local.min.z+position.z-contactDistance,local.max.z+position.z+contactDistance);
    return this.convexImpactPatches(hit,shape,local,candidates);
  }

  private convexImpactPatches(best:OriginalConvexSweepHit,shape:OriginalConvexPolytope,local:OriginalSceneBounds,candidates:readonly number[]):OriginalConvexSweepHit {
    // Gather finite support patches at the SELECTED impact pose, including
    // adjoining triangles whose plane differs only at unit-dot roundoff.
    const gap=best.witnessA&&best.witnessB?dot(sub(best.witnessA,best.witnessB),best.normal):-(best.penetrationDepth??0);
    const extent=Math.max(local.max.x-local.min.x,local.max.y-local.min.y,local.max.z-local.min.z);
    const allowance=Math.max(1e-12,2*extent*Math.sqrt(32*Number.EPSILON));
    let area=0,a:Vec3={x:0,y:0,z:0},b:Vec3={x:0,y:0,z:0};
    const pairs:Array<{witnessA:Vec3;witnessB:Vec3}>=[];
    for(const index of candidates){
     const patch=originalConvexTrianglePatch(shape,best.position,this.triangles[index].convexFace,best.normal);
     if(!patch||patch.pairs.some(pair=>Math.abs(dot(sub(pair.witnessA,pair.witnessB),best!.normal)-gap)>allowance))continue;
     area+=patch.area;a=add(a,scaled(patch.witnessA,patch.area));b=add(b,scaled(patch.witnessB,patch.area));
     for(const pair of patch.pairs)if(!pairs.some(old=>squared(sub(old.witnessA,pair.witnessA))<=allowance*allowance&&squared(sub(old.witnessB,pair.witnessB))<=allowance*allowance))pairs.push(pair);
    }
    return area>0?{...best,witnessA:scaled(a,1/area),witnessB:scaled(b,1/area),witnessPairs:pairs}:best;
  }
  /** Physics-only spherical skin query retains the physical center and radius.
   * Closest finite features produce rounded edge/vertex contacts. Placement,
   * overlap, movement and combat-ray queries retain their existing semantics. */
  private sweepSphereContactDistance(from:Vec3,to:Vec3,radius:number,contactDistance:number):{position:Vec3;normal:Vec3;fraction:number;penetrationDepth:number;witnessA:Vec3;witnessB:Vec3}|null {
    if(![from,to].every(v=>[v.x,v.y,v.z].every(Number.isFinite)))throw Error('Invalid original sphere path');
    const delta=sub(to,from),reach=radius+contactDistance,epsilon=1e-10;
    let best:{position:Vec3;normal:Vec3;fraction:number;penetrationDepth:number;witnessA:Vec3;witnessB:Vec3}|null=null;
    const candidates=this.triangleCandidates(Math.min(from.x,to.x)-reach,Math.max(from.x,to.x)+reach,Math.min(from.z,to.z)-reach,Math.max(from.z,to.z)+reach);
    for(const index of candidates){
      const triangle=this.triangles[index];
      if(Math.max(triangle.a.y,triangle.b.y,triangle.c.y)<Math.min(from.y,to.y)-reach||Math.min(triangle.a.y,triangle.b.y,triangle.c.y)>Math.max(from.y,to.y)+reach)continue;
      const evaluate=(fraction:number)=>{
        const position=add(from,scaled(delta,fraction)),closest=closestTrianglePoint(position,triangle),difference=sub(position,closest),distance=Math.sqrt(squared(difference));
        const normal=distance>epsilon?scaled(difference,1/distance):scaled(triangle.normal,dot(sub(from,triangle.a),triangle.normal)>=0?1:-1);
        return {position,normal,distance,closest};
      };
      let fraction=0,state=evaluate(0),hit=false,rejected=false;
      for(let iteration=0;iteration<128;iteration++){
        if(state.distance<=reach+epsilon){hit=true;break;}
        const closing=-dot(delta,state.normal);
        // Distance to a finite convex triangle is convex along translation.
        // Once separated distance is nondecreasing, it cannot hit later.
        if(closing<=0){rejected=true;break;}if(closing<=1e-15)break;
        const advance=(state.distance-reach)/closing;if(advance<=1e-15)break;
        fraction+=advance;if(fraction>1+epsilon)break;fraction=Math.min(1,fraction);state=evaluate(fraction);
      }
      // A graze can converge slowly. Verify the convex distance minimum and
      // bisect its first threshold crossing rather than inventing a contact.
      if(!hit&&!rejected&&fraction<=1){
        let lo=fraction,hi=1;
        for(let iteration=0;iteration<64;iteration++){const middle=(lo+hi)/2;if(dot(delta,evaluate(middle).normal)<0)lo=middle;else hi=middle;}
        const minimum=(lo+hi)/2;
        if(evaluate(minimum).distance<=reach+epsilon){lo=fraction;hi=minimum;for(let iteration=0;iteration<64;iteration++){const middle=(lo+hi)/2;if(evaluate(middle).distance<=reach+epsilon)hi=middle;else lo=middle;}fraction=hi;state=evaluate(fraction);hit=true;}
      }
      if(hit&&!(fraction<=1e-12&&squared(delta)>0&&dot(delta,state.normal)>=-1e-15)&&(!best||fraction<best.fraction))best={position:state.position,normal:state.normal,fraction,penetrationDepth:Math.max(0,radius-state.distance),witnessA:sub(state.position,scaled(state.normal,radius)),witnessB:{...state.closest}};
    }
    return best;
  }
  private sweepPlayer(from:Vec3,delta:Vec3,radius:number,height:number):{fraction:number;normal:Vec3|null} {
    const length=Math.sqrt(squared(delta));if(length<=EPSILON)return {fraction:1,normal:null};
    const target=add(from,delta),candidates=this.triangleCandidates(Math.min(from.x,target.x)-radius,Math.max(from.x,target.x)+radius,Math.min(from.z,target.z)-radius,Math.max(from.z,target.z)+radius);
    let fraction=0,lastNormal:Vec3|null=null;
    // Distance to a convex triangle/capsule pair is 1-Lipschitz under
    // translation. Advancing by separation/|delta| cannot tunnel through it.
    for(let iteration=0;iteration<96;iteration++){
      const position=add(from,scaled(delta,fraction)),[a,b]=capsuleAxis(position,radius,height);
      let gap=Infinity,nearestNormal:Vec3|null=null;
      for(const index of candidates){
        const t=this.triangles[index];
        const minY=Math.min(from.y,target.y),maxY=Math.max(from.y,target.y)+height;
        if(Math.max(t.a.y,t.b.y,t.c.y)<minY-EPSILON||Math.min(t.a.y,t.b.y,t.c.y)>maxY+EPSILON)continue;
        const planeA=dot(sub(a,t.a),t.normal),planeB=dot(sub(b,t.a),t.normal);
        const planeSide=planeA>=0?1:-1;
        // A capsule separated from the whole face plane and moving parallel
        // or away cannot hit its finite triangle. This also avoids asymptotic
        // conservative steps toward harmless coplanar triangulation seams.
        if(planeA*planeB>=0 && Math.min(Math.abs(planeA),Math.abs(planeB))>=radius-1e-7
          && dot(delta,t.normal)*planeSide>=-EPSILON)continue;
        const pair=closestCapsuleAxis(a,b,t),difference=sub(pair.axis,pair.triangle);
        const n=pair.distance>EPSILON?scaled(difference,1/pair.distance):scaled(t.normal,dot(sub(a,t.a),t.normal)>=0?1:-1);
        if(pair.distance<radius-1e-7)return {fraction,normal:n};
        // Convex distance is nondecreasing along a direction away from its
        // current separating normal; tangent floors do not stop horizontal motion.
        if(dot(delta,n)>=-EPSILON)continue;
        const separation=pair.distance-radius;
        if(separation<gap){gap=separation;nearestNormal=n;}
      }
      if(!nearestNormal||gap>length*(1-fraction))return {fraction:1,normal:null};
      lastNormal=nearestNormal;
      if(gap<=1e-6)return {fraction:Math.max(0,fraction-1e-7/length),normal:nearestNormal};
      fraction+=gap/length;
      if(fraction>=1)return {fraction:1,normal:null};
    }
    // Exhaustion remains conservative: never cross a contact merely to finish.
    return {fraction,normal:lastNormal};
  }
  /** Conservatively swept movement with up to four contact-plane slides.
   * Initial overlap is blocked rather than silently teleporting out of solids.
   */
  movePlayer(from:Vec3,to:Vec3,radius:number,height:number):OriginalPlayerMoveResult {
    if(!validCapsule(radius,height)||![from.x,from.y,from.z,to.x,to.y,to.z].every(Number.isFinite))throw new Error('Invalid original player movement.');
    const requested=sub(to,from),normals:Vec3[]=[];
    if(this.playerIntersects(from,radius,height))return {position:{...from},fraction:0,collided:true,normals};
    let position={...from},remaining=requested;
    for(let iteration=0;iteration<4&&squared(remaining)>1e-14;iteration++){
      const sweep=this.sweepPlayer(position,remaining,radius,height);
      position=add(position,scaled(remaining,sweep.fraction));
      if(!sweep.normal)break;
      normals.push(sweep.normal);remaining=scaled(remaining,1-sweep.fraction);
      for(const n of normals){const into=dot(remaining,n);if(into<0)remaining=sub(remaining,scaled(n,into));}
    }
    const distanceSquared=squared(requested),fraction=distanceSquared?Math.max(0,Math.min(1,dot(sub(position,from),requested)/distanceSquared)):1;
    return {position,fraction,collided:normals.length>0,normals};
  }
  raycast(origin:Vec3,direction:Vec3,maxDistance=300,options:ArenaRaycastOptions={}):ArenaRayHit|null {
    const magnitude=Math.hypot(direction.x,direction.y,direction.z);
    if(!magnitude||![origin.x,origin.y,origin.z,magnitude,maxDistance].every(Number.isFinite)||maxDistance<0)return null;
    const d={x:direction.x/magnitude,y:direction.y/magnitude,z:direction.z/magnitude};
    const minimum=Number.isFinite(options.minDistance)?Math.max(0,options.minDistance!):0;
    let start=minimum,end=maxDistance;
    for(const axis of ['x','z'] as const){
      if(Math.abs(d[axis])<EPSILON){if(origin[axis]<this.bounds.min[axis]-EPSILON||origin[axis]>this.bounds.max[axis]+EPSILON)return null;continue;}
      const a=(this.bounds.min[axis]-origin[axis])/d[axis],b=(this.bounds.max[axis]-origin[axis])/d[axis];
      start=Math.max(start,Math.min(a,b));end=Math.min(end,Math.max(a,b));
    }
    if(start>end)return null;
    let x=Math.floor((origin.x+d.x*start)/this.cellSize),z=Math.floor((origin.z+d.z*start)/this.cellSize);
    const stepX=Math.sign(d.x),stepZ=Math.sign(d.z),deltaX=stepX?this.cellSize/Math.abs(d.x):Infinity,deltaZ=stepZ?this.cellSize/Math.abs(d.z):Infinity;
    let nextX=stepX?(((x+(stepX>0?1:0))*this.cellSize-origin.x)/d.x):Infinity;
    let nextZ=stepZ?(((z+(stepZ>0?1:0))*this.cellSize-origin.z)/d.z):Infinity;
    let best:ArenaRayHit|null=null,cellStart=start;
    const tested=new Set<number>();
    while(cellStart<=end+EPSILON){
      for(const index of this.grid.get(`${x},${z}`)??[]){
        if(tested.has(index))continue;tested.add(index);
        const t=this.triangles[index];if(options.includeGround===false&&t.ground)continue;
        if(options.excludeModel&&this.modelAncestors.get(t.model)!.some(options.excludeModel))continue;
        const distance=rayTriangle(origin,d,t);if(distance===null||distance<minimum-EPSILON||distance>end+EPSILON)continue;
        const sign=t.normal.x*d.x+t.normal.y*d.y+t.normal.z*d.z>0?-1:1;
        end=Math.min(end,Math.max(minimum,distance));
        best={id:t.model,surface:t.ground?'ground':'collider',distance:end,point:{x:origin.x+d.x*end,y:origin.y+d.y*end,z:origin.z+d.z*end},normal:{x:t.normal.x*sign,y:t.normal.y*sign,z:t.normal.z*sign}};
      }
      if(!Number.isFinite(nextX)&&!Number.isFinite(nextZ))break;
      if(nextX<=nextZ){cellStart=nextX;x+=stepX;nextX+=deltaX;}else{cellStart=nextZ;z+=stepZ;nextZ+=deltaZ;}
    }
    return best;
  }
}
export function createOriginalSceneGeometry(data:OriginalSceneData,options:OriginalSceneGeometryOptions):OriginalSceneGeometry {
  return new OriginalSceneGeometry(data,options);
}
