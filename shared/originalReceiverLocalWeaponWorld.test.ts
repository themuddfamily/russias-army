import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {describe,expect,it} from 'vitest';
import {OriginalReceiverLocalWeaponWorld,type ReceiverLocalWeaponBindingOperation,type ReceiverLocalWeaponWorldCheckpoint,type ReceiverLocalWeaponWorldOptions} from './originalReceiverLocalWeaponWorld';
import {createOriginalReceiverLocalWeaponInventory,ORIGINAL_RECEIVER_LOCAL_WEAPON_RESOURCES,type ReceiverLocalWeaponModelCapture} from './originalReceiverLocalWeaponInventory';
import {advanceOriginalWeaponMotion,createOriginalWeaponMotion,ORIGINAL_WEAPON_POSES} from './originalWeaponMotion';
import {OriginalWeaponPresentation,ORIGINAL_WEAPON_ROTATION,ORIGINAL_WEAPON_UNIT_SCALE} from '../src/originalWeaponPresentation';
import type {ReceiverWeaponGeometry} from './originalReceiverActorResources';
import type {ReceiverScenePrefix} from './originalReceiverPrefix';
import type {WeaponId} from './protocol';
import {registerOriginalMapRuntime} from './originalMapRuntime';
import type {OriginalSceneData} from './originalSceneGeometry';

const scale=ORIGINAL_WEAPON_UNIT_SCALE;
const I=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
const matrix=(x=0)=>{const m=[...I];m[12]=x;return m;};
const receipt=(tick=0,callback=0):ReceiverScenePrefix=>({kind:'receipt',sceneGeneration:4,callback,tick});
const callback=(n=1):ReceiverScenePrefix=>({kind:'callback',sceneGeneration:4,callback:n});
const resources={rifle:'ak47',shotgun:'spas12',pistol:'pistol',sniper:'dragunov',launcher:'rg6',rpg:'rpg'} as const;
const seed=(offset=0):ReceiverLocalWeaponWorldCheckpoint=>({prefix:receipt(),cameraHandle:'private-camera',cameraWorldMatrix:matrix(offset),selectedWeapon:'rifle',loadedRocket:false,motion:{weapon:'rifle',ticker:1,gunPositionSource:{x:-12,y:-20,z:5}},models:Object.entries(ORIGINAL_RECEIVER_LOCAL_WEAPON_RESOURCES).map(([handle,resource])=>({handle:handle as ReceiverLocalWeaponModelCapture['handle'],resource,worldMatrix:matrix(offset+100),inWorld:handle==='ak47',groupAncestry:handle==='ak47'?['private-camera']:['declared-template']}))});
const gun=(state:ReceiverLocalWeaponWorldCheckpoint,handle='ak47')=>state.models.find(m=>m.handle===handle)!;
// This pure binding policy is explicitly declared by the fixture. It proves
// ordering/raw→WORLD conversion, not native clone offsets or parent setters.
function binding(operation:ReceiverLocalWeaponBindingOperation,previous:ReceiverLocalWeaponWorldCheckpoint){
 let models=previous.models,loadedRocket=previous.loadedRocket;
 if(operation.kind==='whichgun')models=models.map(m=>m.handle==='rocket'?m:{...m,inWorld:operation.weapon!==null&&m.handle===resources[operation.weapon],groupAncestry:operation.weapon!==null&&m.handle===resources[operation.weapon]?['private-camera']:['declared-template']});
 if(operation.kind==='rocket'){loadedRocket=operation.loadedRocket;models=models.map(m=>m.handle==='rocket'?{...m,inWorld:operation.loadedRocket,groupAncestry:operation.loadedRocket?['private-camera']:['declared-template']}:m);}
 if(operation.kind==='position'){
  const p=operation.positionSource,world=new THREE.Matrix4().fromArray([...previous.cameraWorldMatrix]).multiply(new THREE.Matrix4().compose(new THREE.Vector3(p.x*scale,p.y*scale,p.z*scale),new THREE.Quaternion().setFromEuler(ORIGINAL_WEAPON_ROTATION),new THREE.Vector3(scale,scale,scale))).toArray();
  models=models.map(m=>m.handle===resources[operation.weapon]?{...m,worldMatrix:world}:m);
 }
 return {models,loadedRocket};
}
function fixture(offset=0,extra:Partial<ReceiverLocalWeaponWorldOptions>={}){
 const operations:ReceiverLocalWeaponBindingOperation[]=[],previous:ReceiverLocalWeaponWorldCheckpoint[]=[];
 const world=new OriginalReceiverLocalWeaponWorld(seed(offset),{sourceScale:scale,maxCommands:16,maxTextChars:8192,bindModels:(op,state)=>{operations.push(op);previous.push(state);return binding(op,state);},...extra});return {world,operations,previous};
}
const decoded=()=>JSON.parse(readFileSync(new URL('../public/assets/original-weapons/geometry.json',import.meta.url),'utf8')) as ReceiverWeaponGeometry;
const inventory=()=>createOriginalReceiverLocalWeaponInventory(decoded(),{sceneGeneration:4,maxModels:7,maxVertices:100000,maxFaces:100000,provenance:'explicit-private-weapon-binding',sidedness:'double'});

