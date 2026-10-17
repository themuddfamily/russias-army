import * as THREE from 'three';
import {describe,it,expect,vi} from 'vitest';
import {presentationFixture} from './originalSoloLoadedScenePresentation.fixture';
import {originalReceiverModelWorldMatrix} from './originalReceiverModelMatrix';

// Full decoded maps/resources, real CURRENT assemblies/coordinator and all
// Game event consumers. Only DOM/audio sinks are substituted. Membership,
// seed matrices and mapping are explicit copy policies, not raster evidence.
type Fixture=ReturnType<typeof presentationFixture>;
const cycle=(f:Fixture,time:number)=>{f.prepare(time);f.worlds.completeGoody(time);f.game.completeSoloActors();};
function matrixClose(actual:THREE.Matrix4,expected:THREE.Matrix4){
 for(let i=0;i<16;i++)expect(actual.elements[i]).toBeCloseTo(expected.elements[i],7);
}
function visualSnapshot(f:Fixture){
 const nodes:THREE.Object3D[]=[];f.scene.traverse(node=>nodes.push(node));
 return nodes.map(node=>({node,parent:node.parent,visible:node.visible,matrix:node.matrix.toArray(),world:node.matrixWorld.toArray()}));
}
function owners(f:Fixture){
 return {models:f.game.soloReceiverModels.presentation,fx:f.game.soloReceiverTransients.presentation,local:f.game.soloLocalWeaponPresentation.adapter,projectiles:f.game.soloProjectilePresentation.adapter};
}
function matureShotgun(f:Fixture){
 f.game.keys.add('Digit2');cycle(f,0);f.game.keys.clear();
 for(let i=1;i<=45;i++)cycle(f,i/30);
 expect(f.player.loadout!.selected).toBe('shotgun');expect(f.humanShots).toEqual([]);
}

