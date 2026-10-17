import {isReceiverDropYawRequest,type ReceiverDropYawRequest} from '../shared/originalReceiverModelWorld';
import {validateReceiverScenePrefix} from '../shared/originalReceiverPrefix';
import {captureOriginalSoloActorDropYawPlan,type OriginalSoloActorDropYawPlan} from './originalSoloActorLifecycle';

export interface OriginalSoloActorDropCaptureOptions {
 readonly sceneGeneration:number;readonly maxEntries:number;readonly maxTextChars:number;
 readonly sampleRandom36:()=>number;readonly readCommittedCallback:()=>number;
}
export interface OriginalSoloActorDropCapture {
 readonly requestOwner:object;
 readDropYawPlan(actorId:string,callback:number,request?:ReceiverDropYawRequest):OriginalSoloActorDropYawPlan;
 release():void;
}
/** Exact-detach admission cache. An issuer-bound live ModelWorld request is
 * required before drawing a source random(36) operand. Draws survive rollback;
 * retry keys return the exact issued plan, without speculative living-actor
 * sampling or RNG rollback. A sampler/hook failure poisons this life cache.
 * Retains bounded insertion-ordered operands for every uncommitted callback;
 * an actual issued stage prefix, rather than a synthetic callback cadence,
 * authorizes catch-up callbacks. Prunes only a monotonic committed watermark. */
export function createOriginalSoloActorDropCapture(options:OriginalSoloActorDropCaptureOptions):OriginalSoloActorDropCapture {
 if(!options)throw Error('Missing actor drop capture options');
 const sceneGeneration=options.sceneGeneration,maxEntries=options.maxEntries,maxTextChars=options.maxTextChars,sample=options.sampleRandom36,readCommitted=options.readCommittedCallback;
 if(!Number.isSafeInteger(sceneGeneration)||sceneGeneration<0||!Number.isSafeInteger(maxEntries)||maxEntries<1||maxEntries>256||!Number.isSafeInteger(maxTextChars)||maxTextChars<1||maxTextChars>65536||typeof sample!=='function'||typeof readCommitted!=='function')throw Error('Invalid actor drop capture options');
 const requestOwner=Object.freeze({}),pending=new Map<number,{text:number;entries:Map<string,{random36:number;plan:OriginalSoloActorDropYawPlan}>}>();
 let count=0,text=0,watermark=0,closed=false,poisoned=false,busy=false;
 const committed=():number=>{const value=readCommitted();if(!Number.isSafeInteger(value)||value<0)throw Error('Invalid actor drop committed callback');return value;};
 const readDropYawPlan=(actorId:string,callback:number,request?:ReceiverDropYawRequest):OriginalSoloActorDropYawPlan=>{
  if(busy){poisoned=true;throw Error('Actor drop capture operation active');}
  if(closed||poisoned)throw Error('Actor drop capture unavailable');
  // Unissued values never have their fields/getters inspected.
  if(!isReceiverDropYawRequest(request,requestOwner))throw Error('Missing or inactive actor drop request');
  if(typeof actorId!=='string'||!actorId||actorId.trim()!==actorId||actorId.length>maxTextChars||!Number.isSafeInteger(callback)||callback<0)throw Error('Invalid actor drop capture key');
  const prefix=request.prefix;validateReceiverScenePrefix(prefix);
  if(request.actorId!==actorId||request.callback!==callback||prefix.callback!==callback||prefix.sceneGeneration!==sceneGeneration||prefix.kind!=='callback')throw Error('Foreign actor drop request key, generation or callback prefix');
  busy=true;
  try{
   let before:number;try{before=committed();}catch(error){poisoned=true;throw error;}
   if(poisoned||closed)throw Error('Actor drop capture unavailable');
   if(!isReceiverDropYawRequest(request,requestOwner)){poisoned=true;throw Error('Actor drop request expired during capture');}
   if(before<watermark){poisoned=true;throw Error('Actor drop committed callback decreased');}watermark=before;
   if(callback<=before)throw Error('Actor drop callback already committed');
   for(const [oldCallback,old] of pending)if(oldCallback<=before){count-=old.entries.size;text-=old.text;pending.delete(oldCallback);}
   const group=pending.get(callback),entries=group?.entries,existing=entries?.get(actorId);
   if(existing)return existing.plan;
   const nextText=text+actorId.length;
   if(count>=maxEntries||nextText>maxTextChars)throw Error('Actor drop capture budget exceeded');
   // Rejected admissions never evict uncommitted entries or consume the source
   // sampler; independent callback plans retain their own insertion order.
   let random36:number,after:number;
   try{random36=sample();after=committed();}catch(error){poisoned=true;throw error;}
   if(poisoned||closed||after!==before||!Number.isSafeInteger(random36)||random36<1||random36>36){poisoned=true;throw Error('Actor drop sample or committed callback changed');}
   if(!isReceiverDropYawRequest(request,requestOwner)){poisoned=true;throw Error('Actor drop request expired during capture');}
   const samples=entries?[...entries].map(([id,value])=>({actorId:id,random36:value.random36})):[];
   samples.push({actorId,random36});
   let plan:OriginalSoloActorDropYawPlan;try{plan=captureOriginalSoloActorDropYawPlan(callback,samples,{maxEntries,maxTextChars});}catch(error){poisoned=true;throw error;}
   const admitted=group??{text:0,entries:new Map<string,{random36:number;plan:OriginalSoloActorDropYawPlan}>()};
   admitted.text+=actorId.length;admitted.entries.set(actorId,{random36,plan});pending.set(callback,admitted);count++;text=nextText;return plan;
  }finally{busy=false;}
 };
 const release=()=>{if(closed)return;if(busy)poisoned=true;closed=true;pending.clear();count=0;text=0;};
 return Object.freeze({requestOwner,readDropYawPlan,release});
}
