import {describe,expect,it} from 'vitest';
import {OriginalReceiverProjectileWorld,type ReceiverProjectileWorldCheckpoint,type ReceiverProjectileWorldModel,type ReceiverProjectileWorldTransaction} from './originalReceiverProjectileWorld';
import {OriginalReceiverModelWorld,type ReceiverModelBackend} from './originalReceiverModelWorld';
import type {ReceiverScenePrefix} from './originalReceiverPrefix';

const matrix=(x=0)=>[1,0,0,0,0,1,0,0,0,0,1,0,x,2,3,1];
const callback=(n=0):ReceiverScenePrefix=>({kind:'callback',sceneGeneration:3,callback:n});
const receipt=(tick=0):ReceiverScenePrefix=>({kind:'receipt',sceneGeneration:3,callback:0,tick});
const model=(handle='retained',inWorld=true):ReceiverProjectileWorldModel=>({handle,resource:'rg6grenade',materialHandle:'explicit-material',inWorld,worldMatrix:matrix(),groupAncestry:['declared-parent']});
const seed=(pooled=false):ReceiverProjectileWorldCheckpoint=>({prefix:callback(),template:model('grenade',false),catalog:[{handle:'retained',weapon:'launcher'}],models:[model('retained',!pooled)],actors:pooled?[]:[{launchId:'private-launch',handle:'retained',weapon:'launcher'}],fifo:{launcher:pooled?['retained']:[],rpg:[]}});
const options={maxModels:8,maxActors:4,maxCommands:16,maxTextChars:4096,rocketMaterialHandle:'explicit-rpg-material'};
const bank=(checkpoint=seed())=>new OriginalReceiverProjectileWorld(checkpoint,options);
function assertPoisoned(tx:ReceiverProjectileWorldTransaction,world:OriginalReceiverProjectileWorld,before:ReceiverProjectileWorldCheckpoint){expect(()=>tx.prepareCommit()).toThrow();expect(()=>tx.commit()).toThrow();tx.rollback();expect(world.freeze()).toBe(before);}

