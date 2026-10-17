import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {createOriginalReceiverTransientInventory,ORIGINAL_RECEIVER_MUZZLE_TEMPLATES,type ReceiverTransientInventoryCapture,type ReceiverTransientTemplateCapture} from './originalReceiverTransientInventory';
import {OriginalReceiverTransientResources} from './originalReceiverTransientResources';
import {OriginalReceiverTransientWorld,type OriginalReceiverTransientBackend,type OriginalReceiverTransientGoody} from './originalReceiverTransientWorld';
import type {ReceiverWeaponGeometry} from './originalReceiverActorResources';
import type {ReceiverModelEntry,ReceiverModelPose} from './originalReceiverModelWorld';
import type {ReceiverScenePrefix} from './originalReceiverPrefix';

const I=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],width=2.25;
const matrix=(x=0,y=0,z=0)=>{const m=[...I];m[12]=x;m[13]=y;m[14]=z;return m;};
const pose=(x=0):ReceiverModelPose=>({position:{x,y:4,z:2},rotation:{x:0,y:0,z:0,w:1},yaw:0,phase:0,scale:1});
const prefix=(tick=0):ReceiverScenePrefix=>({sceneGeneration:2,callback:0,kind:'receipt',tick});
const options={sceneGeneration:2,maxModels:16,maxVertices:100000,maxFaces:100000,provenance:'closed-source-fixture-no-barrel-bangs'};
const goody:OriginalReceiverTransientGoody={bspWorld:width,modelPosition:{x:0,y:0,z:0},eyePosition:{x:0,y:2,z:0},weapon:'rifle'};
const templates=():ReceiverTransientTemplateCapture[]=>ORIGINAL_RECEIVER_MUZZLE_TEMPLATES.map(handle=>({handle,resource:handle,worldMatrix:matrix(100,200,300),inWorld:false,group:'scene',groupAncestry:['source-templates']}));
function fixture(){
 const decoded=JSON.parse(readFileSync(new URL('../public/assets/original-weapons/geometry.json',import.meta.url),'utf8')) as ReceiverWeaponGeometry;
 const resources=new OriginalReceiverTransientResources(decoded,{sourceScale:.02,planeResource:{widthWorld:width,positions:[[-width/2,0,-width/2],[width/2,0,-width/2],[0,0,width/2]],faces:[[0,1,2]],provenance:'explicit-world-unit-triangle-plane-adapter'},maxVertices:100000,maxFaces:100000,provenance:'actual-mf-decoded-contract',sidedness:'double'});
 const backend:OriginalReceiverTransientBackend={clonePlane:()=>({pose:pose(),geometryProvenance:'injected-plane-clone',inWorld:true}),cloneMuzzle:()=>({pose:pose(),geometryProvenance:'decoded-mf-clone',inWorld:true}),pointAt:()=>({x:0,y:0,z:0,w:1}),selfRotate:q=>({...q})},world=new OriginalReceiverTransientWorld(backend,{maxModels:12,maxActors:12,maxShaders:12}),inventory=createOriginalReceiverTransientInventory(resources,options);let counter=0;
 const begin=()=>world.begin((name,increment='before')=>{if(increment==='after')return `${name}${counter++}`;return `${name}${++counter}`;});
 const capture=(models:readonly ReceiverModelEntry[]=[],expectedHandles:readonly string[]=[...ORIGINAL_RECEIVER_MUZZLE_TEMPLATES],p=prefix()):ReceiverTransientInventoryCapture=>({prefix:p,templates:templates(),models,expectedHandles,unresolved:[],planeWidthWorld:models.some(m=>m.resource==='plane')?width:null});
 return {decoded,resources,world,inventory,begin,capture,dispose(){resources.dispose();}};
}

