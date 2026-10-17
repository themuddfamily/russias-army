import * as THREE from 'three';
import {readFileSync} from 'node:fs';
import {describe,expect,it,vi} from 'vitest';
import {Game} from './game';
import {WeaponState} from './weapons';
import {OriginalWeaponPresentation,ORIGINAL_WEAPON_UNIT_SCALE} from './originalWeaponPresentation';
import {createOriginalWeapons,ORIGINAL_WEAPON_TEXTURES,type OriginalWeaponGeometryData} from './originalWeapons';
import {createOriginalSoloCurrentSceneLease} from '../shared/originalSoloCurrentSceneProducer';
import {OriginalSoloObserverWorlds,type OriginalSoloEvent,type OriginalSoloReceiverSceneLease} from '../shared/originalSoloObserverWorld';
import {OriginalReceiverLocalWeaponWorld,type ReceiverLocalWeaponWorldCheckpoint} from '../shared/originalReceiverLocalWeaponWorld';
import {createOriginalReceiverLocalWeaponInventory,ORIGINAL_RECEIVER_LOCAL_WEAPON_RESOURCES,type ReceiverLocalWeaponModelCapture} from '../shared/originalReceiverLocalWeaponInventory';
import {registerOriginalMapRuntime} from '../shared/originalMapRuntime';
import {originalPlayerEye} from '../shared/originalPlayerPhysics';
import type {ReceiverModelBackend,ReceiverModelPose} from '../shared/originalReceiverModelWorld';

