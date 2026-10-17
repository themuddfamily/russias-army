import type {Vec3} from './protocol';
import {cloneOriginalAngularBody,originalAngularCenter,originalRotateVector,type OriginalAngularContactBody,type OriginalAngularBody} from './originalAngularBody';

export interface OriginalIslandContact {
 bodyA:number;bodyB:number;normal:Vec3;
 pairs:readonly {witnessA:Vec3;witnessB:Vec3}[];
 restitution:number;friction:number;
}
export interface OriginalContactIslandResult {
 velocities:Vec3[];angularVelocities:(Vec3|null)[];
 contacts:Array<{normalImpulse:number;active:boolean}>;
 iterations:number;converged:boolean;tolerance:number;maxNormalResidual:number;maxImpulseUpdate:number;
}
const DEG=Math.PI/180;
const finite=(v:Vec3)=>!!v&&Number.isFinite(v.x)&&Number.isFinite(v.y)&&Number.isFinite(v.z);
const dot=(a:Vec3,b:Vec3)=>a.x*b.x+a.y*b.y+a.z*b.z;
const sub=(a:Vec3,b:Vec3):Vec3=>({x:a.x-b.x,y:a.y-b.y,z:a.z-b.z});
const length=(v:Vec3)=>Math.hypot(v.x,v.y,v.z);
function inverseWorld(state:OriginalAngularBody,v:Vec3):Vec3 {
 const q=state.orientation,local=originalRotateVector({x:-q.x,y:-q.y,z:-q.z,w:q.w},v),t=state.inverseInertia;
 return originalRotateVector(q,{x:t.xx*local.x+t.xy*local.y+t.xz*local.z,y:t.xy*local.x+t.yy*local.y+t.yz*local.z,z:t.xz*local.x+t.yz*local.y+t.zz*local.z});
}
/** Experimental reconstruction of simultaneous contact constraints. The normal
 * points B->A; pairs are actual surface witnesses supplied by geometry. Body
 * indices identify shared velocity/spin state across every contact. Accumulated
 * PGS impulses, initial restitution targets and vector Coulomb friction use the
 * same128-pass/velocity-scaled1e-13 limits as the existing pair manifold.
 * No positions, quaternions or input velocities mutate. No collision callbacks,
 * skin correction, damping, force or native Havok equivalence is implied. */
