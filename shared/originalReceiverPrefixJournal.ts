import type {ReceiverModelEntry} from './originalReceiverModelWorld';
import {sameReceiverScenePrefix,validateReceiverScenePrefix,type ReceiverExternalSceneSnapshot,type ReceiverExternalSceneSource,type ReceiverScenePrefix} from './originalReceiverPrefix';

export interface ReceiverExternalPrefixDelta {
  readonly prefix:ReceiverScenePrefix;
  /** Stable resource/pose records only, never skinned mesh snapshots. */
  readonly upsert:readonly ReceiverModelEntry[];
  /** Actual disposal, not temporary removeFromWorld or pool retirement. */
  readonly remove:readonly string[];
  readonly missing:readonly string[];
  readonly provenance:string;
}
export interface ReceiverPrefixJournalLimits {
  readonly maxPrefixes:number;readonly maxChanges:number;
  readonly maxModels:number;readonly maxTextChars:number;
}
const compare=(a:ReceiverScenePrefix,b:ReceiverScenePrefix):number=>a.callback-b.callback
  ||(a.kind==='callback'?0:1)-(b.kind==='callback'?0:1)
  ||(a.kind==='receipt'&&b.kind==='receipt'?a.tick-b.tick:0);
const prefixCopy=(prefix:ReceiverScenePrefix)=>Object.freeze({...prefix}) as ReceiverScenePrefix;
function copyEntry(model:ReceiverModelEntry):ReceiverModelEntry {
  const p=model.pose,q=p.rotation,m=model.worldMatrix;
  if(!['fixed','door','barrel','projectile','sky','transient'].includes(model.kind)
    ||!['scene','gsmokes','soldiers'].includes(model.group)||typeof model.inWorld!=='boolean'
    ||![model.handle,model.name,model.resource,model.geometryProvenance].every(s=>typeof s==='string'&&s.length>0)
    ||![p.position.x,p.position.y,p.position.z,p.yaw,p.phase,p.scale].every(Number.isFinite)||p.scale<=0
    ||q&&(![q.x,q.y,q.z,q.w].every(Number.isFinite)||Math.abs(Math.hypot(q.x,q.y,q.z,q.w)-1)>1e-6)
    ||m&&(m.length!==16||!m.every(Number.isFinite)||m[3]!==0||m[7]!==0||m[11]!==0||m[15]!==1))throw Error('Invalid receiver prefix model');
  return Object.freeze({handle:model.handle,name:model.name,resource:model.resource,group:model.group,kind:model.kind,
    inWorld:model.inWorld,geometryProvenance:model.geometryProvenance,
    pose:Object.freeze({position:Object.freeze({x:p.position.x,y:p.position.y,z:p.position.z}),yaw:p.yaw,phase:p.phase,scale:p.scale,
      ...(q?{rotation:Object.freeze({x:q.x,y:q.y,z:q.z,w:q.w})}:{})}),...(m?{worldMatrix:Object.freeze([...m])}:{})});
}
const modelText=(m:ReceiverModelEntry)=>m.handle.length+m.name.length+m.resource.length+m.geometryProvenance.length;
function strings(values:readonly string[]):readonly string[]{
  if(!Array.isArray(values)||values.some(v=>typeof v!=='string'||!v))throw Error('Invalid receiver prefix disclosure');
  return Object.freeze([...values]);
}

/** One immutable committed checkpoint plus bounded trusted pose deltas.
 * Lookups replay only explicitly recorded prefixes, never current server state
 * or interpolation. Queries do not consume events. A trusted controller calls
 * acknowledge only after the corresponding scene acceptance has committed;
 * production joint publication/acknowledgement wiring remains necessary.
 */
