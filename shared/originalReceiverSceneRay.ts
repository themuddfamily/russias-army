import type {Vec3} from './protocol';
import type {ReceiverScenePrefix} from './originalReceiverPrefix';

export const ORIGINAL_RECEIVER_SCENE_LAYERS = [
  'fixed', 'door', 'barrel', 'sky', 'live-gi', 'pending-death-gi',
  'corpse', 'projectile', 'held-gun', 'dropped-gun', 'local-weapon', 'transient',
] as const;
export type OriginalReceiverSceneLayer = typeof ORIGINAL_RECEIVER_SCENE_LAYERS[number];
export interface OriginalReceiverRayModel {
  readonly handle:string;
  readonly layer:OriginalReceiverSceneLayer;
  readonly inWorld:boolean;
  /** Source group names at this receipt prefix, independent from visibility.
   * Native group "smokes" and canonical adapter token "gsmokes" both
   * identify the source gsmokes variable's bullet-excluded group. */
  readonly groupAncestry:readonly string[];
  readonly geometryProvenance:string;
  /** Already skinned local vertices for this model's exact query phase. */
  readonly positions:readonly (readonly number[])[];
  readonly faces:readonly (readonly number[])[];
  /** Column-major affine local-to-world matrix. */
  readonly worldMatrix:readonly number[];
  /** Explicit world-winding adapter, not a claim about Director face policy. */
  readonly sidedness:'front'|'back'|'double';
}
export interface OriginalReceiverRayCoverage {
  readonly prefix?:ReceiverScenePrefix;
  readonly sceneGeneration:number;
  readonly callback:number;
  /** Complete ledger inventory, including handles currently outside the world. */
  readonly expectedHandles:readonly string[];
  /** Every layer must be accounted for, including proved-empty layers. */
  readonly accountedLayers:readonly OriginalReceiverSceneLayer[];
  readonly unresolved:readonly string[];
}
export interface OriginalReceiverSceneRayHit {
  readonly handle:string;
  readonly layer:OriginalReceiverSceneLayer;
  readonly geometryProvenance:string;
  readonly faceIndex:number;
  readonly distance:number;
  readonly point:Readonly<Vec3>;
  readonly normal:Readonly<Vec3>;
}
export interface OriginalReceiverSceneRay {
  readonly sceneGeneration:number;
  readonly callback:number;
  readonly modelCount:number;
  readonly triangleCount:number;
  nearestDetailedDownward(origin:Readonly<Vec3>, options?:{readonly excludeHandle?:string}):OriginalReceiverSceneRayHit|null;
  nearestDetailed(origin:Readonly<Vec3>,direction:Readonly<Vec3>,options?:{
    readonly excludeHandle?:string; readonly bullet?:boolean; readonly maxDistance?:number;
  }):OriginalReceiverSceneRayHit|null;
}
interface Triangle {
  model:OriginalReceiverRayModel;faceIndex:number;bulletExcluded:boolean;
  ax:number;ay:number;az:number; bx:number;by:number;bz:number; cx:number;cy:number;cz:number;
  nx:number;ny:number;nz:number;
}
const finite=(v:Readonly<Vec3>)=>[v.x,v.y,v.z].every(Number.isFinite);

/** An immutable, bounded, all-admitted-mesh query snapshot. The caller must
 * establish full inventory/receipt chronology; this helper cannot infer missing
 * models. Incomplete coverage throws instead of returning a world-only answer.
 * Equal-distance ties use admission/face order, explicitly an adapter.
 */
