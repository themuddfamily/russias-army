import * as THREE from 'three';
import {readFileSync} from 'node:fs';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {Game} from './game';
import {createOriginalArena,type OriginalArena} from './originalArena';
import type {OriginalMapAsset,OriginalMapData} from './originalMapAssets';
import {registerOriginalMapRuntime} from '../shared/originalMapRuntime';
import type {LegacyMapId} from '../shared/legacyMaps';
import type {OriginalDoorTracks} from '../shared/originalDoorWorld';
import {WeaponState} from './weapons';
import {ORIGINAL_PLAYER_RADIUS,ORIGINAL_MAP_SCALE} from '../shared/originalMapProfile';
import {ORIGINAL_PLAYER_DERIVATIVE_FACTOR} from '../shared/originalPlayerPhysics';

const assets=new Map<LegacyMapId,OriginalMapAsset>();
for(const map of ['barrack','woodlands'] as const){
  const folder=map==='woodlands'?'woodland':'barrack';
  const data=JSON.parse(readFileSync(new URL(`../public/assets/original-scenes/${folder}/scene.json`,import.meta.url),'utf8')) as OriginalMapData;
  registerOriginalMapRuntime(map,data);
  const textures=Object.fromEntries(Object.keys(data.textures).map(name=>[name,new THREE.Texture()]));
  const doorTracks=map==='barrack'?JSON.parse(readFileSync(new URL('../public/assets/original-scenes/barrack/doors.json',import.meta.url),'utf8')) as OriginalDoorTracks:{version:1 as const,doors:[]};
  assets.set(map,{data,textures,doorTracks});
}
const owned:OriginalArena[]=[];
afterEach(()=>{for(const arena of owned.splice(0))arena.dispose();vi.restoreAllMocks();});
function client(map:LegacyMapId,mode='solo'){
  const game=Object.create(Game.prototype) as any,scene=new THREE.Scene(),arena=createOriginalArena(scene,map,assets.get(map)!);owned.push(arena);
  const camera=new THREE.PerspectiveCamera();camera.position.set(200,100,200);
  Object.assign(game,{archivalWinter:false,mapId:map,mode,phase:'playing',scene,arena,camera,playerAlive:false,
    velocity:new THREE.Vector3(),projectiles:[],elapsed:0,originalPlayerContacts:[],originalBarrelAuthorityTime:-Infinity,
    keys:new Set(),controlsPreset:'legacy',arrowMovement:false,chatOpen:false,rightMouseAiming:false,
    weaponState:new WeaponState(map),yaw:0,pitch:0,recoil:0,grounded:false,nextSourceReloadPoll:-Infinity,
    needsAuthoritativeSpawn:false,originalPlayerPrediction:[],remotePlayers:new Map(),
    updateOriginalDoors:vi.fn(),updateViewModelPresentation:vi.fn(),updateHud:vi.fn(),setMessage:vi.fn(),
    network:{clientId:'local',estimatedServerTimeMs:1000,resetTransformPath:vi.fn()},
    attachOriginalDoors:vi.fn(),reconcileNetworkItems:vi.fn(),reconcileNetworkProjectiles:vi.fn(),updateNetworkStatus:vi.fn()});
  return game;
}
function snapshots(game:any,time:number,barrels=game.arena.barrelWorld.snapshots(),players:any[]=[]){
  return {type:'snapshot',map:game.mapId,serverTime:time,sourcePhysicsTime:time,barrels,players,projectiles:[],fragLimit:10,state:'playing'};
}
describe('actual Game recovered movable barrel world',()=>{
  it.each(['solo','online'])('Barrack %s runs the full source convex body through floor motion and keeps its preserved visual aligned',mode=>{
    const game=client('barrack',mode),arena=game.arena as OriginalArena;
    const initial=arena.barrelWorld.snapshots();expect(initial).toHaveLength(1);
    const before=initial[0];expect(before.position.y-arena.barrelWorld.getInitialPosition(before.id)!.y).toBeCloseTo(10*arena.runtime.scale,10);
    expect(arena.barrelModelPivots()[0].pivot.y).toBeCloseTo(before.position.y,10);
    for(let frame=0;frame<60;frame++){game.elapsed=frame/30;game.updateOriginalPlayerCallback();}
    const after=arena.barrelWorld.snapshots()[0];expect(after.position.y).toBeLessThan(before.position.y-.05);
    expect(after.position.y).toBeGreaterThan(before.position.y-2);
    const pivot=arena.barrelModelPivots()[0].pivot;
    expect(pivot.x).toBeCloseTo(after.position.x,10);expect(pivot.y).toBeCloseTo(after.position.y,10);expect(pivot.z).toBeCloseTo(after.position.z,10);
    expect(arena.barrelWorld.bodies[0].convex!.vertices.length).toBeGreaterThan(8);
    arena.resetBarrels();expect(arena.barrelWorld.snapshots()).toEqual(initial);expect(arena.barrelModelPivots()[0].pivot.y).toBeCloseTo(before.position.y,10);
  });
  it('uses the current moved barrel hull as a nearer local ballistic obstruction, without inventing a detonation',()=>{
    const game=client('barrack'),arena=game.arena as OriginalArena;
    const barrels=arena.barrelWorld.snapshots();barrels[0].position={x:100,y:100,z:100};arena.barrelWorld.applySnapshots(barrels);arena.syncBarrels();
    const origin=new THREE.Vector3(95,100.1,100),direction=new THREE.Vector3(1,0,0);
    const hit=game.raycastWorld(origin,direction,10);
    expect(hit?.id).toContain(barrels[0].id);expect(hit?.distance).toBeLessThan(10);
    expect(game.distanceToWorld(origin,direction,10)).toBe(hit.distance);
    expect(arena.barrelWorld.playerIntersects({x:100,y:100,z:100},.3,1.9)).toBe(true);
    const pivot=arena.barrelModelPivots()[0].pivot;
    expect(pivot.x).toBeCloseTo(100,10);expect(pivot.y).toBeCloseTo(100,10);expect(pivot.z).toBeCloseTo(100,10);
    game.camera.position.set(100,101.72,100);expect(game.playerCollides()).toBe(true);
  });
  it.each(['solo','online'])('joint %s player collision transfers momentum instead of walking through the visible barrel',mode=>{
    const game=client('barrack',mode),arena=game.arena as OriginalArena;
    const state=arena.barrelWorld.snapshots();state[0].position={x:100,y:100,z:100};arena.barrelWorld.applySnapshots(state);arena.syncBarrels();
    const vertices=arena.barrelWorld.bodies[0].convex.vertices;
    const maxX=Math.max(...vertices.map(p=>p.x)),centerY=(Math.min(...vertices.map(p=>p.y))+Math.max(...vertices.map(p=>p.y)))/2;
    game.playerAlive=true;game.camera.position.set(100+maxX+ORIGINAL_PLAYER_RADIUS+.04,100+centerY+60*ORIGINAL_MAP_SCALE,100);
    game.velocity.set(-4*ORIGINAL_PLAYER_DERIVATIVE_FACTOR,0,0);game.updateOriginalPlayerCallback();
    const after=arena.barrelWorld.snapshots()[0];expect(after.velocity.x).toBeLessThan(-.1);expect(after.position.x).toBeLessThan(100);
    expect(game.camera.position.x).toBeGreaterThan(after.position.x);expect(arena.barrelModelPivots()[0].pivot.x).toBeCloseTo(after.position.x,10);
  });
  it('keeps the recovered linear model transform and mesh resources while restoring absence and reappearance',()=>{
    const game=client('barrack'),arena=game.arena as OriginalArena,model=arena.group.getObjectByName('barrel')!;
    const linear=model.matrix.elements.slice(0,12),children=[...model.children],state=arena.barrelWorld.snapshots();
    state[0].position.x+=3;arena.barrelWorld.applySnapshots(state);arena.syncBarrels();
    expect(model.matrix.elements.slice(0,12)).toEqual(linear);expect(model.children).toEqual(children);
    arena.barrelWorld.applySnapshots([]);arena.syncBarrels();expect(model.visible).toBe(false);
    arena.barrelWorld.applySnapshots(state);arena.syncBarrels();expect(model.visible).toBe(true);
  });
  it('restores full angular barrel pose in actual Three geometry without moving its model pivot or changing mesh resources',()=>{
    const game=client('barrack','online'),arena=game.arena as OriginalArena,model=arena.group.getObjectByName('barrel')!;
    arena.group.updateWorldMatrix(true,true);const initialMatrix=model.matrixWorld.clone(),initialPivot=new THREE.Vector3().setFromMatrixPosition(initialMatrix),localPoint=new THREE.Vector3(3,4,5);
    const initialOffset=localPoint.clone().applyMatrix4(initialMatrix).sub(initialPivot),children=[...model.children],state=arena.barrelWorld.snapshots();
    state[0].position={x:100,y:50,z:100};state[0].orientation={x:0,y:0,z:Math.SQRT1_2,w:Math.SQRT1_2};state[0].angularVelocity={x:0,y:0,z:45};
    game.applyNetworkSnapshot(snapshots(game,2000,state));arena.group.updateWorldMatrix(true,true);
    const pivot=new THREE.Vector3().setFromMatrixPosition(model.matrixWorld);expect(pivot.distanceTo(new THREE.Vector3(100,50,100))).toBeLessThan(1e-10);
    const rendered=localPoint.clone().applyMatrix4(model.matrixWorld).sub(pivot),expected=new THREE.Vector3(-initialOffset.y,initialOffset.x,initialOffset.z);
    expect(rendered.distanceTo(expected)).toBeLessThan(1e-10);expect(model.children).toEqual(children);
    const canonical=arena.barrelWorld.snapshots()[0];expect(canonical.angularVelocity).toEqual({x:0,y:0,z:45});expect(canonical.orientation!.z).toBeCloseTo(Math.SQRT1_2,12);
    arena.resetBarrels();arena.group.updateWorldMatrix(true,true);expect(model.matrixWorld.elements).toEqual(initialMatrix.elements);expect(arena.barrelWorld.snapshots()[0].angularVelocity).toEqual({x:0,y:0,z:0});
  });
  it('restores late-join barrel pose before replay and rejects an older physics epoch',()=>{
    const game=client('barrack','online'),arena=game.arena as OriginalArena;
    const state=arena.barrelWorld.snapshots();state[0].position={x:100,y:100,z:100};state[0].velocity={x:1,y:0,z:0};
    game.applyNetworkSnapshot(snapshots(game,2000,state));expect(arena.barrelWorld.snapshots()).toEqual(state);
    const stale=arena.barrelWorld.snapshots();stale[0].position.x=25;
    const freshPacket=snapshots(game,1999,stale);freshPacket.serverTime=3000;freshPacket.fragLimit=12;
    game.applyNetworkSnapshot(freshPacket);expect(arena.barrelWorld.snapshots()).toEqual(state);
    expect(game.latestNetworkSnapshot.serverTime).toBe(3000);expect(game.networkFragLimit).toBe(12);expect(game.reconcileNetworkItems).toHaveBeenCalledTimes(2);
    expect(game.originalBarrelAuthorityTime).toBe(2000);expect(arena.barrelModelPivots()[0].pivot.x).toBeCloseTo(100,10);
  });
  it('uses the source health callback epoch when authority has no source player body',()=>{
    const game=client('barrack','online'),arena=game.arena as OriginalArena,state=arena.barrelWorld.snapshots();
    state[0].position={x:100,y:100,z:100};
    const packet={...snapshots(game,1000,state),sourcePhysicsTime:undefined,sourceHealthTime:900};game.applyNetworkSnapshot(packet);
    expect(game.originalBarrelAuthorityTime).toBe(900);
    const old=arena.barrelWorld.snapshots();old[0].position.x=5;
    game.applyNetworkSnapshot({...packet,serverTime:2000,sourceHealthTime:899,barrels:old});
    expect(arena.barrelWorld.snapshots()).toEqual(state);expect(game.latestNetworkSnapshot.serverTime).toBe(2000);
  });
  it('replays only pending body callbacks from the authoritative barrel epoch',()=>{
    const game=client('barrack','online'),arena=game.arena as OriginalArena;
    const state=arena.barrelWorld.snapshots();state[0].position={x:100,y:100,z:100};state[0].velocity={x:1,y:0,z:0};
    const input={forward:false,backward:false,left:false,right:false,jump:false,typing:false,yaw:0,pitch:0};
    game.playerAlive=true;game.originalPlayerPrediction=[{serverTime:900,input},{serverTime:1040,input}];
    const player={id:'local',name:'local',alive:true,health:100,frags:0,deaths:0,transform:{position:{x:200,y:100,z:200},velocity:{x:0,y:0,z:0},grounded:false,weapon:'launcher',sourceInput:input}};
    game.applyNetworkSnapshot(snapshots(game,1000,state,[player]));
    const replayed=arena.barrelWorld.snapshots()[0];expect(replayed.position.x).toBeCloseTo(100.05,10);expect(replayed.position.y).toBeLessThan(100);
    expect(game.originalPlayerPrediction).toHaveLength(1);expect(arena.barrelModelPivots()[0].pivot.x).toBeCloseTo(replayed.position.x,10);
    const once=arena.barrelWorld.snapshots();game.applyNetworkSnapshot(snapshots(game,1000,state,[player]));expect(arena.barrelWorld.snapshots()).toEqual(once);
    const eye=game.camera.position.clone(),older=snapshots(game,999,state,[player]);older.serverTime=1200;older.fragLimit=12;
    game.applyNetworkSnapshot(older);expect(arena.barrelWorld.snapshots()).toEqual(once);expect(game.camera.position.toArray()).toEqual(eye.toArray());
    expect(game.networkFragLimit).toBe(12);
  });
  it.each(['solo','online'])('Woodland %s has no invented barrel bodies or model changes',mode=>{
    const game=client('woodlands',mode),arena=game.arena as OriginalArena;
    expect(arena.barrelWorld.snapshots()).toEqual([]);expect(arena.barrelModelPivots()).toEqual([]);
    game.updateOriginalPlayerCallback();expect(arena.barrelWorld.snapshots()).toEqual([]);
    game.applyNetworkSnapshot(snapshots(game,1000,[]));expect(arena.barrelWorld.snapshots()).toEqual([]);
  });
});
