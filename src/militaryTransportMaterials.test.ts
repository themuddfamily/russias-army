import { describe, expect, it } from 'vitest';
import {
  MILITARY_TRANSPORT_BODY_PROGRAM_KEY,
  MILITARY_TRANSPORT_GEAR_PROGRAM_KEY,
  createMilitaryTransportMaterials,
} from './militaryTransportMaterials';

interface TestShader {
  vertexShader: string;
  fragmentShader: string;
  uniforms: Record<string, unknown>;
}

function compileHook(material: ReturnType<typeof createMilitaryTransportMaterials>['body']): TestShader {
  const shader: TestShader = {
    vertexShader: '#include <common>\n#include <begin_vertex>',
    fragmentShader: '#include <common>\n#include <normal_fragment_maps>\n#include <emissivemap_fragment>',
    uniforms: {},
  };
  material.onBeforeCompile(shader as never, {} as never);
  return shader;
}

describe('createMilitaryTransportMaterials', () => {
  it('keeps the fallback tier simple and texture-free', () => {
    const materials = createMilitaryTransportMaterials('low');
    expect(materials.body.map).toBeNull();
    expect(materials.runningGear.map).toBeNull();
    expect(materials.body.userData.transportSurfaceRoles).toBeUndefined();
    expect(materials.runningGear.userData.transportRunningGear).toBeUndefined();
    expect(materials.body.emissive.getHex()).toBe(0x526050);
    expect(materials.body.emissiveIntensity).toBe(.42);
    materials.body.dispose();
    materials.runningGear.dispose();
  });

  it('installs stable role-aware winter PBR without texture resources', () => {
    const materials = createMilitaryTransportMaterials('high');
    expect(materials.body.customProgramCacheKey()).toBe(MILITARY_TRANSPORT_BODY_PROGRAM_KEY);
    expect(materials.runningGear.customProgramCacheKey()).toBe(MILITARY_TRANSPORT_GEAR_PROGRAM_KEY);
    expect(materials.body.userData).toMatchObject({
      transportSurfaceRoles: true,
      transportWeathering: 'winter-v1',
    });
    expect(materials.runningGear.userData.transportRunningGear).toBe(true);
    expect(materials.body.map).toBeNull();
    expect(materials.runningGear.map).toBeNull();

    const bodyShader = compileHook(materials.body);
    expect(bodyShader.vertexShader).toContain('attribute float surfaceRole');
    expect(bodyShader.vertexShader).toContain('instanceMatrix * transportWorldPosition');
    expect(bodyShader.fragmentShader).toContain('transportCanvas');
    expect(bodyShader.fragmentShader).toContain('transportGlass');
    expect(bodyShader.fragmentShader).toContain('transportMud');
    expect(bodyShader.fragmentShader).toContain('transportFrost');
    expect(bodyShader.fragmentShader).toContain('totalEmissiveRadiance +=');

    const gearShader = compileHook(materials.runningGear);
    expect(gearShader.fragmentShader).toContain('transportHub');
    expect(gearShader.fragmentShader).toContain('metalnessFactor');
    materials.body.dispose();
    materials.runningGear.dispose();
  });
});
