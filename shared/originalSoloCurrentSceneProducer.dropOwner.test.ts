import {describe,it,expect,vi} from 'vitest';
import {createOriginalSoloCurrentSceneLease,type OriginalSoloCurrentSceneProducerOptions} from './originalSoloCurrentSceneProducer';

function options(owner:unknown):OriginalSoloCurrentSceneProducerOptions {
 return {sourceScale:.02,maxCapturedBlasts:8,maxCapturedProjectiles:8,
  environment:{maxCommands:32,maxOutcomes:32,maxModels:128,maxTextChars:65536},
  controller:{model:{eyeHeight:1,goodyBspWorld:1,maxModels:128,maxPickups:16,dropRequestOwner:owner as object},transient:{maxModels:32,maxActors:32,maxShaders:32},maxEffects:128},
  createBackends:vi.fn(()=>{throw Error('unexpected acquisition');}),goodyAt:vi.fn(()=>null),snapshotAt:vi.fn(()=>{throw Error('unexpected snapshot');})};
}
describe('CURRENT captures drop request owner configuration',()=>{
 it.each([null,1,'owner',true,()=>{}])('rejects invalid owner before resource acquisition: %s',owner=>{
  const input=options(owner);expect(()=>createOriginalSoloCurrentSceneLease(input)).toThrow('drop request owner');expect(input.createBackends).not.toHaveBeenCalled();expect(input.goodyAt).not.toHaveBeenCalled();expect(input.snapshotAt).not.toHaveBeenCalled();
 });
 it.each([undefined,Object.freeze({})])('accepts legacy and explicit owner configuration without acquiring resources',owner=>{
  const input=options(owner),lease=createOriginalSoloCurrentSceneLease(input);lease.release();lease.release();expect(input.createBackends).not.toHaveBeenCalled();
 });
});
