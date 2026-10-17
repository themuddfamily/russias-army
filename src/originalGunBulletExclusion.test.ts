import * as THREE from 'three';
import {readFileSync} from 'node:fs';
import {describe,expect,it,vi} from 'vitest';
import {Game} from './game';
import {OriginalSoldier,createOriginalSoldierResources,type OriginalSoldierAssets} from './originalSoldier';
import {ORIGINAL_WEAPON_TEXTURES,type OriginalWeaponGeometryData} from './originalWeapons';
import {WEAPONS,WeaponState} from './weapons';

const read=(path:string)=>JSON.parse(readFileSync(new URL('../public/assets/'+path,import.meta.url),'utf8'));
const soldierGeometry=read('original-soldier/geometry.json') as OriginalSoldierAssets['geometry'];
const rigMotion=read('original-soldier/rig-motion.json') as OriginalSoldierAssets['rigMotion'];
const weaponGeometry=read('original-weapons/geometry.json') as OriginalWeaponGeometryData;

function triangle(mesh:THREE.Mesh,world:boolean){
 const indices=mesh.geometry.index!;
 for(let face=0;face<indices.count;face+=3){
  const vertices=[0,1,2].map(corner=>mesh.getVertexPosition(indices.getX(face+corner),new THREE.Vector3()));
  if(world)for(const vertex of vertices)vertex.applyMatrix4(mesh.matrixWorld);
  const [a,b,c]=vertices,normal=b.clone().sub(a).cross(c.clone().sub(a));
  if(normal.lengthSq()>1e-14)return {center:a.clone().add(b).add(c).multiplyScalar(1/3),normal:normal.normalize()};
 }
 throw Error('Imported source model has no nondegenerate triangle');
}

// Real imported GI skin and gun triangles, actual Game target collection and
// actual Raycaster. Registration/transport/audio/FX are seams, not a live Room.
// Prescribed WORLD placement isolates query membership from bone scheduling,
// native transforms, map traversal and renderer acceptance.
function fixture(map:'barrack'|'woodlands',placement:'held'|'dropped'){
 const gi=new THREE.Texture(),textures=new Map(ORIGINAL_WEAPON_TEXTURES.map(name=>[name,new THREE.Texture()]));
 const resources=createOriginalSoldierResources({geometry:soldierGeometry,rigMotion,texture:gi},{geometry:weaponGeometry,textures});
 const rig=new OriginalSoldier(resources,{name:'TARGET',weapon:'rifle'}),scene=new THREE.Scene();scene.add(rig.group);
 rig.group.position.set(0,100,0);
 // Public pose refresh updates the attached skin's inverse bind matrix,
 // skeleton and posed bounds after this explicit parent translation.
 rig.setSourceMotionTime(0);
 const skinFace=triangle(rig.mesh,true),direction=skinFace.normal.clone().negate(),origin=skinFace.center.clone().addScaledVector(direction,-8);
 const camera=new THREE.PerspectiveCamera();camera.position.copy(origin);camera.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,-1),direction);
 const game=Object.assign(Object.create(Game.prototype),{mapId:map,archivalWinter:false,mode:'online',phase:'playing',elapsed:1,
  scene,camera,arena:{runtime:{scale:1}},weaponDrops:[],weaponState:new WeaponState(map),keys:new Set(),controlsPreset:'legacy',aiming:false,arrowMovement:false,
  remotePlayers:new Map(),sourceTimeoutCorpses:new Set(),enemies:[],raycaster:new THREE.Raycaster(),flushOriginalReconciliation:vi.fn(),raycastWorld:vi.fn(()=>null),
  network:{shoot:vi.fn(()=>'gun-exclusion-shot'),hit:vi.fn()},playOriginalCombatSound:vi.fn(),spawnTracer:vi.fn(),
  originalCombatEffectPresentation:{spawnBlood:vi.fn(),spawnMiss:vi.fn()}}) as any;
 game.weaponState.select('pistol');rig.mesh.userData.remoteId='target';
 game.remotePlayers.set('target',{sourceActorActive:true,hitMeshes:[rig.mesh],group:rig.group});
 const gun=rig.getSourceGun('rifle'),gunFace=triangle(gun,false),rotation=new THREE.Quaternion().setFromUnitVectors(gunFace.normal,direction.clone().negate());
 const position=origin.clone().addScaledVector(direction,2).sub(gunFace.center.clone().applyQuaternion(rotation));
 const gunWorld=new THREE.Matrix4().compose(position,rotation,new THREE.Vector3(1,1,1));
 let drop:THREE.Group|undefined;
 if(placement==='held')rig.setSourceGunWorld(gun,gunWorld);
 else{
  // Actual death-drop transfer retains the same handle. Reset only this
  // fixture's placement basis so its real triangle lies on the declared ray.
  game.dropSourceSoloWeapon('rifle',{x:0,y:100,z:0},rig);drop=game.weaponDrops[0].group;
  drop!.position.set(0,0,0);drop!.quaternion.identity();drop!.scale.set(1,1,1);
  gunWorld.decompose(gun.position,gun.quaternion,gun.scale);
 }
 scene.updateMatrixWorld(true);
 return {game,rig,gun,drop,origin,direction,dispose(){game.clearWeaponDrops();rig.dispose();resources.dispose();gi.dispose();for(const texture of textures.values())texture.dispose();}};
}

describe('source gsmokes gun exclusion survives held/drop presentation ancestry',()=>{
 for(const map of ['barrack','woodlands'] as const)for(const placement of ['held','dropped'] as const)
  it(`${map} ${placement}: a nearer real gun triangle cannot occlude the registered GI skin`,()=>{
   const f=fixture(map,placement);try{
    expect(f.gun.visible).toBe(true);expect(f.gun.parent).toBe(placement==='held'?f.rig.weaponRoot:f.drop);
    if(placement==='dropped')expect(f.game.weaponDrops[0]).toMatchObject({sourceModel:f.gun,sourceRig:f.rig});
    const ray=new THREE.Raycaster(f.origin,f.direction,0,700),gunHits=ray.intersectObject(f.gun,false),skinHits=ray.intersectObject(f.rig.mesh,false);
    expect(gunHits.length).toBeGreaterThan(0);expect(skinHits.length).toBeGreaterThan(0);
    expect(gunHits[0].distance).toBeLessThan(skinHits[0].distance);
    const all=ray.intersectObjects([f.gun,f.rig.mesh],false);expect(all[0].object).toBe(f.gun);
    const targets=f.game.sourceRemoteRayTargets();expect(targets.meshes).toEqual([f.rig.mesh]);expect(targets.meshes).not.toContain(f.gun);
    expect(f.game.hitscan(WEAPONS.pistol)).toBe(true);
    expect(f.game.network.hit).toHaveBeenCalledExactlyOnceWith({shotId:'gun-exclusion-shot',targetId:'target'});
    expect(f.game.originalCombatEffectPresentation.spawnBlood).toHaveBeenCalledOnce();expect(f.game.originalCombatEffectPresentation.spawnMiss).not.toHaveBeenCalled();
    expect(f.game.spawnTracer.mock.calls[0][0].distanceTo(skinHits[0].point)).toBeLessThan(1e-8);
    expect(f.gun.parent).toBe(placement==='held'?f.rig.weaponRoot:f.drop);
   }finally{f.dispose();}
  });
});