describe('loaded complete scenes through actual Game presentation consumers',()=>{
 it.each(['barrack','woodlands'] as const)('%s adopts actual actor/local/FX/projectile owners and retires legacy presentation only after commit',map=>{
  const f=presentationFixture(map);const geometryDisposed=vi.spyOn(f.soldierResources.geometry,'dispose');
  try{
   expect(f.game.soloReceiverModels).toBeUndefined();expect(f.game.soloReceiverTransients).toBeUndefined();
   expect(f.legacyDrop.parent).toBe(f.scene);expect(f.legacyProjectile.parent).toBe(f.scene);
   cycle(f,0);const o=owners(f);
   expect(o.models.freeze()).toBe(f.player.modelState);expect(o.fx.freeze()).toBe(f.player.transientState);
   expect(o.local.freeze()).toEqual(f.player.localWeapons);expect(o.projectiles.freeze()).toEqual(f.player.projectileState);
   expect(f.game.weaponState.originalLoadoutCheckpoint).toEqual(f.player.loadout);expect(f.game.weaponState.originalGunPhaseCheckpoint).toEqual(f.player.gunPhase);
   expect(f.game.hasCommittedSoloModels()).toBe(true);expect(f.game.hasCommittedSoloTransients()).toBe(true);expect(f.game.hasCommittedSoloProjectiles()).toBe(true);
   expect(f.legacyDrop.parent).toBeNull();expect(f.legacyProjectile.parent).toBeNull();expect(f.game.projectiles).toEqual([]);expect(f.game.weaponDrops).toEqual([]);
   expect(f.legacyRig.group.parent).toBeNull();expect(f.game.soloModelPresentation).toBeUndefined();expect(()=>f.legacyRig.readConstructorSeedCapture()).toThrow('unavailable');
   expect(f.game.releaseProjectileMesh).toHaveBeenCalledExactlyOnceWith(f.legacyProjectile);
   expect(f.game.originalExplosionPresentation.clear).toHaveBeenCalledOnce();expect(f.game.originalCombatEffectPresentation.clear).toHaveBeenCalledOnce();expect(f.game.originalEffectPlanePool.reset).toHaveBeenCalledOnce();
   expect(f.player.modelState!.actors.map(a=>a.actorId)).toEqual(['a','b']);
   for(const actor of f.player.modelState!.actors){
    const rig=o.models.actorRig(actor.actorId)!;expect(rig.mesh.geometry).toBe(f.soldierResources.geometry);expect(rig.mesh.material).toBe(f.soldierResources.material);
    const model=f.player.modelState!.models.find(m=>m.handle===actor.gi)!;
    matrixClose(rig.nativeRoot.matrixWorld,originalReceiverModelWorldMatrix(model,f.player.actorResources!));
    expect(o.models.readGun(actor.gun)!.geometry).toBe(f.soldierResources.gunGeometries.get(actor.weapon==='launcher'?'rg6':'rpg'));
   }
   const local=f.player.localWeapons!.models.find(m=>m.handle==='rg6')!,mesh=f.collection.resources.get('rg6')!;
   expect(mesh.parent).toBe(f.viewModel);expect(mesh.visible).toBe(local.inWorld);
   const raw=f.resourcesForTestWeaponGeometry.meshes.find(m=>m.resource==='rg6')!.positions[0];
   const expected=new THREE.Vector3(raw[0],raw[1],raw[2]).applyMatrix4(new THREE.Matrix4().fromArray(local.worldMatrix));
   const actual=new THREE.Vector3().fromBufferAttribute(mesh.geometry.getAttribute('position'),0).applyMatrix4(mesh.matrixWorld);expect(actual.distanceTo(expected)).toBeLessThan(1e-5);
   expect(f.game.sourceDisplayedWeapon).toBe('launcher');expect(geometryDisposed).not.toHaveBeenCalled();
  }finally{geometryDisposed.mockRestore();f.dispose();}
 });

 it.each(['barrack','woodlands'] as const)('%s publishes actual SPAS/muzzle and incoming projectile meshes once after joint retry',map=>{
  const f=presentationFixture(map);let failure:{mockRestore():void}|undefined;
  try{
   matureShotgun(f);const o=owners(f),before=visualSnapshot(f),models=o.models.freeze(),fx=o.fx.freeze(),local=o.local.freeze(),projectiles=o.projectiles.freeze(),events=f.events.length;
   const geometry=f.collection.resources.get('rg6grenade')!.geometry,disposed=vi.spyOn(geometry,'dispose');
   f.game.firing=true;f.add('a',1,'launcher');f.prepare(46/30);
   const adopters=[vi.spyOn(o.models,'adopt'),vi.spyOn(o.fx,'adopt'),vi.spyOn(o.local,'adopt'),vi.spyOn(o.projectiles,'adopt')];
   failure=vi.spyOn(f.b.mirror,'prepareSynchronousDelivery').mockImplementationOnce(()=>{throw Error('presentation late peer');});
   expect(()=>f.worlds.completeGoody(46/30)).toThrow('presentation late peer');failure.mockRestore();failure=undefined;
   expect(f.humanShots).toHaveLength(2);expect(f.events).toHaveLength(events);expect(visualSnapshot(f)).toEqual(before);
   expect(o.models.freeze()).toBe(models);expect(o.fx.freeze()).toBe(fx);expect(o.local.freeze()).toBe(local);expect(o.projectiles.freeze()).toBe(projectiles);
   for(const adopter of adopters)expect(adopter).not.toHaveBeenCalled();
   const reads=f.humanReads.programs,births=f.birthReads.get('a');f.game.firing=false;
   f.worlds.completeGoody(46/30);expect(f.humanReads.programs).toBe(reads);expect(f.birthReads.get('a')).toBe(births);expect(f.humanShots).toHaveLength(2);
   expect(f.game.soloBotShots).toEqual([]);expect(f.player.projectileState!.actors).toHaveLength(1);
   const actor=f.player.projectileState!.actors[0],model=f.player.projectileState!.models.find(m=>m.handle===actor.handle)!,mesh=o.projectiles.meshForHandle(actor.handle)!;
   expect(mesh.parent).toBe(f.scene);expect(mesh.geometry).toBe(geometry);expect(f.game.createProjectileMesh).not.toHaveBeenCalled();expect(f.game.orientProjectileMesh).not.toHaveBeenCalled();
   const raw=f.resourcesForTestWeaponGeometry.meshes.find(m=>m.resource==='rg6grenade')!.positions[0];
   const expected=new THREE.Vector3(raw[0],raw[1],raw[2]).applyMatrix4(new THREE.Matrix4().fromArray(model.worldMatrix));
   const actual=new THREE.Vector3().fromBufferAttribute(mesh.geometry.getAttribute('position'),0).applyMatrix4(mesh.matrixWorld);expect(actual.distanceTo(expected)).toBeLessThan(1e-5);
   const muzzleModels=f.player.transientState!.models.filter(m=>m.resource==='mfspas12');expect(muzzleModels).toHaveLength(2);
   for(const muzzle of muzzleModels){const effect=o.fx.readModel(muzzle.handle)!;expect(effect.parent).toBe(f.scene);expect(effect.visible).toBe(true);expect(effect.geometry).toBe(f.binding.resources.geometries.get('mfspas12')!.geometry);}
   expect(f.events.slice(events).filter(e=>e.kind==='local-hitscan-outcome'&&e.recipientId==='player')).toHaveLength(2);
   expect(f.events.findIndex(e=>e.kind==='projectile-state'&&e.recipientId==='player'&&e.checkpoint.actors.length===1)).toBeLessThan(f.events.findIndex(e=>e.kind==='spawned'&&e.recipientId==='player'));
   expect(f.game.originalExplosionPresentation.spawn).not.toHaveBeenCalled();expect(f.game.originalCombatEffectPresentation.spawnPuff).not.toHaveBeenCalled();expect(disposed).not.toHaveBeenCalled();
   disposed.mockRestore();for(const adopter of adopters)adopter.mockRestore();
  }finally{failure?.mockRestore();f.dispose();}
 });

 it.each(['barrack','woodlands'] as const)('%s adopts dropped gun and fading GI, freezes all owners at endgame, then releases without borrowed disposal',map=>{
  const f=presentationFixture(map);
  try{
   matureShotgun(f);f.worlds.dispose('b');f.game.firing=true;cycle(f,46/30);f.game.firing=false;
   expect(f.humanShots).toHaveLength(2);for(const shot of f.humanShots)expect(Object.keys(shot.actorNames)).toEqual(['a','b']);
   const o=owners(f),checkpoint=f.player.modelState!;expect(checkpoint.actors.map(a=>a.actorId)).toEqual(['a']);expect(checkpoint.pickups).toHaveLength(1);expect(checkpoint.fades).toHaveLength(1);
   const pickup=checkpoint.pickups[0],binding=f.game.soloReceiverPickupBindings[0];expect(binding.pickup).toBe(pickup);expect(binding.model).toBe(o.models.readGun(pickup.handle));expect(binding.model.parent).toBe(f.scene);
   expect(f.game.soloCorpses.get(checkpoint.fades[0].id)).toBe(o.models.readRig(checkpoint.fades[0].handle));expect(f.game.weaponDrops).toEqual([]);
   const renderMeshes:THREE.Mesh[]=[];f.scene.traverse(node=>{if(node instanceof THREE.Mesh)renderMeshes.push(node);});
   const noDispose=[vi.spyOn(f.soldierResources.geometry,'dispose'),vi.spyOn(f.collection.resources.get('rpg')!.geometry,'dispose'),vi.spyOn(f.binding.resources.textures.get('bangrocket')!,'dispose')];
   const states=[o.models.freeze(),o.fx.freeze(),o.local.freeze(),o.projectiles.freeze()];f.game.disposeSoloWorlds(true);
   expect(f.game.soloWorlds).toBeUndefined();expect(f.worlds.worlds.size).toBe(0);expect([o.models.freeze(),o.fx.freeze(),o.local.freeze(),o.projectiles.freeze()]).toEqual(states);
   for(const holder of [f.game.soloReceiverModels,f.game.soloReceiverTransients,f.game.soloLocalWeaponPresentation,f.game.soloProjectilePresentation])expect(holder.frozen).toBe(true);
   expect(binding.model.parent).toBe(f.scene);expect(f.planeOwner.planeMaterial).toBeDefined();
   f.game.disposeSoloWorlds(false);f.factory.release();expect(f.game.soloReceiverModels).toBeUndefined();expect(f.game.soloReceiverTransients).toBeUndefined();expect(f.game.soloLocalWeaponPresentation).toBeUndefined();expect(f.game.soloProjectilePresentation).toBeUndefined();expect(f.game.soloReceiverPickupBindings).toEqual([]);expect(f.game.soloCorpses.size).toBe(0);
   for(const mesh of renderMeshes){let node:THREE.Object3D|null=mesh;while(node){expect(node).not.toBe(f.scene);node=node.parent;}}for(const spy of noDispose){expect(spy).not.toHaveBeenCalled();spy.mockRestore();}
   f.game.disposeSoloWorlds(false);expect(f.scene.children).toEqual([f.viewModel]);
  }finally{f.dispose();}
 });
});
