// Retained legacy inline CPU characterization; excludes normal paged default startup.
import {describe,expect,it} from 'vitest';
import {startup,cycle,prepare} from './originalSoloDefaultStartup.fixture';

// Retained regression for the legacy inline sixteen-pickup boundary.
// Recovered baddies.die creates an independent pickup each time; fadeaway
// retires/recycles GI without retiring its historical pickup. Complete maps
// and the legacy inline CPU Game factory are used, with solver advancement
// explicitly skipped by the startup fixture. No native contact or aliasing
// behavior is claimed. Keep this characterization when changing storage:
// a replacement acceptance case must allow all seventeen deaths to commit.
describe('legacy inline CPU Solo historical pickup capacity reproduction',()=>{
 it.each(['barrack','woodlands'] as const)('%s rolls back the callback after death seventeen without losing independent old pickup positions',map=>{
  const f=startup(map);
  try{
   const worlds=f.game.ensureSoloWorlds(),human=worlds.worlds.get('player')!;
   let callback=0;
   const advance=()=>{
    cycle(f.game,worlds,callback++/30);
    // Discard only the old fixture's diagnostic histories, never committed
    // coordinator banks, resource owners or Game presentation state. The
    // legacy inline factory normally leaves these fixture arrays empty.
    for(const history of [f.inputs,f.events,f.humanShots,f.puffContexts,f.drops])history.length=0;
    for(const history of f.programs.values())history.length=0;
    f.birthReads.clear();
   };
   const id='pickup-capacity-peer',name='Pickup Capacity Peer';
   let presenter:any;
   let giHandle:string|undefined,gunHandle:string|undefined,gi:unknown,gun:any;
   const historical:typeof human.modelState.pickups[number][]=[];
   const spawn=(life:number)=>{
    const peer=worlds.register({id,name,eye:{x:1100+300*life,y:1000,z:0}},f.game.elapsed);
    peer.weapon='rpg';advance();
    const actor=human.modelState!.actors.find((item:any)=>item.actorId===id)!;
    expect(actor).toBeDefined();
    if(life===0){
     presenter=f.game.soloReceiverModels.presentation;
     giHandle=actor.gi;gunHandle=actor.gun;
     gi=presenter.readRig(giHandle);gun=presenter.readGun(gunHandle);
    }else{
     expect(actor.gi).toBe(giHandle);expect(actor.gun).toBe(gunHandle);
     expect(presenter.readRig(actor.gi)).toBe(gi);expect(presenter.readGun(actor.gun)).toBe(gun);
    }
    expect(human.modelState!.pickups).toEqual(historical);
    return peer;
   };
   for(let life=0;life<16;life++){
    spawn(life);worlds.dispose(id);advance();
    const pickups=human.modelState!.pickups;
    expect(pickups).toHaveLength(life+1);expect(pickups.slice(0,-1)).toEqual(historical);
    const born=pickups.at(-1)!;expect(born.handle).toBe(gunHandle);expect(born.weapon).toBe('rpg');
    for(const old of historical){
     expect(born.id).not.toBe(old.id);
     expect(Math.hypot(born.position.x-old.position.x,born.position.y-old.position.y,born.position.z-old.position.z)).toBeGreaterThan(100);
    }
    historical.push(born);
    // Actual source-shaped corpse callbacks return the same GI to its FIFO.
    // Advancing time alone must not expire any independent pickup actor.
    for(let n=0;n<76;n++)advance();
    expect(human.modelState!.fades).toEqual([]);expect(human.modelState!.fifo).toContain(giHandle);
    expect(human.modelState!.pickups).toEqual(historical);
    expect(f.game.soloReceiverPickupBindings).toHaveLength(life+1);
    expect(f.game.soloReceiverPickupBindings.every((binding:any)=>binding.model===gun)).toBe(true);
   }
   const seventeenth=spawn(16);
   // A death receipt marks the mirror actor dead. Its die/detach callback is
   // deferred; synchronous disposal itself successfully removes this life.
   worlds.dispose(id);expect(worlds.worlds.has(id)).toBe(false);expect(seventeenth.alive).toBe(false);
   const before=human.modelState!,beforeCallback=human.callback,beforeReceipt=human.receiptTick;
   const beforeLoadout=human.loadout!,beforeBindings=[...f.game.soloReceiverPickupBindings];
   expect(before.pickups).toEqual(historical);
   expect(before.actors.find((actor:any)=>actor.actorId===id)).toMatchObject({gi:giHandle,gun:gunHandle});
   const beforeMirror=human.mirror.freeze(),beforeMirrorClock=human.mirror.debugState();
   // Keep the same prepared physics/goody prefix for both attempts. Do not
   // advance another physical callback, edit captured inputs or claim that a
   // body move can rescue a frozen pending plan.
   const failedTime=callback/30;prepare(f.game,worlds,failedTime);
   for(let attempt=0;attempt<2;attempt++){
    expect(()=>worlds.completeGoody(failedTime)).toThrow('Receiver pickup budget requires resynchronization');
    expect(worlds.callbackPhase).toBe('physics');
    expect(human.modelState).toBe(before);expect(human.modelState!.pickups).toEqual(historical);
    expect(human.callback).toBe(beforeCallback);expect(human.receiptTick).toBe(beforeReceipt);
    expect(human.loadout).toBe(beforeLoadout);expect(f.game.soloReceiverPickupBindings).toEqual(beforeBindings);
    expect(human.mirror.freeze()).toEqual(beforeMirror);expect(human.mirror.debugState()).toEqual(beforeMirrorClock);
    expect(human.modelState!.actors.find((actor:any)=>actor.actorId===id)).toMatchObject({gi:giHandle,gun:gunHandle});
    expect(presenter.readRig(giHandle)).toBe(gi);expect(presenter.readGun(gunHandle)).toBe(gun);
    expect(human.modelState!.pickups[0]).toEqual(historical[0]);
    expect(human.modelState!.pickups[15]).toEqual(historical[15]);
   }
  }finally{f.dispose();}
 },15000);
});
