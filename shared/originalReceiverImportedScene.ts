import type {OriginalSceneData,OriginalSceneMesh} from './originalSceneGeometry';
import type {OriginalReceiverRayModel,OriginalReceiverSceneLayer} from './originalReceiverSceneRay';

export interface OriginalReceiverImportedSceneOptions {
  readonly scale:number;
  readonly geometryProvenance:string;
  /** Explicit query policy, not a recovered native ray sidedness measurement. */
  readonly sidedness:OriginalReceiverRayModel['sidedness'];
  readonly maxModels:number;readonly maxVertices:number;readonly maxFaces:number;
}
export interface OriginalReceiverImportedOverride {
  /** Full local-source-mesh to world matrix, replacing the imported placement.
   * No additional Z-up conversion or source scaling is applied to overrides. */
  readonly worldMatrix:readonly number[];
  readonly inWorld?:boolean;
  /** Explicit source runtime reparenting (e.g. explore creates smokes). */
  readonly groupAncestry?:readonly string[];
}
export interface OriginalReceiverImportedModel extends OriginalReceiverRayModel {
  readonly resource:string;readonly resourceParts:readonly number[];
  /** Preserved metadata only; zero visibility never excludes query membership. */
  readonly visibility:number;
}
export interface OriginalReceiverImportedSnapshot {
  readonly scope:'imported-scene-only';
  readonly geometryProvenance:string;
  readonly models:readonly OriginalReceiverImportedModel[];
  readonly groups:readonly string[];
  /** Missing named resources. No omitted model is declared empty by inference. */
  readonly missing:readonly string[];
}
export interface OriginalReceiverImportedScene {
  snapshot(overrides?:ReadonlyMap<string,OriginalReceiverImportedOverride>):OriginalReceiverImportedSnapshot;
}
const affine=(matrix:readonly number[])=>matrix.length===16&&matrix.every(Number.isFinite)
  &&matrix[3]===0&&matrix[7]===0&&matrix[11]===0&&matrix[15]===1;
function multiply(a:readonly number[],b:readonly number[]):number[] {
  const out=new Array<number>(16).fill(0);
  for(let col=0;col<4;col++)for(let row=0;row<4;row++)for(let k=0;k<4;k++)out[col*4+row]+=a[k*4+row]*b[col*4+k];
  if(!affine(out))throw Error('Imported receiver world transform overflow');return out;
}
function classify(name:string):OriginalReceiverSceneLayer {
  const lower=name.toLowerCase();
  if(lower.includes('door'))return 'door';if(lower.includes('barrel'))return 'barrel';
  if(lower.includes('baddy'))return 'live-gi';return 'fixed';
}

/** Imported model inventory, deliberately independent from worldphysics fixed
 * collision exclusions and visibility. This is not a complete dynamic receiver
 * scene: GI/gun/projectile/transient lifecycles must be supplied separately.
 * Unknown/cyclic parents and non-affine hierarchy are unsupported and throw.
 */
