import * as THREE from 'three';
import {describe,expect,it} from 'vitest';
import {OriginalReceiverTransientWorld,type OriginalReceiverTransientBackend,type OriginalReceiverTransientBirth,type OriginalReceiverTransientGoody,type OriginalReceiverTransientEffect,type OriginalReceiverTransientOptions,type OriginalReceiverTransientInitialShader} from './originalReceiverTransientWorld';
import {OriginalReceiverModelWorld,type ReceiverModelBackend,type ReceiverModelPose} from './originalReceiverModelWorld';

const rotation={x:Math.sin(.2),y:0,z:0,w:Math.cos(.2)};
const pose=(scale=3):ReceiverModelPose=>({position:{x:8,y:9,z:10},rotation:{...rotation},yaw:.3,phase:77,scale});
const goody:OriginalReceiverTransientGoody={bspWorld:2.25,modelPosition:{x:4,y:5,z:6},eyePosition:{x:4,y:7,z:6},weapon:'rifle'};
const point={x:0,y:1,z:2};
type MutableInitialShader=Omit<{-readonly [K in keyof OriginalReceiverTransientInitialShader]:OriginalReceiverTransientInitialShader[K]},'textureScale'|'texturePosition'> & {textureScale:{x:number;y:number;z:number};texturePosition:{x:number;y:number;z:number}};
const initialShader=():MutableInitialShader=>({handle:'declared-template-shader',texture:'declared-template-texture',recycled:false,textureScale:{x:2,y:3,z:4},texturePosition:{x:5,y:6,z:7},blend:9,emissiveWhite:false,renderFormat:'rgba8888'});
const barrel=(id='barrel'):OriginalReceiverTransientBirth=>({kind:'bang',id,position:point,type:'barrel',attackerName:null});
const event=(kind:OriginalReceiverTransientBirth['kind'],id:string=kind):OriginalReceiverTransientBirth=>{
 if(kind==='puff')return {kind,id,position:point,angleSourceDegrees:90};
 if(kind==='bang')return {kind,id,position:point,type:'rocket',attackerName:'source'};
 if(kind==='miss')return {kind,id,position:point,normal:{x:.1,y:.2,z:.3}};
 if(kind==='blood')return {kind,id,position:point};
 return {kind,id,weapon:'rifle',gunPose:{...pose(1.7),position:{x:20,y:30,z:40}}};
};
const setup=(budgets:OriginalReceiverTransientOptions={maxModels:32,maxActors:32,maxShaders:32},initialCloneCounter=0)=>{
 const pointed:{target:{x:number;y:number;z:number};up:unknown}[]=[],rotated:{x:number;y:number;z:number}[]=[],clones:string[]=[];
 const backend:OriginalReceiverTransientBackend={clonePlane:name=>{clones.push(name);return {pose:pose(),geometryProvenance:'injected-plane-pose',inWorld:true};},cloneMuzzle:name=>{clones.push(name);return {pose:pose(.7),geometryProvenance:'injected-muzzle-pose',inWorld:true};},
  pointAt:(_pose,target,up)=>{pointed.push({target:{x:target.x,y:target.y,z:target.z},up});return {...rotation};},
  selfRotate:(q,degrees)=>{rotated.push({...degrees});const next=new THREE.Quaternion(q.x,q.y,q.z,q.w).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(degrees.x*Math.PI/180,degrees.y*Math.PI/180,degrees.z*Math.PI/180)));return {x:next.x,y:next.y,z:next.z,w:next.w};}};
 const actorBackend:ReceiverModelBackend={cloneGI:()=>({pose:pose(.045),geometryProvenance:'injected-GI'}),sphere:()=>({bspWorld:2,provenance:'declared-resource'}),nearestDetailedDownward:()=>({hit:null,coverage:{complete:true,missing:[],provenance:'injected-complete'}}),heldGunPose:model=>model.pose,
  cloneGun:()=>({pose:pose(1),geometryProvenance:'injected-gun'}),reparentGunMembership:()=>true,dropYaw:()=>0};
 const scene=new OriginalReceiverModelWorld(actorBackend,{eyeHeight:1,sourceScale:.02,goodyBspWorld:2,sceneGeneration:1,maxModels:32,maxPickups:16,initialCloneCounter});
 const fx=new OriginalReceiverTransientWorld(backend,budgets);
 const begin=()=>{const owner=scene.begin(),visual=fx.begin(owner.allocateCloneName);return {owner,visual,commit:()=>{visual.commit();owner.commit();},rollback:()=>{visual.rollback();owner.rollback();}};};
 return {scene,fx,backend,actorBackend,pointed,rotated,clones,begin};
};

