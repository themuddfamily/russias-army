// Retained legacy inline CPU characterization; excludes normal paged default startup.
import {describe,expect,it,vi} from 'vitest';
import {startup,prepare,cycle} from './originalSoloDefaultStartup.fixture';

describe('actual legacy inline CPU Solo committed fade constructor audio',()=>{
 it.each(['barrack','woodlands'] as const)('%s publishes death fade audio only after joint commit',map=>{
  const f=startup(map);let failure:{mockRestore():void}|undefined,receive:{mockRestore():void}|undefined;
  try{
   const worlds=f.game.ensureSoloWorlds(),human=worlds.worlds.get('player')!;
   const dead=worlds.register({id:'fade-owner',name:'Fade Owner',eye:{x:1100,y:1000,z:0}});dead.weapon='rpg';
   const peer=worlds.register({id:'fade-peer',name:'Fade Peer',eye:{x:1500,y:1000,z:0}});peer.weapon='launcher';
   cycle(f.game,worlds,0);f.game.playOriginalCombatSound.mockClear();
   const sink=f.game.receiveSoloWorldEvent,events:any[]=[];
   receive=vi.spyOn(f.game,'receiveSoloWorldEvent').mockImplementation((event:any)=>{if(event.kind==='fade-born'&&event.recipientId==='player')events.push(event);sink.call(f.game,event);});
   worlds.dispose('fade-owner');prepare(f.game,worlds,1/30);
   failure=vi.spyOn(peer.mirror,'prepareSynchronousDelivery').mockImplementationOnce(()=>{throw Error('fade late peer');});
   expect(()=>worlds.completeGoody(1/30)).toThrow('fade late peer');failure.mockRestore();failure=undefined;
   expect(events).toEqual([]);expect(f.game.playOriginalCombatSound).not.toHaveBeenCalled();
   worlds.completeGoody(1/30);f.game.completeSoloActors();
   expect(events).toHaveLength(1);const event=events[0];
   expect(event.transition.fadePositionWorld.x).toBeCloseTo(1100,12);
   expect(event.transition.fadePositionWorld.y).toBeCloseTo(1000,12);
   expect(event.transition.fadePositionWorld.z).toBeCloseTo(0,12);
   expect(human.fadeBirths).toContain(event);expect(Object.isFrozen(human.fadeBirths)).toBe(true);
   expect(f.game.playOriginalCombatSound).toHaveBeenCalledExactlyOnceWith('hurt',event.transition.fadePositionWorld);
   // Exact issued identity is consumed before user audio. Neither a replay nor
   // a structurally equal forged event carries fresh constructor authority.
   sink.call(f.game,event);sink.call(f.game,structuredClone(event));
   expect(f.game.playOriginalCombatSound).toHaveBeenCalledOnce();
   cycle(f.game,worlds,2/30);sink.call(f.game,event);
   expect(f.game.playOriginalCombatSound).toHaveBeenCalledOnce();
  }finally{failure?.mockRestore();receive?.mockRestore();f.dispose();}
 });

 it.each(['barrack','woodlands'] as const)('%s consumes fade birth before a throwing and reentrant audio sink',map=>{
  const f=startup(map);let receive:{mockRestore():void}|undefined;
  try{
   const worlds=f.game.ensureSoloWorlds(),human=worlds.worlds.get('player')!;
   const dead=worlds.register({id:'fade-owner',name:'Fade Owner',eye:{x:1100,y:1000,z:0}});dead.weapon='rpg';cycle(f.game,worlds,0);
   const sink=f.game.receiveSoloWorldEvent;let issued:any;
   receive=vi.spyOn(f.game,'receiveSoloWorldEvent').mockImplementation((event:any)=>{if(event.kind==='fade-born'&&event.recipientId==='player')issued=event;sink.call(f.game,event);});
   f.game.playOriginalCombatSound.mockClear();f.game.playOriginalCombatSound.mockImplementationOnce(()=>{sink.call(f.game,issued);throw Error('fade audio sink');});
   worlds.dispose('fade-owner');prepare(f.game,worlds,1/30);
   expect(()=>worlds.completeGoody(1/30)).toThrow();
   expect(issued).toBeDefined();expect(human.fadeBirths).toContain(issued);
   expect(worlds.callbackPhase).toBe('goody');expect(human.modelState!.fades).toHaveLength(1);
   expect(f.game.playOriginalCombatSound).toHaveBeenCalledExactlyOnceWith('hurt',issued.transition.fadePositionWorld);
   f.game.completeSoloActors();sink.call(f.game,issued);cycle(f.game,worlds,2/30);
   expect(f.game.playOriginalCombatSound).toHaveBeenCalledOnce();
  }finally{receive?.mockRestore();f.dispose();}
 });
});
