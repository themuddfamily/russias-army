import * as THREE from 'three';
import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {Game} from './game';
import {createOriginalSceneMaterials,type OriginalSceneMaterialData} from './originalSceneMaterials';
import {registerOriginalMapRuntime} from '../shared/originalMapRuntime';
import {createOriginalSceneGeometry,type OriginalSceneData} from '../shared/originalSceneGeometry';
import {raycastArena} from '../shared/arenaCollision';

const identity=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
function fixture(map:'barrack'|'woodlands',nearWall=false){
 const data=JSON.parse(readFileSync(new URL(`../public/assets/original-scenes/${map==='barrack'?'barrack':'woodland'}/scene.json`,import.meta.url),'utf8')) as OriginalSceneData&OriginalSceneMaterialData;
 const runtime=registerOriginalMapRuntime(map,data),height=data.runtime.sky.position[2]*runtime.scale;
 // Actual small scene geometry isolates the sky from fixed models without
 // substituting either the scene ray query or the packaged sky description.
 const distance=nearWall?1:-1;
 const geometry=createOriginalSceneGeometry({nodes:[{name:'test-wall',resource:'wall',parent:'World',matrix:identity,visibility:1,shader:'default'}],
  meshes:[{resource:'wall',part:0,positions:[[distance,-3,height-3],[distance,3,height-3],[distance,3,height+3],[distance,-3,height+3]],faces:[[0,1,2],[0,2,3]],normals:[],tex_coords:[]}]},{scale:1,cellSize:1});
 const textures=Object.fromEntries(Object.keys(data.textures).map(name=>[name,new THREE.Texture()]));
 const materials=createOriginalSceneMaterials(data,textures),sky=materials.createSky(),group=new THREE.Group();
 group.rotation.x=-Math.PI/2;group.scale.setScalar(runtime.scale);group.add(sky);group.updateMatrixWorld(true);
 const origin=new THREE.Vector3(0,height,0),direction=new THREE.Vector3(1,0,0),g=Object.create(Game.prototype) as any;
 Object.assign(g,{mapId:map,archivalWinter:false,arena:{runtime:{...runtime,geometry},colliders:[]}});
 return {g,origin,direction,sky,dispose:()=>{group.remove(sky);materials.dispose();for(const texture of Object.values(textures))texture.dispose();}};
}

describe('actual Game packaged sky belongs only to source bullet queries',()=>{
 for(const map of ['barrack','woodlands'] as const){
  it(`${map} returns the actually rendered inward sky for an otherwise empty horizontal bullet ray`,()=>{
   const s=fixture(map);
   try{
    const rendered=new THREE.Raycaster(s.origin,s.direction,0,700).intersectObject(s.sky,false);expect(rendered.length).toBeGreaterThan(0);
    const bullet=s.g.raycastWorld(s.origin,s.direction,700,true);expect(bullet).not.toBeNull();
    expect(bullet.distance).toBeCloseTo(rendered[0].distance,9);expect(bullet.distance).toBeLessThan(700);
    expect(s.g.distanceToWorld(s.origin,s.direction,700,true)).toBeCloseTo(rendered[0].distance,9);
    expect(s.g.raycastWorld(s.origin,s.direction,700)).toBeNull();expect(s.g.distanceToWorld(s.origin,s.direction,700)).toBe(700);
   }finally{s.dispose();}
  });
  it(`${map} retains the nearest physical wall instead of replacing it with the sky`,()=>{
   const s=fixture(map,true);
   try{
    expect(s.g.raycastWorld(s.origin,s.direction,700,true)).toMatchObject({id:'test-wall',distance:1});
    expect(s.g.raycastWorld(s.origin,s.direction,700)).toMatchObject({id:'test-wall',distance:1});
   }finally{s.dispose();}
  });
  it(`${map} leaves vertical uncapped sky rays empty`,()=>{
   const s=fixture(map),up=new THREE.Vector3(0,1,0);
   try{
    expect(new THREE.Raycaster(s.origin,up,0,700).intersectObject(s.sky,false)).toHaveLength(0);
    expect(s.g.raycastWorld(s.origin,up,700,true)).toBeNull();expect(s.g.raycastWorld(s.origin,up,700)).toBeNull();
   }finally{s.dispose();}
  });
  it(`${map} preserves the existing Winter query adapter when sourceBullet is requested`,()=>{
   const s=fixture(map);s.g.archivalWinter=true;
   try{
    const expected=raycastArena(s.origin,s.direction,700,{includeGround:true});
    expect(s.g.raycastWorld(s.origin,s.direction,700,true)).toEqual(expected);
    expect(s.g.raycastWorld(s.origin,s.direction,700)).toEqual(expected);
   }finally{s.dispose();}
  });
 }
});
