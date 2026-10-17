import * as THREE from 'three';
import type { ArenaSurface } from './materials';
import type { SoldierMaterialSurface } from './soldierMaterials';
import type { WeaponMaterialSurface } from './weaponMaterials';

// Vite rewrites HTML/CSS public paths for a configured deployment base, but
// strings assembled in TypeScript need to opt into that base explicitly.
export function generatedAssetRoot(baseUrl:string):string {
  return `${baseUrl.endsWith('/')?baseUrl:`${baseUrl}/`}assets/generated`;
}

const ROOT = generatedAssetRoot(import.meta.env.BASE_URL);

export const GENERATED_ASSET_URLS = Object.freeze({
  screens: Object.freeze({
    menu: `${ROOT}/screens/menu-backdrop.webp`,
    loading: `${ROOT}/screens/loading-backdrop.webp`,
    emblem: `${ROOT}/screens/loading-emblem.png`,
  }),
  arena: Object.freeze({
    'cracked-concrete': `${ROOT}/materials/arena/cracked-concrete.webp`,
    'icy-asphalt': `${ROOT}/materials/arena/icy-asphalt.webp`,
    'painted-corrugated-steel': `${ROOT}/materials/arena/painted-corrugated-steel.webp`,
    'worn-wood': `${ROOT}/materials/arena/worn-wood.webp`,
    burlap: `${ROOT}/materials/arena/burlap.webp`,
    snow: `${ROOT}/materials/arena/packed-snow.webp`,
    'dark-metal': `${ROOT}/materials/arena/dark-metal.webp`,
  } satisfies Record<ArenaSurface, string>),
  weapon: Object.freeze({
    gunmetal: `${ROOT}/materials/actors/blackened-gunmetal.webp`,
    polymer: `${ROOT}/materials/actors/dark-molded-polymer.webp`,
    'worn-wood': `${ROOT}/materials/actors/worn-laminated-wood.webp`,
    paint: `${ROOT}/materials/actors/chipped-olive-paint.webp`,
  } satisfies Record<WeaponMaterialSurface, string>),
  soldier: Object.freeze({
    fabric: `${ROOT}/materials/actors/winter-uniform-fabric.webp`,
    armor: `${ROOT}/materials/actors/ballistic-armor.webp`,
    webbing: `${ROOT}/materials/actors/military-webbing.webp`,
    rubber: `${ROOT}/materials/actors/ballistic-armor.webp`,
    polymer: `${ROOT}/materials/actors/ballistic-armor.webp`,
    metal: `${ROOT}/materials/actors/weapon-metal.webp`,
    wood: `${ROOT}/materials/actors/weathered-weapon-wood.webp`,
    skin: `${ROOT}/materials/actors/winter-skin.webp`,
    lens: `${ROOT}/materials/actors/ballistic-armor.webp`,
  } satisfies Partial<Record<SoldierMaterialSurface, string>>),
  decals: Object.freeze({
    health: `${ROOT}/decals/pickup-health.png`,
    armor: `${ROOT}/decals/pickup-armor.png`,
    ammo: `${ROOT}/decals/pickup-ammo.png`,
    bullet: `${ROOT}/decals/bullet-hole.png`,
    scorch: `${ROOT}/decals/scorch-mark.png`,
    boot: `${ROOT}/decals/bootprint.png`,
    muzzle: `${ROOT}/decals/muzzle-flash.png`,
    crateStamp: `${ROOT}/decals/crate-stamp.png`,
    signPlate: `${ROOT}/decals/blank-sign-plate.webp`,
  }),
});

export interface GeneratedGameAssets {
  arena: Partial<Record<ArenaSurface, THREE.Texture>>;
  weapon: Partial<Record<WeaponMaterialSurface, THREE.Texture>>;
  soldier: Partial<Record<SoldierMaterialSurface, THREE.Texture>>;
  decals: {
    health?: THREE.Texture;
    armor?: THREE.Texture;
    ammo?: THREE.Texture;
    bullet?: THREE.Texture;
    scorch?: THREE.Texture;
    boot?: THREE.Texture;
    muzzle?: THREE.Texture;
    crateStamp?: THREE.Texture;
    signPlate?: THREE.Texture;
  };
}

function loadTexture(loader: THREE.TextureLoader, url: string): Promise<THREE.Texture | undefined> {
  return loader.loadAsync(url).then((texture) => {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.generateMipmaps = true;
    texture.needsUpdate = true;
    return texture;
  }).catch(() => undefined);
}

async function loadGroup<K extends string>(
  loader: THREE.TextureLoader,
  urls: Readonly<Record<K, string>>,
): Promise<Partial<Record<K, THREE.Texture>>> {
  const entries = await Promise.all(
    (Object.entries(urls) as Array<[K, string]>).map(async ([key, url]) => [key, await loadTexture(loader, url)] as const),
  );
  const textures: Partial<Record<K, THREE.Texture>> = {};
  for (const [key, texture] of entries) if (texture) textures[key] = texture;
  return textures;
}

export async function preloadGeneratedGameAssets(): Promise<GeneratedGameAssets> {
  const loader = new THREE.TextureLoader();
  const [arena, weapon, soldier, decals] = await Promise.all([
    loadGroup(loader, GENERATED_ASSET_URLS.arena),
    loadGroup(loader, GENERATED_ASSET_URLS.weapon),
    loadGroup(loader, GENERATED_ASSET_URLS.soldier),
    loadGroup(loader, GENERATED_ASSET_URLS.decals),
  ]);
  return { arena, weapon, soldier, decals };
}
