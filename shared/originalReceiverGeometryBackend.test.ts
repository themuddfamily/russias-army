import {describe,expect,it} from 'vitest';
import {OriginalReceiverModelWorld,type ReceiverModelBackend,type ReceiverModelEntry,type ReceiverModelPose} from './originalReceiverModelWorld';
import {OriginalRemoteView} from './originalRemoteView';
import {createOriginalReceiverGeometryBackend} from './originalReceiverGeometryBackend';
import {ORIGINAL_RECEIVER_SCENE_LAYERS,type OriginalReceiverRayCoverage,type OriginalReceiverRayModel} from './originalReceiverSceneRay';

const pose=(y:number):ReceiverModelPose=>({position:{x:0,y,z:0},yaw:0,phase:0,scale:1});
const floor:ReceiverModelEntry={handle:'floor',name:'floor',resource:'floor',group:'scene',kind:'fixed',inWorld:true,pose:pose(8),geometryProvenance:'fixture-flat-mesh'};
const lifecycle:Omit<ReceiverModelBackend,'nearestDetailedDownward'>={
  cloneGI:()=>({pose:pose(20),geometryProvenance:'fixture-flat-mesh'}),
  cloneGun:()=>({pose:pose(30),geometryProvenance:'fixture-flat-mesh'}),
  sphere:()=>({bspWorld:2,provenance:'declared-resource'}),heldGunPose:gi=>gi.pose,
  reparentGunMembership:inWorld=>inWorld,dropYaw:()=>0,
};
const mesh=(model:Readonly<ReceiverModelEntry>):OriginalReceiverRayModel=>({
  handle:model.handle,layer:model.kind==='gi'?'live-gi':'fixed',inWorld:model.inWorld,
  groupAncestry:[],geometryProvenance:model.geometryProvenance,
  positions:[[-2,0,-2],[2,0,-2],[0,0,2]],faces:[[0,1,2]],sidedness:'double',
  worldMatrix:[1,0,0,0,0,1,0,0,0,0,1,0,model.pose.position.x,model.pose.position.y,model.pose.position.z,1],
});
const coverage=(callback:number):OriginalReceiverRayCoverage=>({sceneGeneration:7,callback,
  expectedHandles:['floor','gi:baddy1'],accountedLayers:ORIGINAL_RECEIVER_SCENE_LAYERS,unresolved:[]});
const backend=(coverageAt=coverage,resolveModel:(model:Readonly<ReceiverModelEntry>,callback:number)=>OriginalReceiverRayModel=mesh)=>createOriginalReceiverGeometryBackend(lifecycle,{
  sceneGeneration:7,coverageAt:(callback,prefix,actorRegistry)=>({...coverageAt(callback),...(prefix?{prefix}:{}),...(actorRegistry?{actorRegistry}:{})}),resolveModel,provenance:'controlled-complete-triangle-fixture',budget:{maxModels:8,maxTriangles:8,maxVertices:24},
});

describe('receiver ledger and actual triangle-query composition',()=>{
  it('grounds an accepted birth with real triangles at its receipt prefix while retaining the received target',()=>{
    const seen:{callback:number;handle:string;inWorld:boolean}[]=[];
    const b=backend(coverage,(model,callback)=>{seen.push({callback,handle:model.handle,inWorld:model.inWorld});return mesh(model);});
    const world=new OriginalReceiverModelWorld(b,{eyeHeight:1,sourceScale:.02,goodyBspWorld:2,sceneGeneration:7,maxModels:8,maxPickups:4});
    world.setExternalModels([floor]);const view=new OriginalRemoteView(0,{},'source-callback',world);
    expect(view.recordSent({tick:0,sentAt:0,targets:[{id:'a',position:{x:0,y:10,z:0},yaw:0,motionTime:440,alive:true,weapon:'rifle'}]})).toEqual({ok:true});
    expect(view.accept({callbacks:3,receipts:[{tick:0,callbacks:3}]},100)).toEqual({ok:true});
    expect(seen).toEqual([{callback:3,handle:'floor',inWorld:true},{callback:3,handle:'gi:baddy1',inWorld:true}]);
    expect(view.freeze()[0]).toMatchObject({position:{x:0,y:9,z:0},motionTime:0,birthCoverage:{complete:true}});
    expect(view.accept({callbacks:12,receipts:[]},400)).toEqual({ok:true});
    expect(view.freeze()[0].position.y).toBeCloseTo(10,12);
    expect(seen).toHaveLength(2);
  });
  it('rejects wrong callback or inventory before resolving geometry',()=>{
    let calls=0;const resolve=(model:Readonly<ReceiverModelEntry>)=>{calls++;return mesh(model);};
    expect(()=>backend(callback=>({...coverage(callback),callback:callback+1}),resolve).nearestDetailedDownward({x:0,y:10,z:0},[floor],3,7)).toThrow('prefix mismatch');
    expect(()=>backend(coverage,resolve).nearestDetailedDownward({x:0,y:10,z:0},[floor],3,7)).toThrow('ledger mismatch');
    expect(()=>backend(coverage,resolve).nearestDetailedDownward({x:0,y:10,z:0},[floor],3,8)).toThrow('generation mismatch');
    expect(calls).toBe(0);
  });
  it('rejects geometry that revives an out-of-world ledger model',()=>{
    const b=backend(callback=>({...coverage(callback),expectedHandles:['floor']}),model=>({...mesh(model),inWorld:true}));
    expect(()=>b.nearestDetailedDownward({x:0,y:10,z:0},[{...floor,inWorld:false}],3,7)).toThrow('identity mismatch');
  });
  it('preserves inherited lifecycle methods and rejects false geometry layer declarations',()=>{
    const inherited:Omit<ReceiverModelBackend,'nearestDetailedDownward'>=Object.create(lifecycle);
    const b=createOriginalReceiverGeometryBackend(inherited,{sceneGeneration:7,coverageAt:coverage,resolveModel:mesh,
      provenance:'fixture',budget:{maxModels:8,maxTriangles:8,maxVertices:24}});
    expect(b.cloneGI('baddy1').pose.position.y).toBe(20);
    const wrong=backend(callback=>({...coverage(callback),expectedHandles:['floor']}),model=>({...mesh(model),layer:'projectile'}));
    expect(()=>wrong.nearestDetailedDownward({x:0,y:10,z:0},[floor],3,7)).toThrow('layer mismatch');
  });
});
