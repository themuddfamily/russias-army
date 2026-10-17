import * as THREE from 'three';
import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {applyOriginalSkyTransform,createOriginalSkyGeometry,raycastOriginalSky,type OriginalSkyDescription} from './originalSkyRay';
import {ORIGINAL_MAP_SCALE} from './originalMapProfile';
import {createOriginalSceneMaterials,type OriginalSceneMaterialData} from '../src/originalSceneMaterials';

const sky=(radius=10):OriginalSkyDescription=>({radius,height:20,position:[0,0,10],rotationDegrees:[90,0,0]});
const scene=(radius=10)=>({runtime:{sky:sky(radius)}});
const origin={x:0,y:10,z:0},east={x:1,y:0,z:0};
const vector=(p:{x:number;y:number;z:number})=>new THREE.Vector3(p.x,p.y,p.z);

describe('reconstructed inward sky bullet triangles',()=>{
 it('shares the exact uncapped20 by2 renderer primitive and local source transform',()=>{
  const source=sky(),geometry=createOriginalSkyGeometry(source),object=new THREE.Object3D();
  try{
   expect(geometry.parameters).toMatchObject({radiusTop:10,radiusBottom:10,height:20,radialSegments:20,heightSegments:2,openEnded:true});
   expect(geometry.index!.count/3).toBe(80);applyOriginalSkyTransform(object,source);
   expect(object.position.toArray()).toEqual([0,0,10]);expect(object.rotation.x).toBe(Math.PI/2);
  }finally{geometry.dispose();}
 });

 it('intersects the inward surface, respects finite range and leaves both cylinder ends open',()=>{
  const data=scene(),hit=raycastOriginalSky(data,1,origin,east,20)!;
  expect(hit).toMatchObject({id:'sky',surface:'collider'});expect(hit.distance).toBeCloseTo(10,10);expect(hit.point.x).toBeCloseTo(10,10);expect(hit.normal.x).toBeLessThan(0);
  expect(raycastOriginalSky(data,1,origin,east,9)).toBeNull();
  expect(raycastOriginalSky(data,1,origin,{x:0,y:1,z:0},100)).toBeNull();
  expect(raycastOriginalSky(data,1,origin,{x:0,y:-1,z:0},100)).toBeNull();
 });

 it('rejects the near exterior-facing wall under displayed BackSide culling',()=>{
  const data=scene(),outside={x:20,y:10,z:0},west={x:-1,y:0,z:0};
  expect(raycastOriginalSky(data,1,outside,west,15)).toBeNull();
  expect(raycastOriginalSky(data,1,outside,west,40)?.distance).toBeCloseTo(30,10);
 });

 it('uses polygon faces rather than replacing the primitive with an ideal cylinder',()=>{
  const theta=Math.PI/20,direction={x:Math.sin(theta),y:0,z:Math.cos(theta)},hit=raycastOriginalSky(scene(),1,origin,direction,20)!;
  expect(hit.distance).toBeLessThan(10);expect(hit.distance).toBeCloseTo(10*Math.cos(theta),6);
 });

 it('normalizes direction and replaces cached scale/metadata without exposing cached vectors',()=>{
  const data=scene(),first=raycastOriginalSky(data,1,origin,east,100)!;(first.point as {x:number}).x=999;
  expect(raycastOriginalSky(data,1,origin,{x:2,y:0,z:0},100)?.distance).toBeCloseTo(10,10);
  expect(raycastOriginalSky(data,2,{x:0,y:20,z:0},east,100)?.distance).toBeCloseTo(20,10);
  expect(raycastOriginalSky(data,1,origin,east,100)?.distance).toBeCloseTo(10,10);
  (data.runtime.sky as {radius:number}).radius=15;expect(raycastOriginalSky(data,1,origin,east,100)?.distance).toBeCloseTo(15,10);
 });

 it('keeps missing-runtime fixtures unchanged and rejects invalid actual metadata/queries',()=>{
  for(const data of [undefined,null,{}, {runtime:{}}, {runtime:{sky:null}}])expect(raycastOriginalSky(data,1,origin,east,100)).toBeNull();
  for(const source of [{...sky(),radius:Infinity},{...sky(),height:0},{...sky(),position:[0,0,NaN]},{...sky(),position:new Array<number>(3)},{...sky(),rotationDegrees:[90,0]}])expect(()=>raycastOriginalSky({runtime:{sky:source}},1,origin,east,100)).toThrow();
  expect(()=>raycastOriginalSky(scene(),0,origin,east,100)).toThrow();
  expect(()=>raycastOriginalSky(scene(),Infinity,origin,east,100)).toThrow();
  expect(()=>raycastOriginalSky(scene(Number.MAX_VALUE),1,origin,east,100)).toThrow();
  for(const [o,d,max] of [[origin,{x:0,y:0,z:0},100],[origin,east,-1],[origin,east,Infinity],[{x:NaN,y:10,z:0},east,100]] as const)expect(raycastOriginalSky(scene(),1,o,d,max)).toBeNull();
 });

 for(const edition of ['barrack','woodland'])it(`${edition} matches displayed mesh rays using actual packaged sky metadata and parent basis`,()=>{
  const data=JSON.parse(readFileSync(new URL(`../public/assets/original-scenes/${edition}/scene.json`,import.meta.url),'utf8')) as OriginalSceneMaterialData;
  const textures=Object.fromEntries(Object.keys(data.textures).map(name=>[name,new THREE.Texture()])),materials=createOriginalSceneMaterials(data,textures),mesh=materials.createSky(),group=new THREE.Group();
  group.rotation.x=-Math.PI/2;group.scale.setScalar(ORIGINAL_MAP_SCALE);group.add(mesh);group.updateWorldMatrix(true,true);
  const center=new THREE.Vector3(0,1000*ORIGINAL_MAP_SCALE,0);
  try{
   for(const angle of [0,.13,.57,1.23,2.61,4.23]){
    const direction=new THREE.Vector3(Math.cos(angle),.03,Math.sin(angle)).normalize(),displayed=new THREE.Raycaster(center,direction,0,700).intersectObject(mesh,false)[0];
    expect(displayed).toBeDefined();const result=raycastOriginalSky(data,ORIGINAL_MAP_SCALE,center,direction,700)!;
    expect(result).not.toBeNull();expect(result.distance).toBeCloseTo(displayed.distance,9);expect(vector(result.point).distanceTo(displayed.point)).toBeLessThan(1e-9);
   }
  }finally{materials.dispose();for(const texture of Object.values(textures))texture.dispose();}
 });
});
