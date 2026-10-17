import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {createOriginalDoorWorld,sampleOriginalDoorSourceMatrix,type OriginalDoorTracks} from './originalDoorWorld';
import {createOriginalSceneGeometry,type OriginalSceneData,type OriginalSceneMesh} from './originalSceneGeometry';
import type {OriginalConvexPolytope} from './originalConvexSweep';
import {originalRpgConvex,originalRpgBasisFromSourceRotation} from './originalRpgShape';
const I=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
function mesh(resource:string,world:number[][],faces:number[][]):OriginalSceneMesh{return {resource,part:0,positions:world.map(([x,y,z])=>[x,-z,y]),faces,normals:[],tex_coords:[]};}
const floor=mesh('floor',[[-10,0,-10],[10,0,-10],[10,0,10],[-10,0,10]],[[0,2,1],[0,3,2]]);
// Real concave gap between two panels. Filling the resource bounds would block it.
const panel=mesh('door open test',[[0,0,-2],[0,0,-.7],[0,3,-.7],[0,3,-2],[0,0,.7],[0,0,2],[0,3,2],[0,3,.7]],[[0,1,2],[0,2,3],[4,5,6],[4,6,7]]);
const data:OriginalSceneData={nodes:[{name:'floor',parent:'World',resource:'floor',matrix:I,visibility:1,shader:'floor'},{name:'door open test',parent:'World',resource:'door open test',matrix:I,visibility:1,shader:'door'}],meshes:[floor,panel]};
const tracks:OriginalDoorTracks={version:1,doors:[{name:'door open test',motionName:'door open test-Key',baseMatrix:I,keys:[{time:0,position:[0,0,0],scale:[1,1,1],quaternion_xyzw:[0,0,0,1]},{time:1,position:[0,0,0],scale:[1,1,1],quaternion_xyzw:[0,0,Math.SQRT1_2,Math.SQRT1_2]},{time:2.3,position:[0,0,0],scale:[1,1,1],quaternion_xyzw:[0,0,Math.SQRT1_2,Math.SQRT1_2]},{time:3.3,position:[0,0,0],scale:[1,1,1],quaternion_xyzw:[0,0,0,1]}]}]};
const from={x:-2,y:0,z:1},to={x:2,y:0,z:1};
describe('instance-local original door world',()=>{
 it('identifies movement snapshots across visible animation, fork, replacement and reset',()=>{
  const world=createOriginalDoorWorld(data,1,tracks),closed=world.movementSnapshotIdentity;
  expect(Object.isFrozen(closed)).toBe(true);expect(world.fork().movementSnapshotIdentity).toBe(closed);
  world.update(10);expect(world.movementSnapshotIdentity).toBe(closed);
  world.open('door open test',10);const open=world.movementSnapshotIdentity;expect(open).not.toBe(closed);
  world.update(10.5);world.setOpenedAt('door open test',10.25);expect(world.movementSnapshotIdentity).toBe(open);
  expect(world.fork().movementSnapshotIdentity).toBe(open);
  world.reconcile([{name:'door open test',openedAt:10.25}],11);expect(world.movementSnapshotIdentity).toBe(open);
  world.reconcile([],12);expect(world.movementSnapshotIdentity).not.toBe(open);
  world.reset();expect(world.movementSnapshotIdentity).toBe(closed);
 });
 it('blocks exact closed panels, preserves their concave gap, then removes movement bodies immediately',()=>{
  const fixed=createOriginalSceneGeometry(data,{scale:1}),world=createOriginalDoorWorld(data,1,tracks),facade=world.geometry;
  expect(fixed.movePlayer(from,to,.2,.4).collided).toBe(false);
  expect(world.movePlayer(from,to,.2,.4).collided).toBe(true);
  expect(world.movePlayer({...from,z:0},{...to,z:0},.2,.4).collided).toBe(false);
  expect(world.playerIntersects({x:0,y:0,z:1},.2,.4)).toBe(true);
  expect(world.open('door open test',100)).toBe(true);
  expect(world.geometry).toBe(facade);expect(facade.movePlayer(from,to,.2,.4).collided).toBe(false);
  expect(world.playerIntersects({x:0,y:0,z:1},.2,.4)).toBe(false);
  expect(world.raycast({x:-3,y:1,z:1},{x:1,y:0,z:0},10)?.id).toBe('door open test');
 });
 it('uses the full RPG nose against closed panels and removes that body on source opening',()=>{
  const world=createOriginalDoorWorld(data,1,tracks),shape=originalRpgConvex(originalRpgBasisFromSourceRotation({x:0,y:0,z:-90}));
  const a={x:-2,y:1,z:1},b={x:-.4,y:1,z:1};
  expect(world.fixedGeometry.sweepConvex(a,b,shape)).toBeNull();
  const hit=world.geometry.sweepConvex(a,b,shape)!;
  expect(hit).not.toBeNull();expect(hit.normal.x).toBeCloseTo(-1,10);
  expect(hit.position.x).toBeCloseTo(-Math.max(...shape.vertices.map(v=>v.x)),10);
  expect(world.geometry.sweepSphere(a,b,2.7133301903537212*(1.72/85))).toBeNull();
  world.open('door open test',100);expect(world.geometry.sweepConvex(a,b,shape)).toBeNull();
  world.reset();expect(world.geometry.sweepConvex(a,b,shape)).toEqual(hit);
 });
 it('combat rays follow moving visible triangles after movement collision is gone and remain open',()=>{
  const world=createOriginalDoorWorld(data,1,tracks);world.open('door open test',10);
  expect(world.raycast({x:-3,y:1,z:1},{x:1,y:0,z:0},10)?.distance).toBeCloseTo(3);
  world.update(10.5);expect(world.raycast({x:-3,y:1,z:1},{x:1,y:0,z:0},10)?.distance).not.toBeCloseTo(3);
  world.update(12);expect(world.raycast({x:-3,y:1,z:1},{x:1,y:0,z:0},10)).toBeNull();
  const open=world.getModelMatrix('door open test');world.update(100);expect(world.getModelMatrix('door open test')).toEqual(open);
  expect(world.getStates()[0]).toMatchObject({openedAt:10,phase:'open',elapsedSeconds:1.6});
 });
 it('forks transactionally without changing another room or the fixed scene geometry',()=>{
  const first=createOriginalDoorWorld(data,1,tracks),second=createOriginalDoorWorld(data,1,tracks),fork=first.fork();
  expect(fork.fixedGeometry).toBe(first.fixedGeometry);fork.open('door open test',20);fork.update(21);
  expect(fork.movePlayer(from,to,.2,.4).collided).toBe(false);
  expect(first.movePlayer(from,to,.2,.4).collided).toBe(true);expect(second.movePlayer(from,to,.2,.4).collided).toBe(true);
  expect(first.getStates()[0].openedAt).toBeNull();expect(data.nodes[1].matrix).toEqual(I);
 });
 it('restores closed doors and backdated authoritative events atomically through the stable facade',()=>{
  const world=createOriginalDoorWorld(data,1,tracks),facade=world.geometry;world.update(200);world.open('door open test',100);
  expect(world.getStates()[0]).toMatchObject({openedAt:100,phase:'open'});
  world.reset();expect(world.geometry).toBe(facade);expect(world.movePlayer(from,to,.2,.4).collided).toBe(true);
  world.reconcile([{name:'door open test',openedAt:120}],200);expect(world.getStates()[0].phase).toBe('open');
  expect(()=>world.reconcile([{name:'bad',openedAt:1}],201)).toThrow();expect(world.getStates()[0].openedAt).toBe(120);
  world.reconcile([],201);expect(world.getStates()[0].phase).toBe('closed');
 });
 it('resamples corrected authoritative timestamps without restoring removed collision',()=>{
  const world=createOriginalDoorWorld(data,1,tracks);world.open('door open test',100);world.update(101);
  expect(world.setOpenedAt('door open test',100.75)).toBe(true);
  expect(world.getStates()[0]).toMatchObject({openedAt:100.75,elapsedSeconds:.25});
  expect(world.getModelMatrix('door open test')).toEqual(sampleOriginalDoorSourceMatrix(tracks.doors[0],.25));
  expect(world.movePlayer(from,to,.2,.4).collided).toBe(false);
 });
 it('blocks an actual supported Barrack doorway until source opening and then moves its visible ray surface',()=>{
  const actual=JSON.parse(readFileSync(new URL('../public/assets/original-scenes/barrack/doors.json',import.meta.url),'utf8')) as OriginalDoorTracks;
  const source=JSON.parse(readFileSync(new URL('../public/assets/original-scenes/barrack/scene.json',import.meta.url),'utf8')) as OriginalSceneData;
  const scale=1.72/85,r=25*scale,h=50*scale,world=createOriginalDoorWorld(source,scale,actual);
  const a={x:4.503506146588435,y:-2.0838854396722246e-7,z:-33.70871953602075},b={x:5.675270842049921,y:-2.1352260918803566e-7,z:-33.70887581017229};
  expect(world.playerSupportHeightAt(a.x,a.z,1,r,h)).toBeCloseTo(a.y,7);
  expect(world.movePlayer(a,b,r,h).collided).toBe(true);expect(world.fixedGeometry.movePlayer(a,b,r,h).collided).toBe(false);
  const origin={...a,y:a.y+1},direction={x:.9999999911066889,y:0,z:-.0001333664947851998};
  const closed=world.raycast(origin,direction,1.17176471);expect(closed?.id).toBe('door open 28');
  world.open('door open 28',10);expect(world.movePlayer(a,b,r,h).collided).toBe(false);expect(world.raycast(origin,direction,1.17176471)?.id).toBe('door open 28');
  world.update(12);expect(world.raycast(origin,direction,1.17176471)?.id).not.toBe('door open 28');
 });
 it('exposes all touching fixed and closed door surfaces through the stable facade',()=>{
  const world=createOriginalDoorWorld(data,1,tracks),facade=world.geometry,p={x:.21,y:.21,z:1};
  const contacts=facade.contactsSphere(p,.2,.02);
  expect(contacts.some(contact=>contact.model==='floor')).toBe(true);expect(contacts.some(contact=>contact.model==='door open test')).toBe(true);
  expect(contacts.filter(contact=>contact.model==='door open test').every(contact=>contact.gap>0&&contact.gap<=.02)).toBe(true);
  const axes=[{x:1,y:0,z:0},{x:0,y:1,z:0},{x:0,y:0,z:1}];
  const shape:OriginalConvexPolytope={vertices:[-.2,.2].flatMap(x=>[-.2,.2].flatMap(y=>[-.2,.2].map(z=>({x,y,z})))),
   faceNormals:axes.flatMap(v=>[v,{x:-v.x,y:-v.y,z:-v.z}]),edgeDirections:axes,
   faces:[[0,1,3,2],[4,6,7,5],[0,4,5,1],[2,3,7,6],[0,2,6,4],[1,5,7,3]].flatMap(([a,b,c,d])=>[[a,b,c],[a,c,d]])};
  expect(facade.contactsConvex(p,shape,.02).map(contact=>contact.model).sort()).toEqual(['door open test','floor']);
  world.open('door open test',10);expect(world.geometry).toBe(facade);
  for(const time of [10,10.5,12]){
   world.update(time);expect(facade.contactsSphere(p,.2,.02).every(contact=>contact.model!=='door open test')).toBe(true);
   expect(facade.contactsConvex(p,shape,.02).map(contact=>contact.model)).toEqual(['floor']);
  }
  world.reconcile([],13);expect(facade.contactsSphere(p,.2,.02).some(contact=>contact.model==='door open test')).toBe(true);
 });
 it('retains actual recovered doorway contacts and excludes the deleted body while its visible panel remains',()=>{
  const actual=JSON.parse(readFileSync(new URL('../public/assets/original-scenes/barrack/doors.json',import.meta.url),'utf8')) as OriginalDoorTracks;
  const source=JSON.parse(readFileSync(new URL('../public/assets/original-scenes/barrack/scene.json',import.meta.url),'utf8')) as OriginalSceneData;
  const scale=1.72/85,world=createOriginalDoorWorld(source,scale,actual);
  const origin={x:4.503506146588435,y:1,z:-33.70871953602075},direction={x:.9999999911066889,y:0,z:-.0001333664947851998};
  const ray=world.raycast(origin,direction,1.17176471)!;expect(ray.id).toBe('door open 28');
  const p={x:ray.point.x+ray.normal.x*.11,y:ray.point.y+ray.normal.y*.11,z:ray.point.z+ray.normal.z*.11};
  expect(world.geometry.contactsSphere(p,.1,.02).some(contact=>contact.model==='door open 28')).toBe(true);
  world.open('door open 28',10);expect(world.geometry.contactsSphere(p,.1,.02).some(contact=>contact.model==='door open 28')).toBe(false);
  expect(world.raycast(origin,direction,1.17176471)?.id).toBe('door open 28');
 });
 it('detaches touching outputs and keeps forked door contact phases independent',()=>{
  const world=createOriginalDoorWorld(data,1,tracks),p={x:.21,y:.21,z:1},expected=world.geometry.contactsSphere(p,.2,.02);
  const contacts=world.geometry.contactsSphere(p,.2,.02);contacts[0].normal.x=99;contacts[0].witnessB!.x=99;contacts[0].witnessPairs![0].witnessA.x=99;
  expect(world.geometry.contactsSphere(p,.2,.02)).toEqual(expected);
  const fork=world.fork();fork.open('door open test',1);
  expect(fork.geometry.contactsSphere(p,.2,.02).some(contact=>contact.model==='door open test')).toBe(false);
  expect(world.geometry.contactsSphere(p,.2,.02)).toEqual(expected);
 });
 it('uses strict source proximity and excludes doors from support immediately when opened',()=>{
  const world=createOriginalDoorWorld(data,1,tracks);expect(world.triggerNearby({x:100,y:0,z:0},1)).toEqual([]);
  expect(world.playerSupportHeightAt(0,1,4,.2,.4)).toBeCloseTo(3);
  expect(world.triggerNearby({x:99.9,y:0,z:0},1)).toEqual(['door open test']);
  expect(world.playerSupportHeightAt(0,1,4,.2,.4)).toBeCloseTo(0);
 });
 it('samples all13 actual Barrack tracks against independent preserved matrices and keeps Woodland empty',()=>{
  const actual=JSON.parse(readFileSync(new URL('../public/assets/original-scenes/barrack/doors.json',import.meta.url),'utf8')) as OriginalDoorTracks;
  const evidence=JSON.parse(readFileSync(new URL('../docs/research-evidence/2026-09-30/original-door-animation/barrack-level1/door-tracks.json',import.meta.url),'utf8')) as {doors:{name:string;samples:{time_seconds:number;source_base_times_delta_matrix:number[]}[]}[]};
  for(const d of actual.doors)for(const t of [.5,1.6]){
   const sample=evidence.doors.find(x=>x.name===d.name)!.samples.find(x=>x.time_seconds===t)!;
   sampleOriginalDoorSourceMatrix(d,t).forEach((v,i)=>expect(v).toBeCloseTo(sample.source_base_times_delta_matrix[i],7));
  }
  const woodland=createOriginalDoorWorld({nodes:[data.nodes[0]],meshes:[floor]},1,{version:1,doors:[]});expect(woodland.getStates()).toEqual([]);expect(woodland.open('door open test',1)).toBe(false);woodland.reset();
 });
});
