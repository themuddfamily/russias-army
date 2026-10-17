import type {Vec3,WeaponId} from './protocol';

export interface OriginalSoloBotShotCaptureInput {
 readonly ownerId:string;readonly ownerLife:number;readonly sequence:number;readonly capturedAt:number;
 readonly weapon:WeaponId;readonly targetId:string;readonly targetLife:number;
 readonly sourceShotOrigin:Readonly<Vec3>;readonly aimDirection:Readonly<Vec3>;
 readonly targetDistance:number;readonly authoredDamage:number;readonly chanceRoll:number;
}
export interface OriginalSoloBotShotCapture extends OriginalSoloBotShotCaptureInput {
 readonly chance:number;
}
export interface OriginalSoloBotShotCaptureOptions {readonly maxTextChars:number}
const issued=new WeakSet<object>();
const weapons:readonly WeaponId[]=['pistol','shotgun','rifle','launcher','rpg','sniper'];
/** Installed authored Solo direction-to-RPG basis policy; not native inverse
 * orientation recovery. Preserve the existing principal pitch/yaw branches. */
export function sourceRotationForSoloDirection(direction:Readonly<Vec3>):Vec3 {
 if(![direction.x,direction.y,direction.z].every(Number.isFinite))throw Error('Invalid solo launch direction');
 const length=Math.hypot(direction.x,direction.y,direction.z);
 if(!Number.isFinite(length)||length===0)throw Error('Invalid solo launch direction');
 return {x:Math.asin(Math.max(-1,Math.min(1,direction.y/length)))*180/Math.PI,y:0,z:Math.atan2(-direction.x,-direction.z)*180/Math.PI};
}
export function isOriginalSoloBotShotCapture(value:unknown):value is OriginalSoloBotShotCapture {
 return typeof value==='object'&&value!==null&&issued.has(value);
}
function vector(raw:Readonly<Vec3>):Readonly<Vec3> {
 if(!raw)throw Error('Invalid authored bot shot vector');
 const x=raw.x,y=raw.y,z=raw.z;
 if(![x,y,z].every(Number.isFinite))throw Error('Invalid authored bot shot vector');
 return Object.freeze({x,y,z});
}
/** Capture the authored AI's already drawn shot operands. No readiness, ammo,
 * query, damage admission, random sampling or rendering happens here.
 * Coincident aim preserves the exact zero emitted by THREE.normalize; every
 * other direction must already be unit length. Explosives retain the chance
 * draw as an observation even though their constructor ignores that gate. */
export function captureOriginalSoloBotShot(input:OriginalSoloBotShotCaptureInput,options:OriginalSoloBotShotCaptureOptions):OriginalSoloBotShotCapture {
 const maxTextChars=options?.maxTextChars;
 if(!Number.isSafeInteger(maxTextChars)||maxTextChars<1||maxTextChars>65536)throw Error('Invalid authored bot shot text bound');
 if(!input)throw Error('Missing authored bot shot input');
 const ownerId=input.ownerId,ownerLife=input.ownerLife,sequence=input.sequence,capturedAt=input.capturedAt,weapon=input.weapon,targetId=input.targetId,targetLife=input.targetLife;
 const targetDistance=input.targetDistance,authoredDamage=input.authoredDamage,chanceRoll=input.chanceRoll;
 if(typeof ownerId!=='string'||!ownerId||ownerId.trim()!==ownerId||typeof targetId!=='string'||!targetId||targetId.trim()!==targetId||!weapons.includes(weapon))throw Error('Invalid authored bot shot identity/weapon');
 const text=ownerId.length+targetId.length+weapon.length;
 if(!Number.isSafeInteger(text)||text>maxTextChars)throw Error('Authored bot shot text budget exceeded');
 if(![ownerLife,targetLife,sequence].every(n=>Number.isSafeInteger(n)&&n>0)||!Number.isFinite(capturedAt)||capturedAt<0||!Number.isFinite(targetDistance)||targetDistance<0||!Number.isFinite(authoredDamage)||authoredDamage<=0||!Number.isFinite(chanceRoll)||chanceRoll<0||chanceRoll>=1)throw Error('Invalid authored bot shot scalar');
 const rawOrigin=input.sourceShotOrigin,rawDirection=input.aimDirection;
 const sourceShotOrigin=vector(rawOrigin),aimDirection=vector(rawDirection),length=Math.hypot(aimDirection.x,aimDirection.y,aimDirection.z);
 if(!Number.isFinite(length)||(length===0?targetDistance!==0:Math.abs(length-1)>1e-8))throw Error('Invalid authored bot shot unit direction');
 const chance=Math.max(.24,Math.min(.8,.86-targetDistance*.014));
 const capture=Object.freeze({ownerId,ownerLife,sequence,capturedAt,weapon,targetId,targetLife,sourceShotOrigin,aimDirection,targetDistance,authoredDamage,chanceRoll,chance});
 issued.add(capture);return capture;
}
