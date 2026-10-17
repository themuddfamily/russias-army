import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {describe,expect,it} from 'vitest';
import {OriginalSoldierCollision,advanceOriginalSoldierPhase,shootOriginalSoldierPhase,type OriginalSoldierCollisionAssets} from './originalSoldierCollision';
import {ORIGINAL_MAP_SCALE} from './originalMapProfile';
import {OriginalSoldier,createOriginalSoldierResources,type OriginalSoldierAssets} from '../src/originalSoldier';
import {ORIGINAL_WEAPON_TEXTURES,type OriginalWeaponGeometryData} from '../src/originalWeapons';

const base=new URL('../public/assets/original-soldier/',import.meta.url);
const assets:OriginalSoldierCollisionAssets={geometry:JSON.parse(readFileSync(new URL('geometry.json',base),'utf8')),rigMotion:JSON.parse(readFileSync(new URL('rig-motion.json',base),'utf8'))};
const create=()=>new OriginalSoldierCollision(assets);

describe('recovered GI CPU triangle collision',()=>{
  it.each([0,333.3,750,1000,2000])('matches every rendered Float32-skinned vertex at phase %s and a transformed group',timeMs=>{
    const texture=new THREE.Texture(),textures=new Map(ORIGINAL_WEAPON_TEXTURES.map(name=>[name,new THREE.Texture()]));
    const resources=createOriginalSoldierResources({...assets,texture} as OriginalSoldierAssets,{geometry:JSON.parse(readFileSync(new URL('../original-weapons/geometry.json',base),'utf8')) as OriginalWeaponGeometryData,textures});
    const rendered=new OriginalSoldier(resources),cpu=create(),feet={x:12.25,y:-3.5,z:7.125},yaw=1.731;
    rendered.group.position.set(feet.x,feet.y,feet.z);rendered.group.rotation.y=yaw;
    if(timeMs===2000){rendered.fire();rendered.animate(0,{alive:true});}
    else rendered.animate(1/30,{alive:true,moveSpeed:timeMs*ORIGINAL_MAP_SCALE*3});
    expect(rendered.debugState().timeMs).toBeCloseTo(timeMs,10);
    const vertices=cpu.evaluatePose(feet,yaw,timeMs),position=rendered.mesh.geometry.getAttribute('position');
    expect(vertices).toHaveLength(742);expect(cpu.triangleCount).toBe(832);
    let maxError=0;
    for(let i=0;i<vertices.length;i++){
      const v=rendered.mesh.applyBoneTransform(i,new THREE.Vector3().fromBufferAttribute(position,i)).applyMatrix4(rendered.mesh.matrixWorld);
      maxError=Math.max(maxError,v.distanceTo(new THREE.Vector3(vertices[i].x,vertices[i].y,vertices[i].z)));
    }
    expect(maxError).toBeLessThan(1e-10);
    rendered.dispose();resources.dispose();texture.dispose();textures.forEach(item=>item.dispose());cpu.dispose();
  });
  it('misses the actual gap between legs while hitting the neighboring leg and upper extremity',()=>{
    const cpu=create(),direction={x:0,y:0,z:-1};
    expect(cpu.intersectRay({x:.05,y:.5,z:3},direction,6)).toBeNull();
    expect(cpu.intersectRay({x:-.05,y:.5,z:3},direction,6)).not.toBeNull();
    expect(cpu.intersectRay({x:.2,y:.5,z:3},direction,6)).not.toBeNull();
    expect(cpu.intersectRay({x:-.25,y:1.5,z:3},direction,6)).not.toBeNull();
    expect(cpu.intersectRay({x:.65,y:1.5,z:3},direction,6)).toBeNull();cpu.dispose();
  });
  it.each([0,1,75])('matches every rendered detached corpse vertex at fade callback%s',callbacks=>{
    const texture=new THREE.Texture(),textures=new Map(ORIGINAL_WEAPON_TEXTURES.map(name=>[name,new THREE.Texture()]));
    const resources=createOriginalSoldierResources({...assets,texture} as OriginalSoldierAssets,{geometry:JSON.parse(readFileSync(new URL('../original-weapons/geometry.json',base),'utf8')) as OriginalWeaponGeometryData,textures});
    const rendered=new OriginalSoldier(resources),cpu=create(),feet={x:12.25,y:-3.5,z:7.125},yaw=1.731;
    try{
      rendered.group.position.set(feet.x,feet.y,feet.z);rendered.group.rotation.y=yaw;rendered.beginSourceFadeaway();
      for(let callback=0;callback<callbacks;callback++)rendered.animate(1/30,{alive:false});
      const state=rendered.debugState(),deathBon=callbacks*8;
      expect(state).toMatchObject({alive:false,removed:false,deathBon,timeMs:callbacks===0?3000:2400+deathBon});
      const vertices=cpu.evaluatePose(feet,yaw,state.timeMs,deathBon),position=rendered.mesh.geometry.getAttribute('position');let maxError=0;
      expect(vertices).toHaveLength(742);
      for(let index=0;index<vertices.length;index++){
        const vertex=rendered.mesh.applyBoneTransform(index,new THREE.Vector3().fromBufferAttribute(position,index)).applyMatrix4(rendered.mesh.matrixWorld);
        maxError=Math.max(maxError,vertex.distanceTo(new THREE.Vector3(vertices[index].x,vertices[index].y,vertices[index].z)));
      }
      expect(maxError).toBeLessThan(1e-10);
      if(callbacks===75){rendered.animate(1/30,{alive:false});expect(rendered.debugState()).toMatchObject({removed:true,deathBon:608});}
    }finally{rendered.dispose();resources.dispose();texture.dispose();textures.forEach(item=>item.dispose());cpu.dispose();}
  });
  it('restores the live root after a corpse pose and rejects corrupt fade counters before changing vertices',()=>{
    const cpu=create(),feet={x:8,y:2,z:-4},yaw=.73,alive=cpu.evaluatePose(feet,yaw,3000).map(vertex=>({...vertex}));
    cpu.evaluatePose(feet,yaw,3000,600);const corpse=cpu.vertices.map(vertex=>({...vertex}));
    for(const deathBon of [-1,NaN,Infinity])expect(()=>cpu.evaluatePose(feet,yaw,3000,deathBon)).toThrow();
    expect(cpu.vertices).toEqual(corpse);expect(cpu.evaluatePose(feet,yaw,3000)).toEqual(alive);cpu.dispose();
  });
  it.each([0,600,2000])('queries a posed, translated and yawed triangle at %s with a nearest finite bound',timeMs=>{
    const cpu=create(),vertices=cpu.evaluatePose({x:8,y:2,z:-4},Math.PI*.73,timeMs),faces=assets.geometry.meshes.find(mesh=>mesh.resource==='GI')!.faces;
    // An outward ray aimed at a recovered face must hit that face or a nearer
    // overlapping recovered surface, never an enclosing sphere or capsule.
    const face=faces[100],a=new THREE.Vector3().copy(vertices[face[0]]),b=new THREE.Vector3().copy(vertices[face[1]]),c=new THREE.Vector3().copy(vertices[face[2]]);
    const center=a.clone().add(b).add(c).multiplyScalar(1/3),normal=b.clone().sub(a).cross(c.clone().sub(a)).normalize();
    const origin=center.clone().addScaledVector(normal,2),direction=normal.clone().negate();
    const hit=cpu.intersectRay(origin,direction,5);expect(hit).not.toBeNull();expect(hit!.distance).toBeLessThanOrEqual(2+1e-10);expect(hit!.triangleIndex).toBeGreaterThanOrEqual(0);expect(hit!.triangleIndex).toBeLessThan(832);
    expect(cpu.intersectRay(origin,direction,hit!.distance-1e-6)).toBeNull();
    expect(cpu.intersectRay(origin,direction,hit!.distance+1e-6)?.distance).toBeCloseTo(hit!.distance,10);
    const independentlyIntersected: Array<{distance:number;triangleIndex:number}>=[];
    const ray=new THREE.Ray(origin,direction),point=new THREE.Vector3();
    faces.forEach(([ia,ib,ic],triangleIndex)=>{if(ray.intersectTriangle(new THREE.Vector3().copy(vertices[ia]),new THREE.Vector3().copy(vertices[ib]),new THREE.Vector3().copy(vertices[ic]),true,point))independentlyIntersected.push({distance:point.distanceTo(origin),triangleIndex});});
    independentlyIntersected.sort((left,right)=>left.distance-right.distance);expect(hit!.triangleIndex).toBe(independentlyIntersected[0].triangleIndex);expect(hit!.distance).toBeCloseTo(independentlyIntersected[0].distance,12);cpu.dispose();
  });
  it('rejects invalid and unnormalized queries instead of manufacturing a hit',()=>{
    const cpu=create();expect(()=>cpu.intersectRay({x:NaN,y:0,z:0},{x:0,y:0,z:1},5)).toThrow();expect(()=>cpu.intersectRay({x:0,y:0,z:0},{x:0,y:0,z:2},5)).toThrow();expect(()=>cpu.intersectRay({x:0,y:0,z:0},{x:0,y:0,z:1},Infinity)).toThrow();expect(()=>cpu.evaluatePose({x:0,y:0,z:0},0,NaN)).toThrow();cpu.dispose();
  });
});

describe('source GI bon phase callbacks',()=>{
  it('advances world displacement in source units and wraps once only with a strict boundary',()=>{
    expect(advanceOriginalSoldierPhase(900,10*ORIGINAL_MAP_SCALE)).toBeCloseTo(1000);
    expect(advanceOriginalSoldierPhase(1000,0)).toBe(1000);
    expect(advanceOriginalSoldierPhase(1000,ORIGINAL_MAP_SCALE)).toBeCloseTo(10);
    expect(advanceOriginalSoldierPhase(0,300*ORIGINAL_MAP_SCALE)).toBeCloseTo(2000);
    expect(advanceOriginalSoldierPhase(shootOriginalSoldierPhase(),0)).toBe(1000);
  });
  it('rejects corrupt callback inputs and overflow',()=>{
    expect(()=>advanceOriginalSoldierPhase(NaN,0)).toThrow();expect(()=>advanceOriginalSoldierPhase(0,-1)).toThrow();expect(()=>advanceOriginalSoldierPhase(0,Number.MAX_VALUE)).toThrow();
  });
});
