// Retained legacy inline CPU characterization; excludes normal paged default startup.
import * as THREE from 'three';
import {describe,expect,it,vi} from 'vitest';
import {startup} from './originalSoloDefaultStartup.fixture';
import {SoldierMaterialLibrary} from './soldierMaterials';
import {OriginalSoldier,isOriginalSoldierConstructorCapture} from './originalSoldier';

const maps=['barrack','woodlands'] as const;

function frameFixture(map:typeof maps[number]) {
 const f=startup(map),game=f.game;
 const materials=new SoldierMaterialLibrary({tier:'low'});
 // Explicit elevated, separated positions keep this small fixture away from
 // map contacts. Physics still runs its real decoded geometry queries; no
 // skipIds, solver substitute, RAF, renderer or native timing claim is used.
 const eye=game.camera.position.clone();
 game.arena.spawnPoints=[eye.clone().add(new THREE.Vector3(0,-1.8,0)),eye.clone().add(new THREE.Vector3(100,-1.8,0))];
 const dom=new Map<string,{style:{setProperty:ReturnType<typeof vi.fn>};classList:{toggle:ReturnType<typeof vi.fn>}}>();
 Object.assign(game,{soldierMaterialLibrary:materials,viewProjection:new THREE.Group(),recoil:0,weaponSwayX:0,weaponSwayY:0,
  grounded:false,arrowMovement:false,rightMouseAiming:false,sensitivity:1,originalMouseDelta:{x:0,y:0},
  originalPlayerContacts:[],originalProjectileAccumulator:0,nextSourceReloadPoll:-Infinity,
  originalScopeActive:false,originalScopeFov:50,
  el:(name:string)=>{let node=dom.get(name);if(!node){node={style:{setProperty:vi.fn()},classList:{toggle:vi.fn()}};dom.set(name,node);}return node;}});
 game.spawnEnemies();
 const enemy=game.enemies[0];
 const seed=enemy.sourceRig.readConstructorSeedCapture();
 const frame=(time:number)=>{game.elapsed=time;game.advanceGameplayFrame(1/30);};
 return {...f,enemy,seed,frame,dispose(){try{game.clearEnemies();}finally{materials.dispose();f.dispose();}}};
}

