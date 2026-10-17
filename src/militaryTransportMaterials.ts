import * as THREE from 'three';

export type MilitaryTransportMaterialQuality = 'low' | 'high';

export interface MilitaryTransportMaterials {
  readonly body: THREE.MeshStandardMaterial;
  readonly runningGear: THREE.MeshStandardMaterial;
}

export const MILITARY_TRANSPORT_BODY_PROGRAM_KEY = 'military-transport-role-pbr-v1';
export const MILITARY_TRANSPORT_GEAR_PROGRAM_KEY = 'military-transport-gear-pbr-v1';

function installRoleAwareBodyShader(material: THREE.MeshStandardMaterial): void {
  material.userData.transportSurfaceRoles = true;
  material.userData.transportWeathering = 'winter-v1';
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute float surfaceRole;
        varying float vTransportSurfaceRole;
        varying vec3 vTransportWorldPosition;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vTransportSurfaceRole = surfaceRole;
        vec4 transportWorldPosition = vec4( transformed, 1.0 );
        #ifdef USE_INSTANCING
          transportWorldPosition = instanceMatrix * transportWorldPosition;
        #endif
        transportWorldPosition = modelMatrix * transportWorldPosition;
        vTransportWorldPosition = transportWorldPosition.xyz;`,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying float vTransportSurfaceRole;
        varying vec3 vTransportWorldPosition;`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>

        // The authored shell stores one constant role per disconnected part.
        // Smooth masks keep the shader robust across packed/interpolated data.
        float transportPaint = 1.0 - smoothstep( 0.18, 0.32, abs( vTransportSurfaceRole - 0.0 ) );
        float transportCanvas = 1.0 - smoothstep( 0.18, 0.32, abs( vTransportSurfaceRole - 1.0 ) );
        float transportGlass = 1.0 - smoothstep( 0.18, 0.32, abs( vTransportSurfaceRole - 2.0 ) );
        float transportMetal = 1.0 - smoothstep( 0.18, 0.32, abs( vTransportSurfaceRole - 3.0 ) );
        float transportSnow = 1.0 - smoothstep( 0.18, 0.32, abs( vTransportSurfaceRole - 4.0 ) );
        float transportLampWarm = 1.0 - smoothstep( 0.18, 0.32, abs( vTransportSurfaceRole - 5.0 ) );
        float transportLampRed = 1.0 - smoothstep( 0.18, 0.32, abs( vTransportSurfaceRole - 6.0 ) );

        vec3 transportCell = floor( vTransportWorldPosition * vec3( 1.7, 3.1, 1.3 ) );
        float transportNoise = fract( sin( dot( transportCell, vec3( 12.9898, 78.233, 39.425 ) ) ) * 43758.5453 );
        float transportBroad = sin( vTransportWorldPosition.x * 1.37 + vTransportWorldPosition.z * 0.83 ) * 0.5 + 0.5;
        float transportPaintBreakup = mix( 0.78, 1.05, transportNoise * 0.62 + transportBroad * 0.38 );
        diffuseColor.rgb *= mix( vec3( 1.0 ), vec3( transportPaintBreakup, transportPaintBreakup * 1.015, transportPaintBreakup * 0.96 ), transportPaint );

        // Canvas gets broad fabric lanes and folds without another texture.
        float transportWeave = sin( vTransportWorldPosition.z * 25.0 + vTransportWorldPosition.y * 7.0 ) * 0.5 + 0.5;
        float transportFold = smoothstep( 0.70, 0.98, transportWeave ) * 0.10;
        diffuseColor.rgb *= 1.0 - transportCanvas * transportFold;

        // Road spray is strongest around the chassis and fades irregularly.
        float transportMudHeight = 1.0 - smoothstep( 0.30, 1.42, vTransportWorldPosition.y );
        float transportMud = transportMudHeight * smoothstep( 0.18, 0.82, transportNoise )
          * clamp( transportPaint + transportCanvas + transportMetal, 0.0, 1.0 );
        diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.105, 0.095, 0.073 ), transportMud * 0.48 );

        // A thin wind-driven dusting supplements the modeled snow caps only on
        // upward-facing painted/canvas surfaces.
        vec3 transportUpView = normalize( mat3( viewMatrix ) * vec3( 0.0, 1.0, 0.0 ) );
        float transportUpFacing = smoothstep( 0.64, 0.94, dot( normal, transportUpView ) );
        float transportFrost = transportUpFacing * ( 0.10 + transportNoise * 0.10 )
          * clamp( transportPaint + transportCanvas, 0.0, 1.0 );
        diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.76, 0.82, 0.82 ), transportFrost );

        roughnessFactor = mix( roughnessFactor, 0.76, transportPaint );
        roughnessFactor = mix( roughnessFactor, 0.94, transportCanvas );
        roughnessFactor = mix( roughnessFactor, 0.17, transportGlass );
        roughnessFactor = mix( roughnessFactor, 0.42, transportMetal );
        roughnessFactor = mix( roughnessFactor, 0.98, transportSnow );
        roughnessFactor = mix( roughnessFactor, 0.28, max( transportLampWarm, transportLampRed ) );
        roughnessFactor = mix( roughnessFactor, 0.96, transportMud );

        metalnessFactor = mix( metalnessFactor, 0.10, transportPaint );
        metalnessFactor = mix( metalnessFactor, 0.0, transportCanvas );
        metalnessFactor = mix( metalnessFactor, 0.04, transportGlass );
        metalnessFactor = mix( metalnessFactor, 0.78, transportMetal );
        metalnessFactor = mix( metalnessFactor, 0.0, transportSnow );
        metalnessFactor = mix( metalnessFactor, 0.02, max( transportLampWarm, transportLampRed ) );`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        float transportLampWarmEmission = 1.0 - smoothstep( 0.18, 0.32, abs( vTransportSurfaceRole - 5.0 ) );
        float transportLampRedEmission = 1.0 - smoothstep( 0.18, 0.32, abs( vTransportSurfaceRole - 6.0 ) );
        totalEmissiveRadiance += vec3( 2.8, 1.15, 0.24 ) * transportLampWarmEmission;
        totalEmissiveRadiance += vec3( 1.35, 0.055, 0.025 ) * transportLampRedEmission;`,
      );
  };
  material.customProgramCacheKey = () => MILITARY_TRANSPORT_BODY_PROGRAM_KEY;
}

