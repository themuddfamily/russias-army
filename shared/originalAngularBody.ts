import type {Vec3} from './protocol';
import {originalConvexIsImmutable,type OriginalConvexPolytope} from './originalConvexSweep';

/** Explicit reconstruction: homogeneous CLOSED convex volume, not a recovered
 * Havok import default. Public world angular velocity uses Xtra degrees/sec. */
export interface OriginalQuaternion {x:number;y:number;z:number;w:number}
export interface OriginalSymmetricTensor {xx:number;yy:number;zz:number;xy:number;xz:number;yz:number}
export interface OriginalAngularBody {
 orientation:OriginalQuaternion;
 angularVelocity:Vec3;
 /** Offset from retained model pivot in the initial world-oriented hull frame. */
 readonly centerOfMass:Readonly<Vec3>;
 /** Reference-frame inverse inertia about COM, in reconstruction mass/length units. */
 readonly inverseInertia:Readonly<OriginalSymmetricTensor>;
 readonly referenceConvex:OriginalConvexPolytope;
}
export interface OriginalAngularContactBody {position:Vec3;velocity:Vec3;mass:number;angular?:OriginalAngularBody}
const DEG=Math.PI/180;
const finite=(v:Vec3)=>Number.isFinite(v.x)&&Number.isFinite(v.y)&&Number.isFinite(v.z);
const add=(a:Vec3,b:Vec3):Vec3=>({x:a.x+b.x,y:a.y+b.y,z:a.z+b.z});
const sub=(a:Vec3,b:Vec3):Vec3=>({x:a.x-b.x,y:a.y-b.y,z:a.z-b.z});
const mul=(v:Vec3,s:number):Vec3=>({x:v.x*s,y:v.y*s,z:v.z*s});
const dot=(a:Vec3,b:Vec3)=>a.x*b.x+a.y*b.y+a.z*b.z;
const cross=(a:Vec3,b:Vec3):Vec3=>({x:a.y*b.z-a.z*b.y,y:a.z*b.x-a.x*b.z,z:a.x*b.y-a.y*b.x});
const magnitude=(v:Vec3)=>Math.hypot(v.x,v.y,v.z);
export function validOriginalQuaternion(q:OriginalQuaternion):boolean {
 return !!q&&[q.x,q.y,q.z,q.w].every(Number.isFinite)&&Math.abs(Math.hypot(q.x,q.y,q.z,q.w)-1)<=1e-6;
}
function requireOrientation(q:OriginalQuaternion):void {if(!validOriginalQuaternion(q))throw Error('Invalid original angular orientation');}
export function originalRotateVector(q:OriginalQuaternion,v:Vec3):Vec3 {
 requireOrientation(q);if(!finite(v))throw Error('Invalid original angular vector');
 return rotateValidated(q,v);
}
/** Internal arithmetic after public orientation/vector validation. */
function rotateValidated(q:OriginalQuaternion,v:Vec3):Vec3 {
 const x=q.x,y=q.y,z=q.z,tx=(y*v.z-z*v.y)*2,ty=(z*v.x-x*v.z)*2,tz=(x*v.y-y*v.x)*2,w=q.w;
 return {x:v.x+(tx*w+(y*tz-z*ty)),y:v.y+(ty*w+(z*tx-x*tz)),z:v.z+(tz*w+(x*ty-y*tx))};
}
function conjugate(q:OriginalQuaternion):OriginalQuaternion {return {x:-q.x,y:-q.y,z:-q.z,w:q.w};}
function quaternionProduct(a:OriginalQuaternion,b:OriginalQuaternion):OriginalQuaternion {
 return {x:a.w*b.x+a.x*b.w+a.y*b.z-a.z*b.y,y:a.w*b.y-a.x*b.z+a.y*b.w+a.z*b.x,
  z:a.w*b.z+a.x*b.y-a.y*b.x+a.z*b.w,w:a.w*b.w-a.x*b.x-a.y*b.y-a.z*b.z};
}
function rotatedOrientation(q:OriginalQuaternion,omegaRadians:Vec3,seconds:number):OriginalQuaternion {
 const speed=magnitude(omegaRadians),angle=speed*seconds;
 if(!Number.isFinite(angle))throw Error('Invalid original angular step angle');
 if(speed===0||seconds===0)return {...q};
 const factor=Math.sin(angle/2)/speed,dq={...mul(omegaRadians,factor),w:Math.cos(angle/2)},next=quaternionProduct(dq,q);
 const length=Math.hypot(next.x,next.y,next.z,next.w);
 return {x:next.x/length,y:next.y/length,z:next.z/length,w:next.w/length};
}
function tensorVector(t:Readonly<OriginalSymmetricTensor>,v:Vec3):Vec3 {
 return {x:t.xx*v.x+t.xy*v.y+t.xz*v.z,y:t.xy*v.x+t.yy*v.y+t.yz*v.z,z:t.xz*v.x+t.yz*v.y+t.zz*v.z};
}
function inverseTensor(t:OriginalSymmetricTensor):OriginalSymmetricTensor {
 const {xx:a,yy:d,zz:f,xy:b,xz:c,yz:e}=t;
 const determinant=a*(d*f-e*e)-b*(b*f-c*e)+c*(b*e-c*d);
 if(!Object.values(t).every(Number.isFinite)||a<=0||a*d-b*b<=0||!Number.isFinite(determinant)||determinant<=0)throw Error('Invalid original angular inertia');
 return {xx:(d*f-e*e)/determinant,yy:(a*f-c*c)/determinant,zz:(a*d-b*b)/determinant,
  xy:(c*e-b*f)/determinant,xz:(b*e-c*d)/determinant,yz:(b*c-a*e)/determinant};
}
function retainedShape(shape:OriginalConvexPolytope):OriginalConvexPolytope {
 const descriptor=Object.getOwnPropertyDescriptor(shape,'faces'),faces=shape.faces;
 const frozenFaces=!!descriptor&&'value' in descriptor&&faces&&Object.isFrozen(faces)&&faces.every((face,index)=>{
  const entry=Object.getOwnPropertyDescriptor(faces,index);
  return !!entry&&'value' in entry&&Object.isFrozen(face)&&face.every((_,corner)=>{
   const coordinate=Object.getOwnPropertyDescriptor(face,corner);return !!coordinate&&'value' in coordinate;
  });
 });
 if(originalConvexIsImmutable(shape)&&frozenFaces)return shape;
 const vectors=(values:readonly Vec3[])=>Object.freeze(values.map(v=>Object.freeze({...v})));
 return Object.freeze({vertices:vectors(shape.vertices),faceNormals:vectors(shape.faceNormals),edgeDirections:vectors(shape.edgeDirections),
  faces:Object.freeze(shape.faces!.map(face=>Object.freeze([...face] as [number,number,number])))});
}
export function createOriginalAngularBody(convex:OriginalConvexPolytope,mass:number):OriginalAngularBody {
 if(!Number.isFinite(mass)||mass<=0||convex.vertices.length<4||!convex.faces||convex.faces.length<4||
  ![...convex.vertices,...convex.faceNormals,...convex.edgeDirections].every(finite))throw Error('Invalid original angular closed hull');
 // Shift the tetrahedral integration origin near the hull. This avoids losing
 // covariance precision when the imported model pivot is far from its COM.
 const origin=mul(convex.vertices.reduce(add,{x:0,y:0,z:0}),1/convex.vertices.length);
 const edges=new Map<string,{count:number;orientation:number}>();
 let volume=0,first={x:0,y:0,z:0};
 const second:OriginalSymmetricTensor={xx:0,yy:0,zz:0,xy:0,xz:0,yz:0};
 const extent=Math.max(...convex.vertices.map(v=>magnitude(sub(v,origin))));
 for(const face of convex.faces){
  if(face.length!==3||face.some(i=>!Number.isSafeInteger(i)||i<0||i>=convex.vertices.length))throw Error('Invalid original angular hull face');
  const [a,b,c]=face.map(i=>sub(convex.vertices[i],origin)),normal=cross(sub(b,a),sub(c,a)),normalLength=magnitude(normal);
  if(normalLength===0||!Number.isFinite(normalLength))throw Error('Degenerate original angular hull face');
  // A convex outward closed surface is needed for the signed volume integral.
  if(convex.vertices.some(v=>dot(sub(sub(v,origin),a),normal)>1e-9*extent*normalLength))throw Error('Nonconvex or inward original angular hull');
  for(let i=0;i<3;i++){
   const x=face[i],y=face[(i+1)%3],key=`${Math.min(x,y)}:${Math.max(x,y)}`,old=edges.get(key)??{count:0,orientation:0};
   old.count++;old.orientation+=x<y?1:-1;edges.set(key,old);
  }
  const v=dot(a,cross(b,c))/6,s=add(add(a,b),c);volume+=v;first=add(first,mul(s,v/4));
  const moment=(i:'x'|'y'|'z',j:'x'|'y'|'z')=>v*(s[i]*s[j]+a[i]*a[j]+b[i]*b[j]+c[i]*c[j])/20;
  second.xx+=moment('x','x');second.yy+=moment('y','y');second.zz+=moment('z','z');
  second.xy+=moment('x','y');second.xz+=moment('x','z');second.yz+=moment('y','z');
 }
 if([...edges.values()].some(edge=>edge.count!==2||edge.orientation!==0)||!Number.isFinite(volume)||volume<=0)throw Error('Open or zero-volume original angular hull');
 const center=mul(first,1/volume),density=mass/volume;
 const covariance:OriginalSymmetricTensor={xx:second.xx*density-mass*center.x*center.x,yy:second.yy*density-mass*center.y*center.y,
  zz:second.zz*density-mass*center.z*center.z,xy:second.xy*density-mass*center.x*center.y,
  xz:second.xz*density-mass*center.x*center.z,yz:second.yz*density-mass*center.y*center.z};
 const inertia={xx:covariance.yy+covariance.zz,yy:covariance.xx+covariance.zz,zz:covariance.xx+covariance.yy,
  xy:-covariance.xy,xz:-covariance.xz,yz:-covariance.yz};
 const inverse=inverseTensor(inertia);
 if(!Object.values(inverse).every(Number.isFinite))throw Error('Invalid original angular inverse inertia');
 return {orientation:{x:0,y:0,z:0,w:1},angularVelocity:{x:0,y:0,z:0},
  centerOfMass:Object.freeze(add(origin,center)),inverseInertia:Object.freeze(inverse),referenceConvex:retainedShape(convex)};
}
export function cloneOriginalAngularBody(state:OriginalAngularBody):OriginalAngularBody {
 requireOrientation(state.orientation);if(!finite(state.angularVelocity))throw Error('Invalid original angular velocity');
 return {...state,orientation:{...state.orientation},angularVelocity:{...state.angularVelocity}};
}
const hullCache=new WeakMap<OriginalConvexPolytope,{q:OriginalQuaternion;shape:OriginalConvexPolytope}>();
export function originalAngularConvex(state:OriginalAngularBody):OriginalConvexPolytope {
 const q=state.orientation;requireOrientation(q);
 if(q.x===0&&q.y===0&&q.z===0&&(q.w===1||q.w===-1))return state.referenceConvex;
 const cached=hullCache.get(state.referenceConvex);
 if(cached&&(['x','y','z','w'] as const).every(axis=>Object.is(cached.q[axis],q[axis])))return cached.shape;
 const rotate=(values:readonly Vec3[])=>Object.freeze(values.map(v=>{
  if(!finite(v))throw Error('Invalid original angular vector');
  return Object.freeze(rotateValidated(q,v));
 }));
 const shape=Object.freeze({vertices:rotate(state.referenceConvex.vertices),faceNormals:rotate(state.referenceConvex.faceNormals),
  edgeDirections:rotate(state.referenceConvex.edgeDirections),faces:state.referenceConvex.faces});
 hullCache.set(state.referenceConvex,{q:{...q},shape});return shape;
}
export function originalAngularCenter(position:Vec3,state:OriginalAngularBody):Vec3 {
 if(!finite(position))throw Error('Invalid original angular pivot');return add(position,originalRotateVector(state.orientation,state.centerOfMass));
}
export function advanceOriginalAngularBody(position:Vec3,COMvelocity:Vec3,state:OriginalAngularBody,seconds:number):Vec3 {
 if(!finite(position)||!finite(COMvelocity)||!finite(state.angularVelocity)||!Number.isFinite(seconds)||seconds<0)throw Error('Invalid original angular step');
 requireOrientation(state.orientation);
 if(seconds===0)return {...position};
 // Preserve the existing translation arithmetic exactly when there is no spin.
 if(state.angularVelocity.x===0&&state.angularVelocity.y===0&&state.angularVelocity.z===0)return add(position,mul(COMvelocity,seconds));
 const center=originalAngularCenter(position,state);
 if(seconds>0){
  const before=state.orientation,omega=mul(state.angularVelocity,DEG),inertia=inverseTensor({...state.inverseInertia});
  const momentum=originalRotateVector(before,tensorVector(inertia,originalRotateVector(conjugate(before),omega)));
  const atOrientation=(q:OriginalQuaternion)=>originalRotateVector(q,tensorVector(state.inverseInertia,originalRotateVector(conjugate(q),momentum)));
  // Explicit reconstruction midpoint orientation, preserving world angular
  // momentum exactly at the endpoint. Energy converges as the caller refines
  // the step; this is not a claim to reproduce Havok's native integrator.
  let middleOmega=omega;
  for(let iteration=0;iteration<12;iteration++){
   const next=atOrientation(rotatedOrientation(before,middleOmega,seconds/2));
   const change=magnitude(sub(next,middleOmega));middleOmega=next;if(change<=1e-13*Math.max(1,magnitude(next)))break;
  }
  state.orientation=rotatedOrientation(before,middleOmega,seconds);
  state.angularVelocity=mul(atOrientation(state.orientation),1/DEG);
 }
 return sub(add(center,mul(COMvelocity,seconds)),originalRotateVector(state.orientation,state.centerOfMass));
}
export function originalAngularPointVelocity(position:Vec3,COMvelocity:Vec3,state:OriginalAngularBody,point:Vec3):Vec3 {
 if(!finite(COMvelocity)||!finite(point)||!finite(state.angularVelocity))throw Error('Invalid original angular point velocity');
 return add(COMvelocity,cross(mul(state.angularVelocity,DEG),sub(point,originalAngularCenter(position,state))));
}
function inverseWorld(state:OriginalAngularBody,v:Vec3):Vec3 {
 return originalRotateVector(state.orientation,tensorVector(state.inverseInertia,originalRotateVector(conjugate(state.orientation),v)));
}
/** Normal points B->A. Impulses use independent actual surface witnesses, not
 * model pivots or an invented midpoint. Only dynamic angular velocities mutate. */
