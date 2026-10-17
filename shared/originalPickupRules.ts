import type {Vec3,WeaponId} from './protocol';

/** Preserved Barrack 2011 / Woodland 2015 pickups and MUS dead handlers.
 * Source invocation rules, independent of frame scheduling and transport.
 */
export const ORIGINAL_KILL_SCORE=30;
export const ORIGINAL_PICKUP_SCORE=5;
export const ORIGINAL_PICKUP_SOURCE_DISTANCE=50;
export const ORIGINAL_DROP_AMMO:Readonly<Record<WeaponId,number>>={pistol:20,shotgun:12,rifle:50,launcher:12,rpg:12,sniper:5};

/** Source reload permits full/over-target chambers and loaded/no-reserve guns.
 * In particular a positive reserve refunds an over-target chamber difference.
 * Empty chamber plus empty reserve requires the source's separate weapon scan.
 */
export function originalReloadTransfer(ammo:number,reserve:number,target:number):{ammo:number;reserve:number;canReload:boolean}{
 if(![ammo,reserve,target].every(Number.isSafeInteger)||ammo<0||reserve<0||target<1)throw new Error('Invalid original reload counts');
 if(ammo===0&&reserve===0)return {ammo,reserve,canReload:false};
 const moved=reserve>0?Math.min(target-ammo,reserve):0;
 return {ammo:ammo+moved,reserve:reserve-moved,canReload:true};
}

/** The source uses local camera position, not feet or an XZ pickup cylinder. */
export function originalPickupInReach(eye:Vec3,position:Vec3,scale:number):boolean{
 return Number.isFinite(scale)&&scale>0&&Math.hypot(eye.x-position.x,eye.y-position.y,eye.z-position.z)<ORIGINAL_PICKUP_SOURCE_DISTANCE*scale;
}

/** Both preserved baddy assets declare this GI resource sphere radius. Source
 * baddies.new applies .045 uniform model scale, then boundingSphere[2]*.75;
 * die places the gun at transmitted eye - bsp/2. Director's runtime model
 * bound (including children/skinning) is not proved equal to the resource
 * sphere. This explicit declared-resource adapter preserves the source formula
 * without silently substituting a rest-mesh radius or ground-snapped drop.
 * Evidence: w3d-metadata/{barrack,woodland}-baddy.json:182-186 and baddies.ls:18-20,118-120.
 */
export const ORIGINAL_GI_DECLARED_SPHERE_RADIUS=1726.8026123046875;
export const ORIGINAL_DROP_SOURCE_EYE_OFFSET=ORIGINAL_GI_DECLARED_SPHERE_RADIUS*.045*.75/2;
export function originalDropPosition(eye:Vec3,scale:number):Vec3{
 if(![eye.x,eye.y,eye.z,scale].every(Number.isFinite)||scale<=0)throw new Error('Invalid original drop position');
 return {...eye,y:eye.y-ORIGINAL_DROP_SOURCE_EYE_OFFSET*scale};
}
/** Director random(36) yields integers 1..36; source rotation is ten degrees each. */
export function originalDropYaw(randomFraction:number):number{
 if(!Number.isFinite(randomFraction)||randomFraction<0||randomFraction>=1)throw new Error('Invalid original drop rotation sample');
 return (Math.floor(randomFraction*36)+1)*10*Math.PI/180;
}

/** Source numeric slot order, independent of object/property insertion order. */
export const ORIGINAL_WEAPON_SLOT_ORDER:readonly WeaponId[]=['pistol','shotgun','rifle','launcher','rpg','sniper'];
export function originalWeaponAvailable(ammo:Readonly<Record<WeaponId,number>>,reserve:Readonly<Record<WeaponId,number>>,id:WeaponId):boolean{return ammo[id]>0||reserve[id]>0;}
export function originalFirstUsableWeapon(ammo:Readonly<Record<WeaponId,number>>,reserve:Readonly<Record<WeaponId,number>>):WeaponId|undefined{return ORIGINAL_WEAPON_SLOT_ORDER.find(id=>originalWeaponAvailable(ammo,reserve,id));}
