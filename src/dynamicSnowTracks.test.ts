import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import {
  DynamicSnowTracks,
  isArenaSnowSurface,
  type DynamicSnowTrackCapacities,
} from './dynamicSnowTracks';

const SMALL:DynamicSnowTrackCapacities={footprints:3,puffs:8};

function matrices(mesh:THREE.InstancedMesh):Array<{position:THREE.Vector3;quaternion:THREE.Quaternion;scale:THREE.Vector3}>{
  const matrix=new THREE.Matrix4();
  return Array.from({length:mesh.count},(_,index)=>{
    mesh.getMatrixAt(index,matrix);
    const position=new THREE.Vector3();const quaternion=new THREE.Quaternion();const scale=new THREE.Vector3();
    matrix.decompose(position,quaternion,scale);return {position,quaternion,scale};
  });
}

describe('isArenaSnowSurface',()=>{
  it('accepts exposed snow and rejects both arms of the plus road',()=>{
    expect(isArenaSnowSurface({x:-44,y:0,z:12})).toBe(true);
    expect(isArenaSnowSurface({x:0,y:0,z:40})).toBe(false);
    expect(isArenaSnowSurface({x:40,y:0,z:0})).toBe(false);
    expect(isArenaSnowSurface({x:6.51,y:0,z:73})).toBe(true);
  });

  it('rejects building footings, raised floors and invalid coordinates',()=>{
    for(const point of [
      {x:-21,y:0,z:-18},{x:24,y:0,z:19},{x:27,y:0,z:-24},{x:-26,y:0,z:25},
      {x:-44,y:.2,z:12},{x:-44,y:-.2,z:12},{x:Number.NaN,y:0,z:12},
    ])expect(isArenaSnowSurface(point),JSON.stringify(point)).toBe(false);
  });
});

