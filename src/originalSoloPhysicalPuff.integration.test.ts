import {describe,it,expect,vi} from 'vitest';
import {presentationFixture} from './originalSoloLoadedScenePresentation.fixture';
import {isOriginalSoloPhysicalPuffContext} from '../shared/originalSoloObserverWorld';

const goody=(f:ReturnType<typeof presentationFixture>,time:number)=>{f.prepare(time);f.worlds.completeGoody(time);};
// Actual complete decoded scenes and Game's FX owner. Camera, actor order and
// query geometry policies remain installed CPU adapters; this is not raster proof.
describe('physical RPG puffs through configured complete Game scenes',()=>{
 it.each(['weapon','shooterId','hit','oversizedId'] as const)('rejects malformed %s without invoking arbitrary serialization',field=>{
  let f:ReturnType<typeof presentationFixture>;const unknown=vi.fn(()=>{throw Error('arbitrary serialization');});
  f=presentationFixture('barrack',{samplePuffRandom36:()=>{
   const state=[...f.player.projectiles.values()][0].state as unknown as Record<string,unknown>;
   state[field==='oversizedId'?'shooterId':field]=field==='oversizedId'?'x'.repeat(65537):{toJSON:unknown};return 7;
  }});
  try{
   f.add('b',1,'rpg');goody(f,0);f.game.completeSoloActors();goody(f,1/30);
   const state=f.player.transientState,remaining=[...f.player.projectiles.values()][0].state.remainingCallbacks;
   expect(()=>f.game.completeSoloActors()).toThrow('Invalid Solo projectile actor primitives');expect(unknown).not.toHaveBeenCalled();expect(f.puffContexts).toEqual([]);
   expect(f.player.transientState).toBe(state);expect([...f.player.projectiles.values()][0].state.remainingCallbacks).toBe(remaining);
  }finally{f.dispose();}
 });
 it('fingerprints fixed operands without traversing unknown getters or geometry serialization hooks',()=>{
  const f=presentationFixture('barrack'),unknown=vi.fn(()=>{throw Error('unknown property traversed');});
  try{
   f.add('b',1,'rpg');goody(f,0);f.game.completeSoloActors();goody(f,1/30);
   for(const world of f.worlds.worlds.values())for(const projectile of world.projectiles.values()){
    projectile.state.sourceRotation={...projectile.state.sourceRotation!};
    for(const object of [projectile.state.sourceRotation,projectile.state.angular!]){
     Object.defineProperty(object,'toJSON',{get:unknown,enumerable:true});Object.defineProperty(object,'unrelated',{get:unknown,enumerable:true});
    }
   }
   f.game.completeSoloActors();expect(unknown).not.toHaveBeenCalled();expect(f.puffContexts).toHaveLength(3);
  }finally{f.dispose();}
 });
 it.each([undefined,null,0,37,NaN])('rejects invalid configured sampler result %s without ambient RNG or physical commit',invalid=>{
  const f=presentationFixture('barrack',{samplePuffRandom36:()=>invalid as number});
  try{
   f.add('b',1,'rpg');goody(f,0);f.game.completeSoloActors();goody(f,1/30);
   const state=f.player.transientState,projectile=[...f.player.projectiles.values()][0],remaining=projectile.state.remainingCallbacks;
   const ambient=vi.spyOn(Math,'random');
   try{expect(()=>f.game.completeSoloActors()).toThrow('Invalid Solo puff random36');expect(ambient).not.toHaveBeenCalled();}finally{ambient.mockRestore();}
   expect(f.puffContexts).toEqual([]);expect(f.player.transientState).toBe(state);expect(projectile.state.remainingCallbacks).toBe(remaining);
  }finally{f.dispose();}
 });
 it('poisons sampling even when the sampler swallows coordinator reentry rejection',()=>{
  let f:ReturnType<typeof presentationFixture>;
  f=presentationFixture('barrack',{samplePuffRandom36:()=>{try{f.worlds.clear();}catch{}return 7;}});
  try{
   f.add('b',1,'rpg');goody(f,0);f.game.completeSoloActors();goody(f,1/30);
   const state=f.player.transientState,projectile=[...f.player.projectiles.values()][0],remaining=projectile.state.remainingCallbacks;
   expect(()=>f.game.completeSoloActors()).toThrow('Changed Solo puff sampling stage');
   expect(f.worlds.worlds.size).toBe(3);expect(f.puffContexts).toEqual([]);expect(f.player.transientState).toBe(state);expect(projectile.state.remainingCallbacks).toBe(remaining);
  }finally{f.dispose();}
 });
 it.each(['sampling','preparation'] as const)('rejects operand mutation during %s before append commit and retries the retained detached position',stage=>{
  let f:ReturnType<typeof presentationFixture>,mutate=true;
  f=presentationFixture('barrack',{samplePuffRandom36:()=>{if(stage==='sampling'&&mutate)[...f.player.projectiles.values()][0].state.direction.x+=1;return 7;}});
  try{
   f.add('b',1,'rpg');goody(f,0);f.game.completeSoloActors();goody(f,1/30);
   const state=f.player.transientState,projectile=[...f.player.projectiles.values()][0],direction={...projectile.state.direction},remaining=projectile.state.remainingCallbacks;
   f.puffFlags.beforePrepare=c=>{if(stage==='preparation'&&mutate)c.projectile.state.direction.x+=1;};
   expect(()=>f.game.completeSoloActors()).toThrow(stage==='sampling'?'Changed Solo puff sampling stage':'Foreign or changed Solo puff stage');
   expect(f.player.transientState).toBe(state);expect(projectile.state.remainingCallbacks).toBe(remaining);
   mutate=false;projectile.state.direction=direction;f.game.completeSoloActors();
   expect(projectile.state.remainingCallbacks).toBe(remaining-1);expect(f.player.transientState!.actors.filter(a=>a.kind==='puff')).toHaveLength(1);
   if(stage==='preparation')expect(f.puffContexts[1]).toBe(f.puffContexts[0]);
  }finally{f.dispose();}
 });
 it('retains earlier committed renderer errors across a later viewer preparation retry',()=>{
  let samples=0;const f=presentationFixture('barrack',{samplePuffRandom36:()=>{samples++;return 7;}}),rendererError=Error('renderer sentinel');
  try{
   f.add('b',1,'rpg');goody(f,0);f.game.completeSoloActors();goody(f,1/30);
   f.puffFlags.afterEvent=e=>{if(e.kind==='transient-state'&&e.recipientId==='player')throw rendererError;};f.puffFlags.failRecipient='b';
   expect(()=>f.game.completeSoloActors()).toThrow('physical puff injected failure');
   const state=f.player.transientState,remaining=[...f.player.projectiles.values()][0].state.remainingCallbacks,events=f.events.filter(e=>e.kind==='transient-state'&&e.recipientId==='player').length,context=f.puffContexts.at(-1);
   f.puffFlags.failRecipient=undefined;
   let error:unknown;try{f.game.completeSoloActors();}catch(caught){error=caught;}
   expect(error).toBeInstanceOf(AggregateError);expect((error as AggregateError).errors).toContain(rendererError);
   expect(samples).toBe(3);expect(f.puffContexts.at(-1)).toBe(context);expect(f.player.transientState).toBe(state);expect([...f.player.projectiles.values()][0].state.remainingCallbacks).toBe(remaining);
   expect(f.events.filter(e=>e.kind==='transient-state'&&e.recipientId==='player')).toHaveLength(events);
  }finally{f.dispose();}
 });
 it.each(['barrack','woodlands'] as const)('%s births at physical actor time and retries only the failed viewer without resampling or repeated steps',map=>{
  let samples=0;const f=presentationFixture(map,{samplePuffRandom36:()=>{samples++;return 7;}});
  try{
   f.add('b',1,'rpg');goody(f,0);f.game.completeSoloActors();
   expect(samples).toBe(0);expect(f.puffContexts).toEqual([]);
   goody(f,1/30);const prefix=f.player.transientState!.prefix,local=f.player.localWeapons,loadout=f.player.loadout,callback=f.player.callback,tick=f.player.receiptTick,health=f.player.health.canonical;
   const beforeB=[...f.b.projectiles.values()][0].state.remainingCallbacks;f.puffFlags.failRecipient='b';
   expect(()=>f.game.completeSoloActors()).toThrow('physical puff injected failure');
   expect(samples).toBe(3);const context=f.puffContexts.at(-1)!;expect(isOriginalSoloPhysicalPuffContext(context)).toBe(true);
   expect([...f.b.projectiles.values()][0].state.remainingCallbacks).toBe(beforeB);
   const committed=f.player.transientState!,puff=committed.actors.find(a=>a.kind==='puff')!;
   expect(puff).toBeDefined();expect(puff.time).toBe(0);expect(puff.position).toEqual(f.puffContexts[0].event.position);
   expect(f.game.soloReceiverTransients.presentation.freeze()).toBe(committed);
   const playerLifetime=[...f.player.projectiles.values()][0].state.remainingCallbacks;
   f.puffFlags.failRecipient=undefined;f.game.completeSoloActors();
   expect(samples).toBe(3);expect(f.puffContexts.at(-1)).toBe(context);expect(isOriginalSoloPhysicalPuffContext(context)).toBe(false);
   expect([...f.b.projectiles.values()][0].state.remainingCallbacks).toBe(beforeB-1);expect([...f.player.projectiles.values()][0].state.remainingCallbacks).toBe(playerLifetime);
   expect(f.player.transientState).toBe(committed);expect(committed.prefix).toEqual(prefix);expect(f.player.callback).toBe(callback);expect(f.player.receiptTick).toBe(tick);
   expect(f.player.localWeapons).toBe(local);expect(f.player.loadout).toBe(loadout);expect(f.player.health.canonical).toBe(health);
   expect(f.player.transientState!.actors.filter(a=>a.kind==='puff')).toHaveLength(1);
  }finally{f.dispose();}
 });
 it.each(['barrack','woodlands'] as const)('%s commits the terminal puff before detonation, ages it only next callback and never puffs new constructors immediately',map=>{
  let samples=0;const f=presentationFixture(map,{samplePuffRandom36:()=>{samples++;return 36;}});
  try{
   f.add('b',1,'rpg');goody(f,0);f.game.completeSoloActors();expect(samples).toBe(0);
   for(const world of f.worlds.worlds.values())for(const projectile of world.projectiles.values())projectile.state.remainingCallbacks=1;
   goody(f,1/30);const begin=f.events.length,prefix=f.player.transientState!.prefix;f.game.completeSoloActors();
   expect(samples).toBe(3);expect(f.player.projectiles.size).toBe(0);expect(f.player.blasts.size).toBe(1);
   const events=f.events.slice(begin).filter(e=>e.recipientId==='player');expect(events.map(e=>e.kind)).toEqual(['transient-state','detonated']);
   const state=f.player.transientState!,puff=state.actors.find(a=>a.kind==='puff')!;expect(puff.time).toBe(0);expect(state.prefix).toEqual(prefix);
   expect(f.puffContexts[0].event.angleSourceDegrees).toBe(360);expect(f.game.soloReceiverTransients.presentation.freeze()).toBe(state);
   goody(f,2/30);f.game.completeSoloActors();expect(samples).toBe(3);
   expect(f.player.transientState!.actors.find(a=>a.id===puff.id)!.time).toBe(6);
  }finally{f.dispose();}
 });
});
