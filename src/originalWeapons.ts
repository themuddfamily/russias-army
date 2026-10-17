import * as THREE from 'three';
import {OriginalMuzzleModelPool} from './originalMuzzleModelPool';
import type {WeaponId} from './weapons';
import {ORIGINAL_WEAPON_ROTATION,ORIGINAL_WEAPON_UNIT_SCALE} from './originalWeaponPresentation';

export const ORIGINAL_WEAPON_RESOURCES:Record<WeaponId,string>={rifle:'ak47',shotgun:'spas12',launcher:'rg6',pistol:'pistol',sniper:'dragunov',rpg:'rpg'};
export const ORIGINAL_MUZZLE_FLASH_DURATION=1/30;
export const ORIGINAL_WEAPON_TEXTURES=['ak47','spas12','rg6','rpg','pistol','dragunov','mfmachinegun'] as const;
export interface OriginalMeshData {
  resource:string;part:number;positions:number[][];normals:number[][];faces:number[][];tex_coords:number[][][];
}
export interface OriginalWeaponGeometryData {meshes:OriginalMeshData[];nodes:Array<{name:string;resource?:string;matrix:number[]}>}
export interface OriginalWeaponAssets {geometry:OriginalWeaponGeometryData;textures:Map<string,THREE.Texture>}
export interface OriginalWeaponCollection {
  models:Map<WeaponId,THREE.Group>;
  resources:Map<string,THREE.Mesh>;
  rocket:THREE.Mesh;
  readonly muzzleModels:OriginalMuzzleModelPool;
  hasFlashLease(flash:THREE.Mesh):boolean;
  /** Only originals with bullettest flashes return a crossed source mesh. World matrix is the gun's shot-time pose. */
  spawnFlash(weapon:WeaponId,gunWorldMatrix:THREE.Matrix4):THREE.Mesh|undefined;
  /** Return a retired flash without disposing its shared geometry/material. */
  releaseFlash(flash:THREE.Mesh):void;
  /** RPG rocket is rigidly attached while loaded; there is no insertion animation. */
  setLoaded(weapon:WeaponId,loaded:boolean):void;
  dispose():void;
}

function configureTexture(texture:THREE.Texture):void {
  texture.colorSpace=THREE.SRGBColorSpace;texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
  // Converted CLOD UV V increases down the atlas; uploading without flip maps it once.
  texture.flipY=false;texture.magFilter=THREE.LinearFilter;texture.minFilter=THREE.LinearMipmapLinearFilter;
  texture.needsUpdate=true;
}

export async function loadOriginalWeaponAssets(base='/assets/original-weapons'):Promise<OriginalWeaponAssets> {
  const response=await fetch(`${base}/geometry.json`);if(!response.ok)throw new Error(`Original weapon geometry unavailable (${response.status})`);
  const geometry=await response.json() as OriginalWeaponGeometryData;
  const loader=new THREE.TextureLoader();
  const results=await Promise.allSettled(ORIGINAL_WEAPON_TEXTURES.map(async name=>({name,texture:await loader.loadAsync(`${base}/${name}.png`)})));
  const textures=new Map<string,THREE.Texture>();let failure:unknown;let failed=false;
  for(const result of results){if(result.status==='fulfilled'){configureTexture(result.value.texture);textures.set(result.value.name,result.value.texture);}else{failure=result.reason;failed=true;}}
  if(failed){for(const texture of textures.values())texture.dispose();throw failure;}
  return {geometry,textures};
}

/** Preserve decoded source normals and face/vertex indices; do not recalculate or recenter. */
export function createOriginalWeaponGeometry(mesh:OriginalMeshData):THREE.BufferGeometry {
  if(mesh.positions.length!==mesh.normals.length||mesh.tex_coords[0]?.length!==mesh.positions.length)throw new Error(`Invalid source attributes: ${mesh.resource}`);
  const geometry=new THREE.BufferGeometry();geometry.name=`original-${mesh.resource}`;
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(mesh.positions.flat().map(value=>value*ORIGINAL_WEAPON_UNIT_SCALE),3));
  geometry.setAttribute('normal',new THREE.Float32BufferAttribute(mesh.normals.flat(),3));
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(mesh.tex_coords[0].flatMap(([u,v])=>[u+.5,.5-v]),2));
  geometry.setIndex(mesh.faces.flat());geometry.computeBoundingBox();geometry.computeBoundingSphere();
  return geometry;
}

/** Source resources only: no compatibility hands, guessed pivots, or editor light/camera.
 * Standalone collections own textures. With a borrowed muzzle pool, the caller
 * retains supplied texture ownership so other active scene models remain valid. */
