import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { SoldierMaterialLibrary } from './soldierMaterials';
import { SoldierModel } from './soldierModel';

function mesh(soldier: SoldierModel, name: string): THREE.Mesh {
  return soldier.group.getObjectByName(name) as THREE.Mesh;
}
function tint(soldier: SoldierModel, name: string): THREE.Color {
  const colors=mesh(soldier,name).geometry.getAttribute('color');
  return new THREE.Color(colors.getX(0),colors.getY(0),colors.getZ(0));
}
describe('reference-inspired legacy soldier presentation', () => {
  it('uses exposed skin for both Legacy hands while retaining Modern gloves and hand geometry', () => {
    for(const tier of ['low','high'] as const){
      const legacy=new SoldierModel({presentation:'legacy',materialTier:tier,showName:false});
      const modern=new SoldierModel({presentation:'modern',materialTier:tier,showName:false});
      for(const side of ['left','right']){
        const legacyHand=legacy.group.getObjectByName(`${side}-arm-lower`)!.getObjectByName('glove') as THREE.Mesh;
        const modernHand=modern.group.getObjectByName(`${side}-arm-lower`)!.getObjectByName('glove') as THREE.Mesh;
        expect(legacyHand.material).toBe(mesh(legacy,'face').material);
        expect(legacyHand.userData.soldierSurface).toBe('skin');
        expect(modernHand.material).toBe(mesh(modern,'boot').material);
        expect(modernHand.userData.soldierSurface).toBe('rubber');
        const legacyColor=legacyHand.geometry.getAttribute('color'),faceColor=mesh(legacy,'face').geometry.getAttribute('color');
        expect([legacyColor.getX(0),legacyColor.getY(0),legacyColor.getZ(0)]).toEqual([faceColor.getX(0),faceColor.getY(0),faceColor.getZ(0)]);
        expect(Array.from(legacyHand.geometry.getAttribute('position').array)).toEqual(Array.from(modernHand.geometry.getAttribute('position').array));
        expect(legacyHand.position.toArray()).toEqual(modernHand.position.toArray());
        expect(legacyHand.rotation.toArray()).toEqual(modernHand.rotation.toArray());
        expect(legacyHand.userData.soldierLod).toBe('core');
      }
      legacy.dispose();modern.dispose();
    }
  });
  it('keeps camouflage in both rendering tiers and excludes winter snow', () => {
    for (const tier of ['low','high'] as const) {
      const library=new SoldierMaterialLibrary({presentation:'legacy',tier,textureSize:32});
      expect(library.materials.fabric.map).toBeInstanceOf(THREE.DataTexture);
      const data=(library.materials.fabric.map as THREE.DataTexture).image.data as Uint8Array;
      const colors=new Set<string>();
      for(let i=0;i<data.length;i+=4) colors.add(`${data[i]},${data[i+1]},${data[i+2]}`);
      expect(colors.size).toBeGreaterThan(30);
      for(const material of Object.values(library.materials)) expect(material.userData.snowAccumulation).toBe(false);
      library.dispose();
    }
  });
  it('inherits shared legacy style with light limbs, pale helmet and dark vest and boots', () => {
    const library=new SoldierMaterialLibrary({presentation:'legacy',tier:'low'});
    const soldier=new SoldierModel({materialLibrary:library,team:'red',showName:false});
    expect(soldier.presentation).toBe('legacy');
    const carrier=mesh(soldier,'plate-carrier');
    carrier.geometry.computeBoundingBox();
    const carrierFront=carrier.position.z+carrier.geometry.boundingBox!.max.z;
    const torso=mesh(soldier,'torso-shell');
    torso.geometry.computeBoundingBox();
    expect(carrierFront).toBeGreaterThan(torso.position.z+torso.geometry.boundingBox!.max.z);
    const straps=['shoulder-strap-left','shoulder-strap-right'].map(name=>mesh(soldier,name));
    for(const strap of straps) expect(new THREE.Box3().setFromObject(strap).intersectsBox(new THREE.Box3().setFromObject(carrier))).toBe(true);
    expect(tint(soldier,'thigh').getHSL({h:0,s:0,l:0}).l).toBeGreaterThan(.6);
    expect(tint(soldier,'helmet-shell').getHSL({h:0,s:0,l:0}).l).toBeGreaterThan(tint(soldier,'plate-carrier').getHSL({h:0,s:0,l:0}).l);
    expect(tint(soldier,'boot').getHSL({h:0,s:0,l:0}).l).toBeLessThan(.1);
    for(const name of ['goggle-frame','headset-left','team-patch-left','assault-pack','thigh-pad']) expect(soldier.group.getObjectByName(name)).toBeUndefined();
    for(const weapon of ['pistol','shotgun','rifle','launcher','rpg','sniper'] as const) {
      soldier.setWeapon(weapon);soldier.animate(1/60,{alive:true,moveSpeed:2});
      const grips=soldier.getGripDebugState();
      expect(grips.left.error).toBeLessThan(.04);expect(grips.right.error).toBeLessThan(.04);
    }
    soldier.dispose();library.dispose();
  });
  it('preserves modern kit and snow when no presentation is selected', () => {
    const soldier=new SoldierModel({showName:false});
    expect(soldier.presentation).toBe('modern');
    for(const name of ['goggle-frame','headset-left','team-patch-left','assault-pack','thigh-pad']) expect(soldier.group.getObjectByName(name)).toBeDefined();
    expect((mesh(soldier,'thigh').material as THREE.Material).userData.snowAccumulation).toBe(true);
    soldier.dispose();
  });
});
