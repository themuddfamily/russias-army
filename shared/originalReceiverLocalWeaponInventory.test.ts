import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {createOriginalReceiverLocalWeaponInventory,ORIGINAL_RECEIVER_LOCAL_WEAPON_RESOURCES,type ReceiverLocalWeaponCapture,type ReceiverLocalWeaponModelCapture} from './originalReceiverLocalWeaponInventory';
import type {ReceiverWeaponGeometry} from './originalReceiverActorResources';
import type {ReceiverScenePrefix} from './originalReceiverPrefix';
import {createOriginalReceiverSceneRay,ORIGINAL_RECEIVER_SCENE_LAYERS} from './originalReceiverSceneRay';
import {OriginalReceiverModelWorld,type ReceiverModelBackend} from './originalReceiverModelWorld';

const I=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
const matrix=(x=0,y=0,z=0)=>{const m=[...I];m[12]=x;m[13]=y;m[14]=z;return m;};
const prefix=(tick=0):ReceiverScenePrefix=>({sceneGeneration:4,callback:2,kind:'receipt',tick});
const options={sceneGeneration:4,maxModels:7,maxVertices:100000,maxFaces:100000,provenance:'declared-local-source-resources',sidedness:'double' as const};
const geometry=():ReceiverWeaponGeometry=>({meshes:Object.values(ORIGINAL_RECEIVER_LOCAL_WEAPON_RESOURCES).map(resource=>({resource,positions:[[-2,0,-2],[2,0,-2],[0,0,2]],faces:[[0,1,2]]}))});
function capture(p=prefix()):ReceiverLocalWeaponCapture{return {prefix:p,cameraHandle:'private-camera',selectedWeapon:'rifle',loadedRocket:true,models:Object.entries(ORIGINAL_RECEIVER_LOCAL_WEAPON_RESOURCES).map(([handle,resource])=>({handle:handle as ReceiverLocalWeaponModelCapture['handle'],resource,worldMatrix:matrix(0,handle==='rocket'?8:2),inWorld:handle==='ak47'||handle==='rocket',groupAncestry:handle==='ak47'||handle==='rocket'?['private-camera']:['local-templates']}))};}

