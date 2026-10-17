import {readFileSync} from 'node:fs';
import type {BufferGeometry} from 'three';
import {createOriginalProjectileRayGeometry,type OriginalProjectileRayMesh} from '../shared/originalProjectileRay';

// Load numeric source data once; no textures, renderer, browser, or native launch.
const data=JSON.parse(readFileSync(new URL('../public/assets/original-weapons/geometry.json',import.meta.url),'utf8')) as {meshes:Array<OriginalProjectileRayMesh&{resource:string;part:number}>};
function load(resource:string):BufferGeometry {
 const parts=data.meshes.filter(mesh=>mesh.resource===resource);
 if(parts.length!==1||parts[0].part!==0)throw Error(`Unexpected original projectile resource: ${resource}`);
 return createOriginalProjectileRayGeometry(parts[0]);
}
export const originalServerProjectileRayGeometry=new Map<'launcher'|'rpg',BufferGeometry>([['launcher',load('rg6grenade')],['rpg',load('rpgrocket')]]);
