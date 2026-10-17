import {readFileSync} from 'node:fs';
import {describe,expect,it,vi} from 'vitest';
import {createOriginalReceiverPrivateInventory} from './originalReceiverPrivateInventory';
import {createOriginalReceiverImportedScene} from './originalReceiverImportedScene';
import {OriginalDoorWorld,type OriginalDoorTracks} from './originalDoorWorld';
import {OriginalBarrelWorld} from './originalBarrelWorld';
import {createOriginalSceneGeometry,originalNodeWorldMatrices,type OriginalSceneData,type OriginalSceneMesh,type OriginalSceneNode} from './originalSceneGeometry';
import type {OriginalMapRuntime} from './originalMapRuntime';
import {ORIGINAL_MAP_SCALE} from './originalMapProfile';
import type {ReceiverScenePrefix} from './originalReceiverPrefix';
import {OriginalReceiverModelWorld,type ReceiverModelBackend} from './originalReceiverModelWorld';
import {OriginalRemoteView} from './originalRemoteView';

const I=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
const matrix=(x=0,y=0,z=0)=>{const m=[...I];m[12]=x;m[13]=y;m[14]=z;return m;};
const multiply=(a:readonly number[],b:readonly number[])=>Array.from({length:16},(_,i)=>{const r=i%4,c=Math.floor(i/4);return [0,1,2,3].reduce((n,k)=>n+a[k*4+r]*b[c*4+k],0);});
const convert=(scale:number)=>[scale,0,0,0,0,0,-scale,0,0,scale,0,0,0,0,0,1];
const sourceMesh=(resource:string):OriginalSceneMesh=>({resource,part:0,positions:[[0,0,0],[2,0,0],[0,3,1]],faces:[[0,1,2]],normals:[],tex_coords:[]});
const node=(name:string,resource:string,parent='World',m:readonly number[]=I):OriginalSceneNode=>({name,resource,parent,matrix:[...m],visibility:1,shader:''});
const prefix=(callback=0,tick=0):ReceiverScenePrefix=>({sceneGeneration:3,callback,kind:'receipt',tick});
const options={map:'barrack' as const,scale:2,sceneGeneration:3,doorNames:['door main'],provenance:'declared-private-subset',maxModels:32,maxVertices:256,maxFaces:128};
const importedOptions=(scale:number,maxVertices=256,maxFaces=128)=>({scale,geometryProvenance:'decoded-test-subset',sidedness:'double' as const,maxModels:32,maxVertices,maxFaces});
const data=():OriginalSceneData=>({meshes:[sourceMesh('floor'),sourceMesh('door'),sourceMesh('barrel')],nodes:[node('room','','World',matrix(10,20,30)),node('floor','floor'),node('door main','door','room',matrix(1,2,3)),node('barrel one','barrel','room',matrix(4,5,6))]});
const synthetic=()=>{const d=data(),imported=createOriginalReceiverImportedScene(d,importedOptions(2));return {data:d,imported,inventory:createOriginalReceiverPrivateInventory(imported,d,options)};};
const doors=(m:readonly number[])=>({getStates:()=>[{name:'door main',openedAt:null,phase:'closed' as const,elapsedSeconds:0}],getModelMatrix:(name:string)=>name==='door main'?m:undefined});
const barrels=(m:number[]|undefined)=>({getModelMatrix:(name:string)=>name==='barrel one'?m:undefined});
const near=(a:readonly number[],b:readonly number[])=>{expect(a).toHaveLength(16);for(let i=0;i<16;i++)expect(a[i]).toBeCloseTo(b[i],10);};

