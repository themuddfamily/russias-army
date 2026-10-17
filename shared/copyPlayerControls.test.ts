import {describe,it,expect} from 'vitest';
import {applyOriginalPlayerMovementControls,isCopyMovementMode} from './copyPlayerControls';
import {applyOriginalPlayerControls,type OriginalPlayerBody,type OriginalPlayerControls,ORIGINAL_PLAYER_HORIZONTAL_DRAG} from './originalPlayerPhysics';
const body=(supported=true):OriginalPlayerBody=>({id:'player',position:{x:0,y:1,z:0},velocity:{x:2,y:3,z:-4},supported});
const input:OriginalPlayerControls={forward:true,right:true,jump:true,yaw:.4,pitch:.3};
describe('optional copy movement around recovered source controls',()=>{
 it.each(['source','modern-walk',undefined] as const)('preserves recovered controls for %s',mode=>{
  const actual=body(),source=body();
  expect(applyOriginalPlayerMovementControls(actual,input,mode)).toEqual(applyOriginalPlayerControls(source,input));
  expect(actual).toEqual(source);
 });
 it.each([['modern-sprint',7.2/4.55],['modern-aim',2.6/4.55]] as const)('scales only the horizontal input impulse for %s', (mode,scale)=>{
  const actual=body(),source=body(),initial={...actual.velocity};
  const control=applyOriginalPlayerMovementControls(actual,input,mode),recovered=applyOriginalPlayerControls(source,input);
  expect(control).toEqual(recovered);
  for(const axis of ['x','z'] as const){
   const existing=initial[axis]*ORIGINAL_PLAYER_HORIZONTAL_DRAG;
   expect(actual.velocity[axis]-existing).toBeCloseTo((source.velocity[axis]-existing)*scale,12);
  }
  expect(actual.velocity.y).toBe(source.velocity.y);expect(actual.supported).toBe(source.supported);
 });
 it.each(['modern-sprint','modern-aim'] as const)('retains airborne and typing behavior for %s',mode=>{
  for(const [supported,typing] of [[false,false],[true,true]] as const){
   const actual=body(supported),source=body(supported),controls={...input,typing};
   expect(applyOriginalPlayerMovementControls(actual,controls,mode)).toEqual(applyOriginalPlayerControls(source,controls));expect(actual).toEqual(source);
  }
 });
 it('bounds movement modes to the four published values',()=>{
  for(const mode of ['source','modern-walk','modern-sprint','modern-aim'])expect(isCopyMovementMode(mode)).toBe(true);
  for(const mode of ['',null,undefined,7,'sprint',{},'modern-fly'])expect(isCopyMovementMode(mode)).toBe(false);
 });
});
