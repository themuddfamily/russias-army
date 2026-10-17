import * as THREE from 'three';
import {readFileSync} from 'node:fs';
import {describe,expect,it,vi} from 'vitest';
import {Game} from './game';
import {createOriginalWeaponGeometry,type OriginalWeaponGeometryData} from './originalWeapons';
import {WEAPONS,WeaponState} from './weapons';
import {createOriginalProjectile} from '../shared/originalExplosives';
import {createOriginalSceneGeometry} from '../shared/originalSceneGeometry';

const data=JSON.parse(readFileSync(new URL('../public/assets/original-weapons/geometry.json',import.meta.url),'utf8')) as OriginalWeaponGeometryData;
const identity=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
function fixture(map:'barrack'|'woodlands',weapon:'launcher'|'rpg',mode:'solo'|'online'='online'){
 const resource=weapon==='launcher'?'rg6grenade':'rpgrocket',geometry=createOriginalWeaponGeometry(data.meshes.find(mesh=>mesh.resource===resource)!);
 const material=new THREE.MeshBasicMaterial({side:THREE.FrontSide}),sourceResource=new THREE.Mesh(geometry,material),g=Object.create(Game.prototype) as any;
 const origin=new THREE.Vector3(0,100,0),direction=new THREE.Vector3(1,0,0),camera=new THREE.PerspectiveCamera();camera.position.copy(origin);camera.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,-1),direction);
 const fixed=createOriginalSceneGeometry({nodes:[{name:'behind',parent:'World',resource:'wall',matrix:identity,visibility:1,shader:'default'}],
  meshes:[{resource:'wall',part:0,positions:[[-1,-3,90],[-1,3,90],[-1,3,110],[-1,-3,110]],faces:[[0,1,2],[0,2,3]],normals:[],tex_coords:[]}]},{scale:1});
 Object.assign(g,{mapId:map,archivalWinter:false,mode,phase:'playing',camera,scene:new THREE.Scene(),arena:{runtime:{geometry:fixed,data:{},scale:1},colliders:[]},
  originalWeapons:{resources:new Map([[resource,sourceResource]]),models:new Map()},weaponState:new WeaponState(map),keys:new Set(),controlsPreset:'legacy',aiming:false,arrowMovement:false,elapsed:0,
  remotePlayers:new Map(),sourceTimeoutCorpses:new Set(),enemies:[],raycaster:new THREE.Raycaster(),projectiles:[],networkProjectiles:new Map(),
  network:{shoot:vi.fn(()=>'bullet'),hit:vi.fn()},flushOriginalReconciliation:vi.fn(),spawnTracer:vi.fn(),originalCombatEffectPresentation:{spawnMiss:vi.fn(),spawnBlood:vi.fn()}});
 const mesh=g.createProjectileMesh(weapon) as THREE.Mesh,source=createOriginalProjectile(weapon,origin,direction,'owner');
 // Incline the real rigid model so its surface normal differs from the
 // incoming-ray fallback; the miss must retain this exact displayed face.
 const inclination=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),.31);
 source.angular!.orientation={x:inclination.x,y:inclination.y,z:inclination.z,w:inclination.w};
 g.orientProjectileMesh(mesh,direction,source.sourceRotation,source.angular);
 // Place a front-facing actual triangle on the declared ray at distance2.
 const positions=geometry.getAttribute('position'),indices=geometry.index!;let center:THREE.Vector3|undefined;
 for(let face=0;face<indices.count;face+=3){
  const [a,b,c]=[0,1,2].map(corner=>new THREE.Vector3().fromBufferAttribute(positions,indices.getX(face+corner)).applyQuaternion(mesh.quaternion));
  if(b.clone().sub(a).cross(c.clone().sub(a)).normalize().dot(direction)<-.2){center=a.add(b).add(c).multiplyScalar(1/3);break;}
 }
 if(!center)throw Error('No front-facing source projectile triangle');mesh.position.copy(origin).addScaledVector(direction,2).sub(center);source.position={...mesh.position};g.scene.add(mesh);mesh.updateMatrixWorld(true);
 const entry={mesh,source};if(mode==='online')g.networkProjectiles.set('flight',entry);else g.projectiles.push(entry);
 const remoteGeometry=new THREE.PlaneGeometry(2,2),remoteMaterial=new THREE.MeshBasicMaterial({side:THREE.DoubleSide}),remote=new THREE.Mesh(remoteGeometry,remoteMaterial);
 remote.position.copy(origin).addScaledVector(direction,4);remote.quaternion.copy(camera.quaternion);remote.userData.remoteId='remote';remote.updateMatrixWorld(true);
 g.remotePlayers.set('remote',{sourceActorActive:true,hitMeshes:[remote],group:new THREE.Group()});g.playOriginalCombatSound=vi.fn();g.weaponState.select('pistol');
 return {g,mesh,source,origin,direction,dispose:()=>{mesh.removeFromParent();geometry.dispose();material.dispose();remoteGeometry.dispose();remoteMaterial.dispose();}};
}

describe('actual Game active source projectile triangle bullet population',()=>{
 for(const map of ['barrack','woodlands'] as const)for(const weapon of ['launcher','rpg'] as const){
  it(`${map} ${weapon} blocks a farther remote with the actual rendered triangle and leaves ordinary world rays empty`,()=>{
   const s=fixture(map,weapon);
   try{
    const rendered=new THREE.Raycaster(s.origin,s.direction,0,700).intersectObject(s.mesh,false);expect(rendered.length).toBeGreaterThan(0);
    expect(s.g.raycastWorld(s.origin,s.direction,700)).toBeNull();
    expect(s.g.raycastWorld(s.origin,s.direction,700,true)?.distance).toBeCloseTo(rendered[0].distance,10);
    expect(s.g.hitscan(WEAPONS.pistol)).toBe(true);expect(s.g.network.hit).not.toHaveBeenCalled();expect(s.g.originalCombatEffectPresentation.spawnBlood).not.toHaveBeenCalled();
    expect(s.g.originalCombatEffectPresentation.spawnMiss).toHaveBeenCalledTimes(1);expect(s.g.spawnTracer.mock.calls[0][0].x).toBeCloseTo(rendered[0].point.x,10);
    const expectedNormal=rendered[0].face!.normal.clone().applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(s.mesh.matrixWorld));
    expect(expectedNormal.distanceTo(s.direction.clone().negate())).toBeGreaterThan(1e-5);
    expect(s.g.originalCombatEffectPresentation.spawnMiss.mock.calls[0][1].distanceTo(expectedNormal)).toBeLessThan(1e-10);
    s.g.networkProjectiles.delete('flight');expect(s.g.hitscan(WEAPONS.pistol)).toBe(true);expect(s.g.network.hit).toHaveBeenCalledExactlyOnceWith({shotId:'bullet',targetId:'remote'});
   }finally{s.dispose();}
  });
  it(`${map} ${weapon} includes the actual solo source mesh and ignores retired or authored entries`,()=>{
   const s=fixture(map,weapon,'solo');
   try{
    expect(s.g.raycastWorld(s.origin,s.direction,700,true)).not.toBeNull();expect(s.g.raycastWorld(s.origin,s.direction,700)).toBeNull();
    delete s.g.projectiles[0].source;expect(s.g.raycastWorld(s.origin,s.direction,700,true)).toBeNull();
    s.g.projectiles[0].source=s.source;s.g.projectiles.length=0;expect(s.g.raycastWorld(s.origin,s.direction,700,true)).toBeNull();
   }finally{s.dispose();}
  });
 }
});