describe('private local weapon callback bank (declared CPU binding, no native pose policy claim)',()=>{
 it('owns all seven explicit checkpoint models and exposes real decoded geometry without constructor binding',()=>{
  const initial=seed(),f=fixture(),geometry=decoded(),provider=inventory(),snapshot=provider.snapshotAt(receipt(),f.world.snapshotAt(receipt()));expect(f.operations).toEqual([]);expect(snapshot.models).toHaveLength(7);expect(snapshot.missing).toEqual([]);
  for(const model of snapshot.models)expect(snapshot.resolveModel(model.handle).positions).toEqual(geometry.meshes.find(m=>m.resource===model.resource)!.positions);
  const isolated=new OriginalReceiverLocalWeaponWorld(initial,{sourceScale:scale,maxCommands:16,maxTextChars:8192,bindModels:binding});(initial.models[0].worldMatrix as number[])[12]=999;expect(gun(isolated.freeze(),'pistol').worldMatrix[12]).toBe(100);expect(Object.isFrozen(isolated.freeze().models[0].worldMatrix)).toBe(true);
 });
 it('fire mutates recoil state while old gun WORLD remains until final callback assignment',()=>{
  const f=fixture(),old=gun(f.world.freeze()).worldMatrix,provider=inventory(),saved=provider.snapshotAt(receipt(),f.world.snapshotAt(receipt())),tx=f.world.begin();tx.beginCallback(callback(),matrix(20));tx.fire();expect(tx.freeze().motion.gunPositionSource).toEqual({x:3,y:-10,z:7});expect(gun(tx.freeze()).worldMatrix).toEqual(old);expect(f.operations.map(op=>op.kind)).toEqual(['camera']);
  tx.finishCallback(0);expect(f.operations.map(op=>op.kind)).toEqual(['camera','position']);expect(gun(tx.freeze()).worldMatrix[12]).toBeCloseTo(20+3*scale);expect(gun(tx.freeze()).worldMatrix[14]).toBeCloseTo(6.5*scale);tx.commit();expect(gun(f.world.freeze()).worldMatrix).not.toEqual(old);expect(provider.snapshotAt(callback(),f.world.snapshotAt(callback())).resolveModel('ak47').worldMatrix).toEqual(gun(f.world.freeze()).worldMatrix);expect(saved.resolveModel('ak47').worldMatrix).toEqual(old);
 });
 it('selection/load after an old-weapon shot preserves that gun and assigns only the new gun at finish',()=>{
  const f=fixture(),tx=f.world.begin();tx.beginCallback(callback(),matrix());tx.fire();const shot={weapon:tx.freeze().selectedWeapon,world:[...gun(tx.freeze()).worldMatrix]};tx.equip('pistol');expect(tx.freeze().motion.gunPositionSource).toEqual({x:-12,y:-20,z:5});expect(f.operations.map(op=>op.kind)).toEqual(['camera','whichgun']);tx.finishCallback(0);tx.commit();
  expect(shot.weapon).toBe('rifle');expect(gun(f.world.freeze()).worldMatrix).toEqual(shot.world);expect(gun(f.world.freeze()).inWorld).toBe(false);expect(gun(f.world.freeze(),'pistol')).toMatchObject({inWorld:true});expect(gun(f.world.freeze(),'pistol').worldMatrix[14]).toBeCloseTo(3.5*scale);
 });
 it('keeps rocket loaded metadata and membership explicit rather than deriving it from selection or chamber state',()=>{
  const f=fixture(),tx=f.world.begin();tx.beginCallback(callback(),matrix());tx.refreshRocket(true);tx.equip('pistol');tx.finishCallback(0);tx.commit();const snapshot=inventory().snapshotAt(callback(),f.world.snapshotAt(callback()));expect(snapshot.loadedRocket).toBe(true);expect(snapshot.models.find(m=>m.handle==='rocket')!.inWorld).toBe(true);expect(snapshot.selectedWeapon).toBe('pistol');
  const explicit=fixture(0,{bindModels:(op,state)=>({...binding(op,state),loadedRocket:false})}),stage=explicit.world.begin();stage.beginCallback(callback(),matrix());stage.refreshRocket(true);stage.finishCallback(0);stage.commit();expect(explicit.world.freeze().loadedRocket).toBe(false);expect(gun(explicit.world.freeze(),'rocket').inWorld).toBe(true);
 });
 it('VOID ticks motion but retains all seven model matrices after its explicit selection operation',()=>{
  const f=fixture(),tx=f.world.begin();tx.beginCallback(callback(),matrix(30));tx.whichGun(null);const before=tx.freeze();tx.finishCallback(100);tx.commit();expect(f.operations.map(op=>op.kind)).toEqual(['camera','whichgun']);expect(f.world.freeze().models).toEqual(before.models);expect(f.world.freeze().motion.gunPositionSource).toEqual(before.motion.gunPositionSource);expect(f.world.freeze().motion.ticker).toBe(6);
 });
 it('same-physical receipt-only updates preserve motion/models and permit distinct ticks without callback aging',()=>{
  const f=fixture(),before=f.world.freeze();let tx=f.world.begin();tx.applyReceipt(receipt(1));tx.commit();tx=f.world.begin();tx.applyReceipt(receipt(2));const capture=tx.snapshotAt(receipt(2));tx.commit();expect(capture.prefix).toEqual(receipt(2));expect(f.world.freeze().motion).toEqual(before.motion);expect(f.world.freeze().models).toEqual(before.models);expect(f.operations).toEqual([]);expect(()=>f.world.snapshotAt(receipt(1))).toThrow('prefix');
 });
 it('rolls back camera, selection, recoil, rocket and receipt clock, permitting an identical private retry',()=>{
  const f=fixture(),other=fixture(500),before=f.world.freeze(),otherBefore=other.world.freeze();const run=()=>{const tx=f.world.begin();tx.applyReceipt(receipt(1));tx.beginCallback(callback(),matrix(20));tx.equip('rpg');tx.fire();tx.refreshRocket(true);tx.finishCallback(80);return tx;};
  const failed=run(),staged=failed.freeze();failed.rollback();expect(f.world.freeze()).toBe(before);expect(other.world.freeze()).toBe(otherBefore);const retry=run();expect(retry.freeze()).toEqual(staged);retry.commit();expect(f.previous.every(state=>Object.isFrozen(state)&&Object.isFrozen(state.motion.gunPositionSource))).toBe(true);
 });
 it.each(['barrack','woodlands'] as const)('shares nominal source arithmetic with the existing presentation wrapper on %s',map=>{
  // Both maps use the same source-unit scale; this is arithmetic equivalence,
  // not a claim that either native map supplies these explicit camera poses.
  const data=JSON.parse(readFileSync(new URL(`../public/assets/original-scenes/${map==='barrack'?'barrack':'woodland'}/scene.json`,import.meta.url),'utf8')) as OriginalSceneData,runtime=registerOriginalMapRuntime(map,data);expect(runtime.scale).toBe(scale);const f=fixture(0,{sourceScale:runtime.scale}),wrapper=new OriginalWeaponPresentation('rifle');const tx=f.world.begin();tx.beginCallback(callback(),matrix());tx.fire();wrapper.fire();const expected=wrapper.update(1/30,100*runtime.scale);tx.finishCallback(100);tx.commit();expect(f.world.freeze().motion.ticker).toBe(wrapper.ticker);expect(f.world.freeze().motion.gunPositionSource).toEqual({x:wrapper.sourcePosition.x,y:wrapper.sourcePosition.y,z:wrapper.sourcePosition.z});const world=gun(f.world.freeze()).worldMatrix;for(const [index,value] of [[12,expected.x],[13,expected.y],[14,expected.z]])expect(world[index]).toBeCloseTo(value,12);
 });
 it('preserves explicit seeds and nominal recurrence for every weapon; fractional adaptation remains wrapper-only',()=>{
  for(const weapon of Object.keys(resources) as WeaponId[]){const state=createOriginalWeaponMotion({weapon,ticker:17,gunPositionSource:{x:9,y:8,z:7}}),next=advanceOriginalWeaponMotion(state,{frames:1,sourceSpeed:0}),rest=ORIGINAL_WEAPON_POSES[weapon].rest;expect(next.state.gunPositionSource.x).toBeCloseTo(9+(rest[0]-9)/10);expect(next.state.gunPositionSource.y).toBeCloseTo(8+(rest[1]-8)/10);expect(next.state.gunPositionSource.z).toBeCloseTo(7+(rest[2]-7)/10);expect(state.gunPositionSource).toEqual({x:9,y:8,z:7});}
  const a=new OriginalWeaponPresentation(),b=new OriginalWeaponPresentation();a.fire();b.fire();a.update(1/30,0);b.update(1/60,0);b.update(1/60,0);expect(a.sourcePosition.distanceTo(b.sourcePosition)).toBeLessThan(1e-12);const before=a.sourcePosition.clone();a.advanceTicker(1/30,100*scale);expect(a.sourcePosition).toEqual(before);
 });
 it('poisons failed binding/unfinished preparation without publishing partial state',()=>{
  for(const kind of ['missing','duplicate','affine','cycle'] as const){const f=fixture(0,{bindModels:(op,state)=>{const answer=binding(op,state),models=[...answer.models];if(kind==='missing')models.pop();if(kind==='duplicate')models[1]=models[0];if(kind==='affine')models[0]={...models[0],worldMatrix:[1]};if(kind==='cycle'){models[0]={...models[0],groupAncestry:[models[1].handle]};models[1]={...models[1],groupAncestry:[models[0].handle]};}return {...answer,models};}}),before=f.world.freeze(),tx=f.world.begin();expect(()=>tx.beginCallback(callback(),matrix())).toThrow();expect(()=>tx.prepareCommit()).toThrow();tx.rollback();expect(f.world.freeze()).toBe(before);}
  const f=fixture(),tx=f.world.begin();tx.beginCallback(callback(),matrix());expect(()=>tx.prepareCommit()).toThrow('unfinished');expect(()=>tx.finishCallback(0)).toThrow();tx.rollback();
  for(const action of ['prepare','commit'] as const){let reenter=()=>{};const nested=fixture(0,{bindModels:(op,state)=>{try{reenter();}catch{/* A caught hook error must still poison the outer transaction. */}return binding(op,state);}}),before=nested.world.freeze(),stage=nested.world.begin();reenter=()=>{if(action==='prepare')stage.prepareCommit();else stage.commit();};expect(()=>stage.beginCallback(callback(),matrix())).toThrow();expect(()=>stage.prepareCommit()).toThrow();stage.rollback();expect(nested.world.freeze()).toBe(before);}
 });
 it('preflights oversized captures and command/text limits, seals prepared stages and keeps terminal publishers harmless',()=>{
  const bad=seed(),models=new Array(8);let reads=0;Object.defineProperty(models,0,{get:()=>{reads++;throw Error('oversized entry');}});expect(()=>new OriginalReceiverLocalWeaponWorld({...bad,models},{sourceScale:scale,maxCommands:16,maxTextChars:8192,bindModels:binding})).toThrow('shape');expect(reads).toBe(0);expect(()=>new OriginalReceiverLocalWeaponWorld(bad,{sourceScale:scale,maxCommands:16,maxTextChars:4,bindModels:binding})).toThrow('text budget');
  const capped=fixture(0,{maxCommands:1}),stage=capped.world.begin();stage.beginCallback(callback(),matrix());expect(()=>stage.finishCallback(0)).toThrow('command budget');expect(()=>stage.prepareCommit()).toThrow();stage.rollback();expect(capped.world.freeze()).toEqual(seed());
  const f=fixture(),tx=f.world.begin();tx.applyReceipt(receipt(1));const publish=tx.prepareCommit();expect(()=>tx.applyReceipt(receipt(2))).toThrow();tx.rollback();expect(()=>{publish();tx.commit();tx.rollback();}).not.toThrow();expect(f.world.freeze().prefix).toEqual(receipt());
 });
 it('converts full three-dimensional WORLD velocity once at the physical callback boundary',()=>{
  const f=fixture(),tx=f.world.begin();tx.beginCallback(callback(),matrix());tx.finishPhysicalCallback({x:3*scale,y:4*scale,z:12*scale});tx.commit();expect(f.world.freeze().motion.ticker).toBeCloseTo(1+13*.05);const expected=advanceOriginalWeaponMotion(seed().motion,{frames:1,sourceSpeed:13});expect(f.world.freeze().motion.gunPositionSource).toEqual(expected.state.gunPositionSource);
  const stage=f.world.begin();stage.beginCallback(callback(2),matrix());expect(()=>stage.finishPhysicalCallback({x:Infinity,y:0,z:0})).toThrow();expect(()=>stage.prepareCommit()).toThrow();stage.rollback();
 });
 it('terminal release aborts an active stage and prevents re-admission; remote smoke ancestry is rejected',()=>{
  const f=fixture(),stage=f.world.begin();stage.beginCallback(callback(),matrix());stage.fire();f.world.release();expect(()=>stage.finishCallback(0)).toThrow();expect(()=>{stage.rollback();f.world.release();}).not.toThrow();expect(()=>f.world.begin()).toThrow();expect(()=>f.world.freeze()).toThrow();expect(()=>f.world.snapshotAt(receipt())).toThrow();
  for(const group of ['smokes',' GSMOKES ']){const initial=seed();expect(()=>new OriginalReceiverLocalWeaponWorld({...initial,models:initial.models.map((m,i)=>i===0?{...m,groupAncestry:[group]}:m)},{sourceScale:scale,maxCommands:16,maxTextChars:8192,bindModels:binding})).toThrow();}
 });
});
