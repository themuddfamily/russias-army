import {cloneOriginalAngularBody,originalAngularConvex,originalRotateVector} from '../shared/originalAngularBody';
import {createOriginalProjectile,stepOriginalProjectilePhysicsSubstep,ORIGINAL_PROJECTILE_RADIUS} from '../shared/originalExplosives';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {Game} from './game';
import {WeaponState,WEAPONS} from './weapons';
import {createOriginalWeaponGeometry,type OriginalMeshData} from './originalWeapons';
import {ORIGINAL_RPG_SOURCE_POINTS,originalRpgBasisFromSourceRotation,originalRpgSupport} from '../shared/originalRpgShape';
import {ORIGINAL_MAP_SCALE as S} from '../shared/originalMapProfile';
import {originalProjectileDirection} from '../shared/originalProjectileOrientation';
const data=JSON.parse(readFileSync(new URL('../public/assets/original-weapons/geometry.json',import.meta.url),'utf8')) as {meshes:OriginalMeshData[]};
const rocket=data.meshes.find(mesh=>mesh.resource==='rpgrocket')!;
function client(map:'barrack'|'woodlands'='woodlands'):any {
 const g=Object.create(Game.prototype),camera=new THREE.PerspectiveCamera(),resource=new THREE.Mesh(createOriginalWeaponGeometry(rocket),new THREE.MeshBasicMaterial());camera.position.set(2,20,4);
 Object.assign(g,{camera,scene:new THREE.Scene(),originalWeapons:{resources:new Map([['rpgrocket',resource]]),setLoaded:vi.fn()},archivalWinter:false,mapId:map,mode:'online',phase:'playing',playerAlive:true,
  pitch:0,yaw:0,elapsed:1,keys:new Set(),controlsPreset:'legacy',aiming:false,arrowMovement:false,projectiles:[],originalBlasts:[],networkProjectiles:new Map(),pendingNetworkProjectileShots:new Map(),handledNetworkExplosions:new Set(),
  networkEffectCounts:{predictions:0,adoptions:0,projectileSpawns:0,explosions:0,damageEvents:0,eliminations:0},network:{clientId:'local',connected:true,shoot:vi.fn(()=>'shot')},
  sweepOriginalProjectile:vi.fn(()=>null),sweepOriginalConvex:vi.fn(()=>null),originalCombatEffectPresentation:{spawnPuff:vi.fn()},needsAuthoritativeSpawn:false,onlineWeaponReadyAt:0,
  weaponState:new WeaponState(map),shots:0,triggerViewModelFire:vi.fn(),spawnMuzzleParticles:vi.fn(),spawnCasing:vi.fn(),playOriginalCombatSound:vi.fn(),muzzleLight:{intensity:0},worldMuzzleLight:{intensity:0},audio:{play:vi.fn()},updateHud:vi.fn(),setMessage:vi.fn()});
 g.weaponState.select('rpg');g.weaponState.applyOriginalCounter({waitgun:0,poldwaitgun:0,ready:true},1);return g;
}
function aim(g:any,pitch=113,yaw=-2377){g.pitch=pitch*Math.PI/180;g.yaw=yaw*Math.PI/180;g.camera.rotation.set(g.pitch,g.yaw,0,'YXZ');return {x:g.pitch*180/Math.PI,y:0,z:g.yaw*180/Math.PI};}
function verifyRenderedVertices(mesh:THREE.Mesh,source:any):number {
 mesh.updateWorldMatrix(true,false);const attribute=mesh.geometry.getAttribute('position'),index=new Map(ORIGINAL_RPG_SOURCE_POINTS.map((p,i)=>[`${p.x},${p.y},${p.z}`,i]));let max=0;
 expect(attribute.count).toBe(195);expect(source.convex.vertices).toHaveLength(72);
 for(let i=0;i<195;i++){
  const authored=rocket.positions[i],supportIndex=index.get(authored.join(','))!;expect(supportIndex).not.toBeUndefined();
  const physical=source.convex.vertices[supportIndex],expected=new THREE.Vector3(physical.x+source.position.x,physical.y+source.position.y,physical.z+source.position.z);
  const rendered=new THREE.Vector3().fromBufferAttribute(attribute,i).applyMatrix4(mesh.matrixWorld);max=Math.max(max,rendered.distanceTo(expected));
 }
 expect(max).toBeLessThan(7e-8);
 const pose={pivot:{x:0,y:0,z:0},basis:originalRpgBasisFromSourceRotation(source.sourceRotation)};
 for(const direction of [{x:1,y:0,z:0},{x:0,y:1,z:0},{x:0,y:0,z:1},{x:-1,y:-2,z:3}]){
  const q=source.angular?.orientation??{x:0,y:0,z:0,w:1};
  const support=originalRpgSupport(pose,originalRotateVector({x:-q.x,y:-q.y,z:-q.z,w:q.w},direction)),physical=source.convex.vertices[support.sourceIndex],rotated=originalRotateVector(q,support.point);
  expect(rotated.x).toBeCloseTo(physical.x,12);expect(rotated.y).toBeCloseTo(physical.y,12);expect(rotated.z).toBeCloseTo(physical.z,12);
 }
 return max;
}
afterEach(()=>vi.restoreAllMocks());
describe('actual Game RPG convex launch and restored flight',()=>{
 it.each(['barrack','woodlands'] as const)('%s retains the full overshoot rotation in solo launch and aligns all195 rendered vertices',map=>{
  const g=client(map),rotation=aim(g);g.mode='solo';g.launchExplosive('rpg');const p=g.projectiles[0];expect(p.source.sourceRotation).toEqual(rotation);expect(p.source.remainingCallbacks).toBe(200);expect(p.source.direction.y).toBeCloseTo(originalProjectileDirection(rotation).y,12);
  console.info(`${map} RPG Float32 world vertex maximum error: ${verifyRenderedVertices(p.mesh,p.source)}`);
 });
 it('keeps the zero-angle authored Z offset above the pivot instead of sideways',()=>{
  const g=client();aim(g,0,0);g.launchExplosive('rpg');const p=g.projectiles[0];p.mesh.updateWorldMatrix(true,false);const up=new THREE.Vector3(0,0,1).applyQuaternion(p.mesh.quaternion);expect(up.distanceTo(new THREE.Vector3(0,1,0))).toBeLessThan(1e-12);
  const points=p.source.convex.vertices;expect(Math.min(...points.map((v:any)=>v.y))).toBeCloseTo(4.586082458496094*S,12);expect(verifyRenderedVertices(p.mesh,p.source)).toBeLessThan(7e-8);
 });
 it.each(['barrack','woodlands'] as const)('%s actual fire sends pre-recoil angles and preserves them in prediction after recoil changes the camera',map=>{
  const g=client(map),rotation=aim(g);vi.spyOn(Math,'random').mockReturnValue(.5);g.tryFire();expect(g.network.shoot).toHaveBeenCalledOnce();expect(g.network.shoot.mock.calls[0][0].sourceRotation).toEqual(rotation);
  expect(g.pitch).toBeCloseTo(rotation.x*Math.PI/180+Math.PI/180,12);const visual=g.networkProjectiles.get('pending:shot');expect(visual.source.sourceRotation).toEqual(rotation);expect(g.pendingSourceShot).toBe('shot');expect(verifyRenderedVertices(visual.mesh,visual.source)).toBeLessThan(7e-8);
 });
 it('adopts authority state without replacing the overshoot basis or resetting the remaining actor callbacks',()=>{
  const g=client(),rotation=aim(g);expect(g.fireNetworkExplosive('rpg',WEAPONS.rpg)).toBe(true);const visual=g.networkProjectiles.get('pending:shot');visual.predictedSeconds=3/30;g.renderNetworkProjectilePrediction(visual);expect(visual.source.remainingCallbacks).toBe(200);
  const position={x:7,y:21,z:8},velocity={x:1,y:2,z:3},snapshot={projectileId:'authority',shotId:'shot',attackerId:'local',weapon:'rpg',position,velocity,direction:{...visual.source.direction},sourceRotation:{...rotation},remainingCallbacks:197,expiresAt:10000};
  g.reconcileNetworkProjectile(snapshot,1000);expect(g.networkProjectiles.get('authority')).toBe(visual);expect(g.networkEffectCounts.adoptions).toBe(1);expect(g.pendingNetworkProjectileShots.size).toBe(0);expect(visual.source.sourceRotation).toEqual(rotation);expect(visual.source.position).toEqual(position);expect(visual.source.remainingCallbacks).toBe(197);expect(visual.puffRemainingCallbacks).toBe(197);expect(visual.predictedSeconds).toBe(0);expect(verifyRenderedVertices(visual.mesh,visual.source)).toBeLessThan(7e-8);
  g.reconcileNetworkProjectile({...snapshot,position:{x:8,y:21,z:9},remainingCallbacks:195},1100);expect(visual.source.remainingCallbacks).toBe(195);expect(visual.puffRemainingCallbacks).toBe(195);expect(visual.source.sourceRotation).toEqual(rotation);expect(verifyRenderedVertices(visual.mesh,visual.source)).toBeLessThan(7e-8);
 });
});

