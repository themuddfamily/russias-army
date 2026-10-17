import {describe,expect,it} from 'vitest';
import {playerIntersectsLegacyRampSolid,raycastLegacyMap} from './legacyCollision';
import {getLegacyMap,legacyRampHeightAt} from './legacyMaps';

describe('filled Barrack access ramps',()=>{
  for(const ramp of getLegacyMap('barrack').ramps.filter(r=>r.start!==r.end)){
    it(`supports walking on ${ramp.id} while rejecting its solid interior`,()=>{
      for(const fraction of [.1,.5,.9]){
        const x=ramp.x+(ramp.axis==='x'?(fraction-.5)*ramp.length:0);
        const z=ramp.z+(ramp.axis==='z'?(fraction-.5)*ramp.length:0);
        const y=legacyRampHeightAt(ramp,x,z)!;
        expect(playerIntersectsLegacyRampSolid('barrack',{x,y,z},.38,1.82)).toBe(false);
        expect(playerIntersectsLegacyRampSolid('barrack',{x,y:0,z},.38,1.82)).toBe(true);
        expect(raycastLegacyMap('barrack',{x,y:y+1,z},{x:0,y:-1,z:0},1.5,{includeGround:false})?.point.y).toBeCloseTo(y);
        expect(raycastLegacyMap('barrack',{x,y,z},{x:0,y:1,z:0},.5,{includeGround:false})).toBeNull();
      }
    });
    it(`blocks bullets at the vertical side of ${ramp.id}`,()=>{
      const axis=ramp.axis==='x'?'z':'x';
      const origin={x:ramp.x,y:1,z:ramp.z};origin[axis]+=ramp.width/2+1;
      const direction={x:0,y:0,z:0};direction[axis]=-1;
      const hit=raycastLegacyMap('barrack',origin,direction,1.5,{includeGround:false});
      expect(hit?.id).toBe(ramp.id);expect(hit?.distance).toBeCloseTo(1);
      expect(hit?.normal[axis]).toBe(1);
      const feet={x:ramp.x,y:0,z:ramp.z};feet[axis]+=ramp.width/2+.2;
      expect(playerIntersectsLegacyRampSolid('barrack',feet,.38,1.82)).toBe(true);
      feet[axis]+=.2;
      expect(playerIntersectsLegacyRampSolid('barrack',feet,.38,1.82)).toBe(false);
      origin.y=4;
      expect(raycastLegacyMap('barrack',origin,direction,1.5,{includeGround:false})).toBeNull();
    });
  }
  it('hits the closed bottom and keeps the sloped normal on downward hits',()=>{
    const underside=raycastLegacyMap('barrack',{x:-19,y:-1,z:10},{x:0,y:1,z:0},2,{includeGround:false});
    expect(underside?.id).toBe('west-rise');expect(underside?.distance).toBeCloseTo(1);expect(underside?.normal.y).toBe(-1);
    const top=raycastLegacyMap('barrack',{x:-19,y:4,z:10},{x:0,y:-1,z:0},2,{includeGround:false});
    expect(top?.normal.y).toBeGreaterThan(.97);expect(top?.normal.z).toBeGreaterThan(0);
    expect(raycastLegacyMap('barrack',{x:-19,y:2.62,z:10},{x:0,y:-1,z:0},1,{includeGround:false})?.distance).toBe(0);
  });
  it('keeps level bridges open beneath them',()=>{
    expect(playerIntersectsLegacyRampSolid('barrack',{x:-1.5,y:0,z:-10},.38,1.82)).toBe(false);
    expect(raycastLegacyMap('barrack',{x:-1.5,y:1,z:-12},{x:0,y:0,z:1},4,{includeGround:false})).toBeNull();
  });
});