describe('DynamicSnowTracks',()=>{
  it('owns two idle fixed-capacity batches with strict resource budgets',()=>{
    const parent=new THREE.Group();const tracks=new DynamicSnowTracks(parent);
    expect(parent.children).toEqual([tracks.root]);
    expect(tracks.capacities).toEqual({footprints:256,puffs:128});
    expect(tracks.footprintMesh.count).toBe(0);expect(tracks.footprintMesh.visible).toBe(false);
    expect(tracks.puffPoints.geometry.drawRange.count).toBe(0);expect(tracks.puffPoints.visible).toBe(false);
    expect(tracks.footprintMesh.instanceMatrix.usage).toBe(THREE.DynamicDrawUsage);
    expect(tracks.footprintMesh.material.map).toBeInstanceOf(THREE.DataTexture);
    expect('map' in tracks.puffPoints.material).toBe(false);
    expect(tracks.getStats()).toEqual({
      active:{footprints:0,puffs:0},capacity:{footprints:256,puffs:128},actors:0,
      drawCalls:0,triangles:0,points:0,resources:{geometries:2,materials:2,textures:1},
    });
    tracks.dispose();
  });

  it('alternates planted feet and preserves authored travel orientation',()=>{
    const tracks=new DynamicSnowTracks(new THREE.Group(),{capacities:SMALL,seed:7});
    expect(tracks.emitFootprint({x:-44,y:0,z:12},0,-1)).toBe(true);
    expect(tracks.emitFootprint({x:-44,y:0,z:11.5},0,1)).toBe(true);
    const planted=matrices(tracks.footprintMesh);
    expect(planted).toHaveLength(2);
    expect(planted[0].position.x).toBeCloseTo(-44.105,5);
    expect(planted[1].position.x).toBeCloseTo(-43.895,5);
    expect(planted[0].position.y).toBeCloseTo(.026,6);
    expect(planted[0].scale.x).toBeCloseTo(.18,6);
    expect(planted[0].scale.z).toBeCloseTo(.39,6);
    expect(planted[0].quaternion.angleTo(planted[1].quaternion)).toBeGreaterThan(.06);
    expect(tracks.getStats()).toMatchObject({active:{footprints:2,puffs:8},drawCalls:2,triangles:4,points:8});
    tracks.dispose();
  });

  it('raises footprints and powder to sampled presentation relief without changing budgets',()=>{
    const samples:Array<{x:number;z:number}>=[];
    const tracks=new DynamicSnowTracks(new THREE.Group(),{
      capacities:{footprints:2,puffs:4},seed:7,
      surfaceHeightAt:(x,z)=>{samples.push({x,z});return .22;},
    });
    expect(tracks.emitFootprint({x:-44,y:0,z:12},0,-1)).toBe(true);
    const [footprint]=matrices(tracks.footprintMesh);
    expect(footprint.position.x).toBeCloseTo(-44.105,6);
    expect(footprint.position.z).toBeCloseTo(12,6);
    expect(footprint.position.y).toBeCloseTo(.246,6);
    const puffPositions=tracks.puffPoints.geometry.getAttribute('position') as THREE.BufferAttribute;
    expect(tracks.puffPoints.geometry.drawRange.count).toBe(4);
    for(let index=0;index<4;index++){
      expect(puffPositions.getY(index)).toBeGreaterThanOrEqual(.275);
      expect(puffPositions.getY(index)).toBeLessThan(.31);
    }
    expect(samples[0]).toEqual({x:-44.105,z:12});
    expect(samples).toHaveLength(5);
    expect(tracks.getStats()).toEqual({
      active:{footprints:1,puffs:4},capacity:{footprints:2,puffs:4},actors:0,
      drawCalls:2,triangles:2,points:4,resources:{geometries:2,materials:2,textures:1},
    });
    tracks.dispose();
  });

  it('uses authoritative point height when the relief sampler returns undefined',()=>{
    const baseline=new DynamicSnowTracks(new THREE.Group(),{capacities:{footprints:2,puffs:4},seed:23});
    const fallback=new DynamicSnowTracks(new THREE.Group(),{
      capacities:{footprints:2,puffs:4},seed:23,surfaceHeightAt:()=>undefined,
    });
    const point={x:-44,y:.04,z:12};
    baseline.emitFootprint(point,.6,1);fallback.emitFootprint(point,.6,1);
    expect(baseline.footprintMesh.instanceMatrix.array).toEqual(fallback.footprintMesh.instanceMatrix.array);
    expect(baseline.puffPoints.geometry.getAttribute('position').array)
      .toEqual(fallback.puffPoints.geometry.getAttribute('position').array);
    expect(baseline.puffPoints.geometry.getAttribute('puffData').array)
      .toEqual(fallback.puffPoints.geometry.getAttribute('puffData').array);
    baseline.dispose();fallback.dispose();
  });

  it('samples real displacement, ignores wall-stationary frames and resets teleports',()=>{
    const tracks=new DynamicSnowTracks(new THREE.Group(),{capacities:{footprints:16,puffs:0},footprintSpacing:.5});
    expect(tracks.sampleActor('player',{x:-44,y:0,z:15},Math.PI)).toBe(0);
    expect(tracks.sampleActor('player',{x:-44,y:0,z:14.4},Math.PI)).toBe(1);
    for(let frame=0;frame<20;frame++)expect(tracks.sampleActor('player',{x:-44,y:0,z:14.4},Math.PI)).toBe(0);
    expect(tracks.getStats().active.footprints).toBe(1);
    expect(tracks.sampleActor('player',{x:-44,y:0,z:2},Math.PI)).toBe(0);
    expect(tracks.getStats().active.footprints).toBe(1);
    expect(tracks.sampleActor('player',{x:-44,y:0,z:1.4},Math.PI)).toBe(0); // road mask
    expect(tracks.getStats().active.footprints).toBe(1);
    tracks.resetActor('player');
    expect(tracks.getStats().actors).toBe(0);
    tracks.dispose();
  });

  it('emits evenly spaced deterministic review trails and rejects non-snow marks',()=>{
    const tracks=new DynamicSnowTracks(new THREE.Group(),{capacities:{footprints:12,puffs:0},seed:19});
    expect(tracks.emitTrail({x:-44,y:0,z:16},{x:-44,y:0,z:10},9)).toBe(9);
    expect(tracks.getStats()).toMatchObject({active:{footprints:9,puffs:0},drawCalls:1,triangles:18});
    expect(tracks.emitFootprint({x:0,y:0,z:10},0,-1)).toBe(false);
    expect(tracks.footprintMesh.count).toBe(9);
    tracks.dispose();
  });

  it('overwrites ring slots, expires powder and clears without releasing resources',()=>{
    const tracks=new DynamicSnowTracks(new THREE.Group(),{capacities:{footprints:2,puffs:4},footprintLifetime:.2,seed:3});
    tracks.emitFootprint({x:-45,y:0,z:12},0,-1);
    tracks.emitFootprint({x:-44,y:0,z:12},0,1);
    tracks.emitFootprint({x:-43,y:0,z:12},0,-1);
    expect(tracks.getStats()).toMatchObject({active:{footprints:2,puffs:4}});
    expect(matrices(tracks.footprintMesh).map(({position})=>Math.round(position.x*10)/10).sort((a,b)=>a-b)).toEqual([-43.9,-43.1]);
    tracks.update(.8);
    expect(tracks.getStats()).toMatchObject({active:{footprints:0,puffs:0},drawCalls:0});
    tracks.emitFootprint({x:-44,y:0,z:12},0,-1);tracks.clear();
    expect(tracks.getStats()).toMatchObject({active:{footprints:0,puffs:0},actors:0,resources:{geometries:2,materials:2,textures:1}});
    tracks.dispose();
  });

  it('retains every scene and GPU resource identity across repeated movement',()=>{
    const tracks=new DynamicSnowTracks(new THREE.Group(),{capacities:{footprints:24,puffs:12},seed:31});
    const identities={
      root:tracks.root,footprint:tracks.footprintMesh,puffs:tracks.puffPoints,
      footprintGeometry:tracks.footprintMesh.geometry,puffGeometry:tracks.puffPoints.geometry,
      footprintMaterial:tracks.footprintMesh.material,puffMaterial:tracks.puffPoints.material,
      texture:tracks.footprintMesh.material.map,
    };
    tracks.sampleActor('bot',{x:-40,y:0,z:18},0);
    for(let index=1;index<=1000;index++){
      tracks.sampleActor('bot',{x:-40+(index%2)*.01,y:0,z:18-index*.01},0);
      tracks.update(.001);
    }
    expect(tracks.root).toBe(identities.root);expect(tracks.footprintMesh).toBe(identities.footprint);
    expect(tracks.puffPoints).toBe(identities.puffs);expect(tracks.footprintMesh.geometry).toBe(identities.footprintGeometry);
    expect(tracks.puffPoints.geometry).toBe(identities.puffGeometry);expect(tracks.footprintMesh.material).toBe(identities.footprintMaterial);
    expect(tracks.puffPoints.material).toBe(identities.puffMaterial);expect(tracks.footprintMesh.material.map).toBe(identities.texture);
    expect(tracks.getStats().active.footprints).toBeLessThanOrEqual(24);
    tracks.dispose();
  });

  it('validates public inputs and disposes owned resources once',()=>{
    expect(()=>new DynamicSnowTracks(new THREE.Group(),{capacities:{footprints:-1}})).toThrow(/capacity/i);
    expect(()=>new DynamicSnowTracks(new THREE.Group(),{capacities:{puffs:1.5}})).toThrow(/capacity/i);
    expect(()=>new DynamicSnowTracks(new THREE.Group(),{seed:Number.NaN})).toThrow(/seed/i);
    expect(()=>new DynamicSnowTracks(new THREE.Group(),{surfaceHeightAt:null as never})).toThrow(/sampler.*function/i);
    const invalidHeight=new DynamicSnowTracks(new THREE.Group(),{surfaceHeightAt:()=>Number.NaN});
    expect(()=>invalidHeight.emitFootprint({x:-44,y:0,z:12},0,-1)).toThrow(/sampler.*finite/i);
    invalidHeight.dispose();
    const parent=new THREE.Group();const tracks=new DynamicSnowTracks(parent,{capacities:SMALL});
    expect(()=>tracks.sampleActor('',{x:1,y:0,z:10},0)).toThrow(/actor id/i);
    expect(()=>tracks.sampleActor('x',{x:Number.NaN,y:0,z:10},0)).toThrow(/point.x/i);
    expect(()=>tracks.emitFootprint({x:1,y:0,z:10},Number.NaN,-1)).toThrow(/yaw/i);
    expect(()=>tracks.emitTrail({x:1,y:0,z:10},{x:2,y:0,z:10},0)).toThrow(/count/i);
    expect(()=>tracks.update(-.1)).toThrow(/delta/i);
    const geometryDisposes=[tracks.footprintMesh.geometry,tracks.puffPoints.geometry].map(item=>vi.spyOn(item,'dispose'));
    const materialDisposes=[tracks.footprintMesh.material,tracks.puffPoints.material].map(item=>vi.spyOn(item,'dispose'));
    const textureDispose=vi.spyOn(tracks.footprintMesh.material.map!,'dispose');
    tracks.dispose();tracks.dispose();
    expect(parent.children).not.toContain(tracks.root);
    for(const spy of [...geometryDisposes,...materialDisposes])expect(spy).toHaveBeenCalledTimes(1);
    expect(textureDispose).toHaveBeenCalledTimes(1);
    expect(tracks.getStats().resources).toEqual({geometries:0,materials:0,textures:0});
    expect(()=>tracks.update(.01)).toThrow(/disposed/i);
  });
});
