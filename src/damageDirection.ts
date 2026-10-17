/**
 * Screen-space bearing for a world-space damage source.
 * Zero is straight ahead, positive angles point to the player's right.
 */
export function damageIndicatorAngle(deltaX:number,deltaZ:number,playerYaw:number):number {
  const angle=Math.atan2(deltaX,-deltaZ)+playerYaw;
  return Math.atan2(Math.sin(angle),Math.cos(angle));
}