const geometry=JSON.parse(readFileSync(new URL('../public/assets/original-weapons/geometry.json',import.meta.url),'utf8')) as OriginalWeaponGeometryData;
const runtime=registerOriginalMapRuntime('woodlands',JSON.parse(readFileSync(new URL('../public/assets/original-scenes/woodland/scene.json',import.meta.url),'utf8')));
const resourceToWorld=(camera:readonly number[],position={x:0,y:0,z:0})=>new THREE.Matrix4().fromArray([...camera]).multiply(new THREE.Matrix4().compose(new THREE.Vector3(position.x,position.y,position.z).multiplyScalar(runtime.scale),new THREE.Quaternion(),new THREE.Vector3(runtime.scale,runtime.scale,runtime.scale))).toArray();
// Real producer, CURRENT/local bank, coordinator and Game handler; explicitly
// complete declared CPU local-weapon inventory only, not full native geometry.
function fixture(enhancedRendering=false){
 const textures=new Map(ORIGINAL_WEAPON_TEXTURES.map(name=>[name,new THREE.Texture()]));
 const collection=createOriginalWeapons({geometry,textures}),camera=new THREE.PerspectiveCamera(),viewCamera=new THREE.PerspectiveCamera(),viewModel=new THREE.Group(),viewProjection=new THREE.Group();camera.position.set(30,40,50);camera.rotation.set(.1,.3,.2);viewCamera.position.set(1,2,3);viewCamera.rotation.set(.2,-.1,.3);
 if(enhancedRendering)viewCamera.add(viewModel);else{camera.add(viewProjection);viewProjection.add(viewModel);}for(const model of collection.models.values())viewModel.add(model);camera.updateMatrixWorld(true);viewCamera.updateMatrixWorld(true);
 const client=Object.assign(Object.create(Game.prototype),{phase:'playing',mode:'solo',mapId:'woodlands',archivalWinter:false,playerAlive:true,enhancedRendering,elapsed:1,arena:{runtime},camera,viewCamera,viewProjection,viewModel,originalWeapons:collection,originalWeaponPresentation:new OriginalWeaponPresentation('rifle'),weaponState:new WeaponState('woodlands'),controlsPreset:'legacy',keys:new Set(),chatOpen:false,firing:false,updateHud:vi.fn(),setMessage:vi.fn(),playOriginalCombatSound:vi.fn(),velocity:new THREE.Vector3(),enemies:[],projectiles:[],soloCorpses:new Map(),soloDetachedFlashes:[],soloBotShots:[],originalBlasts:[],el:()=>({style:{setProperty:vi.fn()},classList:{toggle:vi.fn()}})});
 const events:OriginalSoloEvent[]=[],reads:string[]=[],records=new Map<string,{lease:OriginalSoloReceiverSceneLease;bank?:OriginalReceiverLocalWeaponWorld}>();
 const flags={stateError:false,malformed:false};
 const worlds=new OriginalSoloObserverWorlds(runtime,{onEvent:event=>{events.push(event);reads.push(`event:${event.kind}`);if(event.kind==='local-weapon-state')client.receiveSoloWorldEvent(event);},createReceiverScene:registration=>{
  const record={lease:undefined as unknown as OriginalSoloReceiverSceneLease,bank:undefined as OriginalReceiverLocalWeaponWorld|undefined};records.set(registration.id,record);
  const pose:ReceiverModelPose={position:{x:0,y:0,z:0},yaw:0,phase:0,scale:1,rotation:{x:0,y:0,z:0,w:1}};
  const model:ReceiverModelBackend={cloneGI:()=>({pose,geometryProvenance:'declared-GI'}),cloneGun:()=>({pose,geometryProvenance:'declared-gun'}),sphere:()=>({bspWorld:1,provenance:'declared-resource'}),heldGunPose:()=>pose,reparentGunMembership:()=>true,dropYaw:()=>0,nearestDetailedDownward:()=>({hit:null,coverage:{complete:true,missing:[],provenance:'declared-local-CPU-oracle'}})};
  const provider=createOriginalReceiverLocalWeaponInventory(geometry,{sceneGeneration:registration.lifeGeneration,maxModels:7,maxVertices:100000,maxFaces:100000,provenance:'declared-local-only-CPU-oracle',sidedness:'double'});
  record.lease=createOriginalSoloCurrentSceneLease({sourceScale:runtime.scale,maxCapturedBlasts:8,maxCapturedProjectiles:8,environment:{maxCommands:16,maxOutcomes:16,maxModels:128,maxTextChars:65536},controller:{model:{eyeHeight:runtime.profile.eyeHeight,goodyBspWorld:50*runtime.scale,maxModels:128,maxPickups:32},transient:{maxModels:32,maxActors:32,maxShaders:32},maxEffects:64},createBackends:context=>{
   const cameraWorldMatrix=camera.matrixWorld.toArray(),weapon=context.weapon!;
   const initial:ReceiverLocalWeaponWorldCheckpoint={prefix:{kind:'callback',sceneGeneration:context.lifeGeneration,callback:0},cameraHandle:'private-camera',cameraWorldMatrix,selectedWeapon:weapon,loadedRocket:false,motion:{weapon,ticker:1,gunPositionSource:{x:-12,y:-20,z:5}},models:Object.entries(ORIGINAL_RECEIVER_LOCAL_WEAPON_RESOURCES).map(([handle,resource])=>({handle:handle as ReceiverLocalWeaponModelCapture['handle'],resource,worldMatrix:resourceToWorld(cameraWorldMatrix),inWorld:handle==='ak47'||handle==='rocket',groupAncestry:['private-camera']}))};
   record.bank=new OriginalReceiverLocalWeaponWorld(initial,{sourceScale:runtime.scale,maxCommands:32,maxTextChars:8192,bindModels:(operation,state)=>{
    const models=operation.kind==='position'?state.models.map(m=>m.handle==='ak47'?{...m,worldMatrix:resourceToWorld(state.cameraWorldMatrix,operation.positionSource)}:m):state.models;
    return {models,loadedRocket:state.loadedRocket};
   }});
   return {model,transient:{clonePlane:()=>({pose,geometryProvenance:'declared-plane',inWorld:true}),cloneMuzzle:()=>({pose,geometryProvenance:'declared-muzzle',inWorld:true}),pointAt:()=>pose.rotation!,selfRotate:q=>q},localWeaponWorld:record.bank};
  },captureLocalWeaponCallback:()=>({cameraWorldMatrix:camera.matrixWorld.toArray(),velocityWorld:{x:0,y:0,z:0},commands:[]}),goodyAt:context=>context.alive?{eyePosition:originalPlayerEye(context.body),modelPosition:originalPlayerEye(context.body),bspWorld:50*runtime.scale,weapon:context.weapon!}:null,snapshotAt:(prefix,state)=>{const snapshot=provider.snapshotAt(prefix,state.localWeapons!);return {prefix,models:snapshot.models,missing:[],provenance:snapshot.provenance};}});
  return {...record.lease,drainOutcomes:()=>{reads.push('read:hurt');return record.lease.drainOutcomes!();},readLocalWeaponState:()=>{reads.push('read:local');if(flags.stateError)throw Error('read failed');const checkpoint=record.lease.readLocalWeaponState!();if(flags.malformed&&checkpoint)return {...checkpoint,prefix:{...checkpoint.prefix,callback:999}};return checkpoint;}};
 }});
 client.soloWorlds=worlds;const player=worlds.register({id:'player',name:'Local',eye:{x:1000,y:1000,z:1000}});player.weapon='rifle';
 const cycle=(n=1)=>{client.elapsed=n/30;worlds.physics(n/30,{skipIds:new Set(worlds.worlds.keys())});worlds.goody('player');worlds.completeGoody(n/30);worlds.actors(n/30);};
 return {client,worlds,player,collection,events,reads,records,flags,cycle,dispose(){client.disposeSoloWorlds(false);collection.dispose();}};
}
function pointClose(a:THREE.Vector3,b:THREE.Vector3){expect(a.distanceTo(b)).toBeLessThan(1e-4);}