// Standalone explicit CPU ownership captures. These regressions do not prove
// native clone transforms, physics, renderer behavior or actor chronology.
describe('standalone private projectile input read guards',()=>{
 it('poisons caught prepare inside a live pose getter while allowing frozen query reads',()=>{
  const world=bank(),before=world.freeze(),tx=world.begin(),incoming=model();let reads=0;
  Object.defineProperty(incoming,'worldMatrix',{get:()=>{reads++;expect(tx.freeze()).toBe(before);expect(tx.snapshotAt(callback()).expectedHandles).toEqual(['grenade','retained']);try{tx.prepareCommit();}catch{/* A caught nested prepare must remain fatal. */}return matrix(10);}});
  expect(()=>tx.capturePose('private-launch',incoming)).toThrow();expect(reads).toBe(1);assertPoisoned(tx,world,before);
  const retry=world.begin();retry.capturePose('private-launch',{...model(),worldMatrix:matrix(10)});retry.commit();expect(world.freeze().models[0].worldMatrix[12]).toBe(10);expect(before.models[0].worldMatrix[12]).toBe(0);
 });
 it('rejects recursive model mutation from a template input getter without changing template or ownership',()=>{
  const world=bank(),before=world.freeze(),tx=world.begin(),incoming=model('grenade',false);Object.defineProperty(incoming,'materialHandle',{get:()=>{expect(tx.freeze().actors).toEqual(before.actors);try{tx.captureModel('retained',{...model(),worldMatrix:matrix(99)});}catch{/* Nested mutation cannot succeed or be hidden by catching. */}return 'new-template-material';}});
  expect(()=>tx.captureModel('grenade',incoming)).toThrow();assertPoisoned(tx,world,before);
 });
 it('rejects caught commit from a pooled model getter and preserves independent FIFO/catalog records',()=>{
  const world=bank(seed(true)),before=world.freeze(),tx=world.begin(),incoming=model('retained',false);Object.defineProperty(incoming,'groupAncestry',{get:()=>{expect(tx.snapshotAt(callback()).models.every(m=>!m.inWorld)).toBe(true);try{tx.commit();}catch{/* Commit cannot seal a capture in progress. */}return ['changed-parent'];}});
  expect(()=>tx.captureModel('retained',incoming)).toThrow();assertPoisoned(tx,world,before);expect(world.freeze().fifo.launcher).toEqual(['retained']);
 });
 it('guards whole receipt and callback admission against caught scalar-getter prepare reentry',()=>{
  for(const kind of ['receipt','callback'] as const){const world=bank(),before=world.freeze(),tx=world.begin();let reads=0;const incoming={kind,sceneGeneration:3,get callback(){reads++;expect(tx.freeze()).toBe(before);try{tx.prepareCommit();}catch{/* No prepared publication may escape prefix decoding. */}return kind==='receipt'?0:1;},...(kind==='receipt'?{tick:0}:{})} as ReceiverScenePrefix;
   expect(()=>kind==='receipt'?tx.applyReceipt(incoming):tx.advanceCallback(incoming)).toThrow();expect(reads).toBe(1);assertPoisoned(tx,world,before);const retry=world.begin();if(kind==='receipt')retry.applyReceipt(receipt());else retry.advanceCallback(callback(1));retry.commit();expect(world.freeze().prefix).toEqual(kind==='receipt'?receipt():callback(1));}
 });
 it('copies live and pooled model identity, membership and finite matrix scalars once before checking or storing',()=>{
  for(const pooled of [false,true]){const world=bank(seed(pooled)),tx=world.begin(),incoming=model('retained',!pooled),reads={handle:0,resource:0,inWorld:0,material:0,matrix:0,x:0};const values=matrix(15);
   Object.defineProperty(values,12,{get:()=>++reads.x===1?15:Infinity});Object.defineProperties(incoming,{handle:{get:()=>++reads.handle===1?'retained':'foreign'},resource:{get:()=>++reads.resource===1?'rg6grenade':'rpgrocket'},inWorld:{get:()=>++reads.inWorld===1?!pooled:pooled},materialHandle:{get:()=>++reads.material===1?'captured-once':''},worldMatrix:{get:()=>{reads.matrix++;return values;}}});
   if(pooled)tx.captureModel('retained',incoming);else tx.capturePose('private-launch',incoming);tx.commit();expect(reads).toEqual({handle:1,resource:1,inWorld:1,material:1,matrix:1,x:1});expect(world.freeze().models[0]).toMatchObject({handle:'retained',resource:'rg6grenade',inWorld:!pooled,materialHandle:'captured-once'});expect(world.freeze().models[0].worldMatrix[12]).toBe(15);}
 });
 it('validates and commits the same copied receipt key and seeds replay protection from the copied checkpoint',()=>{
  const input=seed();let seedPrefixReads=0;Object.defineProperty(input,'prefix',{get:()=>++seedPrefixReads===1?receipt():receipt(99)});const world=bank(input);expect(seedPrefixReads).toBe(1);const tx=world.begin();let cbReads=0,tickReads=0,kindReads=0;const incoming={get kind(){return ++kindReads===1?'receipt':'callback';},sceneGeneration:3,get callback(){return ++cbReads===1?0:1;},get tick(){return ++tickReads===1?1:2;}} as ReceiverScenePrefix;tx.applyReceipt(incoming);tx.commit();expect([kindReads,cbReads,tickReads]).toEqual([1,1,1]);expect(world.freeze().prefix).toEqual(receipt(1));const replay=world.begin();expect(()=>replay.applyReceipt(receipt(1))).toThrow();replay.rollback();
 });
 it('uses bounded indexed copies instead of caller-provided iterators or array validation methods',()=>{
  let accesses=0;function hostile<T>(array:T[]):T[]{Object.defineProperty(array,Symbol.iterator,{get:()=>{accesses++;throw Error('foreign iterator');}});Object.defineProperty(array,'map',{get:()=>{accesses++;throw Error('foreign map');}});Object.defineProperty(array,'every',{get:()=>{accesses++;throw Error('foreign every');}});return array;}
  const input=seed(),checkpoint:ReceiverProjectileWorldCheckpoint={...input,catalog:hostile([...input.catalog]),models:hostile([...input.models]),actors:hostile([...input.actors]),fifo:{launcher:hostile([]),rpg:hostile([])},template:{...input.template,worldMatrix:hostile(matrix()),groupAncestry:hostile(['declared-parent'])}};
  const world=bank(checkpoint),tx=world.begin();tx.capturePose('private-launch',{...model(),worldMatrix:hostile(matrix(9)),groupAncestry:hostile(['new-parent'])});tx.commit();expect(accesses).toBe(0);expect(world.freeze().models[0].worldMatrix[12]).toBe(9);
 });
 it('copies fresh clone and reset observations once before checking the shared allocated name and family',()=>{
  const empty={...seed(),catalog:[],models:[],actors:[],fifo:{launcher:[],rpg:[]}},world=bank(empty),tx=world.begin({allocateCloneName:()=> 'grenade7'});let cloneReads=0,resetReads=0;
  tx.birth({launchId:'new-private-launch',weapon:'launcher',cloneFresh:name=>{expect(name).toBe('grenade7');const capture=model(name,false);Object.defineProperty(capture,'handle',{get:()=>++cloneReads===1?'grenade7':'wrong-name'});return capture;},resetModel:retained=>{expect(tx.freeze().constructing).toEqual({launchId:'new-private-launch',handle:'grenade7',weapon:'launcher'});const capture={...retained,worldMatrix:matrix(22)};Object.defineProperty(capture,'resource',{get:()=>++resetReads===1?'rg6grenade':'rpgrocket'});return capture;}});tx.commit();expect([cloneReads,resetReads]).toEqual([1,1]);expect(world.freeze().catalog).toEqual([{handle:'grenade7',weapon:'launcher'}]);expect(world.freeze().models[0]).toMatchObject({handle:'grenade7',resource:'rg6grenade',inWorld:true});
 });
 it('cancels a prepared bank on release while the caller separately rolls back its real shared allocator',()=>{
  const pose={position:{x:0,y:0,z:0},yaw:0,phase:0,scale:1},backend:ReceiverModelBackend={cloneGI:()=>({pose,geometryProvenance:'declared-GI'}),cloneGun:()=>({pose,geometryProvenance:'declared-gun'}),sphere:()=>({bspWorld:1,provenance:'declared-resource'}),heldGunPose:gi=>gi.pose,reparentGunMembership:()=>true,dropYaw:()=>0,nearestDetailedDownward:()=>({hit:null,coverage:{complete:true,missing:[],provenance:'declared-no-query'}})};
  const allocator=new OriginalReceiverModelWorld(backend,{eyeHeight:1,sourceScale:.02,goodyBspWorld:1,sceneGeneration:3,maxModels:8,maxPickups:4}),world=bank({...seed(),catalog:[],models:[],actors:[],fifo:{launcher:[],rpg:[]}}),owner=allocator.begin(),tx=world.begin(owner);expect(tx.birth({launchId:'first',weapon:'launcher',cloneFresh:name=>model(name,false),resetModel:retained=>retained})).toBe('grenade1');const publish=tx.prepareCommit();world.release();publish();tx.commit();expect(()=>world.freeze()).toThrow('released');owner.rollback();const retry=allocator.begin();expect(retry.allocateCloneName('grenade')).toBe('grenade1');retry.rollback();world.release();
 });
 it('locks allocator acquisition before getter reentry and frees the lock on rejection without reopening a released bank',()=>{
  for(const mode of ['nested-begin','release','throw']){
   const world=bank(),before=world.freeze();let reads=0;
   const allocator={get allocateCloneName(){reads++;expect(world.snapshotAt(callback()).expectedHandles).toEqual(['grenade','retained']);
    if(mode==='nested-begin'){try{world.begin();}catch{/* Caught acquisition reentry must invalidate the outer acquisition. */}}
    if(mode==='release')world.release();
    if(mode==='throw')throw Error('allocator field failed');
    return ()=> 'grenade1';
   }};
   expect(()=>world.begin(allocator)).toThrow();expect(reads).toBe(1);
   if(mode==='release'){expect(()=>world.freeze()).toThrow('released');expect(()=>world.begin()).toThrow('released');}
   else{expect(world.freeze()).toBe(before);const retry=world.begin();retry.rollback();}
  }
  const world=bank();let reads=0;const tx=world.begin({get allocateCloneName(){reads++;return ()=> 'grenade1';}});expect(reads).toBe(1);tx.rollback();
 });

});