// These tests call the production frame dispatcher rather than manually
// staging physics/goody or directly retrying the coordinator. Enemy creation,
// source rigs, complete scene factories and all four presentation consumers
// use the actual loaded assets. Only DOM/audio sinks come from the fixture.
describe('actual legacy inline CPU Solo frame dispatch',()=>{
 it.each(maps)('%s advances real physics and adopts a real spawned Enemy through the legacy inline factory',map=>{
  const f=frameFixture(map);
  try{
   expect(f.game.soloWorlds).toBeUndefined();expect(f.game.enemies).toHaveLength(1);
   expect(f.enemy.sourceRig).toBeInstanceOf(OriginalSoldier);
   expect(isOriginalSoldierConstructorCapture(f.seed)).toBe(true);
   expect(f.seed.selectedWeapon).toBe('rpg');expect(f.enemy.weapon).toBe('rifle');
   expect(f.seed.resourceBindingId).toBe(f.soldierResources.resourceBindingId);
   const callback=vi.spyOn(f.game,'updateOriginalPlayerCallback'),actors=vi.spyOn(f.game,'completeSoloActors');
   const before=f.game.camera.position.clone();f.frame(0);
   const worlds=f.game.soloWorlds,player=worlds.worlds.get('player')!,bot=worlds.worlds.get(f.enemy.id)!;
   expect(callback).toHaveBeenCalledOnce();expect(actors).toHaveBeenCalledOnce();expect(worlds.callbackPhase).toBe('idle');
   expect(player.callback).toBe(1);expect(bot.callback).toBe(1);
   expect(f.game.camera.position.y).toBeLessThan(before.y);
   expect(player.health.flick).toBe(-2);expect(f.game.sourceHealth).toBe(player.health);
   expect(player.loadout!.selected).toBe('launcher');expect(bot.loadout).toBeUndefined();
   expect(bot.localWeapons!.selectedWeapon).toBe('rifle');expect(bot.localWeapons!.motion.weapon).toBe('rifle');
   expect(f.game.soloReceiverModels.presentation.freeze()).toBe(player.modelState);
   expect(f.game.soloReceiverTransients.presentation.freeze()).toBe(player.transientState);
   expect(f.game.soloLocalWeaponPresentation.adapter.freeze()).toEqual(player.localWeapons);
   expect(f.game.soloProjectilePresentation.adapter.freeze()).toEqual(player.projectileState);
   expect(player.modelState!.actors.some((actor:{actorId:string})=>actor.actorId===f.enemy.id)).toBe(true);
   const ownedRig=f.enemy.sourceRig,animate=vi.spyOn(ownedRig,'animate'),refresh=vi.spyOn(ownedRig,'refreshSourcePresentation'),fire=vi.spyOn(ownedRig,'fire');
   // This is the same Enemy.update call made after advanceGameplayFrame by
   // animate(), with real source-context navigation and a distant target.
   f.enemy.update(1/30,0,f.game.camera.position,f.game.arena,vi.fn(),f.game.camera.position,f.game.soloEnemyDecisionContext(f.enemy));
   expect(animate).not.toHaveBeenCalled();expect(refresh).not.toHaveBeenCalled();expect(fire).not.toHaveBeenCalled();
   callback.mockRestore();actors.mockRestore();animate.mockRestore();refresh.mockRestore();fire.mockRestore();
  }finally{f.dispose();}
 });

 it.each(maps)('%s retries a failed joint delivery through advanceGameplayFrame without repeating the external callback',map=>{
  const f=frameFixture(map);let fail:{mockRestore():void}|undefined;
  try{
   const worlds=f.game.ensureSoloWorlds(),player=worlds.worlds.get('player')!,bot=worlds.worlds.get(f.enemy.id)!;
   const physics=vi.spyOn(worlds,'physics'),callback=vi.spyOn(f.game,'updateOriginalPlayerCallback'),muzzles=vi.spyOn(f.game,'advanceOriginalMuzzleFlashes');
   const input=vi.spyOn(f.game,'readSoloHumanCallbackInput'),actors=vi.spyOn(f.game,'completeSoloActors');
   f.game.keys.add('KeyW');f.game.originalMouseDelta={x:4,y:2};
   fail=vi.spyOn(bot.mirror,'prepareSynchronousDelivery').mockImplementationOnce(()=>{throw Error('default frame late peer');});
   expect(()=>f.frame(0)).toThrow('default frame late peer');fail.mockRestore();fail=undefined;
   const body=structuredClone(player.body),health={...player.health},camera=f.game.camera.position.clone();
   const yaw=f.game.yaw,pitch=f.game.pitch,captured=f.game.soloHumanCallbackInput.input;
   const inputReads=input.mock.calls.length;
   expect(player.callback).toBe(0);expect(bot.callback).toBe(0);expect(player.loadout).toBeUndefined();
   expect(f.game.soloReceiverModels).toBeUndefined();expect(actors).not.toHaveBeenCalled();
   expect(physics).toHaveBeenCalledOnce();expect(callback).toHaveBeenCalledOnce();expect(muzzles).toHaveBeenCalledOnce();
   f.game.keys.clear();f.game.keys.add('Digit1');f.game.originalMouseDelta={x:9,y:7};
   f.frame(0);
   expect(player.callback).toBe(1);expect(bot.callback).toBe(1);expect(worlds.callbackPhase).toBe('idle');
   expect(physics).toHaveBeenCalledOnce();expect(callback).toHaveBeenCalledOnce();expect(muzzles).toHaveBeenCalledOnce();expect(actors).toHaveBeenCalledOnce();
   expect(player.body).toEqual(body);expect(player.health).toEqual(health);expect(f.game.camera.position).toEqual(camera);
   expect(f.game.yaw).toBe(yaw);expect(f.game.pitch).toBe(pitch);expect(f.game.originalMouseDelta).toEqual({x:9,y:7});
   expect(input.mock.calls).toHaveLength(inputReads);expect(f.game.soloHumanCallbackInput.input).toBe(captured);
   expect(player.loadout!.selected).toBe('launcher');expect(player.loadout!.ammo.launcher).toBe(6);
   expect(f.game.soloReceiverModels.presentation.freeze()).toBe(player.modelState);
   f.game.keys.clear();f.frame(1/30);
   expect(player.callback).toBe(2);expect(bot.callback).toBe(2);expect(physics).toHaveBeenCalledTimes(2);expect(callback).toHaveBeenCalledTimes(2);expect(muzzles).toHaveBeenCalledTimes(2);expect(actors).toHaveBeenCalledTimes(2);
   expect(player.health.flick).toBe(-health.flick);expect(f.game.originalMouseDelta).toEqual({x:0,y:0});
   physics.mockRestore();callback.mockRestore();muzzles.mockRestore();input.mockRestore();actors.mockRestore();
  }finally{fail?.mockRestore();f.dispose();}
 });

 it.each(maps)('%s finishes the Game actor tail after a real committed RPG puff sink error without replaying actors',map=>{
  const f=frameFixture(map);let receive:{mockRestore():void}|undefined;
  try{
   f.game.keys.add('Digit5');f.frame(0);f.game.keys.clear();
   for(let i=1;i<=45;i++)f.frame(i/30);
   const worlds=f.game.soloWorlds,player=worlds.worlds.get('player')!,bot=worlds.worlds.get(f.enemy.id)!;
   expect(player.loadout!.selected).toBe('rpg');expect(player.loadout!.ammo.rpg).toBe(1);
   f.game.firing=true;f.frame(46/30);f.game.firing=false;
   expect(player.loadout!.ammo.rpg).toBe(0);expect(player.projectiles.size).toBe(1);expect(bot.projectiles.size).toBe(1);
   const projectile=[...player.projectiles.values()][0] as any;
   expect(projectile.state.remainingCallbacks).toBe(200);
   const sink=f.game.receiveSoloWorldEvent,puffEvents:unknown[]=[],sinkError=Error('default frame committed puff sink');let fail=true;
   receive=vi.spyOn(f.game,'receiveSoloWorldEvent').mockImplementation((event:any)=>{
    // Preserve the actual renderer adoption before injecting a user sink
    // failure at the first physical puff publication, after CURRENT commits.
    sink.call(f.game,event);
    if(event.kind==='transient-state'&&event.recipientId==='player'&&event.checkpoint.actors.some((actor:any)=>actor.kind==='puff')){
     puffEvents.push(event);if(fail){fail=false;throw sinkError;}
    }
   });
   const physics=vi.spyOn(worlds,'physics'),callbacks=vi.spyOn(f.game,'updateOriginalPlayerCallback'),input=vi.spyOn(f.game,'readSoloHumanCallbackInput');
   const actors=vi.spyOn(worlds,'actors'),tail=vi.spyOn(f.game,'finishSoloActors'),muzzles=vi.spyOn(f.game,'advanceOriginalMuzzleFlashes'),scope=vi.spyOn(f.game,'advanceCommittedSoloGunScope');
   vi.stubGlobal('location',{search:'?e2e=1'});expect(f.game.enableSourceCallbackCapture()).toBe(true);
   const sentinel={retiredLegacyBlast:true};f.game.originalBlasts.push(sentinel);
   expect(()=>f.frame(47/30)).toThrow('Solo committed actor dispatch failed');
   expect(worlds.callbackPhase).toBe('idle');expect(player.callback).toBe(48);expect(bot.callback).toBe(48);
   expect(f.game.soloPendingGameplayFrame.stage).toBe('actor-tail');expect(tail).not.toHaveBeenCalled();expect(scope).not.toHaveBeenCalled();
   expect(f.game.originalBlasts).toEqual([sentinel]);expect(puffEvents).toHaveLength(1);
   const state=player.transientState,remaining=projectile.state.remainingCallbacks,body=structuredClone(player.body),health={...player.health};
   const captured=f.game.soloHumanCallbackInput.input,reads=input.mock.calls.length;
   const record=f.game.sourceCallbackCapture.records[0],beforePhysics=record.beforePhysics,afterPhysics=record.afterPhysics,afterControls=record.afterControls,contacts=record.contacts;
   expect(f.game.sourceCallbackCapture.records).toHaveLength(1);expect(record.localTime).toBe(f.game.soloPendingGameplayFrame.time);expect(record.localTime).toBeCloseTo(47/30,12);
   expect(remaining).toBe(199);expect(state!.actors.filter((actor:any)=>actor.kind==='puff')).toHaveLength(1);
   expect(f.game.soloReceiverTransients.presentation.freeze()).toBe(state);
   f.frame(47/30);
   expect(f.game.soloPendingGameplayFrame).toBeUndefined();expect(worlds.callbackPhase).toBe('idle');expect(player.callback).toBe(48);
   expect(tail).toHaveBeenCalledOnce();expect(scope).toHaveBeenCalledOnce();expect(f.game.originalBlasts).toEqual([]);
   expect(physics).toHaveBeenCalledOnce();expect(callbacks).toHaveBeenCalledOnce();expect(actors).toHaveBeenCalledOnce();expect(muzzles).toHaveBeenCalledOnce();
   expect(input.mock.calls).toHaveLength(reads);expect(f.game.soloHumanCallbackInput.input).toBe(captured);
   expect(player.body).toEqual(body);expect(player.health).toEqual(health);expect(player.loadout!.ammo.rpg).toBe(0);
   expect(player.transientState).toBe(state);expect(projectile.state.remainingCallbacks).toBe(remaining);expect(puffEvents).toHaveLength(1);
   expect(f.game.soloReceiverTransients.presentation.freeze()).toBe(state);
   expect(f.game.sourceCallbackCapture.records).toHaveLength(1);expect(f.game.sourceCallbackCapture.records[0]).toBe(record);
   expect(record.beforePhysics).toBe(beforePhysics);expect(record.afterPhysics).toBe(afterPhysics);expect(record.afterControls).toBe(afterControls);expect(record.contacts).toBe(contacts);
   expect(record.actorStage).toBe('captured');expect(Number.isFinite(record.endedAt)).toBe(true);
   expect(record.afterActors.state.localTime).toBe(record.localTime);expect(record.afterActors.state.player).toEqual(player.body);expect(record.afterActors.state.blasts).toEqual([]);
   expect(record.afterActors.dispatchBeforeActors).toEqual([]);
   expect(record.afterActors.dispatchOrder).toBe('Observer-local existing blasts then captured projectile actors');
   const detached=f.game.readSourceCallbackCapture();expect(detached.records[0]).toEqual(record);expect(detached.records[0]).not.toBe(record);expect(detached.records.some((row:any)=>row.actorStage==='pending')).toBe(false);
   physics.mockRestore();callbacks.mockRestore();input.mockRestore();actors.mockRestore();tail.mockRestore();muzzles.mockRestore();scope.mockRestore();
  }finally{receive?.mockRestore();vi.unstubAllGlobals();f.dispose();}
 });

 it.each(maps)('%s resumes the suspended callback before a newly due callback at a later frame time',map=>{
  const f=frameFixture(map);let fail:{mockRestore():void}|undefined;
  try{
   const worlds=f.game.ensureSoloWorlds(),player=worlds.worlds.get('player')!,bot=worlds.worlds.get(f.enemy.id)!;
   const physics=vi.spyOn(worlds,'physics'),callback=vi.spyOn(f.game,'updateOriginalPlayerCallback'),actors=vi.spyOn(worlds,'actors'),muzzles=vi.spyOn(f.game,'advanceOriginalMuzzleFlashes');
   const selected:{callback:number;weapon:string}[]=[],sink=f.game.receiveSoloWorldEvent;
   const receive=vi.spyOn(f.game,'receiveSoloWorldEvent').mockImplementation((event:any)=>{sink.call(f.game,event);if(event.kind==='loadout-state'&&event.recipientId==='player')selected.push({callback:player.callback,weapon:player.loadout!.selected});});
   f.game.originalMouseDelta={x:4,y:0};
   fail=vi.spyOn(bot.mirror,'prepareSynchronousDelivery').mockImplementationOnce(()=>{throw Error('later frame retry');});
   expect(()=>f.frame(0)).toThrow('later frame retry');fail.mockRestore();fail=undefined;
   const yaw=f.game.yaw;f.game.keys.add('Digit1');f.game.originalMouseDelta={x:6,y:0};
   f.frame(1/30);
   expect(player.callback).toBe(2);expect(bot.callback).toBe(2);expect(worlds.callbackPhase).toBe('idle');expect(f.game.soloPendingGameplayFrame).toBeUndefined();
   expect(physics.mock.calls.map(call=>call[0])).toEqual([0,1/30]);expect(actors.mock.calls.map(call=>call[0])).toEqual([0,1/30]);
   expect(callback).toHaveBeenCalledTimes(2);expect(muzzles).toHaveBeenCalledTimes(2);expect(player.health.flick).toBe(2);
   expect(selected).toEqual([{callback:1,weapon:'launcher'},{callback:2,weapon:'pistol'}]);
   expect(f.game.yaw).toBeLessThan(yaw);expect(f.game.originalMouseDelta).toEqual({x:0,y:0});expect(f.game.elapsed).toBe(1/30);
   expect(player.loadout!.ammo.launcher).toBe(6);expect(player.loadout!.ammo.pistol).toBe(8);
   physics.mockRestore();callback.mockRestore();actors.mockRestore();muzzles.mockRestore();receive.mockRestore();
  }finally{fail?.mockRestore();f.dispose();}
 });

 it.each(maps)('%s discards a suspended frame when its life is disposed and starts a fresh callback owner',map=>{
  const f=frameFixture(map);let fail:{mockRestore():void}|undefined;
  try{
   const worlds=f.game.ensureSoloWorlds(),player=worlds.worlds.get('player')!,bot=worlds.worlds.get(f.enemy.id)!,factory=f.game.soloLoadedSceneFactory;
   const physics=vi.spyOn(worlds,'physics'),actors=vi.spyOn(worlds,'actors');
   vi.stubGlobal('location',{search:'?e2e=1'});expect(f.game.enableSourceCallbackCapture()).toBe(true);
   fail=vi.spyOn(bot.mirror,'prepareSynchronousDelivery').mockImplementationOnce(()=>{throw Error('disposed frame retry');});
   expect(()=>f.frame(0)).toThrow('disposed frame retry');fail.mockRestore();fail=undefined;
   expect(f.game.soloPendingGameplayFrame.worlds).toBe(worlds);expect(player.callback).toBe(0);
   const oldRecord=f.game.sourceCallbackCapture.records[0];expect(oldRecord.actorStage).toBe('pending');
   f.game.disposeSoloWorlds(false);
   expect(oldRecord.actorStage).toBe('cancelled-gameover');expect(Number.isFinite(oldRecord.endedAt)).toBe(true);
   expect(f.game.soloPendingGameplayFrame).toBeUndefined();expect(f.game.soloHumanCallbackInput).toBeUndefined();expect(worlds.worlds.size).toBe(0);expect(()=>factory.readAssembly('player',player.lifeGeneration)).toThrow('released');
   f.game.nextSourceReloadPoll=-Infinity;f.game.keys.clear();f.frame(1/30);
   const next=f.game.soloWorlds,again=next.worlds.get('player')!;
   expect(next).not.toBe(worlds);expect(f.game.soloLoadedSceneFactory).not.toBe(factory);expect(again).not.toBe(player);
   expect(again.callback).toBe(1);expect(next.callbackPhase).toBe('idle');expect(f.game.soloPendingGameplayFrame).toBeUndefined();
   expect(again.loadout!.selected).toBe('launcher');expect(again.loadout!.ammo.launcher).toBe(6);
   expect(physics).toHaveBeenCalledOnce();expect(actors).not.toHaveBeenCalled();expect(player.callback).toBe(0);
   expect(f.game.sourceCallbackCapture.records).toHaveLength(2);expect(f.game.sourceCallbackCapture.records[0]).toBe(oldRecord);
   expect(f.game.sourceCallbackCapture.records[1].actorStage).toBe('captured');expect(f.game.sourceCallbackCapture.records[1].localTime).toBe(1/30);
   expect(f.game.readSourceCallbackCapture().records.some((record:any)=>record.actorStage==='pending')).toBe(false);
   physics.mockRestore();actors.mockRestore();
  }finally{fail?.mockRestore();vi.unstubAllGlobals();f.dispose();}
 });

 it.each(maps)('%s retains one RG6 launch and one debit across a frame retry without legacy projectile writes',map=>{
  const f=frameFixture(map);let fail:{mockRestore():void}|undefined;
  const geometry=vi.spyOn(f.soldierResources.geometry,'dispose'),material=vi.spyOn(f.soldierResources.material,'dispose');
  try{
   for(let i=0;i<45;i++)f.frame(i/30);
   const worlds=f.game.soloWorlds,player=worlds.worlds.get('player')!,bot=worlds.worlds.get(f.enemy.id)!;
   expect(player.callback).toBe(45);expect(player.loadout!.ammo.launcher).toBe(6);
   const read=vi.spyOn(f.game,'readSoloHumanCallbackInput'),physics=vi.spyOn(worlds,'physics');
   f.game.firing=true;
   fail=vi.spyOn(bot.mirror,'prepareSynchronousDelivery').mockImplementationOnce(()=>{throw Error('default frame launch retry');});
   expect(()=>f.frame(45/30)).toThrow('default frame launch retry');fail.mockRestore();fail=undefined;
   const captured=f.game.soloHumanCallbackInput.input,body=structuredClone(player.body),health={...player.health},reads=read.mock.calls.length;
   expect(player.loadout!.ammo.launcher).toBe(6);expect(player.projectiles.size).toBe(0);expect(bot.projectiles.size).toBe(0);
   f.game.firing=false;f.frame(45/30);
   expect(read.mock.calls).toHaveLength(reads);expect(f.game.soloHumanCallbackInput.input).toBe(captured);expect(physics).toHaveBeenCalledOnce();
   expect(player.body).toEqual(body);expect(player.health).toEqual(health);expect(player.loadout!.ammo.launcher).toBe(5);
   expect(player.projectiles.size).toBe(1);expect(bot.projectiles.size).toBe(1);
   const physical=[...player.projectiles.values()][0] as any,peer=[...bot.projectiles.values()][0] as any;
   expect(peer.launch).toBe(physical.launch);expect(physical.launch.ownerId).toBe('player');
   const actor=player.projectileState!.actors[0],mesh=f.game.soloProjectilePresentation.adapter.meshForHandle(actor.handle);
   expect(mesh).toBeInstanceOf(THREE.Mesh);expect(mesh.geometry).toBe(f.collection.resources.get('rg6grenade')!.geometry);expect(mesh.parent).toBe(f.scene);
   const previous=mesh.matrixWorld.clone();f.frame(46/30);
   expect(player.loadout!.ammo.launcher).toBe(5);expect(player.projectiles.size).toBe(1);expect(bot.projectiles.size).toBe(1);
   expect(f.game.soloProjectilePresentation.adapter.meshForHandle(actor.handle)).toBe(mesh);expect(mesh.matrixWorld.equals(previous)).toBe(false);
   expect(f.game.createProjectileMesh).not.toHaveBeenCalled();expect(f.game.orientProjectileMesh).not.toHaveBeenCalled();
   expect(geometry).not.toHaveBeenCalled();expect(material).not.toHaveBeenCalled();read.mockRestore();physics.mockRestore();
   f.game.clearEnemies();expect(f.game.soloWorlds).toBeUndefined();expect(f.game.soloLoadedSceneFactory).toBeUndefined();expect(f.game.soloStartupResources).toBeUndefined();
   expect(geometry).not.toHaveBeenCalled();expect(material).not.toHaveBeenCalled();
  }finally{fail?.mockRestore();geometry.mockRestore();material.mockRestore();f.dispose();}
 });
});
