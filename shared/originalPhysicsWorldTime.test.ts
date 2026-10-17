import {expect,it} from 'vitest';
import {createOriginalPlayerBody,stepOriginalPhysicsWorld,ORIGINAL_PLAYER_GRAVITY} from './originalPlayerPhysics';
import {ORIGINAL_PHYSICS_STEP,ORIGINAL_PHYSICS_SUBSTEPS} from './originalExplosives';

it('reports the whole scheduled clock for empty and freely moving worlds',()=>{
 const empty=stepOriginalPhysicsWorld([],[],{sweep:()=>{throw Error('no empty-world query');}});
 expect(empty.kind).toBe('complete');expect(empty.requestedTime).toBe(.05);expect(empty.remainingTime).toBe(0);
 expect(empty.substeps).toHaveLength(10);expect(Object.isFrozen(empty)).toBe(true);expect(Object.isFrozen(empty.substeps)).toBe(true);
 const player=createOriginalPlayerBody('free',{x:0,y:2,z:0},{x:2,y:0,z:0}),start=player.position.x;
 const result=stepOriginalPhysicsWorld([player],[],{sweep:()=>null});
 expect(result.kind).toBe('complete');expect(result.advancedTime).toBeCloseTo(.05,15);
 expect(player.position.x-start).toBeCloseTo(2*result.advancedTime,15);
 for(const s of result.substeps){expect(s.kind).toBe('complete');expect(s.iterations).toBe(1);expect(s.remainingTime).toBe(0);expect(Object.isFrozen(s)).toBe(true);}
});

it('reports tiny unadvanced time separately from full-step gravity without advancing the cutoff remainder',()=>{
 const dt=ORIGINAL_PHYSICS_STEP/ORIGINAL_PHYSICS_SUBSTEPS,fraction=1-1e-10/dt;
 // This synthetic positive-fraction tangent contact has zero normal impulse,
 // so the unchanged gravity schedule can be checked independently of bounce.
 const player=createOriginalPlayerBody('cutoff',{x:0,y:2,z:0},{x:0,y:0,z:0});let first=true;
 const result=stepOriginalPhysicsWorld([player],[],{sweep:from=>first?(first=false,{position:{...from},fraction,normal:{x:-1,y:0,z:0}}):null});
 const s=result.substeps[0];expect(s.kind).toBe('time-cutoff');expect(s.iterations).toBe(1);
 expect(s.remainingTime).toBe(dt*(1-fraction));expect(s.remainingTime).toBeGreaterThan(0);expect(s.remainingTime).toBeLessThanOrEqual(1e-9);
 expect(s.advancedTime).toBe(dt*fraction);expect(result.kind).toBe('incomplete');expect(result.remainingTime).toBe(s.remainingTime);
 expect(result.substeps.slice(1).every(s=>s.kind==='complete')).toBe(true);
 expect(player.velocity.y).toBeCloseTo(ORIGINAL_PLAYER_GRAVITY*.05,12);
});

it('does not mislabel a malformed source clock as an exhausted event budget',()=>{
 const player=createOriginalPlayerBody('invalid',{x:0,y:2,z:0},{x:1,y:0,z:0});let first=true;
 const result=stepOriginalPhysicsWorld([player],[],{sweep:from=>first?(first=false,{position:{...from},fraction:NaN,normal:{x:-1,y:0,z:0}}):null});
 expect(result.kind).toBe('incomplete');expect(result.substeps[0].kind).toBe('invalid-clock');
 expect(result.substeps[0].iterations).toBe(1);expect(Number.isNaN(result.substeps[0].remainingTime)).toBe(true);
 // Observation reports the existing malformed-provider failure; it neither
 // repairs mutated bodies nor invents a retryable finite time debt.
 expect(Number.isNaN(result.advancedTime)).toBe(true);
});