describe('receiver private imported inventory (partial CPU adapter; no complete scene or Game wiring claim)',()=>{
 it('composes a private door local pose with its source parent, but treats barrel pose as already source WORLD before one conversion',()=>{
  const s=synthetic(),p=prefix(),door=matrix(3,4,5),barrel=matrix(70,80,90),snapshot=s.inventory.snapshotAt(p,{prefix:p,doors:doors(door),barrels:barrels(barrel)});
  near(snapshot.models.find(m=>m.name==='door main')!.worldMatrix!,multiply(convert(2),multiply(matrix(10,20,30),door)));
  near(snapshot.models.find(m=>m.name==='barrel one')!.worldMatrix!,multiply(convert(2),barrel));
  expect(snapshot.models.find(m=>m.name==='door main')!.kind).toBe('door');expect(snapshot.models.find(m=>m.name==='barrel one')!.kind).toBe('barrel');expect(snapshot.scope).toBe('private-imported-subset');
  const doorRay=snapshot.triangles.find(m=>m.handle==='door main')!;expect(snapshot.resolveModel(doorRay.handle)).toBe(doorRay);expect(doorRay.positions).toBe(s.imported.snapshot().models.find(m=>m.handle==='door main')!.positions);expect(Object.isFrozen(doorRay)).toBe(true);expect(()=>snapshot.resolveModel('absent')).toThrow();
 });
 it('retains removed barrel identity as offworld rather than restoring its imported placement',()=>{
  const s=synthetic(),p=prefix(),snapshot=s.inventory.snapshotAt(p,{prefix:p,doors:doors(matrix(1,2,3)),barrels:barrels(undefined)});
  expect(snapshot.models.find(m=>m.name==='barrel one')).toMatchObject({kind:'barrel',inWorld:false});expect(snapshot.models.filter(m=>m.name==='barrel one')).toHaveLength(1);
 });
 it('updates geometry below private door/barrel parents and propagates removed barrel membership to its descendant',()=>{
  const base=data(),d={...base,nodes:[...base.nodes,node('panel trim','floor','door main',matrix(1,2,3)),node('paint label','floor','barrel one',matrix(2,3,4))]},inventory=createOriginalReceiverPrivateInventory(createOriginalReceiverImportedScene(d,importedOptions(2)),d,options),p=prefix(),moved=inventory.snapshotAt(p,{prefix:p,doors:doors(matrix(3,4,5)),barrels:barrels(matrix(70,80,90))});
  near(moved.resolveModel('panel trim').worldMatrix,multiply(convert(2),matrix(14,26,38)));near(moved.resolveModel('paint label').worldMatrix,multiply(convert(2),matrix(72,83,94)));expect(moved.resolveModel('paint label').inWorld).toBe(true);
  // Descendant membership is this hierarchy adapter's rule, not a measured
  // native model deletion/cascade policy.
  const next=prefix(1,1),removed=inventory.snapshotAt(next,{prefix:next,doors:doors(matrix(3,4,5)),barrels:barrels(undefined)});expect(removed.resolveModel('paint label').inWorld).toBe(false);expect(removed.resolveModel('panel trim').inWorld).toBe(true);expect(moved.resolveModel('paint label').inWorld).toBe(true);
 });
 it('detaches prefix, matrices and saved inventory from later facade/source-array mutation',()=>{
  const s=synthetic(),p={sceneGeneration:3,callback:2,kind:'receipt' as const,tick:10},dm=matrix(1,2,3),bm=matrix(4,5,6),snapshot=s.inventory.snapshotAt(p,{prefix:p,doors:doors(dm),barrels:barrels(bm)}),saved=snapshot.models.map(m=>({handle:m.handle,worldMatrix:[...m.worldMatrix!]}));
  p.tick=11;dm[12]=1000;bm[14]=-1000;s.data.nodes[1].matrix=matrix(2000);
  expect(snapshot.prefix).toEqual(prefix(2,10));expect(snapshot.models.map(m=>({handle:m.handle,worldMatrix:m.worldMatrix}))).toEqual(saved);expect(Object.isFrozen(snapshot.prefix)).toBe(true);for(const m of snapshot.models)expect(Object.isFrozen(m.worldMatrix)).toBe(true);
 });
 it('does not alias independent private receiver captures at the same callback with different receipt ticks',()=>{
  const s=synthetic(),a=prefix(4,8),b=prefix(4,9),first=s.inventory.snapshotAt(a,{prefix:a,doors:doors(matrix(1)),barrels:barrels(matrix(2))}),second=s.inventory.snapshotAt(b,{prefix:b,doors:doors(matrix(11)),barrels:barrels(matrix(22))});
  expect(first.prefix).toEqual(a);expect(second.prefix).toEqual(b);expect(first.models.find(m=>m.kind==='door')!.worldMatrix).not.toEqual(second.models.find(m=>m.kind==='door')!.worldMatrix);expect(first.models.find(m=>m.kind==='barrel')!.worldMatrix).not.toEqual(second.models.find(m=>m.kind==='barrel')!.worldMatrix);
 });
 it('discloses unresolved external classes and absent private facade coverage instead of asserting full receiver completeness',()=>{
  const s=synthetic(),p=prefix(),snapshot=s.inventory.snapshotAt(p,{prefix:p});expect(snapshot.missing.length).toBeGreaterThan(0);
  for(const label of ['sky','projectile','transient'])expect(snapshot.missing.join(' ')).toContain(label);expect(snapshot.missing.join(' ')).toContain('door');expect(snapshot.missing.join(' ')).toContain('barrel');
 });
 it('preserves missing resource and unsupported imported actor ownership disclosures',()=>{
  const base=data(),d={...base,nodes:[...base.nodes,node('unresolved-prop','absent'),node('baddy unsupported','floor')]};const imported=createOriginalReceiverImportedScene(d,importedOptions(2)),inventory=createOriginalReceiverPrivateInventory(imported,d,options),p=prefix(),snapshot=inventory.snapshotAt(p,{prefix:p,doors:doors(matrix()),barrels:barrels(matrix())});
  expect(snapshot.missing.join(' ')).toContain('unresolved-prop');expect(snapshot.missing.join(' ')).toContain('baddy');
 });
 it('rejects provider/source binding mismatches and discloses missing explicit ownership instead of accepting unrelated private states',()=>{
  const d=data(),imported=createOriginalReceiverImportedScene(d,importedOptions(2)),changed={...d,nodes:d.nodes.map(n=>n.name==='floor'?{...n,matrix:matrix(9)}:n)};
  expect(()=>createOriginalReceiverPrivateInventory(imported,changed,options)).toThrow();expect(()=>createOriginalReceiverPrivateInventory(imported,d,{...options,scale:1})).toThrow();
  const changedResource={...d,nodes:d.nodes.map(n=>n.name==='floor'?{...n,resource:'door'}:n)};expect(()=>createOriginalReceiverPrivateInventory(imported,changedResource,options)).toThrow();
  const inventory=createOriginalReceiverPrivateInventory(imported,d,{...options,doorNames:[]}),p=prefix(),snapshot=inventory.snapshotAt(p,{prefix:p,barrels:barrels(matrix())});expect(snapshot.missing.join(' ')).toContain('door');
  const unknown={getStates:()=>[{name:'door missing',openedAt:null,phase:'closed' as const,elapsedSeconds:0}],getModelMatrix:()=>matrix()},unregistered=createOriginalReceiverPrivateInventory(imported,d,options).snapshotAt(p,{prefix:p,doors:unknown,barrels:barrels(matrix())});expect(unregistered.missing).toContain('unregistered-door-state:door missing');expect(unregistered.missing).toContain('door-state:door main');
 });
 it('applies explicit explore smokes reparenting to ancestor and descendant while preserving source WORLD and subsequent private child placement',()=>{
  const base=data(),d={...base,nodes:base.nodes.map(n=>n.name==='floor'?node('outerfencing','floor','room',matrix(1,2,3)):n.name==='door main'?{...n,parent:'outerfencing'}:n)},imported=createOriginalReceiverImportedScene(d,importedOptions(2)),inventory=createOriginalReceiverPrivateInventory(imported,d,options),p=prefix(),snapshot=inventory.snapshotAt(p,{prefix:p,doors:doors(matrix(7,8,9)),barrels:barrels(matrix())});
  const ancestor=snapshot.resolveModel('outerfencing'),child=snapshot.resolveModel('door main');near(ancestor.worldMatrix,multiply(convert(2),matrix(11,22,33)));near(child.worldMatrix,multiply(convert(2),matrix(18,30,42)));expect(ancestor.groupAncestry).toEqual(['smokes']);expect(child.groupAncestry).toEqual(['outerfencing','smokes']);expect(snapshot.models.find(m=>m.name==='door main')!.group).toBe('gsmokes');
  near(imported.snapshot().models.find(m=>m.handle==='outerfencing')!.worldMatrix,multiply(convert(2),matrix(11,22,33)));expect(imported.snapshot().models.find(m=>m.handle==='outerfencing')!.groupAncestry).toEqual(['room']);
 });
 it('rejects wrong generation, mismatched same-callback receipt, malformed prefixes and bounded inventories',()=>{
  const s=synthetic(),p=prefix();expect(()=>s.inventory.snapshotAt(p,{prefix:prefix(0,1)})).toThrow();expect(()=>s.inventory.snapshotAt({...p,sceneGeneration:4},{prefix:{...p,sceneGeneration:4}})).toThrow();expect(()=>s.inventory.snapshotAt({...p,callback:-1},{prefix:p})).toThrow();
  for(const limits of [{maxModels:1},{maxVertices:1},{maxFaces:1},{maxModels:0}])expect(()=>createOriginalReceiverPrivateInventory(createOriginalReceiverImportedScene(s.data,importedOptions(2)),s.data,{...options,...limits})).toThrow();
  const empty:OriginalSceneData={nodes:[],meshes:[]};expect(()=>createOriginalReceiverPrivateInventory(createOriginalReceiverImportedScene(empty,importedOptions(2)),empty,{...options,doorNames:[],provenance:'12345',maxTextChars:4})).toThrow();
 });
 for(const map of ['barrack','woodlands'] as const)it(map==='barrack'?'barrack: actual barrel forks retain lift, moved/angular WORLD pose, removal and private door opening':'woodlands: actual exported empty barrel registry stays empty while imported floor/fence snapshots retain source explore ancestry',()=>{
  const raw=JSON.parse(readFileSync(new URL(`../public/assets/original-scenes/${map==='woodlands'?'woodland':map}/scene.json`,import.meta.url),'utf8')) as OriginalSceneData;
  const allTracks:OriginalDoorTracks=map==='barrack'?JSON.parse(readFileSync(new URL('../public/assets/original-scenes/barrack/doors.json',import.meta.url),'utf8')):{version:1,doors:[]};
  const floorNode=raw.nodes.find(n=>n.name.toLowerCase()==='floor')!;expect(floorNode).toBeDefined();
  if(map==='woodlands'){
   // The decoded Woodland export has no first-word barrel nodes. Do not
   // invent an actor to claim private barrel or native physics coverage.
   expect(raw.nodes.filter(n=>n.name.trim().split(/\s+/)[0].toLowerCase()==='barrel')).toEqual([]);const fence=raw.nodes.find(n=>n.name.toLowerCase()==='outerfencing')!;expect(fence).toBeDefined();const selected=new Map<string,OriginalSceneNode>();
   for(const chosen of [floorNode,fence]){let n:OriginalSceneNode|undefined=chosen;while(n&&!selected.has(n.name)){selected.set(n.name,n);n=n.parent===''||n.parent.toLowerCase()==='world'?undefined:raw.nodes.find(candidate=>candidate.name.toLowerCase()===n!.parent.toLowerCase());}}
   const subset:OriginalSceneData={nodes:[...selected.values()],meshes:raw.meshes.filter(m=>[...selected.values()].some(n=>n.resource.toLowerCase()===m.resource.toLowerCase()))},scale=ORIGINAL_MAP_SCALE,geometry=createOriginalSceneGeometry(subset,{scale}),runtime:OriginalMapRuntime={map,data:subset,geometry,scale,spawnPoints:[],profile:{scale,radius:1,bodyHeight:1,eyeHeight:1,bounds:geometry.bounds}},base=new OriginalBarrelWorld(runtime),fork=base.fork(),doorWorld=new OriginalDoorWorld(subset,scale,{version:1,doors:[]}),doorFork=doorWorld.fork(),opts={...options,map,scale,doorNames:[],maxVertices:1000000,maxFaces:1000000},inventory=createOriginalReceiverPrivateInventory(createOriginalReceiverImportedScene(subset,importedOptions(scale,1000000,1000000)),subset,opts),p=prefix(),saved=inventory.snapshotAt(p,{prefix:p,doors:doorWorld,barrels:base}),matrices=saved.models.map(m=>[...m.worldMatrix!]);
   expect(base.bodies).toEqual([]);expect(fork.bodies).toEqual([]);expect(saved.models.some(m=>m.kind==='barrel')).toBe(false);expect(saved.resolveModel(fence.name).groupAncestry).toContain('smokes');expect(saved.models.find(m=>m.name===floorNode.name)).toMatchObject({kind:'fixed',inWorld:true});fork.applySnapshots([]);fork.reset();doorFork.update(10);const next=prefix(1,1),later=inventory.snapshotAt(next,{prefix:next,doors:doorFork,barrels:fork});expect(later.models.some(m=>m.kind==='barrel')).toBe(false);expect(saved.prefix).toEqual(p);expect(saved.models.map(m=>m.worldMatrix)).toEqual(matrices);expect(later.models.map(m=>m.worldMatrix)).toEqual(matrices);return;
  }
  const barrelNode=raw.nodes.find(n=>n.name.trim().split(/\s+/)[0].toLowerCase()==='barrel')!;expect(barrelNode).toBeDefined();const track=allTracks.doors[0],selected=new Map<string,OriginalSceneNode>();
  for(const chosen of [floorNode,barrelNode,...(track?[raw.nodes.find(n=>n.name===track.name)!]:[])]){let n:OriginalSceneNode|undefined=chosen;while(n&&!selected.has(n.name)){selected.set(n.name,n);n=n.parent===''||n.parent.toLowerCase()==='world'?undefined:raw.nodes.find(candidate=>candidate.name.toLowerCase()===n!.parent.toLowerCase());}}
  const subset:OriginalSceneData={nodes:[...selected.values()],meshes:raw.meshes.filter(m=>[...selected.values()].some(n=>n.resource.toLowerCase()===m.resource.toLowerCase()))},scale=ORIGINAL_MAP_SCALE,geometry=createOriginalSceneGeometry(subset,{scale,includeModel:()=>true});
  // Minimal runtime carries real imported templates and scale. No source
  // collision stepping, spawn settlement or physical grounding is performed.
  const runtime:OriginalMapRuntime={map,data:subset,geometry,scale,spawnPoints:[],profile:{scale,radius:1,bodyHeight:1,eyeHeight:1,bounds:geometry.bounds}},base=new OriginalBarrelWorld(runtime),fork=base.fork(),doorWorld=new OriginalDoorWorld(subset,scale,{version:1,doors:track?[track]:[]}),doorFork=doorWorld.fork();
  const opts={...options,map,scale,doorNames:track?[track.name]:[],maxVertices:1000000,maxFaces:1000000},inventory=createOriginalReceiverPrivateInventory(createOriginalReceiverImportedScene(subset,importedOptions(scale,1000000,1000000)),subset,opts),p=prefix(),closed=inventory.snapshotAt(p,{prefix:p,doors:doorWorld,barrels:base});
  const importedMatrix=originalNodeWorldMatrices(subset).get(barrelNode.name.toLowerCase())!,initial=base.getInitialPosition(barrelNode.name)!;expect(base.bodies[0].position.y).toBeCloseTo(initial.y+10*scale,12);near(closed.models.find(m=>m.name===barrelNode.name)!.worldMatrix!,multiply(convert(scale),base.getModelMatrix(barrelNode.name)!));expect(base.getModelMatrix(barrelNode.name)![14]).toBeCloseTo(importedMatrix[14]+10,9);
  const packet=fork.snapshots();packet[0].position={x:100,y:50,z:-70};packet[0].orientation={x:0,y:0,z:Math.SQRT1_2,w:Math.SQRT1_2};packet[0].angularVelocity={x:0,y:0,z:0};fork.applySnapshots(packet);if(track){doorFork.open(track.name,0);doorFork.update(1);}
  const next=prefix(1,1),moved=inventory.snapshotAt(next,{prefix:next,doors:doorFork,barrels:fork});near(moved.models.find(m=>m.name===barrelNode.name)!.worldMatrix!,multiply(convert(scale),fork.getModelMatrix(barrelNode.name)!));expect(moved.models.find(m=>m.name===barrelNode.name)!.worldMatrix).not.toEqual(closed.models.find(m=>m.name===barrelNode.name)!.worldMatrix);expect(base.bodies[0].position).not.toEqual(packet[0].position);
  if(track){expect(moved.models.find(m=>m.name===track.name)!.worldMatrix).not.toEqual(closed.models.find(m=>m.name===track.name)!.worldMatrix);expect(doorWorld.getStates()[0].phase).toBe('closed');}
  fork.applySnapshots([]);const removedPrefix=prefix(2,2),removed=inventory.snapshotAt(removedPrefix,{prefix:removedPrefix,doors:doorFork,barrels:fork});expect(removed.models.find(m=>m.name===barrelNode.name)!.inWorld).toBe(false);expect(closed.models.find(m=>m.name===barrelNode.name)!.inWorld).toBe(true);near(closed.models.find(m=>m.name===barrelNode.name)!.worldMatrix!,multiply(convert(scale),base.getModelMatrix(barrelNode.name)!));
 });
 it('real receiver acceptance rejects composer omissions before any birth query and rolls back ledger, allocator, actor and pending receipt state',()=>{
  const s=synthetic(),query=vi.fn<ReceiverModelBackend['nearestDetailedDownward']>(()=>({hit:null,coverage:{complete:true,missing:[],provenance:'must-never-be-queried'}}));
  // Sphere and clone poses are declared fixtures; missing inventory rejects
  // before either can establish grounding or a native measured result.
  const backend:ReceiverModelBackend={cloneGI:()=>({pose:{position:{x:0,y:0,z:0},yaw:0,phase:0,scale:1},geometryProvenance:'injected-gi'}),sphere:()=>({bspWorld:2,provenance:'declared-resource'}),nearestDetailedDownward:query,heldGunPose:gi=>gi.pose,cloneGun:()=>({pose:{position:{x:0,y:0,z:0},yaw:0,phase:0,scale:1},geometryProvenance:'injected-gun'}),reparentGunMembership:present=>present,dropYaw:()=>0};
  const source={snapshotAt:(p:ReceiverScenePrefix)=>s.inventory.snapshotAt(p,{prefix:p,doors:doors(matrix()),barrels:barrels(matrix())})},world=new OriginalReceiverModelWorld(backend,{eyeHeight:1,sourceScale:2,goodyBspWorld:2,sceneGeneration:3,maxModels:32,maxPickups:16},source),view=new OriginalRemoteView(0,{},'source-callback',world);
  expect(view.recordSent({tick:0,sentAt:0,targets:[{id:'actor',position:{x:0,y:5,z:0},yaw:0,motionTime:0,alive:true,weapon:'rifle'}]})).toEqual({ok:true});const before={models:world.freezeModels(),ledger:world.debugState(),actors:view.freeze(),corpses:view.freezeCorpses(),clock:view.debugState()};
  expect(()=>view.accept({callbacks:0,receipts:[{tick:0,callbacks:0}]},0)).toThrow('Incomplete receiver external scene');expect(query).not.toHaveBeenCalled();expect({models:world.freezeModels(),ledger:world.debugState(),actors:view.freeze(),corpses:view.freezeCorpses(),clock:view.debugState()}).toEqual(before);
 });
});