it('restores late-join vertical flight yaw and the authority callback phase without a local launch',()=>{
 const g=client(),sourceRotation={x:90,y:0,z:-2377},direction=originalProjectileDirection(sourceRotation),position={x:7,y:21,z:8};
 g.reconcileNetworkProjectile({projectileId:'late',shotId:'other-shot',attackerId:'remote',weapon:'rpg',position,velocity:{x:0,y:800*S,z:0},direction,sourceRotation,remainingCallbacks:148,expiresAt:10000},1000);
 const visual=g.networkProjectiles.get('late');expect(g.networkEffectCounts.predictions).toBe(0);expect(g.networkEffectCounts.adoptions).toBe(0);expect(visual.source.remainingCallbacks).toBe(148);expect(visual.source.sourceRotation).toEqual(sourceRotation);expect(visual.puffRemainingCallbacks).toBe(148);expect(verifyRenderedVertices(visual.mesh,visual.source)).toBeLessThan(7e-8);
 const basis=originalRpgBasisFromSourceRotation(sourceRotation);expect(new THREE.Vector3(0,1,0).applyQuaternion(visual.mesh.quaternion).distanceTo(new THREE.Vector3().copy(basis.y))).toBeLessThan(1e-12);
});


it.each(['barrack','woodlands'] as const)('%s restores authority angular RPG pose into every rendered vertex and isolates repeated prediction from authority state',map=>{
 const g=client(map),rotation=aim(g),direction=originalProjectileDirection(rotation),position={x:7,y:21,z:8};
 const orientation={x:0,y:Math.sin(.35),z:0,w:Math.cos(.35)},angularVelocity={x:24,y:-18,z:11};
 const packet={projectileId:'angular',shotId:'remote',attackerId:'remote',weapon:'rpg',position,velocity:{x:2,y:3,z:4},direction,sourceRotation:rotation,orientation,angularVelocity,remainingCallbacks:148,expiresAt:10000};
 g.reconcileNetworkProjectile(packet,1000);const visual=g.networkProjectiles.get('angular');
 expect(visual.source.sourceRotation).toEqual(rotation);expect(visual.source.angular.orientation).toEqual(orientation);
 expect(visual.source.angular.angularVelocity).toEqual(angularVelocity);expect(verifyRenderedVertices(visual.mesh,visual.source)).toBeLessThan(7e-8);
 const authoritative=structuredClone(visual.source),launch=structuredClone(rotation);
 const expected=createOriginalProjectile('rpg',position,direction,'remote',rotation);
 expected.position={...position};expected.velocity={...packet.velocity};expected.remainingCallbacks=148;
 expected.angular=cloneOriginalAngularBody(visual.source.angular);expected.convex=originalAngularConvex(expected.angular);
 for(let i=0;i<10;i++)stepOriginalProjectilePhysicsSubstep(expected,{radius:ORIGINAL_PROJECTILE_RADIUS.rpg,sweep:()=>null,sweepConvex:()=>null});
 visual.predictedSeconds=1/30;g.renderNetworkProjectilePrediction(visual);
 expect(visual.source).toEqual(authoritative);expect(visual.source.sourceRotation).toEqual(launch);
 expect(verifyRenderedVertices(visual.mesh,expected)).toBeLessThan(7e-8);
 const rendered=visual.mesh.quaternion.clone(),pivot=visual.mesh.position.clone();g.renderNetworkProjectilePrediction(visual);
 expect(visual.mesh.quaternion.equals(rendered)).toBe(true);expect(visual.mesh.position.equals(pivot)).toBe(true);
 packet.orientation.y=9;packet.angularVelocity.x=999;expect(visual.source).toEqual(authoritative);
});
