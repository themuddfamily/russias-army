import * as THREE from 'three';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {Game} from './game';
import {readFileSync} from 'node:fs';
import {createOriginalArena,type OriginalArena} from './originalArena';
import type {OriginalMapAsset,OriginalMapData} from './originalMapAssets';
import {registerOriginalMapRuntime} from '../shared/originalMapRuntime';
import type {OriginalDoorTracks} from '../shared/originalDoorWorld';
import {WeaponState,WEAPONS} from './weapons';
import type {Vec3} from '../shared/protocol';
const input={forward:true,backward:false,left:false,right:false,jump:false,yaw:0,pitch:0,typing:false};
function player(x=0,health=100){return {id:'local',name:'LOCAL',alive:true,health,frags:0,deaths:0,transform:{position:{x,y:0,z:0},velocity:{x:0,y:0,z:0},grounded:true,yaw:0,pitch:0,weapon:'launcher',typing:false,sourceInput:input,movementMode:'source'}};}
function client(){
 const game=Object.create(Game.prototype) as any,camera=new THREE.PerspectiveCamera();camera.position.set(0,1.72,0);
 const floor=(from:Vec3,to:Vec3,radius:number)=>to.y<radius?{position:{x:to.x,y:radius,z:to.z},normal:{x:0,y:1,z:0},fraction:Math.max(0,(from.y-radius)/(from.y-to.y))}:null;
 const remote={id:'other',name:'OTHER',alive:true,sourceActorActive:true,hitMeshes:[new THREE.Mesh()],apply:vi.fn(),group:new THREE.Group(),debugState:()=>({})};
 Object.assign(game,{camera,velocity:new THREE.Vector3(),keys:new Set(),phase:'playing',playerAlive:true,archivalWinter:false,mode:'online',mapId:'woodlands',elapsed:1,
  sourceRemoteViewEpoch:1000,sourceRemoteViewGeneration:1,sourceRemoteViewCallbacks:7,nextSourceReloadPoll:1.2,
  grounded:true,needsAuthoritativeSpawn:false,controlsPreset:'legacy',arrowMovement:false,chatOpen:false,rightMouseAiming:false,yaw:0,pitch:0,
  arena:{runtime:{geometry:{sweepSphere:floor,sweepConvex:(from:Vec3,to:Vec3,shape:{vertices:readonly Vec3[]})=>floor(from,to,-Math.min(...shape.vertices.map(p=>p.y)))}}},
  weaponState:new WeaponState('woodlands'),projectiles:[],originalPlayerContacts:[],originalPlayerPrediction:[{serverTime:1080,input},{serverTime:1120,input}],networkMovementPath:[],
  remotePlayers:new Map([['other',remote]]),sourceTimeoutCorpses:new Set(),originalDoorClient:{snapshot:vi.fn()},network:{clientId:'local',state:'connected',connected:true,estimatedServerTimeMs:1120,resetTransformPath:vi.fn(),setTransform:vi.fn(),shoot:vi.fn(()=> 'shot')},
  attachOriginalDoors:vi.fn(),reconcileNetworkItems:vi.fn(),reconcileNetworkProjectiles:vi.fn(),updateNetworkStatus:vi.fn(),updateHud:vi.fn(),updateOriginalDoors:vi.fn(),updateViewModelPresentation:vi.fn(),
  pendingNetworkProjectileShots:new Map(),networkProjectiles:new Map(),scene:new THREE.Scene(),handledNetworkRG6Boosts:new Set()});
 return game;
}
function snapshot(time:number,x:number,health=100){return {map:'woodlands',tick:time,serverTime:time,sourcePhysicsTime:time,fragLimit:12,state:'playing',players:[player(x,health),{...player(9),id:'other'}],doors:[],projectiles:[]};}
const recoveredArenas:OriginalArena[]=[];
let recoveredAsset:OriginalMapAsset|undefined;
function recoveredClient(){
 if(!recoveredAsset){
  const data=JSON.parse(readFileSync(new URL('../public/assets/original-scenes/barrack/scene.json',import.meta.url),'utf8')) as OriginalMapData;
  registerOriginalMapRuntime('barrack',data);
  recoveredAsset={data,textures:Object.fromEntries(Object.keys(data.textures).map(name=>[name,new THREE.Texture()])),doorTracks:JSON.parse(readFileSync(new URL('../public/assets/original-scenes/barrack/doors.json',import.meta.url),'utf8')) as OriginalDoorTracks};
 }
 const game=client(),arena=createOriginalArena(game.scene,'barrack',recoveredAsset);recoveredArenas.push(arena);
 Object.assign(game,{arena,mapId:'barrack',weaponState:new WeaponState('barrack'),sourceHealth:{canonical:100,flick:2},
  renderer:{domElement:{},info:{render:{calls:0,triangles:0,points:0},memory:{geometries:0,textures:0}}},renderPipelinePasses:[],blastLights:[],
  sunShadow:{getDebugState:()=>({})},combatImpactMarks:{getStats:()=>({})},combatEffects:{getStats:()=>({})},snowTracks:{getStats:()=>({})},playerCollides:vi.fn(()=>false)});
 return game;
}
function recoveredSnapshot(game:any,time:number,offset:number){
 const barrels=game.arena.barrelWorld.snapshots();
 barrels[0].position.x+=offset;
 barrels[0].orientation={x:.01,y:.02,z:.03,w:Math.sqrt(1-.01**2-.02**2-.03**2)};
 barrels[0].velocity={x:.05,y:0,z:-.02};barrels[0].angularVelocity={x:.2,y:-.1,z:.15};
 const local=player(barrels[0].position.x-1.2,88);local.transform.position.z=barrels[0].position.z;
 return {...snapshot(time,local.transform.position.x,88),map:'barrack',players:[local,{...local,id:'other'}],barrels};
}
afterEach(()=>{for(const arena of recoveredArenas.splice(0))arena.dispose();vi.restoreAllMocks();vi.unstubAllGlobals();});
describe('actual Game source local reconciliation queue',()=>{
 it('preserves every snapshot side effect and reconciles the detached newest epoch exactly once',()=>{
  vi.spyOn(performance,'now').mockReturnValue(1500);
  const game=client(),reference=client(),spy=vi.spyOn(game,'reconcileOriginalPlayer');
  const newest=snapshot(1100,6,73);
  game.applyNetworkSnapshot(snapshot(1000,2,95));game.applyNetworkSnapshot(snapshot(1050,4,84));game.applyNetworkSnapshot(newest);
  newest.players[0].transform.position.x=99;
  expect(game.health).toBe(73);expect(game.latestNetworkSnapshot.players.find((p:any)=>p.id==='other').name).toBe('LOCAL');expect(game.remotePlayers.get('other').name).toBe('OTHER');expect(game.remotePlayers.get('other').apply).not.toHaveBeenCalled();expect(game.sourceRemoteRayTargets().meshes).toContain(game.remotePlayers.get('other').hitMeshes[0]);expect(game.originalDoorClient.snapshot).toHaveBeenCalledTimes(3);expect(game.reconcileNetworkProjectiles).toHaveBeenCalledTimes(3);expect(spy).not.toHaveBeenCalled();
  reference.reconcileOriginalPlayer(player(6,73),1100);game.flushOriginalReconciliation();game.flushOriginalReconciliation();
  expect(spy).toHaveBeenCalledOnce();expect(spy.mock.calls[0][1]).toBe(1100);
  expect(game.camera.position.toArray()).toEqual(reference.camera.position.toArray());expect(game.velocity.toArray()).toEqual(reference.velocity.toArray());expect(game.originalPlayerPrediction).toEqual(reference.originalPlayerPrediction);
  expect(game.sourceRemoteViewCallbacks).toBe(7);expect(game.nextSourceReloadPoll).toBe(reference.nextSourceReloadPoll);
 });
 it('applies distinct-name remote snapshot state without flushing the queued local physical epoch',()=>{
  const game=client(),remote=game.remotePlayers.get('other'),packet=snapshot(1100,6,73),spy=vi.spyOn(game,'reconcileOriginalPlayer');
  packet.players[1].name='OTHER';game.applyNetworkSnapshot(packet);
  expect(game.remotePlayers.get('other')).toBe(remote);expect(game.latestNetworkSnapshot.players[1]).toBe(packet.players[1]);
  expect(remote.apply).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({id:'other',name:'OTHER',x:9,health:100,alive:true}),false);
  expect(game.sourceRemoteRayTargets().meshes).toContain(remote.hitMeshes[0]);expect(game.pendingOriginalReconciliation.serverTime).toBe(1100);expect(spy).not.toHaveBeenCalled();
  expect(game.originalDoorClient.snapshot).toHaveBeenCalledOnce();expect(game.reconcileNetworkProjectiles).toHaveBeenCalledOnce();
  game.flushOriginalReconciliation();expect(spy).toHaveBeenCalledOnce();expect(spy.mock.calls[0][1]).toBe(1100);
 });
 it('uses the newest correction before publishing a dependent transform',()=>{
  const game=client();game.applyNetworkSnapshot(snapshot(1100,6));game.publishNetworkTransform();
  expect(game.network.setTransform.mock.calls[0][0].position.x).toBe(6);expect(game.pendingOriginalReconciliation).toBeUndefined();
 });
 it('uses corrected eye position for an actual explosive shot request',()=>{
  const game=client();game.applyNetworkSnapshot(snapshot(1100,6));game.predictNetworkProjectile=vi.fn();
  game.fireNetworkExplosive('launcher',WEAPONS.launcher);
  expect(game.network.shoot.mock.calls[0][0].origin.x).toBe(6);
 });
 it('flushes before a physical source callback and matches the newest immediate reference',()=>{
  const game=client(),reference=client();game.applyNetworkSnapshot(snapshot(1100,6));reference.reconcileOriginalPlayer(player(6),1100);
  game.updateOriginalPlayerCallback();reference.updateOriginalPlayerCallback();
  expect(game.camera.position.toArray()).toEqual(reference.camera.position.toArray());expect(game.velocity.toArray()).toEqual(reference.velocity.toArray());expect(game.sourceRemoteViewCallbacks).toBe(7);
 });
 it('keeps uncovered contact derivatives and removes covered ones at correction epoch',()=>{
  const game=client();game.originalPlayerPrediction=[];game.applyNetworkSnapshot(snapshot(1033,2));
  const contact={type:'projectile_contact',serverTime:1050,data:{playerId:'local',projectileId:'p',velocity:{x:2,y:12,z:3}}};
  game.handleNetworkEvent(contact);expect(game.originalPlayerContacts).toHaveLength(1);game.flushOriginalReconciliation();expect(game.originalPlayerContacts).toHaveLength(1);
  game.applyNetworkSnapshot(snapshot(1100,4));game.flushOriginalReconciliation();expect(game.originalPlayerContacts).toEqual([]);
  game.handleNetworkEvent({...contact,data:{...contact.data,projectileId:'covered'}});expect(game.originalPlayerContacts).toEqual([]);
 });
 it.each(['cancel','generation','map','dead'])('cannot replay an old correction after %s invalidates it',kind=>{
  const game=client(),spy=vi.spyOn(game,'reconcileOriginalPlayer');game.applyNetworkSnapshot(snapshot(1100,6));
  if(kind==='cancel')game.cancelOriginalReconciliation();if(kind==='generation')game.sourceRemoteViewGeneration=2;if(kind==='map')game.mapId='barrack';if(kind==='dead')game.playerAlive=false;
  game.flushOriginalReconciliation();expect(spy).not.toHaveBeenCalled();expect(game.pendingOriginalReconciliation).toBeUndefined();
 });
 it('cancels a pending live correction before a dead snapshot restores a newer barrel epoch',()=>{
  const game=client(),spy=vi.spyOn(game,'reconcileOriginalPlayer');
  let actual:any[]=[];
  game.arena.barrelWorld={applySnapshots:vi.fn((b:any[])=>{actual=structuredClone(b);})};game.arena.syncBarrels=vi.fn();game.setLocalNetworkDead=vi.fn();
  game.applyNetworkSnapshot({...snapshot(1000,2),barrels:[{id:'barrel',position:{x:1,y:2,z:3}}]});
  const dead=snapshot(1100,6);dead.players[0].alive=false;
  game.applyNetworkSnapshot({...dead,barrels:[{id:'barrel',position:{x:7,y:8,z:9}}]});game.flushOriginalReconciliation();
  expect(spy).not.toHaveBeenCalled();expect(actual[0].position).toEqual({x:7,y:8,z:9});expect(game.pendingOriginalReconciliation).toBeUndefined();expect(game.setLocalNetworkDead).toHaveBeenCalledOnce();
 });
 it('replaces the old pending epoch before snapshot door audio consumes the camera',()=>{
  const game=client(),spy=vi.spyOn(game,'reconcileOriginalPlayer');
  let actual:any[]=[];
  game.arena.barrelWorld={applySnapshots:vi.fn((b:any[])=>{actual=structuredClone(b);})};game.arena.syncBarrels=vi.fn();
  game.applyNetworkSnapshot({...snapshot(1000,2),barrels:[{id:'barrel',position:{x:1,y:2,z:3}}]});
  game.originalDoorClient.snapshot=()=>{game.flushOriginalReconciliation();expect(game.camera.position.x).toBe(6);expect(actual[0].position.x).toBe(7);};
  game.applyNetworkSnapshot({...snapshot(1100,6),barrels:[{id:'barrel',position:{x:7,y:8,z:9}}]});
  expect(spy).toHaveBeenCalledOnce();expect(spy.mock.calls[0][1]).toBe(1100);
 });
 it('uses the detached matching barrel authority state at the queued player epoch',()=>{
  const game=client();let actual:any[]=[];
  game.arena.barrelWorld={applySnapshots:vi.fn((b:any[])=>{actual=structuredClone(b);})};
  const barrels=[{id:'barrel',position:{x:7,y:8,z:9}}];game.queueOriginalReconciliation(player(6),1100,barrels,1100);barrels[0].position.x=99;
  game.reconcileOriginalPlayer=vi.fn(()=>expect(actual[0].position.x).toBe(7));game.flushOriginalReconciliation();expect(game.originalBarrelAuthorityTime).toBe(1100);
 });
 it('flushes a covered pending contact epoch before a newer unmatched barrel transition',()=>{
  const game=client();game.originalPlayerPrediction=[];
  let actual:any[]=[];game.arena.barrelWorld={applySnapshots:vi.fn((b:any[])=>{actual=structuredClone(b);})};game.arena.syncBarrels=vi.fn();
  const a={...snapshot(1000,1),barrels:[{id:'barrel',position:{x:1,y:2,z:3}}]};game.applyNetworkSnapshot(a);game.flushOriginalReconciliation();
  const b={...snapshot(1133,6),barrels:[{id:'barrel',position:{x:2,y:2,z:3}}]};b.players[0].transform.velocity={x:2,y:12,z:3};game.applyNetworkSnapshot(b);
  game.handleNetworkEvent({type:'projectile_contact',serverTime:1120,data:{playerId:'local',projectileId:'covered',velocity:{x:2,y:12,z:3}}});expect(game.originalPlayerContacts).toEqual([]);
  const c:any={...snapshot(1166,9),barrels:[{id:'barrel',position:{x:3,y:2,z:3}}]};delete c.players[0].transform.sourceInput;
  game.applyNetworkSnapshot(c);game.flushOriginalReconciliation();
  expect(game.camera.position.x).toBe(6);expect(game.velocity.toArray()).toEqual([2,12,3]);expect(game.originalReconciliationEpoch).toBe(1133);
  expect(game.originalBarrelAuthorityTime).toBe(1166);expect(game.originalBarrelReceivedTime).toBe(1166);expect(actual[0].position.x).toBe(3);expect(game.pendingOriginalReconciliation).toBeUndefined();
  game.handleNetworkEvent({type:'projectile_contact',serverTime:1150,data:{playerId:'local',projectileId:'uncovered',velocity:{x:4,y:9,z:2}}});expect(game.originalPlayerContacts).toHaveLength(1);expect(game.originalPlayerContacts[0].serverTime).toBe(1150);
  game.applyNetworkSnapshot(a);expect(actual[0].position.x).toBe(3);expect(game.originalBarrelAuthorityTime).toBe(1166);
 });
 it('reconciles a recovered Barrack player/barrel burst exactly like the newest immediate physical epoch',()=>{
  vi.spyOn(performance,'now').mockReturnValue(1500);
  const game=recoveredClient(),reference=recoveredClient(),initial=game.arena.barrelWorld.snapshots();
  const clocks={callbacks:game.sourceRemoteViewCallbacks,counter:game.weaponState.originalCounterState,contacts:game.originalProjectileContactCount};
  const first=recoveredSnapshot(game,1000,.01),middle=recoveredSnapshot(game,1050,.02),last=recoveredSnapshot(game,1100,.03);
  const spy=vi.spyOn(game,'reconcileOriginalPlayer');
  game.applyNetworkSnapshot(first);game.applyNetworkSnapshot(middle);game.applyNetworkSnapshot(last);
  expect(game.arena.barrelWorld.snapshots()).toEqual(initial);expect(game.originalBarrelAuthorityTime).toBeUndefined();expect(game.originalBarrelReceivedTime).toBe(1100);expect(spy).not.toHaveBeenCalled();
  reference.sourceRemoteViewEpoch=null;reference.applyNetworkSnapshot(last);game.flushOriginalReconciliation();
  expect(spy).toHaveBeenCalledOnce();expect(game.camera.position.toArray()).toEqual(reference.camera.position.toArray());expect(game.velocity.toArray()).toEqual(reference.velocity.toArray());
  expect(game.arena.barrelWorld.snapshots()).toEqual(reference.arena.barrelWorld.snapshots());expect(game.arena.barrelModelPivots()).toEqual(reference.arena.barrelModelPivots());
  expect(game.originalBarrelAuthorityTime).toBe(1100);expect(game.originalBarrelReceivedTime).toBe(1100);expect(game.nextSourceReloadPoll).toBe(reference.nextSourceReloadPoll);
  expect({callbacks:game.sourceRemoteViewCallbacks,counter:game.weaponState.originalCounterState,contacts:game.originalProjectileContactCount}).toEqual(clocks);
  expect(game.latestNetworkSnapshot.players.find((p:any)=>p.id==='other').name).toBe('LOCAL');expect(game.remotePlayers.get('other').name).toBe('OTHER');expect(game.remotePlayers.get('other').apply).not.toHaveBeenCalled();expect(game.sourceRemoteRayTargets().meshes).toContain(game.remotePlayers.get('other').hitMeshes[0]);expect(game.reconcileNetworkProjectiles).toHaveBeenCalledTimes(3);
 });
 it('keeps actual debug reads observational while exposing received, pending and applied epochs',()=>{
  vi.stubGlobal('document',{pointerLockElement:null});vi.spyOn(performance,'now').mockReturnValue(1500);
  const game=recoveredClient();game.applyNetworkSnapshot(recoveredSnapshot(game,1000,.01));game.flushOriginalReconciliation();
  const position=game.camera.position.toArray(),velocity=game.velocity.toArray(),bodies=game.arena.barrelWorld.snapshots(),models=game.arena.barrelModelPivots(),counter=game.weaponState.originalCounterState;
  game.applyNetworkSnapshot(recoveredSnapshot(game,1100,.3));const clock=game.nextSourceReloadPoll;const spy=vi.spyOn(game,'reconcileOriginalPlayer');
  const first=game.multiplayerDebugState(),second=game.multiplayerDebugState();
  expect(spy).not.toHaveBeenCalled();expect(game.camera.position.toArray()).toEqual(position);expect(game.velocity.toArray()).toEqual(velocity);expect(game.arena.barrelWorld.snapshots()).toEqual(bodies);expect(game.arena.barrelModelPivots()).toEqual(models);
  expect(first.originalBarrels.snapshotTime).toBe(1000);expect(first.originalBarrels.snapshotBodies).toEqual(game.originalBarrelSnapshotBodies);expect(first.originalBarrels.snapshotBodies).not.toEqual(game.latestNetworkSnapshot.barrels);
  expect(first.originalBarrels).toEqual(second.originalBarrels);expect(first.originalBarrels.authorityTime).toBe(1000);expect(first.originalBarrels.receivedAuthorityTime).toBe(1100);expect(first.originalBarrels.pendingCorrectionTime).toBe(1100);expect(first.originalBarrels.appliedPlayerTime).toBe(1000);expect(first.originalBarrels.bodies).toEqual(bodies);
  expect(game.nextSourceReloadPoll).toBe(clock);expect(game.weaponState.originalCounterState).toEqual(counter);expect(game.sourceRemoteViewCallbacks).toBe(7);
  game.publishNetworkTransform();expect(game.pendingOriginalReconciliation).toBeUndefined();expect(game.originalBarrelAuthorityTime).toBe(1100);
  const committed=game.multiplayerDebugState();expect(committed.originalBarrels.snapshotTime).toBe(1100);expect(committed.originalBarrels.snapshotBodies).toEqual(game.latestNetworkSnapshot.barrels);expect(committed.originalBarrels.pendingCorrectionTime).toBeNull();
 });
 it('rejects a retained pre-cancellation correction even when map and server generation are unchanged',()=>{
  const game=client();game.applyNetworkSnapshot(snapshot(1100,6));const stale=game.pendingOriginalReconciliation;game.cancelOriginalReconciliation();game.pendingOriginalReconciliation=stale;
  const spy=vi.spyOn(game,'reconcileOriginalPlayer');game.flushOriginalReconciliation();expect(spy).not.toHaveBeenCalled();expect(game.camera.position.x).toBe(0);
 });
 it('does not replace a newer queued physical epoch with an older correction',()=>{
  const game=client();game.queueOriginalReconciliation(player(6),1100);game.queueOriginalReconciliation(player(2),1000);game.flushOriginalReconciliation();expect(game.camera.position.x).toBe(6);
 });
 it.each(['winter','solo','unnegotiated'])('retains the immediate correction path for %s',kind=>{
  const game=client();if(kind==='winter')game.archivalWinter=true;if(kind==='solo')game.mode='solo';if(kind==='unnegotiated')game.sourceRemoteViewEpoch=null;
  const spy=vi.spyOn(game,'reconcileOriginalPlayer');game.queueOriginalReconciliation(player(6),1100);expect(spy).toHaveBeenCalledOnce();expect(game.pendingOriginalReconciliation).toBeUndefined();
 });
});
