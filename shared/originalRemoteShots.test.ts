import {describe,expect,it} from 'vitest';
import {createOriginalRemoteShots,isOriginalRemoteShotReport,MAX_ORIGINAL_REMOTE_SHOTS,receiveOriginalRemoteShots,stepOriginalRemoteShots} from './originalRemoteShots';

describe('recovered scalar remote misses and aiming',()=>{
 it('starts with independent scalar state and an explicit transport cap',()=>{
  const a=createOriginalRemoteShots(),b=createOriginalRemoteShots();
  expect(a).toEqual({misses:0,aiming:0});expect(MAX_ORIGINAL_REMOTE_SHOTS).toBe(128);
  receiveOriginalRemoteShots(a,3);expect(b).toEqual({misses:0,aiming:0});
 });
 it('validates absent and bounded integer reports without coercion',()=>{
  for(const value of [undefined,0,-0,1,128])expect(isOriginalRemoteShotReport(value)).toBe(true);
  for(const value of [null,false,true,'1',{},[],NaN,Infinity,-Infinity,-1,.5,129,Number.MAX_SAFE_INTEGER+1])expect(isOriginalRemoteShotReport(value)).toBe(false);
 });
 it('replaces positive misses while zero and absence preserve signed state and aiming',()=>{
  const state={misses:7,aiming:2};receiveOriginalRemoteShots(state,3);expect(state).toEqual({misses:3,aiming:2});
  receiveOriginalRemoteShots(state,0);receiveOriginalRemoteShots(state,undefined);expect(state).toEqual({misses:3,aiming:2});
  state.misses=-1;receiveOriginalRemoteShots(state,0);expect(state).toEqual({misses:-1,aiming:2});
  receiveOriginalRemoteShots(state,128);expect(state).toEqual({misses:128,aiming:2});
 });
 it('rejects malformed reports before mutating either scalar',()=>{
  const state={misses:3,aiming:8};
  for(const bad of [-1,.5,129,Infinity,NaN]){
   expect(()=>receiveOriginalRemoteShots(state,bad)).toThrow(RangeError);expect(state).toEqual({misses:3,aiming:8});
  }
 });
 it.each([['pistol',8],['shotgun',15],['rifle',2],['sniper',2]] as const)('%s keeps the source cooldown and zero-reaching callback', (weapon,wait)=>{
  const state={misses:4,aiming:0};expect(stepOriginalRemoteShots(state,weapon)).toBe(true);
  expect(state).toEqual({misses:weapon==='shotgun'?2:3,aiming:wait});
  const misses=state.misses;
  for(let left=wait-1;left>=0;left--){expect(stepOriginalRemoteShots(state,weapon)).toBe(false);expect(state).toEqual({misses,aiming:left});}
  expect(stepOriginalRemoteShots(state,weapon)).toBe(true);
 });
 it('preserves the odd SPAS negative remainder instead of clamping it',()=>{
  const state={misses:1,aiming:0};expect(stepOriginalRemoteShots(state,'shotgun')).toBe(true);
  expect(state).toEqual({misses:-1,aiming:15});
  for(let i=0;i<16;i++)expect(stepOriginalRemoteShots(state,'shotgun')).toBe(false);
  expect(state).toEqual({misses:-1,aiming:0});
 });
 it.each(['launcher','rpg'] as const)('%s consumes the common shoot prefix without a bullet cooldown',weapon=>{
  const state={misses:2,aiming:0};expect(stepOriginalRemoteShots(state,weapon)).toBe(true);expect(state).toEqual({misses:1,aiming:0});
  expect(stepOriginalRemoteShots(state,weapon)).toBe(true);expect(state).toEqual({misses:0,aiming:0});
  expect(stepOriginalRemoteShots(state,weapon)).toBe(false);
 });
 it('uses the current publication weapon after replacement, preserving the old cooldown',()=>{
  const state={misses:4,aiming:0};expect(stepOriginalRemoteShots(state,'pistol')).toBe(true);
  receiveOriginalRemoteShots(state,1);
  for(let i=0;i<8;i++)expect(stepOriginalRemoteShots(state,'shotgun')).toBe(false);
  expect(stepOriginalRemoteShots(state,'shotgun')).toBe(true);expect(state).toEqual({misses:-1,aiming:15});
 });
 it('does not fire empty or negative misses',()=>{
  for(const misses of [0,-1]){const state={misses,aiming:0};expect(stepOriginalRemoteShots(state,'rifle')).toBe(false);expect(state).toEqual({misses,aiming:0});}
 });
});
