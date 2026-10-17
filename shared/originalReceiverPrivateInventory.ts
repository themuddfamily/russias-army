import type {OriginalSceneData,OriginalSceneNode} from './originalSceneGeometry';
import type {OriginalDoorWorld} from './originalDoorWorld';
import type {OriginalBarrelWorld} from './originalBarrelWorld';
import type {OriginalReceiverImportedScene} from './originalReceiverImportedScene';
import type {OriginalReceiverRayModel} from './originalReceiverSceneRay';
import type {ReceiverModelEntry} from './originalReceiverModelWorld';
import {sameReceiverScenePrefix,validateReceiverScenePrefix,type ReceiverScenePrefix} from './originalReceiverPrefix';

export interface ReceiverPrivateInventoryOptions {
 readonly map:'barrack'|'woodlands';readonly scale:number;readonly sceneGeneration:number;
 /** Explicit source door registry, not a name-based ownership inference. */
 readonly doorNames:readonly string[];readonly provenance:string;
 readonly maxModels:number;readonly maxVertices:number;readonly maxFaces:number;
 readonly maxTextChars?:number;
}
export interface ReceiverPrivateInventoryCapture {
 /** Caller attests these private readers are CURRENT at this exact prefix.
  * This composer cannot reconstruct earlier receipts from mutable live state. */
 readonly prefix:ReceiverScenePrefix;
 readonly doors?:Pick<OriginalDoorWorld,'getStates'|'getModelMatrix'>;
 readonly barrels?:Pick<OriginalBarrelWorld,'getModelMatrix'>;
}
export interface ReceiverPrivateInventorySnapshot {
 readonly scope:'private-imported-subset';readonly prefix:ReceiverScenePrefix;
 readonly models:readonly ReceiverModelEntry[];
 readonly triangles:readonly OriginalReceiverRayModel[];
 readonly missing:readonly string[];readonly provenance:string;
 resolveModel(handle:string):OriginalReceiverRayModel;
}
export interface OriginalReceiverPrivateInventory {
 snapshotAt(prefix:ReceiverScenePrefix,capture:ReceiverPrivateInventoryCapture):ReceiverPrivateInventorySnapshot;
}
const identity=Object.freeze([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);
const key=(name:string)=>name.toLowerCase();
const affine=(value:readonly number[])=>value.length===16&&value.every(Number.isFinite)&&value[3]===0&&value[7]===0&&value[11]===0&&value[15]===1;
function matrix(value:readonly number[]):readonly number[]{if(!affine(value))throw Error('Invalid private inventory affine matrix');return Object.freeze([...value]);}
function multiply(a:readonly number[],b:readonly number[]):readonly number[]{
 const out=new Array<number>(16).fill(0);
 for(let col=0;col<4;col++)for(let row=0;row<4;row++)for(let i=0;i<4;i++)out[col*4+row]+=a[i*4+row]*b[col*4+i];
 return matrix(out);
}
const unresolved=Object.freeze(['sky','local-camera-weapon','projectile','transient','actor-ledger']);
const sourceReparents={barrack:['outerfencing'],woodlands:['syccamore','spindlybirchleaves','rowanbranch','othertrees','birch','outerfencing']} as const;

/** Imported fixed + private visible doors/barrels only. Mandatory missing
 * classes prevent accidental grounding admission. Local goody is a camera,
 * not an invented GI mesh; camera-owned gun/loaded rocket remain unresolved.
 * Geometry records are borrowed from one shared immutable ImportedScene.
 * Snapshots copy current matrices/scalars only: no history, physics or RNG.
 */
export function createOriginalReceiverPrivateInventory(
 imported:OriginalReceiverImportedScene,data:OriginalSceneData,options:ReceiverPrivateInventoryOptions,
):OriginalReceiverPrivateInventory {
 if(!['barrack','woodlands'].includes(options.map)||!Number.isFinite(options.scale)||options.scale<=0||typeof options.provenance!=='string'||!options.provenance
  ||!Number.isSafeInteger(options.sceneGeneration)||options.sceneGeneration<0
  ||![options.maxModels,options.maxVertices,options.maxFaces].every(n=>Number.isSafeInteger(n)&&n>0)
  ||!Array.isArray(data.nodes)||data.nodes.length>options.maxModels||!Array.isArray(options.doorNames)||options.doorNames.length>options.maxModels)throw Error('Invalid private inventory bounds');
 const maxText=options.maxTextChars??131072;
 if(!Number.isSafeInteger(maxText)||maxText<1)throw Error('Invalid private inventory text budget');
 let text=options.provenance.length;
 if(text>maxText)throw Error('Private inventory text budget exceeded');
 for(const node of data.nodes){if(typeof node.name!=='string'||typeof node.parent!=='string'||typeof node.resource!=='string')throw Error('Invalid private inventory node');text+=node.name.length+node.parent.length+node.resource.length;if(text>maxText)throw Error('Private inventory text budget exceeded');}
 for(const name of options.doorNames){if(typeof name!=='string')throw Error('Invalid private door registry');text+=name.length;if(text>maxText)throw Error('Private inventory text budget exceeded');}
 const base=imported.snapshot();
 if(!Array.isArray(base.models)||!Array.isArray(base.missing)||!Object.isFrozen(base)||!Object.isFrozen(base.missing)||base.models.length>options.maxModels||base.missing.length>options.maxModels)throw Error('Private inventory model budget exceeded');
 let vertices=0,faces=0;
 for(const model of base.models){vertices+=model.positions.length;faces+=model.faces.length;text+=model.handle.length+model.geometryProvenance.length;if(!Number.isSafeInteger(vertices)||!Number.isSafeInteger(faces)||vertices>options.maxVertices||faces>options.maxFaces)throw Error('Private inventory geometry budget exceeded');if(text>maxText)throw Error('Private inventory text budget exceeded');
  if(!Object.isFrozen(model)||!Object.isFrozen(model.positions)||!Object.isFrozen(model.faces)||model.positions.some((value:readonly number[])=>!Object.isFrozen(value))||model.faces.some((value:readonly number[])=>!Object.isFrozen(value)))throw Error('Private inventory requires immutable imported geometry');
 }
 for(const item of base.missing){if(typeof item!=='string')throw Error('Invalid imported missing evidence');text+=item.length;if(text>maxText)throw Error('Private inventory text budget exceeded');}
 const nodes=new Map<string,OriginalSceneNode>();
 for(const node of data.nodes){
  if(typeof node.name!=='string'||!node.name||typeof node.parent!=='string'||!affine(node.matrix)||nodes.has(key(node.name)))throw Error('Invalid private inventory hierarchy');
  nodes.set(key(node.name),Object.freeze({...node,matrix:matrix(node.matrix)}));
 }
 for(const model of base.models)if(!nodes.has(key(model.handle)))throw Error('Private imported inventory identity mismatch');
 const doors=new Set<string>();
 for(const name of options.doorNames){if(typeof name!=='string'||!nodes.has(key(name))||doors.has(key(name)))throw Error('Invalid private door registry');doors.add(key(name));}
 // Matches OriginalBarrelWorld/source barrel actor admission, not arbitrary
 // substring classification or evidence of baddy membership.
 const barrels=new Set([...nodes].filter(([,node])=>node.name.trim().split(/\s+/)[0].toLowerCase()==='barrel').map(([name])=>name));
 for(const name of doors)if(barrels.has(name))throw Error('Conflicting private model ownership');
 const reparented=new Set<string>(sourceReparents[options.map].filter(name=>nodes.has(name)));
 // Validate ancestry independently; the shared provider may be a supplied
 // interface implementation rather than the standard decoder.
 for(const [name,node] of nodes){const seen=new Set([name]);let parent=key(node.parent);while(parent&&parent!=='world'){
  if(seen.has(parent)||!nodes.has(parent))throw Error('Invalid private inventory ancestry');seen.add(parent);parent=key(nodes.get(parent)!.parent);
 }}
 const compose=(local:ReadonlyMap<string,readonly number[]>,world:ReadonlyMap<string,readonly number[]>)=>{
  const result=new Map<string,readonly number[]>();
  for(const name of nodes.keys()){
   const chain:string[]=[];let cursor=name,value:readonly number[]=identity;
   while(cursor&&cursor!=='world'){
    if(result.has(cursor)){value=result.get(cursor)!;break;}
    if(world.has(cursor)){value=world.get(cursor)!;result.set(cursor,value);break;}
    chain.push(cursor);cursor=key(nodes.get(cursor)!.parent);
   }
   for(let i=chain.length-1;i>=0;i--){const item=chain[i];value=multiply(value,local.get(item)??nodes.get(item)!.matrix);result.set(item,value);}
  }
  return result;
 };
 const initialWorld=compose(new Map(),new Map());
 const scale=options.scale,conversion=Object.freeze([scale,0,0,0,0,0,-scale,0,0,scale,0,0,0,0,0,1]);
 // Bind one standard immutable decoder output to exactly this source hierarchy
 // and scale. Geometry/provenance are borrowed from that trusted producer;
 // this validates placement/resource binding, not a native decoding proof.
 const handles=new Set<string>();
 for(const original of base.models){
  const name=key(original.handle),node=nodes.get(name)!,expected=multiply(conversion,initialWorld.get(name)!);
  if(handles.has(name)||typeof original.resource!=='string'||key(original.resource)!==key(node.resource)||!affine(original.worldMatrix)
   ||original.worldMatrix.some((value:number,index:number)=>Math.abs(value-expected[index])>1e-9*Math.max(1,Math.abs(expected[index]))))throw Error('Private imported inventory binding mismatch');
  handles.add(name);const ancestry:string[]=[];let parent=key(node.parent);while(parent&&parent!=='world'){ancestry.push(key(nodes.get(parent)!.name));parent=key(nodes.get(parent)!.parent);}
  if(original.groupAncestry.length!==ancestry.length||original.groupAncestry.some((value:string,index:number)=>key(value)!==ancestry[index]))throw Error('Private imported inventory ancestry mismatch');
 }
 const generation=options.sceneGeneration,provenance=options.provenance,maxModels=options.maxModels;
 return Object.freeze({snapshotAt:(prefix:ReceiverScenePrefix,capture:ReceiverPrivateInventoryCapture)=>{
  validateReceiverScenePrefix(prefix);validateReceiverScenePrefix(capture.prefix);
  if(prefix.sceneGeneration!==generation||!sameReceiverScenePrefix(prefix,capture.prefix))throw Error('Private inventory prefix mismatch');
  const frozenPrefix:ReceiverScenePrefix=Object.freeze(prefix.kind==='receipt'?{kind:'receipt',sceneGeneration:generation,callback:prefix.callback,tick:prefix.tick}:{kind:'callback',sceneGeneration:generation,callback:prefix.callback});
  const missing=[...base.missing,...unresolved],local=new Map<string,readonly number[]>(),world=new Map<string,readonly number[]>(),removed=new Set<string>();
  // Explicit source explore-operation adapter: retain the imported WORLD when
  // parenting under the newly created identity smokes group. This arithmetic
  // is not a new native parent-setter measurement. Descendants follow it.
  for(const name of reparented)world.set(name,initialWorld.get(name)!);
  let admittedDoors:Set<string>|undefined;
  if(capture.doors){const states=capture.doors.getStates();if(!Array.isArray(states)||states.length>maxModels)throw Error('Invalid private door state budget');
   admittedDoors=new Set();let stateText=0;for(const state of states){if(typeof state.name!=='string'||admittedDoors.has(key(state.name)))throw Error('Invalid private door state');stateText+=state.name.length;if(stateText>maxText)throw Error('Private inventory text budget exceeded');admittedDoors.add(key(state.name));if(!doors.has(key(state.name)))missing.push(`unregistered-door-state:${state.name}`);}
  }
  for(const name of doors){
   const node=nodes.get(name)!;
   if(!capture.doors||!admittedDoors!.has(name)){missing.push(`door-state:${node.name}`);continue;}
   const value=capture.doors.getModelMatrix(node.name);if(!value){missing.push(`door-matrix:${node.name}`);continue;}local.set(name,matrix(value));
   if(reparented.has(name))missing.push(`unsupported-door-reparent:${node.name}`);
  }
  for(const name of barrels){const node=nodes.get(name)!;
   if(!capture.barrels){missing.push(`barrel-state:${node.name}`);continue;}
   const value=capture.barrels.getModelMatrix(node.name);
   if(value)world.set(name,matrix(value));else removed.add(name);
  }
  const sourceWorld=compose(local,world),triangles:OriginalReceiverRayModel[]=[],models:ReceiverModelEntry[]=[],lookup=new Map<string,OriginalReceiverRayModel>();
  for(const original of base.models){
   const name=key(original.handle),node=nodes.get(name)!,ancestry:string[]=[];let cursor=name,inWorld=original.inWorld;
   while(cursor&&cursor!=='world'){
    if(removed.has(cursor))inWorld=false;
    if(reparented.has(cursor)){ancestry.push('smokes');break;}
    const parent=key(nodes.get(cursor)!.parent);if(parent&&parent!=='world')ancestry.push(nodes.get(parent)!.name);cursor=parent;
   }
   if(original.layer==='live-gi'||original.layer==='pending-death-gi'||original.layer==='corpse'||name.includes('baddy'))missing.push(`imported-actor-ownership:${node.name}`);
   if(original.layer==='door'&&!doors.has(name))missing.push(`unregistered-imported-door:${node.name}`);
   if(original.layer==='barrel'&&!barrels.has(name))missing.push(`unregistered-imported-barrel:${node.name}`);
   const kind:ReceiverModelEntry['kind']=doors.has(name)?'door':barrels.has(name)?'barrel':'fixed';
   const worldMatrix=multiply(conversion,sourceWorld.get(name)!);
   const ray=Object.freeze({...original,layer:kind,inWorld,groupAncestry:Object.freeze(ancestry),worldMatrix});
   triangles.push(ray);lookup.set(ray.handle,ray);
   models.push(Object.freeze({handle:ray.handle,name:ray.handle,resource:original.resource,group:ancestry.some(value=>['gsmokes','smokes'].includes(value.toLowerCase()))?'gsmokes':'scene',kind,inWorld,
    pose:Object.freeze({position:Object.freeze({x:worldMatrix[12],y:worldMatrix[13],z:worldMatrix[14]}),yaw:0,phase:0,scale:1}),worldMatrix,geometryProvenance:ray.geometryProvenance}));
  }
  if(missing.reduce((total,value)=>total+value.length,0)>maxText)throw Error('Private inventory missing evidence budget exceeded');
  return Object.freeze({scope:'private-imported-subset' as const,prefix:frozenPrefix,models:Object.freeze(models),triangles:Object.freeze(triangles),missing:Object.freeze([...new Set(missing)]),provenance,
   resolveModel:(handle:string)=>{const value=lookup.get(handle);if(!value)throw Error('Unknown private inventory model');return value;}});
 }});
}
