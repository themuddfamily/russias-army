import * as THREE from 'three';
import {readFileSync} from 'node:fs';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {Game} from './game';
import {originalDrawDistance} from './originalDrawDistance';
import {createOriginalScene,type OriginalRenderScene} from './originalScene';
import {createOriginalSceneMaterials,type OriginalSceneMaterialData} from './originalSceneMaterials';
import {ORIGINAL_MAP_SCALE} from '../shared/originalMapProfile';

function packagedBounds(map:'barrack'|'woodland'){
 const data=JSON.parse(readFileSync(`public/assets/original-scenes/${map}/scene.json`,'utf8')) as OriginalRenderScene&OriginalSceneMaterialData;
 const textures=Object.fromEntries(Object.keys(data.textures).map(name=>[name,new THREE.Texture()])),materials=createOriginalSceneMaterials(data,textures),render=createOriginalScene(data,ORIGINAL_MAP_SCALE,(shader,node)=>materials.forMesh({shader},node.name));
 render.group.add(materials.createSky());render.group.updateWorldMatrix(true,true);
 const box=new THREE.Box3().setFromObject(render.group),sphere=box.getBoundingSphere(new THREE.Sphere());
 return {box,sphere,dispose(){render.dispose();materials.dispose();for(const texture of Object.values(textures))texture.dispose();}};
}
afterEach(()=>vi.restoreAllMocks());

// Packaged source geometry and the generated source sky run without WebGL.
// Bounds coverage verifies the far-plane policy, not raster/cloud appearance.
describe('source scene draw distance includes its sky from the current eye',()=>{
 it.each(['barrack','woodland'] as const)('%s keeps every packaged scene/sky bounds corner inside the far plane from several eyes',map=>{
  const s=packagedBounds(map);try{
   for(const eye of [new THREE.Vector3(0,1.72,0),new THREE.Vector3(170,55,0),new THREE.Vector3(-170,80,60),new THREE.Vector3(300,2,-250)]){
    const far=originalDrawDistance(s.sphere,eye);expect(Number.isInteger(far)).toBe(true);expect(far).toBeGreaterThanOrEqual(260);
    for(const x of [s.box.min.x,s.box.max.x])for(const y of [s.box.min.y,s.box.max.y])for(const z of [s.box.min.z,s.box.max.z])expect(eye.distanceTo(new THREE.Vector3(x,y,z))).toBeLessThan(far);
    expect(far).toBe(Math.ceil(Math.max(260,eye.distanceTo(s.sphere.center)+s.sphere.radius+1)));
   }
   expect(originalDrawDistance(s.sphere,{x:170,y:55,z:0})).toBeGreaterThan(260);
  }finally{s.dispose();}
 });
 it('retains the minimum and rounds coverage upward with a one-unit margin',()=>{
  expect(originalDrawDistance({center:{x:0,y:0,z:0},radius:2},{x:0,y:0,z:0})).toBe(260);
  expect(originalDrawDistance({center:{x:0,y:0,z:0},radius:5.25},{x:3,y:4,z:0},1)).toBe(12);
  expect(originalDrawDistance({center:{x:0,y:0,z:0},radius:1},{x:0,y:0,z:0},260.1)).toBe(261);
 });
 it('rejects invalid radius/minimum, nonfinite coordinates and overflow rather than installing a corrupt projection',()=>{
  const sphere={center:{x:0,y:0,z:0},radius:1},eye={x:0,y:0,z:0};
  for(const radius of [0,-1,NaN,Infinity])expect(()=>originalDrawDistance({...sphere,radius},eye)).toThrow();
  for(const minimum of [0,-1,NaN,Infinity])expect(()=>originalDrawDistance(sphere,eye,minimum)).toThrow();
  expect(()=>originalDrawDistance({center:{x:NaN,y:0,z:0},radius:1},eye)).toThrow();expect(()=>originalDrawDistance(sphere,{x:0,y:Infinity,z:0})).toThrow();
  expect(()=>originalDrawDistance({center:{x:1e308,y:0,z:0},radius:1e308},{x:-1e308,y:0,z:0})).toThrow();
 });
 it('actual Game refresh follows moving eyes and replacement map bounds without changing near or repeating the same projection',()=>{
  const camera=new THREE.PerspectiveCamera(50,1,.07,260),game=Object.assign(Object.create(Game.prototype),{archivalWinter:false,camera,originalDrawBounds:new THREE.Sphere(new THREE.Vector3(),200)}) as any,projection=vi.spyOn(camera,'updateProjectionMatrix');
  camera.position.set(170,55,0);game.updateOriginalDrawDistance();const first=camera.far;expect(first).toBe(originalDrawDistance(game.originalDrawBounds,camera.position));expect(first).toBeGreaterThan(260);expect(projection).toHaveBeenCalledOnce();expect(camera.near).toBe(.07);
  game.updateOriginalDrawDistance();expect(projection).toHaveBeenCalledOnce();camera.position.set(400,55,0);game.updateOriginalDrawDistance();expect(camera.far).toBeGreaterThan(first);expect(projection).toHaveBeenCalledTimes(2);
  game.originalDrawBounds=new THREE.Sphere(new THREE.Vector3(400,55,0),1);game.updateOriginalDrawDistance();expect(camera.far).toBe(260);expect(projection).toHaveBeenCalledTimes(3);expect(camera.near).toBe(.07);
 });
 it('Winter and missing source bounds preserve their existing camera projection',()=>{
  const camera=new THREE.PerspectiveCamera(50,1,.07,260),game=Object.assign(Object.create(Game.prototype),{archivalWinter:true,camera,originalDrawBounds:new THREE.Sphere(new THREE.Vector3(),1000)}) as any,projection=vi.spyOn(camera,'updateProjectionMatrix');
  game.updateOriginalDrawDistance();expect(camera.far).toBe(260);game.archivalWinter=false;game.originalDrawBounds=undefined;game.updateOriginalDrawDistance();expect(camera.far).toBe(260);expect(camera.near).toBe(.07);expect(projection).not.toHaveBeenCalled();
 });
});
