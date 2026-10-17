import * as THREE from 'three';
import type {WeaponId} from './weapons';
import {createOriginalWeaponMotion,advanceOriginalWeaponMotion,ORIGINAL_WEAPON_LOAD_POSITION,ORIGINAL_WEAPON_POSES} from '../shared/originalWeaponMotion';
export {ORIGINAL_WEAPON_LOAD_POSITION,ORIGINAL_WEAPON_POSES} from '../shared/originalWeaponMotion';

/** Source player eye height85 converts to the copy's1.72; scale translations and geometry alike. */
export const ORIGINAL_WEAPON_UNIT_SCALE=1.72/85;
export const ORIGINAL_WEAPON_FOV=50;
export const ORIGINAL_WEAPON_ROTATION=new THREE.Euler(-Math.PI/2,-Math.PI/2,0,'ZYX');


/** Adobe Using Director 11.5 printed p374 confirms source fieldOfView is vertical. */
export function originalWeaponVerticalFov(aspect:number,axis:'vertical'|'horizontal'='vertical',sourceFov=ORIGINAL_WEAPON_FOV):number {
  return axis==='vertical'?sourceFov:THREE.MathUtils.radToDeg(2*Math.atan(Math.tan(THREE.MathUtils.degToRad(sourceFov)/2)/aspect));
}

/** Whole rigid-gun state, with nominal30 Hz adaptation of original stepFrame. */
export class OriginalWeaponPresentation {
  weapon:WeaponId;
  readonly sourcePosition=new THREE.Vector3();
  ticker=1;
  constructor(weapon:WeaponId='rifle'){this.weapon=weapon;this.sourcePosition.fromArray(ORIGINAL_WEAPON_LOAD_POSITION);}
  equip(weapon:WeaponId):void {this.weapon=weapon;this.reload();}
  reload():void {this.sourcePosition.fromArray(ORIGINAL_WEAPON_LOAD_POSITION);}
  fire():void {this.sourcePosition.fromArray(ORIGINAL_WEAPON_POSES[this.weapon].recoil);}
  reset(weapon:WeaponId=this.weapon):void {this.weapon=weapon;this.ticker=1;this.reload();}
  /** VOID still advances ticker, while preserving the last chosen model and
   * source position. This does not assign a displayed model position. */
  advanceTicker(deltaSeconds:number,copySpeed:number):void {
    const result=advanceOriginalWeaponMotion(createOriginalWeaponMotion({weapon:null,ticker:this.ticker,
      gunPositionSource:{x:this.sourcePosition.x,y:this.sourcePosition.y,z:this.sourcePosition.z}}),
      {frames:Math.max(0,deltaSeconds)*30,sourceSpeed:Math.max(0,copySpeed)/ORIGINAL_WEAPON_UNIT_SCALE});
    this.ticker=result.state.ticker;
  }
  /** Copy velocity is converted back to source units before source bob arithmetic. */
  update(deltaSeconds:number,copySpeed:number,target=new THREE.Vector3()):THREE.Vector3 {
    const result=advanceOriginalWeaponMotion(createOriginalWeaponMotion({weapon:this.weapon,ticker:this.ticker,
      gunPositionSource:{x:this.sourcePosition.x,y:this.sourcePosition.y,z:this.sourcePosition.z}}),
      {frames:Math.max(0,deltaSeconds)*30,sourceSpeed:Math.max(0,copySpeed)/ORIGINAL_WEAPON_UNIT_SCALE});
    this.ticker=result.state.ticker;
    const source=result.state.gunPositionSource,display=result.positionSource!;
    this.sourcePosition.set(source.x,source.y,source.z);
    return target.set(display.x,display.y,display.z).multiplyScalar(ORIGINAL_WEAPON_UNIT_SCALE);
  }
}