export function resolveOriginalAngularContact(a:OriginalAngularContactBody,b:OriginalAngularContactBody,normal:Vec3,witnessA:Vec3,witnessB:Vec3,restitution:number,friction:number):{velocityA:Vec3;velocityB:Vec3} {
 for(const body of [a,b]){
  if(!finite(body.position)||!finite(body.velocity)||!(body.mass===Infinity||Number.isFinite(body.mass)&&body.mass>0))throw Error('Invalid original angular contact body');
  if(body.angular){requireOrientation(body.angular.orientation);if(!finite(body.angular.angularVelocity))throw Error('Invalid original angular contact velocity');}
 }
 if(![normal,witnessA,witnessB].every(finite)||magnitude(normal)===0||![restitution,friction].every(value=>Number.isFinite(value)&&value>=0))throw Error('Invalid original angular contact');
 const n=mul(normal,1/magnitude(normal)),inverseA=1/a.mass,inverseB=1/b.mass;
 let velocityA={...a.velocity},velocityB={...b.velocity};
 const rA=sub(witnessA,a.angular?originalAngularCenter(a.position,a.angular):a.position),rB=sub(witnessB,b.angular?originalAngularCenter(b.position,b.angular):b.position);
 const angularA=(v:Vec3)=>a.angular&&inverseA>0?inverseWorld(a.angular,v):{x:0,y:0,z:0};
 const angularB=(v:Vec3)=>b.angular&&inverseB>0?inverseWorld(b.angular,v):{x:0,y:0,z:0};
 const pointVelocity=(body:OriginalAngularContactBody,velocity:Vec3,r:Vec3)=>body.angular?add(velocity,cross(mul(body.angular.angularVelocity,DEG),r)):velocity;
 const relative=()=>sub(pointVelocity(a,velocityA,rA),pointVelocity(b,velocityB,rB));
 const denominator=(axis:Vec3)=>inverseA+inverseB+dot(axis,add(cross(angularA(cross(rA,axis)),rA),cross(angularB(cross(rB,axis)),rB)));
 const apply=(impulse:Vec3)=>{
  velocityA=add(velocityA,mul(impulse,inverseA));velocityB=sub(velocityB,mul(impulse,inverseB));
  if(a.angular&&inverseA>0)a.angular.angularVelocity=add(a.angular.angularVelocity,mul(angularA(cross(rA,impulse)),1/DEG));
  if(b.angular&&inverseB>0)b.angular.angularVelocity=sub(b.angular.angularVelocity,mul(angularB(cross(rB,impulse)),1/DEG));
 };
 const closing=dot(relative(),n),normalDenominator=denominator(n);
 if(closing>=0||normalDenominator<=0)return {velocityA,velocityB};
 const impulse=-(1+restitution)*closing/normalDenominator;apply(mul(n,impulse));
 if(friction>0){
  const after=relative(),tangent=sub(after,mul(n,dot(after,n))),speed=magnitude(tangent);
  if(speed>0){const axis=mul(tangent,1/speed),tangentDenominator=denominator(axis);
   if(tangentDenominator>0)apply(mul(axis,-Math.min(speed/tangentDenominator,friction*impulse)));
  }
 }
 return {velocityA,velocityB};
}