describe('CURRENT transient inventory (owned FX ledger plus explicit source templates; CPU adapters)',()=>{
 it('uses actual four decoded muzzle templates offworld with explicit group/ancestry and complete raw-to-WORLD matrices',()=>{
  const s=fixture();try{const p=prefix(),snapshot=s.inventory.snapshotAt(p,s.capture());expect(snapshot.scope).toBe('receiver-transients-only');expect(snapshot.missing).toEqual([]);expect(snapshot.models.map(m=>m.handle)).toEqual([...ORIGINAL_RECEIVER_MUZZLE_TEMPLATES]);
   for(const model of snapshot.models){const ray=snapshot.resolveModel(model.handle),raw=s.decoded.meshes.find(m=>m.resource===model.resource)!;expect(ray.positions).toEqual(raw.positions);expect(ray.faces).toEqual(raw.faces);expect(ray.worldMatrix).toEqual(matrix(100,200,300));expect(ray.groupAncestry).toEqual(['source-templates']);expect(model).toMatchObject({kind:'transient',group:'scene',inWorld:false});expect(ray.inWorld).toBe(false);}
  }finally{s.dispose();}
 });
 it('captures actual staged FX births without committing or publishing returned sound/damage intents',()=>{
  const s=fixture();try{const tx=s.begin();tx.birth({kind:'puff',id:'puff',position:{x:1,y:2,z:3},angleSourceDegrees:90},goody);const intents=tx.birth({kind:'bang',id:'bang',position:{x:4,y:5,z:6},type:'rocket',attackerName:'fixture'},goody);tx.birth({kind:'muzzle',id:'muzzle',weapon:'rifle',gunPose:pose(10)},goody);
   // Independent source allocation evidence: plane1, shad1, plane3,
   // shad3 and mfak475. It is not inferred from successful ray resolution.
   const expected=[...ORIGINAL_RECEIVER_MUZZLE_TEMPLATES,'plane1','plane3','mfak475'],models=tx.freezeModels(),p=prefix(),snapshot=s.inventory.snapshotAt(p,s.capture(models,expected));expect(snapshot.missing).toEqual([]);expect(snapshot.models.map(m=>m.handle)).toEqual(expected);expect(s.world.freezeModels()).toEqual([]);expect(intents[0].kind).toBe('sound');expect(snapshot).not.toHaveProperty('effects');expect(snapshot.resolveModel('plane1').positions).toHaveLength(3);expect(snapshot.resolveModel('mfak475').groupAncestry).toEqual(['gsmokes']);tx.rollback();expect(s.world.freezeModels()).toEqual([]);expect(snapshot.resolveModel('plane3').inWorld).toBe(true);
  }finally{s.dispose();}
 });
 it('preserves actual shared plane FIFO and weapon muzzle reuse while keeping previous immutable inventory detached',()=>{
  const s=fixture();try{let tx=s.begin();tx.birth({kind:'blood',id:'blood',position:{x:1,y:2,z:3}},goody);tx.birth({kind:'miss',id:'miss',position:{x:4,y:5,z:6},normal:{x:0,y:.1,z:0}},goody);tx.birth({kind:'muzzle',id:'a',weapon:'rifle',gunPose:pose(8)},goody);tx.birth({kind:'muzzle',id:'b',weapon:'rifle',gunPose:pose(9)},goody);tx.commit();const expected=[...ORIGINAL_RECEIVER_MUZZLE_TEMPLATES,'plane1','plane2','mfak473','mfak474'],saved=s.inventory.snapshotAt(prefix(),s.capture(s.world.freezeModels(),expected));
   tx=s.begin();for(let i=0;i<81;i++)tx.step(goody);tx.commit();expect(s.world.debugState().planePool).toEqual(['plane1','plane2']);expect(s.world.debugState().muzzlePools[0].handles).toEqual(['mfak473','mfak474']);const offPrefix=prefix(1),off=s.inventory.snapshotAt(offPrefix,s.capture(s.world.freezeModels(),expected,offPrefix));expect(off.models.slice(4).every(m=>!m.inWorld)).toBe(true);
   tx=s.begin();tx.birth({kind:'bang',id:'reuse',position:{x:20,y:30,z:40},type:'grenade',attackerName:'fixture'},goody);tx.birth({kind:'muzzle',id:'reuse-mf',weapon:'rifle',gunPose:pose(80)},goody);tx.commit();const next=prefix(2),reused=s.inventory.snapshotAt(next,s.capture(s.world.freezeModels(),expected,next));expect(reused.resolveModel('plane1').inWorld).toBe(true);expect(reused.resolveModel('plane2').inWorld).toBe(false);expect(reused.resolveModel('mfak473').inWorld).toBe(true);expect(reused.resolveModel('mfak474').inWorld).toBe(false);expect(saved.resolveModel('plane1').worldMatrix).not.toEqual(reused.resolveModel('plane1').worldMatrix);expect(saved.resolveModel('mfak473').worldMatrix).not.toEqual(reused.resolveModel('mfak473').worldMatrix);expect(saved.resolveModel('plane2').inWorld).toBe(true);
  }finally{s.dispose();}
 });
 it('captures supported recycled barrel geometry while retaining independent fresh-plane or chronology gaps',()=>{
  const s=fixture();try{
   let tx=s.begin();tx.birth({kind:'bang',id:'rocket-before-barrel',position:{x:1,y:2,z:3},type:'rocket',attackerName:'fixture'},goody);for(let i=0;i<16;i++)tx.step(goody);tx.commit();
   const retained=s.world.freezeModels()[0];tx=s.begin();tx.birth({kind:'bang',id:'barrel',position:{x:20,y:30,z:40},type:'barrel'},goody);tx.commit();
   const p=prefix(1),capture=s.capture(s.world.freezeModels(),[...ORIGINAL_RECEIVER_MUZZLE_TEMPLATES,retained.handle],p),snapshot=s.inventory.snapshotAt(p,capture);
   expect(snapshot.missing).toEqual([]);const ray=snapshot.resolveModel(retained.handle);expect(ray.inWorld).toBe(true);expect(ray.worldMatrix[12]).toBe(20);expect(ray.worldMatrix[13]).toBe(30);expect(ray.worldMatrix[14]).toBe(40);
   expect(s.world.freezeModels()[0]).toMatchObject({shaderHandle:retained.shaderHandle,pose:{scale:8}});expect(ray.worldMatrix[0]).toBe(8);
   expect(s.inventory.snapshotAt(p,{...capture,unresolved:['undeclared-fresh-plane-shader','unrecorded-global-actor-order']}).missing).toEqual(['undeclared-fresh-plane-shader','unrecorded-global-actor-order']);
  }finally{s.dispose();}
 });
 it('preserves independent omissions and unsupported barrel-bang evidence instead of declaring geometry-complete FX',()=>{
  const s=fixture();try{const p=prefix(),base=s.capture(),partial={...base,templates:base.templates.slice(1),expectedHandles:[...base.expectedHandles,'plane-missing'],unresolved:['unsupported-source-barrel-bang']},snapshot=s.inventory.snapshotAt(p,partial);expect(snapshot.missing).toContain('transient-template-state:mfpistol');expect(snapshot.missing).toContain('transient-state:plane-missing');expect(snapshot.missing).toContain('unsupported-source-barrel-bang');expect(snapshot.models.some(m=>m.handle==='mfpistol')).toBe(false);
   const noEvidence=s.inventory.snapshotAt(p,{...base,templates:[],expectedHandles:[]});expect(noEvidence.missing).toContain('transient-template-evidence:mfak47');expect(noEvidence.missing).toContain('transient-template-state:mfak47');
  }finally{s.dispose();}
 });
 it('retains unknown FX geometry and unavailable plane width as missing without inventing ray triangles',()=>{
  const s=fixture();try{const p=prefix(),unknown:ReceiverModelEntry={handle:'unknown-fx',name:'unknown-fx',resource:'unsupported-casing',kind:'transient',group:'gsmokes',inWorld:true,pose:pose(),geometryProvenance:'declared-unsupported-resource'},plane={...unknown,handle:'plane-waiting',name:'plane-waiting',resource:'plane'},base=s.capture([unknown,plane],[...ORIGINAL_RECEIVER_MUZZLE_TEMPLATES,'unknown-fx','plane-waiting']),snapshot=s.inventory.snapshotAt(p,{...base,planeWidthWorld:null});expect(snapshot.missing).toContain('transient-geometry:unknown-fx');expect(snapshot.missing).toContain('transient-plane-width:plane-waiting');expect(snapshot.models).toHaveLength(4);expect(snapshot.triangles).toHaveLength(4);expect(()=>snapshot.resolveModel('unknown-fx')).toThrow();
  }finally{s.dispose();}
 });
 it('requires exact prefix and independently attested handles, rejecting duplicates, foreign template names and actor ownership',()=>{
  const s=fixture();try{const p=prefix(),base=s.capture();expect(()=>s.inventory.snapshotAt(p,{...base,prefix:prefix(1)})).toThrow('prefix mismatch');expect(()=>s.inventory.snapshotAt({...p,sceneGeneration:3},{...base,prefix:{...p,sceneGeneration:3}})).toThrow();expect(()=>s.inventory.snapshotAt(p,{...base,expectedHandles:base.expectedHandles.slice(1)})).toThrow('Unattested');expect(()=>s.inventory.snapshotAt(p,{...base,templates:[base.templates[0],base.templates[0]]})).toThrow();expect(()=>s.inventory.snapshotAt(p,{...base,expectedHandles:[...base.expectedHandles,base.expectedHandles[0]]})).toThrow();
   const foreign={...base.templates[0],handle:'mfrpg' as ReceiverTransientTemplateCapture['handle'],resource:'mfrpg'};expect(()=>s.inventory.snapshotAt(p,{...base,templates:[foreign]})).toThrow();const owned:ReceiverModelEntry={handle:'gi:baddy1',name:'baddy1',resource:'GI',kind:'gi',group:'soldiers',inWorld:true,pose:pose(),geometryProvenance:'foreign-actor'};expect(()=>s.inventory.snapshotAt(p,s.capture([owned],[...base.expectedHandles,owned.handle]))).toThrow('owned transient');
   for(const mismatch of [{group:'scene' as const,groupAncestry:['SMOKES']},{group:'gsmokes' as const,groupAncestry:['source-templates']}])expect(()=>s.inventory.snapshotAt(p,{...base,templates:base.templates.map((m,i)=>i===0?{...m,...mismatch}:m)})).toThrow('group ancestry mismatch');
  }finally{s.dispose();}
 });
 it('preflights instance, geometry and text budgets including generated missing labels',()=>{
  const s=fixture();try{const p=prefix(),base=s.capture();expect(()=>createOriginalReceiverTransientInventory(s.resources,{...options,maxModels:3})).toThrow();const cap=createOriginalReceiverTransientInventory(s.resources,{...options,maxModels:4}),clone:ReceiverModelEntry={handle:'mfak471',name:'mfak471',resource:'mfak47',kind:'transient',group:'gsmokes',inWorld:true,pose:pose(),geometryProvenance:'clone'};expect(()=>cap.snapshotAt(p,s.capture([clone],[...base.expectedHandles,clone.handle]))).toThrow('capture budget');for(const limit of [{maxVertices:1},{maxFaces:1}])expect(()=>createOriginalReceiverTransientInventory(s.resources,{...options,...limit}).snapshotAt(p,base)).toThrow('geometry budget');const text=createOriginalReceiverTransientInventory(s.resources,{...options,maxTextChars:64});expect(()=>text.snapshotAt(p,{...base,templates:[],expectedHandles:[],unresolved:[]})).toThrow('text budget');
  }finally{s.dispose();}
 });
 it('copies private matrices, ancestry and getter-backed clone pose so later mutation cannot change saved inventory',()=>{
  const s=fixture();try{const p=prefix(),base=s.capture(),mutable=matrix(10,20,30),ancestry=['private-template-parent'],backing={x:5,y:6,z:7},position={get x(){return backing.x;},get y(){return backing.y;},get z(){return backing.z;}},clone:ReceiverModelEntry={handle:'mfak471',name:'mfak471',resource:'mfak47',kind:'transient',group:'gsmokes',inWorld:true,pose:{...pose(),position},geometryProvenance:'private-clone'},first=s.inventory.snapshotAt(p,{...s.capture([clone],[...base.expectedHandles,clone.handle]),templates:base.templates.map((m,i)=>i===0?{...m,worldMatrix:mutable,groupAncestry:ancestry}:m)});mutable[12]=999;ancestry.push('later');backing.x=999;expect(first.resolveModel('mfpistol').worldMatrix[12]).toBe(10);expect(first.resolveModel('mfpistol').groupAncestry).toEqual(['private-template-parent']);expect(first.models.find(m=>m.handle===clone.handle)!.pose.position).toEqual({x:5,y:6,z:7});expect(Object.isFrozen(first.models.find(m=>m.handle===clone.handle)!.pose.position)).toBe(true);const next=prefix(1),second=s.inventory.snapshotAt(next,s.capture([clone],[...base.expectedHandles,clone.handle],next));expect(second.resolveModel(clone.handle).worldMatrix[12]).toBe(999);expect(first.resolveModel(clone.handle).positions).toBe(second.resolveModel(clone.handle).positions);
  }finally{s.dispose();}
 });
 it('rejects malformed explicit matrices and wrong plane generation, and never re-admits after resource disposal',()=>{
  const s=fixture();try{const p=prefix(),base=s.capture(),bad=matrix();bad[0]=NaN;expect(()=>s.inventory.snapshotAt(p,{...base,templates:base.templates.map((m,i)=>i===0?{...m,worldMatrix:bad}:m)})).toThrow();const tx=s.begin();tx.birth({kind:'blood',id:'b',position:{x:1,y:2,z:3}},goody);tx.commit();expect(()=>s.inventory.snapshotAt(p,{...s.capture(s.world.freezeModels(),[...base.expectedHandles,'plane1']),planeWidthWorld:width+1})).toThrow('generation mismatch');const saved=s.inventory.snapshotAt(p,base);s.resources.dispose();expect(()=>s.inventory.snapshotAt(p,base)).toThrow('disposed');expect(saved.resolveModel('mfak47').inWorld).toBe(false);
  }finally{s.dispose();}
 });
});
