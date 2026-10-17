import {describe,expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {OriginalDoorWorld,type OriginalDoorTracks} from './originalDoorWorld';
import type {OriginalSceneData} from './originalSceneGeometry';

const identity=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
const data:OriginalSceneData={nodes:[
 {name:'floor',parent:'World',resource:'floor',matrix:identity,visibility:1,shader:'floor'},
 {name:'door panel',parent:'World',resource:'panel',matrix:identity,visibility:1,shader:'door'},
],meshes:[
 {resource:'floor',part:0,positions:[[-10,-10,0],[10,-10,0],[10,10,0],[-10,10,0]],faces:[[0,1,2],[0,2,3]],normals:[],tex_coords:[]},
 {resource:'panel',part:0,positions:[[0,-2,0],[0,2,0],[0,2,3],[0,-2,3]],faces:[[0,1,2],[0,2,3]],normals:[],tex_coords:[]},
]};
const tracks:OriginalDoorTracks={version:1,doors:[{name:'door panel',motionName:'panel-Key',baseMatrix:identity,keys:[
 {time:0,position:[0,0,0],quaternion_xyzw:[0,0,0,1],scale:[1,1,1]},
 {time:1,position:[0,0,0],quaternion_xyzw:[0,0,Math.SQRT1_2,Math.SQRT1_2],scale:[1,1,1]},
]}]};
function world(){return new OriginalDoorWorld(data,1,tracks);}
function actual(map:'barrack'|'woodland'){
 const source=JSON.parse(readFileSync(new URL(`../public/assets/original-scenes/${map}/scene.json`,import.meta.url),'utf8')) as OriginalSceneData;
 // Woodland's decoded export has no door tracks or door actors.
 const motion:OriginalDoorTracks=map==='barrack'?JSON.parse(readFileSync(new URL('../public/assets/original-scenes/barrack/doors.json',import.meta.url),'utf8')) as OriginalDoorTracks:{version:1,doors:[]};
 return new OriginalDoorWorld(source,1.72/85,motion);
}

describe('prepared direct-fork door adoption',()=>{
 it('captures independent candidate state and publishes exact geometry through the existing facade',()=>{
  const owner=world(),facade=owner.geometry,candidate=owner.fork();candidate.open('door panel',10);candidate.update(10.5);
  const states=candidate.getStates(),matrix=candidate.getModelMatrix('door panel'),token=candidate.movementSnapshotIdentity,page=candidate.fixedTrianglePage(0);
  const stage=owner.prepareAdopt(candidate);candidate.reset(99);
  expect(owner.getStates()[0].openedAt).toBeNull();expect(owner.updatedAtSeconds).toBe(0);
  // These spies prove publication does not call the normal rebuilding/mutation paths.
  const update=vi.spyOn(owner,'update'),reconcile=vi.spyOn(owner,'reconcile'),reset=vi.spyOn(owner,'reset');
  stage.commit();stage.commit();stage.rollback();
  expect(update).not.toHaveBeenCalled();expect(reconcile).not.toHaveBeenCalled();expect(reset).not.toHaveBeenCalled();
  expect(owner.geometry).toBe(facade);expect(owner.getStates()).toEqual(states);expect(owner.getModelMatrix('door panel')).toEqual(matrix);
  expect(owner.updatedAtSeconds).toBe(10.5);expect(owner.movementSnapshotIdentity).toBe(token);expect(owner.fixedTrianglePage(0)).toEqual(page);
  candidate.open('door panel',100);expect(owner.getStates()).toEqual(states);
 });
 it('rolls back without publishing and unlocks the same owner for a retry',()=>{
  const owner=world(),candidate=owner.fork(),token=owner.movementSnapshotIdentity;candidate.open('door panel',2);
  const stage=owner.prepareAdopt(candidate);stage.rollback();stage.rollback();stage.commit();
  expect(owner.getStates()[0].openedAt).toBeNull();expect(owner.movementSnapshotIdentity).toBe(token);
  owner.prepareAdopt(candidate).commit();expect(owner.getStates()[0].openedAt).toBe(2);
 });
 it('rejects all target mutators while prepared while leaving queries and candidate writes available',()=>{
  const owner=world(),candidate=owner.fork(),stage=owner.prepareAdopt(candidate);
  for(const mutate of [()=>owner.update(0),()=>owner.reset(),()=>owner.open('unknown',0),()=>owner.setOpenedAt('unknown',0),()=>owner.reconcile([],0),()=>owner.shiftClock(0),()=>owner.triggerNearby({x:0,y:0,z:0},0),()=>owner.prepareAdopt(candidate)])expect(mutate).toThrow('adoption active');
  expect(owner.getStates()).toHaveLength(1);expect(owner.getModelMatrix('door panel')).toEqual(identity);expect(owner.fork().movementSnapshotIdentity).toBe(owner.movementSnapshotIdentity);
  candidate.update(1);stage.rollback();owner.update(1);expect(owner.updatedAtSeconds).toBe(1);
 });
 it('rejects foreign, sibling, grandchild and already-consumed candidates',()=>{
  const owner=world(),direct=owner.fork(),sibling=owner.fork(),grandchild=direct.fork();
  expect(()=>owner.prepareAdopt(world())).toThrow();expect(()=>direct.prepareAdopt(sibling)).toThrow();expect(()=>owner.prepareAdopt(grandchild)).toThrow();
  owner.prepareAdopt(direct).commit();expect(()=>owner.prepareAdopt(direct)).toThrow();expect(()=>owner.prepareAdopt(sibling)).toThrow();
  expect(()=>owner.prepareAdopt(owner)).toThrow();
 });
 it.each(['update','shift','reset','open','timestamp','reconcile','trigger'] as const)('rejects forks made before owner %s changes',kind=>{
  const owner=world();if(kind==='timestamp')owner.open('door panel',0);const candidate=owner.fork();
  if(kind==='update')owner.update(1);else if(kind==='shift')owner.shiftClock(1);else if(kind==='reset')owner.reset();else if(kind==='open')owner.open('door panel',0);else if(kind==='timestamp')owner.setOpenedAt('door panel',1);else if(kind==='reconcile')owner.reconcile([{name:'door panel',openedAt:0}],0);else owner.triggerNearby({x:0,y:0,z:0},1);
  expect(()=>owner.prepareAdopt(candidate)).toThrow('stale');
 });
 it('rejects public seed construction with a different immutable template',()=>{
  const owner=world();expect(()=>new OriginalDoorWorld({...data},1,tracks,owner)).toThrow('template mismatch');
  expect(()=>new OriginalDoorWorld(data,2,tracks,owner)).toThrow('template mismatch');expect(()=>new OriginalDoorWorld(data,1,{...tracks},owner)).toThrow('template mismatch');
  const manuallySeeded=new OriginalDoorWorld(data,1,tracks,owner);expect(manuallySeeded.movementSnapshotIdentity).toBe(owner.movementSnapshotIdentity);expect(()=>owner.prepareAdopt(manuallySeeded)).toThrow();
 });
 it('preserves collider snapshot identity for clock-only and visible-only adoption',()=>{
  const owner=world(),closed=owner.movementSnapshotIdentity,clock=owner.fork();clock.update(10);owner.prepareAdopt(clock).commit();expect(owner.movementSnapshotIdentity).toBe(closed);
  owner.open('door panel',10);const open=owner.movementSnapshotIdentity,visible=owner.fork();visible.update(10.5);owner.prepareAdopt(visible).commit();expect(owner.movementSnapshotIdentity).toBe(open);expect(owner.getStates()[0].elapsedSeconds).toBe(.5);
 });
 it('adopts decoded Barrack opening: immediate body removal and later transformed visible rays',()=>{
  const owner=actual('barrack'),facade=owner.geometry,candidate=owner.fork(),scale=1.72/85;
  const from={x:4.503506146588435,y:-2.0838854396722246e-7,z:-33.70871953602075},to={x:5.675270842049921,y:-2.1352260918803566e-7,z:-33.70887581017229};
  const origin={...from,y:1},direction={x:.9999999911066889,y:0,z:-.0001333664947851998};
  expect(owner.movePlayer(from,to,25*scale,50*scale).collided).toBe(true);candidate.open('door open 28',10);owner.prepareAdopt(candidate).commit();
  expect(owner.geometry).toBe(facade);expect(owner.movePlayer(from,to,25*scale,50*scale).collided).toBe(false);expect(owner.raycast(origin,direction,1.17176471)?.id).toBe('door open 28');
  const token=owner.movementSnapshotIdentity,animated=owner.fork();animated.update(12);owner.prepareAdopt(animated).commit();expect(owner.movementSnapshotIdentity).toBe(token);expect(owner.raycast(origin,direction,1.17176471)?.id).not.toBe('door open 28');
 });
 it('adopts the decoded Woodland empty door registry without replacing fixed collider pages',()=>{
  const owner=actual('woodland'),candidate=owner.fork(),token=owner.movementSnapshotIdentity,page=owner.fixedTrianglePage(0);candidate.update(17);candidate.shiftClock(3);
  owner.prepareAdopt(candidate).commit();expect(owner.getStates()).toEqual([]);expect(owner.updatedAtSeconds).toBe(20);expect(owner.movementSnapshotIdentity).toBe(token);expect(owner.fixedTrianglePage(0)).toEqual(page);
 });
});
