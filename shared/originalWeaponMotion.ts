import type {Vec3,WeaponId} from './protocol';

type Tuple=readonly [number,number,number];
export const ORIGINAL_WEAPON_LOAD_POSITION:Tuple=Object.freeze([-12,-20,5]);
export const ORIGINAL_WEAPON_POSES:Readonly<Record<WeaponId,Readonly<{rest:Tuple;recoil:Tuple}>>>=Object.freeze({
 rifle:Object.freeze({rest:Object.freeze([3,-10,2]) as Tuple,recoil:Object.freeze([3,-10,7]) as Tuple}),
 shotgun:Object.freeze({rest:Object.freeze([3,-10,-4]) as Tuple,recoil:Object.freeze([3,-10,5]) as Tuple}),
 rpg:Object.freeze({rest:Object.freeze([5,-13,-20]) as Tuple,recoil:Object.freeze([5,-13,15]) as Tuple}),
 launcher:Object.freeze({rest:Object.freeze([6,-8,-10]) as Tuple,recoil:Object.freeze([6,-8,10]) as Tuple}),
 pistol:Object.freeze({rest:Object.freeze([5,-9,-10]) as Tuple,recoil:Object.freeze([5,-10,-2]) as Tuple}),
 sniper:Object.freeze({rest:Object.freeze([6,-12,-12]) as Tuple,recoil:Object.freeze([6,-12,9]) as Tuple}),
});
export interface OriginalWeaponMotionState {readonly weapon:WeaponId|null;readonly ticker:number;readonly gunPositionSource:Readonly<Vec3>}
export interface OriginalWeaponMotionAdvance {readonly state:OriginalWeaponMotionState;readonly positionSource:Readonly<Vec3>|null}
const point=(p:Readonly<Vec3>)=>Object.freeze({x:p.x,y:p.y,z:p.z});
const fromTuple=(p:Tuple)=>({x:p[0],y:p[1],z:p[2]});
function validateWeapon(weapon:WeaponId|null):void {if(weapon!==null&&(typeof weapon!=='string'||!Object.prototype.hasOwnProperty.call(ORIGINAL_WEAPON_POSES,weapon)))throw Error('Invalid source weapon motion weapon');}
/** Seed position/ticker are explicit. Source new does not establish gunpos;
 * private receivers must not inherit a renderer's load-position default. */
export function createOriginalWeaponMotion(seed:OriginalWeaponMotionState):OriginalWeaponMotionState {
 if(!seed||!seed.gunPositionSource||![seed.ticker,seed.gunPositionSource.x,seed.gunPositionSource.y,seed.gunPositionSource.z].every(Number.isFinite))throw Error('Invalid source weapon motion seed');
 validateWeapon(seed.weapon);return Object.freeze({weapon:seed.weapon,ticker:seed.ticker,gunPositionSource:point(seed.gunPositionSource)});
}
export function selectOriginalWeaponMotion(state:OriginalWeaponMotionState,weapon:WeaponId|null):OriginalWeaponMotionState {validateWeapon(weapon);const current=createOriginalWeaponMotion(state);return createOriginalWeaponMotion({weapon,ticker:current.ticker,gunPositionSource:current.gunPositionSource});}
export function assignOriginalWeaponMotion(state:OriginalWeaponMotionState,positionSource:Readonly<Vec3>):OriginalWeaponMotionState {const current=createOriginalWeaponMotion(state);return createOriginalWeaponMotion({weapon:current.weapon,ticker:current.ticker,gunPositionSource:positionSource});}
export function loadOriginalWeaponMotion(state:OriginalWeaponMotionState):OriginalWeaponMotionState {return assignOriginalWeaponMotion(state,fromTuple(ORIGINAL_WEAPON_LOAD_POSITION));}
export function equipOriginalWeaponMotion(state:OriginalWeaponMotionState,weapon:WeaponId):OriginalWeaponMotionState {return loadOriginalWeaponMotion(selectOriginalWeaponMotion(state,weapon));}
export function fireOriginalWeaponMotion(state:OriginalWeaponMotionState):OriginalWeaponMotionState {
 const current=createOriginalWeaponMotion(state);if(current.weapon===null)throw Error('Cannot fire VOID source weapon motion');
 return assignOriginalWeaponMotion(current,fromTuple(ORIGINAL_WEAPON_POSES[current.weapon].recoil));
}
/** frames=1 is the source callback recurrence. Fractional frames preserve the
 * existing renderer adapter; this function applies no source/world conversion. */
export function advanceOriginalWeaponMotion(state:OriginalWeaponMotionState,input:{readonly frames:number;readonly sourceSpeed:number}):OriginalWeaponMotionAdvance {
 const current=createOriginalWeaponMotion(state);
 if(!input||![input.frames,input.sourceSpeed].every(Number.isFinite)||input.frames<0||input.sourceSpeed<0)throw Error('Invalid source weapon motion advance');
 const ticker=current.ticker+input.sourceSpeed*.05*input.frames;
 if(!Number.isFinite(ticker))throw Error('Source weapon motion ticker overflow');
 if(current.weapon===null)return Object.freeze({state:createOriginalWeaponMotion({...current,ticker}),positionSource:null});
 // Both recovered scripts multiply by literal 0.1 for a source callback.
 // Deriving it as 1-0.9 changes binary rounding; fractional renderer advances
 // retain their elapsed-frame adapter.
 const alpha=input.frames===1 ? .1 : 1-Math.pow(.9,input.frames),rest=ORIGINAL_WEAPON_POSES[current.weapon].rest,p=current.gunPositionSource;
 const gunPositionSource={x:p.x+(rest[0]-p.x)*alpha,y:p.y+(rest[1]-p.y)*alpha,z:p.z+(rest[2]-p.z)*alpha};
 const next=createOriginalWeaponMotion({weapon:current.weapon,ticker,gunPositionSource}),sine=Math.sin(ticker*Math.PI/180);
 const positionSource={x:gunPositionSource.x-sine*input.sourceSpeed*.003,y:gunPositionSource.y-Math.abs(sine*input.sourceSpeed*.002),z:gunPositionSource.z};
 if(!Object.values(positionSource).every(Number.isFinite))throw Error('Source weapon motion position overflow');
 return Object.freeze({state:next,positionSource:point(positionSource)});
}