/** Explicit reconstruction manifold: accumulated unilateral normal constraints
 * and per-point Coulomb friction, solved with at most 128 PGS iterations. Targets
 * use only initial closing velocity, so restitution is not reapplied each pass.
 * Points must be actual finite surface witnesses, deduplicated by the caller.
 * No positional bias, damping, or native Havok solver equivalence is implied. */
export function resolveOriginalAngularManifold(a:OriginalAngularContactBody,b:OriginalAngularContactBody,normal:Vec3,
 pairs:readonly {witnessA:Vec3;witnessB:Vec3}[],restitution:number,friction:number):{velocityA:Vec3;velocityB:Vec3} {
 for(const body of [a,b]){
  if(!finite(body.position)||!finite(body.velocity)||!(body.mass===Infinity||Number.isFinite(body.mass)&&body.mass>0))throw Error('Invalid original angular manifold body');
  if(body.angular){requireOrientation(body.angular.orientation);if(!finite(body.angular.angularVelocity))throw Error('Invalid original angular manifold velocity');}
 }
 if(!finite(normal)||magnitude(normal)===0||!Array.isArray(pairs)||pairs.length===0||
  pairs.some(pair=>!pair||!finite(pair.witnessA)||!finite(pair.witnessB))||
  ![restitution,friction].every(value=>Number.isFinite(value)&&value>=0))throw Error('Invalid original angular manifold');
 const n=mul(normal,1/magnitude(normal)),inverseA=1/a.mass,inverseB=1/b.mass;
 let velocityA={...a.velocity},velocityB={...b.velocity};
 const worldResponse=(body:OriginalAngularContactBody)=>{
  const result:Vec3={x:0,y:0,z:0};
  if(!body.angular||body.mass===Infinity)return (_vx:number,_vy:number,_vz:number):Vec3=>result;
  const x=inverseWorld(body.angular,{x:1,y:0,z:0}),y=inverseWorld(body.angular,{x:0,y:1,z:0}),z=inverseWorld(body.angular,{x:0,y:0,z:1});
  return (vx:number,vy:number,vz:number):Vec3=>{
   result.x=x.x*vx+y.x*vy+z.x*vz;result.y=x.y*vx+y.y*vy+z.y*vz;result.z=x.z*vx+y.z*vy+z.z*vz;return result;
  };
 };
 const angularA=worldResponse(a),angularB=worldResponse(b);
 const centerA=a.angular?originalAngularCenter(a.position,a.angular):a.position,centerB=b.angular?originalAngularCenter(b.position,b.angular):b.position;
 const relative:Vec3={x:0,y:0,z:0};
 const relativeAt=(rA:Vec3,rB:Vec3):Vec3=>{
  let ax=velocityA.x,ay=velocityA.y,az=velocityA.z,bx=velocityB.x,by=velocityB.y,bz=velocityB.z;
  if(a.angular){const omega=a.angular.angularVelocity,x=omega.x*DEG,y=omega.y*DEG,z=omega.z*DEG;
   ax+=y*rA.z-z*rA.y;ay+=z*rA.x-x*rA.z;az+=x*rA.y-y*rA.x;}
  if(b.angular){const omega=b.angular.angularVelocity,x=omega.x*DEG,y=omega.y*DEG,z=omega.z*DEG;
   bx+=y*rB.z-z*rB.y;by+=z*rB.x-x*rB.z;bz+=x*rB.y-y*rB.x;}
  relative.x=ax-bx;relative.y=ay-by;relative.z=az-bz;return relative;
 };
 const constraints=pairs.map(pair=>{
  const rA=sub(pair.witnessA,centerA),rB=sub(pair.witnessB,centerB);
  const closing=dot(relativeAt(rA,rB),n);
  const denominator=(axis:Vec3)=>{
   const A=angularA(rA.y*axis.z-rA.z*axis.y,rA.z*axis.x-rA.x*axis.z,rA.x*axis.y-rA.y*axis.x);
   const B=angularB(rB.y*axis.z-rB.z*axis.y,rB.z*axis.x-rB.x*axis.z,rB.x*axis.y-rB.y*axis.x);
   return inverseA+inverseB+(axis.x*((A.y*rA.z-A.z*rA.y)+(B.y*rB.z-B.z*rB.y))+
    axis.y*((A.z*rA.x-A.x*rA.z)+(B.z*rB.x-B.x*rB.z))+axis.z*((A.x*rA.y-A.y*rA.x)+(B.x*rB.y-B.y*rB.x)));
  };
  return {rA,rB,denominator,normalDenominator:denominator(n),target:closing<0?-restitution*closing:0,
   normalImpulse:0,tangentImpulse:{x:0,y:0,z:0}};
 });
 // A broad face must converge before tiny residual spin changes its next
 // contact feature. The cap bounds work; the tolerance measures velocity-sized
 // projected impulse updates and normal complementarity, not angular damping.
 const tolerance=1e-13*Math.max(1,...constraints.map(c=>Math.abs(c.target)),magnitude(a.velocity),magnitude(b.velocity));
 // Construct this response once per manifold, not once per point/iteration.
 // Besides allocations, named closures incur repeated transpiler name setup.
 const apply=(ix:number,iy:number,iz:number,rA:Vec3,rB:Vec3)=>{
  velocityA.x=velocityA.x+ix*inverseA;velocityA.y=velocityA.y+iy*inverseA;velocityA.z=velocityA.z+iz*inverseA;
  velocityB.x=velocityB.x-ix*inverseB;velocityB.y=velocityB.y-iy*inverseB;velocityB.z=velocityB.z-iz*inverseB;
  if(a.angular&&inverseA>0){
   const response=angularA(rA.y*iz-rA.z*iy,rA.z*ix-rA.x*iz,rA.x*iy-rA.y*ix),omega=a.angular.angularVelocity;
   a.angular.angularVelocity={x:omega.x+response.x*(1/DEG),y:omega.y+response.y*(1/DEG),z:omega.z+response.z*(1/DEG)};
  }
  if(b.angular&&inverseB>0){
   const response=angularB(rB.y*iz-rB.z*iy,rB.z*ix-rB.x*iz,rB.x*iy-rB.y*ix),omega=b.angular.angularVelocity;
   b.angular.angularVelocity={x:omega.x-response.x*(1/DEG),y:omega.y-response.y*(1/DEG),z:omega.z-response.z*(1/DEG)};
  }
 };
 // Scratch values never escape this invocation. Keep the original expression
 // grouping and hypot evaluations while avoiding per-point temporary vectors.
 const axis:Vec3={x:0,y:0,z:0};
 for(let iteration=0;iteration<128;iteration++){
 let maximumUpdate=0;
 for(const constraint of constraints){
  const {rA,rB}=constraint;
  if(constraint.normalDenominator>0){
   const next=Math.max(0,constraint.normalImpulse+(constraint.target-dot(relativeAt(rA,rB),n))/constraint.normalDenominator);
   maximumUpdate=Math.max(maximumUpdate,Math.abs(next-constraint.normalImpulse)*constraint.normalDenominator);
   if(next!==constraint.normalImpulse){const change=next-constraint.normalImpulse;apply(n.x*change,n.y*change,n.z*change,rA,rB);}constraint.normalImpulse=next;
  }
  if(friction>0){
   const current=relativeAt(rA,rB),normalSpeed=dot(current,n),tx=current.x-n.x*normalSpeed,ty=current.y-n.y*normalSpeed,tz=current.z-n.z*normalSpeed,speed=Math.hypot(tx,ty,tz);
   let nx=constraint.tangentImpulse.x,ny=constraint.tangentImpulse.y,nz=constraint.tangentImpulse.z;
   if(speed>0){const inverseSpeed=1/speed;axis.x=tx*inverseSpeed;axis.y=ty*inverseSpeed;axis.z=tz*inverseSpeed;const denominator=constraint.denominator(axis);
    if(denominator>0){const factor=speed/denominator;nx=nx-axis.x*factor;ny=ny-axis.y*factor;nz=nz-axis.z*factor;}
   }
   // Keep a true vector accumulator; changing slip direction must not restart
   // friction as another independent full Coulomb impulse.
   const projection=nx*n.x+ny*n.y+nz*n.z;nx=nx-n.x*projection;ny=ny-n.y*projection;nz=nz-n.z*projection;
   const maximum=friction*constraint.normalImpulse,length=Math.hypot(nx,ny,nz);
   if(length>maximum){const factor=maximum/length;nx=nx*factor;ny=ny*factor;nz=nz*factor;}
   const cx=nx-constraint.tangentImpulse.x,cy=ny-constraint.tangentImpulse.y,cz=nz-constraint.tangentImpulse.z,lengthChange=Math.hypot(cx,cy,cz);
   if(lengthChange>0){const inverseLength=1/lengthChange;axis.x=cx*inverseLength;axis.y=cy*inverseLength;axis.z=cz*inverseLength;maximumUpdate=Math.max(maximumUpdate,lengthChange*constraint.denominator(axis));}
   if(lengthChange>0)apply(cx,cy,cz,rA,rB);constraint.tangentImpulse.x=nx;constraint.tangentImpulse.y=ny;constraint.tangentImpulse.z=nz;
  }
 }
 if(maximumUpdate<=tolerance){
  const residual=constraints.reduce((maximum,c)=>{
   const speed=dot(relativeAt(c.rA,c.rB),n)-c.target;
   return Math.max(maximum,c.normalImpulse>0?Math.abs(speed):Math.max(0,-speed));
  },0);
  if(residual<=tolerance)break;
 }
 }
 return {velocityA,velocityB};
}
