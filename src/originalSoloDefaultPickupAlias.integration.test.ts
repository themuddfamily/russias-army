// Retained legacy inline CPU characterization; excludes normal paged default startup.
import {describe,expect,it} from 'vitest';
import {startup,cycle} from './originalSoloDefaultStartup.fixture';
import {originalPlayerEye} from '../shared/originalPlayerPhysics';

// Complete decoded maps and the legacy inline CPU Game factory/coordinator. The
// fixture skips solver advancement; camera/body moves are explicit checkpoints.
// This proves the declared copy's independent pickup actors and shared visual
// identity, not native vector aliasing, renderer timing or bounded actor count.
describe('legacy inline CPU Solo historical pickups sharing a reused gun',()=>{
 it.each(['barrack','woodlands'] as const)('%s collects an old pickup while its recycled GI still holds the same RPG',map=>{
  const f=startup(map);
  try{
   const worlds=f.game.ensureSoloWorlds(),human=worlds.worlds.get('player')!;
   let callback=0;
   const advance=()=>cycle(f.game,worlds,callback++/30);
   const firstLife=worlds.register({id:'held-alias-peer',name:'Held Alias Peer',eye:{x:1100,y:1000,z:0}});
   firstLife.weapon='rpg';advance();
   const firstActor=human.modelState!.actors.find((actor:any)=>actor.actorId==='held-alias-peer')!;
   expect(firstActor).toBeDefined();
   const giHandle=firstActor.gi,gunHandle=firstActor.gun,presenter=f.game.soloReceiverModels.presentation;
   const gi=presenter.readRig(giHandle),gun=presenter.readGun(gunHandle);
   worlds.dispose('held-alias-peer');advance();
   const oldPickup=human.modelState!.pickups[0];expect(oldPickup.handle).toBe(gunHandle);
   for(let n=0;n<76;n++)advance();
   expect(human.modelState!.fifo).toContain(giHandle);expect(human.modelState!.pickups).toEqual([oldPickup]);
   const holder=worlds.register({id:'held-alias-peer',name:'Held Alias Peer',eye:{x:1400,y:1000,z:0}},f.game.elapsed);
   holder.weapon='rpg';advance();
   const held=()=>human.modelState!.actors.find((actor:any)=>actor.actorId==='held-alias-peer')!;
   const gunEntry=()=>human.modelState!.models.find((model:any)=>model.handle===gunHandle)!;
   expect(held()).toMatchObject({gi:giHandle,gun:gunHandle,weapon:'rpg',oldWeapon:'rpg'});
   expect(presenter.readRig(giHandle)).toBe(gi);expect(presenter.readGun(gunHandle)).toBe(gun);
   expect(gunEntry().inWorld).toBe(true);expect(gun.visible).toBe(true);
   const positionWhileHeld=gunEntry().pose.position;
   expect(Math.hypot(positionWhileHeld.x-oldPickup.position.x,positionWhileHeld.y-oldPickup.position.y,positionWhileHeld.z-oldPickup.position.z)).toBeGreaterThan(100);
   // Collection is tested at the pickup actor's stored position, independently
   // of the same visual model's current held transform.
   const initial=human.loadout!;
   f.game.camera.position.copy(oldPickup.position);f.game.checkpointSoloHumanBody();advance();
   expect(human.loadout!.reserve.rpg).toBe(initial.reserve.rpg+12);expect(human.loadout!.score).toBe(initial.score+5);
   expect(human.modelState!.pickups).toEqual([]);expect(f.game.soloReceiverPickupBindings).toEqual([]);
   expect(holder.alive).toBe(true);expect(held()).toMatchObject({gi:giHandle,gun:gunHandle,weapon:'rpg',oldWeapon:'rpg'});
   expect(human.modelState!.models.find((model:any)=>model.handle===giHandle)!.inWorld).toBe(true);
   expect(gunEntry().inWorld).toBe(false);expect(gun.visible).toBe(false);
   // baddies.orientgun updates an unchanged weapon's pose without getwepmod,
   // addToWorld or reparenting. It must not undo pickups.fuckoff's removal.
   holder.body.position.x+=50;advance();
   expect(gunEntry().inWorld).toBe(false);advance();
   expect(held()).toMatchObject({gi:giHandle,gun:gunHandle,weapon:'rpg',oldWeapon:'rpg'});
   expect(gunEntry().pose.position).not.toEqual(positionWhileHeld);
   expect(gunEntry().inWorld).toBe(false);expect(gun.visible).toBe(false);expect(presenter.readGun(gunHandle)).toBe(gun);
   const once=human.loadout!;advance();
   expect(human.loadout!.reserve.rpg).toBe(once.reserve.rpg);expect(human.loadout!.score).toBe(once.score);expect(gunEntry().inWorld).toBe(false);
   // die writes the same gun's drop transform and creates another pickup actor;
   // it does not add the previously removed model back to the world.
   worlds.dispose('held-alias-peer');advance();
   const nextPickup=human.modelState!.pickups[0];expect(human.modelState!.pickups).toHaveLength(1);
   expect(nextPickup.id).not.toBe(oldPickup.id);expect(nextPickup.handle).toBe(gunHandle);expect(nextPickup.position).not.toEqual(oldPickup.position);
   expect(gunEntry().inWorld).toBe(false);expect(gun.visible).toBe(false);expect(f.game.soloReceiverPickupBindings[0].model).toBe(gun);
   const beforeNext=human.loadout!;
   f.game.camera.position.copy(nextPickup.position);f.game.checkpointSoloHumanBody();advance();
   expect(human.loadout!.reserve.rpg).toBe(beforeNext.reserve.rpg+12);expect(human.loadout!.score).toBe(beforeNext.score+5);
   expect(human.modelState!.pickups).toEqual([]);expect(gunEntry().inWorld).toBe(false);expect(gun.visible).toBe(false);
  }finally{f.dispose();}
 });

 it.each(['barrack','woodlands'] as const)('%s retains both collection positions after GI/RPG reuse',map=>{
  const f=startup(map);
  try{
   const worlds=f.game.ensureSoloWorlds(),human=worlds.worlds.get('player')!;
   let callback=0;
   const advance=()=>cycle(f.game,worlds,callback++/30);
   const firstLife=worlds.register({id:'reused-peer',name:'Reused Peer',eye:{x:1100,y:1000,z:0}});
   firstLife.weapon='rpg';advance();
   const firstActor=human.modelState!.actors.find((actor:any)=>actor.actorId==='reused-peer')!;
   expect(firstActor).toBeDefined();
   const giHandle=firstActor.gi,gunHandle=firstActor.gun;
   const presenter=f.game.soloReceiverModels.presentation,gi=presenter.readRig(giHandle),gun=presenter.readGun(gunHandle);
   expect(gi).toBeDefined();expect(gun).toBeDefined();
   worlds.dispose('reused-peer');advance();
   expect(human.modelState!.actors).toEqual([]);expect(human.modelState!.pickups).toHaveLength(1);
   const first=human.modelState!.pickups[0];
   expect(first.weapon).toBe('rpg');expect(first.handle).toBe(gunHandle);
   expect(f.game.soloReceiverPickupBindings[0].model).toBe(gun);
   // fadeaway adds eight until bon>600. Neither GI retirement nor subsequent
   // callbacks expire the independently registered pickup actor.
   for(let n=0;n<76;n++)advance();
   expect(human.modelState!.fades).toEqual([]);expect(human.modelState!.fifo).toContain(giHandle);
   expect(human.modelState!.pickups).toEqual([first]);
   const secondLife=worlds.register({id:'reused-peer',name:'Reused Peer',eye:{x:1400,y:1000,z:0}},f.game.elapsed);
   secondLife.weapon='rpg';expect(secondLife.lifeGeneration).toBeGreaterThan(firstLife.lifeGeneration);advance();
   const secondActor=human.modelState!.actors.find((actor:any)=>actor.actorId==='reused-peer')!;
   expect(secondActor.gi).toBe(giHandle);expect(secondActor.gun).toBe(gunHandle);
   expect(presenter.readRig(giHandle)).toBe(gi);expect(presenter.readGun(gunHandle)).toBe(gun);
   expect(human.modelState!.pickups).toEqual([first]);expect(human.modelState!.fifo).not.toContain(giHandle);
   worlds.dispose('reused-peer');advance();
   const pickups=human.modelState!.pickups;
   expect(pickups).toHaveLength(2);expect(pickups[0]).toEqual(first);
   const second=pickups[1];
   expect(second.id).not.toBe(first.id);expect(second.weapon).toBe('rpg');expect(second.handle).toBe(first.handle);
   expect(second.position).not.toEqual(first.position);
   expect(Math.hypot(second.position.x-first.position.x,second.position.y-first.position.y,second.position.z-first.position.z)).toBeGreaterThan(100);
   expect(f.game.soloReceiverPickupBindings.map((binding:any)=>binding.model)).toEqual([gun,gun]);
   const initial=human.loadout!;
   f.game.camera.position.copy(first.position);f.game.checkpointSoloHumanBody();
   for(const axis of ['x','y','z'] as const)expect(originalPlayerEye(human.body)[axis]).toBeCloseTo(first.position[axis],12);advance();
   expect(human.loadout!.reserve.rpg).toBe(initial.reserve.rpg+12);expect(human.loadout!.score).toBe(initial.score+5);
   expect(human.modelState!.pickups).toEqual([second]);
   expect(f.game.soloReceiverPickupBindings).toHaveLength(1);expect(f.game.soloReceiverPickupBindings[0].model).toBe(gun);
   expect(human.modelState!.models.find((model:any)=>model.handle===gunHandle)!.inWorld).toBe(false);expect(gun.visible).toBe(false);
   const collectedFirst=human.loadout!;
   f.game.camera.position.copy(second.position);f.game.checkpointSoloHumanBody();
   for(const axis of ['x','y','z'] as const)expect(originalPlayerEye(human.body)[axis]).toBeCloseTo(second.position[axis],12);advance();
   expect(human.loadout!.reserve.rpg).toBe(collectedFirst.reserve.rpg+12);expect(human.loadout!.score).toBe(collectedFirst.score+5);
   expect(human.modelState!.pickups).toEqual([]);expect(f.game.soloReceiverPickupBindings).toEqual([]);
   expect(presenter.readGun(gunHandle)).toBe(gun);expect(gun.visible).toBe(false);
   const final=human.loadout!;advance();expect(human.loadout!.reserve.rpg).toBe(final.reserve.rpg);expect(human.loadout!.score).toBe(final.score);
  }finally{f.dispose();}
 });
});
