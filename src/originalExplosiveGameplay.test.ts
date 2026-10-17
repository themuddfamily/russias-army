import * as THREE from 'three';
import {describe,expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {registerOriginalMapRuntime} from '../shared/originalMapRuntime';
import {OriginalBarrelWorld} from '../shared/originalBarrelWorld';
import {WeaponState} from './weapons';
import {createOriginalPlayerHealth} from '../shared/originalPlayerHealth';
import {Game} from './game';
import {installOriginalSoloLegacyFixture} from './originalSoloLegacy.fixture';
import {ORIGINAL_MAP_SCALE} from '../shared/originalMapProfile';
import type {OriginalProjectileState,OriginalBlastState} from '../shared/originalExplosives';

interface Harness {
  [key:string]:any;
  camera:THREE.PerspectiveCamera;velocity:THREE.Vector3;playerAlive:boolean;health:number;archivalWinter:boolean;
  projectiles:Array<{source:OriginalProjectileState;mesh:THREE.Mesh}>;originalBlasts:OriginalBlastState[];
  originalProjectileContactCount:number;grounded:boolean;
  launchExplosive(weapon:'launcher'|'rpg'):void;updateProjectiles(delta:number):void;
  updateOriginalExplosives(physicsAlreadyStepped?:boolean):void;
  spawnExplosion:ReturnType<typeof vi.fn>;takeDamage:ReturnType<typeof vi.fn>;
}
const runtime=registerOriginalMapRuntime('woodlands',JSON.parse(readFileSync('public/assets/original-scenes/woodland/scene.json','utf8')));
function client():Harness {
  const game=Object.create(Game.prototype) as Harness,camera=new THREE.PerspectiveCamera();camera.position.set(1000,1000,1000);
  Object.assign(game,{camera,pitch:0,yaw:0,velocity:new THREE.Vector3(),playerAlive:true,phase:'playing',mode:'solo',health:100,archivalWinter:false,
    projectiles:[],originalBlasts:[],originalProjectileAccumulator:0,originalProjectileContactCount:0,enemies:[],grounded:false,
    scene:new THREE.Scene(),arena:{colliders:[],runtime,barrelWorld:new OriginalBarrelWorld(runtime)},mapId:'woodlands',elapsed:0,localCallsign:'Local goody',originalActorDispatchGeneration:0,
    sourceHealth:createOriginalPlayerHealth(),keys:new Set(),controlsPreset:'legacy',arrowMovement:false,chatOpen:false,recoil:0,weaponSwayX:0,weaponSwayY:0,weaponState:new WeaponState('woodlands'),firing:false,
    updateViewModelPresentation:vi.fn(),updateHud:vi.fn(),playOriginalCombatSound:vi.fn(),setMessage:vi.fn(),showOriginalHurt:vi.fn(),playPlayerHurtSound:vi.fn(),
    projectileRocketGeometry:new THREE.BufferGeometry(),projectileShellGeometry:new THREE.BufferGeometry(),projectileShellMaterial:new THREE.MeshBasicMaterial(),
    audio:{play:vi.fn(),playOriginalHurt:vi.fn()},spawnExplosion:vi.fn(),raycastWorld:vi.fn(()=>null),showHitmarker:vi.fn(),registerKill:vi.fn(),
    takeDamage:vi.fn((amount:number)=>{game.health-=amount;})});
  installOriginalSoloLegacyFixture(game);game.arena.barrelWorld.applySnapshots([]);return game;
}
/** Explicit fixture clock invokes actual coordinated Game callback phases.
 * The API under test is ownership/lifetime, not render-clock startup timing. */
function advance(game:Harness,delta:number){
 game.originalProjectileAccumulator+=delta;
 while(game.originalProjectileAccumulator>=1/30-1e-9){game.originalProjectileAccumulator-=1/30;game.elapsed+=1/30;
  game.beginSoloCallback();game.updateOriginalPlayerCallback(true);game.completeSoloGoody();game.updateOriginalExplosives(true);
 }
}
/** Actor-only callbacks hold this fixture's body fixed to isolate bangs hurt
 * from separately tested gravity, contact and control integration. */
function actors(game:Harness){
 const worlds=game.ensureSoloWorlds(),human=worlds.worlds.get('player');human.body.position={x:game.camera.position.x,y:game.camera.position.y-60*ORIGINAL_MAP_SCALE,z:game.camera.position.z};
 worlds.physics(game.elapsed,{skipIds:new Set(['player'])});worlds.completeExternalGoody('player');worlds.completeGoody(game.elapsed);game.updateOriginalExplosives(true);
}
/** Restore one actually admitted private projectile at its last actor callback
 * and exercise the actual Game human detonation/presentation route. */
function detonateSource(game:Harness,point:THREE.Vector3):void {
 game.launchExplosive('launcher');const source=game.projectiles[0].source;source.position={x:point.x,y:point.y,z:point.z};source.remainingCallbacks=2;
 actors(game);
 expect(game.projectiles).toHaveLength(0);expect(game.spawnExplosion).toHaveBeenCalledOnce();
 expect(game.originalBlasts).toHaveLength(1);expect(game.originalBlasts[0].position).toEqual({x:point.x,y:point.y,z:point.z});expect(game.originalBlasts[0].remainingCallbacks).toBe(16);
}
describe('actual Game recovered explosive lifecycle',()=>{
  it('launches RG6 from eye without clearance, aim lift, spread, or immediate wall detonation',()=>{
    const game=client();game.launchExplosive('launcher');const projectile=game.projectiles[0];
    expect(projectile.mesh.position.toArray()).toEqual(game.camera.position.toArray());
    expect(projectile.source.velocity).toEqual({x:0,y:0,z:-1300*ORIGINAL_MAP_SCALE});
    expect(projectile.source.remainingCallbacks).toBe(60);expect(game.spawnExplosion).not.toHaveBeenCalled();
  });
  it('uses the recovered projectile resource and keeps its source vertex pivot',()=>{
    const game=client(),geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute([-1,0,.1,0,.1,.1,0,0,.2],3));
    const material=new THREE.MeshBasicMaterial(),resource=new THREE.Mesh(geometry,material);resource.visible=false;
    Object.assign(game,{originalWeapons:{resources:new Map([['rpgrocket',resource]])}});game.launchExplosive('rpg');
    const mesh=game.projectiles[0].mesh;expect(mesh.geometry).toBe(geometry);expect(mesh.material).toBe(material);expect(mesh.visible).toBe(true);
    expect(mesh.geometry.getAttribute('position').getX(0)).toBe(-1);
    expect(new THREE.Vector3(-1,0,0).applyQuaternion(mesh.quaternion).distanceTo(new THREE.Vector3(0,0,-1))).toBeLessThan(1e-10);
  });
  it('launches RPG at eye plus source50 and preserves 200 callback lifetime',()=>{
    const game=client();game.launchExplosive('rpg');const projectile=game.projectiles[0];
    expect(projectile.source.position).toEqual({x:1000,y:1000,z:1000-50*ORIGINAL_MAP_SCALE});
    expect(projectile.source.velocity.z).toBe(-800*ORIGINAL_MAP_SCALE);expect(projectile.source.remainingCallbacks).toBe(200);
  });
  it('integrates .05 physics seconds per callback and explodes RG6 only on callback59',()=>{
    const game=client();game.launchExplosive('launcher');
    advance(game,1/60);expect(game.projectiles[0].source.remainingCallbacks).toBe(60);
    advance(game,1/60);expect(game.projectiles[0].source.remainingCallbacks).toBe(59);
    expect(game.projectiles[0].source.position.z).toBeCloseTo(1000-1300*ORIGINAL_MAP_SCALE*.05,10);
    for(let i=1;i<58;i++)advance(game,1/30);
    expect(game.projectiles).toHaveLength(1);expect(game.spawnExplosion).not.toHaveBeenCalled();
    advance(game,1/30);expect(game.projectiles).toHaveLength(0);expect(game.originalBlasts[0].remainingCallbacks).toBe(16);expect(game.spawnExplosion).toHaveBeenCalledOnce();
  });
  it('bounces against actual supplied triangle normals without impact detonation',()=>{
    const game=client();game.camera.rotation.y=Math.PI/2;
    const geometry=Object.create(runtime.geometry);geometry.sweepConvex=(from:THREE.Vector3,to:THREE.Vector3)=>to.x<999.9?{position:{x:999.9,y:from.y,z:from.z},normal:{x:1,y:0,z:0},fraction:.5}:null;
    game.arena.runtime={...runtime,geometry};game.launchExplosive('launcher');
    advance(game,1/30);expect(game.projectiles).toHaveLength(1);expect(game.projectiles[0].source.velocity.x).toBeGreaterThan(0);expect(game.originalProjectileContactCount).toBeGreaterThan(0);expect(game.originalBlasts).toHaveLength(0);
  });
  it('exchanges contact momentum with source player sphere rather than adding a detonation boost',()=>{
    const game=client();game.camera.rotation.x=-Math.PI/2;game.launchExplosive('launcher');
    advance(game,1/30);expect(game.originalProjectileContactCount).toBeGreaterThan(0);
    expect(game.velocity.y).toBeLessThan(0);expect(game.takeDamage).not.toHaveBeenCalled();expect(game.originalBlasts).toHaveLength(0);
  });
  it('applies5 each of16 blast callbacks without falloff, LOS or an explosion impulse',()=>{
    const game=client(),point=game.camera.position.clone().add(new THREE.Vector3(4,0,0));game.velocity.set(1,2,3);
    detonateSource(game,point);expect(game.takeDamage).not.toHaveBeenCalled();
    const blockedSight=vi.fn(()=>0);Object.assign(game,{distanceToWorld:blockedSight});
    for(let i=0;i<16;i++)actors(game);
    expect(game.playPlayerHurtSound).toHaveBeenCalledTimes(16);expect(game.takeDamage).not.toHaveBeenCalled();expect(game.sourceHealth.canonical).toBe(100-16*5);
    expect(game.health).toBe(20);expect(game.velocity.toArray()).toEqual([1,2,3]);expect(game.originalBlasts).toHaveLength(0);expect(blockedSight).not.toHaveBeenCalled();
    actors(game);expect(game.playPlayerHurtSound).toHaveBeenCalledTimes(16);
  });
  it('tests strict eye radius every callback so leaving and reentering changes damage',()=>{
    const game=client(),point=game.camera.position.clone();point.x=0;detonateSource(game,point);
    game.camera.position.x=250*ORIGINAL_MAP_SCALE;actors(game);expect(game.playPlayerHurtSound).not.toHaveBeenCalled();
    game.camera.position.x-=1e-6;actors(game);expect(game.playPlayerHurtSound).toHaveBeenCalledOnce();
    game.camera.position.x=20;actors(game);expect(game.playPlayerHurtSound).toHaveBeenCalledOnce();
    game.camera.position.x=0;actors(game);expect(game.playPlayerHurtSound).toHaveBeenCalledTimes(2);
  });
});
