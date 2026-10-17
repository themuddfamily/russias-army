import * as THREE from 'three';
import {describe,expect,it} from 'vitest';
import {OriginalWeaponPresentation,ORIGINAL_WEAPON_LOAD_POSITION,ORIGINAL_WEAPON_POSES,ORIGINAL_WEAPON_ROTATION,ORIGINAL_WEAPON_UNIT_SCALE,originalWeaponVerticalFov} from './originalWeaponPresentation';
import type {WeaponId} from './weapons';

describe('recovered whole-gun presentation',()=>{
  it('uses source ZYX rotation mapping raw xyz to camera yzx',()=>{
    const vector=new THREE.Vector3(2,3,5).applyEuler(ORIGINAL_WEAPON_ROTATION);
    expect(vector.x).toBeCloseTo(3);expect(vector.y).toBeCloseTo(5);expect(vector.z).toBeCloseTo(2);
  });
  it('uses original load/recoil assignments and exact nominal frame recovery for all six guns',()=>{
    for(const weapon of Object.keys(ORIGINAL_WEAPON_POSES) as WeaponId[]){
      const state=new OriginalWeaponPresentation(weapon);expect(state.sourcePosition.toArray()).toEqual([...ORIGINAL_WEAPON_LOAD_POSITION]);
      state.fire();expect(state.sourcePosition.toArray()).toEqual([...ORIGINAL_WEAPON_POSES[weapon].recoil]);
      state.update(1/30,0);const {rest,recoil}=ORIGINAL_WEAPON_POSES[weapon];
      for(let axis=0;axis<3;axis++)expect(state.sourcePosition.getComponent(axis)).toBeCloseTo(recoil[axis]+(rest[axis]-recoil[axis])*.1);
      state.reload();expect(state.sourcePosition.toArray()).toEqual([...ORIGINAL_WEAPON_LOAD_POSITION]);
    }
  });
  it('recovers the full state vector consistently across frame rates without a spline cutoff',()=>{
    const fast=new OriginalWeaponPresentation('rifle'),slow=new OriginalWeaponPresentation('rifle');
    fast.fire();slow.fire();for(let i=0;i<60;i++)fast.update(1/60,0);for(let i=0;i<20;i++)slow.update(1/20,0);
    expect(fast.sourcePosition.distanceTo(slow.sourcePosition)).toBeLessThan(1e-12);
    expect(fast.sourcePosition.z).toBeGreaterThan(2);expect(fast.sourcePosition.z).toBeCloseTo(2+5*.9**30);
  });
  it('applies original degree ticker and bob amplitudes after converting movement speed to source units',()=>{
    const state=new OriginalWeaponPresentation('launcher');const result=state.update(1/30,100*ORIGINAL_WEAPON_UNIT_SCALE);
    const sine=Math.sin(6*Math.PI/180);expect(state.ticker).toBe(6);
    expect(result.x/ORIGINAL_WEAPON_UNIT_SCALE).toBeCloseTo(state.sourcePosition.x-sine*.3);
    expect(result.y/ORIGINAL_WEAPON_UNIT_SCALE).toBeCloseTo(state.sourcePosition.y-Math.abs(sine*.2));
    expect(result.z/ORIGINAL_WEAPON_UNIT_SCALE).toBeCloseTo(state.sourcePosition.z);
  });
  it('preserves explicit projection-axis alternatives',()=>{
    expect(originalWeaponVerticalFov(16/9)).toBe(50);
    const horizontal=originalWeaponVerticalFov(16/9,'horizontal');expect(horizontal).toBeLessThan(50);
    expect(2*Math.atan(Math.tan(THREE.MathUtils.degToRad(horizontal)/2)*16/9)).toBeCloseTo(THREE.MathUtils.degToRad(50));
  });
});