export function resolveOriginalContactIsland(bodies:readonly OriginalAngularContactBody[],contacts:readonly OriginalIslandContact[]):OriginalContactIslandResult {
 if(!Array.isArray(bodies)||!Array.isArray(contacts))throw Error('Invalid original contact island');
 const states=bodies.map(body=>{
  if(!body||!finite(body.position)||!finite(body.velocity)||!(body.mass===Infinity||Number.isFinite(body.mass)&&body.mass>0))throw Error('Invalid original contact island body');
  const angular=body.angular?cloneOriginalAngularBody(body.angular):undefined,velocity={...body.velocity},inverse=1/body.mass;
  const center=angular?originalAngularCenter(body.position,angular):body.position,response:Vec3={x:0,y:0,z:0};
  let x:Vec3|undefined,y:Vec3|undefined,z:Vec3|undefined;
  if(angular&&inverse>0){x=inverseWorld(angular,{x:1,y:0,z:0});y=inverseWorld(angular,{x:0,y:1,z:0});z=inverseWorld(angular,{x:0,y:0,z:1});}
  const worldResponse=(vx:number,vy:number,vz:number):Vec3=>{
   if(x&&y&&z){response.x=x.x*vx+y.x*vy+z.x*vz;response.y=x.y*vx+y.y*vy+z.y*vz;response.z=x.z*vx+y.z*vy+z.z*vz;}
   return response;
  };
  return {angular,velocity,inverse,center,worldResponse};
 });
 const relative:Vec3={x:0,y:0,z:0};
 const relativeAt=(ia:number,ib:number,rA:Vec3,rB:Vec3):Vec3=>{
  const a=states[ia],b=states[ib];let ax=a.velocity.x,ay=a.velocity.y,az=a.velocity.z,bx=b.velocity.x,by=b.velocity.y,bz=b.velocity.z;
  if(a.angular){const w=a.angular.angularVelocity,x=w.x*DEG,y=w.y*DEG,z=w.z*DEG;ax+=y*rA.z-z*rA.y;ay+=z*rA.x-x*rA.z;az+=x*rA.y-y*rA.x;}
  if(b.angular){const w=b.angular.angularVelocity,x=w.x*DEG,y=w.y*DEG,z=w.z*DEG;bx+=y*rB.z-z*rB.y;by+=z*rB.x-x*rB.z;bz+=x*rB.y-y*rB.x;}
  relative.x=ax-bx;relative.y=ay-by;relative.z=az-bz;return relative;
 };
 const constraints=contacts.flatMap((contact,contactIndex)=>{
  if(!contact||!Number.isSafeInteger(contact.bodyA)||!Number.isSafeInteger(contact.bodyB)||contact.bodyA<0||contact.bodyB<0||contact.bodyA>=states.length||contact.bodyB>=states.length||contact.bodyA===contact.bodyB||!finite(contact.normal)||length(contact.normal)===0||!Array.isArray(contact.pairs)||contact.pairs.length===0||contact.pairs.some((pair:OriginalIslandContact['pairs'][number])=>!pair||!finite(pair.witnessA)||!finite(pair.witnessB))||![contact.restitution,contact.friction].every(v=>Number.isFinite(v)&&v>=0))throw Error('Invalid original island contact');
  const scale=1/length(contact.normal),n={x:contact.normal.x*scale,y:contact.normal.y*scale,z:contact.normal.z*scale},a=states[contact.bodyA],b=states[contact.bodyB];
  return contact.pairs.map((pair:OriginalIslandContact['pairs'][number])=>{
   const rA=sub(pair.witnessA,a.center),rB=sub(pair.witnessB,b.center),closing=dot(relativeAt(contact.bodyA,contact.bodyB,rA,rB),n);
   const denominator=(axis:Vec3)=>{
    const A=a.worldResponse(rA.y*axis.z-rA.z*axis.y,rA.z*axis.x-rA.x*axis.z,rA.x*axis.y-rA.y*axis.x),B=b.worldResponse(rB.y*axis.z-rB.z*axis.y,rB.z*axis.x-rB.x*axis.z,rB.x*axis.y-rB.y*axis.x);
    return a.inverse+b.inverse+(axis.x*((A.y*rA.z-A.z*rA.y)+(B.y*rB.z-B.z*rB.y))+axis.y*((A.z*rA.x-A.x*rA.z)+(B.z*rB.x-B.x*rB.z))+axis.z*((A.x*rA.y-A.y*rA.x)+(B.x*rB.y-B.y*rB.x)));
   };
   return {contactIndex,ia:contact.bodyA,ib:contact.bodyB,n,rA,rB,denominator,normalDenominator:denominator(n),target:closing<0?-contact.restitution*closing:0,friction:contact.friction,normalImpulse:0,tangentImpulse:{x:0,y:0,z:0}};
  });
 });
 const tolerance=1e-13*Math.max(1,...constraints.map(c=>Math.abs(c.target)),...bodies.map(b=>length(b.velocity)));
 const apply=(ia:number,ib:number,ix:number,iy:number,iz:number,rA:Vec3,rB:Vec3)=>{
  const a=states[ia],b=states[ib];
  a.velocity.x=a.velocity.x+ix*a.inverse;a.velocity.y=a.velocity.y+iy*a.inverse;a.velocity.z=a.velocity.z+iz*a.inverse;
  b.velocity.x=b.velocity.x-ix*b.inverse;b.velocity.y=b.velocity.y-iy*b.inverse;b.velocity.z=b.velocity.z-iz*b.inverse;
  if(a.angular&&a.inverse>0){const response=a.worldResponse(rA.y*iz-rA.z*iy,rA.z*ix-rA.x*iz,rA.x*iy-rA.y*ix),w=a.angular.angularVelocity;a.angular.angularVelocity={x:w.x+response.x*(1/DEG),y:w.y+response.y*(1/DEG),z:w.z+response.z*(1/DEG)};}
  if(b.angular&&b.inverse>0){const response=b.worldResponse(rB.y*iz-rB.z*iy,rB.z*ix-rB.x*iz,rB.x*iy-rB.y*ix),w=b.angular.angularVelocity;b.angular.angularVelocity={x:w.x-response.x*(1/DEG),y:w.y-response.y*(1/DEG),z:w.z-response.z*(1/DEG)};}
 };
 const residual=()=>constraints.reduce((maximum,c)=>{const speed=dot(relativeAt(c.ia,c.ib,c.rA,c.rB),c.n)-c.target;return Math.max(maximum,c.normalImpulse>0?Math.abs(speed):Math.max(0,-speed));},0);
 const axis:Vec3={x:0,y:0,z:0};let iterations=0,converged=constraints.length===0,maxImpulseUpdate=0;
 for(let iteration=0;iteration<128&&constraints.length>0;iteration++){
  iterations=iteration+1;maxImpulseUpdate=0;
  for(const c of constraints){
   const {rA,rB,n}=c;
   if(c.normalDenominator>0){
    const next=Math.max(0,c.normalImpulse+(c.target-dot(relativeAt(c.ia,c.ib,rA,rB),n))/c.normalDenominator);
    maxImpulseUpdate=Math.max(maxImpulseUpdate,Math.abs(next-c.normalImpulse)*c.normalDenominator);
    if(next!==c.normalImpulse){const change=next-c.normalImpulse;apply(c.ia,c.ib,n.x*change,n.y*change,n.z*change,rA,rB);}c.normalImpulse=next;
   }
   if(c.friction>0){
    const current=relativeAt(c.ia,c.ib,rA,rB),normalSpeed=dot(current,n),tx=current.x-n.x*normalSpeed,ty=current.y-n.y*normalSpeed,tz=current.z-n.z*normalSpeed,speed=Math.hypot(tx,ty,tz);
    let nx=c.tangentImpulse.x,ny=c.tangentImpulse.y,nz=c.tangentImpulse.z;
    if(speed>0){const inverse=1/speed;axis.x=tx*inverse;axis.y=ty*inverse;axis.z=tz*inverse;const denominator=c.denominator(axis);if(denominator>0){const factor=speed/denominator;nx=nx-axis.x*factor;ny=ny-axis.y*factor;nz=nz-axis.z*factor;}}
    const projection=nx*n.x+ny*n.y+nz*n.z;nx=nx-n.x*projection;ny=ny-n.y*projection;nz=nz-n.z*projection;
    const maximum=c.friction*c.normalImpulse,magnitude=Math.hypot(nx,ny,nz);if(magnitude>maximum){const factor=maximum/magnitude;nx=nx*factor;ny=ny*factor;nz=nz*factor;}
    const cx=nx-c.tangentImpulse.x,cy=ny-c.tangentImpulse.y,cz=nz-c.tangentImpulse.z,change=Math.hypot(cx,cy,cz);
    if(change>0){const inverse=1/change;axis.x=cx*inverse;axis.y=cy*inverse;axis.z=cz*inverse;maxImpulseUpdate=Math.max(maxImpulseUpdate,change*c.denominator(axis));apply(c.ia,c.ib,cx,cy,cz,rA,rB);}
    c.tangentImpulse.x=nx;c.tangentImpulse.y=ny;c.tangentImpulse.z=nz;
   }
  }
  if(maxImpulseUpdate<=tolerance&&residual()<=tolerance){converged=true;break;}
 }
 const outputContacts=contacts.map(()=>({normalImpulse:0,active:false}));
 for(const c of constraints){const out=outputContacts[c.contactIndex];out.normalImpulse+=c.normalImpulse;out.active=out.normalImpulse>0;}
 return {velocities:states.map(s=>({...s.velocity})),angularVelocities:states.map(s=>s.angular?{...s.angular.angularVelocity}:null),contacts:outputContacts,iterations,converged,tolerance,maxNormalResidual:residual(),maxImpulseUpdate};
}
