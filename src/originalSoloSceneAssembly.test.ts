import * as THREE from 'three';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import type {OriginalWeaponCollection} from './originalWeapons';
import {ORIGINAL_WEAPON_UNIT_SCALE} from './originalWeaponPresentation';
import {createOriginalSoloSceneAssembly,type OriginalSoloSceneAssemblyOptions} from './originalSoloSceneAssembly';

const calls=vi.hoisted(()=>({order:[] as string[],fail:'' as string,cleanupFailures:new Set<string>(),inventoryInput:undefined as unknown}));
vi.mock('./originalSoloSceneResources',()=>({createOriginalSoloSceneResources:vi.fn(()=>{
 calls.order.push('resources');if(calls.fail==='resources')throw Error('resource acquire failed');
 const end=()=>{calls.order.push('release-resources');if(calls.cleanupFailures.has('resources'))throw Error('resource cleanup failed');};
 return {actorQueryResources:{resolve:vi.fn()},transientQueryResources:{resolve:vi.fn()},actorDescriptor:{resourceBindingId:'actual-actor'},transientDescriptor:{resourceBindingId:'actual-fx'},actorLifecycle:{},transientBackend:{clonePlane:vi.fn(),cloneMuzzle:vi.fn(),pointAt:vi.fn(),selfRotate:vi.fn()},muzzleTemplates:[],release:end};
})}));
vi.mock('./originalSoloFreshBanks',()=>({createOriginalSoloFreshBanks:vi.fn(()=>{
 calls.order.push('banks');if(calls.fail==='banks')throw Error('bank acquire failed');
 let released=false;const bank=()=>({freeze:()=>{if(released)throw Error('bank released');return {};}});
 return {localWeaponWorld:bank(),projectileWorld:bank(),loadoutWorld:bank(),weaponReportWorld:bank(),release:()=>{released=true;calls.order.push('release-banks');if(calls.cleanupFailures.has('banks'))throw Error('bank cleanup failed');}};
})}));
vi.mock('../shared/originalSoloReceiverSceneInventory',()=>({createOriginalSoloReceiverSceneInventory:vi.fn((input:unknown)=>{
 calls.order.push('inventory');calls.inventoryInput=input;if(calls.fail==='inventory')throw Error('inventory acquire failed');
 const model={cloneGI:vi.fn(),cloneGun:vi.fn(),sphere:vi.fn(),heldGunPose:vi.fn(),reparentGunMembership:vi.fn(),dropYaw:vi.fn(),nearestDetailedDownward:vi.fn()};
 return {snapshotAt:vi.fn((prefix:unknown)=>({prefix})),geometryQuery:vi.fn(()=>({nearestDetailed:vi.fn(()=>null),nearestDetailedDownward:vi.fn(()=>null)})),createGeometryBackend:vi.fn(()=>model),dispose:()=>{calls.order.push('release-inventory');if(calls.cleanupFailures.has('inventory'))throw Error('inventory cleanup failed');}};
})}));
const identity=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
const names=['pistol','spas12','ak47','rg6','rpg','dragunov','rpgrocket','rg6grenade'];
const borrowed:Array<THREE.Mesh>=[];
afterEach(()=>{for(const mesh of borrowed.splice(0)){mesh.geometry.dispose();const material=mesh.material;if(Array.isArray(material))material.forEach(value=>value.dispose());else material.dispose();}});
beforeEach(()=>{calls.order.length=0;calls.fail='';calls.cleanupFailures.clear();calls.inventoryInput=undefined;});
function fixture(){
 const meshes=names.map(resource=>({resource,positions:[[.1,0,0],[0,.2,0],[0,0,.3]],faces:[[0,1,2]]}));
 const bank=new Map<string,THREE.Mesh>();
 for(const raw of meshes){const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(raw.positions.flat().map(value=>value*ORIGINAL_WEAPON_UNIT_SCALE),3));geometry.setIndex([0,1,2]);const mesh=new THREE.Mesh(geometry);borrowed.push(mesh);bank.set(raw.resource,mesh);}
 const options={resources:{actor:{sourceScale:.02,maxMeshes:16,maxVertices:24,maxFaces:8,maxDescriptorTextChars:1024},transientBinding:{resources:{sourceScale:.02}},weapons:{meshes},renderToWorld:[...identity]},banks:{map:'barrack',sceneGeneration:7,sourceScale:.02,renderToWorld:[...identity]},inventory:{data:{meshes:[],nodes:[]},doorNames:[],sky:{},transientUnresolved:[],provenance:'fixture',sidedness:'double',budgets:{maxModels:32,maxVertices:24,maxFaces:8,maxTextChars:1024,maxMeshes:16}}} as unknown as OriginalSoloSceneAssemblyOptions;
 const collection={resources:bank,rocket:bank.get('rpgrocket')} as unknown as OriginalWeaponCollection;
 const create=()=>createOriginalSoloSceneAssembly(collection,options);
 return {options,collection,bank,meshes,create};
}
describe('complete Solo scene assembly ownership boundary',()=>{
 it('derives inventory identity and paired resources, retaining supplied inventory evidence',()=>{
  const f=fixture();Object.assign(f.options.inventory,{map:'woodlands',sourceScale:99,sceneGeneration:99,weaponGeometry:{meshes:[]},actorResources:{fake:true},transientResources:{fake:true},muzzleTemplates:['fake']});
  const owner=f.create(),input=calls.inventoryInput as Record<string,unknown>;
  expect(calls.order).toEqual(['resources','banks','inventory']);expect(input.map).toBe('barrack');expect(input.sourceScale).toBe(.02);expect(input.sceneGeneration).toBe(7);expect(input.weaponGeometry).toBe(f.options.resources.weapons);
  expect(input.actorResources).toBe(owner.resourceOwner.actorQueryResources);expect(input.transientResources).toBe(owner.resourceOwner.transientQueryResources);expect(input.muzzleTemplates).toBe(owner.resourceOwner.muzzleTemplates);
  expect(owner.backends.localWeaponWorld).toBe(owner.banks.localWeaponWorld);expect(owner.backends.actorResources).toBe(owner.resourceOwner.actorDescriptor);owner.release();
 });
 it('releases every owner in reverse acquisition order exactly once',()=>{
  const f=fixture(),owner=f.create();owner.backends.release();owner.release();owner.inventory.dispose();expect(calls.order).toEqual(['resources','banks','inventory','release-inventory','release-banks','release-resources']);
 });
 it('guards snapshots, geometry, lifecycle, hitscan and every bank after release',()=>{
  const owner=fixture().create(),retained=owner.inventory.geometryQuery([],0,7);owner.release();
  expect(()=>owner.snapshotAt(null!,null!,null!)).toThrow('released');expect(()=>owner.inventory.snapshotAt(null!,null!,null!)).toThrow('released');expect(()=>owner.inventory.geometryQuery([],0,7)).toThrow('released');expect(()=>owner.inventory.createGeometryBackend(null!)).toThrow('released');
  expect(()=>owner.backends.model.cloneGI('a')).toThrow('released');expect(()=>owner.backends.model.nearestDetailedDownward({x:0,y:0,z:0},[],0,7)).toThrow('released');expect(()=>owner.backends.transient.clonePlane('plane',1)).toThrow('released');
  expect(()=>owner.backends.localHitscan.nearestBullet({models:[],prefix:{kind:'callback',sceneGeneration:7,callback:0},actors:null!},{x:0,y:0,z:0},{x:0,y:0,z:1})).toThrow('released');
  expect(()=>retained.nearestDetailed({x:0,y:0,z:0},{x:0,y:0,z:1})).toThrow('released');expect(()=>retained.nearestDetailedDownward({x:0,y:0,z:0})).toThrow('released');
  for(const bank of [owner.banks.localWeaponWorld,owner.banks.projectileWorld,owner.banks.loadoutWorld,owner.banks.weaponReportWorld])expect(()=>bank.freeze()).toThrow('released');
 });
 it('inventory disposal clears only capture ownership until the whole assembly releases',()=>{
  const owner=fixture().create();owner.inventory.dispose();expect(calls.order).toEqual(['resources','banks','inventory','release-inventory']);expect(()=>owner.banks.loadoutWorld.freeze()).not.toThrow();expect(()=>owner.snapshotAt(null!,null!,null!)).toThrow('inventory disposed');
  owner.release();expect(calls.order.slice(-2)).toEqual(['release-banks','release-resources']);
 });
 it('retains a resource acquisition failure without releasing unacquired owners',()=>{
  const f=fixture();calls.fail='resources';expect(f.create).toThrow('resource acquire failed');expect(calls.order).toEqual(['resources']);
 });
 it('keeps large map inventory caps independent from bounded weapon pairing caps',()=>{
  const f=fixture();Object.assign(f.options.inventory.budgets,{maxMeshes:2048,maxTextChars:1000000,maxVertices:100000,maxFaces:100000});const owner=f.create();owner.release();
 });
 it.each(['banks','inventory'])('cleans acquired owners when %s acquisition fails',phase=>{
  const f=fixture();calls.fail=phase;expect(f.create).toThrow(`${phase==='banks'?'bank':'inventory'} acquire failed`);
  expect(calls.order).toEqual(phase==='banks'?['resources','banks','release-resources']:['resources','banks','inventory','release-banks','release-resources']);
 });
 it('preserves acquisition and all cleanup failures together',()=>{
  const f=fixture();calls.fail='inventory';calls.cleanupFailures.add('banks');calls.cleanupFailures.add('resources');
  try{f.create();throw Error('construction unexpectedly succeeded');}catch(error){expect(error).toBeInstanceOf(AggregateError);const aggregate=error as AggregateError;expect(aggregate.errors.map((e:Error)=>e.message)).toEqual(['inventory acquire failed','bank cleanup failed','resource cleanup failed']);expect((aggregate.cause as Error).message).toBe('inventory acquire failed');}
 });
 it('attempts all releases after cleanup failures and does not repeat failed cleanup',()=>{
  const owner=fixture().create();for(const name of ['inventory','banks','resources'])calls.cleanupFailures.add(name);
  expect(()=>owner.release()).toThrow(AggregateError);owner.release();expect(calls.order.slice(-3)).toEqual(['release-inventory','release-banks','release-resources']);expect(()=>owner.backends.model.cloneGI('a')).toThrow('released');
 });
 it.each(['actor-scale','fx-scale','mapping','map','generation'])('rejects incoherent %s before owner acquisition',field=>{
  const f=fixture();if(field==='actor-scale')f.options.resources.actor.sourceScale=.03;
  else if(field==='fx-scale')Object.assign(f.options.resources.transientBinding.resources,{sourceScale:.03});
  else if(field==='mapping')(f.options.banks.renderToWorld as number[])[12]=1;
  else if(field==='map')Object.assign(f.options.banks,{map:'invalid'});else Object.assign(f.options.banks,{sceneGeneration:-1});
  expect(f.create).toThrow();expect(calls.order).toEqual([]);
 });
 it.each(['pistol','rpgrocket','rg6grenade'])('rejects foreign actual %s positions before acquisition',name=>{
  const f=fixture();f.bank.get(name)!.geometry.getAttribute('position').setX(0,9);expect(f.create).toThrow('positions');expect(calls.order).toEqual([]);
 });
 it('rejects foreign full topology and aliases before acquisition',()=>{
  const f=fixture(),pistol=f.bank.get('pistol')!,shotgun=f.bank.get('spas12')!;pistol.geometry.index!.setX(2,0);expect(f.create).toThrow('topology');pistol.geometry.index!.setX(2,2);
  f.bank.set('spas12',pistol);expect(f.create).toThrow('aliased');f.bank.set('spas12',shotgun);shotgun.geometry.setAttribute('position',pistol.geometry.getAttribute('position'));expect(f.create).toThrow('Aliased');expect(calls.order).toEqual([]);
 });
 it('rejects a rocket field from another renderer resource and aliased index buffers',()=>{
  const f=fixture();f.collection.rocket=f.bank.get('rpg')!;expect(f.create).toThrow('borrowed meshes');f.collection.rocket=f.bank.get('rpgrocket')!;
  f.bank.get('spas12')!.geometry.setIndex(f.bank.get('pistol')!.geometry.index!);expect(f.create).toThrow('Aliased');expect(calls.order).toEqual([]);
 });
 it('preflights aggregate limits without walking a raw vertex or acquiring owners',()=>{
  const f=fixture();Object.defineProperty(f.meshes[0].positions,0,{get(){throw Error('forbidden raw walk');}});Object.assign(f.options.inventory.budgets,{maxVertices:23});expect(f.create).toThrow('geometry budget');expect(calls.order).toEqual([]);
 });
 it('rejects duplicate, missing and malformed decoded resources',()=>{
  const f=fixture();f.meshes.push(f.meshes[0]);expect(f.create).toThrow('duplicate');f.meshes.pop();f.bank.delete('rg6grenade');expect(f.create).toThrow('borrowed');expect(calls.order).toEqual([]);
 });
});
