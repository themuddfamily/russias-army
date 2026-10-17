import {describe,it,expect} from 'vitest';
import {getOriginalHitscan,originalBulletExcludesModel,originalHitscanYawRecoil,ORIGINAL_HITSCAN_RANGE} from './originalHitscan';
describe('preserved edition numerical hitscan rules',()=>{
 it.each(['barrack','woodlands'] as const)('%s keeps exact damage, same-ray shotgun count, callback cadence and camera recoil',map=>{
  for(const [weapon,damage,rays,wait,pitch] of [['pistol',12,1,8,1],['shotgun',18,2,15,7],['rifle',6,1,2,1],['sniper',36,1,50,3]] as const){
   expect(getOriginalHitscan(map,weapon)).toEqual({damage:damage*rays,rayDamage:damage,rays,intervalSeconds:(wait+(map==='barrack'?1:0))/30,pitchRecoilRadians:pitch*Math.PI/180,range:ORIGINAL_HITSCAN_RANGE});
  }
 });
 it('does not replace Winter, unspecified maps or explosive weapons',()=>{
  for(const map of [undefined,'winter','authored'])expect(getOriginalHitscan(map,'rifle')).toBeUndefined();
  for(const weapon of ['launcher','rpg','grenade','constructor'])expect(getOriginalHitscan('barrack',weapon)).toBeUndefined();
 });
 it('uses three discrete yaw values and rejects invalid random inputs',()=>{
  expect([0,1/3,2/3,.999].map(originalHitscanYawRecoil)).toEqual([-.5*Math.PI/180,0,.5*Math.PI/180,.5*Math.PI/180]);
  for(const bad of [-.01,1,Infinity,NaN])expect(()=>originalHitscanYawRecoil(bad)).toThrow();
 });
});
describe('recovered bullet-query group roots',()=>{
 it.each(['syccamore','spindlybirchleaves','rowanbranch','othertrees','birch','outerfencing'])('matches the exact Woodland root %s case-insensitively',name=>{
  expect(originalBulletExcludesModel('woodlands',name)).toBe(true);
  expect(originalBulletExcludesModel('woodlands',name.toUpperCase())).toBe(true);
  expect(originalBulletExcludesModel('barrack',name)).toBe(name==='outerfencing');
  expect(originalBulletExcludesModel('barrack',name.toUpperCase())).toBe(name==='outerfencing');
 });
 it('does not infer exclusion from similar model names or generic tree words',()=>{
  for(const map of ['barrack','woodlands'])for(const name of ['','tree','trees','sycamore','syccamore2','spindlybirch','rowanbranch.001','othertrees_extra','silver birch','outerfencing2','outerfencing/child',' Outerfencing','outerfencing ']){
   expect(originalBulletExcludesModel(map,name)).toBe(false);
  }
 });
 it('leaves Winter, unknown and unspecified maps unchanged',()=>{
  for(const map of [undefined,'winter','authored','woodland','WOODLANDS','constructor'])for(const name of ['syccamore','spindlybirchleaves','rowanbranch','othertrees','birch','outerfencing']){
   expect(originalBulletExcludesModel(map,name)).toBe(false);
  }
 });
});