export function createOriginalReceiverSceneRay(
  models:readonly OriginalReceiverRayModel[],coverage:OriginalReceiverRayCoverage,
  budget:{readonly maxModels:number;readonly maxTriangles:number;readonly maxVertices:number},
):OriginalReceiverSceneRay {
  if(!Number.isSafeInteger(coverage.sceneGeneration)||coverage.sceneGeneration<0
    ||!Number.isSafeInteger(coverage.callback)||coverage.callback<0
    ||!Number.isSafeInteger(budget.maxModels)||budget.maxModels<1
    ||!Number.isSafeInteger(budget.maxTriangles)||budget.maxTriangles<1
    ||!Number.isSafeInteger(budget.maxVertices)||budget.maxVertices<1)throw Error('Invalid receiver scene query boundary');
  if(coverage.unresolved.length)throw Error(`Incomplete receiver scene coverage: ${coverage.unresolved.join('; ')}`);
  const layers=new Set(coverage.accountedLayers);
  if(layers.size!==ORIGINAL_RECEIVER_SCENE_LAYERS.length
    ||ORIGINAL_RECEIVER_SCENE_LAYERS.some(layer=>!layers.has(layer)))throw Error('Incomplete receiver scene layer inventory');
  const expected=new Set(coverage.expectedHandles);
  if(expected.size!==coverage.expectedHandles.length||models.length!==expected.size
    ||models.length>budget.maxModels)throw Error('Invalid receiver scene model inventory or budget');
  const seen=new Set<string>(),triangles:Triangle[]=[];
  let admittedFaces=0,admittedVertices=0;
  for(const model of models){
    if(!model.handle||seen.has(model.handle)||!expected.has(model.handle)
      ||!layers.has(model.layer)||!model.geometryProvenance||typeof model.inWorld!=='boolean'
      ||!Array.isArray(model.groupAncestry)||model.groupAncestry.some(group=>typeof group!=='string')
      ||!['front','back','double'].includes(model.sidedness))throw Error('Invalid receiver scene model admission');
    seen.add(model.handle);
    const m=model.worldMatrix;
    if(m.length!==16||!m.every(Number.isFinite)||m[3]!==0||m[7]!==0||m[11]!==0||m[15]!==1)throw Error('Invalid receiver scene affine transform');
    admittedFaces+=model.faces.length;admittedVertices+=model.positions.length;
    if(!Number.isSafeInteger(admittedVertices)||admittedVertices>budget.maxVertices)throw Error('Receiver scene vertex budget exceeded');
    if(!Number.isSafeInteger(admittedFaces)||admittedFaces>budget.maxTriangles)throw Error('Receiver scene triangle budget exceeded');
    if(model.positions.length===0||model.faces.length===0)throw Error('Missing receiver scene model geometry');
    const points=model.positions.map(p=>{
      if(p.length!==3||!p.every(Number.isFinite))throw Error('Invalid receiver scene vertex');
      const v={x:m[0]*p[0]+m[4]*p[1]+m[8]*p[2]+m[12],y:m[1]*p[0]+m[5]*p[1]+m[9]*p[2]+m[13],z:m[2]*p[0]+m[6]*p[1]+m[10]*p[2]+m[14]};
      if(!finite(v))throw Error('Receiver scene vertex transform overflow');return v;
    });
    // Retain only immutable query metadata, never borrowed mutable poses/arrays.
    const metadata=Object.freeze({...model,groupAncestry:Object.freeze([...model.groupAncestry]),positions:[],faces:[],worldMatrix:[]});
    for(let faceIndex=0;faceIndex<model.faces.length;faceIndex++){
      const face=model.faces[faceIndex];
      if(face.length!==3||!face.every(i=>Number.isSafeInteger(i)&&i>=0&&i<points.length))throw Error('Invalid receiver scene face');
      const [a,b,c]=face.map(i=>points[i]);
      const ux=b.x-a.x,uy=b.y-a.y,uz=b.z-a.z,vx=c.x-a.x,vy=c.y-a.y,vz=c.z-a.z;
      const nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx,length=Math.hypot(nx,ny,nz);
      if(!Number.isFinite(length))throw Error('Receiver scene face arithmetic overflow');
      // A collapsed/repeated-index face has no ray-intersectable area. Keep
      // its model admitted and validate all siblings rather than discarding a
      // complete scene because one skin or imported face collapses. Face
      // indices remain the original resource indices. Native tolerance for
      // near-degenerate faces is still an unmeasured query adapter.
      if(length===0)continue;
      if(model.inWorld)triangles.push({model:metadata,faceIndex,bulletExcluded:metadata.groupAncestry.some(group=>['smokes','gsmokes'].includes(group.toLowerCase())),ax:a.x,ay:a.y,az:a.z,bx:b.x,by:b.y,bz:b.z,cx:c.x,cy:c.y,cz:c.z,nx:nx/length,ny:ny/length,nz:nz/length});
    }
  }
  const generation=coverage.sceneGeneration,callback=coverage.callback;
  const query:OriginalReceiverSceneRay['nearestDetailed']=(origin,direction,options={})=>{
    const length=Math.hypot(direction.x,direction.y,direction.z),max=options.maxDistance??Infinity;
    if(!finite(origin)||!finite(direction)||!Number.isFinite(length)||length===0
      ||Number.isNaN(max)||max<0)throw Error('Invalid receiver scene ray');
    const dx=direction.x/length,dy=direction.y/length,dz=direction.z/length;
    let best=max,winner:Triangle|undefined;
    for(const t of triangles){
      if(t.model.handle===options.excludeHandle||options.bullet&&t.bulletExcluded)continue;
      const ux=t.bx-t.ax,uy=t.by-t.ay,uz=t.bz-t.az,vx=t.cx-t.ax,vy=t.cy-t.ay,vz=t.cz-t.az;
      const px=dy*vz-dz*vy,py=dz*vx-dx*vz,pz=dx*vy-dy*vx,det=ux*px+uy*py+uz*pz;
      if(det===0||t.model.sidedness==='front'&&det<0||t.model.sidedness==='back'&&det>0)continue;
      const sx=origin.x-t.ax,sy=origin.y-t.ay,sz=origin.z-t.az;
      if(!Number.isFinite(det)||!Number.isFinite(sx)||!Number.isFinite(sy)||!Number.isFinite(sz)||!Number.isFinite(px)||!Number.isFinite(py)||!Number.isFinite(pz))throw Error('Receiver scene ray arithmetic overflow');
      const u=(sx*px+sy*py+sz*pz)/det;if(!Number.isFinite(u))throw Error('Receiver scene ray arithmetic overflow');if(u<0||u>1)continue;
      const qx=sy*uz-sz*uy,qy=sz*ux-sx*uz,qz=sx*uy-sy*ux;
      const v=(dx*qx+dy*qy+dz*qz)/det;if(!Number.isFinite(v))throw Error('Receiver scene ray arithmetic overflow');if(v<0||u+v>1)continue;
      const distance=(vx*qx+vy*qy+vz*qz)/det;
      if(!Number.isFinite(distance))throw Error('Receiver scene ray arithmetic overflow');
      if(distance<0||distance>best||winner&&distance===best)continue;
      best=distance;winner=t;
    }
    if(!winner)return null;
    const point={x:origin.x+dx*best,y:origin.y+dy*best,z:origin.z+dz*best};
    if(!finite(point))throw Error('Receiver scene ray point overflow');
    return {handle:winner.model.handle,layer:winner.model.layer,geometryProvenance:winner.model.geometryProvenance,
      faceIndex:winner.faceIndex,distance:best,point,normal:{x:winner.nx,y:winner.ny,z:winner.nz}};
  };
  return Object.freeze({sceneGeneration:generation,callback,modelCount:models.length,triangleCount:triangles.length,
    nearestDetailed:query,nearestDetailedDownward:(origin:Readonly<Vec3>,options?:{readonly excludeHandle?:string})=>query(origin,{x:0,y:-1,z:0},options)});
}
