import type {ReceiverModelRotation} from './originalReceiverModelWorld';

export interface ReceiverActorResourceDescriptor {
 readonly sourceScale:number;readonly giResourceOrientation:Readonly<ReceiverModelRotation>;
 /** Explicit factory attestation of a shared immutable decoded GI/rig/gun pack.
  * The identifier is not a content hash or proof that another pack is equal. */
 readonly resourceBindingId:string;readonly provenance:string;
}
const descriptors=new WeakSet<object>(),textSizes=new WeakMap<object,number>();
function validateLimit(maxTextChars:number):void {
 if(!Number.isSafeInteger(maxTextChars)||maxTextChars<1)throw Error('Invalid actor resource descriptor text budget');
}
/** Trusted issuer boundary. Branding proves this detached schema was checked,
 * not native semantics, decoded asset equivalence or cryptographic ownership.
 * No geometry, other receiver state or history is retained or disposed here. */
export function createOriginalReceiverActorResourceDescriptor(input:ReceiverActorResourceDescriptor,maxTextChars=65536):ReceiverActorResourceDescriptor {
 validateLimit(maxTextChars);if(!input)throw Error('Missing actor resource descriptor');
 const sourceScale=input.sourceScale,rawBasis=input.giResourceOrientation,resourceBindingId=input.resourceBindingId,provenance=input.provenance;
 if(!Number.isFinite(sourceScale)||sourceScale<=0||!rawBasis||typeof resourceBindingId!=='string'||!resourceBindingId||typeof provenance!=='string'||!provenance)throw Error('Invalid actor resource descriptor');
 const text=resourceBindingId.length+provenance.length;
 if(!Number.isSafeInteger(text)||text>maxTextChars)throw Error('Actor resource descriptor text budget exceeded');
 const x=rawBasis.x,y=rawBasis.y,z=rawBasis.z,w=rawBasis.w;
 if(![x,y,z,w].every(Number.isFinite)||Math.abs(Math.hypot(x,y,z,w)-1)>1e-6)throw Error('Invalid actor resource descriptor basis');
 const descriptor=Object.freeze({sourceScale,giResourceOrientation:Object.freeze({x,y,z,w}),resourceBindingId,provenance});
 descriptors.add(descriptor);textSizes.set(descriptor,text);return descriptor;
}
/** Only issuer-created immutable records are admitted; a later consumer may
 * impose a smaller text budget without copying or reading caller accessors. */
export function validateOriginalReceiverActorResourceDescriptor(value:ReceiverActorResourceDescriptor,maxTextChars=65536):void {
 validateLimit(maxTextChars);
 if(!value||!descriptors.has(value))throw Error('Invalid detached actor resource descriptor');
 if((textSizes.get(value)??Infinity)>maxTextChars)throw Error('Actor resource descriptor text budget exceeded');
}
