/** Explicit caller attestations of immutable geometry and texture packs.
 * Branding checks this schema; it does not establish native asset equivalence. */
export interface ReceiverTransientResourceDescriptor {
 readonly sourceScale:number;readonly planeWidthWorld:number;
 readonly planeGeometryProvenance:string;readonly provenance:string;
 readonly sidedness:'front'|'back'|'double';
 readonly resourceBindingId:string;readonly textureBindingId:string;
 readonly textureNames:readonly string[];
}
const descriptors=new WeakSet<object>(),textSizes=new WeakMap<object,number>();
function validateLimit(limit:number):void {
 if(!Number.isSafeInteger(limit)||limit<1)throw Error('Invalid transient resource descriptor text budget');
}
export function createOriginalReceiverTransientResourceDescriptor(input:ReceiverTransientResourceDescriptor,maxTextChars=65536):ReceiverTransientResourceDescriptor {
 validateLimit(maxTextChars);if(!input)throw Error('Missing transient resource descriptor');
 const sourceScale=input.sourceScale,planeWidthWorld=input.planeWidthWorld;
 const planeGeometryProvenance=input.planeGeometryProvenance,provenance=input.provenance;
 const sidedness=input.sidedness,resourceBindingId=input.resourceBindingId,textureBindingId=input.textureBindingId;
 const names=input.textureNames;
 if(!Array.isArray(names))throw Error('Invalid transient resource descriptor texture list');
 const count=names.length;
 if(!Number.isSafeInteger(count)||count<0||count>256)throw Error('Transient resource descriptor texture budget exceeded');
 if(!Number.isFinite(sourceScale)||sourceScale<=0||!Number.isFinite(planeWidthWorld)||planeWidthWorld<=0
  ||!['front','back','double'].includes(sidedness))throw Error('Invalid transient resource descriptor');
 let text=0;
 for(const value of [planeGeometryProvenance,provenance,resourceBindingId,textureBindingId,sidedness]){
  if(typeof value!=='string'||!value)throw Error('Invalid transient resource descriptor label');
  text+=value.length;
 }
 if(!Number.isSafeInteger(text)||text>maxTextChars)throw Error('Transient resource descriptor text budget exceeded');
 const textureNames:string[]=[],unique=new Set<string>();
 for(let index=0;index<count;index++){
  const name=names[index];
  if(typeof name!=='string'||!name||unique.has(name))throw Error('Invalid transient resource descriptor texture');
  text+=name.length;
  if(!Number.isSafeInteger(text)||text>maxTextChars)throw Error('Transient resource descriptor text budget exceeded');
  unique.add(name);textureNames.push(name);
 }
 const descriptor=Object.freeze({sourceScale,planeWidthWorld,planeGeometryProvenance,provenance,sidedness,
  resourceBindingId,textureBindingId,textureNames:Object.freeze(textureNames)});
 descriptors.add(descriptor);textSizes.set(descriptor,text);return descriptor;
}
export function validateOriginalReceiverTransientResourceDescriptor(value:ReceiverTransientResourceDescriptor,maxTextChars=65536):void {
 validateLimit(maxTextChars);
 if(!value||!descriptors.has(value))throw Error('Invalid detached transient resource descriptor');
 if((textSizes.get(value)??Infinity)>maxTextChars)throw Error('Transient resource descriptor text budget exceeded');
}
