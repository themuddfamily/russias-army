import type {OriginalSoldier} from './originalSoldier';

export interface OriginalSoloModelPresentationState {
 readonly allocated:number;
 readonly active:readonly Readonly<{actorId:string;handle:string}>[];
 readonly corpses:readonly Readonly<{sequence:number;handle:string}>[];
 readonly fifo:readonly string[];
}

/** One human receiver's scene-generation GI identity owner. Birth grounding,
 * native clone transforms and gun membership policy are separate adapters.
 * Source fade retirement retains the 76th callback: bon608 / phase3008.
 * This pool does not reset bones or dispose a model merely because its actor
 * leaves; guns owned by the rig retain their identity through FIFO reuse.
 */
export class OriginalSoloModelPresentation {
 private readonly all=new Set<OriginalSoldier>();
 private readonly actors=new Map<string,OriginalSoldier>();
 private readonly corpses=new Map<number,OriginalSoldier>();
 private readonly fifo:OriginalSoldier[]=[];
 constructor(readonly maxModels=64){
  if(!Number.isSafeInteger(maxModels)||maxModels<1)throw Error('Invalid Solo model presentation budget');
 }
 private validateActor(actorId:string):void {
  if(typeof actorId!=='string'||!actorId)throw Error('Invalid Solo presentation actor');
  if(this.actors.has(actorId))throw Error('Solo presentation actor already bound');
 }
 /** Initial scene models are admitted once. No active/corpse/pool alias may be
  * registered under another actor; legitimate reuse goes through acquire(). */
 register(actorId:string,rig:OriginalSoldier):void {
  this.validateActor(actorId);
  if(this.all.has(rig))throw Error('Solo presentation model already owned');
  if(this.all.size>=this.maxModels)throw Error('Solo presentation model budget requires scene reset');
  this.all.add(rig);this.actors.set(actorId,rig);
 }
 acquire(actorId:string,factory:()=>OriginalSoldier):OriginalSoldier {
  this.validateActor(actorId);
  if(this.fifo.length){const rig=this.fifo.shift()!;this.actors.set(actorId,rig);return rig;}
  // Check before factory invocation so exhaustion cannot create an orphan GI.
  if(this.all.size>=this.maxModels)throw Error('Solo presentation model budget requires scene reset');
  const rig=factory();
  if(this.all.has(rig))throw Error('Solo presentation factory returned an owned model');
  this.all.add(rig);this.actors.set(actorId,rig);return rig;
 }
 active(actorId:string):OriginalSoldier|undefined {return this.actors.get(actorId);}
 /** Ownership only: the dispatcher applies source die/fade constructor pose.
  * A canonical respawn can acquire another model while this one still fades. */
 bindCorpse(actorId:string,sequence:number):OriginalSoldier {
  if(!Number.isSafeInteger(sequence)||sequence<1)throw Error('Invalid Solo corpse sequence');
  if(this.corpses.has(sequence))throw Error('Solo corpse sequence already bound');
  const rig=this.actors.get(actorId);if(!rig)throw Error('Solo presentation actor missing');
  this.actors.delete(actorId);this.corpses.set(sequence,rig);return rig;
 }
 corpse(sequence:number):OriginalSoldier|undefined {return this.corpses.get(sequence);}
 /** Mirrors omit a fade only after its strict bon>600 callback. Capture the
  * final removed pose before returning the handle FIFO, rather than preserving
  * its last visible bon600 / phase3000. No source reset() is performed here. */
 retireMissing(retainedSequences:ReadonlySet<number>):void {
  for(const sequence of this.corpses.keys())if(!retainedSequences.has(sequence))this.retire(sequence);
 }
 /** Exact ordered fade event, used before subsequent accepted actor births. */
 retire(sequence:number):void {
  const rig=this.corpses.get(sequence);if(!rig)throw Error('Solo corpse sequence missing');
  rig.setSourceMotionTime(3008);rig.group.visible=false;rig.group.removeFromParent();
  this.corpses.delete(sequence);this.fifo.push(rig);
 }
 freezeState():Readonly<OriginalSoloModelPresentationState> {
  return Object.freeze({allocated:this.all.size,
   active:Object.freeze([...this.actors].map(([actorId,rig])=>Object.freeze({actorId,handle:rig.group.uuid}))),
   corpses:Object.freeze([...this.corpses].map(([sequence,rig])=>Object.freeze({sequence,handle:rig.group.uuid}))),
   fifo:Object.freeze(this.fifo.map(rig=>rig.group.uuid))});
 }
 debugState():Readonly<OriginalSoloModelPresentationState> {return this.freezeState();}
 /** Actual scene reset only. The inventory deduplicates identities so each
  * skeleton is disposed once, regardless of its final active/fade/pool state. */
 releaseclear():void {
  const inventory=[...this.all];
  this.all.clear();this.actors.clear();this.corpses.clear();this.fifo.length=0;
  const errors:unknown[]=[];
  for(const rig of inventory)try{rig.dispose();}catch(error){errors.push(error);}
  if(errors.length)throw new AggregateError(errors,'Solo model presentation cleanup failed');
 }
}