export function createOriginalWeapons(assets:OriginalWeaponAssets,options:{muzzlePool?:OriginalMuzzleModelPool}={}):OriginalWeaponCollection {
  const geometries=new Map<string,THREE.BufferGeometry>();const materials=new Map<string,THREE.MeshBasicMaterial>();
  for(const name of ORIGINAL_WEAPON_TEXTURES){
    const texture=assets.textures.get(name);if(!texture)throw new Error(`Missing original texture: ${name}`);configureTexture(texture);
    const flash=name==='mfmachinegun';materials.set(name,new THREE.MeshBasicMaterial({name:`original-runtime-${name}`,map:texture,toneMapped:false,side:flash?THREE.DoubleSide:THREE.FrontSide,transparent:flash,depthWrite:!flash}));
  }
  const resources=new Map<string,THREE.Mesh>();const models=new Map<WeaponId,THREE.Group>();const ownedObjects=new Set<THREE.Object3D>();
  for(const meshData of assets.geometry.meshes){
    const geometry=createOriginalWeaponGeometry(meshData);geometries.set(meshData.resource,geometry);
    const textureName=meshData.resource.startsWith('mf')?'mfmachinegun':meshData.resource==='rg6grenade'?'rg6':meshData.resource==='rpgrocket'?'rpg':meshData.resource;
    const material=materials.get(textureName);if(!material)throw new Error(`Unbound original resource: ${meshData.resource}`);
    const mesh=new THREE.Mesh(geometry,material);mesh.name=`original-${meshData.resource}`;resources.set(meshData.resource,mesh);ownedObjects.add(mesh);
  }
  for(const [weapon,resource] of Object.entries(ORIGINAL_WEAPON_RESOURCES) as [WeaponId,string][]){
    const mesh=resources.get(resource);if(!mesh)throw new Error(`Missing original gun: ${resource}`);
    const model=new THREE.Group();model.name=`original-weapon-${weapon}`;model.rotation.copy(ORIGINAL_WEAPON_ROTATION);model.add(mesh);models.set(weapon,model);ownedObjects.add(model);
  }
  const rocket=resources.get('rpgrocket');if(!rocket)throw new Error('Missing original RPG rocket');models.get('rpg')!.add(rocket);
  // Source setuprockets does not offset this mesh; its local geometry already supplies position.
  const flashResources:Partial<Record<WeaponId,string>>={rifle:'mfak47',shotgun:'mfspas12',pistol:'mfpistol',sniper:'mfdragunov'};
  const borrowedMuzzlePool=options.muzzlePool,ownsMuzzlePool=!borrowedMuzzlePool;
  const muzzleModels=borrowedMuzzlePool??new OriginalMuzzleModelPool(resource=>{
    const source=resources.get(resource);if(!source)throw Error('Original muzzle resource missing');
    const flash=new THREE.Mesh(source.geometry,source.material);
    const weapon=Object.entries(flashResources).find(([,name])=>name===resource)?.[0];flash.name=`original-shot-flash-${weapon}`;return flash;
  });
  const leasedFlashes=new Set<THREE.Mesh>();
  let disposed=false;
  return {models,resources,rocket,muzzleModels,
    hasFlashLease(flash){return !disposed&&!muzzleModels.isDisposed&&leasedFlashes.has(flash);},
    setLoaded(weapon,loaded){if(weapon==='rpg')rocket.visible=loaded;},
    releaseFlash(flash){
      if(disposed)return;
      if(!leasedFlashes.has(flash))throw Error('Foreign local muzzle lease');
      muzzleModels.release(flash);leasedFlashes.delete(flash);
    },
    spawnFlash(weapon,worldMatrix){
      if(disposed||muzzleModels.isDisposed)return undefined;
      const resource=flashResources[weapon];if(!resource)return undefined;
      const source=resources.get(resource);if(!source)return undefined;
      if(worldMatrix.elements.length!==16||!worldMatrix.elements.every(Number.isFinite)||worldMatrix.elements[3]!==0||worldMatrix.elements[7]!==0||worldMatrix.elements[11]!==0||worldMatrix.elements[15]!==1)throw Error('Invalid local muzzle WORLD');
      const position=new THREE.Vector3(),rotation=new THREE.Quaternion(),scale=new THREE.Vector3();worldMatrix.decompose(position,rotation,scale);
      if(![...position.toArray(),...rotation.toArray(),...scale.toArray()].every(Number.isFinite)||scale.x===0||scale.y===0||scale.z===0||rotation.lengthSq()===0)throw Error('Invalid local muzzle WORLD');
      rotation.normalize();
      const flash=muzzleModels.acquire(resource);
      if(!flash.scale.toArray().every(Number.isFinite)){muzzleModels.release(flash);throw Error('Invalid retained muzzle scale');}
      flash.matrixAutoUpdate=false;flash.visible=true;flash.matrix.compose(position,rotation,flash.scale);flash.matrixWorld.copy(flash.matrix);flash.matrixWorldNeedsUpdate=true;
      leasedFlashes.add(flash);return flash;
    },
    dispose(){if(disposed)return;for(const flash of leasedFlashes)muzzleModels.release(flash);leasedFlashes.clear();if(ownsMuzzlePool)muzzleModels.dispose();disposed=true;for(const object of ownedObjects)object.removeFromParent();for(const geometry of geometries.values())geometry.dispose();for(const material of materials.values())material.dispose();if(ownsMuzzlePool)for(const texture of new Set(assets.textures.values()))texture.dispose();},
  };
}