describe('actual producer/local bank through coordinator to Game resource rendering',()=>{
 for(const enhanced of [false,true])it(`${enhanced?'overlay':'world'} renderer consumes committed source matrices once`,()=>{
  const f=fixture(enhanced);try{
   f.cycle();const checkpoint=f.player.localWeapons!,event=f.events.find(e=>e.kind==='local-weapon-state')!;
   expect(event).toMatchObject({kind:'local-weapon-state',lifeGeneration:1});expect((event as Extract<OriginalSoloEvent,{kind:'local-weapon-state'}>).checkpoint).toBe(checkpoint);expect(checkpoint).toEqual(f.records.get('player')!.bank!.freeze());expect(checkpoint).not.toBe(f.records.get('player')!.bank!.freeze());
   expect(f.reads.indexOf('read:local')).toBeLessThan(f.reads.indexOf('event:local-weapon-state'));expect(f.collection.rocket.visible).toBe(true);expect(checkpoint.loadedRocket).toBe(false);
   const model=checkpoint.models.find(m=>m.handle==='ak47')!,mesh=f.collection.resources.get('ak47')!,raw=geometry.meshes.find(g=>g.resource==='ak47')!.positions[0];
   const rendered=new THREE.Vector3().fromBufferAttribute(mesh.geometry.getAttribute('position'),0).applyMatrix4(mesh.matrixWorld);
   const expected=new THREE.Vector3().fromArray(raw).applyMatrix4(new THREE.Matrix4().fromArray([...model.worldMatrix]));
   if(enhanced)expected.applyMatrix4(new THREE.Matrix4().fromArray([...checkpoint.cameraWorldMatrix]).invert()).applyMatrix4(f.client.viewCamera.matrixWorld);
   pointClose(rendered,expected);expect(f.client.originalWeaponPresentation.ticker).toBe(checkpoint.motion.ticker);
  }finally{f.dispose();}
 });
 it('legacy render refresh cannot age motion, reposition resources or derive rocket membership from ammo',()=>{
  const f=fixture();try{f.cycle();const mesh=f.collection.resources.get('ak47')!,matrix=mesh.matrix.clone(),ticker=f.client.originalWeaponPresentation.ticker,update=vi.spyOn(f.client.originalWeaponPresentation,'update'),load=vi.spyOn(f.collection,'setLoaded');f.client.weaponState.ammo.rpg=0;f.client.updateOriginalWeaponPresentation(1);expect(update).not.toHaveBeenCalled();expect(load).not.toHaveBeenCalled();expect(mesh.matrix.equals(matrix)).toBe(true);expect(f.client.originalWeaponPresentation.ticker).toBe(ticker);expect(f.collection.rocket.visible).toBe(true);}finally{f.dispose();}
 });
 it('the nominal gun callback and legacy equip/reload/fire entries preserve adopted presentation',()=>{
  const f=fixture();try{f.cycle();const p=f.client.originalWeaponPresentation,ticker=p.ticker,position=p.sourcePosition.clone(),model=f.collection.resources.get('ak47')!,matrix=model.matrix.clone(),loaded=vi.spyOn(f.collection,'setLoaded'),reload=vi.spyOn(p,'reload'),fire=vi.spyOn(p,'fire');
   f.client.weaponState.select('rifle');f.client.updateSourceWeaponInput();f.client.syncWeaponPresentation('rpg',true);f.client.reload();f.client.triggerViewModelFire('rifle');
   expect(loaded).not.toHaveBeenCalled();expect(reload).not.toHaveBeenCalled();expect(fire).not.toHaveBeenCalled();expect(p.ticker).toBe(ticker);expect(p.sourcePosition.equals(position)).toBe(true);expect(model.matrix.equals(matrix)).toBe(true);expect(f.collection.rocket.visible).toBe(true);
  }finally{f.dispose();}
 });
 it('captures muzzle geometry WORLD from the committed resource without wrapper or overlay camera duplication',()=>{
  const f=fixture(true);try{f.cycle();const model=f.player.localWeapons!.models.find(m=>m.handle==='ak47')!,world=f.client.captureOriginalMuzzleWorld('rifle') as THREE.Matrix4;
   const p=new THREE.Vector3(2,3,4);pointClose(p.clone().multiplyScalar(ORIGINAL_WEAPON_UNIT_SCALE).applyMatrix4(world),p.clone().applyMatrix4(new THREE.Matrix4().fromArray([...model.worldMatrix])));
  }finally{f.dispose();}
 });
 it('keeps terminal poses frozen with restoration ownership until a real reset restores original wrappers',()=>{
  const f=fixture();f.cycle();const mesh=f.collection.resources.get('ak47')!,matrix=mesh.matrix.clone();f.client.disposeSoloWorlds(true);expect(mesh.parent).toBe(f.client.viewModel);expect(mesh.matrix.equals(matrix)).toBe(true);expect(f.client.soloLocalWeaponPresentation.frozen).toBe(true);f.client.updateOriginalWeaponPresentation(1);expect(mesh.matrix.equals(matrix)).toBe(true);f.dispose();expect(mesh.parent).toBeNull();
 });
 it('restoration errors do not strand private worlds or owned banks during actual reset',()=>{
  const f=fixture();f.cycle();const adapter=f.client.soloLocalWeaponPresentation.adapter,release=adapter.release.bind(adapter);vi.spyOn(adapter,'release').mockImplementation(()=>{release();throw Error('restoration listener failed');});
  expect(()=>f.client.disposeSoloWorlds(false)).toThrow();expect(f.client.soloWorlds).toBeUndefined();expect(f.client.soloLocalWeaponPresentation).toBeUndefined();expect(f.worlds.worlds.size).toBe(0);expect(()=>f.records.get('player')!.bank!.freeze()).toThrow();f.collection.dispose();
 });
 it('ignores a copied stale checkpoint and another generation in the Game event adapter',()=>{
  const f=fixture();try{f.cycle();const event=f.events.find(e=>e.kind==='local-weapon-state') as Extract<OriginalSoloEvent,{kind:'local-weapon-state'}>,mesh=f.collection.resources.get('ak47')!,before=mesh.matrix.clone();f.client.receiveSoloWorldEvent({...event,checkpoint:{...event.checkpoint,models:event.checkpoint.models.map(m=>({...m,worldMatrix:new THREE.Matrix4().makeTranslation(999,999,999).toArray()}))}});f.client.receiveSoloWorldEvent({...event,lifeGeneration:999});expect(mesh.matrix.equals(before)).toBe(true);}finally{f.dispose();}
 });
 it('rejects a future committed-state prefix after commit without emitting or rendering it',()=>{
  const f=fixture();try{f.flags.malformed=true;expect(()=>f.cycle()).toThrow();expect(f.player.callback).toBe(1);expect(f.player.localWeapons).toBeUndefined();expect(f.events.some(e=>e.kind==='local-weapon-state')).toBe(false);expect(f.collection.resources.get('ak47')!.parent).toBe(f.collection.models.get('rifle'));}finally{f.dispose();}
 });
 it('reports a local read failure after commit and can deliver the next actual checkpoint without replay',()=>{
  const f=fixture();try{f.flags.stateError=true;expect(()=>f.cycle()).toThrow();expect(f.player.callback).toBe(1);expect(f.reads).toContain('read:hurt');expect(f.events.some(e=>e.kind==='local-weapon-state')).toBe(false);f.worlds.actors(1/30);f.flags.stateError=false;f.cycle(2);expect(f.events.filter(e=>e.kind==='local-weapon-state')).toHaveLength(1);expect(f.player.localWeapons!.prefix.callback).toBe(2);}finally{f.dispose();}
 });
});