export class OriginalReceiverPrefixJournal implements ReceiverExternalSceneSource {
  private checkpoint:ReceiverExternalSceneSnapshot;
  private pending:ReceiverExternalPrefixDelta[]=[];
  private lastReceiptTick:number|undefined;
  readonly limits:Readonly<ReceiverPrefixJournalLimits>;
  constructor(initial:ReceiverExternalSceneSnapshot,limits:ReceiverPrefixJournalLimits){
    if(![limits.maxPrefixes,limits.maxChanges,limits.maxModels,limits.maxTextChars].every(n=>Number.isSafeInteger(n)&&n>0))throw Error('Invalid receiver prefix journal limits');
    this.limits=Object.freeze({...limits});validateReceiverScenePrefix(initial.prefix);
    if(typeof initial.provenance!=='string'||!initial.provenance)throw Error('Missing receiver prefix provenance');
    if(initial.models.length>limits.maxModels||initial.models.length>limits.maxChanges||initial.missing.length>limits.maxTextChars)throw Error('Receiver prefix journal budget requires resynchronization');
    const missing=strings(initial.missing);
    const text=initial.models.reduce((n,m)=>n+modelText(m),initial.provenance.length+missing.reduce((n,s)=>n+s.length,0));
    if(text>limits.maxTextChars)throw Error('Receiver prefix journal text budget requires resynchronization');
    const models=initial.models.map(copyEntry);
    if(new Set(models.map(m=>m.handle)).size!==models.length)throw Error('Duplicate receiver checkpoint handle');
    this.checkpoint=Object.freeze({prefix:prefixCopy(initial.prefix),models:Object.freeze(models),missing,provenance:initial.provenance});
    this.lastReceiptTick=initial.prefix.kind==='receipt'?initial.prefix.tick:undefined;
  }
  record(delta:ReceiverExternalPrefixDelta):void {
    validateReceiverScenePrefix(delta.prefix);
    const last=this.pending.at(-1)?.prefix??this.checkpoint.prefix;
    if(delta.prefix.sceneGeneration!==last.sceneGeneration||compare(delta.prefix,last)<=0)throw Error('Receiver prefix journal order mismatch');
    if(delta.prefix.kind==='receipt'&&this.lastReceiptTick!==undefined&&delta.prefix.tick<=this.lastReceiptTick)throw Error('Receiver prefix receipt order mismatch');
    if(!delta.provenance||typeof delta.provenance!=='string')throw Error('Missing receiver prefix provenance');
    if(this.pending.length>=this.limits.maxPrefixes||delta.upsert.length+delta.remove.length>this.limits.maxChanges||delta.missing.length>this.limits.maxTextChars)throw Error('Receiver prefix journal budget requires resynchronization');
    const changes=this.checkpoint.models.length+this.pending.reduce((n,d)=>n+d.upsert.length+d.remove.length,0)+delta.upsert.length+delta.remove.length;
    if(changes>this.limits.maxChanges)throw Error('Receiver prefix journal budget requires resynchronization');
    const missing=strings(delta.missing),remove=strings(delta.remove);
    let text=this.checkpoint.models.reduce((n,m)=>n+modelText(m),this.checkpoint.provenance.length+this.checkpoint.missing.reduce((n,s)=>n+s.length,0));
    for(const d of [...this.pending,delta])text+=d.provenance.length+d.missing.reduce((n,s)=>n+s.length,0)+d.remove.reduce((n,s)=>n+s.length,0)+d.upsert.reduce((n,m)=>n+modelText(m),0);
    if(text>this.limits.maxTextChars)throw Error('Receiver prefix journal text budget requires resynchronization');
    const upsert=delta.upsert.map(copyEntry),ids=new Set(upsert.map(m=>m.handle));
    if(ids.size!==upsert.length||new Set(remove).size!==remove.length||remove.some(id=>ids.has(id)))throw Error('Duplicate receiver prefix change');
    // Check the resulting inventory before publishing the event.
    const handles=new Set(this.checkpoint.models.map(m=>m.handle));
    for(const d of [...this.pending,{upsert,remove}]){
      for(const id of d.remove)if(!handles.delete(id))throw Error('Unknown receiver prefix disposal');
      for(const model of d.upsert)handles.add(model.handle);
      if(handles.size>this.limits.maxModels)throw Error('Receiver prefix model budget requires resynchronization');
    }
    this.pending.push(Object.freeze({prefix:prefixCopy(delta.prefix),upsert:Object.freeze(upsert),remove,missing,provenance:delta.provenance}));
    if(delta.prefix.kind==='receipt')this.lastReceiptTick=delta.prefix.tick;
  }
  snapshotAt(prefix:ReceiverScenePrefix):ReceiverExternalSceneSnapshot {
    validateReceiverScenePrefix(prefix);
    if(prefix.sceneGeneration!==this.checkpoint.prefix.sceneGeneration||compare(prefix,this.checkpoint.prefix)<0)throw Error('Receiver historical prefix unavailable');
    if(sameReceiverScenePrefix(prefix,this.checkpoint.prefix))return this.checkpoint;
    const index=this.pending.findIndex(d=>sameReceiverScenePrefix(d.prefix,prefix));
    if(index<0)throw Error('Receiver historical prefix unavailable');
    const models=new Map(this.checkpoint.models.map(m=>[m.handle,m]));
    for(let i=0;i<=index;i++){
      const delta=this.pending[i];for(const id of delta.remove)models.delete(id);
      for(const model of delta.upsert)models.set(model.handle,model);
    }
    const delta=this.pending[index];
    return Object.freeze({prefix:delta.prefix,models:Object.freeze([...models.values()]),missing:delta.missing,provenance:delta.provenance});
  }
  acknowledge(prefix:ReceiverScenePrefix):void {
    const next=this.snapshotAt(prefix);
    // State reconstructed before publication; no provider/RNG mutation occurs
    // in snapshotAt, including failed acceptance and failed acknowledgement.
    this.checkpoint=next;this.pending=this.pending.filter(d=>compare(d.prefix,prefix)>0);
  }
  debugState():Readonly<{checkpoint:ReceiverScenePrefix;pending:readonly ReceiverScenePrefix[]}>{
    return Object.freeze({checkpoint:this.checkpoint.prefix,pending:Object.freeze(this.pending.map(d=>d.prefix))});
  }
}
