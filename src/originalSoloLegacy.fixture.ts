import * as THREE from 'three';
import {OriginalSoloObserverWorlds} from '../shared/originalSoloObserverWorld';
import {ORIGINAL_PLAYER_DERIVATIVE_FACTOR} from '../shared/originalPlayerPhysics';
import {OriginalSoloModelPresentation} from './originalSoloModelPresentation';

/** Test-only pre-activation coordinator seam for legacy and deliberately partial
 * ownership fixtures. These tests exercise old renderer/physics compatibility,
 * not complete loaded-scene startup. Production Game never imports this helper;
 * the default startup integration tests exercise its real ensureSoloWorlds.
 * Preserve the former bootstrap without inventing missing resource packs. */
export function installOriginalSoloLegacyFixture(game:any):void {
 game.ensureSoloWorlds=():OriginalSoloObserverWorlds|undefined=>{
  if(!game.isSourceSolo()||!game.playerAlive)return undefined;
  if(!game.soloWorlds&&(game.soloReceiverModels||game.soloReceiverTransients||game.soloDetachedFlashes?.length))game.disposeSoloWorlds(false);
  if(!game.soloWorlds){
   game.soloCorpses??=new Map();game.soloBotShots??=[];
   game.soloModelPresentation??=new OriginalSoloModelPresentation();
   for(const enemy of game.enemies)if(enemy.sourceRig){game.soloModelPresentation.register(enemy.id,enemy.sourceRig);enemy.sourceRig.prepareSourceReuse(enemy.name);}
   const projectileGeometry=new Map<'launcher'|'rpg',THREE.BufferGeometry>();
   for(const weapon of ['launcher','rpg'] as const){const geometry=game.originalWeapons?.resources.get(weapon==='rpg'?'rpgrocket':'rg6grenade')?.geometry;if(geometry)projectileGeometry.set(weapon,geometry);}
   game.soloWorlds=new OriginalSoloObserverWorlds(game.arena.runtime,{templateBarrels:game.arena.barrelWorld,templateDoors:game.arena.doorWorld,admitWeaponReportDamage:true,
    soldierAssets:game.originalSoldierResources?.assets,projectileGeometry,presentationLifecycle:true,onEvent:event=>game.receiveSoloWorldEvent(event)});
   game.soloWorlds.register({id:'player',name:game.localCallsign||'COMRADE',eye:game.camera.position,
    velocity:{x:game.velocity.x/ORIGINAL_PLAYER_DERIVATIVE_FACTOR,y:game.velocity.y/ORIGINAL_PLAYER_DERIVATIVE_FACTOR,z:game.velocity.z/ORIGINAL_PLAYER_DERIVATIVE_FACTOR},
    health:game.ensureOriginalHealth(),barrels:game.arena.barrelWorld,doors:game.arena.doorWorld,yaw:game.yaw},game.elapsed);
   for(const enemy of game.enemies)if(enemy.alive)game.registerSoloEnemy(enemy);
  }
  return game.soloWorlds;
 };
}