describe('source transient ledger with staged receiver clone allocator (pure adapters; no native pointAt or plane claim)',()=>{
 it('shares exact preincrement model and postincrement shader names with interleaved GI births',()=>{
  const {fx,scene,pointed,rotated,begin}=setup();const tx=begin();tx.visual.birth(event('puff'),goody);
  const born=tx.owner.birth({actorId:'a',targetFeet:{x:0,y:0,z:0},targetYaw:0,callback:0});tx.visual.birth(event('muzzle'),goody);tx.commit();
  expect(fx.freezeModels().map(m=>m.handle)).toEqual(['plane1','mfak474']);expect(fx.freezeShaders().map(s=>s.handle)).toEqual(['shad1','mfmachinegun']);expect(born.giHandle).toBe('gi:baddy3');
  expect(fx.freezeModels()[0].pose.scale).toBe(.01);expect(fx.freezeModels()[0].pose.position.y).toBeCloseTo(1+2.25*.2,12);expect(pointed[0].target).toEqual(goody.modelPosition);expect(rotated).toEqual([{x:0,y:0,z:90}]);
  const probe=scene.begin();expect(probe.allocateCloneName('probe')).toBe('probe5');probe.rollback();
  const seeded=setup(undefined,10),seed=seeded.begin();expect(seed.owner.allocateCloneName('shad','after')).toBe('shad10');expect(seed.owner.birth({actorId:'a',targetFeet:point,targetYaw:0,callback:0}).giHandle).toBe('gi:baddy12');seed.commit();seeded.scene.reset();
  const after=seeded.scene.begin();expect(after.allocateCloneName('plane')).toBe('plane11');after.rollback();
 });
 it('captures a prototype getter clone seed for reset and rejects counter overflow without advancement',()=>{
  const {actorBackend}=setup();let seed=41;
  const configuration={eyeHeight:1,sourceScale:.02,goodyBspWorld:2,sceneGeneration:1,maxModels:32,maxPickups:16};Object.setPrototypeOf(configuration,{get initialCloneCounter(){return seed;}});
  const scene=new OriginalReceiverModelWorld(actorBackend,configuration);seed=999;
  let tx=scene.begin();expect(tx.allocateCloneName('plane')).toBe('plane42');tx.rollback();scene.reset();tx=scene.begin();expect(tx.allocateCloneName('plane')).toBe('plane42');tx.rollback();
  const maximal=setup(undefined,Number.MAX_SAFE_INTEGER);const full=maximal.scene.begin();expect(()=>full.allocateCloneName('shad','after')).toThrow('counter requires resynchronization');expect(()=>full.allocateCloneName('plane')).toThrow('counter requires resynchronization');full.rollback();expect(maximal.scene.freezeModels()).toEqual([]);
 });
 it.each([['puff',31],['bang',16],['miss',81],['blood',3],['muzzle',2]] as const)('%s retires on exactly source callback %i', (kind,count)=>{
  const {fx,pointed,begin}=setup();const tx=begin(),birth=tx.visual.birth(event(kind),goody),effects:OriginalReceiverTransientEffect[]=[];
  for(let i=0;i<count-1;i++)effects.push(...tx.visual.step(goody));tx.commit();expect(fx.debugState().actors.map(a=>a.id)).toEqual([kind]);expect(fx.freezeModels()[0].inWorld).toBe(true);
  const last=begin();effects.push(...last.visual.step(goody));last.commit();expect(fx.debugState().actors).toEqual([]);expect(fx.freezeModels()[0].inWorld).toBe(false);
  if(kind==='bang'){expect(birth).toEqual([{kind:'sound',sound:'boomnew',position:point}]);expect(effects).toHaveLength(16);expect(effects.every(e=>e.kind==='bang-hurt'&&e.effectId===kind&&e.amount===5&&e.radiusSource===250)).toBe(true);expect(fx.freezeShaders()[0].texturePosition).toEqual({x:0,y:4,z:0});}
  if(kind==='blood'){expect(pointed).toHaveLength(3);expect(fx.freezeShaders()[0].texturePosition).toEqual({x:-2,y:1,z:0});}
  if(kind==='puff'){expect(fx.freezeModels()[0].pose.scale).toBeCloseTo(3.72,12);expect(fx.freezeShaders()[0].blend).toBeCloseTo(-2.3,12);}
 });
 it('guards bang and blood callbacks on goody while puff and muzzle continue without it',()=>{
  const {fx,pointed,begin}=setup();let tx=begin();for(const kind of ['bang','blood','puff','muzzle'] as const)tx.visual.birth(event(kind),goody);tx.commit();
  const before=fx.debugState().actors.filter(a=>a.kind==='bang'||a.kind==='blood'),queries=pointed.length;tx=begin();expect(tx.visual.step(null)).toEqual([]);tx.visual.step(null);tx.commit();
  expect(fx.debugState().actors.filter(a=>a.kind==='bang'||a.kind==='blood')).toEqual(before);expect(pointed).toHaveLength(queries);expect(fx.debugState().actors.some(a=>a.kind==='muzzle')).toBe(false);expect(fx.debugState().actors.find(a=>a.kind==='puff')!.time).toBe(12);
 });
 it('sets source miss offsets and shotgun scale while preserving grenade atlas and birth size',()=>{
  const {fx,pointed,rotated,begin}=setup();const tx=begin();tx.visual.birth(event('miss'),{...goody,weapon:'shotgun'});tx.visual.birth({kind:'bang',id:'grenade',position:point,type:'grenade',attackerName:'source'},goody);tx.commit();
  const [miss,bang]=fx.freezeModels();expect(miss.pose.position).toEqual({x:.1,y:1.2,z:2.3});expect(miss.pose.scale).toBe(.5);expect(pointed[0].target).toEqual(point);expect(rotated[0]).toEqual({x:180,y:0,z:0});
  expect(bang.pose.scale).toBe(7);expect(fx.freezeShaders().find(s=>s.handle===bang.shaderHandle)).toMatchObject({texture:'banggrenade',textureScale:{x:4,y:4,z:4},texturePosition:{x:0,y:0,z:0},blend:50});
 });
 it('allows the caller to refresh goody state between individual bang actors in one callback',()=>{
  const {fx,begin}=setup();const tx=begin();tx.visual.birth(event('bang','first'),goody);tx.visual.birth(event('bang','second'),goody);expect(tx.visual.freezeActorIds()).toEqual(['first','second']);
  expect(tx.visual.stepActor('first',goody)).toEqual([{kind:'bang-hurt',effectId:'first',position:point,attackerName:'source',amount:5,radiusSource:250}]);expect(tx.visual.stepActor('second',null)).toEqual([]);tx.commit();
  expect(fx.debugState().actors.map(a=>a.time)).toEqual([15,16]);
 });
 it('keeps near-filtering on texture identity rather than transferring it with a recycled shader',()=>{
  const {fx,begin}=setup();let tx=begin();tx.visual.birth(event('bang'),goody);for(let i=0;i<16;i++)tx.visual.step(goody);tx.commit();expect(fx.freezeShaders()[0]).toMatchObject({texture:'bangrocket',nearFiltering:true,renderFormat:'rgba8888'});
  tx=begin();tx.visual.birth(event('puff'),goody);tx.commit();expect(fx.freezeShaders()[0]).toMatchObject({handle:'shad1',texture:'pufft',renderFormat:'rgba8888'});expect(fx.freezeShaders()[0].nearFiltering).toBeUndefined();
 });
 it('mutates the shared plain blood atlas in actor insertion order and resets it on another birth',()=>{
  const {fx,begin}=setup();let tx=begin();tx.visual.birth(event('blood','a'),goody);tx.visual.birth(event('blood','b'),goody);tx.visual.step(goody);tx.commit();
  expect(fx.freezeModels().map(m=>m.shaderHandle)).toEqual(['spatter','spatter']);expect(fx.freezeShaders()[0].texturePosition).toEqual({x:-1,y:1,z:0});
  tx=begin();tx.visual.birth(event('blood','c'),goody);tx.commit();expect(fx.freezeShaders()[0].texturePosition).toEqual({x:1,y:1,z:0});
 });
 it('reuses plane FIFO across effect kinds and shader FIFO without allocating or changing the first plane width',()=>{
  const {fx,scene,begin}=setup();let tx=begin();tx.visual.birth(event('bang','bang-first'),goody);tx.visual.birth(event('puff','puff-second'),goody);for(let i=0;i<31;i++)tx.visual.step(goody);tx.commit();
  expect(fx.debugState().planePool).toEqual(['plane1','plane3']);expect(fx.debugState().shaderPool).toEqual(['shad1','shad3']);expect(fx.freezePlaneWidth()).toBe(2.25);
  tx=begin();tx.visual.birth(event('blood','blood-reuse'),{...goody,bspWorld:9});tx.visual.birth(event('miss','miss-reuse'),goody);tx.commit();expect(fx.freezeModels().map(m=>m.handle)).toEqual(['plane1','plane3']);expect(fx.freezePlaneWidth()).toBe(2.25);
  tx=begin();for(let i=0;i<81;i++)tx.visual.step(goody);tx.commit();tx=begin();tx.visual.birth(event('puff','puff-reuse'),goody);tx.visual.birth(event('bang','bang-reuse'),goody);tx.commit();
  expect(fx.freezeModels().map(m=>m.shaderHandle)).toEqual(['shad1','shad3']);const probe=scene.begin();expect(probe.allocateCloneName('probe')).toBe('probe5');probe.rollback();
 });
 it('retains recycled plane orientation for bang birth and captures muzzle gun pose without adopting gun scale',()=>{
  const {fx,begin}=setup();let tx=begin();tx.visual.birth(event('puff'),goody);for(let i=0;i<31;i++)tx.visual.step(null);tx.commit();const retained=fx.freezeModels()[0].pose.rotation;
  tx=begin();tx.visual.birth(event('bang'),null);tx.visual.birth(event('muzzle'),null);tx.commit();
  const bang=fx.freezeModels().find(m=>m.resource==='plane')!,muzzle=fx.freezeModels().find(m=>m.resource==='mfak47')!;
  expect(bang.pose.rotation).toEqual(retained);expect(bang.pose.scale).toBe(8);expect(muzzle.pose.position).toEqual({x:20,y:30,z:40});expect(muzzle.pose.rotation).toEqual(rotation);expect(muzzle.pose.scale).toBe(.7);
 });
 it('uses weapon-specific muzzle pools instead of reusing a rifle handle for pistol',()=>{
  const {fx,scene,begin}=setup();let tx=begin();tx.visual.birth(event('muzzle','rifle'),goody);tx.visual.step(null);tx.visual.step(null);tx.commit();
  tx=begin();tx.visual.birth({...event('muzzle','pistol'),kind:'muzzle',weapon:'pistol',gunPose:pose()},goody);tx.visual.birth(event('muzzle','rifle-reused'),goody);tx.commit();
  expect(fx.freezeModels().map(m=>m.handle)).toEqual(['mfak471','mfpistol2']);expect(fx.debugState().actors.map(a=>a.handle)).toEqual(['mfpistol2','mfak471']);const probe=scene.begin();expect(probe.allocateCloneName('probe')).toBe('probe3');probe.rollback();
 });
 it('rolls back failed paired transactions including actor births, shared allocator, pools and shaders',()=>{
  const {fx,scene,backend,begin}=setup();let tx=begin();tx.visual.birth(event('puff','old'),goody);for(let i=0;i<31;i++)tx.visual.step(null);tx.commit();
  const before={models:fx.freezeModels(),shaders:fx.freezeShaders(),state:fx.debugState(),owned:scene.freezeModels(),actors:scene.debugState()};const original=backend.cloneMuzzle;backend.cloneMuzzle=()=>{throw Error('injected muzzle clone failure');};
  tx=begin();tx.visual.birth(event('bang','staged'),goody);tx.owner.birth({actorId:'staged',targetFeet:point,targetYaw:0,callback:0});expect(()=>tx.visual.birth(event('muzzle'),goody)).toThrow('injected muzzle clone failure');expect(()=>tx.visual.commit()).toThrow('closed or failed');tx.rollback();
  expect({models:fx.freezeModels(),shaders:fx.freezeShaders(),state:fx.debugState(),owned:scene.freezeModels(),actors:scene.debugState()}).toEqual(before);backend.cloneMuzzle=original;
  tx=begin();expect(tx.owner.birth({actorId:'after',targetFeet:point,targetYaw:0,callback:0}).giHandle).toBe('gi:baddy3');tx.rollback();
 });
 it('rejects budgets without evicting models, and rejects first-plane construction without its goody resource',()=>{
  const capped=setup({maxModels:1,maxActors:4,maxShaders:4});let tx=capped.begin();tx.visual.birth(event('blood','first'),goody);tx.commit();const before=capped.fx.freezeModels();
  tx=capped.begin();expect(()=>tx.visual.birth(event('blood','second'),goody)).toThrow('budget requires resynchronization');tx.rollback();expect(capped.fx.freezeModels()).toEqual(before);
  const empty=setup();tx=empty.begin();expect(()=>tx.visual.birth(event('bang'),null)).toThrow('First source plane resource requires goody bsp');tx.rollback();expect(empty.fx.freezePlaneWidth()).toBeNull();
 });
 it('rejects retained text exhaustion and unsupported muzzle families with paired rollback',()=>{
  const capped=setup({maxModels:8,maxActors:8,maxShaders:8,maxTextChars:80});let tx=capped.begin();tx.visual.birth(event('blood','first'),goody);tx.commit();const before=capped.fx.freezeModels();
  tx=capped.begin();expect(()=>tx.visual.birth(event('blood','second'),goody)).toThrow('text budget requires resynchronization');tx.rollback();expect(capped.fx.freezeModels()).toEqual(before);
  for(const weapon of ['launcher','rpg'] as const){const fresh=setup(),attempt=fresh.begin();expect(()=>attempt.visual.birth({kind:'muzzle',id:weapon,weapon,gunPose:pose()},goody)).toThrow('Unsupported source transient muzzle weapon');attempt.rollback();expect(fresh.fx.freezeModels()).toEqual([]);}
 });
 it.each(['rocket','grenade','puff','miss','blood'] as const)('barrel bang retains the plane shader/scale/rotation after %s without shader FIFO or allocator consumption',priorKind=>{
  const s=setup(),count={rocket:16,grenade:16,puff:31,miss:81,blood:3}[priorKind];let tx=s.begin();
  if(priorKind==='rocket'||priorKind==='grenade')tx.visual.birth({kind:'bang',id:'old',position:point,type:priorKind,attackerName:'source'},goody);else tx.visual.birth(event(priorKind,'old'),goody);
  for(let i=0;i<count;i++)tx.visual.step(goody);tx.commit();const before=s.fx.freezeModels()[0],shader=s.fx.freezeShaders().find(sh=>sh.handle===before.shaderHandle)!,pool=s.fx.debugState().shaderPool,pointed=s.pointed.length,rotated=s.rotated.length;
  let probe=s.scene.begin();const nextName=probe.allocateCloneName('probe');probe.rollback();tx=s.begin();expect(tx.visual.birth(barrel(),goody)).toEqual([{kind:'sound',sound:'boomnew',position:point}]);tx.commit();const after=s.fx.freezeModels()[0],inherited=s.fx.freezeShaders().find(sh=>sh.handle===after.shaderHandle)!;
  expect(after.handle).toBe(before.handle);expect(after.shaderHandle).toBe(before.shaderHandle);expect(after.pose.scale).toBe(before.pose.scale);expect(after.pose.rotation).toEqual(before.pose.rotation);expect(inherited.texture).toBe(shader.texture);expect(inherited).toMatchObject({textureScale:{x:4,y:4,z:4},texturePosition:{x:0,y:0,z:0},blend:50,nearFiltering:true,renderFormat:'rgba8888'});expect(inherited.emissiveWhite).toBe(shader.emissiveWhite);expect(inherited.specularBlack).toBe(shader.specularBlack);expect(inherited.shininess).toBe(shader.shininess);expect(inherited.recycled).toBe(shader.recycled);expect(s.fx.debugState().shaderPool).toEqual(pool);expect(s.pointed).toHaveLength(pointed);expect(s.rotated).toHaveLength(rotated);probe=s.scene.begin();expect(probe.allocateCloneName('probe')).toBe(nextName);probe.rollback();
 });
 it('fresh barrel bang requires a declared inherited shader, consumes only its model name, and runs exactly16 guarded null-attacker callbacks',()=>{
  const s=setup(),seed=initialShader(),clone=s.backend.clonePlane;delete seed.renderFormat;s.backend.clonePlane=(name,width)=>({...clone(name,width),initialShader:seed});let tx=s.begin();tx.visual.birth({kind:'bang',id:'barrel',position:point,type:'barrel'},goody);const born=tx.owner.birth({actorId:'next',targetFeet:point,targetYaw:0,callback:0});tx.commit();expect(born.giHandle).toBe('gi:baddy2');expect(s.fx.freezeModels()[0]).toMatchObject({handle:'plane1',shaderHandle:seed.handle,pose:{scale:3,rotation}});expect(s.fx.freezeShaders()[0].renderFormat).toBe('rgba8888');expect(s.fx.debugState().shaderPool).toEqual([]);
  tx=s.begin();expect(tx.visual.step(null)).toEqual([]);expect(tx.visual.step(null)).toEqual([]);tx.commit();expect(s.fx.debugState().actors[0].time).toBe(16);const effects:OriginalReceiverTransientEffect[]=[];tx=s.begin();for(let i=0;i<15;i++)effects.push(...tx.visual.step(goody));tx.commit();expect(s.fx.freezeModels()[0].inWorld).toBe(true);expect(s.fx.debugState().actors[0].time).toBe(1);tx=s.begin();effects.push(...tx.visual.step(goody));tx.commit();expect(effects).toHaveLength(16);expect(effects.every(e=>e.kind==='bang-hurt'&&e.effectId==='barrel'&&e.attackerName===null&&e.amount===5&&e.radiusSource===250)).toBe(true);expect(s.fx.freezeModels()[0].inWorld).toBe(false);expect(s.fx.debugState().shaderPool).toEqual([seed.handle]);
 });
 it('rejects a fresh barrel without seed atomically and allows the same paired allocator name on an explicitly seeded retry',()=>{
  const s=setup(),before={models:s.fx.freezeModels(),shaders:s.fx.freezeShaders(),state:s.fx.debugState(),ledger:s.scene.debugState()};let tx=s.begin();expect(()=>tx.visual.birth(barrel(),goody)).toThrow();expect(()=>tx.visual.commit()).toThrow('closed or failed');tx.rollback();expect({models:s.fx.freezeModels(),shaders:s.fx.freezeShaders(),state:s.fx.debugState(),ledger:s.scene.debugState()}).toEqual(before);const seed=initialShader(),clone=s.backend.clonePlane;s.backend.clonePlane=(name,width)=>({...clone(name,width),initialShader:seed});tx=s.begin();tx.visual.birth(barrel(),goody);tx.commit();expect(s.fx.freezeModels()[0].handle).toBe('plane1');expect(s.fx.freezeShaders()[0].handle).toBe(seed.handle);
 });
 it('copies a declared mutable shader seed and rejects malformed or conflicting seed identities without replacing an admitted shader',()=>{
  const s=setup(),seed=initialShader(),clone=s.backend.clonePlane;s.backend.clonePlane=(name,width)=>({...clone(name,width),initialShader:seed});let tx=s.begin();tx.visual.birth(barrel('first'),goody);tx.commit();const saved=s.fx.freezeShaders()[0];seed.handle='mutated';seed.texture='mutated';seed.textureScale.x=999;seed.texturePosition.y=999;expect(s.fx.freezeShaders()[0]).toEqual(saved);
  const conflicting={...saved,textureScale:{...saved.textureScale,x:99}};s.backend.clonePlane=(name,width)=>({...clone(name,width),initialShader:conflicting});const before={models:s.fx.freezeModels(),shaders:s.fx.freezeShaders(),state:s.fx.debugState()};tx=s.begin();expect(()=>tx.visual.birth(barrel('conflict'),goody)).toThrow();tx.rollback();expect({models:s.fx.freezeModels(),shaders:s.fx.freezeShaders(),state:s.fx.debugState()}).toEqual(before);
  const fresh=setup(),invalid=initialShader(),freshClone=fresh.backend.clonePlane;invalid.textureScale.x=NaN;fresh.backend.clonePlane=(name,width)=>({...freshClone(name,width),initialShader:invalid});const attempt=fresh.begin();expect(()=>attempt.visual.birth(barrel(),goody)).toThrow();attempt.rollback();expect(fresh.fx.freezeModels()).toEqual([]);expect(fresh.fx.freezeShaders()).toEqual([]);
 });
 it('preserves duplicate source shader-pool pushes when a recycled barrel retains an already queued shader',()=>{
  const s=setup({maxModels:8,maxActors:8,maxShaders:8,maxShaderPoolEntries:4});let tx=s.begin();tx.visual.birth(event('bang','rocket'),goody);for(let i=0;i<16;i++)tx.visual.step(goody);tx.commit();expect(s.fx.debugState().shaderPool).toEqual(['shad1']);tx=s.begin();tx.visual.birth(barrel(),goody);expect(tx.visual.freezeModels()[0].shaderHandle).toBe('shad1');for(let i=0;i<16;i++)tx.visual.step(goody);tx.commit();expect(s.fx.debugState().shaderPool).toEqual(['shad1','shad1']);expect(s.fx.debugState().planePool).toEqual(['plane1']);
 });
 it('preserves live shader aliasing when a barrel retains a queued shader that a later puff consumes',()=>{
  const s=setup({maxModels:8,maxActors:8,maxShaders:8,maxShaderPoolEntries:4});let tx=s.begin();tx.visual.birth(event('bang','old'),goody);for(let i=0;i<16;i++)tx.visual.step(goody);tx.commit();tx=s.begin();tx.visual.birth(barrel(),goody);tx.visual.birth(event('puff','puff'),goody);tx.commit();expect(s.fx.freezeModels().map(m=>m.shaderHandle)).toEqual(['shad1','shad1']);expect(s.fx.freezeShaders()).toHaveLength(1);expect(s.fx.freezeShaders()[0].texture).toBe('pufft');expect(s.fx.debugState().shaderPool).toEqual([]);
  tx=s.begin();tx.visual.stepActor('barrel',goody);tx.commit();expect(s.fx.freezeShaders()[0].texturePosition).toEqual({x:-1,y:0,z:0});expect(s.fx.debugState().actors.find(a=>a.id==='puff')!.time).toBe(0);tx=s.begin();tx.visual.stepActor('puff',null);tx.commit();expect(s.fx.freezeShaders()[0].blend).toBeCloseTo(96.7,12);expect(s.fx.freezeModels().map(m=>m.shaderHandle)).toEqual(['shad1','shad1']);expect(s.fx.debugState().actors.find(a=>a.id==='barrel')!.time).toBe(15);
 });
 it('rejects duplicate shader-pool capacity at retirement and rolls back the callback plus paired GI allocator/birth',()=>{
  const s=setup({maxModels:8,maxActors:8,maxShaders:8,maxShaderPoolEntries:1});let tx=s.begin();tx.visual.birth(event('bang','rocket'),goody);for(let i=0;i<16;i++)tx.visual.step(goody);tx.commit();tx=s.begin();tx.visual.birth(barrel(),goody);for(let i=0;i<15;i++)tx.visual.step(goody);tx.commit();const before={models:s.fx.freezeModels(),shaders:s.fx.freezeShaders(),state:s.fx.debugState(),owned:s.scene.freezeModels(),ledger:s.scene.debugState()};tx=s.begin();expect(tx.owner.birth({actorId:'staged',targetFeet:point,targetYaw:0,callback:0}).giHandle).toBe('gi:baddy3');expect(()=>tx.visual.step(goody)).toThrow();expect(()=>tx.visual.commit()).toThrow('closed or failed');tx.rollback();expect({models:s.fx.freezeModels(),shaders:s.fx.freezeShaders(),state:s.fx.debugState(),owned:s.scene.freezeModels(),ledger:s.scene.debugState()}).toEqual(before);const probe=s.scene.begin();expect(probe.allocateCloneName('probe')).toBe('probe3');probe.rollback();
 });
});