function installRunningGearShader(material: THREE.MeshStandardMaterial): void {
  material.userData.transportRunningGear = true;
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <normal_fragment_maps>',
      `#include <normal_fragment_maps>
      float transportGearBrightness = max( diffuseColor.r, max( diffuseColor.g, diffuseColor.b ) );
      float transportHub = smoothstep( 0.42, 0.68, transportGearBrightness );
      roughnessFactor = mix( 0.96, 0.46, transportHub );
      metalnessFactor = mix( 0.03, 0.82, transportHub );`,
    );
  };
  material.customProgramCacheKey = () => MILITARY_TRANSPORT_GEAR_PROGRAM_KEY;
}

export function createMilitaryTransportMaterials(
  quality: MilitaryTransportMaterialQuality,
): MilitaryTransportMaterials {
  const body = new THREE.MeshStandardMaterial({
    name: 'MilitaryTransportBodyMaterial',
    color: 0xffffff,
    emissive: quality === 'low' ? 0x526050 : 0x000000,
    emissiveIntensity: quality === 'low' ? .42 : 1,
    roughness: .74,
    metalness: .20,
    vertexColors: true,
  });
  const runningGear = new THREE.MeshStandardMaterial({
    name: 'MilitaryTransportRunningGearMaterial',
    color: 0xffffff,
    roughness: .82,
    metalness: .22,
    vertexColors: true,
  });
  if (quality === 'high') {
    installRoleAwareBodyShader(body);
    installRunningGearShader(runningGear);
  }
  return Object.freeze({ body, runningGear });
}
