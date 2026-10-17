import {describe,it,expect} from 'vitest';
import {createOriginalDoorWorld,type OriginalDoorTracks} from './originalDoorWorld';
import type {OriginalSceneData,OriginalSceneMesh} from './originalSceneGeometry';

const I=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
function mesh(resource:string,world:number[][],faces:number[][]):OriginalSceneMesh {return {resource,part:0,positions:world.map(([x,y,z])=>[x,-z,y]),faces,normals:[],tex_coords:[]};}
const floor=mesh('floor',[[-10,0,-10],[10,0,-10],[10,0,10],[-10,0,10]],[[0,2,1],[0,3,2]]);
const panel=mesh('door open page',[[0,0,-2],[0,0,2],[0,3,2],[0,3,-2]],[[0,1,2],[0,2,3]]);
const data:OriginalSceneData={nodes:[{name:'floor',parent:'World',resource:'floor',matrix:I,visibility:1,shader:'floor'},{name:'door open page',parent:'World',resource:'door open page',matrix:I,visibility:1,shader:'door'}],meshes:[floor,panel]};
const tracks:OriginalDoorTracks={version:1,doors:[{name:'door open page',motionName:'door open page-Key',baseMatrix:I,keys:[
 {time:0,position:[0,0,0],scale:[1,1,1],quaternion_xyzw:[0,0,0,1]},
 {time:1,position:[0,0,0],scale:[1,1,1],quaternion_xyzw:[0,0,Math.SQRT1_2,Math.SQRT1_2]},
 {time:2,position:[0,0,0],scale:[1,1,1],quaternion_xyzw:[0,0,Math.SQRT1_2,Math.SQRT1_2]},
]}]};

describe('door movement triangle pages',()=>{
 it('pages the current closed-door collision population through the stable facade',()=>{
  const world=createOriginalDoorWorld(data,1,tracks),facade=world.geometry,token=world.movementSnapshotIdentity;
  const first=facade.fixedTrianglePage(0,2),last=facade.fixedTrianglePage(first.nextOffset,2);
  expect(first.total).toBe(world.triangleCount);expect(first.total).toBe(4);
  expect(first.complete).toBe(false);expect(last.complete).toBe(true);expect(last.revision).toBe(first.revision);
  expect([...first.triangles,...last.triangles].map(v=>v.sourceIndex)).toEqual([0,1,2,3]);
  expect(new Set([...first.triangles,...last.triangles].map(v=>v.model))).toEqual(new Set(['floor','door open page']));
  expect(world.fixedTrianglePage(0).triangles).toHaveLength(4);
  expect(world.movementSnapshotIdentity).toBe(token);expect(world.fork().movementSnapshotIdentity).toBe(token);
  expect(world.fork().fixedTrianglePage(0).revision).toBe(first.revision);
  expect(Object.isFrozen(first)).toBe(true);expect(Object.isFrozen(first.triangles[0].triangle[0])).toBe(true);
 });

 it('changes both coherent tokens on collision replacement and restores the initial reset snapshot',()=>{
  const world=createOriginalDoorWorld(data,1,tracks),facade=world.geometry,closedToken=world.movementSnapshotIdentity,closed=world.fixedTrianglePage(0);
  world.open('door open page',10);const openToken=world.movementSnapshotIdentity,open=facade.fixedTrianglePage(0);
  expect(world.geometry).toBe(facade);expect(openToken).not.toBe(closedToken);expect(open.revision).not.toBe(closed.revision);
  expect(open.total).toBe(2);expect(open.triangles.every(v=>v.model==='floor')).toBe(true);
  expect(closed.total).toBe(4);expect(closed.triangles.some(v=>v.model==='door open page')).toBe(true);
  world.reconcile([],11);const replacedToken=world.movementSnapshotIdentity,replaced=world.fixedTrianglePage(0);
  expect(replacedToken).not.toBe(openToken);expect(replaced.revision).not.toBe(open.revision);expect(replaced.total).toBe(4);
  expect(replaced.triangles).toEqual(closed.triangles);
  world.reset();expect(world.movementSnapshotIdentity).toBe(closedToken);expect(world.fixedTrianglePage(0).revision).toBe(closed.revision);
 });

 it('keeps movement page/revision stable while visible opening animation and timestamp corrections change',()=>{
  const world=createOriginalDoorWorld(data,1,tracks);world.open('door open page',10);
  const token=world.movementSnapshotIdentity,page=world.fixedTrianglePage(0),visible=world.getModelMatrix('door open page');
  world.update(10.5);expect(world.getModelMatrix('door open page')).not.toEqual(visible);
  expect(world.movementSnapshotIdentity).toBe(token);expect(world.fixedTrianglePage(0)).toEqual(page);
  world.setOpenedAt('door open page',10.25);world.reconcile([{name:'door open page',openedAt:10.25}],11);
  expect(world.movementSnapshotIdentity).toBe(token);expect(world.fixedTrianglePage(0).revision).toBe(page.revision);
  expect(world.fixedTrianglePage(0).triangles).toEqual(page.triangles);
 });

 it('forwards paging validation and permits a terminal empty page without claiming population coverage',()=>{
  const world=createOriginalDoorWorld(data,1,tracks);
  for(const limit of [0,33,1.5,Infinity,NaN])expect(()=>world.geometry.fixedTrianglePage(0,limit)).toThrow('Fixed triangle page limit');
  for(const offset of [-1,.5,world.triangleCount+1,Infinity])expect(()=>world.fixedTrianglePage(offset)).toThrow('Invalid fixed triangle page offset');
  const end=world.fixedTrianglePage(world.triangleCount,1);expect(end.complete).toBe(true);expect(end.triangles).toEqual([]);
  expect(end.revision).toBe(world.fixedTrianglePage(0).revision);
 });
});