describe('receiver CURRENT local weapon inventory (explicit camera subset; no native clone or complete scene claim)',()=>{
 it('admits actual decoded six weapon templates plus loaded rocket with explicit membership independent of logical selection',()=>{
  const decoded=JSON.parse(readFileSync(new URL('../public/assets/original-weapons/geometry.json',import.meta.url),'utf8')) as ReceiverWeaponGeometry,inventory=createOriginalReceiverLocalWeaponInventory(decoded,options),p=prefix(),snapshot=inventory.snapshotAt(p,capture(p));
  expect(snapshot.scope).toBe('local-camera-weapons-only');expect(snapshot.models.map(m=>m.handle)).toEqual(Object.keys(ORIGINAL_RECEIVER_LOCAL_WEAPON_RESOURCES));expect(snapshot.missing).toEqual([]);expect(snapshot.models.filter(m=>m.inWorld).map(m=>m.handle)).toEqual(['ak47','rocket']);expect(snapshot).toMatchObject({selectedWeapon:'rifle',loadedRocket:true,cameraHandle:'private-camera'});
  for(const model of snapshot.models){const raw=decoded.meshes.find(m=>m.resource===model.resource)!;expect(snapshot.resolveModel(model.handle).positions).toEqual(raw.positions);expect(snapshot.resolveModel(model.handle).faces).toEqual(raw.faces);expect(model.kind).toBe('local-weapon');expect(model.group).toBe('scene');expect(snapshot.resolveModel(model.handle).layer).toBe('local-weapon');}expect(snapshot.models.some(m=>m.resource==='rg6grenade')).toBe(false);
 });
 it('owns immutable decoded geometry and scalar options while sharing geometry between detached private snapshots',()=>{
  const decoded=geometry(),mutableOptions={...options},inventory=createOriginalReceiverLocalWeaponInventory(decoded,mutableOptions),p=prefix(),first=inventory.snapshotAt(p,capture(p)),point=[...first.resolveModel('ak47').positions[0]];decoded.meshes.find(m=>m.resource==='ak47')!.positions[0][0]=999;decoded.meshes.find(m=>m.resource==='ak47')!.faces[0][0]=2;mutableOptions.maxVertices=1;mutableOptions.provenance='changed';mutableOptions.sceneGeneration=99;
  const next=prefix(1),second=inventory.snapshotAt(next,capture(next));expect(second.resolveModel('ak47').positions[0]).toEqual(point);expect(second.resolveModel('ak47').faces[0]).toEqual([0,1,2]);expect(second.resolveModel('ak47').positions).toBe(first.resolveModel('ak47').positions);expect(second.provenance).toBe(options.provenance);expect(Object.isFrozen(second.resolveModel('ak47').positions[0])).toBe(true);expect(()=>second.resolveModel('unknown')).toThrow();
 });
 it('uses raw-resource-to-WORLD matrices exactly once and freezes each receiver capture independently',()=>{
  const inventory=createOriginalReceiverLocalWeaponInventory(geometry(),options),baseA=capture(),baseB=capture(prefix(1)),m=matrix(10,20,30);m[0]=2;m[4]=.3;m[5]=3;m[10]=4;const a={...baseA,models:baseA.models.map((record,i)=>i===2?{...record,worldMatrix:m}:record)},b={...baseB,models:baseB.models.map((record,i)=>i===2?{...record,worldMatrix:matrix(-10,-20,-30)}:record)},first=inventory.snapshotAt(a.prefix,a),second=inventory.snapshotAt(b.prefix,b);m[12]=999;
  expect(first.resolveModel('ak47').worldMatrix).toEqual([2,0,0,0,.3,3,0,0,0,0,4,0,10,20,30,1]);expect(second.resolveModel('ak47').worldMatrix[12]).toBe(-10);expect(first.models.find(model=>model.handle==='ak47')!.pose.position).toEqual({x:10,y:20,z:30});expect(Object.isFrozen(first.resolveModel('ak47').worldMatrix)).toBe(true);expect(first.prefix).toEqual(prefix());
 });
 it('discloses absent model state without inventing membership or requiring loaded rocket to follow selected weapon',()=>{
  const inventory=createOriginalReceiverLocalWeaponInventory(geometry(),options),p=prefix(),full=capture(p),partial={...full,models:full.models.filter(m=>m.handle!=='rocket'&&m.handle!=='ak47')},snapshot=inventory.snapshotAt(p,partial);expect(snapshot.missing).toEqual(['local-weapon-state:ak47','local-weapon-state:rocket']);expect(snapshot.models.every(m=>!m.inWorld)).toBe(true);
  const explicit={...full,selectedWeapon:'pistol' as const,loadedRocket:false,models:full.models.map(m=>({...m,inWorld:m.handle==='rocket'}))},retained=inventory.snapshotAt(p,explicit);expect(retained.models.filter(m=>m.inWorld).map(m=>m.handle)).toEqual(['rocket']);expect(retained.loadedRocket).toBe(false);
 });
 it('rejects duplicate/foreign ownership, resource mismatch and malformed affine before publishing replacement state',()=>{
  const inventory=createOriginalReceiverLocalWeaponInventory(geometry(),options),p=prefix(),full=capture(p),saved=inventory.snapshotAt(p,full),bad=matrix();bad[3]=1;
  for(const models of [[full.models[0],full.models[0]],full.models.map((m,i)=>i===0?{...m,resource:'rpgrocket'}:m),full.models.map((m,i)=>i===0?{...m,worldMatrix:bad}:m),full.models.map((m,i)=>i===0?{...m,handle:'gun:ak47:baddy1' as ReceiverLocalWeaponModelCapture['handle']}:m)])expect(()=>inventory.snapshotAt(p,{...full,models})).toThrow();
  expect(saved.models).toHaveLength(7);expect(saved.resolveModel('pistol').worldMatrix).toEqual(matrix(0,2));
 });
 it('requires exact generation and receipt prefix even for two different ticks at the same callback',()=>{
  const inventory=createOriginalReceiverLocalWeaponInventory(geometry(),options),first=capture(prefix(10)),second=capture(prefix(11));expect(inventory.snapshotAt(first.prefix,first).prefix).toEqual(prefix(10));expect(inventory.snapshotAt(second.prefix,second).prefix).toEqual(prefix(11));expect(()=>inventory.snapshotAt(first.prefix,second)).toThrow('prefix mismatch');expect(()=>inventory.snapshotAt({...first.prefix,sceneGeneration:5},{...first,prefix:{...first.prefix,sceneGeneration:5}})).toThrow();expect(()=>inventory.snapshotAt({...first.prefix,callback:-1},first)).toThrow();
 });
 it('rejects remote smoke-group ancestry and invalid camera/selection metadata without deriving visibility from selection',()=>{
  const inventory=createOriginalReceiverLocalWeaponInventory(geometry(),options),p=prefix(),full=capture(p);for(const name of ['smokes','gsmokes','SMOKES'])expect(()=>inventory.snapshotAt(p,{...full,models:full.models.map((m,i)=>i===2?{...m,groupAncestry:['private-camera',name]}:m)})).toThrow('ancestry');expect(()=>inventory.snapshotAt(p,{...full,cameraHandle:'gsmokes'})).toThrow();expect(()=>inventory.snapshotAt(p,{...full,selectedWeapon:'unsupported' as 'rifle'})).toThrow();
 });
 it('preflights geometry/model/text bounds and rejects duplicate, missing or malformed decoded resource contracts',()=>{
  const decoded=geometry();for(const limits of [{maxModels:6},{maxVertices:20},{maxFaces:6},{maxMeshes:6},{maxTextChars:1}])expect(()=>createOriginalReceiverLocalWeaponInventory(decoded,{...options,...limits})).toThrow();expect(()=>createOriginalReceiverLocalWeaponInventory({...decoded,meshes:[...decoded.meshes,decoded.meshes[0]]},options)).toThrow();expect(()=>createOriginalReceiverLocalWeaponInventory({...decoded,meshes:decoded.meshes.slice(1)},options)).toThrow();const invalid=geometry();invalid.meshes[0].faces[0][2]=3;expect(()=>createOriginalReceiverLocalWeaponInventory(invalid,options)).toThrow();
  const inventory=createOriginalReceiverLocalWeaponInventory(decoded,{...options,maxTextChars:128}),p=prefix(),full=capture(p);expect(()=>inventory.snapshotAt(p,{...full,cameraHandle:'x'.repeat(129),models:[]})).toThrow('text budget');expect(()=>inventory.snapshotAt(p,{...full,models:[...full.models,full.models[0]]})).toThrow();
  // Constructor provenance and camera metadata fit64; generated omissions
  // must also count toward the output's text budget before publication.
  const labelBound=createOriginalReceiverLocalWeaponInventory(decoded,{...options,maxTextChars:64});expect(()=>labelBound.snapshotAt(p,{...full,models:[]})).toThrow('text budget');
 });
 it('actual SceneRay admits local camera triangles for bullets while excluding the nearer remote gsmokes gun (declared triangle subset)',()=>{
  const inventory=createOriginalReceiverLocalWeaponInventory(geometry(),options),p=prefix(),full=capture(p),snapshot=inventory.snapshotAt(p,{...full,models:full.models.map(m=>({...m,inWorld:m.handle==='ak47'}))}),local=snapshot.resolveModel('ak47'),remote={...local,handle:'remote-held',layer:'held-gun' as const,groupAncestry:['gsmokes'],worldMatrix:matrix(0,4),inWorld:true},models=[...snapshot.triangles,remote];
  // Only this explicit triangle fixture's other layers are declared empty.
  // This is not coverage for a native or imported complete receiver scene.
  const ray=createOriginalReceiverSceneRay(models,{prefix:p,sceneGeneration:4,callback:2,expectedHandles:models.map(m=>m.handle),accountedLayers:ORIGINAL_RECEIVER_SCENE_LAYERS,unresolved:[]},{maxModels:8,maxVertices:24,maxTriangles:8});expect(ray.nearestDetailedDownward({x:0,y:10,z:0})!.handle).toBe('remote-held');expect(ray.nearestDetailed({x:0,y:10,z:0},{x:0,y:-1,z:0},{bullet:true})!.handle).toBe('ak47');
 });
 it('actual ModelWorld accepts the external local kind but rejects an external alias of an owned remote gun atomically',()=>{
  const p=prefix(),snapshot=createOriginalReceiverLocalWeaponInventory(geometry(),options).snapshotAt(p,capture(p)),pose={position:{x:0,y:0,z:0},yaw:0,phase:0,scale:1};
  // Injected oracle verifies ledger admission only, not complete ray coverage.
  const backend:ReceiverModelBackend={cloneGI:()=>({pose,geometryProvenance:'fixture-gi'}),sphere:()=>({bspWorld:2,provenance:'declared-resource'}),nearestDetailedDownward:()=>({hit:null,coverage:{complete:true,missing:[],provenance:'declared-ledger-fixture'}}),heldGunPose:gi=>gi.pose,cloneGun:()=>({pose,geometryProvenance:'fixture-gun'}),reparentGunMembership:present=>present,dropYaw:()=>0},world=new OriginalReceiverModelWorld(backend,{eyeHeight:1,sourceScale:.02,goodyBspWorld:2,sceneGeneration:4,maxModels:16,maxPickups:4});world.setExternalModels(snapshot.models);expect(world.freezeModels().filter(m=>m.kind==='local-weapon')).toHaveLength(7);const tx=world.begin(),born=tx.birth({actorId:'a',targetFeet:{x:0,y:5,z:0},targetYaw:0,callback:2});tx.commit();const before=world.freezeModels();expect(()=>world.setExternalModels([...snapshot.models,{...snapshot.models[0],handle:born.gunHandle}])).toThrow('handle collision');expect(world.freezeModels()).toEqual(before);expect(()=>world.setExternalModels([{...snapshot.models[0],kind:'gun'}])).toThrow('external model');expect(world.freezeModels()).toEqual(before);
 });
});
