import './style.css';
import { Game } from './game';
import { preloadGeneratedGameAssets } from './generatedAssets';
import { loadOriginalWeaponAssets } from './originalWeapons';
import {loadOriginalSoldierAssets} from './originalSoldier';
import { preloadOriginalMapAssets } from './originalMapAssets';
import {loadOriginalExplosionResources} from './originalExplosionPresentation';
import {loadOriginalCombatEffectResources} from './originalCombatEffectPresentation';

// Let the loading screen paint before procedural texture and geometry
// generation lock the main thread for the rest of startup.
requestAnimationFrame(() => requestAnimationFrame(() => {
  const assetTimeout = new Promise<undefined>((resolve) => setTimeout(resolve, 1600));
  const original = new URLSearchParams(location.search).get('map') === 'winter'
    ? Promise.resolve(undefined) : preloadOriginalMapAssets();
  const weapons = new URLSearchParams(location.search).get('map') === 'winter'
    ? Promise.resolve(undefined) : loadOriginalWeaponAssets();
  const soldier=new URLSearchParams(location.search).get('map')==='winter'?Promise.resolve(undefined):loadOriginalSoldierAssets();
  const effects=new URLSearchParams(location.search).get('map')==='winter'?Promise.resolve(undefined):loadOriginalExplosionResources();
  const combatEffects=new URLSearchParams(location.search).get('map')==='winter'?Promise.resolve(undefined):loadOriginalCombatEffectResources();
  void Promise.all([Promise.race([preloadGeneratedGameAssets(), assetTimeout]), original, weapons,soldier,effects,combatEffects]).then(([assets, maps, gunAssets,soldierAssets,effectResources,combatEffectResources]) => {
    new Game(document.getElementById('game')!, assets, maps, gunAssets,soldierAssets,effectResources,combatEffectResources);
  }).catch(error => {
    console.error(error);
    const loading = document.getElementById('loading');
    if (loading) loading.textContent = 'Original game assets could not load. Refresh to retry.';
  });
}));
