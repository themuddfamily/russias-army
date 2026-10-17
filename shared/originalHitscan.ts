/** Numerical rules from preserved Barrack 2011 / Woodland 2015 weaponry.
 * Nominal 30 Hz adapts actor callbacks to elapsed time; it is not a measured
 * Director playback rate. Original rays have no weapon-specific range limit.
 */
export const ORIGINAL_HITSCAN_RANGE=700;
// A finite broad query bound: both decoded scene diagonals are <=619.492,
// plus the authority's 64-unit vertical envelope and origin tolerance.
export interface OriginalHitscan {
 damage:number;rayDamage:number;rays:1|2;intervalSeconds:number;
 pitchRecoilRadians:number;range:number;
}
const RULES:Readonly<Record<string,{damage:number;rays:1|2;wait:number;pitch:number}>>={
 pistol:{damage:12,rays:1,wait:8,pitch:1},
 shotgun:{damage:18,rays:2,wait:15,pitch:7},
 rifle:{damage:6,rays:1,wait:2,pitch:1},
 sniper:{damage:36,rays:1,wait:50,pitch:3},
};
/** Explore reparents these exact model roots into gsmokes, which bullettest
 * removes before querying and restores afterward. Descendant ray exclusion
 * follows our group-removal adapter; native Director query behavior is unproved.
 * This predicate does not change physical-body or explosive-ray membership.
 */
export function originalBulletExcludesModel(map:string|undefined,name:string):boolean {
 const model=name.toLowerCase();
 if(map==='barrack')return model==='outerfencing';
 if(map!=='woodlands')return false;
 return model==='syccamore'||model==='spindlybirchleaves'||model==='rowanbranch'
  ||model==='othertrees'||model==='birch'||model==='outerfencing';
}
export function getOriginalHitscan(map:string|undefined,weapon:string):OriginalHitscan|undefined {
 if(map!=='barrack'&&map!=='woodlands')return undefined;
 const rule=Object.hasOwn(RULES,weapon)?RULES[weapon]:undefined;if(!rule)return undefined;
 return {damage:rule.damage*rule.rays,rayDamage:rule.damage,rays:rule.rays,
  intervalSeconds:(rule.wait+(map==='barrack'?1:0))/30,
  pitchRecoilRadians:rule.pitch*Math.PI/180,range:ORIGINAL_HITSCAN_RANGE};
}
/** Director random(3)-2 yields -1,0,1; camera yaw recoil is half a degree. */
export function originalHitscanYawRecoil(randomFraction:number):number {
 if(!Number.isFinite(randomFraction)||randomFraction<0||randomFraction>=1)throw new Error('Invalid original recoil sample');
 return (Math.floor(randomFraction*3)-1)*.5*Math.PI/180;
}
