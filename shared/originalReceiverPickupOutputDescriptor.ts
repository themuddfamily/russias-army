import type {ReceiverPickupOutputDescriptor} from './originalReceiverPickupOutput';
import type {ReceiverActorRegistrySnapshot} from './originalReceiverActorRegistry';
import {sameReceiverScenePrefix,validateReceiverScenePrefix} from './originalReceiverPrefix';

/** Structural binding only; the cohort authenticates the exact issuer object. */
export function assertReceiverPickupOutputDescriptorRegistry(output:ReceiverPickupOutputDescriptor,registry:ReceiverActorRegistrySnapshot,
 clock:{callback:number;receiptTick?:number}):void {
 if(!output||!registry)throw Error('Missing streamed pickup output registry');
 const prefix=output.prefix,history=registry.pickupHistory;
 if(!prefix)throw Error('Missing streamed pickup output prefix');
 validateReceiverScenePrefix(prefix);
 if(!history||!registry.prefix||!sameReceiverScenePrefix(prefix,registry.prefix)
  ||registry.sceneGeneration!==prefix.sceneGeneration||registry.callback!==prefix.callback||prefix.callback!==clock.callback
  ||prefix.kind==='receipt'&&prefix.tick!==clock.receiptTick
  ||output.observer!==history.observer||output.lifeGeneration!==history.lifeGeneration
  ||output.rootKey!==history.root.key||output.rootVersion!==history.root.version
  ||typeof output.observer!=='string'||!output.observer.length||output.observer.length>256
  ||typeof output.rootKey!=='string'||!output.rootKey.length||output.rootKey.length>128||!/^[\w-]+$/.test(output.rootKey)
  ||![output.lifeGeneration,output.rootVersion,output.transitionCount,output.loadoutCount].every(n=>Number.isSafeInteger(n)&&n>=0)
  ||!Number.isSafeInteger(output.chunkCount)||output.chunkCount<1||registry.pickups.length!==0)throw Error('Streamed pickup output registry mismatch');
}
