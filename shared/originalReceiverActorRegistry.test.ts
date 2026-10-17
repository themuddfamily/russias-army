import {describe,expect,it} from 'vitest';
import {createOriginalReceiverActorRegistrySnapshot,validateOriginalReceiverActorRegistrySnapshot,type ReceiverActorRegistrySnapshot} from './originalReceiverActorRegistry';
import {OriginalReceiverModelWorld,type ReceiverModelBackend,type ReceiverModelEntry,type ReceiverModelPose} from './originalReceiverModelWorld';
import {createOriginalReceiverGeometryBackend} from './originalReceiverGeometryBackend';
import {ORIGINAL_RECEIVER_SCENE_LAYERS,type OriginalReceiverRayModel} from './originalReceiverSceneRay';
import {createOriginalReceiverImportedScene} from './originalReceiverImportedScene';
import {createOriginalReceiverPrivateInventory} from './originalReceiverPrivateInventory';
import {createOriginalReceiverSceneInventory} from './originalReceiverSceneInventory';
import type {ReceiverScenePrefix} from './originalReceiverPrefix';
import type {OriginalSceneData} from './originalSceneGeometry';

// These CPU lifecycle/triangle adapters prove ownership auditing, not native
// clone transforms, renderer visibility or complete external scene admission.
const limits={maxModels:32,maxPickups:16,maxTextChars:65536};
const pose=(phase=77):ReceiverModelPose=>({position:{x:0,y:20,z:0},yaw:.4,phase,scale:1});
const prefix=(tick=0):ReceiverScenePrefix=>({kind:'receipt',sceneGeneration:4,callback:0,tick});
const birth=(actorId:string)=>({actorId,targetFeet:{x:0,y:10,z:0},targetYaw:.2,callback:0});
const actor=(weapon:'rpg'|'rifle'|'pistol'='rpg')=>({position:{x:0,y:10,z:0},yaw:.2,motionTime:123,weapon});
const lifecycle:Omit<ReceiverModelBackend,'nearestDetailedDownward'>={cloneGI:()=>({pose:pose(),geometryProvenance:'declared-GI'}),cloneGun:()=>({pose:pose(0),geometryProvenance:'declared-gun'}),sphere:()=>({bspWorld:2,provenance:'declared-resource'}),heldGunPose:gi=>gi.pose,reparentGunMembership:()=>true,dropYaw:()=>.7};
function fixture(maxRegistryTextChars=65536){
 const queries:ReceiverActorRegistrySnapshot[]=[];
 const backend:ReceiverModelBackend={...lifecycle,nearestDetailedDownward:(_origin,models,_callback,_generation,_prefix,registry)=>{
  expect(registry).toBeDefined();queries.push(registry!);expect(models.filter(m=>m.kind==='gi'||m.kind==='gun')).toEqual(registry!.models);
  for(const model of registry!.models)expect(models.find(m=>m.handle===model.handle)).toBe(model);
  return {hit:null,coverage:{complete:true,missing:[],provenance:'declared-closed-query-fixture'}};
 }};
 const world=new OriginalReceiverModelWorld(backend,{eyeHeight:1,sourceScale:.02,goodyBspWorld:2,sceneGeneration:4,...limits,maxRegistryTextChars});
 return {world,queries};
}
const registry=(p=prefix())=>createOriginalReceiverActorRegistrySnapshot({sceneGeneration:4,callback:p.callback,prefix:p,giHandles:['gi:baddy1'],gunCatalog:[],models:[{handle:'gi:baddy1',name:'baddy1',resource:'GI',kind:'gi',group:'soldiers',inWorld:true,pose:pose(),geometryProvenance:'declared-GI'}],actors:[],fades:[],fifo:[],pickups:[],constructingGI:'gi:baddy1'},limits);
const ray=(model:Readonly<ReceiverModelEntry>):OriginalReceiverRayModel=>({handle:model.handle,layer:model.kind==='gi'?'live-gi':'held-gun',inWorld:model.inWorld,geometryProvenance:model.geometryProvenance,groupAncestry:model.group==='gsmokes'?['smokes']:['soldiers'],positions:[[-1,0,-1],[1,0,-1],[0,0,1]],faces:[[0,1,2]],worldMatrix:[1,0,0,0,0,1,0,0,0,0,1,0,0,model.pose.position.y,0,1],sidedness:'double'});

