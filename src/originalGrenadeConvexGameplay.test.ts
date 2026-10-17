import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {describe,it,expect,vi} from 'vitest';
import {Game} from './game';
import {createOriginalWeaponGeometry,type OriginalMeshData} from './originalWeapons';
import {ORIGINAL_GRENADE_SOURCE_POINTS} from '../shared/originalGrenadeShape';
const data=JSON.parse(readFileSync(new URL('../public/assets/original-weapons/geometry.json',import.meta.url),'utf8')) as {meshes:OriginalMeshData[]};
const grenade=data.meshes.find(mesh=>mesh.resource==='rg6grenade')!;
function client(mapId:'barrack'|'woodlands',mode:'solo'|'online'):any {
 const g=Object.create(Game.prototype),camera=new THREE.PerspectiveCamera();camera.position.set(2,20,4);camera.rotation.set(-85*Math.PI/180,.7,0,'YXZ');
 Object.assign(g,{camera,pitch:camera.rotation.x,yaw:camera.rotation.y,mapId,mode,archivalWinter:false,phase:'playing',playerAlive:true,elapsed:1,
  scene:new THREE.Scene(),originalWeapons:{resources:new Map([['rg6grenade',new THREE.Mesh(createOriginalWeaponGeometry(grenade),new THREE.MeshBasicMaterial())]])},
  projectiles:[],originalBlasts:[],audio:{play:vi.fn()},playOriginalCombatSound:vi.fn(),
  network:{clientId:'local'},networkProjectiles:new Map(),pendingNetworkProjectileShots:new Map(),handledNetworkProjectileSpawns:new Set(),handledNetworkExplosions:new Set(),networkEffectCounts:{projectileSpawns:0,predictions:0,adoptions:0},
  sweepOriginalConvex:vi.fn(()=>null),sweepOriginalProjectile:vi.fn(()=>{throw Error('A source grenade must not use sphere narrowphase');}),enemies:[],velocity:new THREE.Vector3()});return g;
}
function verify(mesh:THREE.Mesh,source:any,checkLaunchBasis=true){
 mesh.updateWorldMatrix(true,false);const attribute=mesh.geometry.getAttribute('position');expect(attribute.count).toBe(129);expect(source.convex.vertices).toHaveLength(75);
 const indices=new Map(ORIGINAL_GRENADE_SOURCE_POINTS.map((v,i)=>[`${v.x},${v.y},${v.z}`,i]));
 let maxError=0;
 for(let i=0;i<attribute.count;i++){
  const j=indices.get(grenade.positions[i].join(','));expect(j).not.toBeUndefined();
  const v=source.convex.vertices[j!],physical=new THREE.Vector3(v.x+source.position.x,v.y+source.position.y,v.z+source.position.z);
  maxError=Math.max(maxError,new THREE.Vector3().fromBufferAttribute(attribute,i).applyMatrix4(mesh.matrixWorld).distanceTo(physical));
 }
 expect(maxError).toBeLessThan(4e-9);
 // pointAt then world Euler Z adjustment leaves localX horizontal on a downshot.
 if(checkLaunchBasis)expect(Math.abs(new THREE.Vector3(1,0,0).applyQuaternion(mesh.quaternion).y)).toBeLessThan(1e-12);
}
describe('actual Game grenade rendering and recovered collision agree',()=>{
 it('restores a zero-callback authority pose without consulting collision geometry',()=>{
  const g=client('woodlands','online');
  Object.defineProperty(g,'arena',{get:()=>{throw Error('Zero-prefix rendering must not read the arena');}});
  g.reconcileNetworkProjectile({projectileId:'zero',shotId:'remote',attackerId:'remote',weapon:'launcher',position:{x:7,y:21,z:8},velocity:{x:1,y:2,z:3},direction:{x:0,y:-1,z:0},remainingCallbacks:48,expiresAt:10000},1000);
  const visual=g.networkProjectiles.get('zero');
  expect(visual.mesh.position.toArray()).toEqual([7,21,8]);expect(visual.source.remainingCallbacks).toBe(48);
  expect(g.sweepOriginalConvex).not.toHaveBeenCalled();
 });
 for(const map of ['barrack','woodlands'] as const)it(`${map} solo launch preserves all source render/support points and convex sweep`,()=>{
  const g=client(map,'solo');g.launchExplosive('launcher');const p=g.projectiles[0];verify(p.mesh,p.source);
  g.playerAlive=false;g.updateOriginalExplosives();expect(g.sweepOriginalConvex).toHaveBeenCalled();expect(g.sweepOriginalProjectile).not.toHaveBeenCalled();
 });
 for(const map of ['barrack','woodlands'] as const)it(`${map} late network restore preserves launch orientation and callback phase`,()=>{
  const g=client(map,'online'),direction=new THREE.Vector3(0,0,-1).applyQuaternion(g.camera.quaternion),position={x:7,y:21,z:8};
  g.reconcileNetworkProjectile({projectileId:'late',shotId:'remote-shot',attackerId:'remote',weapon:'launcher',position,velocity:{x:1,y:2,z:3},direction:{x:direction.x,y:direction.y,z:direction.z},remainingCallbacks:48,expiresAt:10000},1000);
  const visual=g.networkProjectiles.get('late');verify(visual.mesh,visual.source);expect(visual.source.remainingCallbacks).toBe(48);expect(g.networkEffectCounts.predictions).toBe(0);expect(g.networkEffectCounts.adoptions).toBe(0);
  g.reconcileNetworkProjectile({projectileId:'late',shotId:'remote-shot',attackerId:'remote',weapon:'launcher',position:{x:8,y:21,z:9},velocity:{x:1,y:2,z:3},direction:{x:direction.x,y:direction.y,z:direction.z},remainingCallbacks:45,expiresAt:10000},1100);
  expect(g.networkProjectiles.get('late')).toBe(visual);expect(visual.source.remainingCallbacks).toBe(45);verify(visual.mesh,visual.source);
 });
});

it('adopts a predicted grenade with bounced velocity while retaining launch basis and fuse',()=>{
 const g=client('barrack','online'),direction=new THREE.Vector3(0,0,-1).applyQuaternion(g.camera.quaternion);
 g.predictNetworkProjectile('shot','launcher',g.camera.position,direction);const predicted=g.networkProjectiles.get('pending:shot');verify(predicted.mesh,predicted.source);
 g.reconcileNetworkProjectile({projectileId:'authority',shotId:'shot',attackerId:'local',weapon:'launcher',position:{x:8,y:21,z:9},velocity:{x:1,y:2,z:3},direction:{x:direction.x,y:direction.y,z:direction.z},remainingCallbacks:45,expiresAt:10000},1100);
 const visual=g.networkProjectiles.get('authority');expect(visual).toBe(predicted);expect(g.pendingNetworkProjectileShots.size).toBe(0);expect(g.networkEffectCounts.adoptions).toBe(1);expect(visual.source.remainingCallbacks).toBe(45);expect(visual.source.direction.y).toBeCloseTo(direction.y,12);verify(visual.mesh,visual.source);
});


it('refreshes every standalone grenade render vertex after angular flight callbacks',()=>{
 const g=client('woodlands','solo');g.launchExplosive('launcher');const p=g.projectiles[0],launch=p.mesh.quaternion.clone();
 p.source.angular.angularVelocity={x:0,y:90,z:0};g.playerAlive=false;
 for(let i=0;i<3;i++){g.updateOriginalExplosives();verify(p.mesh,p.source,false);}
 expect(p.mesh.quaternion.angleTo(launch)).toBeGreaterThan(.1);
});
