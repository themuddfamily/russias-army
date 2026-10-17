import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {ORIGINAL_MAP_SCALE as S} from './originalMapProfile';
import {createOriginalMissEffect,stepOriginalMissEffect,createOriginalBloodEffect,stepOriginalBloodEffect,createOriginalRpgPuffEffect,stepOriginalRpgPuffEffect,ORIGINAL_COMBAT_PLANE_SIZE} from './originalCombatEffects';

const position={x:3,y:4,z:5};
const scripts='../docs/research-evidence/2026-09-30/director-script-extraction/';
describe('preserved combat effect actor callbacks',()=>{
  it.each(['ParentScript 18 - miss.ls','ParentScript 19 - blood.ls','ParentScript 16 - puff.ls'])('uses identical rules in both source editions: %s',name=>{
    const source=(edition:string)=>readFileSync(new URL(`${scripts}${edition}/casts/parents/${name}`,import.meta.url),'utf8');
    expect(source('barrack')).toBe(source('woodland'));
  });
  it('converts the source 50-unit base plane and one-unit normal offset explicitly',()=>{
    expect(ORIGINAL_COMBAT_PLANE_SIZE).toBe(50*S);
    const normal={x:0,y:1,z:0};
    const shotgun=createOriginalMissEffect(position,normal,true);
    const pistol=createOriginalMissEffect(position,normal,false);
    expect(shotgun.position).toEqual({x:3,y:4+S,z:5});
    expect(shotgun.texture).toBe('decalspas');expect(shotgun.size).toBe(25*S);
    expect(pistol.texture).toBe('decal');expect(pistol.size).toBe(20*S);
    expect(pistol.opacity).toBe(.4);expect(pistol.blend).toBe(40);
    expect(position).toEqual({x:3,y:4,z:5});expect(normal).toEqual({x:0,y:1,z:0});
  });
  it('keeps miss planes through callback 80 and removes on callback 81 before decrement',()=>{
    const state=createOriginalMissEffect(position,{x:1,y:0,z:0},false);
    for(let callback=1;callback<=80;callback++){stepOriginalMissEffect(state);expect(state.alive).toBe(true);}
    expect(state.remainingCallbacks).toBe(0);expect(state.opacity).toBe(.4);
    stepOriginalMissEffect(state);expect(state.alive).toBe(false);expect(state.remainingCallbacks).toBe(-1);
    const removed={...state};stepOriginalMissEffect(state);expect(state).toEqual(removed);
  });
  it('preserves the blood constructor texture transform and raw scroll before removal',()=>{
    const state=createOriginalBloodEffect(position);
    expect(state.size).toBe(100*S);expect(state.opacity).toBe(.5);
    expect(state.textureScale).toEqual({x:3,y:3,z:3});expect(state.texturePosition).toEqual({x:1,y:1,z:0});
    const frames=[];
    for(let callback=1;callback<=3;callback++){
      stepOriginalBloodEffect(state);
      frames.push({alive:state.alive,time:state.remainingCallbacks,uv:{...state.texturePosition}});
    }
    expect(frames).toEqual([
      {alive:true,time:4,uv:{x:0,y:1,z:0}},
      {alive:true,time:0,uv:{x:-1,y:1,z:0}},
      {alive:false,time:-4,uv:{x:-2,y:1,z:0}},
    ]);
    // Deleted actors do not accidentally advance to the source wrap branch.
    stepOriginalBloodEffect(state);expect(state.texturePosition).toEqual({x:-2,y:1,z:0});
  });
  it('freezes all blood callback state when goody is absent',()=>{
    const state=createOriginalBloodEffect(position);
    for(let i=0;i<20;i++)stepOriginalBloodEffect(state,false);
    expect(state).toEqual(createOriginalBloodEffect(position));
    stepOriginalBloodEffect(state,true);expect(state.remainingCallbacks).toBe(4);
  });
  it('takes the blood x=-3 wrap branch before checking the lifetime',()=>{
    const state=createOriginalBloodEffect(position);
    // The normal three-callback lifetime never reaches this branch; preserve
    // the script's transform rule independently of native texture wrapping.
    state.texturePosition.x=-2;
    stepOriginalBloodEffect(state);
    expect(state.texturePosition).toEqual({x:0,y:2,z:0});expect(state.remainingCallbacks).toBe(4);
  });
  it('creates RPG puffs ten source units up with the distinct initial tiny half-opacity state',()=>{
    const state=createOriginalRpgPuffEffect(position,()=>0);
    expect(state.position).toEqual({x:3,y:4+10*S,z:5});
    expect(state.scale).toBe(.01);expect(state.size).toBe(.5*S);
    expect(state.opacity).toBe(.5);expect(state.myscale).toBe(0);expect(state.rollDegrees).toBe(10);
  });
  it('maps all 36 source random outcomes to 10-degree rolls including 360',()=>{
    const rolls=Array.from({length:36},(_,index)=>createOriginalRpgPuffEffect(position,()=>index/36).rollDegrees);
    expect(rolls).toEqual(Array.from({length:36},(_,index)=>(index+1)*10));
    expect(createOriginalRpgPuffEffect(position,()=>1-Number.EPSILON).rollDegrees).toBe(360);
  });
  it.each([-1,1,NaN,Infinity])('rejects an invalid RNG adapter sample %s',sample=>{
    expect(()=>createOriginalRpgPuffEffect(position,()=>sample)).toThrow('Invalid original puff random sample');
  });
  it('grows and fades on callbacks, survives 180, and removes above 180 after updating',()=>{
    const state=createOriginalRpgPuffEffect(position,()=>.5);
    stepOriginalRpgPuffEffect(state);
    expect(state.myscale).toBe(6);expect(state.size).toBeCloseTo(6*S,12);
    expect(state.blend).toBeCloseTo(96.7,12);expect(state.opacity).toBeCloseTo(.967,12);
    for(let callback=2;callback<=30;callback++)stepOriginalRpgPuffEffect(state);
    expect(state.alive).toBe(true);expect(state.myscale).toBe(180);
    expect(state.size).toBeCloseTo(180*S,12);expect(state.blend).toBeCloseTo(1,12);
    stepOriginalRpgPuffEffect(state);
    expect(state.alive).toBe(false);expect(state.myscale).toBe(186);
    expect(state.size).toBeCloseTo(186*S,12);expect(state.blend).toBeCloseTo(-2.3,12);
    const removed={...state};stepOriginalRpgPuffEffect(state);expect(state).toEqual(removed);
  });
});
