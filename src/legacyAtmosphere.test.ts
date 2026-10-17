import {describe,expect,it} from 'vitest';
import * as THREE from 'three';
import {createLegacyAtmosphere} from './legacyAtmosphere';

describe('legacy map atmosphere',()=>{
  it('switches to subdued Woodland sky and restores Barrack uniforms on return',()=>{
    const scene=new THREE.Scene(),atmosphere=createLegacyAtmosphere(scene,'barrack');
    const material=atmosphere.sky.material as THREE.ShaderMaterial;
    const barrackCloud=material.uniforms.cloudStrength.value;
    const barrackHorizon=material.uniforms.horizon.value.getHex();
    atmosphere.setMap('woodlands');
    expect(material.uniforms.cloudStrength.value).toBeLessThan(barrackCloud/4);
    expect(material.uniforms.horizon.value.getHex()).not.toBe(barrackHorizon);
    expect((scene.background as THREE.Color).getHex()).toBe(material.uniforms.horizon.value.getHex());
    atmosphere.setMap('barrack');
    expect(material.uniforms.cloudStrength.value).toBe(barrackCloud);
    expect(material.uniforms.horizon.value.getHex()).toBe(barrackHorizon);
    const camera=new THREE.PerspectiveCamera();camera.position.set(4,12,-3);
    atmosphere.update(0,camera);
    expect(atmosphere.sky.position.equals(camera.position)).toBe(true);
    atmosphere.dispose();
    expect(scene.children).not.toContain(atmosphere.sky);
  });
});
