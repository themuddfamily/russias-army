import * as THREE from 'three';
import {afterEach,describe,it,expect,vi} from 'vitest';
import {Game} from './game';
import {WeaponState} from './weapons';
import {soloFloorRuntime,soloBodyActorCallback} from './originalSoloGameplayHarness';
import {installOriginalSoloLegacyFixture} from './originalSoloLegacy.fixture';
// Analytic-floor compatibility fixtures retain their actual body/control/actor
// capture invariants. They intentionally lack the loaded default scene assets;
// default-factory capture/retry coverage lives in the default scavenging suites.
function client(map:'woodlands'|'b'='woodlands'):any {
  const game=Object.create(Game.prototype) as any,camera=new THREE.PerspectiveCamera();camera.position.set(0,1.72,0);
  Object.assign(game,{camera,velocity:new THREE.Vector3(),keys:new Set(),elapsed:0,phase:'playing',playerAlive:true,archivalWinter:false,
    mode:'solo',mapId:map,grounded:true,chatOpen:false,firing:false,weaponState:new WeaponState(map),
    controlsPreset:'legacy',arrowMovement:true,yaw:0,pitch:0,recoil:0,aiming:false,rightMouseAiming:false,weaponSwayX:0,weaponSwayY:0,
    projectiles:[],originalBlasts:[],originalProjectileAccumulator:0,nextSourceReloadPoll:-Infinity,originalProjectileContactCount:0,
    arena:{runtime:soloFloorRuntime(map)},scene:new THREE.Scene(),audio:{play:vi.fn()},
    updateViewModelPresentation:vi.fn(),updateHud:vi.fn(),setMessage:vi.fn(),triggerViewModelFire:vi.fn(),spawnMuzzleParticles:vi.fn(),spawnCasing:vi.fn(),
    muzzleLight:{intensity:0},worldMuzzleLight:{intensity:0},projectileShellGeometry:new THREE.BufferGeometry(),projectileShellMaterial:new THREE.MeshBasicMaterial(),
    projectileRocketGeometry:new THREE.BufferGeometry(),spawnExplosion:vi.fn(),takeDamage:vi.fn(),enemies:[],soloCorpses:new Map(),soloBotShots:[]});
  installOriginalSoloLegacyFixture(game);
  return game;
}
afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks();});
function e2e(){vi.stubGlobal('location',{search:'?e2e=1'});}
function advance(game:any,at:number){soloBodyActorCallback(game,at);}
describe('opt-in detached source callback capture (analytic-floor compatibility)',()=>{
 it('rejects ordinary instances and leaves disabled callbacks without state capture',()=>{
  vi.stubGlobal('location',{search:''});const game=client(),capture=vi.spyOn(game,'captureSourceCallbackState');
  expect(game.enableSourceCallbackCapture()).toBe(false);advance(game,0);
  expect(capture).not.toHaveBeenCalled();expect(game.readSourceCallbackCapture()).toBeNull();
 });
 it('records physical stages and launched hulls without changing actual physics or actor lifetime',()=>{
  e2e();const observed=client(),normal=client();observed.enableSourceCallbackCapture();
  for(const game of [observed,normal]){game.originalPlayerContacts=[];game.launchExplosive('launcher');game.keys.add('Space');game.keys.add('KeyW');}
  for(let i=0;i<12;i++){advance(observed,i/30);advance(normal,i/30);}
  expect(observed.camera.position).toEqual(normal.camera.position);expect(observed.velocity).toEqual(normal.velocity);
  expect(observed.projectiles.map((p:any)=>p.source)).toEqual(normal.projectiles.map((p:any)=>p.source));
  const capture=observed.readSourceCallbackCapture(),first=capture.records[0];
  expect(first.beforePhysics.projectiles[0].state.remainingCallbacks).toBe(60);
  expect(first.afterPhysics.projectiles[0].state.remainingCallbacks).toBe(60);
  expect(first.afterControls.state.projectiles[0].state.remainingCallbacks).toBe(60);
  expect(first.afterActors.state.projectiles[0].state.remainingCallbacks).toBe(59);
  expect(first.afterPhysics.player.supported).toBe(true);expect(first.afterControls.result.jumped).toBe(true);
  expect(first.beforePhysics.projectiles[0].state.angular.referenceConvex.vertices.length).toBeGreaterThan(0);
  expect(first.contacts.length).toBeGreaterThan(0);expect(first.actorStage).toBe('captured');
  first.beforePhysics.player.position.x=123;first.contacts[0].normal.y=-999;
  const again=observed.readSourceCallbackCapture();expect(again.records[0].beforePhysics.player.position.x).not.toBe(123);
  expect(again.records[0].contacts[0].normal.y).not.toBe(-999);
 });
 it('bounds states and diagnostics with explicit independent truncation counts',()=>{
  e2e();const game=client();game.enableSourceCallbackCapture();game.sourceCallbackCapture.capacity=2;game.sourceCallbackCapture.contactCapacity=1;
  for(let i=0;i<4;i++)advance(game,i/30);
  const capture=game.readSourceCallbackCapture();expect(capture.records).toHaveLength(2);expect(capture.droppedCallbacks).toBe(2);
  expect(capture.records.reduce((n:number,r:any)=>n+r.contacts.length,0)).toBe(1);
  expect(capture.droppedContacts).toBeGreaterThan(0);expect(capture.records.reduce((n:number,r:any)=>n+r.droppedContacts,0)).toBe(capture.droppedContacts);
 });
 it('marks online authority unavailable while retaining client queue epochs',()=>{
  e2e();const game=client();game.mode='online';game.needsAuthoritativeSpawn=true;game.networkProjectiles=new Map();
  game.pendingOriginalReconciliation={serverTime:17,player:{id:'local'}};game.sourceRemoteViewEpoch=10;game.enableSourceCallbackCapture();advance(game,0);
  const capture=game.readSourceCallbackCapture(),record=capture.records[0];
  expect(record.incomingBeforeQueue.pending.serverTime).toBe(17);expect(record.beforePhysics.pendingReconciliation).toBeNull();expect(record.beforePhysics.sourceViewEpoch).toBe(10);
  expect(record.beforePhysics.physicsProjectilesIncluded).toBe(false);expect(record.actorStage).toBe('unavailable-online-authority');
  expect(capture.unavailable).toContain('Authority world state and contacts: this captures client prediction only');
 });
});