describe('receiver actor ownership registry (CPU adapters, no native coverage claim)',()=>{
 it('copies and freezes known logical source position independently of GI transforms',()=>{
  const f=fixture(),tx=f.world.begin();tx.birth(birth('a'));tx.commit();const original=f.world.freezeActorRegistry(),position={x:4,y:5,z:6};
  const copied=createOriginalReceiverActorRegistrySnapshot({...original,actors:[{...original.actors[0],sourcePositionWorld:position}]},limits);
  position.x=999;expect(copied.actors[0].sourcePositionWorld).toEqual({x:4,y:5,z:6});expect(Object.isFrozen(copied.actors[0].sourcePositionWorld)).toBe(true);
  expect(copied.models).toEqual(original.models);expect(original.actors[0].sourcePositionWorld).toEqual({x:0,y:11,z:0});
 });
 it('rejects missing or malformed logical source position instead of reconstructing it from GI',()=>{
  const f=fixture(),tx=f.world.begin();tx.birth(birth('a'));tx.commit();const original=f.world.freezeActorRegistry();
  for(const sourcePositionWorld of [undefined,{x:0,y:NaN,z:0},{x:0,y:0,z:Infinity}]){
   const malformed={...original.actors[0],sourcePositionWorld} as unknown as typeof original.actors[number];
   expect(()=>createOriginalReceiverActorRegistrySnapshot({...original,actors:[malformed]},limits)).toThrow('registry binding');
  }
 });
 it('audits newborn self-membership before acquiring any gun or installing actor binding',()=>{
  const f=fixture(),tx=f.world.begin();const born=tx.birth(birth('a'));const query=f.queries[0];
  expect(query.constructingGI).toBe(born.giHandle);expect(query.giHandles).toEqual([born.giHandle]);expect(query.gunCatalog).toEqual([]);expect(query.actors).toEqual([]);expect(query.expectedHandles).toEqual([born.giHandle]);expect(query.models[0]).toMatchObject({inWorld:true,pose:{phase:77,scale:.045,position:{x:0,y:20,z:0}}});
  tx.commit();const committed=f.world.freezeActorRegistry();expect(committed.constructingGI).toBeUndefined();expect(committed.actors[0]).toMatchObject({actorId:'a',gi:born.giHandle,gun:born.gunHandle,weapon:'rpg'});expect(committed.gunCatalog).toEqual([{gi:born.giHandle,handle:born.gunHandle,weapon:'rpg'}]);expect(query.gunCatalog).toEqual([]);
 });
 it('audits temporary own-GI removal during fade query without omitting another live GI or dropped gun',()=>{
  const f=fixture(),tx=f.world.begin(),a=tx.birth(birth('a')),b=tx.birth(birth('b'));tx.detach('a',actor(),0);const query=f.queries.at(-1)!;
  expect(query.models.find(m=>m.handle===a.giHandle)).toMatchObject({inWorld:false,pose:{phase:3000}});expect(query.models.find(m=>m.handle===b.giHandle)!.inWorld).toBe(true);expect(query.models.find(m=>m.handle===a.gunHandle)!.inWorld).toBe(true);expect(query.pickups[0].handle).toBe(a.gunHandle);
  tx.commit();expect(f.world.freezeActorRegistry().fades[0]).toMatchObject({handle:a.giHandle,bon:0});expect(query.models.find(m=>m.handle===a.giHandle)!.inWorld).toBe(false);
 });
 it('retains every lazy gun and reuses GI FIFO/phase while old pickup collection removes the currently held alias',()=>{
  const f=fixture();let tx=f.world.begin();const a=tx.birth(birth('a')),b=tx.birth(birth('b'));tx.beforeCallback('a',actor('rifle'));tx.beforeCallback('a',actor('pistol'));tx.beforeCallback('a',actor());tx.detach('a',actor(),0);tx.detach('b',actor(),0);tx.commit();const pickup=f.world.freezePickups()[0];
  const prior=f.world.freezeActorRegistry();expect(prior.gunCatalog.filter(g=>g.gi===a.giHandle).map(g=>g.weapon)).toEqual(['rpg','rifle','pistol']);expect(prior.models.filter(m=>m.kind==='gun'&&!m.inWorld)).toHaveLength(2);
  tx=f.world.begin();for(let i=0;i<76;i++)tx.advanceCorpses();tx.commit();expect(f.world.freezeActorRegistry().fifo).toEqual([a.giHandle,b.giHandle]);const retired=f.world.freezeActorRegistry().models.find(m=>m.handle===a.giHandle)!;
  tx=f.world.begin();const c=tx.birth(birth('c'));expect(c.giHandle).toBe(a.giHandle);expect(c.gunHandle).toBe(pickup.handle);expect(f.queries.at(-1)!.models.find(m=>m.handle===a.giHandle)!.pose).toEqual(retired.pose);tx.collectPickup(pickup.id);tx.commit();const after=f.world.freezeActorRegistry();expect(after.actors.find(v=>v.actorId==='c')!.gun).toBe(pickup.handle);expect(after.models.find(m=>m.handle===pickup.handle)!.inWorld).toBe(false);expect(after.expectedHandles).toEqual(prior.expectedHandles);expect(prior.pickups[0]).toEqual(pickup);
 });
 it('rolls back staged births, gun catalogs, pickups, corpse clocks and clone names to the committed registry',()=>{
  const f=fixture();let tx=f.world.begin();tx.birth(birth('a'));tx.commit();const before=f.world.freezeActorRegistry();tx=f.world.begin();tx.beforeCallback('a',actor('rifle'));tx.detach('a',actor('rifle'),0);tx.advanceCorpses();const staged=tx.birth(birth('b'));tx.rollback();expect(f.world.freezeActorRegistry()).toEqual(before);
  tx=f.world.begin();expect(tx.birth(birth('b')).giHandle).toBe(staged.giHandle);tx.rollback();expect(f.world.freezeActorRegistry()).toEqual(before);
 });
 it('supplies exact same-callback receipt registries to an external provider without admitting owned entries twice',()=>{
  const captured:ReceiverActorRegistrySnapshot[]=[],queried:ReceiverActorRegistrySnapshot[]=[];
  const backend:ReceiverModelBackend={...lifecycle,nearestDetailedDownward:(_o,_models,_cb,_gen,_p,r)=>{queried.push(r!);return {hit:null,coverage:{complete:true,missing:[],provenance:'declared-empty-external-control'}};}};
  const world=new OriginalReceiverModelWorld(backend,{eyeHeight:1,sourceScale:.02,goodyBspWorld:2,sceneGeneration:4,...limits},{snapshotAt:(p,r)=>{captured.push(r!);return {prefix:p,models:[],missing:[],provenance:'declared-empty-external-control'};}});
  const tx=world.begin();tx.applyExternalReceipt(0,0);tx.birth(birth('a'));tx.applyExternalReceipt(1,0);tx.birth(birth('b'));tx.commit();
  expect(captured.map(r=>r.prefix)).toEqual([prefix(0),prefix(1)]);expect(captured[0].expectedHandles).toEqual([]);expect(captured[1].actors.map(a=>a.actorId)).toEqual(['a']);expect(queried[1].constructingGI).toBe('gi:baddy2');expect(queried[1].prefix).toEqual(prefix(1));expect(world.freezeActorRegistry().prefix).toEqual(prefix(1));expect(world.freezeModels()).toHaveLength(4);
 });
 it('detaches standard snapshots and rejects unbranded, missing catalog or overlapping GI roles',()=>{
  const original=registry(),model={...original.models[0],pose:{...pose(),position:{x:1,y:2,z:3}}},input={...original,models:[model]};const saved=createOriginalReceiverActorRegistrySnapshot(input,limits);model.pose.position.x=999;expect(saved.models[0].pose.position.x).toBe(1);expect(Object.isFrozen(saved.models[0].pose.position)).toBe(true);expect(()=>validateOriginalReceiverActorRegistrySnapshot({...saved})).toThrow('detached');
  expect(()=>createOriginalReceiverActorRegistrySnapshot({...input,models:[]},limits)).toThrow('Missing');expect(()=>createOriginalReceiverActorRegistrySnapshot({...input,fifo:['gi:baddy1']},limits)).toThrow();
 });
 it('checks array cardinality before touching entries or iterators, and separately bounds retained text',()=>{
  const original=registry(),oversized=new Array(33);let reads=0;Object.defineProperty(oversized,0,{get:()=>{reads++;throw Error('entry must not be read');}});Object.defineProperty(oversized,Symbol.iterator,{get:()=>{reads++;throw Error('iterator must not be read');}});
  expect(()=>createOriginalReceiverActorRegistrySnapshot({...original,models:oversized},limits)).toThrow('budget');expect(reads).toBe(0);expect(()=>createOriginalReceiverActorRegistrySnapshot(original,{...limits,maxTextChars:4})).toThrow('text budget');
 });
 it('audits final retained binding text before publication and rejects oversized actor labels before querying',()=>{
  const f=fixture(200),before=f.world.freezeActorRegistry();let tx=f.world.begin();tx.birth(birth('a'.repeat(190)));expect(f.queries).toHaveLength(1);expect(()=>tx.prepareCommit()).toThrow('text budget');tx.rollback();expect(f.world.freezeActorRegistry()).toEqual(before);
  tx=f.world.begin();expect(()=>tx.birth(birth('a'.repeat(201)))).toThrow();expect(f.queries).toHaveLength(1);tx.rollback();expect(f.world.freezeActorRegistry()).toEqual(before);
 });
 it('rejects wrong clock, missing owned entries and changed same-prefix poses before coverage or geometry resolution',()=>{
  const r=registry();let coverageCalls=0,resolves=0;const backend=createOriginalReceiverGeometryBackend(lifecycle,{sceneGeneration:4,provenance:'declared-subset',budget:{maxModels:32,maxVertices:96,maxTriangles:32},coverageAt:(callback,p,owned)=>{coverageCalls++;return {sceneGeneration:4,callback,prefix:p,expectedHandles:owned!.expectedHandles,accountedLayers:ORIGINAL_RECEIVER_SCENE_LAYERS,unresolved:[],actorRegistry:owned};},resolveModel:model=>{resolves++;return ray(model);}});
  const call=(models:readonly Readonly<ReceiverModelEntry>[],p:ReceiverScenePrefix=prefix())=>backend.nearestDetailedDownward({x:0,y:30,z:0},models,0,4,p,r);
  expect(()=>call(r.models,prefix(1))).toThrow('prefix');expect(()=>call([])).toThrow('subset');expect(()=>call([{...r.models[0],pose:pose(9)}])).toThrow('model mismatch');expect(coverageCalls).toBe(0);expect(resolves).toBe(0);expect(call(r.models).coverage.complete).toBe(true);expect(resolves).toBe(1);
 });
 it('requires coverage to attest the identical query-local registry before resolving any mesh',()=>{
  const r=registry(),other=registry();let resolves=0;const backend=createOriginalReceiverGeometryBackend(lifecycle,{sceneGeneration:4,provenance:'fixture',budget:{maxModels:32,maxVertices:96,maxTriangles:32},coverageAt:()=>({sceneGeneration:4,callback:0,prefix:prefix(),expectedHandles:r.expectedHandles,accountedLayers:ORIGINAL_RECEIVER_SCENE_LAYERS,unresolved:[],actorRegistry:other}),resolveModel:model=>{resolves++;return ray(model);}});
  expect(()=>backend.nearestDetailedDownward({x:0,y:30,z:0},r.models,0,4,prefix(),r)).toThrow('registry identity');expect(resolves).toBe(0);
 });
 it('discharges only actor-ledger in composition and retains other classes and imported actor ownership gaps',()=>{
  const identity=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],data:OriginalSceneData={nodes:[{name:'baddy-unowned',parent:'World',resource:'GI',matrix:identity,visibility:1,shader:''}],meshes:[{resource:'GI',part:0,positions:[[0,0,0],[1,0,0],[0,1,0]],faces:[[0,1,2]],normals:[],tex_coords:[]}]};
  const bounds={sceneGeneration:4,provenance:'declared-imported-subset',maxModels:32,maxVertices:96,maxFaces:32};const imported=createOriginalReceiverPrivateInventory(createOriginalReceiverImportedScene(data,{...bounds,scale:1,geometryProvenance:'declared-imported',sidedness:'double'}),data,{...bounds,map:'barrack',scale:1,doorNames:[]}),composer=createOriginalReceiverSceneInventory(imported,bounds),p=prefix(),r=registry();
  const snapshot=composer.snapshotAt(p,{prefix:p,imported:{prefix:p},actorRegistry:r});expect(snapshot.missing).not.toContain('actor-ledger');for(const label of ['sky','local-camera-weapon','projectile','transient'])expect(snapshot.missing).toContain(label);expect(snapshot.missing.some(v=>v.includes('baddy'))).toBe(true);expect(snapshot.models.some(m=>m.handle==='gi:baddy1')).toBe(false);
  expect(()=>composer.snapshotAt(p,{prefix:p,imported:{prefix:p},actorRegistry:registry(prefix(1))})).toThrow('prefix');expect(composer.snapshotAt(p,{prefix:p,imported:{prefix:p}}).missing).toContain('actor-ledger');
 });
});