export function createOriginalReceiverImportedScene(
  data:OriginalSceneData,options:OriginalReceiverImportedSceneOptions,
):OriginalReceiverImportedScene {
  if(!Number.isFinite(options.scale)||options.scale<=0||!options.geometryProvenance
    ||!['front','back','double'].includes(options.sidedness)
    ||![options.maxModels,options.maxVertices,options.maxFaces].every(n=>Number.isSafeInteger(n)&&n>0)
    ||!Array.isArray(data.nodes)||!Array.isArray(data.meshes)||data.nodes.length>options.maxModels
    ||data.meshes.length>options.maxFaces)throw Error('Invalid imported receiver scene bounds');
  // Validate source sizes and topology before allocating geometry or hierarchy maps.
  let sourceVertices=0,sourceFaces=0;
  for(const mesh of data.meshes){
    if(typeof mesh.resource!=='string'||!mesh.resource||!Number.isSafeInteger(mesh.part)||mesh.part<0
      ||!Array.isArray(mesh.positions)||!Array.isArray(mesh.faces))throw Error('Invalid imported receiver resource');
    sourceVertices+=mesh.positions.length;sourceFaces+=mesh.faces.length;
    if(sourceVertices>options.maxVertices||sourceFaces>options.maxFaces)throw Error('Imported receiver source geometry budget exceeded');
    for(const p of mesh.positions)if(p.length!==3||!p.every(Number.isFinite))throw Error('Invalid imported receiver vertex');
    for(const face of mesh.faces)if(face.length!==3||!face.every((i:number)=>Number.isSafeInteger(i)&&i>=0&&i<mesh.positions.length))throw Error('Invalid imported receiver face');
  }
  for(const node of data.nodes)if(typeof node.name!=='string'||!node.name||typeof node.parent!=='string'
    ||typeof node.resource!=='string'||!affine(node.matrix)||!Number.isFinite(node.visibility))throw Error('Unsupported imported receiver node hierarchy');
  const nodes=new Map(data.nodes.map(node=>[node.name.toLowerCase(),node]));
  if(nodes.size!==data.nodes.length)throw Error('Duplicate imported receiver node');
  const resources=new Map<string,OriginalSceneMesh[]>();
  for(const mesh of data.meshes){const key=mesh.resource.toLowerCase(),parts=resources.get(key)??[];
    if(parts.some(part=>part.part===mesh.part))throw Error('Duplicate imported receiver resource part');parts.push(mesh);resources.set(key,parts);}
  let instanceVertices=0,instanceFaces=0;
  for(const node of data.nodes)for(const part of resources.get(node.resource.toLowerCase())??[]){
    instanceVertices+=part.positions.length;instanceFaces+=part.faces.length;
    if(instanceVertices>options.maxVertices||instanceFaces>options.maxFaces)throw Error('Imported receiver instance geometry budget exceeded');
  }
  // Iterative ancestry validation avoids unbounded recursion on unsupported chains.
  const ancestors=new Map<string,readonly string[]>();
  for(const node of data.nodes){
    const names:string[]=[],seen=new Set<string>();let parent=node.parent.toLowerCase();
    while(parent!==''&&parent!=='world'){
      if(seen.has(parent)||parent===node.name.toLowerCase())throw Error('Cyclic imported receiver hierarchy');seen.add(parent);
      const ancestor=nodes.get(parent);if(!ancestor)throw Error('Missing imported receiver parent');
      names.push(ancestor.name);parent=ancestor.parent.toLowerCase();
    }
    ancestors.set(node.name.toLowerCase(),Object.freeze(names));
  }
  const matrices=new Map<string,readonly number[]>();
  const identity=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
  for(const node of data.nodes){
    let matrix:readonly number[]=identity;
    const chain=ancestors.get(node.name.toLowerCase())!;
    for(let index=chain.length-1;index>=0;index--)matrix=multiply(matrix,nodes.get(chain[index].toLowerCase())!.matrix);
    matrices.set(node.name.toLowerCase(),multiply(matrix,node.matrix));
  }
  // Proper rotation (x,y,z)->(x,z,-y), uniform caller-chosen world scale.
  const s=options.scale,conversion=[s,0,0,0,0,0,-s,0,0,s,0,0,0,0,0,1];
  const models:OriginalReceiverImportedModel[]=[],groups:string[]=[],missing:string[]=[];
  for(const node of data.nodes){
    const parts=resources.get(node.resource.toLowerCase());
    if(!parts){if(node.resource==='')groups.push(node.name);else missing.push(`Missing imported resource ${node.resource} for ${node.name}`);continue;}
    const positions:(readonly number[])[]=[],faces:(readonly number[])[]=[];
    // Preserve decoded resource-part order as an explicit tie-order adapter.
    for(const part of parts){const base=positions.length;
      for(const p of part.positions)positions.push(Object.freeze([...p]));
      for(const face of part.faces)faces.push(Object.freeze(face.map(i=>i+base)));
    }
    if(positions.length===0||faces.length===0){missing.push(`Empty imported geometry ${node.resource} for ${node.name}`);continue;}
    models.push(Object.freeze({handle:node.name,resource:node.resource,resourceParts:Object.freeze(parts.map(part=>part.part)),visibility:node.visibility,layer:classify(node.name),inWorld:true,
      groupAncestry:ancestors.get(node.name.toLowerCase())!,geometryProvenance:options.geometryProvenance,
      positions:Object.freeze(positions),faces:Object.freeze(faces),worldMatrix:Object.freeze(multiply(conversion,matrices.get(node.name.toLowerCase())!)),sidedness:options.sidedness}));
  }
  const base=Object.freeze(models),handles=new Set(models.map(model=>model.handle));
  const maxModels=options.maxModels,provenance=options.geometryProvenance,frozenGroups=Object.freeze(groups),frozenMissing=Object.freeze(missing);
  return Object.freeze({snapshot:(overrides:ReadonlyMap<string,OriginalReceiverImportedOverride>=new Map())=>{
    // Validate every override before constructing a replacement snapshot.
    if(overrides.size>handles.size)throw Error('Invalid imported receiver override inventory');
    for(const [handle,override] of overrides)if(!handles.has(handle)||!affine(override.worldMatrix)
      ||override.inWorld!==undefined&&typeof override.inWorld!=='boolean'
      ||override.groupAncestry!==undefined&&(!Array.isArray(override.groupAncestry)||override.groupAncestry.length>maxModels||override.groupAncestry.some(group=>typeof group!=='string')))throw Error('Invalid imported receiver model override');
    const selected=overrides.size?Object.freeze(base.map(model=>{
      const override=overrides.get(model.handle);return override?Object.freeze({...model,
        worldMatrix:Object.freeze([...override.worldMatrix]),inWorld:override.inWorld??model.inWorld,
        groupAncestry:override.groupAncestry?Object.freeze([...override.groupAncestry]):model.groupAncestry}):model;
    })):base;
    return Object.freeze({scope:'imported-scene-only' as const,geometryProvenance:provenance,models:selected,groups:frozenGroups,missing:frozenMissing});
  }});
}
