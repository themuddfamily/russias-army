import {describe,it,expect} from 'vitest';
import {originalReloadTransfer,originalPickupInReach,ORIGINAL_DROP_AMMO,ORIGINAL_KILL_SCORE,ORIGINAL_PICKUP_SCORE,originalDropPosition,originalDropYaw,ORIGINAL_DROP_SOURCE_EYE_OFFSET} from './originalPickupRules';
describe('preserved pickup and reload rules',()=>{
 it('uses fixed original pickup quantities and point awards',()=>{expect(ORIGINAL_DROP_AMMO).toEqual({pistol:20,shotgun:12,rifle:50,launcher:12,rpg:12,sniper:5});expect(ORIGINAL_KILL_SCORE).toBe(30);expect(ORIGINAL_PICKUP_SCORE).toBe(5);});
 it.each([[12,140,28,28,124],[28,140,28,28,140],[30,12,28,28,14],[8,0,8,8,0],[2,1,8,3,0]])('reloads chamber%s reserve%s toward%s', (ammo,reserve,target,endAmmo,endReserve)=>{
  expect(originalReloadTransfer(ammo,reserve,target)).toEqual({ammo:endAmmo,reserve:endReserve,canReload:true});
 });
 it('does not reload when both stores are empty',()=>expect(originalReloadTransfer(0,0,28)).toEqual({ammo:0,reserve:0,canReload:false}));
 it('uses the declared GI bound adapter without terrain snapping and discrete source rotations',()=>{
  expect(ORIGINAL_DROP_SOURCE_EYE_OFFSET).toBeCloseTo(29.1397940826416,10);
  const scale=1.72/85,eye={x:12,y:10,z:34},drop=originalDropPosition(eye,scale);
  expect(drop).toEqual({x:12,y:10-.5896523037899242,z:34});expect(originalPickupInReach(eye,drop,scale)).toBe(true);
  expect(originalDropYaw(0)).toBeCloseTo(10*Math.PI/180);expect(originalDropYaw(.999)).toBeCloseTo(2*Math.PI);
 });
 it('uses a strict three-dimensional camera distance, including the exact boundary',()=>{
  const eye={x:0,y:85,z:0};expect(originalPickupInReach(eye,{x:0,y:36,z:0},1)).toBe(true);expect(originalPickupInReach(eye,{x:0,y:35,z:0},1)).toBe(false);expect(originalPickupInReach(eye,{x:40,y:55,z:0},1)).toBe(false);
 });
});
