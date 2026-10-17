import * as THREE from 'three';
import type { LegacyMapId } from '../shared/legacyMaps';

/** Reference-inspired daylight: pale cloud bands over a readable tree-line. */
export function createLegacyAtmosphere(scene: THREE.Scene, map: LegacyMapId) {
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      zenith: { value: new THREE.Color(0x8196aa) },
      horizon: { value: new THREE.Color(0xd6dad9) },
      cloud: { value: new THREE.Color(0xf0efdf) },
      cloudStrength: { value: .82 },
    },
    vertexShader: `varying vec3 direction; void main(){direction=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
    fragmentShader: `
      varying vec3 direction;
      uniform vec3 zenith,horizon,cloud;
      uniform float cloudStrength;
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
      void main(){
        vec3 d=normalize(direction); float h=max(0.0,d.y);
        vec3 base=mix(horizon,zenith,smoothstep(0.0,0.75,h));
        vec2 p=d.xz/max(0.18,d.y+0.23)*2.7;
        float n=noise(p)*0.55+noise(p*2.1)*0.27+noise(p*4.3)*0.18;
        float band=1.0-smoothstep(0.05,0.48,abs(h-0.18));
        base=mix(base,cloud,smoothstep(0.38,0.70,n)*band*cloudStrength);
        gl_FragColor=vec4(base,1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(240,32,16),material);
  sky.name='legacy-daylight-sky'; sky.frustumCulled=false; sky.renderOrder=-1000;
  scene.add(sky);
  scene.background=new THREE.Color(0xd6dad9);
  const setMap=(id:LegacyMapId)=>{
    // Sharp Woodland frames show a restrained gray-blue sky rather than bright cloud bands.
    material.uniforms.zenith.value.setHex(id==='woodlands'?0x8e9fab:0x8196aa);
    material.uniforms.horizon.value.setHex(id==='woodlands'?0xaab7bd:0xd6dad9);
    material.uniforms.cloud.value.setHex(id==='woodlands'?0xb7c1c6:0xf0efdf);
    material.uniforms.cloudStrength.value=id==='woodlands'?.14:.82;
    scene.background=new THREE.Color(id==='woodlands'?0xaab7bd:0xd6dad9);
    scene.fog=new THREE.Fog(0xc4cdd0,id==='woodlands'?100:105,235);
  };
  setMap(map);
  return {
    sky, setMap,
    update(_time:number,camera:THREE.Camera){sky.position.copy(camera.position);},
    dispose(){sky.removeFromParent();sky.geometry.dispose();material.dispose();},
  };
}
