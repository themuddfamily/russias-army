import type {ReceiverModelEntry} from './originalReceiverModelWorld';
import type {ReceiverActorRegistrySnapshot} from './originalReceiverActorRegistry';

/** A receipt at the same callback is a distinct scene prefix. These values
 * come from trusted recorded deliveries, not client-supplied mesh geometry. */
export type ReceiverScenePrefix = Readonly<{sceneGeneration:number;callback:number} & (
  {kind:'callback'}|{kind:'receipt';tick:number}
)>;
export interface ReceiverExternalSceneSnapshot {
  readonly prefix:ReceiverScenePrefix;
  readonly models:readonly ReceiverModelEntry[];
  readonly missing:readonly string[];
  readonly provenance:string;
}
export interface ReceiverExternalSceneSource {
  /** Pure lookup/reconstruction: rejection must not consume events, advance
   * physics or replace the source's committed checkpoint. */
  snapshotAt(prefix:ReceiverScenePrefix,actors?:ReceiverActorRegistrySnapshot):ReceiverExternalSceneSnapshot;
}
export function sameReceiverScenePrefix(a:ReceiverScenePrefix,b:ReceiverScenePrefix):boolean {
  return a.sceneGeneration===b.sceneGeneration&&a.callback===b.callback&&a.kind===b.kind
    &&(a.kind==='callback'||b.kind==='receipt'&&a.tick===b.tick);
}
export function validateReceiverScenePrefix(prefix:ReceiverScenePrefix):void {
  if(!Number.isSafeInteger(prefix.sceneGeneration)||prefix.sceneGeneration<0
    ||!Number.isSafeInteger(prefix.callback)||prefix.callback<0
    ||!['callback','receipt'].includes(prefix.kind)
    ||prefix.kind==='receipt'&&(!Number.isSafeInteger(prefix.tick)||prefix.tick<0))throw Error('Invalid receiver scene prefix');
}
