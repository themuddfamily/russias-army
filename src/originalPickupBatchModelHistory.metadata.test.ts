import {describe,expect,it} from 'vitest';
import {OriginalPickupBatchModelHistory} from './originalPickupBatchModelHistory';
import {OriginalReceiverModelWorld,type ReceiverModelBackend} from '../shared/originalReceiverModelWorld';

const source=()=>new OriginalPickupBatchModelHistory({observer:'A',lifeGeneration:1,root:{key:'empty',version:0,count:0,pageCount:0,highWaterId:0}});
const prefix={kind:'callback' as const,sceneGeneration:1,callback:1};

describe('explicit metadata-only paged model transactions',()=>{
 it('requires callback staging by default and allows only null pickup reads in the explicit mode',()=>{
  const history=source();expect(()=>history.begin()).toThrow(/staged callback/);
  const tx=history.begin(true),base=history.history;
  expect(tx.readPickup(0)).toBeNull();expect(()=>tx.readPickup(1)).toThrow(/not resident/);
  expect(()=>tx.remove({id:1,handle:'gun',weapon:'rifle',position:{x:0,y:0,z:0}})).toThrow(/staged callback/);
  tx.assertPrefix(prefix);expect(tx.prepareHistory()).toBe(base);
  const publish=tx.preparePublish();expect(history.history).toBe(base);publish();
  expect(history.history).toBe(base);expect(()=>publish()).toThrow(/closed/);
  history.begin(true).rollback();
 });
 it('owns admission until publication or rollback and invalidates its operands after either',()=>{
  const history=source(),tx=history.begin(true),epoch=tx.operandEpoch();
  tx.validateEpoch(epoch);expect(()=>history.begin(true)).toThrow(/already active/);
  tx.prepareHistory();const publish=tx.preparePublish();expect(()=>history.begin(true)).toThrow(/already active/);
  tx.rollback();expect(()=>publish()).toThrow(/closed/);expect(()=>tx.validateEpoch(epoch)).toThrow(/unavailable/);
  const retry=history.begin(true);expect(()=>retry.validateEpoch(epoch)).toThrow(/Stale/);retry.rollback();
 });
 it('exposes the prepared registry with unchanged history through the actual model bank',()=>{
  const history=source(),pose={position:{x:0,y:0,z:0},yaw:0,phase:0,scale:1};
  const backend:ReceiverModelBackend={cloneGI:()=>({pose,geometryProvenance:'declared-GI'}),cloneGun:()=>({pose,geometryProvenance:'declared-gun'}),
   heldGunPose:()=>pose,sphere:()=>({bspWorld:1,provenance:'declared-resource'}),reparentGunMembership:value=>value,dropYaw:()=>0,
   nearestDetailedDownward:()=>({hit:null,coverage:{complete:true,missing:[],provenance:'declared-empty-query'}})};
  const world=new OriginalReceiverModelWorld(backend,{sceneGeneration:1,sourceScale:.02,eyeHeight:1,goodyBspWorld:1,maxModels:8,maxPickups:16},
   {snapshotAt:p=>({prefix:p,models:[],missing:[],provenance:'declared-empty-scene'})},history);
  const tx=world.begin(true);tx.advanceExternalCallback(1);
  expect(()=>tx.preparedActorRegistry!()).toThrow(/unavailable/);
  const publish=tx.prepareCommit(),registry=tx.preparedActorRegistry!();
  expect(registry.pickupHistory).toEqual(history.history);expect(registry.prefix).toEqual(prefix);
  expect(()=>tx.freezeActorRegistry()).toThrow();publish();
  expect(world.freezeActorRegistry()).toEqual(registry);expect(()=>tx.preparedActorRegistry!()).toThrow(/unavailable/);
  world.begin(true).rollback();
 });
});
